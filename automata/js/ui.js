// The interface around the world: the toolbar in the top-left corner, and the
// configs card it opens on the right, holding the rule, the settings, and (pulled
// down to the full height of the window) nearby rules and the library.
//
// Under the home page the toolbar starts folded, and folding it is how you get back
// to the page: opening it puts the page away and leaves just the world.

import { h, $, $$, formatInt, formatCompact, parseCount, rng, storage } from './util.js';
import { icon } from './icons.js';
import { lifeEditor, elementaryEditor, antEditor, turingEditor } from './editors.js';
import { PALETTES, paletteColors, customPalettes } from './palettes.js';
import { ThumbQueue, THUMB, lifeThumb, elementaryThumb, antThumb, turingThumb } from './thumbs.js';
import { TEST_PALETTES, MIN_COLORS, MAX_COLORS, SWEEPS, testInks } from './test.js';
import { openPicker, closePicker, pickerOpen } from './picker.js';

const NARROW = 640;

export function createUI(api) {
  const { app, KINDS, SPEEDS } = api;
  const root = document.documentElement;
  const thumbs = new ThumbQueue(5);
  const els = {
    toolbar: $('.toolbar'),
    fold: $('#fold'),
    back: $('#back'),
    play: $('#play'),
    step: $('#step'),
    speed: $('#speed'),
    speedOut: $('#speed-out'),
    undo: $('#undo'),
    reset: $('#reset'),
    configs: $('#configs'),
    configsToggle: $('#configs-toggle'),
    tallToggle: $('#tall-toggle'),
    settingsToggle: $('#settings-toggle'),
    settings: $('#settings'),
    browse: $('#browse'),
    ruleText: $('#rule-text'),
    ruleName: $('#rule-name'),
    rulePrev: $('#rule-prev'),
    ruleNext: $('#rule-next'),
    ruleEditor: $('#rule-editor'),
    thumbs: $('#thumbs'),
    thumbsEmpty: $('#thumbs-empty'),
    shuffle: $('#shuffle'),
    swatches: $('#swatches'),
    palettes: $('#palettes'),
    paletteCustom: $('#palette-custom'),
    display: $('#display'),
    world: $('#world'),
    start: $('#start'),
    gen: $('#gen'),
    genLabel: $('#gen-label'),
    pop: $('#pop'),
    popLabel: $('#pop-label'),
    rate: $('#rate'),
    progress: $('#progress'),
    toasts: $('#toasts'),
    help: $('#help-dialog'),
    link: $('#link-dialog'),
    overlay: $('#overlay'),
  };

  $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));

  // A press with the mouse or a finger shouldn't leave focus on a button or slider, or the
  // space bar would press it again instead of playing and pausing.
  addEventListener('pointerup', () => {
    const a = document.activeElement;
    if (a?.matches('button, input[type="range"]')) a.blur();
  });

  const narrow = () => innerWidth <= NARROW;
  const has = (name) => root.classList.contains(name);

  // ---------------------------------------------------------------- toolbar

  function setFolded(folded) {
    root.classList.toggle('toolbar-folded', folded);
    els.fold.setAttribute('aria-expanded', String(!folded));
    const label = app.site ? (folded ? 'Play with the automata' : 'Back to the page') : folded ? 'Show the toolbar' : 'Hide the toolbar';
    els.fold.setAttribute('aria-label', label);
    els.fold.title = label;
    els.fold.innerHTML = icon(folded ? 'right' : 'left');
    if (!app.site) storage('automata.toolbar', !folded);
    else if (folded) {
      // Back on the page: everything that floated over the world goes with the toolbar.
      setConfigs(false);
      if (els.help.open) els.help.close();
    }
    api.panelChanged();
  }
  els.fold.addEventListener('click', () => setFolded(!has('toolbar-folded')));

  $$('.types [data-mode]').forEach((b) => b.addEventListener('click', () => api.setMode(b.dataset.mode)));
  els.back.addEventListener('click', (e) => api.stepBack(e.shiftKey ? 100 : 1));
  els.play.addEventListener('click', () => api.togglePlay());
  els.step.addEventListener('click', (e) => api.stepOnce(e.shiftKey ? 100 : 1));
  els.undo.addEventListener('click', () => api.undo());
  els.reset.addEventListener('click', () => api.reset());
  els.speed.max = SPEEDS.length - 1;
  els.speed.addEventListener('input', () => api.setSpeed(+els.speed.value));
  // The speed shows under the slider while it is dragged, even on touch screens.
  const speedLabel = els.speed.parentElement;
  els.speed.addEventListener('pointerdown', () => {
    speedLabel.classList.add('dragging');
    addEventListener('pointerup', () => speedLabel.classList.remove('dragging'), { once: true });
  });

  // ---------------------------------------------------------------- the configs card

  const configsOpen = () => has('configs-open');

  /**
   * Opens or closes the configs. It stays open until its button is pressed again,
   * whatever else is clicked. On a narrow screen it is a sheet over the lower part
   * of the world, and the view slides to keep what was in the middle in sight.
   */
  function setConfigs(open) {
    if (configsOpen() === open) return;
    const focus = narrow() ? api.viewFocus() : null;
    root.classList.toggle('configs-open', open);
    els.configsToggle.setAttribute('aria-expanded', String(open));
    if (open && !els.settings.hidden && settingsDirty) buildSettings();
    if (!open) closePicker(false);
    if (focus) api.refocus(focus);
    api.panelChanged();
  }
  els.configsToggle.addEventListener('click', () => setConfigs(!configsOpen()));

  /** Pulled down, the card reaches the bottom of the window and shows nearby rules and the library. */
  function setTall(tall) {
    const focus = narrow() && configsOpen() ? api.viewFocus() : null;
    root.classList.toggle('configs-tall', tall);
    els.browse.hidden = !tall;
    els.tallToggle.setAttribute('aria-expanded', String(tall));
    els.tallToggle.title = tall ? 'Hide nearby rules and the library' : 'Nearby rules and the library';
    if (tall) buildThumbs();
    if (focus) api.refocus(focus);
    api.panelChanged();
  }
  els.tallToggle.addEventListener('click', () => setTall(!has('configs-tall')));

  function setSettingsOpen(open) {
    els.settings.hidden = !open;
    els.settingsToggle.setAttribute('aria-expanded', String(open));
    if (open && settingsDirty) buildSettings();
    if (!open) closePicker(false);
  }
  els.settingsToggle.addEventListener('click', () => setSettingsOpen(els.settings.hidden));

  // A click on the world that only closes the color picker does nothing more.
  addEventListener(
    'pointerdown',
    (e) => {
      if (pickerOpen() && e.target === els.overlay) e.stopPropagation();
    },
    true,
  );

  /** Screen space the toolbar and the configs cover, so the view can center things in what is left. */
  function insets() {
    const edge = parseFloat(getComputedStyle(root).getPropertyValue('--edge')) || 0;
    const top = els.toolbar.offsetTop + els.toolbar.offsetHeight;
    if (!configsOpen()) return { top, right: 0, bottom: 0 };
    // offsetTop ignores the few pixels the card slides while it opens.
    if (narrow()) return { top, right: 0, bottom: Math.max(0, innerHeight - els.configs.offsetTop + edge) };
    return { top, right: els.configs.offsetWidth + 2 * edge, bottom: 0 };
  }

  $('#share').addEventListener('click', () => api.share());
  $('#help').addEventListener('click', () => toggleHelp());
  $('#save').addEventListener('click', () => api.saveToLibrary());

  // ---------------------------------------------------------------- rule

  els.ruleText.addEventListener('input', () => {
    const doc = api.cur();
    const rule = doc.K.parse(els.ruleText.value);
    els.ruleText.setAttribute('aria-invalid', String(rule == null));
    if (rule != null) api.setRule(rule, { coalesce: true });
  });
  els.ruleText.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === 'Escape') && els.ruleText.blur());
  els.ruleText.addEventListener('blur', () => {
    els.ruleText.removeAttribute('aria-invalid');
    syncRuleText(true);
  });
  els.rulePrev.addEventListener('click', () => api.setRule((api.cur().world.rule + 255) % 256, { coalesce: true }));
  els.ruleNext.addEventListener('click', () => api.setRule((api.cur().world.rule + 1) % 256, { coalesce: true }));
  $('#dice').addEventListener('click', () => api.randomRule());
  els.shuffle.addEventListener('click', () => {
    api.refreshNearby();
    buildThumbs();
  });

  let editor = null;

  function setMode(kind) {
    $$('.types [data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === kind)));
    root.dataset.mode = kind;
    // A drag across several Life keys is one change to undo.
    editor =
      kind === 'life'
        ? lifeEditor((r, more) => api.setRule(r, { coalesce: more }))
        : kind === 'eca'
          ? elementaryEditor((r) => api.setRule(r))
          : kind === 'ant'
            ? antEditor((r) => api.setRule(r))
            : kind === 'turing'
              ? turingEditor((r) => api.setRule(r))
              : { el: h('div'), update() {} }; // test mode has no rule
    if (api.spawns(kind) && has('configs-tall')) setTall(false);
    if (api.spawns(kind)) buildTestPanel();
    els.ruleEditor.replaceChildren(editor.el);
    els.genLabel.textContent = KINDS[kind].unit;
    els.popLabel.textContent = { eca: 'Line', ant: 'Painted', test: 'Lit', interesting: 'Lit', turing: 'Marks' }[kind] || 'Alive';
    els.ruleText.setAttribute('aria-label', { life: 'Rule in B/S notation', eca: 'Rule number, 0 to 255', ant: 'Ant turns, or a turmite in digit notation', turing: 'Machine in Busy Beaver Challenge notation' }[kind] || 'Rule');
    thumbs.clear();
    thumbsKey = '';
    updateLists();
    progress(null);
    updateRule();
    updateColors();
    updateSpeed();
    updatePlay();
    updateHistory();
    updateStats(true);
  }

  function syncRuleText(force) {
    const doc = api.cur();
    if (!force && document.activeElement === els.ruleText) return;
    els.ruleText.value = doc.K.format(doc.world.rule);
  }

  let shownColors = 0;

  function updateRule() {
    const doc = api.cur();
    const colors = api.docColors(doc);
    editor.update(doc.world.rule, colors);
    // Elementary rules are named by their number, which the field already shows.
    els.ruleName.textContent = doc.preset >= 0 && doc.kind !== 'eca' ? doc.K.presets[doc.preset].name : '';
    syncRuleText(false);
    buildThumbs();
    if (colors.length !== shownColors) refreshSettings();
  }

  // ---------------------------------------------------------------- nearby rules and the library

  let list = ['nearby', 'yours', 'famous'].includes(storage('automata.list')) ? storage('automata.list') : 'nearby';
  $$('.lists [data-list]').forEach((b) =>
    b.addEventListener('click', () => {
      list = b.dataset.list;
      storage('automata.list', list);
      updateLists();
      buildThumbs();
    }),
  );

  function updateLists() {
    $$('.lists [data-list]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.list === list)));
    els.shuffle.hidden = list !== 'nearby' || app.mode === 'eca';
  }

  function thumbSettings(doc) {
    if (doc.kind === 'life') {
      // A patch in the middle shows a rule's character (explodes, freezes, dies) far better
      // than a full soup, which makes every rule look like the same noise at this size.
      const s = doc.settings;
      return s.style === 'dot' ? { single: true } : { density: s.density, area: s.style === 'patch' ? Math.max(s.patch, 0.2) : 0.45 };
    }
    if (doc.kind === 'eca') return doc.settings.style === 'random' ? { random: doc.settings.density } : 'single';
    return Math.min(Math.max(doc.world.gen || 30000, 20000), 250000);
  }

  function renderThumb(canvas, doc, rule, seed) {
    thumbs.add(() => {
      if (!canvas.isConnected) return;
      // Ant previews get as many colors as their own rule uses; a Turing machine's, its head's too.
      const colors = doc.kind === 'turing' ? api.machineColors(doc, rule) : api.colorsFor(doc, doc.kind === 'ant' ? rule.colors : 2);
      // One cell is shown at generation 47: rules like B1/S1 collapse to a few cells every 16 generations.
      if (doc.kind === 'life') lifeThumb(canvas, rule, colors, seed, seed.single ? 47 : 72);
      else if (doc.kind === 'eca') elementaryThumb(canvas, rule, colors, seed);
      else if (doc.kind === 'turing') turingThumb(canvas, rule, colors);
      else antThumb(canvas, rule, colors, seed, app.antColor);
    });
  }

  function thumbTile({ label, sub, current, onclick, image }) {
    const art = image ? h('img', { src: image, alt: '' }) : h('canvas', { width: THUMB, height: THUMB, 'aria-hidden': 'true' });
    const btn = h(
      'button.thumb',
      { type: 'button', 'aria-label': sub ? `${label}, ${sub}` : label, 'aria-current': current ? 'true' : null, onclick },
      art,
      h('span.thumb-cap', { 'aria-hidden': 'true' }, h('span.thumb-name', { text: label }), sub ? h('span.thumb-sub', { text: sub }) : null),
    );
    return { btn, canvas: image ? null : art };
  }

  let thumbsKey = '';
  function buildThumbs() {
    if (els.browse.hidden) return;
    const doc = api.cur();
    const looks = `${doc.kind}|${app.theme}|${JSON.stringify(api.colorsFor(doc, 4))}|${app.antColor}`;
    const key =
      list === 'nearby'
        ? `nearby|${looks}|${doc.K.format(doc.world.rule)}|${doc.nearbySeed}|${JSON.stringify(doc.settings)}`
        : list === 'yours'
          ? `yours|${looks}|${api.savedWorlds().map((s) => s.id).join()}`
          : `famous|${looks}`;
    if (key !== thumbsKey) {
      thumbsKey = key;
      thumbs.clear();
      const tiles = list === 'nearby' ? nearbyTiles(doc) : list === 'yours' ? yourTiles(doc) : famousTiles(doc);
      els.thumbs.replaceChildren(...tiles);
      els.thumbsEmpty.hidden = tiles.length > 0;
    }
    if (list === 'famous') $$('.thumb', els.thumbs).forEach((t, i) => t.setAttribute('aria-current', String(i === doc.preset)));
  }

  function nearbyTiles(doc) {
    // Nine fill the grid; for elementary rules that is every one-tile change and the mirror image.
    const seed = thumbSettings(doc);
    return doc.K.mutations(doc.world.rule, rng(doc.nearbySeed))
      .slice(0, 9)
      .map((m) => {
        const { btn, canvas } = thumbTile({ label: m.title, sub: m.label, onclick: () => api.setRule(m.rule) });
        renderThumb(canvas, doc, m.rule, seed);
        return btn;
      });
  }

  function famousTiles(doc) {
    return doc.K.presets.map((p, i) => {
      const rule = doc.K.presetRule(p);
      const sub = doc.kind === 'eca' ? null : (p.sub ?? (/^\d+$/.test(p.rule) ? 'turmite' : p.rule));
      const { btn, canvas } = thumbTile({ label: p.name, sub, current: i === doc.preset, onclick: () => api.loadPreset(i) });
      renderThumb(canvas, doc, rule, doc.kind === 'ant' ? p.steps : p.seed);
      return btn;
    });
  }

  /** Worlds you have saved, pictured as they were; an empty one is pictured by its rule. */
  function yourTiles(doc) {
    return api
      .savedWorlds()
      .filter((s) => s.kind === doc.kind)
      .map((s) => {
        const { btn, canvas } = thumbTile({ label: s.name, sub: s.name === s.rule ? null : s.rule, image: s.thumb, onclick: () => api.loadSaved(s.id) });
        if (canvas) {
          const rule = doc.K.parse(s.rule);
          if (rule != null) renderThumb(canvas, doc, rule, thumbSettings(doc));
        }
        const del = h('button.thumb-del', { type: 'button', 'aria-label': `Delete ${s.name}`, title: 'Delete', html: icon('close', 12), onclick: () => api.deleteSaved(s.id) });
        return h('div.thumb-item', null, btn, del);
      });
  }

  /** After a save or delete. A new save shows itself if the library is open. */
  function updateLibrary(newId) {
    if (newId && has('configs-tall') && list !== 'yours') {
      list = 'yours';
      storage('automata.list', list);
      updateLists();
    }
    buildThumbs();
  }

  function refreshThumbs() {
    thumbsKey = '';
    buildThumbs();
  }

  // ---------------------------------------------------------------- settings

  let settingsDirty = true;

  /** Rebuilds the settings now if they are showing, or the next time they show. */
  function refreshSettings() {
    if (configsOpen() && !els.settings.hidden) buildSettings();
    else settingsDirty = true;
  }

  function buildSettings() {
    settingsDirty = false;
    const active = document.activeElement;
    const focusKey = els.settings.contains(active) ? active.dataset.key || active.id : null;
    buildSwatches();
    buildPalettes();
    buildDisplay();
    buildWorld();
    buildStart();
    if (focusKey) (els.settings.querySelector(`[data-key="${focusKey}"]`) || document.getElementById(focusKey))?.focus();
  }

  const row = (label, ...controls) => h('div.row', null, h('span.row-label', { text: label }), ...controls);

  function segmented(name, options, value, onPick) {
    return h(
      'div.segmented',
      { role: 'radiogroup', 'aria-label': name },
      options.map(([v, label, title]) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), title, text: label, dataset: { key: `${name}:${v}` }, onclick: () => onPick(v) }),
      ),
    );
  }

  const toggle = (name, on, onFlip) =>
    h('button.switch', { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': name, dataset: { key: `switch:${name}` }, onclick: () => onFlip(!on) }, h('span'));

  function slider(id, label, value, min, max, step, format, onInput) {
    const out = h('output.row-value', { for: id, text: format(value) });
    const input = h('input', { id, type: 'range', min, max, step, value });
    const fill = () => input.style.setProperty('--fill', `${((+input.value - min) / (max - min)) * 100}%`);
    fill();
    input.addEventListener('input', () => {
      out.textContent = format(+input.value);
      fill();
      onInput(+input.value);
    });
    return h('label.row', { for: id }, h('span.row-label', { text: label }), input, out);
  }

  const pct = (v) => `${Math.round(v * 100)}%`;

  /** A swatch that opens the color picker. */
  function swatch({ color, key, label, onInput, colorNow }) {
    const b = h('button.swatch-btn', {
      type: 'button',
      style: { '--chip': color },
      'aria-label': `${label}: ${color}. Change color`,
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      title: label,
      dataset: { key },
    });
    b.addEventListener('click', () => openPicker({ anchor: b, color: colorNow(), swatches: suggestions(), onInput }));
    return b;
  }

  function buildSwatches() {
    const doc = api.cur();
    if (api.spawns(doc.kind)) return els.swatches.replaceChildren();
    const colors = api.docColors(doc);
    shownColors = colors.length;
    const cells = colors.map((c, i) =>
      swatch({ color: c, key: `swatch:${i}`, label: i === 0 ? 'Empty cells' : `Color ${i}`, onInput: (hex) => api.setColor(i, hex), colorNow: () => api.docColors(api.cur())[i] }),
    );
    // Ants have a color of their own, red unless you pick another.
    if (doc.kind === 'ant') {
      cells.push(
        h(
          'span.ant-swatch',
          null,
          h('span.row-label', { text: 'Ant' }),
          swatch({ color: app.antColor, key: 'swatch:ant', label: 'Ant', onInput: (hex) => api.setAntColor(hex), colorNow: () => app.antColor }),
        ),
      );
    }
    els.swatches.replaceChildren(...cells);
  }

  /** Your own palettes first, each with a way to delete it, then the built-in ones. */
  function buildPalettes() {
    const doc = api.cur();
    if (api.spawns(doc.kind)) return els.palettes.replaceChildren();
    const K = Math.max(doc.world.states, 2);
    const item = (p) => {
      const cols = paletteColors(p, K, app.theme).slice(0, Math.min(Math.max(K, 5), 8));
      const pick = h(
        'button.palette',
        { type: 'button', 'aria-pressed': String(doc.palette.id === p.id), dataset: { key: `palette:${p.id}` }, onclick: () => api.setPalette(p.id) },
        h('span.palette-strip', { 'aria-hidden': 'true' }, cols.map((c) => h('i', { style: { background: c } }))),
        h('span.palette-name', { text: p.name }),
      );
      if (!p.custom) return pick;
      const del = h('button.palette-del', { type: 'button', 'aria-label': `Delete ${p.name}`, title: 'Delete', html: icon('close', 12), onclick: () => api.deletePalette(p.id) });
      return h('div.palette-item', null, pick, del);
    };
    els.palettes.replaceChildren(...customPalettes().map(item), ...PALETTES.map(item));
    els.paletteCustom.hidden = !!doc.palette.id;
  }

  function suggestions() {
    const set = new Set();
    for (const p of PALETTES) for (const c of paletteColors(p, 4, app.theme)) set.add(c);
    return [...set].slice(0, 16);
  }

  function buildDisplay() {
    // The home page is always dark, on an unbounded canvas.
    const rows = [
      app.site ? null : row('Theme', segmented('Theme', [['auto', 'Auto', 'Follow the system'], ['light', 'Light'], ['dark', 'Dark']], api.themeChoice(), (v) => api.setTheme(v))),
      row('Grid lines', toggle('Grid lines', app.gridlines, (on) => api.setGridlines(on))),
      row('Counters', toggle('Counters', countersOn, setCounters)),
      app.site ? null : row('Unbounded canvas', toggle('Unbounded canvas', app.unbounded, (on) => api.setUnbounded(on))),
    ].filter(Boolean);
    if (app.mode === 'ant') rows.push(row('Ant glow', toggle('Ant glow', app.antGlow, (on) => api.setAntGlow(on))));
    els.display.replaceChildren(...rows);
  }

  function buildWorld() {
    const doc = api.cur(), w = doc.world;
    const side = (id, value, label) => {
      const input = h('input.num', { id, type: 'number', min: 8, max: api.SIDE_MAX, value, 'aria-label': label, inputmode: 'numeric' });
      input.addEventListener('change', () => api.resizeWorld(+$('#world-w').value, +$('#world-h').value));
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
      return input;
    };
    // An unbounded canvas has no edges to choose between.
    const rows = [
      row(
        'Size',
        h(
          'span.size',
          null,
          side('world-w', w.W, 'Width in cells'),
          h('span.times', { text: '×', 'aria-hidden': 'true' }),
          side('world-h', w.H, 'Height in cells'),
          h('button.btn.btn-small', { type: 'button', title: 'Fill the window', 'aria-label': 'Fill the window', dataset: { key: 'fill' }, html: icon('expand', 16), onclick: () => api.fitWorldToScreen() }),
        ),
      ),
      row('Edges', segmented('Edges', [['wrap', 'Wrap', 'Opposite edges meet'], ['walls', 'Walls', doc.kind === 'ant' ? 'Ants stop at the edge' : 'Beyond the edge is empty']], w.wrap ? 'wrap' : 'walls', (v) => api.setWrap(v === 'wrap'))),
    ];
    // On an unbounded canvas there are no edges, and test mode's frame sizes itself.
    const shown = !app.unbounded ? rows : api.spawns(doc.kind) ? [] : rows.slice(0, 1);
    els.world.replaceChildren(...shown);
    els.world.closest('.group').hidden = !shown.length;
  }

  function buildStart() {
    const doc = api.cur(), s = doc.settings;
    const rows = [];
    if (doc.kind === 'life') {
      rows.push(row('Seed', segmented('Seed', [['soup', 'Soup', 'Random cells everywhere'], ['patch', 'Patch', 'A random square in the middle'], ['dot', 'Dot', 'One live cell']], s.style, (v) => api.setSetting('style', v))));
      if (s.style !== 'dot') rows.push(slider('seed-density', 'Density', s.density, 0.02, 0.98, 0.01, pct, (v) => (doc.settings.density = v)));
      if (s.style === 'patch') rows.push(slider('seed-patch', 'Patch', s.patch, 0.02, 0.8, 0.01, pct, (v) => (doc.settings.patch = v)));
    } else if (doc.kind === 'eca') {
      rows.push(row('First line', segmented('First line', [['single', 'One cell'], ['random', 'Random']], s.style, (v) => api.setSetting('style', v))));
      if (s.style === 'random') rows.push(slider('seed-density', 'Density', s.density, 0.02, 0.98, 0.01, pct, (v) => (doc.settings.density = v)));
    } else if (doc.kind === 'ant') {
      rows.push(row('Ants', segmented('Ants', [['one', '1'], ['pair', '2'], ['quad', '4'], ['scatter', '12', 'Twelve at random']], s.arrangement, (v) => api.setSetting('arrangement', v))));
      rows.push(slider('seed-noise', 'Noise', s.noise, 0, 0.6, 0.01, pct, (v) => (doc.settings.noise = v)));
    } else if (doc.kind === 'turing') {
      rows.push(row('Tape', segmented('Tape', [['blank', 'Blank'], ['random', 'Random']], s.style, (v) => api.setSetting('style', v))));
      if (s.style === 'random') rows.push(slider('seed-density', 'Density', s.density, 0.02, 0.98, 0.01, pct, (v) => (doc.settings.density = v)));
    }
    rows.push(h('button.ghost-btn.wide', { type: 'button', text: 'New random start', title: 'N', dataset: { key: 'reseed' }, onclick: () => api.reseed() }));
    els.start.replaceChildren(...rows);
  }

  // ---------------------------------------------------------------- test mode

  /** Moves a slider made by slider() to a value, as if it had been dragged there. */
  function setSlider(row, value, text) {
    const input = row.querySelector('input'), { min, max } = input;
    input.value = value;
    input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
    row.querySelector('output').textContent = text;
  }

  /** How test mode paints and fades. The sliders change the world's tuning directly, so they take effect at once. */
  function buildTestPanel() {
    const t = api.cur().settings;
    const seconds = (v) => `${+(v / 1000).toFixed(2)} s`;
    const sweepText = (i) => (SWEEPS[i] === Infinity ? 'Instant' : SWEEPS[i] >= 1000 ? `${SWEEPS[i] / 1000}k/s` : `${SWEEPS[i]}/s`);
    const sweepAt = SWEEPS.findIndex((v) => v >= t.sweep);
    $('#test-draw').replaceChildren(
      row(
        'Drag',
        segmented(
          'Drag',
          [
            ['line', 'Line', 'Dragging draws a line of random cells, and one automaton grows from all of it'],
            ['trail', 'Trail', 'Dragging starts an automaton at every cell along the way'],
          ],
          t.drag,
          (v) => {
            api.setSetting('drag', v);
            buildTestPanel();
          },
        ),
      ),
    );
    $('#test-fade').replaceChildren(
      slider('test-hold', 'Hold', t.hold, 0, 4000, 100, seconds, (v) => (t.hold = v)),
      slider('test-sweep', 'Sweep', sweepAt < 0 ? SWEEPS.length - 1 : sweepAt, 0, SWEEPS.length - 1, 1, sweepText, (i) => (t.sweep = SWEEPS[i])),
      slider('test-fade-ms', 'Fade', t.fade, 100, 3000, 50, seconds, (v) => (t.fade = v)),
      h(
        'div.row',
        { title: 'Keep each drawing until the next one starts' },
        h('span.row-label', { text: 'Persist' }),
        toggle('Persist until the next one is drawn', t.persist, (on) => {
          api.setSetting('persist', on);
          buildTestPanel();
        }),
      ),
    );
    // The fewest and the most colors a new rule may have; each pushes the other along.
    const count = (v) => `${v} colors`;
    const most = slider('test-max', 'Most', t.max, MIN_COLORS, MAX_COLORS, 1, count, (v) => {
      t.max = v;
      if (t.min > v) setSlider(fewest, (t.min = v), count(v));
    });
    const fewest = slider('test-min', 'Fewest', t.min, MIN_COLORS, MAX_COLORS, 1, count, (v) => {
      t.min = v;
      if (t.max < v) setSlider(most, (t.max = v), count(v));
    });
    // Interesting mode's rules come with their own colors; only the palette applies.
    $('#test-colors').replaceChildren(...(app.mode === 'test' ? [fewest, most] : []));
    $('#test-palettes').replaceChildren(
      ...TEST_PALETTES.map((p) =>
        h(
          'button.palette',
          { type: 'button', 'aria-pressed': String(t.palette === p.id), dataset: { key: `test-palette:${p.id}` }, onclick: () => {
            api.setSetting('palette', p.id);
            buildTestPanel();
          } },
          h('span.palette-strip', { 'aria-hidden': 'true' }, p.inks.map((c) => h('i', { style: { background: c } }))),
          h('span.palette-name', { text: p.name }),
        ),
      ),
    );
  }

  /** The rules of the latest spawns, newest first: each rule's number and what each sum of three cells becomes. */
  function updateTestLog() {
    if (!api.spawns(app.mode)) return;
    const inks = testInks(api.cur().settings.palette);
    const log = api.testLog();
    $('#test-log').replaceChildren(
      ...(log.length
        ? log.map(({ rule, code, name: title }, i) => {
            // Highest first, as Wolfram draws them: sums for a totalistic rule, the eight neighborhoods for an elementary one.
            const cases = [...rule.out].map((v, s) => [s, v]).reverse();
            const name = (s) => (rule.tot ? `Sum ${s}` : s.toString(2).padStart(3, '0'));
            return h(
              'div.log-entry',
              { class: i ? '' : 'latest' },
              h('div.log-head', null, h('span.log-code', { text: title || (code ? BigInt(code).toLocaleString('en-US') : `Rule ${rule.number}`), title: title || (code ? `Totalistic code ${code}` : 'Elementary rule') }), h('span.log-meta', { text: [`${rule.k} colors`, rule.r > 1 && `range ${rule.r}`, rule.note].filter(Boolean).join(' · ') })),
              h(
                'div.log-rule',
                { 'aria-label': rule.tot ? 'What each sum of the three cells above becomes' : 'What each pattern of the three cells above becomes' },
                cases.map(([s, v]) => h('i', { style: { background: inks[v] }, title: `${name(s)} → ${v}` })),
              ),
            );
          })
        : [h('p.empty', { text: 'Click anywhere to start one' })]),
    );
  }

  // ---------------------------------------------------------------- colors

  let swatchTimer = 0;
  /** changedIndex: a cell color being dragged in the picker, or -1 for the ant's color. */
  function updateColors(changedIndex) {
    const doc = api.cur();
    if (changedIndex != null) {
      // While dragging in the picker, restyle only the swatch being edited.
      const c = changedIndex < 0 ? app.antColor : api.docColors(doc)[changedIndex];
      els.swatches.querySelector(`[data-key="swatch:${changedIndex < 0 ? 'ant' : changedIndex}"]`)?.style.setProperty('--chip', c);
      if (changedIndex >= 0) buildPalettes();
      clearTimeout(swatchTimer);
      swatchTimer = setTimeout(() => {
        editor.update(doc.world.rule, api.docColors(doc));
        refreshThumbs();
      }, 160);
      return;
    }
    editor?.update(doc.world.rule, api.docColors(doc));
    buildThumbs();
    refreshSettings();
  }

  // ---------------------------------------------------------------- toolbar state

  function updatePlay() {
    const on = app.playing;
    els.play.setAttribute('aria-pressed', String(on));
    els.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    els.play.title = on ? 'Pause (space)' : 'Play (space)';
    els.play.innerHTML = icon(on ? 'pause' : 'play');
  }

  function updateHistory() {
    const doc = api.cur();
    els.undo.disabled = !doc.history.canUndo;
    els.back.disabled = api.spawns(doc.kind) || doc.world.gen <= doc.seed.gen;
  }

  function speedText(doc) {
    const s = SPEEDS[app.speed];
    if (s !== Infinity) return `${formatCompact(s)}/s`;
    // Flat out, say how fast that actually is.
    return doc.rate.value > 0 ? `${formatCompact(doc.rate.value)}/s` : 'Max';
  }

  function updateSpeed() {
    const doc = api.cur();
    const f = app.speed / (SPEEDS.length - 1);
    els.speed.value = app.speed;
    els.speed.style.setProperty('--fill', `${f * 100}%`);
    speedLabel.style.setProperty('--f', f);
    els.speedOut.textContent = speedText(doc);
    els.speed.setAttribute('aria-valuetext', SPEEDS[app.speed] === Infinity ? 'As fast as possible' : `${formatCompact(SPEEDS[app.speed])} steps per second`);
  }

  // ---------------------------------------------------------------- counters

  let countersOn = has('show-counters');

  function setCounters(on) {
    countersOn = on;
    root.classList.toggle('show-counters', on);
    storage('automata.counters', on);
    updateStats(true);
    refreshSettings();
  }

  // The step counter doubles as a way to jump ahead.
  // select() would re-focus the field, so only do it while the field still has focus.
  els.gen.addEventListener('focus', () => requestAnimationFrame(() => document.activeElement === els.gen && els.gen.select()));
  els.gen.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = parseCount(els.gen.value);
      els.gen.blur();
      if (target != null) api.fastForward(target);
    } else if (e.key === 'Escape') els.gen.blur();
  });
  els.gen.addEventListener('blur', () => updateStats(true));

  let lastStats = 0, popCost = 0, lastPop = 0;
  function updateStats(force) {
    const now = performance.now();
    const doc = api.cur(), w = doc.world;
    if (!force && now - lastStats < 110) return;
    lastStats = now;
    els.back.disabled = api.spawns(doc.kind) || w.gen <= doc.seed.gen;
    if (SPEEDS[app.speed] === Infinity) els.speedOut.textContent = speedText(doc);
    if (!countersOn) return;
    if (document.activeElement !== els.gen) els.gen.value = formatInt(w.gen);
    // Counting a huge world takes a moment; do it less often when it's slow.
    if (force || now - lastPop > Math.max(120, popCost * 60)) {
      const t0 = performance.now();
      els.pop.textContent = formatInt(w.population());
      popCost = performance.now() - t0;
      lastPop = now;
    }
    const r = doc.rate.value;
    els.rate.hidden = !(r > 0);
    if (r > 0) els.rate.textContent = `${formatCompact(r)}/s`;
  }

  /** A hairline along the top edge while a run is fast-forwarded or replayed. */
  function progress(p) {
    els.progress.hidden = p == null;
    if (p != null) els.progress.style.setProperty('--p', `${Math.round(Math.min(Math.max(p, 0), 1) * 1000) / 10}%`);
  }

  // ---------------------------------------------------------------- toasts and dialogs

  function toast(text, opts = {}) {
    const t = h('div.toast', { role: 'status' }, h('span', { text }));
    const dismiss = () => {
      t.classList.add('leaving');
      setTimeout(() => t.remove(), 200);
    };
    if (opts.action) {
      t.append(
        h('button.toast-action', {
          type: 'button',
          text: opts.action,
          onclick: () => {
            opts.run();
            dismiss();
          },
        }),
      );
    }
    els.toasts.replaceChildren(t);
    setTimeout(dismiss, opts.action ? 7000 : 3200);
  }

  const clearToasts = () => els.toasts.replaceChildren();

  function showLink(link) {
    const input = $('#link-field');
    input.value = link;
    els.link.showModal();
    input.select();
  }
  $('#link-copy').addEventListener('click', () => {
    const input = $('#link-field');
    input.select();
    navigator.clipboard?.writeText(input.value).then(
      () => toast('Link copied'),
      () => toast('Select the link and copy it with your keyboard'),
    );
  });

  function toggleHelp() {
    if (els.help.open) els.help.close();
    else els.help.showModal();
  }

  /** Escape: the color picker first, then the library, then the configs, and on the home page, back to the page. */
  function closeOverlays() {
    if (pickerOpen()) closePicker();
    else if (configsOpen() && has('configs-tall')) setTall(false);
    else if (configsOpen()) setConfigs(false);
    else if (app.site && !has('toolbar-folded')) setFolded(true);
  }

  for (const dialog of [els.help, els.link]) dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());

  let tickCount = 0;
  function tick() {
    if (app.playing || app.catchUp || ++tickCount % 30 === 0) updateStats(false);
  }

  updateLists();
  setFolded(has('toolbar-folded'));

  return {
    setMode,
    updateRule,
    updateColors,
    updateWorld: refreshSettings,
    updatePlay,
    updateHistory,
    updateStats,
    updateSpeed,
    updateLibrary,
    updateTestLog,
    progress,
    toast,
    clearToasts,
    showLink,
    toggleHelp,
    toggleConfigs: () => setConfigs(!configsOpen()),
    insets,
    closeOverlays,
    refreshThumbs,
    tick,
  };
}
