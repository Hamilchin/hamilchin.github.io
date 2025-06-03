presetAnts = {
  classic: {
    name: "Classic Langton's Ant",
    states: 1,
    colors: 2,
    transitions: [
      { newColor: 1, turn: 1, nextState: 0 }, // state 0, color 0
      { newColor: 0, turn: 0, nextState: 0 }, // state 0, color 1
      { newColor: 0, turn: 1, nextState: 0 }  // state 0, color -1 (fallback)
    ]
  },
  extended: {
    name: "Extended Langton's Ant",
    states: 2,
    colors: 4,
    transitions: [
      { newColor: 1, turn: 1, nextState: 0 }, // s0,c0
      { newColor: 2, turn: 0, nextState: 1 }, // s0,c1
      { newColor: 3, turn: 1, nextState: 0 }, // s0,c2
      { newColor: 0, turn: 0, nextState: 0 }, // s0,c3
      { newColor: 3, turn: 0, nextState: 1 }, // s1,c0
      { newColor: 0, turn: 1, nextState: 0 }, // s1,c1
      { newColor: 1, turn: 0, nextState: 1 }, // s1,c2
      { newColor: 2, turn: 1, nextState: 0 }, // s1,c3
      { newColor: 0, turn: 1, nextState: 0 }, // s0,c-1 (fallback)
      { newColor: 0, turn: 1, nextState: 0 }  // s1,c-1 (fallback)
    ]
  },
  threeColor: {
    name: "Three-Color Ant",
    states: 1,
    colors: 3,
    transitions: [
      { newColor: 1, turn: 1, nextState: 0 }, // s0,c0
      { newColor: 2, turn: 1, nextState: 0 }, // s0,c1
      { newColor: 0, turn: 1, nextState: 0 }, // s0,c2
      { newColor: 0, turn: 0, nextState: 0 }  // s0,c-1 (fallback)
    ]
  }
}; 