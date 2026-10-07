// Visual rule editors. Each returns { el, update(rule, colors) } and reports
// edits through onChange(newRule); the app decides what an edit means.

import { h } from './util.js';
import { icon, turnIcon } from './icons.js';
import { inkOn } from './palettes.js';
import { antRule, antString, isAnt, withColors, withNext, withStates, withTurn, withWrite, MAX_COLORS, MAX_STATES } from './ant.js';

// ---------------------------------------------------------------- Life-like

const CLOCKWISE = [0, 1, 2, 5, 8, 7, 6, 3]; // neighbor cells of a 3×3 block, clockwise from the top-left

function neighborGlyph(n, center) {
  const lit = new Set(CLOCKWISE.slice(0, n));
  const cells = [];
  for (let i = 0; i < 9; i++) cells.push(h('i', { class: i === 4 ? `mid ${center}` : lit.has(i) ? 'on' : '' }));
  return h('span.glyph', { 'aria-hidden': 'true' }, cells);
}

/**
 * Two rows of nine keys: how many live neighbors bring a cell to life, and keep one alive.
 * Drag across keys to set several; onChange(rule, true) marks the keys after the first.
 */
export function lifeEditor(onChange) {
  let rule = { b: 0, s: 0 };
  let drag = null;
  const keys = { b: [], s: [] };
  const el = h('div.life-editor');

  const set = (row, n, on, more = false) => {
    const mask = on ? rule[row] | (1 << n) : rule[row] & ~(1 << n);
    if (mask !== rule[row]) onChange({ ...rule, [row]: mask }, more);
  };

  for (const [row, label, center] of [
    ['b', 'Born', 'dead'],
    ['s', 'Survives', 'alive'],
  ]) {
    const wrap = h('div.nkeys', { role: 'group', 'aria-label': `${label}: neighbor counts` });
    for (let n = 0; n <= 8; n++) {
      const key = h(
        'button.nkey',
        { type: 'button', 'aria-pressed': 'false', 'aria-label': `${label} with ${n} live neighbor${n === 1 ? '' : 's'}`, title: `${label} with ${n}` },
        neighborGlyph(n, center),
        h('span.n', { text: n }),
      );
      key.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        key.releasePointerCapture?.(e.pointerId);
        drag = { row, on: !(rule[row] & (1 << n)) };
        set(row, n, drag.on);
      });
      key.addEventListener('pointerenter', () => drag && drag.row === row && set(row, n, drag.on, true));
      key.addEventListener('click', (e) => e.detail === 0 && set(row, n, !(rule[row] & (1 << n))));
      keys[row].push(key);
      wrap.append(key);
    }
    el.append(h('div.nrow', null, h('span.nrow-label', { text: label }), wrap));
  }
  addEventListener('pointerup', () => (drag = null));
  addEventListener('pointercancel', () => (drag = null));

  return {
    el,
    update(r) {
      rule = r;
      for (const row of ['b', 's']) keys[row].forEach((k, n) => k.setAttribute('aria-pressed', String(!!(r[row] & (1 << n)))));
    },
  };
}

// ---------------------------------------------------------------- elementary

/** Wolfram's eight tiles: each neighborhood above, the cell it produces below. */
export function elementaryEditor(onChange) {
  let rule = 0;
  const tiles = [];
  const row = h('div.tiles', { role: 'group', 'aria-label': 'What each neighborhood becomes' });
  for (let k = 7; k >= 0; k--) {
    const bits = [(k >> 2) & 1, (k >> 1) & 1, k & 1];
    const tile = h(
      'button.tile',
      { type: 'button', 'aria-pressed': 'false', 'aria-label': `Neighborhood ${bits.join('')}`, title: `${bits.join('')} → ?` },
      h('span.tri', { 'aria-hidden': 'true' }, bits.map((b) => h('i', { class: b ? 'on' : '' }))),
      h('span.out', { 'aria-hidden': 'true' }, h('i')),
    );
    tile.addEventListener('click', () => onChange(rule ^ (1 << k)));
    tiles[k] = tile;
    row.append(tile);
  }
  const el = h('div.eca-editor', null, row);
  return {
    el,
    update(r) {
      rule = r;
      tiles.forEach((t, k) => {
        const on = !!(r & (1 << k));
        t.setAttribute('aria-pressed', String(on));
        t.title = `${t.getAttribute('aria-label').slice(-3)} → ${on ? 1 : 0}`;
      });
    },
  };
}

// ---------------------------------------------------------------- ants and turmites

const TURN_NAMES = ['straight on', 'right', 'U-turn', 'left'];
const NEXT_TURN = [2, 3, 1, 0]; // click order: R → L → N → U → R
const PREV_TURN = [3, 2, 0, 1];
const stateName = (s) => String.fromCharCode(65 + s);

function stepper(label, value, min, max, onStep) {
  return h(
    'div.stepper',
    null,
    h('span.stepper-label', { text: label }),
    h('button.mini', { type: 'button', dataset: { key: `${label}-` }, 'aria-label': `Fewer ${label.toLowerCase()}`, disabled: value <= min, html: icon('minus', 14), onclick: () => onStep(-1) }),
    h('span.stepper-value', { text: value }),
    h('button.mini', { type: 'button', dataset: { key: `${label}+` }, 'aria-label': `More ${label.toLowerCase()}`, disabled: value >= max, html: icon('plus', 14), onclick: () => onStep(1) }),
  );
}

/**
 * A plain ant is a strip of color chips, each showing the turn taken on that
 * color. A turmite (an ant with memory) is a table: one row per state, one
 * column per color, and in each cell the color painted, the turn and the next
 * state. Adding a second state turns an ant into a turmite.
 */
export function antEditor(onChange) {
  let rule = null, colors = [];
  const body = h('div.ant-body');
  const size = h('div.machine-size');
  const el = h('div.ant-editor', null, body, size);

  // Whatever held focus is found again by its key after a re-render.
  const refocus = () => {
    const key = document.activeElement?.dataset?.key;
    return () => key && el.querySelector(`[data-key="${key}"]`)?.focus();
  };

  function setStates(S) {
    // Back to one state means back to a plain ant, turning as state A did.
    onChange(S === 1 ? antRule(antString(rule)) : withStates(rule, S));
  }

  function renderAnt() {
    const strip = h('div.chips', { role: 'group', 'aria-label': 'Turn on each color' });
    for (let c = 0; c < rule.colors; c++) {
      const t = rule.turn[c];
      const chip = h(
        'button.chip',
        {
          type: 'button',
          dataset: { key: `c${c}` },
          style: { '--chip': colors[c], '--chip-ink': inkOn(colors[c]) },
          'aria-label': `On color ${c}, turn ${TURN_NAMES[t]}`,
          title: `Color ${c}: ${TURN_NAMES[t]}`,
          html: turnIcon(t, 20),
        },
      );
      chip.addEventListener('click', () => onChange(withTurn(rule, 0, c, NEXT_TURN[t])));
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onChange(withTurn(rule, 0, c, PREV_TURN[t]));
      });
      chip.addEventListener('keydown', (e) => {
        const turn = 'NRUL'.indexOf(e.key.toUpperCase());
        if (turn >= 0 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          onChange(withTurn(rule, 0, c, turn));
        }
      });
      strip.append(chip);
    }
    body.replaceChildren(strip);
  }

  function renderTurmite() {
    const S = rule.states, K = rule.colors;
    const table = h('table.machine');
    const head = h('tr', null, h('th', { scope: 'col', class: 'corner' }, h('span.sr', { text: 'State' })));
    for (let c = 0; c < K; c++) head.append(h('th', { scope: 'col' }, h('span.swatch', { style: { '--chip': colors[c] }, title: `Color ${c}` }), h('span.sr', { text: `On color ${c}` })));
    table.append(h('thead', null, head));
    const tbody = h('tbody');
    for (let s = 0; s < S; s++) {
      const tr = h('tr', null, h('th', { scope: 'row' }, h('span.state', { text: stateName(s) })));
      for (let c = 0; c < K; c++) {
        const i = s * K + c, w = rule.write[i], t = rule.turn[i], n = rule.next[i];
        const cell = h(
          'div.op',
          null,
          h('button.op-write', {
            type: 'button',
            dataset: { key: `w${s}.${c}` },
            style: { '--chip': colors[w] },
            'aria-label': `State ${stateName(s)}, color ${c}: paint color ${w}`,
            title: `Paint color ${w}`,
            onclick: () => onChange(withWrite(rule, s, c, w + 1)),
          }),
          h('button.op-turn', {
            type: 'button',
            dataset: { key: `t${s}.${c}` },
            'aria-label': `State ${stateName(s)}, color ${c}: turn ${TURN_NAMES[t]}`,
            title: `Turn ${TURN_NAMES[t]}`,
            html: turnIcon(t, 18),
            onclick: () => onChange(withTurn(rule, s, c, NEXT_TURN[t])),
          }),
          h('button.op-next', {
            type: 'button',
            dataset: { key: `n${s}.${c}` },
            'aria-label': `State ${stateName(s)}, color ${c}: go to state ${stateName(n)}`,
            title: `Then state ${stateName(n)}`,
            text: stateName(n),
            onclick: () => onChange(withNext(rule, s, c, n + 1)),
          }),
        );
        tr.append(h('td', null, cell));
      }
      tbody.append(tr);
    }
    table.append(tbody);
    body.replaceChildren(h('div.machine-scroll', null, table));
  }

  return {
    el,
    update(r, cols) {
      rule = r;
      colors = cols;
      const again = refocus();
      if (isAnt(r)) renderAnt();
      else renderTurmite();
      size.replaceChildren(
        stepper('Colors', r.colors, 2, MAX_COLORS, (d) => onChange(withColors(rule, rule.colors + d))),
        stepper('States', r.states, 1, MAX_STATES, (d) => setStates(rule.states + d)),
      );
      again();
    },
  };
}
