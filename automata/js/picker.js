// A small color picker: saturation/brightness field, hue strip, hex field and
// suggested swatches. One instance is shared and anchored to whichever chip opened it.

import { h, clamp } from './util.js';
import { hexToRgb, rgbToHex, isHex, normalizeHex } from './palettes.js';

function hsvToRgb(hue, s, v) {
  const f = (n) => {
    const k = (n + hue / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

function rgbToHsv([R, G, B]) {
  const r = R / 255, g = G / 255, b = B / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return [hue, max ? d / max : 0, max];
}

let root, sv, svThumb, hueBar, hueThumb, hexInput, preview, swatchRow;
let state = null; // { hsv: [h, s, v], anchor, onInput }

function build() {
  svThumb = h('span.sv-thumb');
  sv = h('div.sv', { tabindex: '0', role: 'slider', 'aria-label': 'Saturation and brightness' }, svThumb);
  hueThumb = h('span.hue-thumb');
  hueBar = h('div.hue', { tabindex: '0', role: 'slider', 'aria-label': 'Hue', 'aria-valuemin': '0', 'aria-valuemax': '360' }, hueThumb);
  preview = h('span.picker-preview');
  hexInput = h('input.picker-hex#picker-hex', { type: 'text', spellcheck: 'false', autocomplete: 'off', maxlength: '7', 'aria-label': 'Hex color' });
  swatchRow = h('div.picker-swatches');
  root = h('div.picker', { role: 'dialog', 'aria-label': 'Choose a color', hidden: true }, sv, hueBar, h('div.picker-row', null, preview, hexInput), swatchRow);
  document.body.append(root);

  drag(sv, (x, y) => {
    state.hsv[1] = x;
    state.hsv[2] = 1 - y;
    emit();
  });
  drag(hueBar, (x) => {
    state.hsv[0] = x * 360;
    emit();
  });
  sv.addEventListener('keydown', (e) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
    if (!k) return;
    e.preventDefault();
    state.hsv[1] = clamp(state.hsv[1] + k[0], 0, 1);
    state.hsv[2] = clamp(state.hsv[2] + k[1], 0, 1);
    emit();
  });
  hueBar.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    state.hsv[0] = (state.hsv[0] + d * (e.shiftKey ? 15 : 3) + 360) % 360;
    emit();
  });
  hexInput.addEventListener('input', () => {
    if (isHex(hexInput.value)) {
      state.hsv = rgbToHsv(hexToRgb(normalizeHex(hexInput.value)));
      emit(false);
    }
  });
  hexInput.addEventListener('keydown', (e) => e.key === 'Enter' && closePicker());
  addEventListener(
    'pointerdown',
    (e) => {
      if (!root.hidden && !root.contains(e.target) && !state?.anchor.contains(e.target)) closePicker();
    },
    true,
  );
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden) {
      e.stopPropagation();
      closePicker();
    }
  });
}

function drag(el, fn) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.focus();
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
    };
    move(e);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
  });
}

function hex() {
  return rgbToHex(hsvToRgb(...state.hsv));
}

function emit(syncField = true) {
  paint(syncField);
  state.onInput(hex());
}

function paint(syncField = true) {
  const [hue, s, v] = state.hsv;
  const c = hex();
  sv.style.setProperty('--hue', `hsl(${hue} 100% 50%)`);
  svThumb.style.left = `${s * 100}%`;
  svThumb.style.top = `${(1 - v) * 100}%`;
  svThumb.style.background = c;
  hueThumb.style.left = `${(hue / 360) * 100}%`;
  hueThumb.style.background = `hsl(${hue} 100% 50%)`;
  hueBar.setAttribute('aria-valuenow', Math.round(hue));
  sv.setAttribute('aria-valuetext', `saturation ${Math.round(s * 100)}%, brightness ${Math.round(v * 100)}%`);
  preview.style.background = c;
  if (syncField) hexInput.value = c;
}

export function openPicker({ anchor, color, swatches = [], onInput }) {
  if (!root) build();
  if (!root.hidden && state?.anchor === anchor) return closePicker();
  state = { hsv: rgbToHsv(hexToRgb(color)), anchor, onInput };
  swatchRow.replaceChildren(
    ...swatches.map((c) =>
      h('button.picker-swatch', {
        type: 'button',
        style: { background: c },
        'aria-label': `Use ${c}`,
        title: c,
        onclick: () => {
          state.hsv = rgbToHsv(hexToRgb(c));
          emit();
        },
      }),
    ),
  );
  root.hidden = false;
  paint();
  const a = anchor.getBoundingClientRect(), p = root.getBoundingClientRect();
  const below = a.bottom + 8 + p.height < innerHeight;
  root.style.left = `${clamp(a.left + a.width / 2 - p.width / 2, 8, innerWidth - p.width - 8)}px`;
  root.style.top = `${below ? a.bottom + 8 : Math.max(8, a.top - p.height - 8)}px`;
  anchor.setAttribute('aria-expanded', 'true');
  sv.focus({ preventScroll: true });
}

export const pickerOpen = () => !!root && !root.hidden;

export function closePicker(refocus = true) {
  if (!root || root.hidden) return;
  root.hidden = true;
  state?.anchor.setAttribute('aria-expanded', 'false');
  if (refocus) state?.anchor.focus({ preventScroll: true });
}
