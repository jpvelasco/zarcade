// The campaign: five worlds that introduce one idea at a time. Each level
// has a reference solution; tests check it solves the level within limits
// and par, and solvers check par is fair.
//
// Map tokens: '.' void, height digit, optional colour r/b, optional item
// L (lamp) or B (battery). start: [x, y, facing]. ops: allowed tiles
// (F L R J * G, 1 = P1 call, ^ = P1 may call itself, @ = Repeat, c = colours).

export const WORLDS = [
  { id: 1, name: 'Tinker Yard', idea: 'Sequences', icon: 'F', theme: 'yard' },
  { id: 2, name: 'Loop Lagoon', idea: 'Loops', icon: '@', theme: 'lagoon' },
  { id: 3, name: 'Gear Works', idea: 'Procedures', icon: '1', theme: 'gears' },
  { id: 4, name: 'Rainbow Relay', idea: 'Conditions', icon: 'c', theme: 'rainbow' },
  { id: 5, name: 'Star Circuit', idea: 'Everything', icon: '*', theme: 'stars' },
];

const W1 = [
  {
    id: '1-1', name: 'Hello, Bolt!', teach: 'F*',
    map: ['0 0 0L'],
    start: [0, 0, 'E'], ops: 'F*', limits: { main: 6 }, par: 3,
    solution: { main: 'F F *' },
  },
  {
    id: '1-2', name: 'Two Lamps',
    map: ['0 0L 0 0 0L'],
    start: [0, 0, 'E'], ops: 'F*', limits: { main: 8 }, par: 6,
    solution: { main: 'F * F F F *' },
  },
  {
    id: '1-3', name: 'Round the Corner', teach: 'R',
    map: [
      '0 0 0',
      '. . 0',
      '. . 0L',
    ],
    start: [0, 0, 'E'], ops: 'FR*', limits: { main: 8 }, par: 6,
    solution: { main: 'F F R F F *' },
  },
  {
    id: '1-4', name: 'Left Turn', teach: 'L',
    map: [
      '. . 0L',
      '. . 0',
      '0 0 0',
    ],
    start: [0, 2, 'E'], ops: 'FLR*', limits: { main: 8 }, par: 6,
    solution: { main: 'F F L F F *' },
  },
  {
    id: '1-5', name: 'Wiggle Walk',
    map: [
      '0 0L .',
      '. 0 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLR*', limits: { main: 10 }, par: 7,
    solution: { main: 'F * R F L F *' },
  },
  {
    id: '1-6', name: 'Hop Up!', teach: 'J',
    map: ['0 1 2L'],
    start: [0, 0, 'E'], ops: 'FLRJ*', limits: { main: 6 }, par: 3,
    solution: { main: 'J J *' },
  },
  {
    id: '1-7', name: 'Bumpy Road',
    map: ['0 1 1L 0 0L'],
    start: [0, 0, 'E'], ops: 'FLRJ*', limits: { main: 9 }, par: 6,
    solution: { main: 'J F * J F *' },
  },
  {
    id: '1-8', name: 'Battery Snack', teach: 'G',
    map: [
      '0 0B 0',
      '. . 0',
      '. . 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*G', limits: { main: 10 }, par: 7,
    solution: { main: 'F G F R F F *' },
  },
  {
    id: '1-9', name: 'Tower Corner',
    map: [
      '0 1B 2',
      '. . 3',
      '. . 2L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*G', limits: { main: 10 }, par: 7,
    solution: { main: 'J G J R J J *' },
  },
  {
    id: '1-10', name: 'The Big Yard',
    map: [
      '0 0 1 1L',
      '0B . . 1',
      '0 0 0 0B',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*G', limits: { main: 16 }, par: 13,
    solution: { main: 'R F G F L F F F L G J F *' },
  },
];

const W2 = [
  {
    id: '2-1', name: 'Long Walk', teach: '@',
    map: ['0 0 0 0 0 0 0L'],
    start: [0, 0, 'E'], ops: 'FLR*@', limits: { main: 4 }, par: 3,
    solution: { main: '6(F) *' },
  },
  {
    id: '2-2', name: 'Lamp Parade',
    map: ['0L 0L 0L 0L 0L 0L'],
    start: [0, 0, 'E'], ops: 'FLR*@', limits: { main: 4 }, par: 3,
    solution: { main: '6(* F)' },
  },
  {
    id: '2-3', name: 'Square Dance',
    map: [
      '0L 0 0L',
      '0 . 0',
      '0L 0 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLR*@', limits: { main: 6 }, par: 5,
    solution: { main: '4(* F F R)' },
  },
  {
    id: '2-4', name: 'Lamp Ladder',
    map: ['0 1L 2L 3L 4L'],
    start: [0, 0, 'E'], ops: 'FLRJ*@', limits: { main: 4 }, par: 3,
    solution: { main: '4(J *)' },
  },
  {
    id: '2-5', name: 'Zig Zag Stairs',
    map: [
      '0 1 . .',
      '. 2 3 .',
      '. . 4L .',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*@', limits: { main: 7 }, par: 6,
    solution: { main: '2(J R J L) *' },
  },
  {
    id: '2-6', name: 'Big Steps',
    map: ['0 1 1 2 2 3 3L'],
    start: [0, 0, 'E'], ops: 'FLRJ*@', limits: { main: 6 }, par: 4,
    solution: { main: '3(J F) *' },
  },
  {
    id: '2-7', name: 'Lily Pads',
    map: [
      '0L 0 . .',
      '. 0L 0 .',
      '. . 0L 0',
      '. . . 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*@', limits: { main: 7 }, par: 6,
    solution: { main: '4(* F R F L)' },
  },
  {
    id: '2-8', name: 'Lagoon Ring', teach: '@@',
    map: [
      '0L 0L 0L 0L',
      '0L . . 0L',
      '0L . . 0L',
      '0L 0L 0L 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*@', limits: { main: 6 }, par: 5,
    solution: { main: '4(3(* F) R)' },
  },
  {
    id: '2-9', name: 'Battery Bridge',
    map: ['0 0B 1 1B 2 2B 3L'],
    start: [0, 0, 'E'], ops: 'FLRJ*G@', limits: { main: 6 }, par: 5,
    solution: { main: '3(F G J) *' },
  },
  {
    id: '2-10', name: 'Castle Walls',
    map: [
      '0L 1 2 1 0L',
      '1 . . . 1',
      '2 . . . 2',
      '1 . . . 1',
      '0L 1 2 1 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*G@', limits: { main: 7 }, par: 5,
    solution: { main: '4(* 4(J) R)' },
  },
];

const W3 = [
  {
    id: '3-1', name: 'Two Hills', teach: '1',
    map: ['0 1 2L 1 0 1 2L'],
    start: [0, 0, 'E'], ops: 'FLRJ*1', limits: { main: 3, p1: 5 }, par: 6,
    solution: { main: '1 1 1', p1: 'J J *' },
  },
  {
    id: '3-2', name: 'Gear Corners',
    map: [
      '0L 0 0L',
      '0 . 0',
      '0L 0 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLR*1', limits: { main: 4, p1: 4 }, par: 8,
    solution: { main: '1 1 1 1', p1: '* F F R' },
  },
  {
    id: '3-3', name: 'Twin Towers',
    map: [
      '0 1 2L 1 0',
      '0 1 2L 1 0',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*1', limits: { main: 5, p1: 5 }, par: 10,
    solution: { main: '1 R F R 1', p1: 'J J * J J' },
  },
  {
    id: '3-4', name: 'Pinwheel',
    map: [
      '. . 0L . .',
      '. . 0 . .',
      '0L 0 0 0 0L',
      '. . 0 . .',
      '. . 0L . .',
    ],
    start: [2, 2, 'N'], ops: 'FLR*1', limits: { main: 4, p1: 8 }, par: 12,
    solution: { main: '1 1 1 1', p1: 'F F * R R F F L' },
  },
  {
    id: '3-5', name: 'Battery Farm',
    map: [
      '0B 0B 0B 0B 0B',
      '0B 0B 0B 0B 0B',
      '0B 0B 0B 0B 0B',
    ],
    start: [0, 0, 'E'], ops: 'FLRG*1@', limits: { main: 9, p1: 5 }, par: 13,
    solution: { main: '1 R F R 1 L F L 1', p1: '4(G F) G' },
  },
  {
    id: '3-6', name: 'Forever Road', teach: '^',
    map: ['0 0L 0L 0L 0L 0L 0L 0L'],
    start: [0, 0, 'E'], ops: 'FLR*1^', limits: { main: 2, p1: 4 }, par: 4,
    solution: { main: '1', p1: 'F * 1' },
  },
  {
    id: '3-7', name: 'Gear Staircase',
    map: [
      '0 1 . . .',
      '. 2L 3 . .',
      '. . 4L 3 .',
      '. . . 2L 1',
      '. . . . 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*1^', limits: { main: 2, p1: 7 }, par: 7,
    solution: { main: '1', p1: 'J R J * L 1' },
  },
  {
    id: '3-8', name: 'Clockwork',
    map: [
      '0 0L 0L 0L 0L',
      '0L . . . 0L',
      '0L . . . 0L',
      '0L . . . 0L',
      '0L 0L 0L 0L 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLR*1^@', limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: '4(F *) R 1' },
  },
  {
    id: '3-9', name: 'Spiral Stairs',
    map: [
      '0L 1 2 3L',
      '3 . . 4',
      '2 . . 3',
      '1L 0 1 2L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*1^@', limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: '3(J) * R 1' },
  },
  {
    id: '3-10', name: 'The Big Gear',
    map: [
      '. . . 0L . . .',
      '. . . 0L . . .',
      '. . . 0L . . .',
      '0L 0L 0L 0 0L 0L 0L',
      '. . . 0L . . .',
      '. . . 0L . . .',
      '. . . 0L . . .',
    ],
    start: [3, 3, 'N'], ops: 'FLRJ*1^@', limits: { main: 2, p1: 10 }, par: 10,
    solution: { main: '1', p1: '3(F *) 2(R) 3(F) L 1' },
  },
];

const W4 = [
  {
    id: '4-1', name: 'Red Means Right', teach: 'c',
    map: [
      '0 0 0r',
      '. . 0',
      '0L 0 0r',
    ],
    start: [0, 0, 'E'], ops: 'FLR*1^c', limits: { main: 2, p1: 5 }, par: 5,
    solution: { main: '1', p1: 'F r:R * 1' },
  },
  {
    id: '4-2', name: 'Blue Means Left',
    map: [
      '0 0 0r . .',
      '. . 0 . .',
      '. . 0b 0 0r',
      '. . . . 0',
      '. . . . 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLR*1^c', limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: 'F r:R b:L * 1' },
  },
  {
    id: '4-3', name: 'Step Signals',
    map: ['0 0r 1 1r 2 2r 3 3L'],
    start: [0, 0, 'E'], ops: 'FLRJ*1^c', limits: { main: 2, p1: 5 }, par: 5,
    solution: { main: '1', p1: 'F r:J * 1' },
  },
  {
    id: '4-4', name: 'Ring Road',
    map: [
      '0r 0L 0L 0r',
      '0L . . 0L',
      '0L . . 0L',
      '0r 0L 0L 0r',
    ],
    start: [1, 0, 'E'], ops: 'FLR*1^c', limits: { main: 2, p1: 5 }, par: 5,
    solution: { main: '1', p1: 'r:R F * 1' },
  },
  {
    id: '4-5', name: 'Snail Shell',
    map: [
      '0r 0 0 0 0r',
      '0 0r 0 0r 0',
      '0 0 0L 0 0',
      '0 0 0r 0r 0',
      '0 0r 0 0 0r',
    ],
    start: [0, 4, 'N'], ops: 'FLR*1^c', limits: { main: 2, p1: 5 }, par: 5,
    solution: { main: '1', p1: 'F r:R * 1' },
  },
  {
    id: '4-6', name: 'Hill Climb',
    map: [
      '0 0b 1 1 1r .',
      '. . . . 1 .',
      '. . . . 1b .',
      '. . . . 2 .',
      '. 3L 3 2b 2r .',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*1^c', limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: 'F r:R b:J * 1' },
  },
  {
    id: '4-7', name: 'Turnaround',
    map: ['0bL 0 0 0 0 0bL'],
    start: [2, 0, 'E'], ops: 'FLR*1^@c', limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: 'F b:2(R) * 1' },
  },
  {
    id: '4-8', name: 'Zig Zag Hills',
    map: [
      '0 1r . . .',
      '. 0bL 1r . .',
      '. . 0bL 1r .',
      '. . . 0bL 1r',
      '. . . . 0L',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*1^c', limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: 'J r:R b:L * 1' },
  },
  {
    id: '4-9', name: 'Rainbow Bridge',
    map: [
      '0 0B 0 0r . . .',
      '. . . 0 . . .',
      '0bL 0 0B 0r . . .',
      '0 . . . . . .',
      '0b 0 0L 0B 0 0 0r',
      '. . . . . . 0B',
      '. . . 0L 0 0 0r',
    ],
    start: [0, 0, 'E'], ops: 'FLRJ*G1^c', limits: { main: 2, p1: 7 }, par: 7,
    solution: { main: '1', p1: 'F r:R b:L * G 1' },
  },
];

const ALL = 'FLRJ*G1^@c';

const W5 = [
  {
    id: '5-1', name: 'Comet Loop',
    map: [
      '0 1 2L 1 0',
      '1 . . . 1',
      '2L . . . 2L',
      '1 . . . 1',
      '0 1 2L 1 0',
    ],
    start: [0, 0, 'E'], ops: ALL, limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: '4(J *) R 1' },
  },
  {
    id: '5-2', name: 'Star Field',
    map: [
      '0L 0L 0L 0rL',
      '0bL 0L 0L 0rL',
      '0bL 0L 0L 0rL',
      '0L 0L 0L 0rL',
    ],
    start: [0, 0, 'E'], ops: ALL, limits: { main: 2, p1: 6 }, par: 6,
    solution: { main: '1', p1: '* r:R b:L F 1' },
  },
  {
    id: '5-3', name: 'Battery Towers',
    map: [
      '0 1 2 3B 2 1 0',
      '. . . . . . 1',
      '. . . . . . 2',
      '. . . . . . 3B',
      '. . . . . . 2',
      '. . . . . . 1',
      '. . . . . . 0L',
    ],
    start: [0, 0, 'E'], ops: ALL, limits: { main: 5, p1: 6 }, par: 9,
    solution: { main: '1 R 1 *', p1: '3(J) G 3(J)' },
  },
  {
    id: '5-4', name: 'Rocket Pads',
    map: [
      '. . 0L . 0L . 0L .',
      '0 0 0b 0 0b 0 0b 0',
    ],
    start: [0, 1, 'E'], ops: ALL, limits: { main: 4, p1: 8 }, par: 10,
    solution: { main: '6(F b:1)', p1: 'L F * R R F L' },
  },
  {
    id: '5-5', name: 'Moon Spiral',
    map: [
      '0rL 1 0 1 0rL',
      '1 0rL 1 0rL 1',
      '0 1 0L 1 0',
      '1 0 1rL 0rL 1',
      '0 1rL 0 1 0rL',
    ],
    start: [0, 4, 'N'], ops: ALL, limits: { main: 2, p1: 5 }, par: 5,
    solution: { main: '1', p1: 'J r:R * 1' },
  },
  {
    id: '5-6', name: 'Crater Steps',
    map: [
      '0 1 2L . . . .',
      '. . 1 . . . .',
      '. . 0 1 2L . .',
      '. . . . 1 . .',
      '. . . . 0 1 2L',
    ],
    start: [0, 0, 'E'], ops: ALL, limits: { main: 8, p1: 7 }, par: 8,
    solution: { main: '3(J J * R J J L)' },
  },
  {
    id: '5-7', name: 'Side Streets',
    map: [
      '. . 0L . . . 0L .',
      '0 0 0b 0 0r 0 0b 0',
      '. . . . 0L . . .',
    ],
    start: [0, 1, 'E'], ops: ALL, limits: { main: 5, p1: 9 }, par: 13,
    solution: { main: '6(F r:1 b:1)', p1: 'r:R b:L F * R R F r:R b:L' },
  },
  {
    id: '5-8', name: 'Comet Chase',
    map: [
      '0 0 0r . . . .',
      '. . 0 . . . .',
      '. . 0b 0 0L 0 0r',
      '. . . . . . 0',
      '. . . . 0b 0 0rL',
      '. . . . 0 . .',
      '. . . . 0L . .',
    ],
    start: [0, 0, 'E'], ops: ALL, limits: { main: 2, p1: 7 }, par: 7,
    solution: { main: '1', p1: '2(F) r:R b:L * 1' },
  },
  {
    id: '5-9', name: 'Star Circuit',
    map: [
      '0 1 0rB . 0rL 1 0rB',
      '. . 1 . 1 . 1',
      '. . 0bL 1 0bB . 0L',
      '. . . . . . 1',
      '0L 1 0bB . 0bL 1 0rB',
      '. . 1 . 1 . .',
      '. . 0rL 1 0r . .',
    ],
    start: [0, 0, 'E'], ops: ALL, limits: { main: 2, p1: 8 }, par: 8,
    solution: { main: '1', p1: '2(J) r:R b:L * G 1' },
  },
];

export const LEVELS = [...W1, ...W2, ...W3, ...W4, ...W5].map((l) => ({ ...l, world: Number(l.id.split('-')[0]) }));
export const LEVEL = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
for (const w of WORLDS) w.levels = LEVELS.filter((l) => l.world === w.id).map((l) => l.id);
