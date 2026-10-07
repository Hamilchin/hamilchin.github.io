// Test mode: every click starts its own random one-dimensional automaton at that
// cell, growing down a line at a time. Each one keeps its own lines of state, as
// wide as the world, and wraps around at the world's sides. On an unbounded canvas
// the world is a fixed frame of the plane, as wide as the screen zoomed all the way
// out and as tall as a world can be; it grows down inside the frame as patterns
// need, but never moves, so zooming and panning never lose anything.
//
// On every line an automaton rewrites the whole span it has reached so far, empty
// cells included, so a newer pattern cuts cleanly through an older one instead of
// stacking on it. Spans are kept unwrapped, so a pattern that wraps around the
// sides rewrites only what it covers, not the whole line. And the newer pattern
// always wins: every cell remembers which automaton wrote it last, and an older
// one never writes over a newer one's cells, however the drawing is timed.
//
// The rules are Wolfram's: elementary rules for two colors, and totalistic rules
// for three to ten, where a new cell depends on the sum of the three cells above.
//
// Color follows state, so state 1 is the same color wherever it appears, and the
// states run in order along a gradient. Every painted cell gets a time to go: it
// holds its full color, then fades. The time grows steadily with how far below its
// click a cell was painted, so a pattern drawn all at once still clears from the
// top down at an even pace. With persist on, the latest drawing holds until the
// next one starts, and then goes the same way. The grid holds what is shown: 0 for
// the ground, and 1 + (state - 1) * LEVELS + brightness.
//
// Work is lazy. Each automaton keeps the time its newest line was (or would have
// been) drawn, and moves down only as far as anyone can see (`limit`, set just below
// the screen). Out of sight it waits; when more comes into view it catches up, and
// lines that would have faded by then are worked out but never drawn. An automaton
// with nothing left that could still show is dropped.

import { mix, oklch } from './palettes.js';
import { blit } from './ant.js';

export const MIN_COLORS = 2;
export const MAX_COLORS = 10; // states 0…9, so nine painted states
export const LEVELS = 28; // brightness steps per state: 1 + 9 × 28 values fit in a byte
const TICK_MS = 4; // times to go are kept in 4 ms ticks, wrapping at 16 bits
const MAX_RUNS = 256;
// Who wrote a cell last: the automaton's number, and whether the cell is held for persist.
const HELD = 0x8000;
const ID = 0x7fff;

// Lines a second the fade moves down, on the sweep slider; the last stop clears everything at once.
export const SWEEPS = [50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 1e4, 2e4, 5e4, Infinity];

/** How a test world paints and fades, unless told otherwise. */
export const TUNING = {
  hold: 400, // ms the line at the click keeps its full color
  sweep: 1500, // lines a second the fade moves down
  fade: 1500, // ms from full color to the ground
  min: 3, // the fewest colors a new rule may have
  max: 4, // and the most
  palette: 'dusk',
  persist: true, // hold each drawing until the next one starts
};

// Always dark, so white text on top stays readable. Every palette shares the dark
// theme's near-black ground and runs its nine inks along a muted gradient, from
// state 1 to state 9, through stops given as OKLCH [lightness, chroma, hue]. The
// first states are spaced furthest apart: most rules have only a few colors, and
// those should still look distinct from one another.
const GROUND = '#121211';
export const TEST_PALETTES = [
  { id: 'dusk', name: 'Dusk', stops: [[0.34, 0.06, 258], [0.42, 0.065, 296], [0.51, 0.055, 340]] },
  { id: 'ember', name: 'Ember', stops: [[0.35, 0.065, 16], [0.45, 0.07, 42], [0.56, 0.065, 74]] },
  { id: 'tide', name: 'Tide', stops: [[0.34, 0.05, 260], [0.43, 0.05, 220], [0.53, 0.045, 180]] },
  { id: 'moss', name: 'Moss', stops: [[0.34, 0.04, 185], [0.43, 0.05, 150], [0.53, 0.055, 116]] },
  { id: 'mono', name: 'Mono', stops: [[0.3, 0.005, 260], [0.62, 0.005, 260]] },
].map((p) => ({ ...p, inks: ramp(p.stops, MAX_COLORS - 1) }));

/** n colors along the stops in OKLCH, closer together toward the end. */
function ramp(stops, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) ** 0.6 * (stops.length - 1), j = Math.min(stops.length - 2, Math.floor(t)), f = t - j;
    const a = stops[j], b = stops[j + 1];
    out.push(oklch(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f));
  }
  return out;
}

const paletteOf = (id) => TEST_PALETTES.find((p) => p.id === id) || TEST_PALETTES[0];

/** The full palette: the ground, then each state's ink from faint to full. */
export function testColors(id) {
  const out = [GROUND];
  for (const c of paletteOf(id).inks) for (let l = 0; l < LEVELS; l++) out.push(mix(GROUND, c, (l + 1) / LEVELS));
  return out;
}

/** The ground and the nine inks themselves, for pictures of rules. */
export const testInks = (id) => [GROUND, ...paletteOf(id).inks];

// The faintest value of each value's state, so a cell can change brightness and keep its state.
const BASE = new Uint8Array(256);
for (let v = 1; v < 256; v++) BASE[v] = 1 + Math.floor((v - 1) / LEVELS) * LEVELS;

/** The new cell under three cells, by a rule's table: their sum for a totalistic rule, the three as bits for an elementary one. */
const cell = (out, tot, l, c, r) => out[tot ? l + c + r : (l << 2) | (c << 1) | r];

/** A random rule with between min and max colors. Empty always stays empty. */
function makeRule(rng, min, max) {
  const k = min + Math.floor(rng() * (max - min + 1));
  if (k === 2) {
    const n = 2 * Math.floor(rng() * 128);
    const out = new Uint8Array(8);
    for (let i = 0; i < 8; i++) out[i] = (n >> i) & 1;
    return { k, out, tot: false, seed: 1, number: n };
  }
  const out = new Uint8Array(3 * (k - 1) + 1);
  for (let s = 1; s < out.length; s++) out[s] = Math.floor(rng() * k);
  return { k, out, tot: true, seed: 1 + Math.floor(rng() * (k - 1)) };
}

/**
 * A random rule that grows from one cell into something with texture: some width
 * (narrow is fine), not solid, still alive, and with more than one color.
 */
function randomRule(rng, min, max) {
  min = Math.min(Math.max(min | 0, MIN_COLORS), MAX_COLORS);
  max = Math.min(Math.max(max | 0, min), MAX_COLORS);
  for (;;) {
    const rule = makeRule(rng, min, max), { out, tot } = rule;
    const W = 121;
    let row = new Uint8Array(W), next = new Uint8Array(W);
    row[60] = rule.seed;
    let alive = 0, lo = W, hi = -1;
    const seen = new Set();
    for (let t = 0; t < 48; t++) {
      for (let x = 1; x < W - 1; x++) next[x] = cell(out, tot, row[x - 1], row[x], row[x + 1]);
      [row, next] = [next, row];
      if (t < 40) continue;
      for (let x = 0; x < W; x++) {
        if (!row[x]) continue;
        alive++;
        seen.add(row[x]);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    // Two-color rules are sparser: Sierpinski's triangle fills only about an eighth of its width.
    const spread = hi - lo + 1, fill = alive / (8 * Math.max(spread, 1));
    if (alive && spread >= 15 && fill > (rule.k === 2 ? 0.1 : 0.15) && fill < 0.85 && seen.size >= Math.min(2, rule.k - 1)) return rule;
  }
}

/** Wolfram's number for a totalistic rule: the outputs read as a base-k numeral, sum 0 last. */
export function ruleCode({ k, out }) {
  let n = 0n;
  for (let s = out.length - 1; s >= 0; s--) n = n * BigInt(k) + BigInt(out[s]);
  return n.toString();
}

export class TestWorld {
  constructor(W, H) {
    this.kind = 'test';
    this.wrap = true;
    this.rule = 0;
    this.runs = [];
    this.log = []; // the latest spawns, newest first
    this.tuning = { ...TUNING };
    // On an unbounded canvas, the plane lines the world may grow to fill: { top, bottom }.
    // Without a frame the world stays the size it is.
    this.frame = null;
    this.maxSide = 4096;
    // Lines a second the automata draw (Infinity: all at once), and the plane line they wait above.
    this.rate = Infinity;
    this.limit = Infinity;
    // Where cell (0, 0) sits on the plane; growing the world to the left or up moves it.
    this.ox = 0;
    this.oy = 0;
    // Time in this world, which only passes while it runs.
    this.clock = 0;
    this.serial = 0; // the number of the latest automaton
    this.drawing = 1; // the number of the first automaton of the latest drawing
    this.holding = false; // whether any cells are held
    this._alloc(W, H);
  }

  get states() {
    return 1 + (MAX_COLORS - 1) * LEVELS;
  }

  _alloc(W, H) {
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    // When each painted cell goes (in ticks), or for a held cell, how far below its click it is.
    this.due = new Uint16Array(W * H);
    this.owner = new Uint16Array(W * H);
    // For each line: the columns that may be lit, and the time something there next changes.
    this.rowL = new Int32Array(H).fill(W);
    this.rowR = new Int32Array(H).fill(-1);
    this.rowAt = new Float64Array(H).fill(Infinity);
    this.lit = null; // bounding box of lit cells: [x0, y0, x1, y1]
    this.rows = [0, H - 1]; // lines changed since they were last taken
    this.gen = 0;
  }

  /** Each automaton chooses its own rule. */
  setRule() {}

  /** The state of a cell: 0 for the ground, or 1 to 9. */
  stateAt(i) {
    const v = this.grid[i];
    return v && 1 + Math.floor((v - 1) / LEVELS);
  }

  /** When a cell painted at this depth starts to fade, in ms of world time. */
  _fadeAt(depth) {
    const t = this.tuning;
    return this.clock + t.hold + (depth * 1000) / t.sweep;
  }

  _touch(y0, y1) {
    const r = this.rows;
    if (y0 < r[0]) r[0] = y0;
    if (y1 > r[1]) r[1] = y1;
  }

  /** The lines changed since the last call, [first, last], so only those need drawing again. */
  takeRows() {
    const r = this.rows;
    this.rows = [this.H, -1];
    return r;
  }

  /** Writes a run's newest line across its span, except where a newer automaton has written. */
  /** When a run's newest line starts to fade: from when it was drawn, or let go if it was held then, plus its hold and its place in the sweep. */
  _fadeOf(r, depth = r.y - r.y0, at = r.at) {
    const t = this.tuning;
    return Math.max(at, r.freeAt) + t.hold + (depth * 1000) / t.sweep;
  }

  _paint(r) {
    const W = this.W, n = r.n, row = r.row, grid = this.grid, due = this.due, owner = this.owner, y = r.y;
    const depth = r.y - r.y0;
    const held = r.freeAt === Infinity;
    const mark = r.id | (held ? HELD : 0);
    const fadeAt = this._fadeOf(r);
    // A line that would have faded already is worked out but not drawn; it still clears its span of older automata.
    const gone = !held && fadeAt + this.tuning.fade <= this.clock;
    const when = held ? Math.min(depth, ID) : Math.round((fadeAt + this.tuning.fade) / TICK_MS) & 0xffff;
    const full = r.s1 - r.s0 + 1 >= n;
    const u0 = full ? 0 : r.s0, u1 = full ? n - 1 : r.s1;
    let x = r.wraps ? ((u0 % n) + n) % n : u0;
    let c0 = W, c1 = -1, changed = !gone;
    for (let u = u0, at = y * W; u <= u1; u++, x++) {
      if (x === n) x = 0;
      const col = r.bx + x;
      if (col < 0 || col >= W) continue;
      const i = at + col;
      if ((owner[i] & ID) > r.id) continue;
      owner[i] = mark;
      const v = gone ? 0 : row[x];
      if (v) {
        grid[i] = 1 + (v - 1) * LEVELS + LEVELS - 1;
        due[i] = when;
        if (col < c0) c0 = col;
        if (col > c1) c1 = col;
      } else if (grid[i]) {
        grid[i] = 0;
        changed = true;
      }
    }
    if (changed) this._touch(y, y);
    if (c1 < 0) return;
    if (c0 < this.rowL[y]) this.rowL[y] = c0;
    if (c1 > this.rowR[y]) this.rowR[y] = c1;
    if (held) this.holding = true;
    else if (fadeAt < this.rowAt[y]) this.rowAt[y] = fadeAt;
    const b = this.lit;
    if (!b) this.lit = [c0, y, c1, y];
    else {
      if (c0 < b[0]) b[0] = c0;
      if (y < b[1]) b[1] = y;
      if (c1 > b[2]) b[2] = c1;
      if (y > b[3]) b[3] = y;
    }
  }

  /**
   * Starts an automaton with a single live cell at (x, y), growing down. It lives in
   * the band of `n` columns from `bx`, wrapping around at the band's sides if `wraps`.
   * A spawn that begins a new drawing lets the held cells of the last one go.
   */
  spawn(x, y, { rng = Math.random, bx = 0, n = this.W, wraps = this.wrap, fresh = true } = {}) {
    if (x < bx || x >= bx + n) [bx, n, wraps] = [0, this.W, this.wrap];
    if (fresh) this.release();
    if (this.serial >= ID - 1) this._renumber();
    const id = ++this.serial;
    if (fresh) this.drawing = id;
    if (this.runs.length >= MAX_RUNS) this.runs.shift();
    const rule = randomRule(rng, this.tuning.min, this.tuning.max);
    const at = x - bx;
    // `at`: when its newest line was (or would have been) drawn. `freeAt`: when its drawing was let go; Infinity while it's held.
    const run = { id, rule, bx, n, wraps, row: new Uint8Array(n), next: new Uint8Array(n), lo: at, hi: at, s0: at, s1: at, y, y0: y, dead: false };
    run.at = this.clock;
    run.freeAt = this.tuning.persist ? Infinity : -Infinity;
    run.row[at] = rule.seed;
    this.runs.push(run);
    this._paint(run);
    this.log.unshift({ rule, code: rule.tot ? ruleCode(rule) : null, x: x + this.ox, y: y + this.oy });
    this.log.length = Math.min(this.log.length, 8);
    return run;
  }

  /**
   * Cells remember their writer in 15 bits. Before the numbers run out, count again
   * from the oldest automaton still drawing; anything older can't be overwritten by
   * mistake, since every automaton from then on is newer.
   */
  _renumber() {
    this.runs = this.runs.filter((r) => r.id > this.serial - 4096);
    const shift = this.runs.reduce((m, r) => Math.min(m, r.id), this.serial + 1) - 1;
    const o = this.owner;
    for (let i = 0; i < o.length; i++) {
      const id = o[i] & ID;
      o[i] = (o[i] & HELD) | (id > shift ? id - shift : 0);
    }
    for (const r of this.runs) r.id -= shift;
    this.serial -= shift;
    this.drawing = Math.max(1, this.drawing - shift);
  }

  /** Lets held cells go: from now they hold and fade as if they had just been painted. */
  release() {
    for (const r of this.runs) if (r.freeAt === Infinity) r.freeAt = this.clock;
    if (!this.holding) return;
    this.holding = false;
    const b = this.lit;
    if (!b) return;
    const W = this.W, g = this.grid, due = this.due, owner = this.owner, fade = this.tuning.fade;
    const when = new Map();
    for (let y = b[1]; y <= b[3]; y++) {
      for (let x = this.rowL[y], i = y * W + x; x <= this.rowR[y]; x++, i++) {
        if (!(owner[i] & HELD)) continue;
        owner[i] &= ID;
        if (!g[i]) continue;
        const depth = due[i];
        let t = when.get(depth);
        if (t === undefined) when.set(depth, (t = this._fadeAt(depth)));
        due[i] = Math.round((t + fade) / TICK_MS) & 0xffff;
        if (t < this.rowAt[y]) this.rowAt[y] = t;
      }
    }
  }

  /**
   * Moves the world's window on the plane: the new world is W × H cells, from column
   * x0 and line y0 of the current one, keeping whatever overlaps. Automata whose
   * newest line falls outside stop.
   */
  reframe(x0, y0, W, H) {
    const oW = this.W, oH = this.H;
    this.grid = blit(this.grid, oW, oH, W, H, -x0, -y0);
    this.due = blit(this.due, oW, oH, W, H, -x0, -y0);
    this.owner = blit(this.owner, oW, oH, W, H, -x0, -y0);
    const L = new Int32Array(H).fill(W), R = new Int32Array(H).fill(-1), A = new Float64Array(H).fill(Infinity);
    for (let y = Math.max(0, y0); y < Math.min(oH, y0 + H); y++) {
      const l = Math.max(0, this.rowL[y] - x0), r = Math.min(W - 1, this.rowR[y] - x0);
      if (l > r) continue;
      L[y - y0] = l;
      R[y - y0] = r;
      A[y - y0] = this.rowAt[y];
    }
    this.rowL = L;
    this.rowR = R;
    this.rowAt = A;
    this.W = W;
    this.H = H;
    this.ox += x0;
    this.oy += y0;
    for (const r of this.runs) {
      r.bx -= x0;
      r.y -= y0;
      r.y0 -= y0;
      if (r.y < 0 || r.y >= H) r.dead = true;
    }
    this._box();
    this.rows = [0, H - 1];
  }

  /** Adds empty cells on each side, leaving everything where it was on the plane. */
  grow(l, t, r, b) {
    this.reframe(-l, -t, this.W + l + r, this.H + t + b);
  }

  /** The bounding box of the lit lines. */
  _box() {
    let x0 = this.W, y0 = -1, x1 = -1, y1 = -1;
    for (let y = 0; y < this.H; y++) {
      if (this.rowL[y] > this.rowR[y]) continue;
      if (this.rowL[y] < x0) x0 = this.rowL[y];
      if (this.rowR[y] > x1) x1 = this.rowR[y];
      if (y0 < 0) y0 = y;
      y1 = y;
    }
    this.lit = x1 < 0 ? null : [x0, y0, x1, y1];
  }

  /** Room for another line below the bottom one: a framed world grows down, as far as its frame goes. */
  _roomBelow() {
    const room = this.frame ? this.frame.bottom - (this.oy + this.H) : 0;
    if (room <= 0) return false;
    this.reframe(0, 0, this.W, this.H + Math.min(room, Math.max(64, this.H >> 1)));
    return true;
  }

  /** Moves a run down a line. False once it is done: died out, or out of room. */
  _advance(r) {
    if (r.dead || r.y - r.y0 >= this.maxSide - 1) return false;
    if (r.y + 1 >= this.H && !this._roomBelow()) return false;
    if (r.dead) return false;
    r.y++;
    const n = r.n, row = r.row, next = r.next, wraps = r.wraps, { out, tot } = r.rule;
    // A pattern widens by at most a cell a side per line. Columns count on past the
    // band's sides (unwrapped) until the pattern reaches all the way around.
    let a = r.lo - 1, b = r.hi + 1;
    if (!wraps) {
      if (a < 0) a = 0;
      if (b > n - 1) b = n - 1;
    } else if (b - a + 1 >= n) {
      a = 0;
      b = n - 1;
    }
    const start = wraps ? ((a % n) + n) % n : a;
    for (let u = a, x = start; u <= b; u++, x++) {
      if (x === n) x = 0;
      const l = x > 0 ? row[x - 1] : wraps ? row[n - 1] : 0;
      const rr = x < n - 1 ? row[x + 1] : wraps ? row[0] : 0;
      next[x] = cell(out, tot, l, row[x], rr);
    }
    let lo = Infinity, hi = -Infinity;
    for (let u = a, x = start; u <= b; u++, x++) {
      if (x === n) x = 0;
      if ((row[x] = next[x])) {
        if (lo === Infinity) lo = u;
        hi = u;
      }
    }
    if (hi < lo) return false;
    r.lo = lo;
    r.hi = hi;
    if (lo < r.s0) r.s0 = lo;
    if (hi > r.s1) r.s1 = hi;
    this._paint(r);
    return true;
  }

  /**
   * Steps by hand: every automaton grows n lines now, seen or not, until it dies out
   * or runs out of room. Newer ones paint last.
   */
  step(n) {
    let s = 0;
    for (; s < n && this.runs.length; s++) {
      for (let k = 0; k < this.runs.length; k++) {
        const r = this.runs[k];
        r.at = this.clock;
        if (!this._advance(r)) this.runs.splice(k--, 1);
      }
    }
    this.gen += s;
    return n;
  }

  /**
   * Moves the automata along as time passes: each draws its next line once that
   * line is due at the world's rate, as far down as `limit` allows. Stops by `until`
   * (a performance.now() time) so a frame never runs long; whatever is left waits.
   */
  run(until) {
    const gap = 1000 / this.rate; // ms from one line to the next; 0 when drawing flat out
    // Whether a run is spent can't change while it moves along: each line it draws is due later, by just as much.
    this.runs = this.runs.filter((r) => !this._spent(r, gap));
    let s = 0;
    for (let moved = true; moved && this.runs.length; ) {
      moved = false;
      for (let k = 0; k < this.runs.length; k++) {
        const r = this.runs[k];
        if (r.y + 1 + this.oy >= this.limit || r.at + gap > this.clock) continue;
        r.at += gap;
        if (!this._advance(r)) this.runs.splice(k--, 1);
        else moved = true;
      }
      if (moved) s++;
      if (s % 16 === 0 && performance.now() > until) break;
    }
    this.gen += s;
  }

  /** Whether a run, let go, could show nothing more: even its deepest possible line would have faded by now. */
  _spent(r, gap) {
    if (r.freeAt === Infinity) return false;
    const bottom = this.frame ? this.frame.bottom - this.oy - 1 : this.H - 1;
    const last = Math.min(this.maxSide - 1, bottom - r.y0), depth = r.y - r.y0;
    return this._fadeOf(r, last, r.at + (last - depth) * gap) + this.tuning.fade <= this.clock;
  }

  /** Lets `ms` of time pass: cells past their time go back to the ground, and cells near it dim. */
  pass(ms) {
    this.clock += ms;
    const b = this.lit;
    if (!b) return;
    const clock = this.clock, now = Math.round(clock / TICK_MS) & 0xffff, fade = Math.max(1, this.tuning.fade / TICK_MS);
    const W = this.W, g = this.grid, due = this.due, owner = this.owner, L = this.rowL, R = this.rowR, at = this.rowAt;
    let x0 = W, y0 = -1, x1 = -1, y1 = -1;
    for (let y = b[1]; y <= b[3]; y++) {
      if (L[y] > R[y]) continue;
      // Lines still holding are left alone until something in them starts to fade.
      if (clock >= at[y]) {
        let l = W, r = -1, soon = Infinity, changed = false;
        for (let x = L[y], i = y * W + x; x <= R[y]; x++, i++) {
          const v = g[i];
          if (!v) continue;
          if (!(owner[i] & HELD)) {
            const left = ((due[i] - now) << 16) >> 16; // ticks to go, across the 16-bit wrap
            if (left <= 0) {
              g[i] = 0;
              changed = true;
              continue;
            }
            if (left > fade) soon = Math.min(soon, left - fade);
            else {
              const nv = BASE[v] + Math.min(LEVELS - 1, Math.floor((left * LEVELS) / fade));
              if (nv !== v) {
                g[i] = nv;
                changed = true;
              }
              soon = 0;
            }
          }
          if (x < l) l = x;
          r = x;
        }
        L[y] = l;
        R[y] = r;
        at[y] = soon === Infinity ? Infinity : clock + soon * TICK_MS;
        if (changed) this._touch(y, y);
        if (r < 0) continue;
      }
      if (L[y] < x0) x0 = L[y];
      if (R[y] > x1) x1 = R[y];
      if (y0 < 0) y0 = y;
      y1 = y;
    }
    this.lit = x1 < 0 ? null : [x0, y0, x1, y1];
  }

  population() {
    let n = 0;
    for (let i = 0; i < this.grid.length; i++) n += this.grid[i] !== 0;
    return n;
  }

  get(x, y) {
    return this.grid[y * this.W + x];
  }

  set(x, y, v) {
    const i = y * this.W + x;
    if (this.grid[i] === v) return false;
    this.grid[i] = v;
    this._touch(y, y);
    return true;
  }

  clear() {
    this.grid.fill(0);
    this.owner.fill(0);
    this.rowL.fill(this.W);
    this.rowR.fill(-1);
    this.rowAt.fill(Infinity);
    this.runs = [];
    this.lit = null;
    this.holding = false;
    this.rows = [0, this.H - 1];
    this.gen = 0;
  }

  resize(W, H) {
    this.runs = [];
    this.holding = false;
    this.ox -= (W - this.W) >> 1;
    this.oy -= (H - this.H) >> 1;
    this._alloc(W, H);
  }

  snapshot() {
    const copy = (r) => ({ ...r, row: r.row.slice(), next: r.next.slice() });
    return {
      W: this.W,
      H: this.H,
      ox: this.ox,
      oy: this.oy,
      grid: this.grid.slice(),
      due: this.due.slice(),
      owner: this.owner.slice(),
      rowL: this.rowL.slice(),
      rowR: this.rowR.slice(),
      rowAt: this.rowAt.slice(),
      clock: this.clock,
      gen: this.gen,
      serial: this.serial,
      drawing: this.drawing,
      holding: this.holding,
      frame: this.frame && { ...this.frame },
      runs: this.runs.map(copy),
    };
  }

  restore(snap) {
    if (snap.W !== this.W || snap.H !== this.H) this._alloc(snap.W, snap.H);
    this.grid.set(snap.grid);
    if (snap.due) {
      this.due.set(snap.due);
      this.owner.set(snap.owner);
      this.rowL.set(snap.rowL);
      this.rowR.set(snap.rowR);
      this.rowAt.set(snap.rowAt);
    } else {
      // A plain grid, as from a link: everything in it holds until something starts it fading.
      this.owner.fill(0);
      this.rowL.fill(0);
      this.rowR.fill(this.W - 1);
      this.rowAt.fill(Infinity);
    }
    this.clock = snap.clock ?? this.clock;
    this.gen = snap.gen;
    this.ox = snap.ox ?? 0;
    this.oy = snap.oy ?? 0;
    this.serial = Math.max(this.serial, snap.serial ?? 0);
    this.drawing = snap.drawing ?? this.drawing;
    this.holding = !!snap.holding;
    this.frame = snap.frame ? { ...snap.frame } : null;
    this.runs = (snap.runs || []).map((r) => ({ ...r, row: r.row.slice(), next: r.next.slice() }));
    this._box();
    this.rows = [0, this.H - 1];
  }
}
