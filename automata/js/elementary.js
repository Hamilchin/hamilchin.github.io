// Elementary (one-dimensional) cellular automata.
//
// A row of cells evolves one generation at a time; each new cell depends on the
// three cells above it. With two states there are 2³ = 8 neighborhoods and so
// 2⁸ = 256 rules, numbered by Wolfram's convention: bit k of the rule number is
// the new state for the neighborhood whose cells spell k in binary (111 = 7 … 000 = 0).
//
// The world is a space-time diagram that grows one line per step. It starts as a
// single line at the top; each step adds the next generation below the newest
// line. Only the newest line is the automaton's present, so it is the only one
// that can be drawn on; the lines above it are history and never change. Lines
// live in a ring buffer, so once the picture is full it scrolls without copying.

export function randomElementaryRule(rng) {
  // Keep 000 → 0 most of the time so the background stays quiet.
  let r = Math.floor(rng() * 256);
  if (rng() < 0.8) r &= ~1;
  return r;
}

/** The 8 one-bit neighbors of a rule, plus its mirror image and complement. */
export function elementaryMutations(rule) {
  const out = [];
  for (let k = 7; k >= 0; k--) {
    const pattern = k.toString(2).padStart(3, '0');
    out.push({ rule: rule ^ (1 << k), label: `${pattern} → ${(rule >> k) & 1 ? 0 : 1}` });
  }
  const m = mirror(rule), c = complement(rule);
  if (m !== rule) out.push({ rule: m, label: 'mirror' });
  if (c !== rule && c !== m) out.push({ rule: c, label: 'complement' });
  return out;
}

/** Left-right reflection: swaps the roles of the left and right neighbors. */
export function mirror(rule) {
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const flipped = ((k & 1) << 2) | (k & 2) | ((k >> 2) & 1);
    if (rule & (1 << k)) r |= 1 << flipped;
  }
  return r;
}

/** Black-white inversion: the rule that does the same thing with 0 and 1 swapped. */
export function complement(rule) {
  let r = 0;
  for (let k = 0; k < 8; k++) if (!(rule & (1 << (7 - k)))) r |= 1 << k;
  return r;
}

/**
 * Where a lone starting cell should sit, as a fraction of the width. Rules like
 * 110 grow only to one side; starting them near the opposite edge gives the
 * picture room instead of wrapping around, as in Wolfram's own plates.
 */
export function singleCellAt(rule) {
  const W = 129, c = 64;
  let row = new Uint8Array(W), left = 0, right = 0;
  row[c] = 1;
  for (let t = 0; t < 48; t++) {
    const next = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      const k = ((x > 0 ? row[x - 1] : 0) << 2) | (row[x] << 1) | (x < W - 1 ? row[x + 1] : 0);
      next[x] = (rule >> k) & 1;
      if (next[x]) {
        left = Math.max(left, c - x);
        right = Math.max(right, x - c);
      }
    }
    row = next;
  }
  if (left > 2 * right + 3) return 0.9;
  if (right > 2 * left + 3) return 0.1;
  return 0.5;
}

export class ElementaryWorld {
  constructor(W, H) {
    this.kind = 'eca';
    this.wrap = true;
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    this.gen = 0;
    // Where the picture's top-left cell sits on the plane; growing the world to the left moves it.
    this.ox = 0;
    this.oy = 0;
    this.setRule(30);
  }

  get states() {
    return 2;
  }

  /** A new rule only decides the lines still to come. */
  setRule(rule) {
    this.rule = rule & 255;
    this.lut = new Uint8Array(8);
    for (let k = 0; k < 8; k++) this.lut[k] = (this.rule >> k) & 1;
  }

  /** Generation shown on the top line of the picture. */
  get topGen() {
    return Math.max(0, this.gen - this.H + 1);
  }

  /** Ring-buffer row that holds the top line of the picture. */
  get rowOffset() {
    return this.topGen % this.H;
  }

  /** Row of the picture holding the newest line. */
  get currentRow() {
    return this.gen - this.topGen;
  }

  step(n) {
    const W = this.W, H = this.H, g = this.grid, lut = this.lut, wrap = this.wrap;
    let gen = this.gen;
    let src = (gen % H) * W;
    for (let k = 0; k < n; k++) {
      gen++;
      const dst = (gen % H) * W;
      let l = wrap ? g[src + W - 1] : 0, c = g[src];
      for (let x = 0; x < W - 1; x++) {
        const r = g[src + x + 1];
        g[dst + x] = lut[(l << 2) | (c << 1) | r];
        l = c;
        c = r;
      }
      g[dst + W - 1] = lut[(l << 2) | (c << 1) | (wrap ? g[src] : 0)];
      src = dst;
    }
    this.gen = gen;
    return n;
  }

  /** Live cells on the newest line. */
  population() {
    const g = this.grid, at = (this.gen % this.H) * this.W;
    let n = 0;
    for (let x = 0; x < this.W; x++) n += g[at + x];
    return n;
  }

  /** Cell at column x of row y of the picture (0 = top). */
  get(x, y) {
    return this.grid[((this.topGen + y) % this.H) * this.W + x];
  }

  /** Paints a cell of the newest line, the only one that can change. */
  set(x, y, v) {
    if (y !== this.currentRow) return false;
    const i = (this.gen % this.H) * this.W + x;
    v = v ? 1 : 0;
    if (this.grid[i] === v) return false;
    this.grid[i] = v;
    return true;
  }

  /** Back to one empty line. */
  clear() {
    this.grid.fill(0);
    this.gen = 0;
  }

  /** One live cell, placed where the current rule's pattern has room to grow. */
  seedSingle() {
    this.clear();
    this.grid[Math.min(this.W - 1, Math.floor(this.W * singleCellAt(this.rule)))] = 1;
  }

  randomize(density, rng) {
    this.clear();
    for (let x = 0; x < this.W; x++) this.grid[x] = rng() < density ? 1 : 0;
  }

  /** 'single' for one live cell, 'blank', or { random: density }. */
  seedWith(spec, rng) {
    if (spec && spec.random != null) this.randomize(spec.random, rng);
    else if (spec === 'blank') this.clear();
    else this.seedSingle();
  }

  /** Adds empty columns at the sides and room below for more lines; lines only ever grow down. */
  grow(l, t, r, b) {
    const old = this.grid, oW = this.W, oH = this.H, top = this.topGen;
    this.W = oW + l + r;
    this.H = oH + b;
    this.grid = new Uint8Array(this.W * this.H);
    for (let g = top; g <= this.gen; g++) this.grid.set(old.subarray((g % oH) * oW, (g % oH + 1) * oW), (g % this.H) * this.W + l);
    this.ox -= l;
  }

  /** Whether the newest line has live cells within m cells of the left or right side: [left, right]. */
  nearSides(m) {
    const at = (this.gen % this.H) * this.W, W = this.W;
    let left = false, right = false;
    for (let x = 0; x < Math.min(m, W); x++) left ||= !!this.grid[at + x];
    for (let x = Math.max(0, W - m); x < W; x++) right ||= !!this.grid[at + x];
    return [left, right];
  }

  /** Keeps the newest lines that fit, centered. */
  resize(W, H) {
    const old = this.grid, oW = this.W, oH = this.H, gen = this.gen;
    const ox = (W - oW) >> 1;
    this.ox -= ox;
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    for (let t = Math.max(0, gen - Math.min(oH, H) + 1); t <= gen; t++) {
      const src = (t % oH) * oW, dst = (t % H) * W;
      for (let x = 0; x < oW; x++) if (x + ox >= 0 && x + ox < W) this.grid[dst + x + ox] = old[src + x];
    }
  }

  snapshot() {
    return { W: this.W, H: this.H, ox: this.ox, oy: this.oy, grid: this.grid.slice(), gen: this.gen };
  }

  restore(snap) {
    if (snap.W !== this.W || snap.H !== this.H) {
      this.W = snap.W;
      this.H = snap.H;
      this.grid = new Uint8Array(snap.W * snap.H);
    }
    this.grid.set(snap.grid);
    this.gen = snap.gen;
    this.ox = snap.ox ?? 0;
    this.oy = snap.oy ?? 0;
  }
}
