// Shareable links, and the library's saved worlds. A link carries the rule, colors
// and world settings and the world exactly as it is: every cell, every ant (or a
// Turing machine's head) and the step count. Grids are bit-packed and deflated; an untouched random fill is sent
// as the seed that made it.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) s += B64[n & 63];
  }
  return s;
}

function fromBase64Url(s) {
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const canDeflate = typeof CompressionStream === 'function';

/** Packs cells at `bits` bits each (1, 2, 4 or 8), then deflates. */
export async function packCells(cells, bits) {
  const perByte = 8 / bits;
  const packed = new Uint8Array(Math.ceil(cells.length / perByte));
  for (let i = 0; i < cells.length; i++) packed[(i / perByte) | 0] |= (cells[i] & ((1 << bits) - 1)) << ((i % perByte) * bits);
  if (canDeflate) return 'z' + toBase64Url(await pipe(packed, new CompressionStream('deflate-raw')));
  return 'r' + toBase64Url(packed);
}

export async function unpackCells(text, length, bits) {
  let bytes = fromBase64Url(text.slice(1));
  if (text[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  const perByte = 8 / bits, mask = (1 << bits) - 1;
  const cells = new Uint8Array(length);
  for (let i = 0; i < length; i++) cells[i] = (bytes[(i / perByte) | 0] >> ((i % perByte) * bits)) & mask;
  return cells;
}

export const bitsFor = (states) => (states <= 2 ? 1 : states <= 4 ? 2 : states <= 16 ? 4 : 8);

/**
 * s: { mode, rule, W, H, ox, oy (where the world sits on the plane), wrap, palette: { id } | { colors }, states, gen,
 *      grid, recipe: { seed, density, area } | null, ants: [{ x, y, d, s, alive }], view: { cx, cy, zoom } }
 */
export async function encodeState(s) {
  const q = new URLSearchParams();
  q.set('m', s.mode);
  q.set('r', s.rule);
  q.set('s', `${s.W}x${s.H}`);
  if (s.ox || s.oy) q.set('o', `${s.ox}_${s.oy}`);
  q.set('e', s.wrap ? 'w' : 'b');
  if (s.palette.id) q.set('p', s.palette.id);
  else q.set('c', s.palette.colors.map((c) => c.replace('#', '')).join('-'));
  if (s.recipe) q.set('d', `*${s.recipe.seed}_${s.recipe.density}_${s.recipe.area ?? 1}`);
  else if (s.grid.some((v) => v)) q.set('d', await packCells(s.grid, bitsFor(s.states)));
  if (s.ants && s.ants.length) q.set('a', s.ants.map((a) => `${a.x}.${a.y}.${a.d}.${a.s}${a.alive ? '' : '.0'}`).join('_'));
  // A Turing machine's head: where it is, its state, the color under it, and whether it has halted.
  if (s.head) q.set('t', `${s.head.x}.${s.head.s}.${s.head.c}${s.head.halted ? '.h' : ''}`);
  if (s.gen) q.set('g', s.gen);
  if (s.view) q.set('v', [s.view.cx, s.view.cy, s.view.zoom].map((v) => +v.toFixed(2)).join('_'));
  return q.toString();
}

export async function decodeState(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const mode = q.get('m');
  if (!['life', 'eca', 'ant', 'turing'].includes(mode)) return null;
  const [W, H] = (q.get('s') || '').split('x').map(Number);
  if (!(W > 0 && H > 0)) return null;
  const [ox, oy] = (q.get('o') || '0_0').split('_').map((v) => Math.round(+v) || 0);
  const out = {
    mode,
    rule: q.get('r'),
    W,
    H,
    ox,
    oy,
    wrap: q.get('e') !== 'b',
    palette: q.get('p') ? { id: q.get('p') } : q.get('c') ? { colors: q.get('c').split('-').map((c) => '#' + c) } : null,
    gen: +q.get('g') || 0,
    data: q.get('d'),
    ants: q.get('a')
      ? q.get('a').split('_').map((t) => {
          const [x, y, d, s, alive] = t.split('.').map(Number);
          return { x, y, d: d || 0, s: s || 0, alive: alive !== 0 };
        })
      : [],
    head: null,
    view: null,
  };
  if (q.get('t')) {
    const [x, st, c, h] = q.get('t').split('.');
    out.head = { x: Math.round(+x) || 0, s: Math.round(+st) || 0, c: Math.round(+c) || 0, halted: h === 'h' };
  }
  if (q.get('v')) {
    const [cx, cy, zoom] = q.get('v').split('_').map(Number);
    if ([cx, cy, zoom].every(isFinite) && zoom > 0) out.view = { cx, cy, zoom };
  }
  return out;
}

/** The cells a grid field holds, or null for an empty grid or a random-fill recipe. */
export async function gridCells(data, length, states) {
  if (!data || data[0] === '*') return null;
  return unpackCells(data, length, bitsFor(states));
}

/** The seed, density and area of a random-fill recipe, or null. */
export function gridRecipe(data) {
  if (!data || data[0] !== '*') return null;
  const [seed, density, area] = data.slice(1).split('_').map(Number);
  return { seed, density, area };
}
