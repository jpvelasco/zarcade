// Hand-made levels. Map format: see board.js. Every level is checked by the
// solver in tests/levels.test.js, which also records its par.

export const WORLDS = [
  {
    key: 'meadow', name: 'Toybox Meadow', icon: '🌼',
    intro: { title: 'Lay the track!', text: 'Pick a piece, tap the grass to place it and tap again to turn it. Or just drag a line! Then press Go.' },
  },
  {
    key: 'creek', name: 'Crossing Creek', icon: '🌉',
    intro: { title: 'Crossings', text: 'A crossing lets two lines cross. But two trains in the same square at the same time go bonk! Take the long way round to wait your turn.' },
  },
  {
    key: 'farm', name: 'Switchback Farm', icon: '🐄',
    intro: { title: 'Flip-flop switches', text: 'A train coming up the stem goes the way the points are set, then flips them for the next train. Trains joining from a branch just roll through.' },
  },
  {
    key: 'peaks', name: 'Peppermint Peaks', icon: '🏔️',
    intro: { title: 'Tunnels', text: 'Roll into a tunnel mouth and pop out of its twin, heading out of that mouth. Mountains are solid everywhere else!' },
  },
  {
    key: 'town', name: 'Paintbox Town', icon: '🎨',
    intro: { title: 'Paint sheds', text: 'Trains rolling through a paint shed come out a new colour, and then they want that colour\'s station.' },
  },
  {
    key: 'night', name: 'Starlight Station', icon: '🌙',
    intro: { title: 'The night express', text: 'Every trick you know, all at once. The passengers are counting on you!' },
  },
];

// Each entry: { name, map, ...extras }. World and id are filled in below.
const RAW = {
  meadow: [
    {
      name: 'First Toot',
      par: 3,
      map: [
        't . . . f',
        'r> . . . R-',
        '. f . . t',
      ],
    },
    {
      name: 'Round the Bend',
      par: 5,
      map: [
        'r> . . . k',
        'f t t . f',
        '. . . . .',
        't . . R| t',
      ],
    },
    {
      name: 'Two Little Trains',
      par: 8,
      map: [
        'r> . . . . R-',
        't . f . k .',
        '. . . w . .',
        'b> . . . . B-',
      ],
    },
    {
      name: 'Pond Hop',
      par: 8,
      map: [
        'f . . . . . t',
        'r> . w w w . .',
        't . w w w . R|',
        '. . . . . . .',
      ],
    },
    {
      name: 'Pass the Platform',
      par: 6,
      map: [
        't . . . . . f',
        'r> . . R- . t B|',
        'f . k . . . .',
      ],
      queue: { '0,1': 'rb' },
    },
    {
      name: 'Meadow Maze',
      par: 21,
      map: [
        'r> . . t . . .',
        't t . t . t .',
        '. . . f . t .',
        '. t t t . t .',
        '. . . . . t R|',
      ],
    },
    {
      name: 'Hug the Hill',
      par: 26,
      map: [
        'B- . . . . . .',
        'R- . . . . . .',
        't t t t t . .',
        'r> . . . . . .',
        'b> . . . . . .',
      ],
    },
    {
      name: 'Picnic Rush',
      par: 24,
      map: [
        'r> . . . . . . t',
        '. . f f . . . R|',
        'y> . f f . k . .',
        '. . . . . . . Y|',
        'b> . . k . . . .',
        't . . . . . B- t',
      ],
    },
  ],
  creek: [
    {
      name: 'Criss-Cross',
      par: 7,
      map: [
        'f . . bv . . t',
        '. . . . . . .',
        'r> . . . . . R-',
        'w w . . . w w',
        't w . B| . w f',
      ],
      stock: { X: 1 },
    },
    {
      name: 'Wait Your Turn',
      par: 10,
      map: [
        't . b> . . . f',
        '. . . . . . .',
        'r> . . . . . R-',
        'w . . . . . w',
        'w w . B| . w w',
      ],
      stock: { X: 1 },
    },
    {
      name: 'Over the Creek',
      par: 13,
      map: [
        'r> . . w . . t',
        '. . . ─w . . B-',
        't . . w . . .',
        '. . . ─w . . R-',
        'b> . . w . . f',
      ],
      stock: { X: 1 },
    },
    {
      name: 'Swap Sides',
      par: 18,
      map: [
        '. . . . . . .',
        '. t t t t . .',
        'r> . . . . . .',
        'b> . . . . . .',
        '. t t t t . .',
        'R- . . . . . B|',
      ],
      stock: { X: 1 },
    },
    {
      name: 'Two Bridges',
      par: 16,
      map: [
        'r> . . . . . t',
        'w w w w │w w w',
        'b> . . . . . .',
        'w │w w w . . .',
        't . . . . . B-',
        'R- . . . . . f',
      ],
      stock: { X: 1 },
    },
    {
      name: 'Late Train',
      par: 11,
      map: [
        't . . bv . . .',
        'r> . . . . . .',
        '. . . . . . R-',
        'w w . . . w w',
        'f w . . B| w t',
      ],
      depart: { '3,0': 2 },
      stock: { X: 1 },
    },
    {
      name: 'Busy Junction',
      par: 13,
      map: [
        't . yv . . . t',
        'r> . . . . . R-',
        '. . . . . . .',
        'b> . . . . . B-',
        't w . . Y| w t',
      ],
      stock: { X: 2 },
    },
    {
      name: 'Creek Rush Hour',
      par: 20,
      map: [
        'r> . . w . . . t',
        '. . . ─w . . . Y-',
        'y> . . w . k . .',
        't . . ─w . . . B-',
        'b> . . w . . . .',
        'f . . ─w . . . R-',
      ],
      stock: { X: 3 },
    },
  ],
  farm: [
    {
      name: 'Fork in the Road',
      par: 7,
      map: [
        't . . . . . f',
        'r> . . . . . R-',
        '. . . . . . .',
        'h . . . . . B-',
      ],
      queue: { '0,1': 'rb' },
      stock: { W: 1 },
    },
    {
      name: 'Blue Goes First',
      par: 7,
      map: [
        'n . . . . . R|',
        '. . . . . . .',
        'b> . . . . . B-',
        '. . . f . . .',
        't . . . . . h',
      ],
      queue: { '0,2': 'br' },
      stock: { W: 1 },
    },
    {
      name: 'Red, Blue, Red',
      par: 7,
      map: [
        '. . . . . . .',
        'r> . . . . . R-',
        '. . . f f . .',
        '. . . . . . B-',
        'n . . . . . .',
      ],
      queue: { '0,1': 'rbr' },
      stock: { W: 1 },
    },
    {
      name: 'Join the Line',
      par: 11,
      map: [
        'r> . . . . . t',
        '. . . . . . .',
        'f . . . . . R-',
        '. . . . . . .',
        'r> . . . . . h',
      ],
      stock: { W: 1 },
    },
    {
      name: 'Three Ways',
      par: 10,
      map: [
        '. . . . . . B-',
        '. . . . . . .',
        'r> . . . . . R-',
        '. . . . . . .',
        'n . . . . . Y-',
      ],
      queue: { '0,2': 'rby' },
      stock: { W: 2 },
    },
    {
      name: 'Hay Bale Bend',
      par: 12,
      map: [
        'h . . . . . . f',
        'b> . . k k . . .',
        '. . . k k . . Y|',
        '. . . . . . . .',
        'y> . . . . . . B-',
        't . . . . f . .',
      ],
      queue: { '0,1': 'by' },
      stock: { W: 2 },
    },
    {
      name: 'Two Reds and a Blue',
      par: 11,
      map: [
        'n . . . . . R-',
        '. . . . . . .',
        'r> . . . . . B-',
        '. . . f . . .',
        't . . . . . R-',
      ],
      queue: { '0,2': 'rrb' },
      stock: { W: 2 },
    },
    {
      name: 'Harvest Express',
      par: 17,
      map: [
        'r> . . . . . . t',
        '. . . t . . . R-',
        '. . . . . . . .',
        'b> . . . k . . Y-',
        '. . . . . . . .',
        'h . . . . . . B-',
      ],
      queue: { '0,0': 'ry', '0,3': 'bb' },
      stock: { W: 1 },
    },
  ],
  peaks: [
    {
      name: 'Through the Mountain',
      par: 2,
      map: [
        'p . m m m . p',
        'r> . 1< m 1> . R-',
        '. . m m m . .',
        'p . m m m . p',
      ],
    },
    {
      name: 'Short Cut',
      par: 3,
      map: [
        'p . . . . . . p',
        '. . m m m m . .',
        'r> . 1< m m 1> . .',
        '. . m m m m . R|',
        'p . . . . . . .',
      ],
      queue: { '0,2': 'rr' },
    },
    {
      name: 'Hidden Valley',
      par: 4,
      map: [
        'p . . . . . p',
        'b> . . 1^ . . .',
        '. . m m m . .',
        '. . m B| m . .',
        '. . m 1^ m . p',
        'p . . . . . .',
      ],
    },
    {
      name: 'Under and Over',
      par: 8,
      map: [
        'r> . . m . . R-',
        '. . 1< m 1> . .',
        'p . . m . . p',
        '. . 2< m 2> . .',
        'b> . . m . . B-',
      ],
    },
    {
      name: 'Swap by Tunnel',
      par: 4,
      map: [
        'p . . m . . p',
        'r> . 1< m 2> . B-',
        '. . . m . . .',
        'b> . 2< m 1> . R-',
        'p . . m . . p',
      ],
    },
    {
      name: 'Mountain Fork',
      par: 5,
      map: [
        'p . . . m . . p',
        'r> . . 1< m 1> . R-',
        '. . . m m m . .',
        '. . . 2< m 2> . B-',
        'p . . . m . . p',
      ],
      queue: { '0,1': 'rb' },
      stock: { W: 1 },
    },
    {
      name: 'Snowy Timing',
      par: 8,
      map: [
        'p . . bv . . p',
        'r> . . . 1< m 1>',
        'm m . . m m .',
        'R- . . . . . .',
        'p . . B| . . p',
      ],
      stock: { X: 1 },
    },
    {
      name: 'Peppermint Express',
      par: 12,
      map: [
        'r> . . m . . . R-',
        'p . 1< m 1> . . .',
        'y> . . m . k . Y-',
        '. . . m m m . .',
        'b> . 2< m 2> . . B-',
        'p . . m . . p .',
      ],
      stock: { X: 1, W: 2 },
    },
  ],
  town: [
    {
      name: 'Fresh Coat',
      par: 6,
      map: [
        'h . . B= . . c',
        'r> . . . . . B-',
        'l . . h . . h',
      ],
    },
    {
      name: 'One of Each',
      par: 9,
      map: [
        'h . . . . . R-',
        'r> . . . . . .',
        'c . . . B= . .',
        'l . . . . . B-',
      ],
      queue: { '0,1': 'rr' },
      stock: { W: 1 },
    },
    {
      name: 'Paint Swap',
      par: 14,
      map: [
        'h . . B= . . . c',
        'r> . . . . . . B-',
        '. . h l l h . .',
        'b> . . . . . . R-',
        'c . . R= . . . h',
      ],
    },
    {
      name: 'Purple Patch',
      par: 9,
      map: [
        'c . . . . . h',
        'b> . . . . . .',
        '. . h P! h . .',
        'r> . . . . . .',
        'h . . . . . P|',
      ],
      stock: { W: 1 },
    },
    {
      name: 'Pass and Paint',
      par: 10,
      map: [
        'h . . . . . c',
        'b> . R- . . . .',
        'l . . . . . .',
        'h . . . R! . .',
        'c . . . . . h',
      ],
    },
    {
      name: 'Rainbow Road',
      par: 21,
      map: [
        'r> . . . . . . Y-',
        '. h . Y= . h . .',
        'y> . . . . . . G-',
        '. h . G= . h . .',
        'g> . . . . . . R-',
        '. h . R= . h . .',
      ],
    },
    {
      name: 'Paint by Number',
      par: 15,
      map: [
        'c . . O= . . . O-',
        '. . . . . . . .',
        'y> . . . . . . Y-',
        '. . . . . . . .',
        'h . . . P= . . P-',
        'l . . . . . . h',
      ],
      queue: { '0,2': 'yyy' },
      stock: { W: 2 },
    },
    {
      name: 'Paintbox Parade',
      par: 13,
      map: [
        'c . . . . . . h',
        '. . . . B= . . B-',
        'r> . . . . . . R-',
        '. . . . Y= . . Y-',
        'h . . . . . . l',
      ],
      queue: { '0,2': 'rrr' },
      stock: { W: 2 },
    },
  ],
  night: [
    {
      name: 'Night Shift',
      par: 10,
      map: [
        'l . . yv . . . l',
        'r> . . . . . . R-',
        '. . . . . . . .',
        't . . . . . . B-',
        'l . . Y| . . . t',
      ],
      queue: { '0,1': 'rb' },
      stock: { W: 1, X: 2 },
    },
    {
      name: 'Moonlit Tunnel',
      par: 7,
      map: [
        'l . . m . . . l',
        'r> . 1< m 1> . . .',
        'l . . m . . B= .',
        'b> . 2< m 2> . . .',
        'l . . m . . . B|',
      ],
      stock: { W: 1 },
    },
    {
      name: 'After You',
      par: 11,
      map: [
        't . . . bv h t l',
        'r> . . . . . . R-',
        'l . . . . l h t',
        't h l t . t l h',
        'h t h l . h t l',
        'l h t t B| l h t',
      ],
      depart: { '4,0': 3 },
      stock: { X: 1 },
    },
    {
      name: 'Star Switch',
      par: 10,
      map: [
        'l . . . . . . R-',
        'r> . . . . . . .',
        '. . . . l . . .',
        't . . . . . . B-',
        'l . . . . . . t',
      ],
      queue: { '0,1': 'rbrb' },
      stock: { W: 1 },
    },
    {
      name: 'Comet Crossing',
      par: 17,
      map: [
        'l . bv l l yv . l',
        'r> . . . . . . R-',
        't . . . . . . t',
        'l t . . . . t l',
        'h t . . . . t h',
        'h l Y| t t B| l h',
      ],
      stock: { X: 3 },
    },
    {
      name: 'Midnight Paint',
      par: 11,
      map: [
        'p . . m . . . l',
        'b> . 1< m 1> . . R-',
        '. . . m . . . .',
        '. . . m . R= . .',
        'p . . m . . . B-',
      ],
      queue: { '0,1': 'bb' },
      stock: { W: 1 },
    },
    {
      name: 'Moonlight Junction',
      par: 11,
      map: [
        'l . . . m . . l',
        'r> . . 1< m 1> . R-',
        '. . . . m . . .',
        'y> . . . m . G! .',
        '. . . . m . . G-',
        'b> . . 2< m 2> . B-',
        'l . . . m . . P-',
      ],
      queue: { '0,5': 'bp' },
      stock: { W: 3 },
    },
    {
      name: 'Grand Central',
      par: 30,
      map: [
        'r> . . . . . . G-',
        'l t . . . t l h',
        'g> . . . . . . R-',
        'h l t l t l h l',
        'b> . . . . . . Y-',
        't l . . . l t h',
        'y> . . . . . . B-',
      ],
      depart: { '0,2': 2, '0,6': 2 },
      stock: { X: 2 },
    },
  ],
};

export const LEVELS = [];
for (const [wi, world] of WORLDS.entries()) {
  for (const raw of RAW[world.key] || []) {
    LEVELS.push({ ...raw, id: LEVELS.length + 1, world: wi, worldKey: world.key });
  }
}
export const LEVEL_COUNT = LEVELS.length;
export const getLevel = (id) => LEVELS[id - 1] || null;
export const worldLevels = (wi) => LEVELS.filter((l) => l.world === wi);
