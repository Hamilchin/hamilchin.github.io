// Small previews of rules for the library and the "nearby rules" panel. Each
// runs its own tiny world; a queue spreads the work over frames so the panel
// never stalls a running simulation.

import { LifeWorld } from './life.js';
import { ElementaryWorld } from './elementary.js';
import { AntWorld } from './ant.js';
import { hexToRgb } from './palettes.js';
import { rng } from './util.js';

export const THUMB = 96;

/** A hex color as a little-endian RGBA pixel. */
function pixel(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

export class ThumbQueue {
  constructor(budgetMs = 5) {
    this.budget = budgetMs;
    this.jobs = [];
    this.scheduled = false;
  }

  add(job) {
    this.jobs.push(job);
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this._run());
    }
  }

  clear() {
    this.jobs.length = 0;
  }

  _run() {
    this.scheduled = false;
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < this.budget) this.jobs.shift()();
    if (this.jobs.length) {
      this.scheduled = true;
      requestAnimationFrame(() => this._run());
    }
  }
}

/** marks: ant cells, drawn in markColor. */
function paint(canvas, W, H, cellAt, colors, marks = [], markColor = '#e5322d') {
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const lut = colors.map(pixel);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = lut[cellAt(x, y) % lut.length];
  const mark = pixel(markColor);
  for (const [x, y] of marks) if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = mark;
  ctx.putImageData(img, 0, 0);
  canvas.classList.add('ready');
}

/** seed: a Life seed spec ({ density, area } or { single: true }); gens: generations to run. */
export function lifeThumb(canvas, rule, colors, seed, gens = 72) {
  const w = new LifeWorld(THUMB, THUMB);
  w.setRule(rule);
  w.seedWith(seed, rng(7));
  w.step(gens);
  paint(canvas, THUMB, THUMB, (x, y) => w.grid[y * THUMB + x], colors);
}

export function elementaryThumb(canvas, rule, colors, seed) {
  const w = new ElementaryWorld(THUMB, THUMB);
  w.setRule(rule);
  w.seedWith(seed, rng(3));
  w.step(THUMB - 1);
  paint(canvas, THUMB, THUMB, (x, y) => w.get(x, y), colors);
}

export function antThumb(canvas, rule, colors, steps, antColor) {
  const w = new AntWorld(THUMB, THUMB);
  w.wrap = false;
  w.setRule(rule);
  w.clear();
  w.step(Math.min(steps, 400000));
  // Frame the pattern, so an ant that stays small shows up larger rather than as a speck.
  let x0 = w.ax[0], x1 = x0, y0 = w.ay[0], y1 = y0;
  for (let y = 0; y < THUMB; y++) {
    for (let x = 0; x < THUMB; x++) {
      if (!w.grid[y * THUMB + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const side = Math.min(THUMB, Math.max(24, x1 - x0 + 7, y1 - y0 + 7));
  const sx = Math.max(0, Math.min(THUMB - side, Math.round((x0 + x1 + 1 - side) / 2)));
  const sy = Math.max(0, Math.min(THUMB - side, Math.round((y0 + y1 + 1 - side) / 2)));
  paint(canvas, side, side, (x, y) => w.grid[(y + sy) * THUMB + x + sx], colors, [[w.ax[0] - sx, w.ay[0] - sy]], antColor);
}

/**
 * A picture of a whole world for the library, framed on whatever has been drawn
 * or grown in it. Returns a data URL, or null when the world is blank.
 */
export function worldThumb(world, colors, antColor) {
  const W = world.W, H = world.H;
  const ants = [];
  for (let k = 0; k < (world.count || 0); k++) ants.push([world.ax[k], world.ay[k]]);
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  const take = (x, y) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (world.get(x, y)) take(x, y);
  if (x1 < 0) return null;
  for (const [x, y] of ants) take(x, y);
  // A little room around the content, at least 16 cells across, kept inside the world.
  const pad = 4;
  const fw = Math.min(W, Math.max(16, x1 - x0 + 1 + 2 * pad)), fh = Math.min(H, Math.max(16, y1 - y0 + 1 + 2 * pad));
  const sx = Math.max(0, Math.min(W - fw, Math.round((x0 + x1 + 1 - fw) / 2)));
  const sy = Math.max(0, Math.min(H - fh, Math.round((y0 + y1 + 1 - fh) / 2)));
  // Up to THUMB pixels along the longer side, one cell per pixel when it fits.
  const f = Math.max(1, Math.max(fw, fh) / THUMB);
  const cw = Math.max(1, Math.round(fw / f)), ch = Math.max(1, Math.round(fh / f));
  const canvas = document.createElement('canvas');
  const at = (x, y) => world.get(Math.min(W - 1, sx + Math.floor(x * f)), Math.min(H - 1, sy + Math.floor(y * f)));
  paint(canvas, cw, ch, at, colors, ants.map(([x, y]) => [Math.floor((x - sx) / f), Math.floor((y - sy) / f)]), antColor);
  return canvas.toDataURL();
}
