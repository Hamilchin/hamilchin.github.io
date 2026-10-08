// Automata: a playground for cellular automata.
//
// Several kinds of world share one instrument: Life-like rules, elementary
// (one-dimensional) rules, Langton's ants and turmites, Turing machines on a 1D
// tape, and two modes where every click starts a 1D automaton: test mode, with
// random rules, and interesting mode, with rules chosen for being worth watching. Each kind keeps its own document (world, rule, colors and
// undo history). They share the speed, the view and the world's size and edges:
// switching kinds keeps your place and starts the new kind in a clean world.
//
// The simulation runs on the main thread in time-budgeted batches. Each frame
// advances as many steps as the speed asks for, up to a slice of the frame, and
// the renderer draws once. A single ant manages a couple of hundred million steps a second.
//
// A run starts whenever the world is edited or its rule changes; a new rule takes
// over from the world as it stands. Snapshots kept along the run let it step
// backwards, by replaying from the nearest one.
//
// The same instrument lies under the home page (a page whose root element has
// data-site), drawing test-mode automata behind the text. There it keeps its
// settings to itself, and until its toolbar is opened it only takes clicks and
// the scroll wheel, which zooms it.

import { LifeWorld, parseLifeRule, formatLifeRule, sameLifeRule, randomLifeRule, lifeMutations } from './life.js';
import { ElementaryWorld, randomElementaryRule, elementaryMutations } from './elementary.js';
import { AntWorld, parseAntRule, formatAntRule, sameAntRule, randomAntRule, antMutations, isAnt } from './ant.js';
import { LIFE_PRESETS, ELEMENTARY_PRESETS, ANT_PRESETS, TURING_PRESETS } from './presets.js';
import { TuringWorld, parseTuringRule, formatTuringRule, sameTuringRule, randomTuringRule, turingMutations } from './turing.js';
import { paletteById, paletteColors, extendColors, gridColor, customPalettes, setCustomPalettes } from './palettes.js';
import { createRenderer } from './renderer.js';
import { History } from './history.js';
import { encodeState, decodeState, gridCells, gridRecipe } from './share.js';
import { worldThumb } from './thumbs.js';
import { rng, randomSeed, clamp, storage, line, $, prefersReducedMotion } from './util.js';
import { TestWorld, TUNING, testColors } from './test.js';
import { INTERESTING } from './interesting.js';
import { createUI } from './ui.js';
import { mountShell } from './shell.js';

// Steps per second on the speed dial; the last stop runs flat out.
export const SPEEDS = [1, 2, 4, 8, 15, 30, 60, 120, 250, 500, 1e3, 2e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7, 2.5e7, 5e7, 1e8, Infinity];
const SIDE_MIN = 8;
export const SIDE_MAX = 4096;
const ZOOM_MAX = 96;
// On an unbounded canvas: how close a pattern may come to the edge before the world grows,
// and how many steps run between checks.
const OPEN_MARGIN = 24;
const OPEN_STEPS = 16;
// New worlds fill the window at this many pixels per cell.
const CELL_PX = 3;
// On the home page, automata draw themselves at 2,000 lines a second.
const SITE_SPEED = SPEEDS.indexOf(2e3);
// Snapshots kept along a run for stepping back, and the memory they may take.
const MARKS_MAX = 24;
const MARKS_BYTES = 48 * 2 ** 20;
export const ANT_COLOR = '#e5322d';

export const KINDS = {
  life: {
    id: 'life',
    unit: 'Generation',
    presets: LIFE_PRESETS,
    make: (W, H) => new LifeWorld(W, H),
    parse: parseLifeRule,
    format: formatLifeRule,
    same: sameLifeRule,
    random: (r) => randomLifeRule(r),
    mutations: (rule, r) => lifeMutations(rule, r, 9).map((m) => ({ ...m, title: formatLifeRule(m.rule) })),
    presetRule: (p) => parseLifeRule(p.rule),
    name: (rule) => formatLifeRule(rule),
    speed: 5,
    palette: 'graphite',
    settings: () => ({ style: 'soup', density: 0.35, patch: 0.25 }),
    cost: (w) => w.W * w.H * 2.8e-6,
  },
  eca: {
    id: 'eca',
    unit: 'Generation',
    presets: ELEMENTARY_PRESETS,
    make: (W, H) => new ElementaryWorld(W, H),
    parse(text) {
      const t = String(text).trim().replace(/^rule\s*/i, '');
      return /^\d{1,3}$/.test(t) && +t <= 255 ? +t : null;
    },
    format: (r) => String(r),
    same: (a, b) => a === b,
    random: randomElementaryRule,
    mutations: (rule) => elementaryMutations(rule).map((m) => ({ ...m, title: `Rule ${m.rule}` })),
    presetRule: (p) => p.rule,
    name: (rule) => `Rule ${rule}`,
    speed: 6,
    palette: 'graphite',
    settings: () => ({ style: 'single', density: 0.5 }),
    cost: (w) => w.W * 2e-6,
  },
  ant: {
    id: 'ant',
    unit: 'Step',
    presets: ANT_PRESETS,
    make: (W, H) => new AntWorld(W, H),
    parse: parseAntRule,
    format: formatAntRule,
    same: sameAntRule,
    random: (r, current) => randomAntRule(r, current && !isAnt(current)),
    mutations: (rule, r) => antMutations(rule, r, 9).map((m) => ({ ...m, title: formatAntRule(m.rule) })),
    presetRule: (p) => parseAntRule(p.rule),
    name: (rule) => formatAntRule(rule),
    speed: 11,
    palette: 'specimen',
    settings: () => ({ arrangement: 'one', noise: 0 }),
    cost: () => 6e-6,
  },
  turing: {
    id: 'turing',
    unit: 'Step',
    presets: TURING_PRESETS,
    make: (W, H) => new TuringWorld(W, H),
    parse: parseTuringRule,
    format: formatTuringRule,
    same: sameTuringRule,
    random: (r, current) => randomTuringRule(r, current),
    mutations: (rule, r) => turingMutations(rule, r, 9).map((m) => ({ ...m, title: formatTuringRule(m.rule) })),
    presetRule: (p) => parseTuringRule(p.rule),
    name: (rule) => formatTuringRule(rule),
    speed: 7,
    palette: 'graphite',
    settings: () => ({ style: 'blank', density: 0.3 }),
    cost: (w) => w.W * 6e-7,
  },
  // Each click starts its own random 1D automaton; there is no rule to edit.
  test: {
    id: 'test',
    unit: 'Step',
    presets: [],
    make: (W, H) => new TestWorld(W, H),
    parse: () => null,
    format: () => '',
    same: () => true,
    random: () => 0,
    mutations: () => [],
    presetRule: () => 0,
    name: () => 'Test',
    speed: SPEEDS.length - 1,
    palette: null,
    // How it paints and fades; the world reads these as they change.
    settings: () => ({ ...TUNING }),
    cost: (w) => w.W * 1e-5,
  },
  // Like test mode, but each click draws from a catalog of chosen rules.
  interesting: {
    id: 'interesting',
    unit: 'Step',
    presets: [],
    make: (W, H) => Object.assign(new TestWorld(W, H), { catalog: INTERESTING }),
    parse: () => null,
    format: () => '',
    same: () => true,
    random: () => 0,
    mutations: () => [],
    presetRule: () => 0,
    name: () => 'Interesting',
    speed: SPEEDS.length - 1,
    palette: null,
    settings: () => ({ ...TUNING }),
    cost: (w) => w.W * 1e-5,
  },
};

/** Kinds where every click starts an automaton of its own, and time fades what they draw. */
export const spawns = (kind) => kind === 'test' || kind === 'interesting';

// ---------------------------------------------------------------- app state

const app = {
  // Under the home page rather than in the app on its own.
  site: document.documentElement.hasAttribute('data-site'),
  mode: 'ant',
  docs: {},
  playing: false,
  theme: 'light',
  gridlines: true,
  antColor: ANT_COLOR,
  antGlow: false,
  unbounded: false,
  // Steps a second, as an index into SPEEDS; every kind runs at the same speed.
  speed: 0,
  // The size a fresh world gets on an unbounded canvas, where worlds grow as they need.
  size: [1, 1],
  catchUp: null,
  viewAnim: null,
  screen: { w: 1, h: 1, dpr: 1 },
  hover: null,
  linePreview: null,
};

const dirty = { world: true, draw: true, overlay: true };
let renderer, ui, overlay, octx;
const rootEl = document.documentElement;
const cur = () => app.docs[app.mode];
/** On the home page with the toolbar folded, the world lies under the page and only takes clicks and the wheel. */
const underPage = () => app.site && rootEl.classList.contains('toolbar-folded');

function createDoc(kind, W, H) {
  const K = KINDS[kind];
  const world = K.make(W, H);
  world.wrap = true;
  const settings = K.settings();
  if (spawns(kind)) world.tuning = settings;
  return {
    kind,
    K,
    world,
    palette: { id: K.palette, colors: null },
    acc: 0,
    cost: K.cost(world),
    view: null,
    history: new History(),
    seed: null,
    recipe: null,
    marks: [],
    markGap: 0,
    settings,
    preset: -1,
    halted: false,
    rate: { t: 0, gen: 0, value: 0 },
    nearbySeed: randomSeed(),
  };
}

/** About CELL_PX pixels per cell, rounded to whole device pixels so every cell is the same size. */
const startZoom = () => Math.max(1, Math.round(CELL_PX * app.screen.dpr)) / app.screen.dpr;

/** Every new world is the same size: just enough cells to cover the window at the starting zoom. */
function defaultSize() {
  const { w, h } = app.screen, z = startZoom();
  return [clamp(Math.ceil(w / z), 32, 1600), clamp(Math.ceil(h / z), 24, 1200)];
}

const startView = (doc) => ({ cx: doc.world.ox + doc.world.W / 2, cy: doc.world.oy + doc.world.H / 2, zoom: startZoom() });

/** The middle of the part of the window the toolbar and configs leave uncovered, in screen pixels. */
function visibleCenter() {
  const { top, right, bottom } = ui.insets();
  return [(app.screen.w - right) / 2, top + (app.screen.h - top - bottom) / 2];
}

/** A copy of `view` moved so the plane point (wx, wy) sits at the visible center. */
function centeredOn(view, wx, wy) {
  const [sx, sy] = visibleCenter();
  return { ...view, cx: wx + (app.screen.w / 2 - sx) / view.zoom, cy: wy + (app.screen.h / 2 - sy) / view.zoom };
}

// ---------------------------------------------------------------- colors

// A Turing machine's head shows its state in these colors, and turns gray when it halts.
const HEAD_COLORS = ['#e5322d', '#f2a41e', '#2f7ad6', '#1a9e6e', '#d0559a', '#7a5cd0'];
const HALTED_COLOR = '#8a8983';

/** The colors for a Turing machine's picture: its tape's colors from the palette, then its head in each state, then halted. */
export function machineColors(doc, rule) {
  const p = doc.palette.id && paletteById(doc.palette.id), K = rule.colors + rule.states + 1;
  // A palette made by editing colors holds the head's colors too.
  if (p?.custom || (!p && doc.palette.colors)) return extendColors(p?.colors || doc.palette.colors, K);
  const tape = paletteColors(p || paletteById(doc.K.palette), rule.colors, app.theme);
  return [...tape, ...HEAD_COLORS.slice(0, rule.states), HALTED_COLOR];
}

/** The document's palette resolved to K colors in the current theme. */
export function colorsFor(doc, K) {
  if (spawns(doc.kind)) return testColors(doc.settings.palette).slice(0, Math.max(K, 2));
  if (doc.kind === 'turing') return machineColors(doc, doc.world.rule);
  const p = doc.palette.id && paletteById(doc.palette.id);
  if (p) return paletteColors(p, K, app.theme);
  if (doc.palette.colors) return extendColors(doc.palette.colors, K);
  return paletteColors(paletteById(doc.K.palette), K, app.theme);
}

export const docColors = (doc) => colorsFor(doc, doc.world.states);

function applyColors() {
  const doc = cur();
  const colors = docColors(doc);
  const css = getComputedStyle(document.documentElement);
  const dark = app.theme === 'dark';
  renderer.setColors(
    colors,
    // Test mode is always dark, even around the world.
    spawns(doc.kind) ? colors[0] : css.getPropertyValue('--bg').trim() || (dark ? '#0b0b0b' : '#f1f1ef'),
    { color: gridColor(colors[0]), alpha: 1 },
    { color: '#000000', alpha: 0 },
    { color: dark ? '#ffffff' : '#000000', alpha: dark ? 0.16 : 0.18 },
  );
  dirty.draw = true;
}

// ---------------------------------------------------------------- runs, history, stepping back

/**
 * Makes the world as it stands the start of a new run; stepping back stops here.
 * `recipe` is the random fill the world was just made from, if any, so a link can say it in a few characters.
 */
function commitSeed(doc, recipe = null) {
  doc.seed = doc.world.snapshot();
  doc.recipe = recipe;
  doc.marks = [];
  doc.markGap = 0;
  doc.halted = false;
}

/** The recipe still describes the cells if nothing has run or been drawn since the run began. */
const keptRecipe = (doc) => (doc.world.gen === doc.seed.gen ? doc.recipe : null);

/** Keeps a snapshot every so often along a run, so stepping back never replays far. */
function noteMark(doc) {
  const w = doc.world;
  // About 40 ms of work apart, at the speed this world has been running.
  if (!doc.markGap) doc.markGap = Math.max(1, Math.round(40 / doc.cost));
  const last = doc.marks.length ? doc.marks[doc.marks.length - 1].gen : doc.seed.gen;
  if (w.gen - last < doc.markGap) return;
  doc.marks.push(w.snapshot());
  if (doc.marks.length > clamp(Math.floor(MARKS_BYTES / w.grid.length), 2, MARKS_MAX)) {
    // Keep every other snapshot, and take new ones twice as far apart.
    doc.marks = doc.marks.filter((_, i) => i % 2 === 1);
    doc.markGap *= 2;
  }
}

/** Bytes of cells in a snapshot, for the undo history's memory budget. */
const snapBytes = (snap) => Object.values(snap).reduce((n, v) => n + (ArrayBuffer.isView(v) ? v.byteLength : 0), 0);

function capture(doc, label) {
  const snap = doc.world.snapshot();
  return {
    label,
    snap,
    rule: doc.world.rule,
    wrap: doc.world.wrap,
    seed: doc.seed,
    recipe: doc.recipe,
    preset: doc.preset,
    bytes: snapBytes(snap) + (doc.seed ? snapBytes(doc.seed) : 0),
  };
}

function restoreEntry(doc, e) {
  cancelCatchUp();
  doc.world.setRule(e.rule);
  doc.world.wrap = e.wrap && !app.unbounded;
  doc.world.restore(e.snap);
  if (doc.seed !== e.seed) {
    doc.marks = [];
    doc.markGap = 0;
  }
  doc.seed = e.seed;
  doc.recipe = e.recipe;
  doc.preset = e.preset;
  doc.halted = false;
  doc.cost = doc.K.cost(doc.world);
  touched(doc, { rule: true, size: true });
}

function remember(doc, label, coalesce = false) {
  const top = doc.history.last;
  if (coalesce && top && top.label === label && performance.now() - top.time < 1200) return;
  doc.history.push(capture(doc, label));
  ui?.updateHistory();
}

/** Something about the document changed: redraw and refresh whatever depends on it. */
function touched(doc, what = {}) {
  if (doc !== cur()) return;
  dirty.world = dirty.draw = dirty.overlay = true;
  if (what.size) {
    if (doc.view) clampView(doc);
    ui.updateWorld();
  }
  if (what.rule || what.size) applyColors();
  if (what.rule) ui.updateRule();
  ui.updateHistory();
  ui.updateStats(true);
}

/** Runs toward `target` over the next frames. */
function startCatchUp(doc, target) {
  app.catchUp = { doc, from: doc.world.gen, target };
  runCatchUp(40);
}

function cancelCatchUp() {
  if (!app.catchUp) return;
  app.catchUp = null;
  ui.progress(null);
}

function runCatchUp(budget) {
  const c = app.catchUp;
  if (!c) return;
  const w = c.doc.world;
  runSteps(c.doc, c.target - w.gen, budget);
  if (w.gen >= c.target || c.doc.halted) {
    app.catchUp = null;
    ui.progress(null);
    if (c.doc.halted) haltNotice(c.doc);
  } else ui.progress((w.gen - c.from) / (c.target - c.from));
  ui.updateStats(true);
}

// ---------------------------------------------------------------- stepping

/** Runs up to `want` steps within `budget` ms. Returns steps run. */
function runSteps(doc, want, budget) {
  const t0 = performance.now();
  let done = 0;
  while (done < want) {
    const left = budget - (performance.now() - t0);
    if (left <= 0 && done > 0) break;
    let chunk = Math.max(1, Math.min(want - done, Math.floor(Math.max(left, 0.25) / doc.cost), doc.kind === 'ant' ? 8e6 : 4096));
    // A pattern spreads at most a cell a step, so a few steps at a time can never reach an edge unseen.
    if (app.unbounded && (doc.kind === 'life' || doc.kind === 'eca' || doc.kind === 'turing')) {
      chunk = Math.min(chunk, OPEN_STEPS);
      makeRoom(doc, chunk);
    }
    const c0 = performance.now();
    const n = doc.world.step(chunk);
    const dt = performance.now() - c0;
    if (n > 0 && dt > 0.2) doc.cost = doc.cost * 0.6 + (dt / n) * 0.4;
    done += n;
    if (n < chunk) {
      if (app.unbounded && doc.kind === 'ant' && roomForAnts(doc)) continue;
      doc.halted = true;
      break;
    }
  }
  if (done) {
    dirty.world = dirty.overlay = true;
    noteMark(doc);
  }
  return done;
}

function advance(doc, dt) {
  const rate = SPEEDS[app.speed];
  let want = Infinity;
  if (rate !== Infinity) {
    doc.acc += (rate * dt) / 1000;
    want = Math.floor(doc.acc);
    doc.acc -= want;
    if (!want) return;
  }
  const frame = app.frameMs || 16.7;
  const budget = Math.max(3, frame * (rate === Infinity ? 0.75 : 0.6));
  const done = runSteps(doc, want, budget);
  if (done < want && rate !== Infinity) doc.acc = 0;
  if (doc.halted) {
    pause();
    haltNotice(doc);
  }
}

function haltNotice(doc) {
  if (doc.kind === 'turing') {
    const w = doc.world, marks = w.population();
    if (w.offEdge) toast('The head ran into the edge of the tape', { action: 'Wrap', run: () => cur() === doc && setWrap(true) });
    else toast(`Halted after ${formatSteps(w.gen)}, leaving ${marks.toLocaleString('en-US')} mark${marks === 1 ? '' : 's'}`);
    return;
  }
  if (doc.kind !== 'ant') return;
  if (!doc.world.count) {
    toast('No ants. Click anywhere to place one.');
    return;
  }
  const many = doc.world.count > 1;
  toast(many ? 'The ants reached the edge' : 'The ant reached the edge', {
    action: 'Wrap',
    run: () => cur() === doc && setWrap(true),
  });
}

const formatSteps = (n) => `${n.toLocaleString('en-US')} step${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- actions

/** Starts the run. Undo can go back to where it started, unless `record` is false (test mode starting itself). */
function play(record = true) {
  const doc = cur();
  if (app.playing) return;
  if (doc.halted || (doc.kind === 'ant' && doc.world.liveAnts === 0) || (doc.kind === 'turing' && doc.world.halted)) {
    haltNotice(doc);
    return;
  }
  if (record) remember(doc, 'run');
  app.playing = true;
  doc.acc = 0;
  doc.rate = { t: 0, gen: doc.world.gen, value: 0 };
  ui.updatePlay();
}

function pause() {
  if (!app.playing) return;
  app.playing = false;
  ui.updatePlay();
  ui.updateStats(true);
}

const togglePlay = () => (app.playing ? pause() : play());

function stepOnce(n = 1) {
  const doc = cur();
  pause();
  cancelCatchUp();
  remember(doc, 'step', true);
  runSteps(doc, n, 50);
  if (doc.halted) haltNotice(doc);
  ui.updateStats(true);
}

/** Steps back by replaying from the nearest snapshot before the target, as far as the start of the run. */
function stepBack(n = 1) {
  const doc = cur(), w = doc.world;
  if (spawns(doc.kind)) return;
  pause();
  cancelCatchUp();
  const target = Math.max(doc.seed.gen, w.gen - n);
  if (target >= w.gen) return;
  remember(doc, 'step', true);
  let from = doc.seed;
  for (const m of doc.marks) if (m.gen <= target && m.gen > from.gen) from = m;
  w.restore(from);
  doc.halted = false;
  const steps = target - w.gen;
  if (steps * doc.cost > 80) startCatchUp(doc, target);
  else runSteps(doc, steps, Infinity);
  touched(doc);
}

/** Back to a clean world: Life-like and 1D worlds empty, an ant world with fresh ants. */
function reset() {
  const doc = cur(), w = doc.world;
  pause();
  cancelCatchUp();
  remember(doc, 'reset');
  w.clear();
  if (doc.kind === 'ant') w.placeAnts(doc.settings.arrangement);
  commitSeed(doc);
  touched(doc);
}

/**
 * Test mode: a click starts an automaton at that plane cell, and time starts if it
 * was stopped. Options go on to the world's spawn: `fresh: false` for the spawns
 * after the first in a drag, which all belong to one drawing, and `rng` for random starts.
 */
function spawnAt(px, py, opts = {}) {
  const doc = cur(), w = doc.world;
  if (w.frame) coverTest(doc, py);
  const x = px - w.ox, y = py - w.oy;
  if (!inside(doc, x, y)) return;
  // In a frame, every automaton wraps around at its sides, whatever the edges setting.
  w.spawn(x, y, { wraps: w.wrap || !!w.frame, ...opts });
  dirty.world = true;
  ui.updateTestLog();
  if (!app.playing) play(false);
}

/**
 * Test mode on an unbounded canvas: a fixed frame of the plane, as wide as the screen
 * is when zoomed all the way out and as tall as a world can be, around the middle of
 * the view. The world starts as the lines on screen and grows inside the frame as it
 * needs to, but never moves, so zooming and panning never lose anything.
 */
function frameTest(doc) {
  const w = doc.world, v = doc.view, { w: sw, h: sh } = app.screen;
  const out = SIDE_MAX / Math.max(sw, sh); // cells a pixel, zoomed all the way out
  const fw = Math.min(SIDE_MAX, Math.round(sw * out)), top = Math.round(v.cy - (sh * out) / 2);
  const y0 = clamp(Math.floor(v.cy - sh / 2 / v.zoom), top, top + SIDE_MAX - 1);
  const y1 = clamp(Math.ceil(v.cy + sh / 2 / v.zoom), y0 + 1, top + SIDE_MAX);
  w.resize(fw, y1 - y0);
  w.ox = Math.round(v.cx - fw / 2);
  w.oy = y0;
  w.frame = { top, bottom: top + SIDE_MAX };
}

/** Grows a framed test world up or down to take in a plane line, with room to spare, as far as the frame allows. */
function coverTest(doc, py) {
  const w = doc.world, f = w.frame, y = py - w.oy;
  if (py < f.top || py >= f.bottom || (y >= 0 && y < w.H)) return;
  const y0 = y < 0 ? Math.max(f.top, py - 64) - w.oy : 0;
  const y1 = y >= w.H ? Math.min(f.bottom, py + 65) - w.oy : w.H;
  w.reframe(0, y0, w.W, y1 - y0);
  dirty.world = dirty.draw = dirty.overlay = true;
  ui.updateWorld();
}

/**
 * Test mode moves at its own pace: each automaton draws a line whenever one is due
 * at the chosen speed (all at once at Max), but only as far down as the screen
 * shows, in slices of the frame so a crowd of them can't stall it. Time passes for
 * fading as it goes.
 */
function advanceTest(doc, dt) {
  const w = doc.world, v = doc.view, size = w.W * w.H;
  w.rate = SPEEDS[app.speed];
  // A few lines past the bottom of the screen; below that, nothing is worked out until it can be seen.
  w.limit = Math.ceil(v.cy + app.screen.h / 2 / v.zoom) + 8;
  w.pass(dt);
  w.run(performance.now() + Math.max(4, (app.frameMs || 16.7) * 0.6));
  if (w.W * w.H !== size) ui.updateWorld();
  // Only the lines that changed go to the GPU, and nothing at all while everything holds.
  if (w.rows[1] >= w.rows[0]) dirty.world = true;
}

function lifeSeedSpec(s) {
  return s.style === 'dot' ? { single: true } : { density: s.density, area: s.style === 'patch' ? s.patch : 1 };
}

/** A random start, as set up in the configs. */
function reseed() {
  const doc = cur(), w = doc.world;
  remember(doc, 'reseed');
  cancelCatchUp();
  const seed = randomSeed(), r = rng(seed);
  let recipe = null;
  if (spawns(doc.kind)) {
    // A handful of automata, one drawing, at random places in the upper half of what you see of the world.
    const v = doc.view, hw = app.screen.w / 2 / v.zoom, hh = app.screen.h / 2 / v.zoom;
    const top = w.frame ? w.frame.top : w.oy, bottom = w.frame ? w.frame.bottom : w.oy + w.H;
    const x0 = Math.max(w.ox, v.cx - hw), x1 = Math.min(w.ox + w.W, v.cx + hw);
    const y0 = Math.max(top, v.cy - hh), y1 = Math.min(bottom, v.cy + hh);
    for (let i = 0; i < 6; i++) spawnAt(Math.floor(x0 + r() * (x1 - x0)), Math.floor(y0 + (r() * (y1 - y0)) / 2), { fresh: i === 0, rng: r });
    touched(doc);
    return;
  }
  if (doc.kind === 'life') {
    const spec = lifeSeedSpec(doc.settings);
    w.seedWith(spec, r);
    if (!spec.single) recipe = { seed, density: spec.density, area: spec.area };
  } else if (doc.kind === 'eca') {
    const random = doc.settings.style === 'random';
    w.seedWith(random ? { random: doc.settings.density } : 'single', r);
    if (random) recipe = { seed, density: doc.settings.density, area: 1 };
  } else if (doc.kind === 'turing') {
    const random = doc.settings.style === 'random';
    w.seedWith(random ? { random: doc.settings.density } : 'blank', r);
    if (random) recipe = { seed, density: doc.settings.density, area: 1 };
  } else {
    if (doc.settings.noise > 0) {
      w.randomize(doc.settings.noise, r);
      recipe = { seed, density: doc.settings.noise, area: 1 };
    } else w.grid.fill(0);
    w.placeAnts(doc.settings.arrangement, r);
  }
  w.gen = 0;
  commitSeed(doc, recipe);
  touched(doc);
}

function undo() {
  const doc = cur();
  const e = doc.history.undo(capture(doc, 'undo'));
  if (e) {
    pause();
    restoreEntry(doc, e);
  }
}

function redo() {
  const doc = cur();
  const e = doc.history.redo(capture(doc, 'redo'));
  if (e) {
    pause();
    restoreEntry(doc, e);
  }
}

/** A new rule stops the run and takes over from the world as it stands; nothing on screen changes. */
function setRule(rule, { coalesce = false } = {}) {
  const doc = cur();
  if (rule == null || doc.K.same(rule, doc.world.rule)) return;
  pause();
  cancelCatchUp();
  remember(doc, 'rule', coalesce);
  const states = doc.world.states;
  doc.world.setRule(rule);
  doc.preset = matchPreset(doc);
  doc.nearbySeed = randomSeed();
  doc.cost = doc.K.cost(doc.world);
  // A random fill depends on how many colors there are, so a new count retires its recipe.
  commitSeed(doc, doc.world.states === states ? keptRecipe(doc) : null);
  touched(doc, { rule: true });
}

function randomRule() {
  const doc = cur();
  const r = rng(randomSeed());
  let rule = doc.K.random(r, doc.world.rule);
  if (doc.kind === 'life') {
    // Skip rules that die out or fill the world from a soup; they make dull draws.
    for (let tries = 0; tries < 12; tries++) {
      const probe = new LifeWorld(64, 64);
      probe.setRule(rule);
      probe.randomize(0.35, rng(tries + 1));
      probe.step(40);
      const p = probe.pop / 4096;
      if (p > 0.02 && p < 0.7) break;
      rule = doc.K.random(r);
    }
  }
  setRule(rule);
}

function matchPreset(doc) {
  const { K, world } = doc;
  return K.presets.findIndex((p) => K.same(K.presetRule(p), world.rule));
}

/**
 * Switches to a famous rule, which works like any other change of rule. New seeds
 * from then on are the kind that shows it off.
 */
function loadPreset(index) {
  const doc = cur(), p = doc.K.presets[index];
  if (!p) return;
  pause();
  const s = doc.settings;
  if (doc.kind === 'life') {
    s.style = p.seed.single ? 'dot' : (p.seed.area ?? 1) < 1 ? 'patch' : 'soup';
    if (!p.seed.single) s.density = p.seed.density;
    if ((p.seed.area ?? 1) < 1) s.patch = p.seed.area;
  } else if (doc.kind === 'eca') {
    s.style = p.seed === 'single' ? 'single' : 'random';
    if (p.seed.random != null) s.density = p.seed.random;
  } else if (doc.kind === 'turing') {
    s.style = 'blank';
  } else {
    s.arrangement = 'one';
    s.noise = 0;
  }
  setRule(doc.K.presetRule(p));
  // A famous machine starts over on a blank tape, so it does what it's famous for.
  if (doc.kind === 'turing') {
    doc.world.clear();
    commitSeed(doc);
    touched(doc);
  }
  ui.updateWorld();
}

/** Like a rule, a change of edges applies from here on. */
function setWrap(wrap) {
  const doc = cur(), w = doc.world;
  if (w.wrap === wrap) return;
  remember(doc, 'edges');
  w.wrap = wrap;
  // Ants that walked off a walled edge come back on the far side.
  if (doc.kind === 'ant' && wrap) for (let k = 0; k < w.count; k++) w.alive[k] = 1;
  commitSeed(doc, keptRecipe(doc));
  touched(doc, { size: true });
}

function resizeWorld(W, H) {
  const doc = cur();
  W = clamp(Math.round(W) || 0, SIDE_MIN, SIDE_MAX);
  H = clamp(Math.round(H) || 0, SIDE_MIN, SIDE_MAX);
  app.size = [W, H];
  if (W === doc.world.W && H === doc.world.H) return;
  pause();
  remember(doc, 'resize');
  cancelCatchUp();
  doc.world.resize(W, H);
  doc.cost = doc.K.cost(doc.world);
  commitSeed(doc);
  animateView(doc, fitView(doc));
  touched(doc, { size: true });
}

function setSpeed(i) {
  app.speed = clamp(i, 0, SPEEDS.length - 1);
  cur().acc = 0;
  ui.updateSpeed();
}

/**
 * Switches kinds. Another kind of automaton is another rule, so the run stops here
 * too. The kinds share one view, so switching keeps your place and zoom, and unless
 * `fresh` is false (a link or saved world brings its own), the new kind starts clean.
 */
function setMode(kind, { fresh = true } = {}) {
  if (!KINDS[kind] || kind === app.mode) return;
  pause();
  cancelCatchUp();
  const prev = app.docs[app.mode];
  app.mode = kind;
  if (!app.site) storage('automata.mode', kind);
  const doc = cur();
  app.viewAnim = null;
  if (prev?.view) doc.view = { ...prev.view };
  else if (!doc.view) doc.view = fitView(doc);
  if (fresh && prev) freshStart(doc, prev);
  clampView(doc);
  doc.acc = 0;
  doc.rate = { t: 0, gen: doc.world.gen, value: 0 };
  uploadAll = true;
  rootEl.dataset.mode = kind;
  ui.clearToasts();
  ui.setMode(kind);
  applyColors();
  dirty.world = dirty.draw = dirty.overlay = true;
  if (spawns(kind)) play(false);
}

/**
 * Clears a kind's world for a fresh start, keeping its rule and settings. Every kind
 * gets the same size. On a bounded canvas it lines up with the world just left, edges
 * and all, if that one is the same size; otherwise it starts around the middle of the
 * view. Undo brings back what was there.
 */
function freshStart(doc, prev) {
  const w = doc.world, before = capture(doc, 'switch'), p = prev.world;
  if (spawns(doc.kind) && app.unbounded) frameTest(doc);
  else {
    const [W, H] = app.size;
    const [ox, oy] =
      !app.unbounded && p.W === W && p.H === H ? [p.ox, p.oy] : [Math.round(doc.view.cx - W / 2), Math.round(doc.view.cy - H / 2)];
    if (w.W !== W || w.H !== H) w.resize(W, H);
    w.clear();
    w.ox = ox;
    w.oy = oy;
    if (spawns(doc.kind)) w.frame = null;
  }
  if (!app.unbounded) w.wrap = p.wrap;
  if (doc.kind === 'ant') w.placeAnts(doc.settings.arrangement);
  doc.cost = doc.K.cost(w);
  commitSeed(doc);
  if (!sameWorld(before.snap, w.snapshot())) {
    doc.history.push(before);
    ui.updateHistory();
  }
}

/** Whether two snapshots hold the same world: the same cells, ants, generation and place. */
function sameWorld(a, b) {
  if (a.W !== b.W || a.H !== b.H || a.ox !== b.ox || a.oy !== b.oy || a.gen !== b.gen) return false;
  const same = (p, q) => {
    if (p.length !== q.length) return false;
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
    return true;
  };
  if (!same(a.grid, b.grid)) return false;
  if (a.ants && !['x', 'y', 'd', 's', 'a'].every((k) => same(a.ants[k], b.ants[k]))) return false;
  return !(a.runs?.length || b.runs?.length);
}

function setPalette(id) {
  const doc = cur();
  doc.palette = { id, colors: null };
  applyColors();
  ui.updateColors();
}

// Palettes made by editing colors live in this browser.
const saveCustomPalettes = () => storage('automata.palettes', customPalettes().map(({ id, name, colors }) => ({ id, name, colors })));

/** Editing a color makes a palette of your own the first time, and edits that palette after. */
function setColor(i, hex) {
  const doc = cur();
  const colors = docColors(doc);
  colors[i] = hex;
  const p = paletteById(doc.palette.id);
  if (p?.custom) p.colors = colors;
  else {
    const n = customPalettes().reduce((m, q) => Math.max(m, +q.id.slice(1) || 0), 0) + 1;
    setCustomPalettes([...customPalettes(), { id: `u${n}`, name: `Custom ${n}`, custom: true, colors }]);
    doc.palette = { id: `u${n}`, colors: null };
  }
  saveCustomPalettes();
  applyColors();
  ui.updateColors(i);
}

function deletePalette(id) {
  setCustomPalettes(customPalettes().filter((p) => p.id !== id));
  saveCustomPalettes();
  for (const doc of Object.values(app.docs)) if (doc.palette.id === id) doc.palette = { id: doc.K.palette, colors: null };
  applyColors();
  ui.updateColors();
}

function setSetting(key, value) {
  const doc = cur();
  doc.settings[key] = value;
  if (spawns(doc.kind) && key === 'palette') {
    applyColors();
    ui.updateTestLog();
  }
  // Turning persist off lets whatever it was holding go.
  if (spawns(doc.kind) && key === 'persist' && !value) doc.world.release();
  ui.updateWorld();
}

function fastForward(target) {
  const doc = cur();
  if (!(target > doc.world.gen)) {
    if (target != null && target < doc.world.gen) toast(`Already past ${target.toLocaleString('en-US')}`);
    return;
  }
  remember(doc, 'run');
  startCatchUp(doc, target);
}

function setAntColor(hex) {
  app.antColor = hex;
  storage('automata.antColor', hex);
  dirty.overlay = true;
  ui.updateColors(-1);
}

function setAntGlow(on) {
  app.antGlow = on;
  storage('automata.antGlow', on);
  dirty.overlay = true;
  ui.updateWorld();
}

// ---------------------------------------------------------------- view

// Views are kept in plane coordinates, where a world's cell (x, y) sits at (ox + x, oy + y).
// A world that grows to the left or up moves its ox and oy, so nothing on screen shifts.

function fitView(doc) {
  const { w, h, dpr } = app.screen, world = doc.world;
  let z = Math.min(w / world.W, h / world.H);
  // Whole device pixels per cell keep every cell the same size.
  if (z * dpr >= 1) z = Math.floor(z * dpr) / dpr;
  return { cx: world.ox + world.W / 2, cy: world.oy + world.H / 2, zoom: Math.max(z, 0.02) };
}

/** Normally the world can shrink to half the window; on an unbounded canvas, until the window shows the largest world there can be. */
function minZoom(doc) {
  if (app.unbounded) return Math.max(app.screen.w, app.screen.h) / SIDE_MAX;
  return Math.min(fitView(doc).zoom * 0.5, 1);
}

/**
 * On an unbounded canvas the view can go anywhere, except that test mode keeps the
 * screen inside its frame; otherwise the view stays over the world.
 */
function clampView(doc, v = doc.view) {
  const w = doc.world;
  v.zoom = clamp(v.zoom, minZoom(doc), ZOOM_MAX);
  if (w.frame) {
    const hw = app.screen.w / 2 / v.zoom, hh = app.screen.h / 2 / v.zoom, { top, bottom } = w.frame;
    v.cx = w.W > 2 * hw ? clamp(v.cx, w.ox + hw, w.ox + w.W - hw) : w.ox + w.W / 2;
    v.cy = bottom - top > 2 * hh ? clamp(v.cy, top + hh, bottom - hh) : (top + bottom) / 2;
  } else if (!app.unbounded) {
    v.cx = clamp(v.cx, w.ox, w.ox + w.W);
    v.cy = clamp(v.cy, w.oy, w.oy + w.H);
  }
}

/** The world cell at the screen's top-left corner, fractional. */
function origin(doc) {
  const v = doc.view;
  return [v.cx - app.screen.w / 2 / v.zoom - doc.world.ox, v.cy - app.screen.h / 2 / v.zoom - doc.world.oy];
}

/** The world cell under a screen point, fractional. */
function toWorld(sx, sy) {
  const doc = cur(), [ox, oy] = origin(doc);
  return [ox + sx / doc.view.zoom, oy + sy / doc.view.zoom];
}

/** The point on the plane under a screen point. */
function toPlane(sx, sy) {
  const w = cur().world, [x, y] = toWorld(sx, sy);
  return [x + w.ox, y + w.oy];
}

/** The plane cell a press at a screen point acts on. In a 1D world that is always on the newest line. */
function cellAt(sx, sy) {
  const doc = cur(), [px, py] = toPlane(sx, sy);
  return [Math.floor(px), doc.kind === 'eca' || doc.kind === 'turing' ? doc.world.currentRow + doc.world.oy : Math.floor(py)];
}

/**
 * The world cell for a plane cell, growing an unbounded world to take it in (with room
 * to spare) when it's outside. Null when it's outside a world that can't or won't grow.
 */
function reach(doc, px, py) {
  const w = doc.world;
  let x = px - w.ox, y = py - w.oy;
  if (app.unbounded && !inside(doc, x, y)) {
    const pad = 64, down = doc.kind !== 'eca'; // 1D lines only grow downwards, by stepping
    growWorld(doc, x < 0 ? pad - x : 0, down && y < 0 ? pad - y : 0, x >= w.W ? x - w.W + 1 + pad : 0, down && y >= w.H ? y - w.H + 1 + pad : 0);
    x = px - w.ox;
    y = py - w.oy;
  }
  return inside(doc, x, y) ? [x, y] : null;
}

/** Adds cells around a world, as far as SIDE_MAX allows. Returns whether it grew at all. */
function growWorld(doc, l, t, r, b) {
  const w = doc.world;
  l = Math.min(l, SIDE_MAX - w.W);
  r = Math.min(r, SIDE_MAX - w.W - l);
  t = Math.min(t, SIDE_MAX - w.H);
  b = Math.min(b, SIDE_MAX - w.H - t);
  if (l <= 0 && t <= 0 && r <= 0 && b <= 0) return false;
  w.grow(Math.max(0, l), Math.max(0, t), Math.max(0, r), Math.max(0, b));
  doc.cost = doc.K.cost(w);
  dirty.world = dirty.draw = dirty.overlay = true;
  ui.updateWorld();
  return true;
}

/** Room to grow on each side: half the world again, or at least 64 cells. */
const growBy = (n) => Math.max(64, n >> 1);

/**
 * Before Life or 1D steps on an unbounded canvas: grows the world wherever a pattern nears
 * its edge. A world already as big as it can be wraps around instead.
 */
function makeRoom(doc, steps) {
  const w = doc.world;
  if (w.wrap) return;
  if (doc.kind === 'life') {
    const [l, t, r, b] = w.nearEdges(OPEN_MARGIN);
    if (!(l || t || r || b)) return;
    if (((l || r) && w.W >= SIDE_MAX) || ((t || b) && w.H >= SIDE_MAX)) w.wrap = true;
    else growWorld(doc, l ? growBy(w.W) : 0, t ? growBy(w.H) : 0, r ? growBy(w.W) : 0, b ? growBy(w.H) : 0);
  } else if (doc.kind === 'eca' || doc.kind === 'turing') {
    // A 1D pattern widens a cell a side per step at most, and a Turing machine's head moves a cell.
    const [l, r] = w.nearSides(OPEN_MARGIN);
    if ((l || r) && w.W >= SIDE_MAX) w.wrap = true;
    else growWorld(doc, l ? growBy(w.W) : 0, 0, r ? growBy(w.W) : 0, w.gen + steps >= w.H - 1 ? growBy(w.H) : 0);
  }
}

/** After an edge stops ants on an unbounded canvas: grows the world past it (or wraps, once it can't grow) and lets them finish their moves. */
function roomForAnts(doc) {
  const w = doc.world, blocked = w.blocked();
  if (!blocked.length) return false;
  let l = 0, t = 0, r = 0, b = 0;
  for (const [, x, y] of blocked) {
    if (x < 0) l = growBy(w.W);
    if (y < 0) t = growBy(w.H);
    if (x >= w.W) r = growBy(w.W);
    if (y >= w.H) b = growBy(w.H);
  }
  growWorld(doc, l, t, r, b);
  w.resumeBlocked();
  return w.blocked().length === 0;
}

function setUnbounded(on) {
  app.unbounded = on;
  storage('automata.unbounded', on);
  for (const doc of Object.values(app.docs)) openWorld(doc);
  dirty.world = dirty.draw = dirty.overlay = true;
  ui.updateWorld();
}

/**
 * An unbounded canvas has no edges to wrap around. A test world starts over: in a
 * frame of the plane on an unbounded canvas, or at the usual size without one.
 */
function openWorld(doc) {
  const w = doc.world;
  w.wrap = !app.unbounded;
  w.open = app.unbounded;
  if (spawns(doc.kind) && doc.view) {
    if (app.unbounded) frameTest(doc);
    else {
      const [W, H] = app.size;
      w.resize(W, H);
      [w.ox, w.oy, w.frame] = [Math.round(doc.view.cx - W / 2), Math.round(doc.view.cy - H / 2), null];
    }
  }
  if (doc.seed) commitSeed(doc, keptRecipe(doc));
  if (doc.view) clampView(doc);
}

function zoomAt(sx, sy, factor) {
  const doc = cur(), v = doc.view;
  app.viewAnim = null;
  const [wx, wy] = toPlane(sx, sy);
  const z = clamp(v.zoom * factor, minZoom(doc), ZOOM_MAX);
  v.zoom = z;
  v.cx = wx + (app.screen.w / 2 - sx) / z;
  v.cy = wy + (app.screen.h / 2 - sy) / z;
  clampView(doc);
  dirty.draw = dirty.overlay = true;
}

function panBy(dx, dy) {
  const doc = cur(), v = doc.view;
  app.viewAnim = null;
  v.cx -= dx / v.zoom;
  v.cy -= dy / v.zoom;
  clampView(doc);
  dirty.draw = dirty.overlay = true;
}

function animateView(doc, target, ms = 240) {
  clampView(doc, target);
  if (prefersReducedMotion() || !doc.view) {
    doc.view = target;
    dirty.draw = dirty.overlay = true;
    return;
  }
  app.viewAnim = { doc, from: { ...doc.view }, target, t0: performance.now(), ms };
}

function stepViewAnim(now) {
  const a = app.viewAnim;
  if (!a) return;
  const t = Math.min(1, (now - a.t0) / a.ms), e = 1 - (1 - t) ** 3;
  const v = a.doc.view;
  const logZ = Math.log(a.from.zoom) + (Math.log(a.target.zoom) - Math.log(a.from.zoom)) * e;
  v.zoom = Math.exp(logZ);
  v.cx = a.from.cx + (a.target.cx - a.from.cx) * e;
  v.cy = a.from.cy + (a.target.cy - a.from.cy) * e;
  if (t >= 1) app.viewAnim = null;
  dirty.draw = dirty.overlay = true;
}

const fit = () => animateView(cur(), fitView(cur()));

function zoomStep(dir) {
  const doc = cur();
  const [cx, cy] = visibleCenter();
  const v = doc.view;
  // Step between whole-pixel zooms when zoomed in, so cells stay crisp.
  const dpr = app.screen.dpr;
  let z = v.zoom * (dir > 0 ? 1.6 : 1 / 1.6);
  if (z * dpr >= 2) z = Math.max(1, Math.round(z * dpr)) / dpr;
  if (dir > 0 && z <= v.zoom) z = (Math.round(v.zoom * dpr) + 1) / dpr;
  z = clamp(z, minZoom(doc), ZOOM_MAX);
  const [wx, wy] = toPlane(cx, cy);
  animateView(doc, centeredOn({ zoom: z }, wx, wy), 180);
}

// ---------------------------------------------------------------- painting and ants

let stroke = null;
let antDrag = null;

function inside(doc, x, y) {
  return x >= 0 && y >= 0 && x < doc.world.W && y < doc.world.H;
}

/**
 * Starts painting at plane cell (px, py). Every cell the stroke crosses takes the color
 * that follows the first cell's. Strokes work in plane cells, so a world that grows
 * under a stroke doesn't knock it off course.
 */
function strokeBegin(px, py) {
  const doc = cur(), entry = capture(doc, 'paint');
  const at = reach(doc, px, py);
  if (!at) return false;
  cancelCatchUp();
  // A brush lays down the color after the cell's own (on a Turing machine's tape, only tape colors).
  const colors = doc.world.paints ?? doc.world.states, here = doc.world.get(...at);
  stroke = { doc, value: here < colors ? (here + 1) % colors : 1, last: [px, py], entry, changed: false };
  paintAt(px, py);
  return true;
}

function paintAt(px, py) {
  const doc = stroke.doc, at = reach(doc, px, py);
  if (at && doc.world.set(at[0], at[1], stroke.value)) {
    stroke.changed = true;
    dirty.world = true;
  }
}

function strokeTo(px, py) {
  if (!stroke) return;
  for (const [x, y] of line(stroke.last[0], stroke.last[1], px, py)) paintAt(x, y);
  stroke.last = [px, py];
}

function strokeEnd() {
  if (!stroke) return;
  const { doc, entry, changed } = stroke;
  stroke = null;
  if (!changed) return;
  doc.history.push(entry);
  commitSeed(doc);
  touched(doc);
}

function strokeCancel() {
  if (!stroke) return;
  const { doc, entry, changed } = stroke;
  stroke = null;
  if (changed) restoreEntry(doc, entry);
}

function drawLine(x0, y0, x1, y1) {
  if (!strokeBegin(x0, y0)) {
    // Start outside the world: find the first point that lands inside.
    for (const [x, y] of line(x0, y0, x1, y1)) if (strokeBegin(x, y)) break;
  }
  strokeTo(x1, y1);
  strokeEnd();
}

/**
 * Changes the ants and makes the result the start of a new run. Ants don't touch the grid,
 * so a random fill keeps its recipe. `entry` is the state to undo back to, if it was taken earlier.
 */
function editAnts(doc, fn, entry = capture(doc, 'ant')) {
  cancelCatchUp();
  if (fn(doc.world) === false) return;
  doc.history.push(entry);
  commitSeed(doc, keptRecipe(doc));
  touched(doc);
}

function antPlace(px, py) {
  const doc = cur(), entry = capture(doc, 'ant');
  const at = reach(doc, px, py);
  if (!at) return;
  const [x, y] = at;
  editAnts(doc, (w) => {
    if (w.addAnt(x, y, 0, 0) >= 0) return;
    toast('No room for more ants');
    return false;
  }, entry);
}

/** Puts a Turing machine's head on a plane cell of its tape, in state A. */
function headPlace(px) {
  const doc = cur(), w = doc.world, x = px - w.ox, entry = capture(doc, 'head');
  if (x < 0 || x >= w.W) return;
  cancelCatchUp();
  w.placeHead(x);
  doc.history.push(entry);
  commitSeed(doc, keptRecipe(doc));
  touched(doc);
}

/** The ant on a plane cell, if there is one. */
function antOn(doc, px, py) {
  const w = doc.world, x = px - w.ox, y = py - w.oy;
  return doc.kind === 'ant' && inside(doc, x, y) ? w.antAt(x, y) : -1;
}

function antRemove(px, py) {
  const doc = cur();
  editAnts(doc, (w) => w.removeAnt(antOn(doc, px, py)));
}

/** Pressing on an ant turns it a quarter turn; dragging from it aims it. */
function antBegin(px, py) {
  const doc = cur(), w = doc.world;
  cancelCatchUp();
  const entry = capture(doc, 'ant');
  const k = antOn(doc, px, py);
  w.ad[k] = (w.ad[k] + 1) & 3;
  w.alive[k] = 1;
  antDrag = { doc, k, x: px, y: py, entry };
  doc.halted = false;
  dirty.overlay = true;
}

/** Aims the ant being dragged toward the plane point (wx, wy). */
function antAim(wx, wy) {
  if (!antDrag) return;
  const { doc, k, x, y } = antDrag;
  const dx = wx - (x + 0.5), dy = wy - (y + 0.5);
  if (Math.hypot(dx, dy) < 0.8) return;
  doc.world.ad[k] = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  dirty.overlay = true;
}

function antEnd() {
  if (!antDrag) return;
  const { doc, entry } = antDrag;
  antDrag = null;
  doc.history.push(entry);
  commitSeed(doc, keptRecipe(doc));
  touched(doc);
}

function antCancel() {
  if (!antDrag) return;
  const { doc, entry } = antDrag;
  antDrag = null;
  restoreEntry(doc, entry);
}

// ---------------------------------------------------------------- input

const pointers = new Map();
let gesture = null;
let space = null;

const localXY = (e) => [e.clientX, e.clientY];

function onPointerDown(e) {
  if (e.target !== overlay) return;
  const [x, y] = localXY(e);
  overlay.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x, y });
  if (underPage()) return pagePointerDown(e, x, y);
  if (pointers.size === 2) {
    strokeCancel();
    antCancel();
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    return;
  }
  if (pointers.size > 2) return;
  const doc = cur();
  const [cx, cy] = cellAt(x, y);
  if (spawns(doc.kind) && e.button === 0 && !space) {
    spawnAt(cx, cy);
    gesture = { kind: 'spawn', last: [cx, cy] };
    return;
  }
  const onAnt = antOn(doc, cx, cy) >= 0;
  // Right-click (or alt-click) on an ant removes it; any other right or middle drag, or space-drag, moves the view.
  if (onAnt && (e.button === 2 || e.altKey)) {
    antRemove(cx, cy);
    gesture = { kind: 'none' };
    return;
  }
  if (e.button === 1 || e.button === 2 || space) {
    e.preventDefault();
    if (space) space.panned = true;
    gesture = { kind: 'pan', x, y };
    rootEl.classList.add('grabbing');
    return;
  }
  if (onAnt) {
    antBegin(cx, cy);
    gesture = { kind: 'ant' };
  } else if (e.shiftKey) {
    gesture = { kind: 'line', x0: cx, y0: cy };
    app.linePreview = [cx, cy, cx, cy];
    dirty.overlay = true;
  } else if (doc.kind === 'ant' || doc.kind === 'turing') {
    // A click places an ant (or a Turing machine's head); once the pointer travels, it paints instead.
    gesture = { kind: 'pending', x, y, cx, cy, slop: e.pointerType === 'touch' ? 10 : 5 };
  } else {
    strokeBegin(cx, cy);
    gesture = { kind: 'stroke' };
  }
}

/**
 * A press on the world under the home page. A click starts automata (in test mode,
 * switching to it if the toolbar left another kind showing) and dragging starts
 * more; on a touch screen a tap does, so that a swipe can still scroll the page.
 */
function pagePointerDown(e, x, y) {
  if (e.pointerType === 'touch') gesture = { kind: 'tap', x, y };
  else if (e.button === 0) {
    if (app.mode !== 'test') setMode('test');
    const at = cellAt(x, y);
    spawnAt(...at);
    gesture = { kind: 'spawn', last: at };
  } else gesture = { kind: 'none' };
}

function onPointerMove(e) {
  const [x, y] = localXY(e);
  const p = pointers.get(e.pointerId);
  if (p) {
    p.x = x;
    p.y = y;
  }
  if (gesture?.kind === 'tap') {
    if (Math.hypot(x - gesture.x, y - gesture.y) > 10) gesture = { kind: 'none' };
    return;
  }
  if (gesture?.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    panBy(mx - gesture.mx, my - gesture.my);
    if (gesture.d > 0) zoomAt(mx, my, d / gesture.d);
    Object.assign(gesture, { d, mx, my });
    return;
  }
  const [wx, wy] = toPlane(x, y);
  app.hover = cellAt(x, y);
  dirty.overlay = true;
  if (!gesture || !p) return;
  if (gesture.kind === 'pending' && Math.hypot(x - gesture.x, y - gesture.y) > gesture.slop) {
    strokeBegin(gesture.cx, gesture.cy);
    gesture = { kind: 'stroke' };
  }
  if (gesture.kind === 'spawn') {
    const [cx, cy] = app.hover;
    if (cx !== gesture.last[0] || cy !== gesture.last[1]) {
      spawnAt(cx, cy, { fresh: false });
      gesture.last = [cx, cy];
    }
  } else if (gesture.kind === 'pan') {
    panBy(x - gesture.x, y - gesture.y);
    gesture.x = x;
    gesture.y = y;
  } else if (gesture.kind === 'stroke') {
    for (const ev of e.getCoalescedEvents?.() || [e]) {
      const [cx, cy] = cellAt(...localXY(ev));
      // A stroke that started off the world begins where it first reaches it.
      if (!stroke) strokeBegin(cx, cy);
      else strokeTo(cx, cy);
    }
  } else if (gesture.kind === 'line') {
    app.linePreview = [gesture.x0, gesture.y0, ...app.hover];
  } else if (gesture.kind === 'ant') antAim(wx, wy);
}

function onPointerUp(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture?.kind === 'pinch') {
    if (pointers.size < 2) gesture = pointers.size ? { kind: 'none' } : null;
    return;
  }
  if (pointers.size) return;
  if (gesture?.kind === 'tap' && e.type === 'pointerup') {
    if (app.mode !== 'test') setMode('test');
    spawnAt(...cellAt(gesture.x, gesture.y));
  } else if (gesture?.kind === 'stroke') strokeEnd();
  else if (gesture?.kind === 'ant') antEnd();
  else if (gesture?.kind === 'pending' && e.type === 'pointerup') (cur().kind === 'turing' ? headPlace : antPlace)(gesture.cx, gesture.cy);
  else if (gesture?.kind === 'line' && app.linePreview) {
    drawLine(...app.linePreview);
    app.linePreview = null;
  }
  rootEl.classList.remove('grabbing');
  gesture = null;
  if (e.pointerType === 'touch') app.hover = null;
  dirty.overlay = true;
}

function onWheel(e) {
  e.preventDefault();
  const [x, y] = localXY(e);
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;
  else if (e.deltaMode === 2) dy *= app.screen.h;
  // Scrolling zooms around the pointer; a trackpad pinch arrives as ctrl+wheel with small steps.
  zoomAt(x, y, Math.exp(-clamp(dy, -240, 240) * (e.ctrlKey ? 0.012 : 0.0022)));
}

const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function onKeyDown(e) {
  // Open dialogs keep the keyboard to themselves, and close on Escape by themselves.
  if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
  // Under the home page the keys belong to the page: space scrolls, and nothing changes the world unseen.
  if (underPage()) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod && k === 'z' && !typing(e.target)) {
    e.preventDefault();
    return e.shiftKey ? redo() : undo();
  }
  if (mod && k === 'y' && !typing(e.target)) {
    e.preventDefault();
    return redo();
  }
  if (mod || e.altKey || typing(e.target)) return;
  if (e.key === ' ') {
    const onButton = e.target.closest?.('button, [role="slider"], [role="radio"], a');
    if (onButton) return;
    e.preventDefault();
    if (!e.repeat) space = { panned: false };
    rootEl.classList.add('grab');
    return;
  }
  const by = e.shiftKey ? 100 : 1;
  const actions = {
    arrowright: () => stepOnce(by),
    arrowleft: () => stepBack(by),
    '.': () => stepOnce(by),
    ',': () => stepBack(by),
    r: reset,
    backspace: reset,
    delete: reset,
    n: reseed,
    d: randomRule,
    '=': () => zoomStep(1),
    '+': () => zoomStep(1),
    '-': () => zoomStep(-1),
    _: () => zoomStep(-1),
    0: fit,
    f: fit,
    '[': () => setSpeed(app.speed - 1),
    ']': () => setSpeed(app.speed + 1),
    g: () => setGridlines(!app.gridlines),
    1: () => setMode('life'),
    2: () => setMode('eca'),
    3: () => setMode('ant'),
    4: () => setMode('test'),
    5: () => setMode('turing'),
    6: () => setMode('interesting'),
    c: () => ui.toggleConfigs(),
    '?': () => ui.toggleHelp(),
    escape: () => {
      cancelCatchUp();
      ui.closeOverlays();
    },
  };
  const fn = actions[k];
  if (fn) {
    if (k !== 'escape') e.preventDefault();
    fn();
  }
}

function onKeyUp(e) {
  if (e.key === ' ' && space) {
    if (!space.panned) togglePlay();
    space = null;
    rootEl.classList.remove('grab');
  }
}

function setGridlines(on) {
  app.gridlines = on;
  storage('automata.grid', on);
  dirty.draw = true;
  ui.updateWorld();
}

// ---------------------------------------------------------------- drawing the overlay

function drawOverlay() {
  const doc = cur(), { w, h, dpr } = app.screen;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  const z = doc.view.zoom, [ox, oy] = origin(doc);
  const sx = (x) => (x - ox) * z, sy = (y) => (y - oy) * z;
  const ink = app.theme === 'dark' ? '#f4f3ee' : '#161615';

  const plane = app.linePreview ? [...line(...app.linePreview)] : app.hover && pointers.size < 2 && !gesture?.kind?.startsWith('p') && !underPage() ? [app.hover] : [];
  const cells = plane.map(([x, y]) => [x - doc.world.ox, y - doc.world.oy]);
  if (cells.length && z >= 3) {
    octx.fillStyle = ink;
    octx.globalAlpha = app.linePreview ? 0.28 : 0.16;
    for (const [x, y] of cells) if (inside(doc, x, y)) octx.fillRect(sx(x), sy(y), z, z);
    octx.globalAlpha = 1;
    const [hx, hy] = cells[cells.length - 1];
    if (inside(doc, hx, hy) && z >= 6) {
      octx.strokeStyle = ink;
      octx.lineWidth = 1;
      octx.strokeRect(sx(hx) + 0.5, sy(hy) + 0.5, z - 1, z - 1);
    }
  }

  if (doc.kind === 'ant') {
    const world = doc.world, hv = app.hover && [app.hover[0] - world.ox, app.hover[1] - world.oy];
    for (let k = 0; k < world.count; k++) {
      const x = world.ax[k], y = world.ay[k];
      // Which way an ant faces shows only while it is pointed at or aimed.
      const pointed = antDrag?.k === k || (!gesture && hv && hv[0] === x && hv[1] === y);
      drawAnt(sx(x), sy(y), z, world.alive[k], pointed ? world.ad[k] : -1);
    }
    // Where a click would put a new ant.
    if (hv && !gesture && inside(doc, hv[0], hv[1]) && world.antAt(hv[0], hv[1]) < 0) {
      octx.globalAlpha = 0.35;
      drawAnt(sx(hv[0]), sy(hv[1]), z, 1, -1);
      octx.globalAlpha = 1;
    }
  }
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** An ant is a dot in its cell. With glow turned on, a soft halo helps find it from far away. */
function drawAnt(x, y, z, alive, dir) {
  const c = octx, cx = x + z / 2, cy = y + z / 2, a = c.globalAlpha;
  const r = Math.max(1.5, z * 0.32);
  c.fillStyle = app.antColor;
  if (app.antGlow) {
    c.globalAlpha = a * 0.28;
    c.beginPath();
    c.arc(cx, cy, Math.max(9, z), 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = a * (alive ? 1 : 0.4);
  if (z < 6) {
    // Small cells are too small for a round dot: the ant's whole cell takes its color, at least a pixel or two.
    const s = Math.max(z, 2), d = app.screen.dpr;
    c.fillRect(Math.round((cx - s / 2) * d) / d, Math.round((cy - s / 2) * d) / d, Math.round(s * d) / d, Math.round(s * d) / d);
    c.globalAlpha = a;
    return;
  }
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  // A hairline ring keeps the dot visible on a cell of its own color.
  c.strokeStyle = app.theme === 'dark' ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.8)';
  c.lineWidth = 1;
  c.stroke();
  if (dir >= 0 && z >= 8) {
    const [dx, dy] = DIRS[dir];
    c.strokeStyle = app.antColor;
    c.lineWidth = Math.max(1.5, z * 0.08);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx + dx * r, cy + dy * r);
    c.lineTo(cx + dx * z * 0.5, cy + dy * z * 0.5);
    c.stroke();
  }
  c.globalAlpha = a;
}

// ---------------------------------------------------------------- the loop

let lastFrame = 0;
// Set when the GPU's copy of the world can't be patched line by line: another world was showing, or the context was lost.
let uploadAll = true;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastFrame ? Math.min(100, now - lastFrame) : 16.7;
  lastFrame = now;
  app.frameMs = app.frameMs ? app.frameMs * 0.9 + dt * 0.1 : dt;
  const doc = cur();
  stepViewAnim(now);
  if (app.catchUp) runCatchUp(Math.max(24, app.frameMs * 1.6));
  else if (app.playing && spawns(doc.kind)) advanceTest(doc, dt);
  else if (app.playing) advance(doc, dt);
  measureRate(doc, now);
  if (dirty.world) {
    // Test worlds say which lines changed, so a huge one doesn't go to the GPU whole every frame.
    const w = doc.world, rows = w.takeRows?.();
    renderer.upload(w.grid, w.W, w.H, uploadAll ? null : rows);
    uploadAll = false;
    dirty.world = false;
    dirty.draw = true;
  }
  if (dirty.draw) {
    const { dpr } = app.screen, [ox, oy] = origin(doc), cell = doc.view.zoom * dpr;
    renderer.draw({
      originX: ox,
      originY: oy,
      cell,
      dpr,
      rowOffset: doc.world.rowOffset ?? 0,
      gridAlpha: app.gridlines ? clamp((doc.view.zoom - 5) / 7, 0, 1) : 0,
      open: app.unbounded,
    });
    dirty.draw = false;
  }
  if (dirty.overlay) {
    dirty.overlay = false;
    drawOverlay();
  }
  ui.tick(now);
}

function measureRate(doc, now) {
  const r = doc.rate;
  const running = app.playing || app.catchUp;
  if (!running) {
    r.value = 0;
    r.t = 0;
    return;
  }
  if (!r.t) {
    r.t = now;
    r.gen = doc.world.gen;
  } else if (now - r.t >= 500) {
    r.value = ((doc.world.gen - r.gen) / (now - r.t)) * 1000;
    r.t = now;
    r.gen = doc.world.gen;
  }
}

// ---------------------------------------------------------------- links and the library

/** Everything a link or a saved world needs: the rule, the colors and the world exactly as it is. */
function stateOf(doc) {
  const w = doc.world, p = paletteById(doc.palette.id);
  const s = {
    mode: doc.kind,
    rule: doc.kind === 'life' ? formatLifeRule(w.rule).replace('/', '') : doc.K.format(w.rule),
    W: w.W,
    H: w.H,
    ox: w.ox,
    oy: w.oy,
    wrap: w.wrap,
    // Your own palettes travel as their colors, since nobody else has them.
    palette: p && !p.custom ? { id: p.id } : { colors: docColors(doc).slice(0, Math.max(2, w.states)) },
    states: w.states,
    gen: w.gen,
    grid: w.grid,
    // An untouched random fill travels as the seed that made it.
    recipe: doc.recipe && w.gen === doc.seed.gen ? doc.recipe : null,
    view: doc.view,
  };
  if (doc.kind === 'ant') {
    s.ants = [];
    for (let k = 0; k < w.count; k++) s.ants.push({ x: w.ax[k], y: w.ay[k], d: w.ad[k], s: w.as[k], alive: w.alive[k] });
  }
  // The picture shows the head in its state's color, so the color under it travels separately.
  if (doc.kind === 'turing') s.head = { x: w.head, s: w.state, c: w.tape[w.head], halted: w.halted };
  return s;
}

/** Puts a decoded link or saved world into its kind's document, as a change that can be undone. */
async function applyState(s) {
  const K = KINDS[s.mode], doc = app.docs[s.mode];
  const rule = K.parse(s.rule);
  if (rule == null) return false;
  const W = clamp(s.W, SIDE_MIN, SIDE_MAX), H = clamp(s.H, SIDE_MIN, SIDE_MAX);
  // Build the world in a scratch world of the right size and rule, then restore it as a snapshot.
  const scratch = K.make(W, H);
  scratch.wrap = s.wrap;
  scratch.setRule(rule);
  scratch.clear();
  const recipe = gridRecipe(s.data);
  if (recipe) {
    if (s.mode === 'life') scratch.randomize(recipe.density, rng(recipe.seed), recipe.area);
    else scratch.randomize(recipe.density, rng(recipe.seed));
  } else {
    const cells = await gridCells(s.data, W * H, scratch.states);
    if (cells) scratch.grid.set(cells);
  }
  if (s.mode === 'ant') {
    scratch.count = 0;
    for (const a of s.ants) {
      if (a.x < 0 || a.y < 0 || a.x >= W || a.y >= H) continue;
      const k = scratch.addAnt(a.x, a.y, a.d, a.s);
      if (k >= 0) scratch.alive[k] = a.alive ? 1 : 0;
    }
  }
  scratch.gen = s.gen;
  scratch.ox = s.ox;
  scratch.oy = s.oy;
  if (s.mode === 'turing' && s.head && !recipe) scratch.readTape(s.head.x, s.head.s, s.head.c, s.head.halted);
  pause();
  cancelCatchUp();
  remember(doc, 'load');
  doc.world.setRule(rule);
  doc.world.wrap = s.wrap && !app.unbounded;
  doc.world.restore(scratch.snapshot());
  if (s.palette?.id && paletteById(s.palette.id)) doc.palette = { id: s.palette.id, colors: null };
  else if (s.palette?.colors) doc.palette = { id: null, colors: s.palette.colors };
  doc.preset = matchPreset(doc);
  doc.cost = K.cost(doc.world);
  commitSeed(doc, recipe);
  if (s.view) {
    doc.view = { ...s.view };
    clampView(doc);
  } else doc.view = fitView(doc);
  if (app.mode !== s.mode) {
    // The new world brings its own view; keep it rather than carrying the old one over.
    const view = doc.view;
    setMode(s.mode, { fresh: false });
    doc.view = view;
  }
  touched(doc, { rule: true, size: true });
  return true;
}

let lastHash = '';

async function share() {
  const doc = cur();
  if (spawns(doc.kind)) return toast('Nothing to link to here: every click starts something new');
  const url = encodeState(stateOf(doc)).then((hash) => {
    // From the home page, a link opens the world in the app on its own.
    if (app.site) return new URL(`automata/#${hash}`, location.href).href;
    lastHash = '#' + hash;
    history.replaceState(null, '', lastHash);
    return location.href;
  });
  let copied = false;
  try {
    // Safari only allows clipboard writes that start inside the click, so hand it a promise.
    if (typeof ClipboardItem === 'function' && ClipboardItem.supports?.('text/plain') !== false) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': url.then((u) => new Blob([u], { type: 'text/plain' })) })]);
      copied = true;
    }
  } catch {}
  if (!copied) {
    try {
      await navigator.clipboard.writeText(await url);
      copied = true;
    } catch {}
  }
  const link = await url;
  const kb = Math.round(link.length / 102.4) / 10;
  if (copied) toast(link.length > 8000 ? `Link copied (${kb} KB, which some apps cut short)` : 'Link copied');
  else ui.showLink(link);
}

async function loadHash(hash) {
  let s;
  try {
    s = await decodeState(hash);
  } catch (err) {
    console.warn(err);
  }
  return !!s && applyState(s);
}

// Your library: saved worlds, kept in this browser.
const savedWorlds = () => storage('automata.saved') || [];

function uniqueName(base) {
  const names = new Set(savedWorlds().map((s) => s.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Saves the world as it is (rule, colors, cells and ants) to your library. */
async function saveToLibrary() {
  const doc = cur(), w = doc.world;
  if (spawns(doc.kind)) return;
  const item = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    kind: doc.kind,
    name: uniqueName(doc.preset >= 0 ? doc.K.presets[doc.preset].name : doc.K.name(w.rule)),
    rule: doc.K.format(w.rule),
    hash: await encodeState(stateOf(doc)),
    thumb: worldThumb(w, docColors(doc), app.antColor),
  };
  if (storage('automata.saved', [item, ...savedWorlds()]) === null) {
    toast('Could not save: this browser’s storage is full');
    return;
  }
  ui.updateLibrary(item.id);
  toast(`Saved ${item.name} to your library`);
}

async function loadSaved(id) {
  const item = savedWorlds().find((s) => s.id === id);
  if (!item) return;
  if (!(await loadHash(item.hash))) toast('That saved world could not be read');
}

function deleteSaved(id) {
  storage('automata.saved', savedWorlds().filter((s) => s.id !== id));
  ui.updateLibrary();
}

// ---------------------------------------------------------------- toasts

function toast(text, opts) {
  ui?.toast(text, opts);
}

// ---------------------------------------------------------------- boot

function resolveTheme() {
  const t = document.documentElement.dataset.theme;
  return t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme() {
  app.theme = resolveTheme();
  applyColors();
  dirty.overlay = true;
  ui.updateColors();
  ui.refreshThumbs();
}

/** 'auto' follows the system; 'light' and 'dark' stick. */
function setTheme(choice) {
  if (choice === 'light' || choice === 'dark') rootEl.dataset.theme = choice;
  else delete rootEl.dataset.theme;
  storage('automata.theme', rootEl.dataset.theme || null);
  applyTheme();
}

const themeChoice = () => rootEl.dataset.theme || 'auto';

function measureScreen() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  app.screen = { w: Math.max(1, innerWidth), h: Math.max(1, innerHeight), dpr };
  const W = Math.round(app.screen.w * dpr), H = Math.round(app.screen.h * dpr);
  renderer.resize(W, H);
  if (overlay.width !== W || overlay.height !== H) {
    overlay.width = W;
    overlay.height = H;
  }
  for (const doc of Object.values(app.docs)) if (doc.view) clampView(doc);
  dirty.draw = dirty.overlay = true;
}

/** Every world starts clean, the same size, under the first rule in its library: Life-like and 1D worlds empty, an ant world with one ant. */
function initDocs() {
  const [W, H] = defaultSize();
  app.size = [W, H];
  for (const kind of Object.keys(KINDS)) {
    const doc = createDoc(kind, W, H);
    app.docs[kind] = doc;
    if (doc.K.presets.length) {
      doc.world.setRule(doc.K.presetRule(doc.K.presets[0]));
      doc.preset = 0;
    }
    doc.world.clear();
    commitSeed(doc);
    doc.view = startView(doc);
  }
}

async function boot() {
  mountShell({ home: !app.site });
  overlay = $('#overlay');
  octx = overlay.getContext('2d');
  renderer = createRenderer($('#gl'));
  renderer.onrestore = () => {
    applyColors();
    uploadAll = true;
    dirty.world = true;
  };
  rootEl.dataset.renderer = renderer.kind;

  // The home page is always dark, and its canvas always unbounded.
  const savedTheme = app.site ? null : storage('automata.theme');
  if (savedTheme === 'light' || savedTheme === 'dark') rootEl.dataset.theme = savedTheme;
  app.theme = resolveTheme();
  app.gridlines = storage('automata.grid') ?? true;
  app.antColor = storage('automata.antColor') || ANT_COLOR;
  app.antGlow = storage('automata.antGlow') === true;
  app.unbounded = app.site || storage('automata.unbounded') === true;
  setCustomPalettes((storage('automata.palettes') || []).map((p) => ({ ...p, custom: true })));

  ui = createUI(api);
  measureScreen();
  initDocs();
  if (app.unbounded) for (const doc of Object.values(app.docs)) openWorld(doc);

  // The home page always opens on test mode.
  const saved = storage('automata.mode');
  const start = app.site ? 'test' : KINDS[saved] ? saved : 'ant';
  // Every kind runs at the speed of the one the app opens on, until you choose another.
  app.speed = app.site ? SITE_SPEED : KINDS[start].speed;
  app.mode = null;
  setMode(start, { fresh: false });

  // Links to worlds open in the app on its own; on the home page a hash is just an anchor.
  if (app.site) welcome();
  else if (location.hash.length > 1) {
    lastHash = location.hash;
    if (!(await loadHash(location.hash))) toast('That link could not be read');
  } else if (app.mode === 'ant') play();

  addEventListener('resize', measureScreen);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  if (!app.site) {
    addEventListener('hashchange', () => {
      if (location.hash !== lastHash && location.hash.length > 1) {
        lastHash = location.hash;
        loadHash(location.hash);
      }
    });
  }
  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp);
  overlay.addEventListener('pointercancel', onPointerUp);
  overlay.addEventListener('pointerleave', () => {
    if (!gesture) {
      app.hover = null;
      dirty.overlay = true;
    }
  });
  overlay.addEventListener('wheel', onWheel, { passive: false });
  // On the home page the wheel zooms the world from anywhere on the page, the text included,
  // unless the window is too short for the text and the page has more of it to scroll to.
  if (app.site) {
    addEventListener(
      'wheel',
      (e) => {
        if (!underPage() || e.target === overlay) return;
        if (document.documentElement.scrollHeight <= innerHeight + 1) onWheel(e);
      },
      { passive: false },
    );
  }
  overlay.addEventListener('contextmenu', (e) => underPage() || e.preventDefault());
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => {
    space = null;
    rootEl.classList.remove('grab', 'grabbing');
  });
  requestAnimationFrame(frame);
}

/**
 * The home page opens with one automaton drawing itself in the open part of the
 * page, kept until the first click. Not when motion is unwelcome, though.
 */
function welcome() {
  if (prefersReducedMotion()) return;
  setTimeout(() => {
    const doc = cur(), { w, h } = app.screen;
    if (doc.kind !== 'test' || doc.world.serial) return; // someone got there first
    const fx = w < 700 ? 0.35 + Math.random() * 0.3 : 0.62 + Math.random() * 0.22;
    const [px, py] = toPlane(w * fx, h * (0.1 + Math.random() * 0.12));
    spawnAt(Math.floor(px), Math.floor(py));
  }, 400);
}

// Everything the interface needs from the app.
const api = {
  app,
  KINDS,
  SPEEDS,
  SIDE_MAX,
  cur,
  docColors,
  colorsFor,
  play,
  pause,
  togglePlay,
  stepOnce,
  stepBack,
  reset,
  reseed,
  undo,
  redo,
  setRule,
  randomRule,
  loadPreset,
  setWrap,
  resizeWorld,
  setSpeed,
  setMode,
  setPalette,
  setColor,
  deletePalette,
  setSetting,
  setGridlines,
  setAntColor,
  setAntGlow,
  setUnbounded,
  fastForward,
  spawnAt,
  /** Draws under a point on the screen, as a click on the world would: for the home page's words, which take the clicks themselves. */
  drawAt(sx, sy) {
    if (!underPage()) return;
    if (app.mode !== 'test') setMode('test');
    spawnAt(...cellAt(sx, sy));
  },
  machineColors,
  spawns,
  testLog: () => (spawns(app.mode) ? cur().world.log : []),
  fit,
  zoomStep,
  share,
  setTheme,
  themeChoice,
  savedWorlds,
  saveToLibrary,
  loadSaved,
  deleteSaved,
  fitWorldToScreen() {
    resizeWorld(...defaultSize());
    animateView(cur(), startView(cur()));
  },
  refreshNearby() {
    cur().nearbySeed = randomSeed();
  },
  panelChanged() {
    dirty.overlay = true;
  },
  /** The world point in the middle of the part of the window nothing covers. */
  viewFocus: () => toPlane(...visibleCenter()),
  /** Slides the view to put a world point back in the middle of the uncovered part. */
  refocus([wx, wy]) {
    const doc = cur();
    animateView(doc, centeredOn(doc.view, wx, wy), 220);
  },
};

// A handle for tinkering from the console: automata.cur().world, automata.setRule(…), …
globalThis.automata = api;

boot();
