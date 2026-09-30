// Level data for the reef map, plus the board builder.
//
// Layouts are drawn as eight rows of eight characters:
//   .  hole (outside the reef)       #  plain tile
//   1  tile with one sand layer      2  tile with two sand layers
//   c  coral blocker (1 hit)         C  coral blocker (2 hits)
//   i  ice-locked jelly              I  double ice-locked jelly
//   o  turtle egg waiting to drop
import { Board, coral, egg, jelly, COLOR_NAMES, findMatches, hasMoves, shuffleBoard } from './board.js';
import { Rng, hashSeed } from './rng.js';

const rows = (s) => s.trim().split(/\s+/);

const FULL = rows(`
  ######## ######## ######## ########
  ######## ######## ######## ########`);
const DIAMOND = rows(`
  ..####.. .######. ######## ########
  ######## ######## .######. ..####..`);
const BOWL = rows(`
  ##....## ##....## ###..### ########
  ######## ######## .######. ..####..`);
const PILLARS = rows(`
  .######. .######. ######## ########
  ######## ######## .######. .######.`);
const PLUS = rows(`
  ..####.. ..####.. ######## ########
  ######## ######## ..####.. ..####..`);
const ARCH = rows(`
  ###..### ###..### ###..### ########
  ######## ######## ######## ########`);
const STAIRS = rows(`
  #####... ######.. #######. ########
  ######## ######## .####### ..######`);
const FAN = rows(`
  ...##... ..####.. .######. ########
  ######## ######## ######## ########`);
const TIDE = rows(`
  ######## ######## ######## ########
  ######## ######## ##.##.## ##.##.##`);

// Sand and seaweed patches -------------------------------------------------
const SAND_SMALL = rows(`
  ######## ######## ##1111## ##1111##
  ##1111## ##1111## ######## ########`);
const SAND_BAND = rows(`
  ######## #111111# #111111# ########
  ######## #111111# #111111# ########`);
const SAND_DEEP = rows(`
  ######## ##2222## ##2222## ##2222##
  ##2222## ######## ######## ########`);
const SAND_DIAMOND = rows(`
  ..####.. .#1111#. #112211# #122221#
  #122221# #112211# .#1111#. ..####..`);
const SAND_EDGES = rows(`
  11####11 1######1 ######## ########
  ######## ######## 1######1 11####11`);
const SAND_CHECKER = rows(`
  #1#1#1#1 1#1#1#1# #1#1#1#1 1#1#1#1#
  #1#1#1#1 1#1#1#1# ######## ########`);
const SAND_PILLARS = rows(`
  .######. .######. ##1111## ##1111##
  ##1111## ##1111## .######. .######.`);
const SAND_FLOOR = rows(`
  ######## ######## ######## 11111111
  11111111 11111111 11111111 ########`);

// Coral, ice and eggs ------------------------------------------------------
const CORAL_GATE = rows(`
  ######## ######## ###cc### ###cc###
  ######## ######## ######## ########`);
const CORAL_PILLARS = rows(`
  ######## ##c##c## ##c##c## ########
  ######## ##C##C## ##C##C## ########`);
const CORAL_MAZE = rows(`
  ######## #c#cc#c# ######## ##CC####
  ####CC## ######## #c#cc#c# ########`);
const ICE_NEST = rows(`
  ######## ###ii### ##i##i## ########
  ######## ##i##i## ###ii### ########`);
const ICE_WALL = rows(`
  ######## ######## #ii##ii# ########
  ######## #II##II# ######## ########`);
const ICE_CORAL = rows(`
  ######## ##i##i## ###cc### ########
  ######## ###CC### ##I##I## ########`);
const EGG_ONE = rows(`
  ###o#### ######## ######## ########
  ######## ######## ######## ########`);
const EGG_TWO = rows(`
  #o####o# ######## ######## ########
  ######## ######## ######## ########`);
const EGG_THREE = rows(`
  #o##o##o ######## ######## ########
  ######## ######## ######## ########`);
const EGG_SAND = rows(`
  #o####o# ######## ##1111## ##1111##
  ##1111## ##1111## ######## ########`);
const EGG_CORAL = rows(`
  ###oo### ######## ##c##c## ########
  ######## ##c##c## ######## ########`);
const EGG_DIAMOND = rows(`
  ..o##o.. .######. ######## ########
  ######## ######## .######. ..####..`);
const EGG_FOUR = rows(`
  o#o##o#o ######## ######## ########
  ######## ######## ######## ########`);
const DEEP_MIX = rows(`
  #o####o# ##2222## ##c##c## #2####2#
  ##i##i## ##2222## ######## ########`);
const DEEP_FORTRESS = rows(`
  ###..### ##2..2## #C2..2C# #221122#
  #112211# ##1111## ######## ########`);
const DEEP_TIDE = rows(`
  ######## #o####o# ##1111## ##1111##
  ######## ######## ##.##.## ##.##.##`);
const ABYSS_CROWN = rows(`
  ...##... ..i22i.. .#2222#. #C2222C#
  #222222# ##2222## ######## ########`);

const G = {
  score: (amount) => ({ type: 'score', amount }),
  collect: (color, count) => ({ type: 'collect', color, count }),
  sand: () => ({ type: 'sand' }),
  coral: () => ({ type: 'coral' }),
  ice: () => ({ type: 'ice' }),
  eggs: () => ({ type: 'eggs' }),
};

// name, moves, colors, layout, goals, star score thresholds
const DATA = [
  // --- Area 1: Sunlit Shallows ------------------------------------------
  ['Turtle Cove', 22, 5, FULL, [G.score(8500)], [8500, 14000, 18500]],
  ['Bubble Bay', 22, 5, FULL, [G.collect(0, 18)], [8500, 13500, 17500]],
  ['Sandy Steps', 22, 5, SAND_SMALL, [G.sand()], [9000, 14000, 18500]],
  ['Pearl Pool', 20, 5, DIAMOND, [G.score(7000)], [7000, 11500, 15000]],
  ['Twin Tides', 24, 5, FULL, [G.collect(1, 16), G.collect(3, 16)], [8500, 13500, 18000]],
  ['Coral Nook', 22, 5, CORAL_GATE, [G.coral()], [5500, 8500, 11500]],
  ['Seagrass Flats', 24, 5, SAND_BAND, [G.sand()], [16500, 26500, 34500]],
  ['First Egg', 24, 5, EGG_ONE, [G.eggs()], [9000, 14500, 19500]],
  ['Frosty Fizz', 22, 5, ICE_NEST, [G.ice()], [7500, 12000, 16000]],
  ['Shallow Shuffle', 26, 6, SAND_PILLARS, [G.collect(2, 20), G.sand()], [8500, 13500, 17500]],
  ['Cove Carnival', 26, 5, EGG_TWO, [G.eggs(), G.score(14000)], [14000, 22500, 29500]],

  // --- Area 2: Kelp Carnival -------------------------------------------
  ['Kelp Gate', 24, 6, SAND_DEEP, [G.sand()], [9500, 15000, 19500]],
  ['Swaying Stalks', 24, 6, PLUS, [G.score(6000)], [6000, 9000, 12000]],
  ['Snail Trail', 26, 6, SAND_CHECKER, [G.sand()], [11000, 17500, 23000]],
  ['Two Eggs Up', 24, 5, EGG_TWO, [G.eggs()], [15000, 24000, 31500]],
  ['Kelp Locks', 24, 6, ICE_WALL, [G.ice()], [7000, 11000, 14000]],
  ['Reef Ribbons', 26, 6, BOWL, [G.collect(4, 24), G.collect(5, 24)], [8000, 12500, 16500]],
  ['Coral Columns', 24, 6, CORAL_PILLARS, [G.coral()], [6500, 10500, 13500]],
  ['Sandy Slope', 26, 6, STAIRS, [G.score(7000)], [7000, 11000, 14500]],
  ['Egg Garden', 26, 5, EGG_SAND, [G.eggs(), G.sand()], [18000, 29000, 38000]],
  ['Kelp Cascade', 24, 6, SAND_EDGES, [G.sand()], [8000, 12500, 16500]],
  ['Carnival Finale', 28, 5, EGG_THREE, [G.eggs(), G.score(17500)], [17500, 27500, 36500]],

  // --- Area 3: Coral Castle -------------------------------------------
  ['Castle Gates', 24, 6, CORAL_MAZE, [G.coral()], [7500, 11500, 15500]],
  ['Arched Halls', 24, 6, ARCH, [G.score(6500)], [6500, 10000, 13500]],
  ['Icy Turrets', 24, 6, ICE_CORAL, [G.ice(), G.coral()], [7500, 12000, 15500]],
  ['Fan Court', 26, 6, FAN, [G.collect(0, 26), G.collect(2, 26)], [8500, 14000, 18000]],
  ['Sunken Floor', 26, 6, SAND_FLOOR, [G.sand()], [12000, 19000, 25000]],
  ['Egg Escort', 30, 5, EGG_CORAL, [G.eggs(), G.coral()], [10500, 16500, 22000]],
  ['Tide Pools', 24, 6, TIDE, [G.score(7500)], [7500, 11500, 15500]],
  ['Deep Sand', 26, 6, SAND_DIAMOND, [G.sand()], [11500, 18500, 24500]],
  ['Four Eggs', 28, 5, EGG_FOUR, [G.eggs()], [18500, 29500, 39000]],
  ['Frozen Arcade', 24, 6, ICE_NEST, [G.ice(), G.collect(3, 26)], [8000, 13000, 17000]],
  ['Castle Crush', 28, 5, EGG_DIAMOND, [G.eggs(), G.score(16000)], [16000, 25500, 33500]],

  // --- Area 4: Glow Abyss ---------------------------------------------
  ['Glow Drift', 24, 6, DEEP_MIX, [G.sand(), G.coral()], [11500, 18500, 24500]],
  ['Lantern Lane', 24, 6, PILLARS, [G.score(6500)], [6500, 10000, 13000]],
  ['Frost Fortress', 26, 6, ICE_WALL, [G.ice(), G.score(8500)], [8500, 13500, 18000]],
  ['Abyss Nursery', 28, 5, DEEP_TIDE, [G.eggs(), G.sand()], [19000, 30000, 39500]],
  ['Pressure Point', 24, 6, DEEP_FORTRESS, [G.sand()], [9000, 14000, 18500]],
  ['Coral Crown', 26, 6, CORAL_MAZE, [G.coral(), G.collect(5, 28)], [10000, 16500, 21500]],
  ['Glass Gardens', 26, 6, ABYSS_CROWN, [G.sand(), G.ice()], [10500, 17000, 22500]],
  ['Six Colors Deep', 26, 6, SAND_CHECKER, [G.sand(), G.score(11000)], [11000, 18000, 23500]],
  ['Egg Rescue', 28, 5, EGG_FOUR, [G.eggs(), G.score(20500)], [20500, 33000, 43500]],
  ['Turtle Chorus', 28, 5, DEEP_MIX, [G.eggs(), G.sand(), G.coral()], [18000, 28500, 37500]],
  ['Reef Party', 30, 6, ABYSS_CROWN, [G.sand(), G.ice(), G.score(11000)], [11000, 18000, 23500]],
];

export const AREAS = [
  { name: 'Sunlit Shallows', from: 1, to: 11, tint: '#3ad4ff', blurb: 'Warm water, wobbly jellies, first baby turtles.' },
  { name: 'Kelp Carnival', from: 12, to: 22, tint: '#4ef0b0', blurb: 'Swaying kelp, sandy floors, the party gets going.' },
  { name: 'Coral Castle', from: 23, to: 33, tint: '#ff7ac6', blurb: 'Coral walls and icy turrets guard the nursery.' },
  { name: 'Glow Abyss', from: 34, to: 44, tint: '#b08cff', blurb: 'Deep, glowing, and full of turtles to set free.' },
];

function countChars(layout, chars) {
  let n = 0;
  for (const row of layout) for (const ch of row) if (chars.includes(ch)) n++;
  return n;
}

function sandLayers(layout) {
  let n = 0;
  for (const row of layout) for (const ch of row) {
    if (ch === '1') n += 1;
    if (ch === '2') n += 2;
  }
  return n;
}

export const GOAL_ART = {
  score: '⭐',
  collect: '🍬',
  sand: '🌿',
  coral: '🪸',
  ice: '🧊',
  eggs: '🥚',
};

function goalCount(goal, layout) {
  switch (goal.type) {
    case 'score': return goal.amount;
    case 'collect': return goal.count;
    case 'sand': return sandLayers(layout);
    case 'coral': return countChars(layout, 'cC') + countChars(layout, 'C');
    case 'ice': return countChars(layout, 'iI') + countChars(layout, 'I');
    case 'eggs': return countChars(layout, 'o');
    default: return 0;
  }
}

export function goalLabel(goal) {
  switch (goal.type) {
    case 'score': return `Score ${goal.amount.toLocaleString()}`;
    case 'collect': return `${COLOR_NAMES[goal.color]} jellies`;
    case 'sand': return 'Clear the sand';
    case 'coral': return 'Break the coral';
    case 'ice': return 'Free the ice jellies';
    case 'eggs': return 'Drop the turtle eggs';
    default: return goal.type;
  }
}

export const LEVELS = DATA.map(([name, moves, colors, layout, goals, stars], i) => ({
  id: i + 1,
  name,
  area: AREAS.findIndex((a) => i + 1 >= a.from && i + 1 <= a.to),
  moves,
  colors,
  layout,
  stars,
  goals: goals.map((goal) => ({ ...goal, need: goalCount(goal, layout) })),
}));

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(id) {
  return LEVELS[Math.max(0, Math.min(LEVEL_COUNT - 1, (id | 0) - 1))];
}

// Builds a playable board for a level. Same seed, same board, every time.
export function buildBoard(level, seed = 1) {
  const rng = new Rng(hashSeed(level.id, seed, 0x9e37));
  const w = level.layout[0].length;
  const h = level.layout.length;
  const mask = new Array(w * h).fill(false);
  const ground = new Array(w * h).fill(0);
  const placements = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = level.layout[r][c];
      const i = r * w + c;
      if (ch === '.') continue;
      mask[i] = true;
      if (ch === '1') ground[i] = 1;
      if (ch === '2') ground[i] = 2;
      if (ch === 'c') placements.push([i, () => coral(1)]);
      if (ch === 'C') placements.push([i, () => coral(2)]);
      if (ch === 'i') placements.push([i, () => jelly(rng.int(level.colors), null, 1)]);
      if (ch === 'I') placements.push([i, () => jelly(rng.int(level.colors), null, 2)]);
      if (ch === 'o') placements.push([i, () => egg()]);
    }
  }
  const board = new Board({ w, h, mask, ground, colors: level.colors, rng });
  for (const [i, make] of placements) board.cells[i] = make();
  board.fillEmpty();
  let guard = 0;
  while ((findMatches(board).length || !hasMoves(board)) && guard++ < 40) shuffleBoard(board, rng);
  return board;
}
