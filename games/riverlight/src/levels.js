// Seasons, level specs and the zen garden generator. DOM-free.
import { generate } from './generator.js';
import { hashSeed, Rng } from './rng.js';

export const SEASONS = [
  { key: 'spring', name: 'Spring Meadow', target: 'flower', twist: 'Splitters', blurb: 'Gentle bends and forks through the clover.' },
  { key: 'summer', name: 'Summer Pond', target: 'lotus', twist: 'Lily-pad bridges', blurb: 'Streams cross under lily-pad bridges without mixing.' },
  { key: 'autumn', name: 'Autumn Grove', target: 'flower', twist: 'Sluice gates & mossy stones', blurb: 'One-way gates and stones that will not budge.' },
  { key: 'winter', name: 'Winter Lake', target: 'flower', twist: 'Frozen twins & wrap-around', blurb: 'Twin stones turn together, and the lake wraps around.' },
  { key: 'night', name: 'Night Garden', target: 'lantern', twist: 'Blue + gold = green', blurb: 'Two springs. Mix their light to make green.' },
  { key: 'lotus', name: 'Lotus Isles', target: 'lotus', twist: 'Hex stones', blurb: 'Six-sided stones on a lotus lagoon.' },
];

export const TWISTS = {
  basics: { title: 'Bring the water home', text: 'Tap a stone to turn it. Guide the stream from the spring to the flower, with no spills.', icon: '💧' },
  splitters: { title: 'Splitters', text: 'Some stones split the stream in two. Every flower needs water, and every stone should glow.', icon: '🌷' },
  bridges: { title: 'Lily-pad bridges', text: 'Two streams can cross a bridge without mixing. Each one flows straight across.', icon: '🪷' },
  gates: { title: 'Sluice gates', text: 'Water only flows through a gate the way its arrows point. Turn it to face downstream.', icon: '🍂' },
  locks: { title: 'Mossy stones', text: 'Mossy stones are stuck in place, already facing the right way. Use them as clues.', icon: '🪨' },
  pairs: { title: 'Frozen twins', text: 'Stones with the same snowflake badge turn together. Turning one turns its twin.', icon: '❄️' },
  wrap: { title: 'Round the lake', text: 'Water leaving one edge comes back in on the opposite edge.', icon: '🔄' },
  two: { title: 'Two springs', text: 'A blue spring and a gold spring. Keep each colour to its own lanterns: if they meet, they mix.', icon: '🏮' },
  mix: { title: 'Mixing light', text: 'Blue and gold make green. Gates keep the colours from flowing back. Green lanterns need both.', icon: '💚' },
  hex: { title: 'Hex stones', text: 'Six sides, six ways to turn. Same rules, new shapes.', icon: '⬡' },
};

const SHAPES = {
  heart: ['.##.##.', '#######', '###S###', '.#####.', '..###..', '...#...'],
  lily: ['..###..', '.#####.', '##B#B##', '###S###', '##B#B##', '.#####.', '..###..'],
  maple: ['...#...', '.#.#.#.', '.#####.', '#######', '.##S##.', '..###..', '...#...'],
  snow: ['.#...#.', '.##.##.', '..###..', '###S###', '..###..', '.##.##.', '.#...#.'],
  lantern: ['...#...', '..###..', '.#####.', '#######', '#######', '.#####.', '..###..'],
};

// [season, name, spec] with spec shorthand; defaults filled in below.
const L = (w, h, size, extra = {}) => ({ topo: { kind: 'square', w, h, wrap: !!extra.wrap }, size, ...extra });
const H = (R, size, extra = {}) => ({ topo: { kind: 'hex', w: 2 * R + 1, h: 2 * R + 2, hexRadius: R }, size, ...extra });
const S = (shape, extra = {}) => {
  const rows = SHAPES[shape];
  const w = rows[0].length;
  const bridgeCells = [];
  let spring = null;
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'B') bridgeCells.push(r * w + c);
    if (ch === 'S') spring = r * w + c;
  }));
  return {
    topo: { kind: 'square', w, h: rows.length, shape: rows },
    fill: !extra.mode,
    size: 99,
    spring: extra.mode ? null : spring,
    bridgeCells: bridgeCells.length ? bridgeCells : null,
    showpiece: shape,
    ...extra,
  };
};
const path = { fl: [1, 1], maxDeg: 2, springDeg: 1, snake: 1 };
const rl = { repairLocks: true };

const TABLE = [
  // Spring Meadow
  [0, 'First Trickle', L(3, 3, 4, path), 'basics'],
  [0, 'Bend in the Brook', L(3, 3, 6, path)],
  [0, 'Daisy Path', L(4, 4, 8, path)],
  [0, 'Winding Rill', L(4, 4, 11, path)],
  [0, 'Two Tulips', L(4, 4, 8, { fl: [2, 2], springDeg: 1 }), 'splitters'],
  [0, 'Buttercup Fork', L(4, 4, 11, { fl: [2, 3] })],
  [0, 'Clover Patch', L(5, 4, 13, { fl: [3, 3] })],
  [0, 'Bluebell Bend', L(5, 5, 16, { fl: [3, 4] })],
  [0, 'Primrose Steps', L(5, 5, 19, { fl: [3, 5] })],
  [0, 'Meadow Weave', L(6, 5, 22, { fl: [4, 6] })],
  [0, "Lark's Lawn", L(6, 6, 27, { fl: [5, 7] })],
  [0, 'Heart of the Meadow', S('heart', { fl: [3, 12] })],
  // Summer Pond
  [1, 'Lily Crossing', L(5, 5, 14, { bridges: 1, fl: [2, 4] }), 'bridges'],
  [1, 'Frog Hop', L(5, 5, 17, { bridges: 1 })],
  [1, 'Two Pads', L(5, 5, 19, { bridges: 2 })],
  [1, 'Reed Run', L(6, 5, 21, { bridges: 2 })],
  [1, 'Dragonfly Dance', L(6, 6, 25, { bridges: 2 })],
  [1, 'Lotus Lane', L(6, 6, 28, { bridges: 3 })],
  [1, 'Minnow Maze', L(6, 6, 30, { bridges: 3, maxDeg: 4 })],
  [1, 'Sunny Shallows', L(7, 6, 33, { bridges: 3 })],
  [1, 'Heron Watch', L(7, 6, 35, { bridges: 4 })],
  [1, 'Water Lilies', L(7, 7, 38, { bridges: 4 })],
  [1, 'Midsummer Mere', L(7, 7, 41, { bridges: 5 })],
  [1, 'The Lily Ring', S('lily', { fl: [3, 16] })],
  // Autumn Grove
  [2, 'Leaf Sluice', L(5, 5, 15, { gates: 1 }), 'gates'],
  [2, 'Acorn Run', L(5, 5, 18, { gates: 2 })],
  [2, 'Chestnut Fall', L(6, 5, 21, { gates: 2, bridges: 1 })],
  [2, 'Rustle Brook', L(6, 6, 25, { gates: 3 })],
  [2, 'Mossy Stones', L(6, 6, 26, { locks: 3, gates: 1, ...rl }), 'locks'],
  [2, 'Hedgehog Hollow', L(6, 6, 29, { locks: 3, gates: 2, ...rl })],
  [2, 'Mushroom Ring', L(7, 6, 32, { locks: 4, gates: 2, bridges: 1, ...rl })],
  [2, 'Amber Dell', L(7, 6, 34, { locks: 4, gates: 2, bridges: 1, ...rl })],
  [2, 'Harvest Moon', L(7, 7, 38, { locks: 4, gates: 3, bridges: 2, ...rl })],
  [2, 'Owl Oak', L(7, 7, 40, { locks: 4, gates: 3, bridges: 2, ...rl })],
  [2, 'Golden Canopy', L(8, 7, 44, { locks: 5, gates: 3, bridges: 2, ...rl })],
  [2, 'The Maple Leaf', S('maple', { fl: [3, 16], gates: 2, ...rl })],
  // Winter Lake
  [3, 'Frozen Twins', L(5, 5, 15, { pairs: 1 }), 'pairs'],
  [3, 'Snowdrop Pair', L(5, 5, 18, { pairs: 2 })],
  [3, 'Icicle Lane', L(6, 5, 21, { pairs: 2 })],
  [3, 'Frost Fern', L(6, 6, 25, { pairs: 3 })],
  [3, 'Round the Lake', L(5, 5, 16, { wrap: true }), 'wrap'],
  [3, 'Skater\'s Loop', L(5, 5, 19, { wrap: true })],
  [3, 'Snow Globe', L(6, 5, 22, { wrap: true, pairs: 1 })],
  [3, 'Polar Pond', L(6, 6, 26, { wrap: true, pairs: 2 })],
  [3, 'Northern Lights', L(6, 6, 30, { wrap: true, pairs: 2, bridges: 1 })],
  [3, 'Winter Weave', L(7, 6, 34, { wrap: true, pairs: 3 })],
  [3, 'Crystal Mere', L(7, 7, 40, { wrap: true, pairs: 3, bridges: 2 })],
  [3, 'The Snowflake', S('snow', { fl: [4, 14], pairs: 2 })],
  // Night Garden
  [4, 'Two Lanterns', L(5, 5, 14, { mode: 'two', fl: [2, 4] }), 'two'],
  [4, 'Moth Meadow', L(6, 5, 18, { mode: 'two' })],
  [4, 'Starlit Steps', L(6, 6, 22, { mode: 'two', bridges: 1 })],
  [4, 'Glowworm Glen', L(6, 6, 26, { mode: 'two', bridges: 2 })],
  [4, 'Green Glow', L(5, 5, 13, { mode: 'mix', fl: [3, 6], mix: { g: 5, b: 4, y: 4 } }), 'mix'],
  [4, 'Firefly Fork', L(6, 5, 16, { mode: 'mix', fl: [3, 7], mix: { g: 6, b: 5, y: 5 } })],
  [4, 'Moonflower', L(6, 6, 19, { mode: 'mix', fl: [4, 8], mix: { g: 7, b: 6, y: 6 } })],
  [4, 'Lantern Walk', L(6, 6, 22, { mode: 'mix', fl: [4, 9], mix: { g: 8, b: 7, y: 7 }, bridges: 1 })],
  [4, 'Midnight Bloom', L(7, 6, 25, { mode: 'mix', fl: [5, 10], mix: { g: 9, b: 8, y: 8 }, bridges: 1 })],
  [4, 'Owl Light', L(7, 7, 28, { mode: 'mix', fl: [5, 11], mix: { g: 10, b: 9, y: 9 }, bridges: 2 })],
  [4, 'Starfall', L(7, 7, 31, { mode: 'mix', fl: [6, 12], mix: { g: 11, b: 10, y: 10 }, bridges: 2 })],
  [4, 'The Paper Lantern', S('lantern', { mode: 'mix', fl: [4, 14], snake: 0.35, mix: { g: 9, b: 8, y: 8 } })],
  // Lotus Isles (hex)
  [5, 'Lotus Bud', H(2, 9, { fl: [2, 4] }), 'hex'],
  [5, 'Petal Path', H(2, 13)],
  [5, 'Little Lagoon', H(2, 19, { fill: true })],
  [5, 'Koi Crossing', H(3, 22, { bridges: 1 })],
  [5, 'Pearl Shallows', H(3, 26, { bridges: 2 })],
  [5, 'Bamboo Gate', H(3, 28, { gates: 2 })],
  [5, 'Jade Stones', H(3, 30, { locks: 3, gates: 2, ...rl })],
  [5, 'Twin Lotus', H(3, 32, { pairs: 2 })],
  [5, 'Moon Bridge', H(3, 33, { pairs: 2, bridges: 1 })],
  [5, 'Lantern Isle', H(3, 34, { gates: 2, bridges: 1, locks: 2, ...rl })],
  [5, 'Cloud Garden', H(3, 35, { gates: 2, pairs: 1, bridges: 1, locks: 2, ...rl })],
  [5, 'The Lotus Crown', H(3, 37, { fill: true, bridges: 2, gates: 1, ...rl, showpiece: 'lotus' })],
];

function withDefaults(spec, id) {
  const size = spec.size;
  const flowers = spec.fl || [Math.max(1, Math.round(size / 9)), Math.max(2, Math.round(size / 3))];
  const out = {
    snake: spec.mode === 'mix' ? 0.35 : 0.5,
    maxDeg: 3,
    springDeg: 2,
    ...spec,
    flowers,
    seed: hashSeed(id, 0x5eed),
  };
  return out;
}

export const LEVELS = TABLE.map(([season, name, spec, twist], k) => ({
  id: k + 1,
  season,
  name,
  twist: twist || null,
  showpiece: spec.showpiece || null,
  spec: withDefaults(spec, k + 1),
}));
export const LEVEL_COUNT = LEVELS.length;

export function seasonLevels(season) {
  return LEVELS.filter((l) => l.season === season);
}

const cache = new Map();
export function getLevel(id) {
  const level = LEVELS[id - 1];
  if (!level) throw new Error(`no level ${id}`);
  if (!cache.has(id)) cache.set(id, generate(level.spec));
  return { ...level, puzzle: cache.get(id) };
}

// Twists the player has met by level id (for zen mode and the help card).
export function twistsUpTo(id) {
  return LEVELS.filter((l) => l.id <= id && l.twist).map((l) => l.twist);
}

// Zen mode: endless gardens from the same generator, picked by seed.
const ZEN_POOL = LEVELS.filter((l) => !l.showpiece && l.id > 6);
export function zenLevel(seed) {
  const rng = new Rng(hashSeed(seed, 0x2e4));
  const base = rng.pick(ZEN_POOL);
  const spec = { ...base.spec, seed: hashSeed(seed, 0x9a7d) };
  return {
    id: 0,
    zen: true,
    season: base.season,
    name: 'Zen garden',
    twist: null,
    showpiece: null,
    spec,
    puzzle: generate(spec),
  };
}
