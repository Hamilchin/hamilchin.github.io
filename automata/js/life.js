// Life-like cellular automata: two states and the eight-cell Moore neighborhood.
// A rule says how many live neighbors bring a dead cell to life (B, "born") and
// how many keep a live cell alive (S, "survives"); Conway's Game of Life is B3/S23.

import { blit } from './ant.js';

/** Rules are stored as two 9-bit masks: bit n is set when n neighbors count. */
export function lifeRule(born, survive) {
  const mask = (list) => [...list].reduce((m, n) => m | (1 << n), 0);
  return { b: mask(born), s: mask(survive) };
}

/** Accepts "B3/S23", "b36s23", "B3_S23", "B2/S", or the older survive/born form "23/3". */
export function parseLifeRule(text) {
  const t = String(text).trim().toUpperCase().replace(/\s+/g, '');
  let m = t.match(/^B([0-8]*)[/_\-,]?S([0-8]*)$/);
  if (m) return lifeRule(digits(m[1]), digits(m[2]));
  m = t.match(/^S([0-8]*)[/_\-,]?B([0-8]*)$/);
  if (m) return lifeRule(digits(m[2]), digits(m[1]));
  m = t.match(/^([0-8]*)\/([0-8]*)$/);
  if (m) return lifeRule(digits(m[2]), digits(m[1]));
  return null;
}

function digits(s) {
  return [...s].map(Number);
}

export function formatLifeRule(rule) {
  let b = 'B', s = 'S';
  for (let n = 0; n <= 8; n++) {
    if (rule.b & (1 << n)) b += n;
    if (rule.s & (1 << n)) s += n;
  }
  return `${b}/${s}`;
}

export function sameLifeRule(a, b) {
  return a.b === b.b && a.s === b.s;
}

/** Lookup table indexed by (center << 4) | (sum of the 3×3 block including the center). */
function buildLut(rule) {
  const lut = new Uint8Array(32);
  for (let n9 = 0; n9 <= 9; n9++) {
    lut[n9] = n9 <= 8 && rule.b & (1 << n9) ? 1 : 0;
    lut[16 | n9] = n9 >= 1 && rule.s & (1 << (n9 - 1)) ? 1 : 0;
  }
  return lut;
}

export function randomLifeRule(rng) {
  // B0 and B1 rules mostly strobe or explode, so they are rare here.
  let b = 0, s = 0;
  for (let n = 0; n <= 8; n++) {
    const pb = n === 0 ? 0 : n === 1 ? 0.04 : n === 2 ? 0.18 : n <= 4 ? 0.5 : 0.28;
    if (rng() < pb) b |= 1 << n;
    if (rng() < (n <= 5 ? 0.45 : 0.3)) s |= 1 << n;
  }
  if (!b) b = 1 << 3;
  return { b, s };
}

/** Rules one toggle away from `rule`, labelled like "+B6" or "−S2". */
export function lifeMutations(rule, rng, count) {
  const cands = [];
  for (let n = 0; n <= 8; n++) {
    if (n > 0) cands.push({ rule: { b: rule.b ^ (1 << n), s: rule.s }, label: `${rule.b & (1 << n) ? '−' : '+'}B${n}`, w: n === 1 ? 0.3 : 1 });
    cands.push({ rule: { b: rule.b, s: rule.s ^ (1 << n) }, label: `${rule.s & (1 << n) ? '−' : '+'}S${n}`, w: 1 });
  }
  const out = [];
  while (out.length < count && cands.length) {
    let total = 0;
    for (const c of cands) total += c.w;
    let u = rng() * total, k = 0;
    while (k < cands.length - 1 && (u -= cands[k].w) > 0) k++;
    out.push(cands.splice(k, 1)[0]);
  }
  return out;
}

export class LifeWorld {
  constructor(W, H) {
    this.kind = 'life';
    this.wrap = true;
    this.gen = 0;
    this.pop = 0;
    // Where cell (0, 0) sits on the plane; growing the world to the left or up moves it.
    this.ox = 0;
    this.oy = 0;
    this._alloc(W, H);
    this.setRule(lifeRule([3], [2, 3]));
  }

  get states() {
    return 2;
  }

  _alloc(W, H) {
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    this.next = new Uint8Array(W * H);
    this.colSum = new Uint8Array(W + 2);
    this.zero = new Uint8Array(W);
  }

  setRule(rule) {
    this.rule = rule;
    this.lut = buildLut(rule);
  }

  step(n) {
    for (let i = 0; i < n; i++) this._generation();
    return n;
  }

  _generation() {
    const W = this.W, H = this.H, src = this.grid, dst = this.next;
    const lut = this.lut, cs = this.colSum, zero = this.zero, wrap = this.wrap;
    let pop = 0;
    for (let y = 0; y < H; y++) {
      const mid = y * W;
      let up = src, upAt = mid - W, dn = src, dnAt = mid + W;
      if (y === 0) {
        if (wrap) upAt = (H - 1) * W;
        else {
          up = zero;
          upAt = 0;
        }
      }
      if (y === H - 1) {
        if (wrap) dnAt = 0;
        else {
          dn = zero;
          dnAt = 0;
        }
      }
      // Vertical sums of each column's three cells, then a sliding window of three columns.
      for (let x = 0; x < W; x++) cs[x + 1] = up[upAt + x] + src[mid + x] + dn[dnAt + x];
      cs[0] = wrap ? cs[W] : 0;
      cs[W + 1] = wrap ? cs[1] : 0;
      let a = cs[0], b = cs[1];
      for (let x = 0; x < W; x++) {
        const c = cs[x + 2];
        const v = lut[(src[mid + x] << 4) | (a + b + c)];
        dst[mid + x] = v;
        pop += v;
        a = b;
        b = c;
      }
    }
    this.grid = dst;
    this.next = src;
    this.pop = pop;
    this.gen++;
  }

  population() {
    const g = this.grid;
    let n = 0;
    for (let i = 0; i < g.length; i++) n += g[i];
    return n;
  }

  get(x, y) {
    return this.grid[y * this.W + x];
  }

  set(x, y, v) {
    const i = y * this.W + x;
    v = v ? 1 : 0;
    if (this.grid[i] === v) return false;
    this.grid[i] = v;
    return true;
  }

  clear() {
    this.grid.fill(0);
    this.gen = 0;
  }

  /** Fills the whole world, or a centered square covering `area` of the shorter side. */
  randomize(density, rng, area = 1) {
    const g = this.grid, W = this.W, H = this.H;
    g.fill(0);
    const side = Math.max(1, Math.round(Math.min(W, H) * area));
    const x0 = area >= 1 ? 0 : (W - side) >> 1, y0 = area >= 1 ? 0 : (H - side) >> 1;
    const x1 = area >= 1 ? W : x0 + side, y1 = area >= 1 ? H : y0 + side;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * W + x] = rng() < density ? 1 : 0;
    this.gen = 0;
  }

  /** A seed spec is { single: true } for one live cell, or { density, area } for random soup. */
  seedWith(spec, rng) {
    if (spec && spec.single) {
      this.clear();
      this.grid[(this.H >> 1) * this.W + (this.W >> 1)] = 1;
      return;
    }
    this.randomize(spec?.density ?? 0.35, rng, spec?.area ?? 1);
  }

  resize(W, H) {
    const old = this.grid, oW = this.W, oH = this.H;
    this._alloc(W, H);
    this.grid = blit(old, oW, oH, W, H, (W - oW) >> 1, (H - oH) >> 1);
    this.ox -= (W - oW) >> 1;
    this.oy -= (H - oH) >> 1;
  }

  /** Adds empty cells on each side, leaving everything where it was on the plane. */
  grow(l, t, r, b) {
    const old = this.grid, oW = this.W, oH = this.H;
    this._alloc(oW + l + r, oH + t + b);
    this.grid = blit(old, oW, oH, this.W, this.H, l, t);
    this.ox -= l;
    this.oy -= t;
  }

  /** Which sides have live cells within `m` cells of them: [left, top, right, bottom]. */
  nearEdges(m) {
    const W = this.W, H = this.H, g = this.grid, near = [false, false, false, false];
    m = Math.min(m, W, H);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const band = y < m || y >= H - m;
      for (let x = 0; x < W; x++) {
        if (!band && x === m && W - m > m) x = W - m;
        if (!g[row + x]) continue;
        if (x < m) near[0] = true;
        if (x >= W - m) near[2] = true;
        if (y < m) near[1] = true;
        if (y >= H - m) near[3] = true;
      }
    }
    return near;
  }

  snapshot() {
    return { W: this.W, H: this.H, ox: this.ox, oy: this.oy, grid: this.grid.slice(), gen: this.gen };
  }

  restore(snap) {
    if (snap.W !== this.W || snap.H !== this.H) this._alloc(snap.W, snap.H);
    this.grid.set(snap.grid);
    this.gen = snap.gen;
    this.ox = snap.ox ?? 0;
    this.oy = snap.oy ?? 0;
  }
}
