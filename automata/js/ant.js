// Langton's ants and turmites.
//
// A turmite is a tiny Turing machine walking on the grid. Each step, every ant
// reads the color beneath it, looks up (state, color) in its rule table, paints
// the cell, turns, switches state and moves forward one cell. Langton's ant is
// the one-state case where colors simply cycle 0 → 1 → … → K−1 → 0, so the whole
// rule is just the turn taken on each color: "RL", "LLRR", "LRRRRRLLR", …
//
// Directions are clockwise quarter turns from north (0 N, 1 E, 2 S, 3 W) and a
// turn is a number of clockwise quarter turns (0 none, 1 right, 2 U-turn, 3 left).

export const TURNS = 'NRUL';
export const MAX_COLORS = 16;
export const MAX_STATES = 8;
export const MAX_ANTS = 4096;

const DX = new Int32Array([0, 1, 0, -1]);
const DY = new Int32Array([-1, 0, 1, 0]);
// Golly/Pegg turn codes: 1 forward, 2 right, 4 U-turn, 8 left.
const FROM_GOLLY = { 1: 0, 2: 1, 4: 2, 8: 3 };
const TO_GOLLY = [1, 2, 4, 8];

// ---------------------------------------------------------------- rules

function makeRule(states, colors) {
  const size = states * colors;
  return { states, colors, write: new Uint8Array(size), turn: new Uint8Array(size), next: new Uint8Array(size) };
}

function copyRule(rule) {
  return {
    states: rule.states,
    colors: rule.colors,
    write: rule.write.slice(),
    turn: rule.turn.slice(),
    next: rule.next.slice(),
  };
}

/** A Langton's ant from a string of turns, e.g. "RL". */
export function antRule(turns) {
  const K = turns.length;
  const rule = makeRule(1, K);
  for (let c = 0; c < K; c++) {
    rule.write[c] = (c + 1) % K;
    rule.turn[c] = TURNS.indexOf(turns[c]);
  }
  return rule;
}

/** True when the rule is a plain one-state ant whose colors cycle in order. */
export function isAnt(rule) {
  if (rule.states !== 1) return false;
  for (let c = 0; c < rule.colors; c++) {
    if (rule.write[c] !== (c + 1) % rule.colors || rule.next[c] !== 0) return false;
  }
  return true;
}

export function antString(rule) {
  let s = '';
  for (let c = 0; c < rule.colors; c++) s += TURNS[rule.turn[c]];
  return s;
}

/**
 * Parses any of:
 *   "RL", "lrrrrrllr"                         Langton's ant turn strings
 *   "181181121010"                            Ed Pegg's digit notation (write, turn code, next)
 *   "{{{1,8,1},{1,8,1}},{{1,2,1},{0,1,0}}}"   Golly's turmite notation
 * Returns null when the text is not a valid rule.
 */
export function parseAntRule(text) {
  const t = String(text).trim();
  if (/^[LRNU]+$/i.test(t)) {
    if (t.length < 2 || t.length > MAX_COLORS) return null;
    return antRule(t.toUpperCase());
  }
  if (t.startsWith('{')) return parseGolly(t);
  if (/^\d+$/.test(t)) return parseDigits(t);
  return null;
}

function parseGolly(t) {
  let data;
  try {
    data = JSON.parse(t.replace(/\{/g, '[').replace(/\}/g, ']'));
  } catch {
    return null;
  }
  if (!Array.isArray(data) || !data.length || !Array.isArray(data[0])) return null;
  const S = data.length, K = data[0].length;
  if (S > MAX_STATES || K < 2 || K > MAX_COLORS) return null;
  const rule = makeRule(S, K);
  for (let s = 0; s < S; s++) {
    if (!Array.isArray(data[s]) || data[s].length !== K) return null;
    for (let c = 0; c < K; c++) {
      const tri = data[s][c];
      if (!Array.isArray(tri) || tri.length !== 3) return null;
      if (!setTriple(rule, s, c, tri[0], tri[1], tri[2])) return null;
    }
  }
  return rule;
}

function parseDigits(t) {
  if (t.length % 3) return null;
  const triples = [];
  for (let i = 0; i < t.length; i += 3) triples.push([+t[i], +t[i + 1], +t[i + 2]]);
  const n = triples.length;
  let maxWrite = 1, maxNext = 0;
  for (const [w, , s] of triples) {
    maxWrite = Math.max(maxWrite, w);
    maxNext = Math.max(maxNext, s);
  }
  // The digit form doesn't say how many colors there are; pick the smallest
  // count that is consistent with every triple.
  for (let K = maxWrite + 1; K <= Math.min(n, MAX_COLORS); K++) {
    if (n % K) continue;
    const S = n / K;
    if (S > MAX_STATES || maxNext >= S) continue;
    const rule = makeRule(S, K);
    let ok = true;
    triples.forEach(([w, tc, s], i) => {
      ok = ok && setTriple(rule, Math.floor(i / K), i % K, w, tc, s);
    });
    if (ok) return rule;
  }
  return null;
}

function setTriple(rule, s, c, w, tc, n) {
  const turn = FROM_GOLLY[tc];
  if (turn === undefined || !(w >= 0 && w < rule.colors) || !(n >= 0 && n < rule.states)) return false;
  const i = s * rule.colors + c;
  rule.write[i] = w;
  rule.turn[i] = turn;
  rule.next[i] = n;
  return true;
}

/** Canonical text: the turn string for ants, Pegg digits for small turmites. */
export function formatAntRule(rule) {
  if (isAnt(rule)) return antString(rule);
  if (rule.colors <= 10 && rule.states <= 10) {
    let s = '';
    for (let i = 0; i < rule.states * rule.colors; i++) s += rule.write[i] + '' + TO_GOLLY[rule.turn[i]] + rule.next[i];
    return s;
  }
  return formatGolly(rule);
}

export function formatGolly(rule) {
  const states = [];
  for (let s = 0; s < rule.states; s++) {
    const cols = [];
    for (let c = 0; c < rule.colors; c++) {
      const i = s * rule.colors + c;
      cols.push(`{${rule.write[i]},${TO_GOLLY[rule.turn[i]]},${rule.next[i]}}`);
    }
    states.push(`{${cols.join(',')}}`);
  }
  return `{${states.join(',')}}`;
}

export function sameAntRule(a, b) {
  return formatAntRule(a) === formatAntRule(b);
}

// Immutable edits used by the rule editor.

export function withTurn(rule, s, c, turn) {
  const r = copyRule(rule);
  r.turn[s * r.colors + c] = turn & 3;
  return r;
}

export function withWrite(rule, s, c, w) {
  const r = copyRule(rule);
  r.write[s * r.colors + c] = ((w % r.colors) + r.colors) % r.colors;
  return r;
}

export function withNext(rule, s, c, n) {
  const r = copyRule(rule);
  r.next[s * r.colors + c] = ((n % r.states) + r.states) % r.states;
  return r;
}

/** Changes the number of colors. Ants keep cycling; turmite tables are extended sensibly. */
export function withColors(rule, K) {
  K = Math.max(2, Math.min(MAX_COLORS, K));
  if (isAnt(rule)) {
    let turns = antString(rule).slice(0, K);
    while (turns.length < K) turns += turns.length % 2 ? 'L' : 'R';
    return antRule(turns);
  }
  const r = makeRule(rule.states, K);
  for (let s = 0; s < rule.states; s++) {
    for (let c = 0; c < K; c++) {
      const i = s * K + c;
      if (c < rule.colors) {
        const j = s * rule.colors + c;
        r.write[i] = rule.write[j] % K;
        r.turn[i] = rule.turn[j];
        r.next[i] = rule.next[j];
      } else {
        r.write[i] = (c + 1) % K;
        r.turn[i] = c % 2 ? 3 : 1;
        r.next[i] = s;
      }
    }
  }
  return r;
}

/** Changes the number of internal states, turning an ant into a turmite or back. */
export function withStates(rule, S) {
  S = Math.max(1, Math.min(MAX_STATES, S));
  const K = rule.colors;
  const r = makeRule(S, K);
  for (let s = 0; s < S; s++) {
    for (let c = 0; c < K; c++) {
      const i = s * K + c;
      if (s < rule.states) {
        const j = s * K + c;
        r.write[i] = rule.write[j];
        r.turn[i] = rule.turn[j];
        r.next[i] = rule.next[j] % S;
      } else {
        // A fresh state behaves like state A so nothing changes until it is edited.
        r.write[i] = rule.write[c];
        r.turn[i] = rule.turn[c];
        r.next[i] = rule.next[c] % S;
      }
    }
  }
  // Wire the first new state into the machine so adding a state is immediately visible.
  if (S > rule.states && rule.states >= 1) r.next[(rule.states - 1) * K + K - 1] = rule.states;
  return r;
}

/** A random rule, biased toward ones that do something interesting. */
export function randomAntRule(rng, turmite = false) {
  if (!turmite) {
    const K = 2 + Math.floor(rng() * rng() * 9);
    let s = '';
    for (let i = 0; i < K; i++) {
      const u = rng();
      s += u < 0.46 ? 'R' : u < 0.92 ? 'L' : u < 0.97 ? 'N' : 'U';
    }
    if (!/L/.test(s)) s = 'L' + s.slice(1);
    if (!/R/.test(s)) s = s.slice(0, -1) + 'R';
    return antRule(s);
  }
  const S = 2 + (rng() < 0.25 ? 1 : 0), K = 2;
  const r = makeRule(S, K);
  for (let i = 0; i < S * K; i++) {
    r.write[i] = Math.floor(rng() * K);
    const u = rng();
    r.turn[i] = u < 0.4 ? 1 : u < 0.8 ? 3 : u < 0.93 ? 0 : 2;
    r.next[i] = Math.floor(rng() * S);
  }
  return r;
}

/** Rules one small edit away from `rule`, each with a short label describing the edit. */
export function antMutations(rule, rng, count) {
  const out = [];
  const seen = new Set([formatAntRule(rule)]);
  const push = (r, label) => {
    const key = formatAntRule(r);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ rule: r, label });
    }
  };
  if (isAnt(rule)) {
    const s = antString(rule);
    const cands = [];
    for (let i = 0; i < s.length; i++) {
      for (const t of 'RLNU') {
        if (t !== s[i]) cands.push({ r: s.slice(0, i) + t + s.slice(i + 1), label: `${i}: ${s[i]}→${t}`, w: t === 'N' || t === 'U' ? 0.25 : 1 });
      }
    }
    if (s.length < MAX_COLORS) {
      cands.push({ r: s + 'R', label: '+R', w: 1.5 });
      cands.push({ r: s + 'L', label: '+L', w: 1.5 });
    }
    if (s.length + 1 < MAX_COLORS) for (const t of ['RR', 'RL', 'LR', 'LL']) cands.push({ r: s + t, label: `+${t}`, w: 0.5 });
    if (s.length > 2) cands.push({ r: s.slice(0, -1), label: `−${s[s.length - 1]}`, w: 1 });
    const flipped = s.replace(/[RL]/g, (ch) => (ch === 'R' ? 'L' : 'R'));
    cands.push({ r: flipped, label: 'mirror', w: 0.6 });
    // Rules that grow into something come first; ants that spin in place or run in a line fill any gaps.
    const order = pickWeighted(cands, rng, cands.length).map((c) => ({ rule: antRule(c.r), label: c.label }));
    for (const c of order) if (out.length < count && lively(c.rule)) push(c.rule, c.label);
    for (const c of order) if (out.length < count) push(c.rule, c.label);
    return out;
  }
  const S = rule.states, K = rule.colors;
  const dull = [];
  for (let guard = 0; out.length < count && guard < 200; guard++) {
    const s = Math.floor(rng() * S), c = Math.floor(rng() * K);
    const i = s * K + c;
    const name = `${String.fromCharCode(65 + s)}${c}`;
    const what = rng();
    let m = null;
    if (what < 0.45) {
      const t = (rule.turn[i] + 1 + Math.floor(rng() * 3)) & 3;
      m = { rule: withTurn(rule, s, c, t), label: `${name} turn ${TURNS[t]}` };
    } else if (what < 0.75) {
      const w = (rule.write[i] + 1 + Math.floor(rng() * (K - 1))) % K;
      m = { rule: withWrite(rule, s, c, w), label: `${name} paint ${w}` };
    } else if (S > 1) {
      const n = (rule.next[i] + 1 + Math.floor(rng() * (S - 1))) % S;
      m = { rule: withNext(rule, s, c, n), label: `${name} → ${String.fromCharCode(65 + n)}` };
    }
    if (!m) continue;
    if (lively(m.rule)) push(m.rule, m.label);
    else dull.push(m);
  }
  for (const m of dull) if (out.length < count) push(m.rule, m.label);
  return out;
}

/** Whether a single ant grows a patch at least 5 cells across in 3,000 steps, rather than spinning or running in a line. */
function lively(rule) {
  const N = 40;
  const w = new AntWorld(N, N);
  w.wrap = false;
  w.setRule(rule);
  w.clear();
  w.step(3000);
  let x0 = N, x1 = -1, y0 = N, y1 = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!w.grid[y * N + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 - x0 >= 4 && y1 - y0 >= 4;
}

function pickWeighted(cands, rng, count) {
  const pool = cands.slice();
  const out = [];
  while (out.length < count && pool.length) {
    let total = 0;
    for (const c of pool) total += c.w;
    let u = rng() * total, k = 0;
    while (k < pool.length - 1 && (u -= pool[k].w) > 0) k++;
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

// ---------------------------------------------------------------- world

export class AntWorld {
  constructor(W, H) {
    this.kind = 'ant';
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    this.wrap = true;
    this.gen = 0;
    // Where cell (0, 0) sits on the plane; growing the world to the left or up moves it.
    this.ox = 0;
    this.oy = 0;
    // On an unbounded canvas, a run stops as soon as an edge stops any ant, so the world can grow and it can carry on.
    this.open = false;
    this.count = 0;
    this._cap = 0;
    this._grow(8);
    this.setRule(antRule('RL'));
  }

  get states() {
    return this.rule.colors;
  }

  _grow(cap) {
    const old = this._cap ? { x: this.ax, y: this.ay, d: this.ad, s: this.as, a: this.alive } : null;
    this.ax = new Int32Array(cap);
    this.ay = new Int32Array(cap);
    this.ad = new Uint8Array(cap);
    this.as = new Uint8Array(cap);
    this.alive = new Uint8Array(cap);
    if (old) {
      this.ax.set(old.x);
      this.ay.set(old.y);
      this.ad.set(old.d);
      this.as.set(old.s);
      this.alive.set(old.a);
    }
    this._cap = cap;
  }

  setRule(rule) {
    const prevColors = this.rule ? this.rule.colors : MAX_COLORS;
    this.rule = rule;
    for (let k = 0; k < this.count; k++) if (this.as[k] >= rule.states) this.as[k] = 0;
    if (rule.colors < prevColors) this._foldColors();
    this._fuse();
  }

  // The hot loop reads one table entry per step. It is indexed by
  // (state << 6 | color << 2 | direction) and packs everything the step needs:
  //   bits 0–7    color to paint
  //   bits 8–17   the next index base (next state << 6 | new direction)
  //   bits 18–31  signed change of the cell index for the move (±1 or ±W)
  // so a step is: look up, paint, add the move. Rebuilt when the rule or width changes.
  _fuse() {
    const rule = this.rule, K = rule.colors, W = this.W;
    const move = [-W, 1, W, -1];
    const fused = new Int32Array(rule.states * 64);
    for (let s = 0; s < rule.states; s++) {
      for (let c = 0; c < 16; c++) {
        const i = s * K + (c % K);
        for (let d = 0; d < 4; d++) {
          const nd = (d + rule.turn[i]) & 3;
          fused[(s << 6) | (c << 2) | d] = rule.write[i] | (((rule.next[i] << 6) | nd) << 8) | (move[nd] << 18);
        }
      }
    }
    this.fused = fused;
  }

  _foldColors() {
    const g = this.grid, K = this.rule.colors;
    for (let i = 0; i < g.length; i++) if (g[i] >= K) g[i] %= K;
  }

  addAnt(x, y, d = 0, s = 0) {
    if (this.count >= MAX_ANTS) return -1;
    if (this.count === this._cap) this._grow(this._cap * 2);
    const k = this.count++;
    this.ax[k] = x;
    this.ay[k] = y;
    this.ad[k] = d & 3;
    this.as[k] = s < this.rule.states ? s : 0;
    this.alive[k] = 1;
    return k;
  }

  removeAnt(k) {
    const last = --this.count;
    this.ax[k] = this.ax[last];
    this.ay[k] = this.ay[last];
    this.ad[k] = this.ad[last];
    this.as[k] = this.as[last];
    this.alive[k] = this.alive[last];
  }

  antAt(x, y) {
    for (let k = this.count - 1; k >= 0; k--) if (this.ax[k] === x && this.ay[k] === y) return k;
    return -1;
  }

  get liveAnts() {
    let n = 0;
    for (let k = 0; k < this.count; k++) n += this.alive[k];
    return n;
  }

  /** Advances up to n steps and returns how many ran (fewer once every ant has walked off a walled edge). */
  step(n) {
    if (n <= 0 || this.count === 0) return 0;
    const done = this.count === 1 ? this._stepOne(n) : this._stepMany(n);
    this.gen += done;
    return done;
  }

  _stepOne(n) {
    if (!this.alive[0]) return 0;
    const g = this.grid, F = this.fused, W = this.W, N = g.length, wrap = this.wrap;
    let x = this.ax[0], at = this.ay[0] * W + x, base = (this.as[0] << 6) | this.ad[0];
    let i = 0;
    while (i < n) {
      const e = F[base | (g[at] << 2)];
      g[at] = e & 255;
      base = (e >> 8) & 1023;
      at += e >> 18;
      x += DX[base & 3];
      i++;
      // Moving sideways past an edge changes x; moving past the top or bottom leaves the buffer.
      if ((x >>> 0) >= W) {
        if (!wrap) {
          at -= e >> 18;
          x -= DX[base & 3];
          this.alive[0] = 0;
          break;
        }
        if (x < 0) {
          x = W - 1;
          at += W;
        } else {
          x = 0;
          at -= W;
        }
      } else if ((at >>> 0) >= N) {
        if (!wrap) {
          at -= e >> 18;
          this.alive[0] = 0;
          break;
        }
        at += at < 0 ? N : -N;
      }
    }
    this.ax[0] = x;
    this.ay[0] = (at - x) / W;
    this.ad[0] = base & 3;
    this.as[0] = base >> 6;
    return i;
  }

  _stepMany(n) {
    const g = this.grid, F = this.fused, W = this.W, N = g.length, wrap = this.wrap, count = this.count;
    const ax = this.ax, alive = this.alive;
    const at = new Int32Array(count), base = new Int32Array(count);
    for (let k = 0; k < count; k++) {
      at[k] = this.ay[k] * W + ax[k];
      base[k] = (this.as[k] << 6) | this.ad[k];
    }
    let i = 0, stop = false;
    while (i < n) {
      let moved = 0;
      for (let k = 0; k < count; k++) {
        if (!alive[k]) continue;
        moved = 1;
        const e = F[base[k] | (g[at[k]] << 2)];
        g[at[k]] = e & 255;
        const b = (e >> 8) & 1023;
        base[k] = b;
        let a = at[k] + (e >> 18);
        const x = ax[k] + DX[b & 3];
        if ((x >>> 0) >= W) {
          if (!wrap) {
            alive[k] = 0;
            stop = this.open;
            continue;
          }
          if (x < 0) {
            ax[k] = W - 1;
            a += W;
          } else {
            ax[k] = 0;
            a -= W;
          }
        } else {
          if ((a >>> 0) >= N) {
            if (!wrap) {
              alive[k] = 0;
              stop = this.open;
              continue;
            }
            a += a < 0 ? N : -N;
          }
          ax[k] = x;
        }
        at[k] = a;
      }
      if (!moved) break;
      i++;
      if (stop) break;
    }
    for (let k = 0; k < count; k++) {
      this.ay[k] = (at[k] - ax[k]) / W;
      this.ad[k] = base[k] & 3;
      this.as[k] = base[k] >> 6;
    }
    return i;
  }

  population() {
    const g = this.grid;
    let n = 0;
    for (let i = 0; i < g.length; i++) n += g[i] !== 0;
    return n;
  }

  get(x, y) {
    return this.grid[y * this.W + x];
  }

  set(x, y, v) {
    const i = y * this.W + x;
    if (this.grid[i] === v) return false;
    this.grid[i] = v;
    return true;
  }

  /** A blank world with a single ant in the middle, facing north. */
  clear() {
    this.grid.fill(0);
    this.placeAnts('one');
    this.gen = 0;
  }

  /** Starting arrangements: 'one', 'pair', 'quad' (four ants, one facing each way) or 'scatter'. */
  placeAnts(kind, rng = Math.random) {
    this.count = 0;
    const W = this.W, H = this.H, cx = W >> 1, cy = H >> 1;
    const r = Math.max(2, Math.round(Math.min(W, H) / 12));
    if (kind === 'pair') {
      this.addAnt(cx - r, cy, 0);
      this.addAnt(cx + r, cy, 2);
    } else if (kind === 'quad') {
      this.addAnt(cx - r, cy - r, 0);
      this.addAnt(cx + r, cy - r, 1);
      this.addAnt(cx + r, cy + r, 2);
      this.addAnt(cx - r, cy + r, 3);
    } else if (kind === 'scatter') {
      for (let i = 0; i < 12; i++) this.addAnt(Math.floor(rng() * W), Math.floor(rng() * H), Math.floor(rng() * 4));
    } else {
      this.addAnt(cx, cy, 0);
    }
  }

  randomize(density, rng) {
    const g = this.grid, K = this.rule.colors;
    for (let i = 0; i < g.length; i++) g[i] = rng() < density ? 1 + Math.floor(rng() * (K - 1)) : 0;
    this.gen = 0;
  }

  /** Adds empty cells on each side, leaving everything where it was on the plane. */
  grow(l, t, r, b) {
    this.grid = blit(this.grid, this.W, this.H, this.W + l + r, this.H + t + b, l, t);
    this.W += l + r;
    this.H += t + b;
    this.ox -= l;
    this.oy -= t;
    for (let k = 0; k < this.count; k++) {
      this.ax[k] += l;
      this.ay[k] += t;
    }
    this._fuse();
  }

  /** Where each stopped ant was heading when an edge stopped it: [k, x, y]. */
  blocked() {
    const out = [];
    for (let k = 0; k < this.count; k++) if (!this.alive[k]) out.push([k, this.ax[k] + DX[this.ad[k]], this.ay[k] + DY[this.ad[k]]]);
    return out;
  }

  /**
   * Finishes the moves edges stopped, once the world has room, and sets those ants going
   * again. A move that still leaves the world wraps around to the other side.
   */
  resumeBlocked() {
    for (const [k, x, y] of this.blocked()) {
      this.ax[k] = (x + this.W) % this.W;
      this.ay[k] = (y + this.H) % this.H;
      this.alive[k] = 1;
    }
  }

  resize(W, H) {
    const old = this.grid, oW = this.W, oH = this.H;
    const ox = (W - oW) >> 1, oy = (H - oH) >> 1;
    this.grid = blit(old, oW, oH, W, H, ox, oy);
    this.W = W;
    this.H = H;
    this.ox -= ox;
    this.oy -= oy;
    this._fuse();
    for (let k = this.count - 1; k >= 0; k--) {
      const x = this.ax[k] + ox, y = this.ay[k] + oy;
      if (x < 0 || y < 0 || x >= W || y >= H) this.removeAnt(k);
      else {
        this.ax[k] = x;
        this.ay[k] = y;
      }
    }
  }

  snapshot() {
    const n = this.count;
    return {
      W: this.W,
      H: this.H,
      ox: this.ox,
      oy: this.oy,
      grid: this.grid.slice(),
      gen: this.gen,
      ants: { x: this.ax.slice(0, n), y: this.ay.slice(0, n), d: this.ad.slice(0, n), s: this.as.slice(0, n), a: this.alive.slice(0, n) },
    };
  }

  restore(snap) {
    if (snap.W !== this.W || snap.H !== this.H) {
      this.W = snap.W;
      this.H = snap.H;
      this.grid = new Uint8Array(snap.W * snap.H);
      this._fuse();
    }
    this.grid.set(snap.grid);
    this.gen = snap.gen;
    this.ox = snap.ox ?? 0;
    this.oy = snap.oy ?? 0;
    const a = snap.ants, n = a.x.length;
    if (n > this._cap) this._grow(Math.max(n, this._cap * 2));
    this.ax.set(a.x);
    this.ay.set(a.y);
    this.ad.set(a.d);
    this.as.set(a.s);
    this.alive.set(a.a);
    this.count = n;
    for (let k = 0; k < n; k++) if (this.as[k] >= this.rule.states) this.as[k] = 0;
    if (this.rule.colors < MAX_COLORS) this._foldColors();
  }
}

/** Copies an oW×oH grid into a new W×H grid, offset by (ox, oy), cropping as needed. */
export function blit(src, oW, oH, W, H, ox, oy) {
  const dst = new src.constructor(W * H);
  const x0 = Math.max(0, ox), x1 = Math.min(W, oW + ox);
  if (x1 <= x0) return dst;
  for (let y = Math.max(0, oy); y < Math.min(H, oH + oy); y++) {
    const sy = y - oy;
    dst.set(src.subarray(sy * oW + (x0 - ox), sy * oW + (x1 - ox)), y * W + x0);
  }
  return dst;
}
