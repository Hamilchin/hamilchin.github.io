// Turing machines on a one-dimensional tape, drawn as space-time pictures.
//
// A head sits on one cell of the tape in one of a few states. Each step it reads
// the cell's color and, by its table, writes a color there, moves a cell left or
// right and takes a new state, or halts. Machines are written the way the Busy
// Beaver Challenge (bbchallenge.org) writes them: for each state in turn (A, B, …)
// and each color it may read, three characters, the color to write, L or R, and
// the next state, with Z for halt and --- for a case left undefined (which halts
// without writing); underscores separate the states. "1RB1LB_1LA1RZ" is the
// two-state busy beaver. Past Y, states take two letters, AA, AB, … (never Z), so
// a machine can have hundreds of them, though the editor builds them only up to six.
//
// Any number of machines can share one tape, each with its own table, place and
// state; a click starts a random one. On every step they take turns, oldest first,
// each reading whatever the ones before it wrote. They all use the tape's colors,
// but each can have as many states as it likes. The newest is the one whose table
// the editor shows.
//
// The world is a picture that grows a line per step, like the elementary automata's:
// the tape after each step, with each head's cell in its state's color. A machine
// that halts shows gray on the line where it stopped, and nothing after. Lines live
// in a ring buffer, so once the picture is full it scrolls. Only the newest line,
// the tape as it is now, can be drawn on.

// States a machine can have in the editor, and in all.
export const MAX_STATES = 6;
const MOST_STATES = 25 * 26;
export const MAX_COLORS = 4;
export const HALT = -1;
const KEEP = 255; // an undefined case: write nothing, stay, halt
const MAX_MACHINES = 256;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXY';

/** A state's name: A to Y, then AA, AB, … */
function stateName(s) {
  let name = '';
  for (s++; s > 0; s = Math.floor(s / 25)) name = LETTERS[--s % 25] + name;
  return name;
}

const letter = (s) => (s === HALT ? 'Z' : stateName(s));

// One case: the color to write, L or R, and the next state; or --- for undefined.
const OP = /---|\d[LR][A-Z]+/g;

const blank = (n, k) => ({ states: n, colors: k, write: new Uint8Array(n * k), move: new Int8Array(n * k), next: new Int16Array(n * k) });

export function parseTuringRule(text) {
  const groups = String(text).trim().replace(/\s+/g, '').toUpperCase().split('_');
  const n = groups.length, k = groups[0].match(OP)?.length;
  if (!(n >= 1 && n <= MOST_STATES && k >= 2 && k <= MAX_COLORS)) return null;
  const r = blank(n, k), { write, move, next } = r;
  for (let s = 0; s < n; s++) {
    const ops = groups[s].match(OP);
    if (!ops || ops.length !== k || ops.join('') !== groups[s]) return null;
    for (let c = 0; c < k; c++) {
      const op = ops[c], i = s * k + c;
      if (op === '---') {
        [write[i], move[i], next[i]] = [KEEP, 0, HALT];
        continue;
      }
      if (+op[0] >= k) return null;
      // H for halt is common too, in machines too small to have a state H.
      let to = HALT;
      const name = op.slice(2);
      if (name !== 'Z' && !(name === 'H' && n < 8)) {
        if (name.includes('Z')) return null;
        to = 0;
        for (const ch of name) to = to * 25 + ch.charCodeAt(0) - 64;
        to--;
        if (to >= n) return null;
      }
      [write[i], move[i], next[i]] = [+op[0], op[1] === 'R' ? 1 : -1, to];
    }
  }
  return r;
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
export const stateLetter = (s) => (s === HALT ? 'H' : stateName(s));

/** The color its head shows in, after the tape's: one of MAX_STATES, which a machine with more states goes around. */
export const headColor = (s) => s % MAX_STATES;

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

/**
 * More or fewer states, up to MAX_STATES, or as many as it has. A new state writes the
 * next color and moves right into state A; cases that went to a removed state halt.
 */
export function withStates(rule, n) {
  n = Math.min(Math.max(MAX_STATES, rule.states), Math.max(1, n));
  const k = rule.colors, r = blank(n, k);
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
  const n = rule.states, r = blank(n, k);
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
  const n = Math.min(MAX_STATES, current?.states ?? 2), k = current?.colors ?? 2;
  let best = null;
  for (let tries = 0; tries < 300; tries++) {
    const r = blank(n, k);
    for (let i = 0; i < n * k; i++) [r.write[i], r.move[i], r.next[i]] = [Math.floor(rng() * k), rng() < 0.5 ? -1 : 1, Math.floor(rng() * n)];
    const p = probe(r, 600);
    if (p.steps === 600 && p.range >= 12 && p.range <= 300 && p.marks >= 4) return r;
    if (!best || p.range > best.range) best = { r, range: p.range };
  }
  return best.r;
}

/**
 * Machines one change away: another color written, the other way, or another next
 * state (halting among them). A big machine has a great many, so only the chosen are built.
 */
export function turingMutations(rule, rng, count) {
  const out = [];
  const name = (s, c) => `${stateLetter(s)}${c}`;
  for (let s = 0; s < rule.states; s++) {
    for (let c = 0; c < rule.colors; c++) {
      const i = s * rule.colors + c;
      for (let w = 0; w < rule.colors; w++) if (w !== rule.write[i]) out.push(() => ({ rule: withWrite(rule, s, c, w), label: `${name(s, c)}: write ${w}` }));
      out.push(() => ({ rule: withMove(rule, s, c, -rule.move[i] || 1), label: `${name(s, c)}: go ${rule.move[i] > 0 ? 'left' : 'right'}` }));
      for (let n = 0; n <= rule.states; n++) {
        const to = n === rule.states ? HALT : n;
        if (to !== rule.next[i]) out.push(() => ({ rule: withNext(rule, s, c, n), label: `${name(s, c)}: then ${stateLetter(to)}` }));
      }
    }
  }
  // A fair shuffle, so every kind of change gets a chance.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count).map((make) => make());
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
    // The machines, oldest first: { rule, x, state, halted, offEdge, born, stop }, where
    // `offEdge` says it halted by running into a wall rather than by its table, and
    // `born` and `stop` are the steps it started and halted on.
    this.machines = [];
    // The newest machine's table, which a fresh tape starts with too.
    this.rule = parseTuringRule('1RB1LB_1LA1RZ');
    this.clear();
  }

  /** Values in the picture: the tape's colors, then a head in each of its colors, then a head that has halted. */
  get states() {
    return this.rule.colors + MAX_STATES + 1;
  }

  /** Colors a brush can lay on the tape. */
  get paints() {
    return this.rule.colors;
  }

  get newest() {
    return this.machines[this.machines.length - 1] || null;
  }

  /** Whether no machine is left running. */
  get halted() {
    return !this.machines.some((m) => !m.halted);
  }

  /** Whether a machine stopped by running into the edge of a walled tape. */
  get offEdge() {
    return this.machines.some((m) => m.offEdge);
  }

  _machine(rule, x) {
    return { rule, x: Math.min(this.W - 1, Math.max(0, x)), state: 0, halted: false, offEdge: false, born: this.gen, stop: -1 };
  }

  /**
   * The newest machine takes a new table and carries on from where it is, halted or
   * not. Another number of colors changes the tape under every machine: colors it
   * loses fold into ones it keeps, and the other machines' tables follow along.
   */
  setRule(rule) {
    const old = this.rule, k = rule.colors;
    this.rule = rule;
    if (old.colors !== k) {
      const map = new Uint8Array(256);
      for (let v = 0; v < 256; v++) map[v] = v < old.colors ? v % k : Math.min(255, v - old.colors + k);
      for (let i = 0; i < this.grid.length; i++) this.grid[i] = map[this.grid[i]];
      for (let x = 0; x < this.W; x++) this.tape[x] %= k;
      for (const m of this.machines) m.rule = withColors(m.rule, k);
    }
    const m = this.newest;
    if (m) {
      m.rule = rule;
      if (m.state >= rule.states) m.state = 0;
      m.halted = m.offEdge = false;
    }
    this._draw();
  }

  /**
   * Starts another machine at column x in state A, on the tape as it stands; it becomes
   * the newest. Machines that halted before this step make way.
   */
  spawn(x, rule) {
    if (rule.colors !== this.rule.colors) rule = withColors(rule, this.rule.colors);
    this.machines = this.machines.filter((m) => !m.halted || m.stop === this.gen);
    if (this.machines.length >= MAX_MACHINES) this.machines.shift();
    const m = this._machine(rule, x);
    this.machines.push(m);
    this.rule = rule;
    this._draw();
    return m;
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

  /** Draws line `gen` of the picture: the tape, each running head in its state's color, and the heads that halted on this step. */
  _line(gen) {
    const at = (gen % this.H) * this.W, k = this.rule.colors, grid = this.grid;
    grid.set(this.tape, at);
    for (const m of this.machines) if (!m.halted || m.stop === gen) grid[at + m.x] = k + (m.halted ? MAX_STATES : headColor(m.state));
  }

  _draw() {
    this._line(this.gen);
  }

  /** Runs up to n steps; returns how many ran before every machine had halted. */
  step(n) {
    const W = this.W, tape = this.tape, ms = this.machines, k = this.rule.colors;
    let s = 0;
    for (; s < n; s++) {
      const gen = this.gen + 1;
      let live = false;
      for (const m of ms) {
        if (m.halted) continue;
        live = true;
        const i = m.state * k + tape[m.x], { write, move, next } = m.rule;
        if (write[i] === KEEP) {
          [m.halted, m.stop] = [true, gen];
          continue;
        }
        tape[m.x] = write[i];
        let x = m.x + move[i];
        if (x < 0 || x >= W) {
          // Past the edge of a walled world there's no tape: the machine stops at the edge.
          if (this.wrap) x = (x + W) % W;
          else [x, m.halted, m.offEdge] = [m.x, true, true];
        }
        m.x = x;
        if (next[i] === HALT) m.halted = true;
        else m.state = next[i];
        if (m.halted) m.stop = gen;
      }
      if (!live) break;
      this.gen = gen;
      this._line(gen);
    }
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

  /** A blank tape, and on it the newest machine alone, in the middle, in state A. */
  clear() {
    this.grid.fill(0);
    this.tape.fill(0);
    this.gen = 0;
    this.machines = [this._machine(this.rule, this.W >> 1)];
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
    for (const m of this.machines) m.x += l;
    this.ox -= l;
  }

  /** Whether a running head is within m cells of the left or right side: [left, right]. */
  nearSides(m) {
    let l = false, r = false;
    for (const h of this.machines) {
      if (h.halted) continue;
      if (h.x < m) l = true;
      if (h.x >= this.W - m) r = true;
    }
    return [l, r];
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
    for (const m of this.machines) m.x = Math.min(W - 1, Math.max(0, m.x + dx));
    this._draw();
  }

  snapshot() {
    return { W: this.W, H: this.H, ox: this.ox, oy: this.oy, grid: this.grid.slice(), tape: this.tape.slice(), gen: this.gen, rule: this.rule, machines: this.machines.map((m) => ({ ...m })) };
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
    if (snap.rule) this.rule = snap.rule;
    this.machines = (snap.machines || []).map((m) => ({ ...m }));
  }

  /**
   * Puts machines on the tape as a link describes them, oldest first: { x, s, c, halted, rule }.
   * Unless a random fill already made the tape, it's read from the newest line of the
   * picture, where each head's cell shows its state, so the color under it comes separately.
   */
  load(list, fromPicture = true) {
    const at = (this.gen % this.H) * this.W, k = this.rule.colors;
    if (fromPicture) for (let x = 0; x < this.W; x++) this.tape[x] = this.grid[at + x] < k ? this.grid[at + x] : 0;
    this.machines = list.map((d) => {
      const m = this._machine(d.rule.colors === k ? d.rule : withColors(d.rule, k), d.x);
      if (fromPicture) this.tape[m.x] = d.c % k;
      m.state = Math.min(d.s, m.rule.states - 1);
      if (d.halted) [m.halted, m.stop] = [true, this.gen];
      return m;
    });
    if (this.machines.length) this.rule = this.newest.rule;
    this._draw();
  }
}
