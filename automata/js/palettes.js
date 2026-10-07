// Cell palettes. Color 0 is the empty cell; the rest are the states in order.
// A palette either lists its colors (repeating if a rule needs more) or gives
// stops that are sampled evenly in OKLab for however many colors a rule needs.
// "Auto" palettes change their ground with the page theme.

import { clamp } from './util.js';

export const PALETTES = [
  {
    id: 'graphite',
    name: 'Graphite',
    auto: true,
    light: { bg: '#f3f3f0', ramp: ['#1b1b19', '#7c7b75', '#c9c8c1'] },
    dark: { bg: '#121211', ramp: ['#ecebe5', '#8a8983', '#3d3d3a'] },
  },
  {
    id: 'specimen',
    name: 'Specimen',
    auto: true,
    light: {
      bg: '#f2f1ec',
      list: ['#1c1c1a', '#2f45d6', '#e5482d', '#f2b01e', '#16876a', '#e2729b', '#1597a8', '#6b4bc0', '#b8812a', '#5b6b7d', '#8fbf3a', '#f28c6b', '#8e3b6f', '#7fb8e8', '#56733a'],
    },
    dark: {
      bg: '#131312',
      list: ['#ecebe5', '#5b70ff', '#ff6445', '#ffc233', '#2fb08b', '#f28ab0', '#35b9cb', '#9477ec', '#d9a24a', '#8a9bb0', '#a8d65a', '#ffa383', '#c45c9b', '#9fd0ff', '#7d9b55'],
    },
  },
  { id: 'he', name: 'H&E stain', bg: '#faeef3', list: ['#3b1c6e', '#e0679a', '#7e4bb3', '#f3a8c5', '#1f1146', '#b93c78', '#c9b2e8', '#8c2c59', '#ffd0df', '#5d3a9b'] },
  { id: 'riso', name: 'Riso', bg: '#f6f4ef', list: ['#3255a4', '#ff48b0', '#ffe800', '#00a95c', '#ff6c2f', '#765ba7', '#00838a', '#f15060', '#1d1d1b', '#ac936e', '#70bbe8', '#ff9ec8'] },
  { id: 'bauhaus', name: 'Bauhaus', bg: '#e8e5dd', list: ['#1c1b19', '#d52d1e', '#1d4ea1', '#f2c12e', '#7d7b74', '#ffffff', '#2f7d5b', '#f07f22'] },
  { id: 'cyanotype', name: 'Cyanotype', bg: '#123d78', ramp: ['#f4f7fb', '#9dbfe6', '#4e7fbe'] },
  { id: 'phosphor', name: 'P1 phosphor', bg: '#03110a', ramp: ['#56ffa3', '#1c9e5a', '#0d4a2c'] },
  { id: 'amber', name: 'P3 amber', bg: '#130b02', ramp: ['#ffb42b', '#b86d0d', '#4f2c05'] },
  { id: 'ember', name: 'Ember', bg: '#0d0706', ramp: ['#fff3c9', '#ffb640', '#f0602b', '#a6221d', '#4b0e13'] },
  { id: 'glacier', name: 'Glacier', bg: '#07121d', ramp: ['#eef9ff', '#8fd4f1', '#3990c3', '#1c4d78'] },
  { id: 'viridis', name: 'Viridis', bg: '#f4f4f1', ramp: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  { id: 'spectrum', name: 'Spectrum', bg: '#101010', hues: { l: 0.74, c: 0.16, start: 25 } },
];

// Palettes made by editing colors: { id, name, colors }, kept in the browser by the app.
let custom = [];
export const customPalettes = () => custom;
export function setCustomPalettes(list) {
  custom = list;
}

export const paletteById = (id) => PALETTES.find((p) => p.id === id) || custom.find((p) => p.id === id);

/** The K colors a palette gives in the current theme. */
export function paletteColors(palette, K, theme = 'light') {
  if (palette.colors) return extendColors(palette.colors, K);
  const p = palette.auto ? palette[theme] : palette;
  const out = [p.bg];
  const n = K - 1;
  if (p.list) for (let i = 0; i < n; i++) out.push(p.list[i % p.list.length]);
  else if (p.ramp) for (let i = 0; i < n; i++) out.push(sampleRamp(p.ramp, n === 1 ? 0 : i / (n - 1)));
  else if (p.hues) for (let i = 0; i < n; i++) out.push(oklch(p.hues.l, p.hues.c, p.hues.start + (360 * i) / Math.max(n, 3)));
  return out;
}

/** A custom palette may be shorter than a rule needs; continue it with new hues. */
export function extendColors(colors, K) {
  const out = colors.slice(0, K);
  while (out.length < K) {
    const i = out.length;
    const base = rgbToOklab(hexToRgb(out[1 + ((i - 1) % Math.max(1, Math.min(out.length - 1, 4)))] || '#808080'));
    const L = base[0], C = Math.max(0.09, Math.hypot(base[1], base[2]));
    const hue = (Math.atan2(base[2], base[1]) * 180) / Math.PI + 137.5 * i;
    out.push(oklch(clamp(L, 0.35, 0.8), Math.min(C, 0.18), hue));
  }
  return out;
}

function sampleRamp(stops, t) {
  if (stops.length === 1) return stops[0];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

// ---------------------------------------------------------------- color math

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

export const isHex = (s) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s).trim());

export function normalizeHex(s) {
  const h = String(s).trim().replace('#', '').toLowerCase();
  return '#' + (h.length === 3 ? [...h].map((c) => c + c).join('') : h);
}

const toLinear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

export function rgbToOklab([R, G, B]) {
  const r = toLinear(R), g = toLinear(G), b = toLinear(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function oklch(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  // Pull chroma in until the color fits in sRGB.
  for (let c = C; c >= 0; c -= 0.005) {
    const rgb = oklabToRgb([L, c * Math.cos(h), c * Math.sin(h)]);
    if (rgb.every((v) => v >= -0.5 && v <= 255.5)) return rgbToHex(rgb);
  }
  return rgbToHex(oklabToRgb([L, 0, 0]));
}

export function mix(a, b, t) {
  const A = rgbToOklab(hexToRgb(a)), B = rgbToOklab(hexToRgb(b));
  return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]));
}

/** Perceptual lightness in [0, 1]. */
export const lightness = (hex) => rgbToOklab(hexToRgb(hex))[0];

/** Black or white, whichever reads better on the given color. */
export const inkOn = (hex) => (lightness(hex) > 0.62 ? '#161615' : '#fbfbf8');

/** A faint line color derived from the ground: used for grid lines. */
export function gridColor(bg) {
  const L = lightness(bg);
  return mix(bg, L > 0.5 ? '#000000' : '#ffffff', L > 0.5 ? 0.13 : 0.12);
}
