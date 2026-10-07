// The library: well-known rules with the starting conditions that show them off.

export const LIFE_PRESETS = [
  { name: "Conway's Life", rule: 'B3/S23', seed: { density: 0.35 } },
  { name: 'HighLife', rule: 'B36/S23', seed: { density: 0.35 } },
  { name: 'Day & Night', rule: 'B3678/S34678', seed: { density: 0.5 } },
  { name: 'Seeds', rule: 'B2/S', seed: { density: 0.3, area: 0.12 } },
  { name: 'Replicator', rule: 'B1357/S1357', seed: { density: 0.3, area: 0.05 } },
  { name: 'Maze', rule: 'B3/S12345', seed: { density: 0.3, area: 0.25 } },
  { name: 'Life without Death', rule: 'B3/S012345678', seed: { density: 0.2, area: 0.3 } },
  { name: 'Anneal', rule: 'B4678/S35678', seed: { density: 0.5 } },
  { name: 'Diamoeba', rule: 'B35678/S5678', seed: { density: 0.5 } },
  { name: '2×2', rule: 'B36/S125', seed: { density: 0.35 } },
  { name: 'Assimilation', rule: 'B345/S4567', seed: { density: 0.3, area: 0.3 } },
  { name: 'Coagulations', rule: 'B378/S235678', seed: { density: 0.35 } },
  { name: 'Walled Cities', rule: 'B45678/S2345', seed: { density: 0.35 } },
  { name: 'Long Life', rule: 'B345/S5', seed: { density: 0.35 } },
  { name: 'Amoeba', rule: 'B357/S1358', seed: { density: 0.35 } },
  { name: 'Serviettes', rule: 'B234/S', seed: { density: 0.25, area: 0.06 } },
  { name: 'Gnarl', rule: 'B1/S1', seed: { single: true } },
  { name: 'Vote', rule: 'B5678/S45678', seed: { density: 0.5 } },
];

export const ELEMENTARY_PRESETS = [
  { name: 'Rule 30', rule: 30, seed: 'single' },
  { name: 'Rule 90', rule: 90, seed: 'single' },
  { name: 'Rule 110', rule: 110, seed: 'single' },
  { name: 'Rule 184', rule: 184, seed: { random: 0.45 } },
  { name: 'Rule 150', rule: 150, seed: 'single' },
  { name: 'Rule 54', rule: 54, seed: { random: 0.5 } },
  { name: 'Rule 45', rule: 45, seed: 'single' },
  { name: 'Rule 73', rule: 73, seed: { random: 0.5 } },
  { name: 'Rule 22', rule: 22, seed: 'single' },
  { name: 'Rule 60', rule: 60, seed: 'single' },
  { name: 'Rule 126', rule: 126, seed: 'single' },
  { name: 'Rule 18', rule: 18, seed: { random: 0.5 } },
  { name: 'Rule 137', rule: 137, seed: 'single' },
  { name: 'Rule 169', rule: 169, seed: { random: 0.5 } },
  { name: 'Rule 225', rule: 225, seed: 'single' },
];

// Ant rules list the turn taken on each color. Turmites use Ed Pegg Jr.'s digit
// notation: for each state and color, the color to paint, a turn code
// (1 straight, 2 right, 4 U-turn, 8 left) and the next state.
export const ANT_PRESETS = [
  { name: "Langton's ant", rule: 'RL', steps: 11500 },
  { name: 'Chaotic growth', rule: 'RLR', steps: 400000 },
  { name: 'Symmetric growth', rule: 'LLRR', steps: 1200000 },
  { name: 'Square filler', rule: 'LRRRRRLLR', steps: 350000 },
  { name: 'Convoluted highway', rule: 'LLRRRLRLRLLR', steps: 45000 },
  { name: 'Moving triangle', rule: 'RRLLLRLLLRRR', steps: 140000 },
  { name: 'Diamond spiral', rule: 'LRRRRLLLRRR', steps: 400000 },
  { name: 'Framed square', rule: 'LRRL', steps: 1500000 },
  { name: 'Pinwheel', rule: 'LLRRRLRRRRR', steps: 1500000 },
  { name: 'Striped triangle', rule: 'RRLRLLRRRRRR', steps: 400000 },
  { name: 'Crossed square', rule: 'RRLRR', steps: 600000 },
  { name: 'Fibonacci spiral', rule: '181181121010', steps: 110000 },
  { name: 'Filled spiral', rule: '181010110120', steps: 170000 },
  { name: 'Nested cabinets', rule: '181121110011', steps: 100000 },
  { name: 'Woven placemat', rule: '021021110021', steps: 1500000 },
  { name: 'Box spiral', rule: '011081120011', steps: 150000 },
  { name: 'Striped spiral', rule: '021080181020', steps: 180000 },
  { name: 'Square spiral', rule: '120081180021', steps: 1500000 },
  { name: 'Coiled rope', rule: '111180121010', steps: 420000 },
  { name: 'Stepped pyramid', rule: '021080181110', steps: 60000 },
  { name: 'Maze', rule: '181181110012081111', steps: 900000 },
];
