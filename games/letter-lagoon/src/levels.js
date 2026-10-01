// Reef zones, the level list and the level builder. DOM-free and
// deterministic: a level id (or a date, for the daily puzzle) always builds
// the same wheel, crossword and bonus list.
import { Rng, hashSeed } from './rng.js';
import { TARGETS, WORDS, spellable, glossFor } from './words.js';
import { buildCrossword, cellsOf } from './crossword.js';

export const ZONES = [
  { name: 'Sandy Shallows', blurb: 'Warm sand, tiny waves and the friendliest fish.', critters: ['clownfish', 'starfish'], hue: '#4fd6e8', sand: '#f6dca0' },
  { name: 'Seagrass Meadow', blurb: 'Swaying green grass where seahorses hide.', critters: ['seahorse', 'turtle'], hue: '#4ee0a8', sand: '#e9d79a' },
  { name: 'Coral Gardens', blurb: 'Bright coral castles in every color.', critters: ['angelfish', 'pufferfish'], hue: '#ff8fb0', sand: '#f4cfa8' },
  { name: 'Kelp Forest', blurb: 'Tall kelp towers full of secrets.', critters: ['octopus', 'seahorse'], hue: '#7ccf6a', sand: '#d9c58e' },
  { name: 'Shipwreck Cove', blurb: 'An old sunken ship with treasure inside.', critters: ['ray', 'pufferfish'], hue: '#5aa8e0', sand: '#cdb88a' },
  { name: 'Turtle Bay', blurb: 'Where baby turtles learn to swim.', critters: ['turtle', 'jellyfish'], hue: '#3fc9c0', sand: '#e6d29c' },
  { name: 'Glow Grotto', blurb: 'A twinkly cave of glowing jellies.', critters: ['jellyfish', 'octopus'], hue: '#b28cff', sand: '#a99ccf' },
  { name: 'Dolphin Reach', blurb: 'Open blue water where dolphins play.', critters: ['dolphin', 'ray'], hue: '#3f9cff', sand: '#c4c8d8' },
  { name: 'Starlight Deep', blurb: 'The deepest, dreamiest part of the lagoon.', critters: ['narwhal', 'whale'], hue: '#6f7dff', sand: '#9aa3c8' },
];

export const LEVELS_PER_ZONE = 10;

// Wheel letters for each level, easiest first. Letter counts grow from 3 to
// 7 across the zones; each word is itself a target that uses every letter.
export const BASES = [
  // Sandy Shallows
  'ate', 'now', 'art', 'tape', 'neat', 'town', 'mate', 'cart', 'post', 'east',
  // Seagrass Meadow
  'star', 'part', 'late', 'gate', 'leap', 'snow', 'note', 'coat', 'past', 'rate',
  // Coral Gardens
  'beat', 'acre', 'aunt', 'heat', 'stone', 'petal', 'trade', 'parts', 'carts', 'table',
  // Kelp Forest
  'leaps', 'actor', 'earth', 'gates', 'feast', 'skate', 'spare', 'stamp', 'water', 'towns',
  // Shipwreck Cove
  'least', 'coast', 'crane', 'maple', 'paint', 'train', 'beard', 'plant', 'dream', 'tears',
  // Turtle Bay
  'steam', 'party', 'pearl', 'castle', 'hearts', 'actors', 'basket', 'magnet', 'thread', 'grapes',
  // Glow Grotto
  'planet', 'pilots', 'stones', 'cranes', 'trains', 'towers', 'wander', 'teapot', 'garden', 'travel',
  // Dolphin Reach
  'petals', 'stream', 'tables', 'teacher', 'lantern', 'blanket', 'sparkle', 'painter', 'weather', 'jackets',
  // Starlight Deep
  'planets', 'magnets', 'teapots', 'parrots', 'castles', 'tadpole', 'mermaid', 'marbles', 'oranges', 'kitchen',
];

export const LEVEL_COUNT = BASES.length;

// How many crossword answers a wheel of each size gets.
export const TARGET_RANGE = { 3: [3, 3], 4: [3, 5], 5: [4, 6], 6: [5, 7], 7: [6, 8] };

export function zoneOf(id) {
  return Math.min(ZONES.length - 1, Math.floor((id - 1) / LEVELS_PER_ZONE));
}

// Builds a level from its wheel word. Pure: same inputs, same level.
export function buildLevel(base, { seed = 1, id = 0, zone = 0, name = '' } = {}) {
  const [minT, maxT] = TARGET_RANGE[base.length];
  const pool = spellable(base, TARGETS.keys()).filter((w) => w !== base);
  let best = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const rng = new Rng(hashSeed(seed, attempt, base.length));
    // Longer words first so the board has a strong spine, with a seeded
    // jitter so each level mixes lengths a little differently.
    const order = pool
      .map((word) => ({ word, sort: word.length + rng.next() * 1.6 }))
      .sort((a, b) => b.sort - a.sort)
      .map((x) => x.word);
    const board = buildCrossword([base, ...order], rng, {
      maxRows: base.length <= 4 ? 6 : base.length === 5 ? 8 : 9,
      maxCols: Math.max(base.length, base.length <= 4 ? 6 : 10),
      maxWords: maxT,
    });
    const placed = board.placements.length;
    if (!best || placed > best.placements.length) best = board;
    if (placed >= maxT || (placed >= minT && attempt >= 3)) break;
  }

  // Scramble the wheel so it never just spells a target in order.
  const rng = new Rng(hashSeed(seed, 99));
  const placedWords = new Set(best.placements.map((p) => p.word));
  let letters = [...base];
  for (let tries = 0; tries < 20; tries++) {
    rng.shuffle(letters);
    if (!placedWords.has(letters.join('')) || base.length === 3 && tries > 8) break;
  }

  const targets = best.placements
    .map((p) => ({ ...p, gloss: glossFor(p.word) }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const bonus = spellable(base, WORDS).filter((w) => !placedWords.has(w));
  // One trapped critter per answer, alternating the zone's species.
  const critters = ZONES[zone].critters;
  const traps = targets.map((_, k) => critters[(id + k) % critters.length]);
  return {
    id,
    zone,
    name: name || ZONES[zone].name,
    base,
    seed,
    letters,
    rows: best.rows,
    cols: best.cols,
    targets,
    bonus,
    traps,
    critter: traps[0],
  };
}

const cache = new Map();

export function getLevel(id) {
  const n = Math.max(1, Math.min(LEVEL_COUNT, id | 0));
  if (!cache.has(n)) {
    const zone = zoneOf(n);
    cache.set(n, buildLevel(BASES[n - 1], { seed: hashSeed(n, 7177), id: n, zone }));
  }
  return cache.get(n);
}

// Daily puzzle pool: rich five- and six-letter target words, plus every
// level base of that size, in a fixed order.
export const DAILY_POOL = (() => {
  const words = [];
  for (const word of TARGETS.keys()) {
    if (word.length < 5 || word.length > 6) continue;
    if (spellable(word, TARGETS.keys()).length >= 9) words.push(word);
  }
  return words.sort();
})();

// "2026-10-01" -> a stable 32-bit seed.
export function dateSeed(dateKey) {
  let h = 2166136261 >>> 0;
  for (const ch of String(dateKey)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return hashSeed(h, 2026);
}

export function dateKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailyLevel(dateKey) {
  const seed = dateSeed(dateKey);
  const base = DAILY_POOL[seed % DAILY_POOL.length];
  const zone = seed % ZONES.length;
  return { ...buildLevel(base, { seed, id: 0, zone, name: 'Daily Puzzle' }), daily: dateKey };
}

// Map from "row,col" to the letter, for drawing and hint logic.
export function boardCells(level) {
  const cells = new Map();
  for (const t of level.targets) {
    for (const c of cellsOf(t)) cells.set(`${c.row},${c.col}`, c.letter);
  }
  return cells;
}
