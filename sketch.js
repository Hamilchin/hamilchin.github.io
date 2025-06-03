// antParser.js - Handles parsing and serializing ant configurations

/**
 * Parse a JSON string into an ant configuration object.
 * Throws if invalid JSON or structure.
 */
function parseAntConfig(json) {
  const obj = JSON.parse(json);
  validateAntConfig(obj);
  return obj;
}

/**
 * Serialize an ant configuration object to a JSON string.
 */
function serializeAntConfig(obj) {
  validateAntConfig(obj);
  return JSON.stringify(obj, null, 2);
}

/**
 * Validate the structure of an ant configuration object. Throws if invalid.
 */
function validateAntConfig(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Config must be an object');
  if (!obj.name || typeof obj.name !== 'string') throw new Error('Config must have a name');
  if (typeof obj.colors !== 'number' || obj.colors < 1) throw new Error('Config must have a positive integer colors');
  if (!Array.isArray(obj.transitions)) throw new Error('Config must have a transitions array');
  const expectedTransitions = obj.states * (obj.colors + 1); // +1 for -1 fallback
  if (obj.transitions.length !== expectedTransitions) throw new Error(`Expected ${expectedTransitions} transitions (states * (colors + 1))`);
  obj.transitions.forEach((t, i) => {
    if (typeof t !== 'object') throw new Error(`Transition ${i} must be an object`);
    if (typeof t.newColor !== 'number' || t.newColor < 0 || t.newColor >= obj.colors) throw new Error(`Transition ${i}: newColor out of range`);
    if (t.turn !== 0 && t.turn !== 1) throw new Error(`Transition ${i}: turn must be 0 (left) or 1 (right)`);
    if (typeof t.nextState !== 'number' || t.nextState < 0 || t.nextState >= obj.states) throw new Error(`Transition ${i}: nextState out of range`);
  });
} 

// antSim.js - Simulation logic for Langton's Ant

// --- Global color palette ---
const COLOR_PALETTE = [
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'purple', 'orange', 'cyan', 'magenta', 'gray'
];

class AntSim {
  constructor(config, width, height, gridSize = 10) {
    this.gridSize = gridSize;
    this.width = width;
    this.height = height;
    this.palette = COLOR_PALETTE;
    this.setConfig(config);
    this.ants = [];
  }

  setConfig(config) {
    this.config = config;
    this.rows = Math.floor(this.height / this.gridSize);
    this.cols = Math.floor(this.width / this.gridSize);
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    this.ants = [];
  }

  addAnt(x, y, config = null) {
    // Use current config if not specified
    this.ants.push(new Ant(x, y, config || this.config));
  }

  step() {
    for (const ant of this.ants) {
      ant.move(this.grid, this.rows, this.cols);
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const oldGrid = this.grid;
    const oldRows = this.rows;
    const oldCols = this.cols;
    this.rows = Math.floor(this.height / this.gridSize);
    this.cols = Math.floor(this.width / this.gridSize);
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    for (let y = 0; y < Math.min(oldRows, this.rows); y++) {
      for (let x = 0; x < Math.min(oldCols, this.cols); x++) {
        this.grid[y][x] = oldGrid[y][x];
      }
    }
    this.ants = this.ants.filter(ant => ant.x < this.cols && ant.y < this.rows);
  }
}

class Ant {
  constructor(x, y, config) {
    this.x = x;
    this.y = y;
    this.direction = 0;
    this.state = 0;
    this.config = config;
  }

  move(grid, rows, cols) {
    const color = grid[this.y][this.x];
    const colorCount = this.config.colors;
    let idx = this.state * colorCount + color;
    let t = this.config.transitions[idx];
    if (t === undefined) {
      // Fallback to color -1 transition
      idx = this.state * colorCount + (colorCount); // -1 is always last
      t = this.config.transitions[idx];
      if (!t) return; // No fallback defined, do nothing
    }
    grid[this.y][this.x] = t.newColor;
    this.direction = (this.direction + (t.turn === 0 ? 3 : 1)) % 4;
    this.state = t.nextState;
    switch (this.direction) {
      case 0: this.y = (this.y - 1 + rows) % rows; break;
      case 1: this.x = (this.x + 1) % cols; break;
      case 2: this.y = (this.y + 1) % rows; break;
      case 3: this.x = (this.x - 1 + cols) % cols; break;
    }
  }
} 

// Remove inline antConfigs, import presets
// Use global presetAnts defined in js/presetAnts.js

// Utility: deep copy for configs
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let sim;
let currentConfigKey = Object.keys(presetAnts)[0];
let paused = false;
let showConfig = false;
let simulationSpeed = 1;
let speedSlider;
let speedValueDiv;
let customConfigTextarea, configSaveButton, configCancelButton;
let uiVisible = false;
let uiMinimized = false;
let toggleButton;
let currentAntConfig = deepCopy(presetAnts[currentConfigKey]);

// Log scale parameters
const SPEED_MIN = 1;      // 1 update/sec
const SPEED_MAX = 100000; // 100,000 updates/sec
const SLIDER_STEPS = 100; // Slider granularity

function sliderToSpeed(sliderValue) {
  // Map slider value [0, SLIDER_STEPS] to log scale [SPEED_MIN, SPEED_MAX]
  const logMin = Math.log10(SPEED_MIN);
  const logMax = Math.log10(SPEED_MAX);
  const logValue = logMin + (logMax - logMin) * (sliderValue / SLIDER_STEPS);
  return Math.round(Math.pow(10, logValue));
}

function speedToSlider(speed) {
  // Map speed to slider value
  const logMin = Math.log10(SPEED_MIN);
  const logMax = Math.log10(SPEED_MAX);
  const logValue = Math.log10(speed);
  return Math.round(((logValue - logMin) / (logMax - logMin)) * SLIDER_STEPS);
}

// --- Steps/sec logic ---
let stepsPerSecond = 1;
let simulationInterval = null;
let stepAccumulator = 0;

function runSimulationSteps() {
  if (!paused) {
    for (let i = 0; i < stepsPerSecond; i++) {
      sim.step();
    }
  }
}

function updateSimulationInterval() {
  if (simulationInterval) clearInterval(simulationInterval);
  const batchInterval = 50; // ms
  simulationInterval = setInterval(() => {
    if (!paused) {
      stepAccumulator += stepsPerSecond * batchInterval / 1000;
      const stepsThisBatch = Math.floor(stepAccumulator);
      for (let i = 0; i < stepsThisBatch; i++) {
        sim.step();
      }
      stepAccumulator -= stepsThisBatch;
    }
  }, batchInterval);
}

function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.style('z-index', '0');
  cnv.position(0, 0, 'fixed');
  background(255);
  sim = new AntSim(presetAnts[currentConfigKey], width, height, 10);
  createUI();
  let canvas = document.querySelector('canvas');
  canvas.style.pointerEvents = 'auto';
  frameRate(60);
  stepAccumulator = 0;
  updateSimulationInterval();
}

function createUI() {
  let controlPanel = createDiv('');
  controlPanel.id('control-panel');
  controlPanel.style('display', 'none'); // Hide by default

  // Toggle (minimize/restore) button, always present
  toggleButton = createButton('-');
  toggleButton.parent('control-panel');
  toggleButton.attribute('title', 'Minimize');
  toggleButton.class('ant-ui-btn');
  toggleButton.mousePressed(() => {
    if (uiMinimized) {
      restoreUI();
    } else {
      minimizeUI();
    }
  });

  // Container for the rest of the controls (row)
  let controlsContainer = createDiv('');
  controlsContainer.id('controls-container');
  controlsContainer.parent('control-panel');
  controlsContainer.style('display', 'flex');
  controlsContainer.style('gap', '8px');
  controlsContainer.style('align-items', 'center');

  let pauseButton = createButton(paused ? "Resume" : "Pause");
  pauseButton.parent(controlsContainer);
  pauseButton.class('ant-ui-btn');
  pauseButton.mousePressed(() => {
    const wasPaused = paused;
    paused = !paused;
    pauseButton.html(paused ? "Resume" : "Pause");
    if (!paused && wasPaused) {
      stepAccumulator = 0;
      updateSimulationInterval();
    }
  });

  let configSelect = createSelect();
  configSelect.parent(controlsContainer);
  configSelect.class('ant-ui-btn');
  for (const key in presetAnts) {
    configSelect.option(presetAnts[key].name, key);
  }
  configSelect.selected(currentConfigKey);
  configSelect.changed(() => {
    currentConfigKey = configSelect.value();
    currentAntConfig = deepCopy(presetAnts[currentConfigKey]);
    if (showConfig && customConfigTextarea) {
      customConfigTextarea.value(serializeAntConfig(currentAntConfig));
    }
  });

  let resetButton = createButton("Reset");
  resetButton.parent(controlsContainer);
  resetButton.class('ant-ui-btn');
  resetButton.mousePressed(() => {
    sim.setConfig(presetAnts[currentConfigKey]);
  });

  let currentButton = createButton("Current Config");
  currentButton.parent(controlsContainer);
  currentButton.class('ant-ui-btn');
  currentButton.mousePressed(() => {
    openConfigPanelWithCurrent();
  });

  // --- Minimalistic speed slider BELOW controls ---
  let speedContainer = createDiv('');
  speedContainer.id('speed-container');
  speedContainer.parent('control-panel');
  speedContainer.style('display', 'flex');
  speedContainer.style('align-items', 'center');
  speedContainer.style('margin-top', '8px');
  speedContainer.style('margin-left', '0');

  speedSlider = createSlider(0, 100, 20); // 0-100 for log scale
  speedSlider.parent(speedContainer);
  speedSlider.style('width', '120px');
  speedSlider.input(() => {
    stepsPerSecond = sliderToSpeed(speedSlider.value());
    sliderSpeedValue = stepsPerSecond;
    speedValueDiv.html(sliderSpeedValue + ' steps/sec');
    stepAccumulator = 0;
    updateSimulationInterval();
  });

  // Steps/sec indicator
  speedValueDiv = createDiv('');
  speedValueDiv.parent(speedContainer);
  speedValueDiv.style('margin-left', '10px');
  speedValueDiv.style('font-size', '13px');
  speedValueDiv.style('color', '#aaa');
  sliderSpeedValue = sliderToSpeed(speedSlider.value());
  speedValueDiv.html(sliderSpeedValue + ' steps/sec');
  stepsPerSecond = sliderSpeedValue; // ensure simulation matches UI on load

  // Hide speed controls if UI is minimized
  speedContainer.style('display', uiMinimized ? 'none' : 'flex');

  createConfigPanel();
}

function createConfigPanel() {
  let configPanel = createDiv('');
  configPanel.id('config-panel');
  configPanel.style('display', 'none');

  let configTitle = createElement('h3', 'Current Ant Configuration');
  configTitle.parent('config-panel');
  configTitle.style('margin-top', '0');

  let configDescription = createElement('p', 'Edit the configuration for the next ant you create:');
  configDescription.parent('config-panel');

  customConfigTextarea = createElement('textarea');
  customConfigTextarea.parent('config-panel');
  customConfigTextarea.attribute('placeholder', 'Enter JSON configuration here...');
  customConfigTextarea.style('width', '100%');
  customConfigTextarea.style('min-width', '400px');
  customConfigTextarea.style('height', '200px');
  customConfigTextarea.style('font-family', 'monospace');
  customConfigTextarea.style('padding', '10px');
  customConfigTextarea.style('margin-bottom', '10px');
  // Value will be set when opening panel

  let formatHelp = createElement('p', 'Format: Each transition defines what happens when an ant in a specific state encounters a specific color.<br>newColor: index in palette<br>turn: 0 for left, 1 for right<br>nextState: which state to transition to');
  formatHelp.parent('config-panel');
  formatHelp.style('font-size', '12px');
  formatHelp.style('opacity', '0.7');

  let buttonContainer = createDiv('');
  buttonContainer.parent('config-panel');
  buttonContainer.style('display', 'flex');
  buttonContainer.style('gap', '10px');
  buttonContainer.style('margin-top', '10px');

  configSaveButton = createButton('Save Configuration');
  configSaveButton.parent(buttonContainer);
  configSaveButton.class('ant-ui-btn');
  configSaveButton.mousePressed((event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    saveCustomConfig();
  });

  configCancelButton = createButton('Cancel');
  configCancelButton.parent(buttonContainer);
  configCancelButton.class('ant-ui-btn');
  configCancelButton.mousePressed((event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    toggleConfigPanel();
  });

  this.configPanelElement = select('#config-panel');
}

function openConfigPanelWithCurrent() {
  showConfig = true;
  let configPanel = select('#config-panel');
  configPanel.style('display', 'block');
  customConfigTextarea.value(serializeAntConfig(currentAntConfig));
}

function toggleConfigPanel() {
  showConfig = false;
  let configPanel = select('#config-panel');
  configPanel.style('display', 'none');
}

function saveCustomConfig() {
  // Do nothing if unchanged
  const currentSerialized = serializeAntConfig(currentAntConfig);
  if (customConfigTextarea.value().trim() === currentSerialized.trim()) {
    return;
  }
  try {
    const configJson = parseAntConfig(customConfigTextarea.value());
    presetAnts.custom = configJson;
    let configSelect = document.querySelector('select');
    let option = document.createElement('option');
    option.value = 'custom';
    option.text = 'custom';
    for (let i = 0; i < configSelect.options.length; i++) {
      if (configSelect.options[i].value === 'custom') {
        configSelect.remove(i);
        break;
      }
    }
    configSelect.add(option);
    configSelect.value = 'custom';
    currentConfigKey = 'custom';
    currentAntConfig = deepCopy(configJson);
    toggleConfigPanel();
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
}

function draw() {
  background(240); // light grey
  drawGrid();
}

function drawGrid() {
  for (let y = 0; y < sim.rows; y++) {
    for (let x = 0; x < sim.cols; x++) {
      const cellColor = sim.grid[y][x];
      if (cellColor === 0) continue;
      const colorName = sim.palette[cellColor] || 'gray';
      switch (colorName) {
        case 'white': continue;
        case 'black': fill(0, 0, 0, 200); break;
        case 'red': fill(255, 0, 0, 200); break;
        case 'green': fill(0, 255, 0, 200); break;
        case 'blue': fill(0, 0, 255, 200); break;
        case 'yellow': fill(255, 255, 0, 200); break;
        case 'purple': fill(128, 0, 128, 200); break;
        case 'orange': fill(255, 165, 0, 200); break;
        case 'cyan': fill(0, 255, 255, 200); break;
        case 'magenta': fill(255, 0, 255, 200); break;
        case 'gray': fill(200, 200, 200, 200); break;
        default: fill(200, 200, 200, 200); break;
      }
      noStroke();
      rect(x * sim.gridSize, y * sim.gridSize, sim.gridSize, sim.gridSize);
    }
  }
  fill(255, 0, 255, 230);
  for (const ant of sim.ants) {
    ellipse(
      ant.x * sim.gridSize + sim.gridSize / 2,
      ant.y * sim.gridSize + sim.gridSize / 2,
      sim.gridSize * 0.8,
      sim.gridSize * 0.8
    );
  }
}

function mousePressed() {
  // Only block ant creation if the click target is a button or input field (button, input, textarea, select)
  const e = window.event;
  if (e) {
    let el = e.target;
    while (el) {
      if (
        el.tagName === 'BUTTON' ||
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT'
      ) return;
      el = el.parentElement;
    }
  }
  if (mouseX >= 0 && mouseX < width && mouseY >= 0 && mouseY < height) {
    const gridX = Math.floor(mouseX / sim.gridSize);
    const gridY = Math.floor(mouseY / sim.gridSize);
    sim.addAnt(gridX, gridY, currentAntConfig);
    if (!uiVisible) showUI();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  sim.resize(windowWidth, windowHeight);
}

function showUI() {
  uiVisible = true;
  uiMinimized = false;
  select('#control-panel').style('display', 'flex');
  select('#controls-container').style('visibility', 'visible');
  toggleButton.html('-');
  select('#config-panel').style('display', showConfig ? 'block' : 'none');
}

function minimizeUI() {
  uiMinimized = true;
  select('#controls-container').style('visibility', 'hidden');
  select('#speed-container').style('display', 'none');
  toggleButton.html('+');
}

function restoreUI() {
  uiMinimized = false;
  select('#controls-container').style('visibility', 'visible');
  select('#speed-container').style('display', 'flex');
  toggleButton.html('-');
} 
