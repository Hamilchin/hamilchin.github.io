// Turing machines on a one-dimensional tape, drawn as space-time pictures.
//
// A head sits on one cell of the tape in one of a few states. Each step it reads
// the cell's color and, by its table, writes a color there, moves a cell left or
// right and takes a new state, or halts. Machines are written the way the Busy
// Beaver Challenge (bbchallenge.org) writes them: for each state in turn (A, B, …)
// and each color it may read, three characters, the color to write, L or R, and
// the next state, with Z for halt and --- for a case left undefined (which halts
// without writing); underscores separate the states. "1RB1LB_1LA1RZ" is the
// two-state busy beaver.
//
// The world is a picture that grows a line per step, like the elementary automata's:
// the tape after each step, with the head's cell in its state's color. Lines live in
// a ring buffer, so once the picture is full it scrolls. Only the newest line, the
// tape as it is now, can be drawn on.

export const MAX_STATES = 6;
export const MAX_COLORS = 4;
export const HALT = -1;
const KEEP = 255; // an undefined case: write nothing, stay, halt
const LETTERS = 'ABCDEF';

const letter = (s) => (s === HALT ? 'Z' : LETTERS[s]);

export function parseTuringRule(text) {
  const groups = String(text).trim().replace(/\s+/g, '').toUpperCase().split('_');
  const n = groups.length, k = groups[0].length / 3;
  if (!(n >= 1 && n <= MAX_STATES && Number.isInteger(k) && k >= 2 && k <= MAX_COLORS)) return null;
  const write = new Uint8Array(n * k), move = new Int8Array(n * k), next = new Int8Array(n * k);
  for (let s = 0; s < n; s++) {
    if (groups[s].length !== k * 3) return null;
    for (let c = 0; c < k; c++) {
      const op = groups[s].slice(c * 3, c * 3 + 3), i = s * k + c;
      if (op === '---') {
        [write[i], move[i], next[i]] = [KEEP, 0, HALT];
        continue;
      }
      const m = op.match(/^(\d)([LR])([A-Z])$/);
      if (!m || +m[1] >= k) return null;
      // H for halt is common too; with at most six states it can't be a state's name.
      const to = m[3] === 'Z' || m[3] === 'H' ? HALT : m[3].charCodeAt(0) - 65;
      if (to >= n) return null;
      [write[i], move[i], next[i]] = [+m[1], m[2] === 'R' ? 1 : -1, to];
    }
  }
  return { states: n, colors: k, write, move, next };
}

export function formatTuringRule({ states: n, colors: k, write, move, next }) {
  const groups = [];
  for (let s = 0; s < n; s++) {
    let g = '';
    for (let c = 0; c < k; c++) {
      const i = s * k + c;
      g += write[i] === KEEP ? '---' : `${write[i]}${move[i] > 0 ? 'R' : 'L'}${letter(next[i])}`;
    }
    groups.push(g);
  }
  return groups.join('_');
}

export const sameTuringRule = (a, b) => formatTuringRule(a) === formatTuringRule(b);

/** The name of a state, for the editor: A, B, …, or H for halt. */
export const stateLetter = (s) => (s === HALT ? 'H' : LETTERS[s]);

export const isDefined = (rule, s, c) => rule.write[s * rule.colors + c] !== KEEP;

function copy(rule) {
  return { states: rule.states, colors: rule.colors, write: rule.write.slice(), move: rule.move.slice(), next: rule.next.slice() };
}

/** Sets one case; an undefined case becomes defined, writing 0, moving right and halting, before the change. */
function edit(rule, s, c, fn) {
  const r = copy(rule), i = s * r.colors + c;
  if (r.write[i] === KEEP) [r.write[i], r.move[i], r.next[i]] = [0, 1, HALT];
  fn(r, i);
  return r;
}

export const withWrite = (rule, s, c, w) => edit(rule, s, c, (r, i) => (r.write[i] = w % r.colors));
export const withMove = (rule, s, c, m) => edit(rule, s, c, (r, i) => (r.move[i] = m > 0 ? 1 : -1));
/** Next state, counting through the states and then halt: n = states means halt. */
export const withNext = (rule, s, c, n) => edit(rule, s, c, (r, i) => (r.next[i] = n % (r.states + 1) === r.states ? HALT : n % (r.states + 1)));

/** More or fewer states. A new state writes the next color and moves right into state A; cases that went to a removed state halt. */
export function withStates(rule, n) {
  n = Math.min(MAX_STATES, Math.max(1, n));
  const k = rule.colors, r = { states: n, colors: k, write: new Uint8Array(n * k), move: new Int8Array(n * k), next: new Int8Array(n * k) };
  for (let s = 0; s < n; s++) {
    for (let c = 0; c < k; c++) {
      const i = s * k + c;
      if (s < rule.states) [r.write[i], r.move[i], r.next[i]] = [rule.write[i], rule.move[i], rule.next[i] >= n ? HALT : rule.next[i]];
      else [r.write[i], r.move[i], r.next[i]] = [(c + 1) % k, 1, 0];
    }
  }
  return r;
}

/** More or fewer colors. On a new color, a state writes 0, moves right and stays; writes of a removed color wrap around. */
export function withColors(rule, k) {
  k = Math.min(MAX_COLORS, Math.max(2, k));
  const n = rule.states, r = { states: n, colors: k, write: new Uint8Array(n * k), move: new Int8Array(n * k), next: new Int8Array(n * k) };
  for (let s = 0; s < n; s++) {
    for (let c = 0; c < k; c++) {
      const i = s * k + c, j = s * rule.colors + c;
      if (c < rule.colors) [r.write[i], r.move[i], r.next[i]] = [rule.write[j] === KEEP ? KEEP : rule.write[j] % k, rule.move[j], rule.next[j]];
      else [r.write[i], r.move[i], r.next[i]] = [0, 1, s];
    }
  }
  return r;
}

/** Runs a machine from a blank tape of width W, head in the middle, for up to `steps` steps, without wrapping. */
export function probe(rule, steps, W = 2 * steps + 1) {
  const tape = new Uint8Array(W), { colors: k, write, move, next } = rule;
  let head = W >> 1, state = 0, t = 0, lo = head, hi = head;
  for (; t < steps; t++) {
    const i = state * k + tape[head];
    if (write[i] === KEEP) break;
    tape[head] = write[i];
    head += move[i];
    if (head < 0 || head >= W) break;
    if (head < lo) lo = head;
    if (head > hi) hi = head;
    if (next[i] === HALT) {
      t++;
      break;
    }
    state = next[i];
  }
  let marks = 0;
  for (let x = 0; x < W; x++) marks += tape[x] !== 0;
  return { steps: t, range: hi - lo + 1, marks };
}

/**
 * A random machine with as many states and colors as the current one, that never
 * halts and does something worth watching: it wanders, but not off in a straight
 * line, and leaves a few marks behind.
 */
export function randomTuringRule(rng, current) {
  const n = current?.states ?? 2, k = current?.colors ?? 2;
  let best = null;
  for (let tries = 0; tries < 300; tries++) {
    const r = { states: n, colors: k, write: new Uint8Array(n * k), move: new Int8Array(n * k), next: new Int8Array(n * k) };
    for (let i = 0; i < n * k; i++) [r.write[i], r.move[i], r.next[i]] = [Math.floor(rng() * k), rng() < 0.5 ? -1 : 1, Math.floor(rng() * n)];
    const p = probe(r, 600);
    if (p.steps === 600 && p.range >= 12 && p.range <= 300 && p.marks >= 4) return r;
    if (!best || p.range > best.range) best = { r, range: p.range };
  }
  return best.r;
}

/** Machines one change away: another color written, the other way, or another next state (halting among them). */
export function turingMutations(rule, rng, count) {
  const out = [];
  const name = (s, c) => `${stateLetter(s)}${c}`;
  for (let s = 0; s < rule.states; s++) {
    for (let c = 0; c < rule.colors; c++) {
      const i = s * rule.colors + c;
      for (let w = 0; w < rule.colors; w++) if (w !== rule.write[i]) out.push({ rule: withWrite(rule, s, c, w), label: `${name(s, c)}: write ${w}` });
      out.push({ rule: withMove(rule, s, c, -rule.move[i] || 1), label: `${name(s, c)}: go ${rule.move[i] > 0 ? 'left' : 'right'}` });
      for (let n = 0; n <= rule.states; n++) {
        const to = n === rule.states ? HALT : n;
        if (to !== rule.next[i]) out.push({ rule: withNext(rule, s, c, n), label: `${name(s, c)}: then ${stateLetter(to)}` });
      }
    }
  }
  // A fair shuffle, so every kind of change gets a chance.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count);
}

export class TuringWorld {
  constructor(W, H) {
    this.kind = 'turing';
    this.wrap = true;
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    this.tape = new Uint8Array(W);
    this.gen = 0;
    // Where the picture's top-left cell sits on the plane; growing the world to the left moves it.
    this.ox = 0;
    this.oy = 0;
    this.head = W >> 1;
    this.state = 0;
    this.halted = false;
    this.offEdge = false; // halted by running into a wall rather than by its table
    this.rule = parseTuringRule('1RB1LB_1LA1RZ');
    this._draw();
  }

  /** Values in the picture: the tape's colors, then one for the head in each state, then one for a halted head. */
  get states() {
    return this.rule.colors + this.rule.states + 1;
  }

  /** Colors a brush can lay on the tape. */
  get paints() {
    return this.rule.colors;
  }

  /** A new machine takes over the tape as it stands. Colors and states it lacks fold into ones it has. */
  setRule(rule) {
    const old = this.rule;
    this.rule = rule;
    if (old && (old.colors !== rule.colors || old.states !== rule.states)) {
      // Repaint the history in the new machine's values.
      const map = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        if (v < old.colors) map[v] = v % rule.colors;
        else if (v - old.colors === old.states) map[v] = rule.colors + rule.states;
        else map[v] = rule.colors + Math.min(v - old.colors, rule.states - 1);
      }
      for (let i = 0; i < this.grid.length; i++) this.grid[i] = map[this.grid[i]];
      for (let x = 0; x < this.W; x++) this.tape[x] %= rule.colors;
    }
    if (this.state >= rule.states) this.state = 0;
    this.halted = this.offEdge = false;
    this._draw();
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

  /** Draws the newest line: the tape, and the head in its state's color. */
  _draw() {
    const at = (this.gen % this.H) * this.W;
    this.grid.set(this.tape, at);
    this.grid[at + this.head] = this.rule.colors + (this.halted ? this.rule.states : this.state);
  }

  /** Runs up to n steps; returns how many ran before the machine halted. */
  step(n) {
    const W = this.W, H = this.H, tape = this.tape, grid = this.grid;
    const { colors: k, states: S, write, move, next } = this.rule;
    let head = this.head, state = this.state, gen = this.gen, s = 0;
    for (; s < n && !this.halted; s++) {
      const i = state * k + tape[head];
      if (write[i] === KEEP) this.halted = true;
      else {
        tape[head] = write[i];
        let x = head + move[i];
        if (x < 0 || x >= W) {
          // Past the edge of a walled world there's no tape: the machine stops at the edge.
          if (this.wrap) x = (x + W) % W;
          else [x, this.halted, this.offEdge] = [head, true, true];
        }
        head = x;
        if (next[i] === HALT) this.halted = true;
        else state = next[i];
      }
      gen++;
      const at = (gen % H) * W;
      grid.set(tape, at);
      grid[at + head] = k + (this.halted ? S : state);
    }
    this.head = head;
    this.state = state;
    this.gen = gen;
    return s;
  }

  /** Marked cells on the tape now. */
  population() {
    let n = 0;
    for (let x = 0; x < this.W; x++) n += this.tape[x] !== 0;
    return n;
  }

  /** Cell at column x of row y of the picture (0 = top). */
  get(x, y) {
    return this.grid[((this.topGen + y) % this.H) * this.W + x];
  }

  /** Paints a cell of the tape, on the newest line: the only one that can change. */
  set(x, y, v) {
    if (y !== this.currentRow) return false;
    v %= this.rule.colors;
    if (this.tape[x] === v) return false;
    this.tape[x] = v;
    this._draw();
    return true;
  }

  /** Puts the head on a cell of the tape, in state A, ready to go. */
  placeHead(x) {
    this.head = Math.min(this.W - 1, Math.max(0, x));
    this.state = 0;
    this.halted = this.offEdge = false;
    this._draw();
  }

  /** A blank tape, the head in the middle in state A. */
  clear() {
    this.grid.fill(0);
    this.tape.fill(0);
    this.gen = 0;
    this.head = this.W >> 1;
    this.state = 0;
    this.halted = this.offEdge = false;
    this._draw();
  }

  /** A tape of random marks, each cell marked with probability `density`. */
  randomize(density, rng) {
    this.clear();
    const k = this.rule.colors;
    for (let x = 0; x < this.W; x++) this.tape[x] = rng() < density ? 1 + Math.floor(rng() * (k - 1)) : 0;
    this._draw();
  }

  /** 'blank', or { random: density }. */
  seedWith(spec, rng) {
    if (spec && spec.random != null) this.randomize(spec.random, rng);
    else this.clear();
  }

  /** Adds tape at the sides and room below for more lines, leaving everything where it was on the plane. */
  grow(l, t, r, b) {
    const old = this.grid, oW = this.W, oH = this.H, top = this.topGen;
    this.W = oW + l + r;
    this.H = oH + b;
    this.grid = new Uint8Array(this.W * this.H);
    for (let g = top; g <= this.gen; g++) this.grid.set(old.subarray((g % oH) * oW, (g % oH + 1) * oW), (g % this.H) * this.W + l);
    const tape = new Uint8Array(this.W);
    tape.set(this.tape, l);
    this.tape = tape;
    this.head += l;
    this.ox -= l;
  }

  /** Whether the head is within m cells of the left or right side: [left, right]. */
  nearSides(m) {
    return [this.head < m, this.head >= this.W - m];
  }

  /** Keeps the newest lines that fit, centered. */
  resize(W, H) {
    const old = this.grid, oW = this.W, oH = this.H, gen = this.gen, dx = (W - oW) >> 1;
    this.ox -= dx;
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    for (let t = Math.max(0, gen - Math.min(oH, H) + 1); t <= gen; t++) {
      const src = (t % oH) * oW, dst = (t % H) * W;
      for (let x = 0; x < oW; x++) if (x + dx >= 0 && x + dx < W) this.grid[dst + x + dx] = old[src + x];
    }
    const tape = new Uint8Array(W);
    for (let x = 0; x < oW; x++) if (x + dx >= 0 && x + dx < W) tape[x + dx] = this.tape[x];
    this.tape = tape;
    this.head = Math.min(W - 1, Math.max(0, this.head + dx));
    this._draw();
  }

  snapshot() {
    return { W: this.W, H: this.H, ox: this.ox, oy: this.oy, grid: this.grid.slice(), tape: this.tape.slice(), gen: this.gen, head: this.head, state: this.state, halted: this.halted, offEdge: this.offEdge };
  }

  restore(snap) {
    if (snap.W !== this.W || snap.H !== this.H) {
      this.W = snap.W;
      this.H = snap.H;
      this.grid = new Uint8Array(snap.W * snap.H);
      this.tape = new Uint8Array(snap.W);
    }
    this.grid.set(snap.grid);
    this.gen = snap.gen;
    this.ox = snap.ox ?? 0;
    this.oy = snap.oy ?? 0;
    if (snap.tape) this.tape.set(snap.tape);
    this.head = snap.head ?? this.W >> 1;
    this.state = Math.min(snap.state ?? 0, this.rule.states - 1);
    this.halted = !!snap.halted;
    this.offEdge = !!snap.offEdge;
  }

  /**
   * Takes the tape from the newest line of the picture, as from a link: the head's
   * own cell shows its state there, so the color under it is given separately.
   */
  readTape(head, state, under, halted = false) {
    const at = (this.gen % this.H) * this.W, k = this.rule.colors;
    for (let x = 0; x < this.W; x++) this.tape[x] = this.grid[at + x] < k ? this.grid[at + x] : 0;
    this.head = Math.min(this.W - 1, Math.max(0, head));
    this.tape[this.head] = under % k;
    this.state = Math.min(state, this.rule.states - 1);
    this.halted = halted;
    this._draw();
  }
}
