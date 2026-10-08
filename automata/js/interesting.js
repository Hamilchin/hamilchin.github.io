// Interesting mode draws from this catalog: one-dimensional rules picked for being
// worth watching, each from a single cell unless it says otherwise.
//
// They were found by running every rule in five families from a single cell, keeping
// those whose pictures keep growing without settling into stripes, counting how many
// different 3×3 patches each picture holds (few for simple rules, more for nested
// ones, most for chaotic and complex ones), dropping rules whose picture is another's
// or its mirror image, and then choosing by eye among what was left.
//
//   Elementary: two colors, three cells. Rule 30 is chaotic, Rule 110 complex
//   (it can compute anything), and the rest draw Sierpiński-like nests. Started
//   from a strip of random cells, Rule 110 shows its gliders and Rule 30 its chaos.
//
//   Reversible: an elementary rule with memory, where the new cell is the rule's
//   value combined with the cell two lines up (Wolfram's "R" rules). Running such a
//   rule backwards undoes it exactly; from one cell many draw nested diamonds.
//
//   Range 2: two colors, each cell seeing two cells to each side, by their sum.
//
//   Three colors: totalistic rules by Wolfram's code, among them 1599, famous for
//   carrying on for hundreds of steps before it settles.
//
//   Three colors, range 2: both at once, for big, blotchy textures.

const digits = (n, base, len) => Uint8Array.from({ length: len }, (_, i) => Math.floor(n / base ** i) % base);

const elementary = (n, extra = {}) => ({ name: `Rule ${n}`, k: 2, r: 1, tot: false, out: digits(n, 2, 8), seed: 1, ...extra });
const reversible = (n) => ({ ...elementary(n), name: `Rule ${n}R`, mem: true, note: 'reversible' });
const totalistic = (code, k, r, extra = {}) => ({ name: r > 1 ? `Code ${code}, range ${r}` : `Code ${code}`, k, r, tot: true, out: digits(code, k, (2 * r + 1) * (k - 1) + 1), seed: 1, ...extra });

export const INTERESTING = [
  [30, 86, 110, 124, 150, 126, 22, 182, 60, 102, 18].map((n) => elementary(n)).concat(
    elementary(110, { name: 'Rule 110, from a random strip', block: 48 }),
    elementary(30, { name: 'Rule 30, from a random strip', block: 48 }),
  ),
  [150, 60, 38, 34, 142, 158, 190, 156, 28].map(reversible),
  [50, 42, 38, 14, 30, 22, 26, 10, 46, 2].map((code) => totalistic(code, 2, 2)),
  // A few look their best grown from a cell of the second color.
  [1635, 1038, 2049, 1599, 1878, 867, 2040, [885, 2], 1479, 147, [468, 2], 66, 1965, [63, 2], 1596]
    .map((c) => (Array.isArray(c) ? totalistic(c[0], 3, 1, { seed: c[1] }) : totalistic(c, 3, 1)))
    .concat(totalistic(1599, 3, 1, { name: 'Code 1599, from a random strip', block: 48 })),
  [85155, 24045, 6762, 38535, 103593, 126987, 24213].map((code) => totalistic(code, 3, 2)),
];
