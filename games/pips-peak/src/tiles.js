// Tile vocabulary for Pip's Peak. Pure data and predicates: no DOM, no canvas.
//
// Levels are authored as ASCII grids (see levels.js). Every character below is
// one 16x16 tile. Anything not listed here is treated as empty air.

export const TILE = 16;

export const EMPTY = ' ';
export const SOLID = '#';
export const PLATFORM = '-'; // one-way: solid only when landing from above
export const ICE = 'I';
export const CRUMBLE = 'C';
export const MUSHROOM = 'M';
export const SPIKE = '^';
export const WATER = '~';
export const DOOR = 'D'; // solid until every switch in the level is pressed
export const START = 'S';
export const GOAL = 'G';
export const CHECKPOINT = 'f';
export const SEED = 'o';
export const ACORN = '@';
export const BEETLE = 'b';
export const BEE = 'e';
export const SWITCH = '!';

/** Characters that carve out scenery rather than spawning an object. */
const BLOCKING = new Set([SOLID, ICE, CRUMBLE, MUSHROOM, DOOR]);
const MARKERS = new Set([START, GOAL, CHECKPOINT, SEED, ACORN, BEETLE, BEE, SWITCH]);

/** True when the character is a full tile the player cannot pass through. */
export function isBlocking(ch) {
  return BLOCKING.has(ch);
}

/** True when the character only stops a player falling onto it from above. */
export function isPlatform(ch) {
  return ch === PLATFORM;
}

/** True when touching the tile costs Pip a petal. */
export function isHazard(ch) {
  return ch === SPIKE || ch === WATER;
}

/** True when the character spawns an entity or collectible instead of terrain. */
export function isMarker(ch) {
  return MARKERS.has(ch);
}

/** Every legal authoring character, used by the level validity tests. */
export const LEGEND = Object.freeze({
  [EMPTY]: 'air',
  [SOLID]: 'solid ground',
  [PLATFORM]: 'one-way platform',
  [ICE]: 'ice',
  [CRUMBLE]: 'crumbling block',
  [MUSHROOM]: 'springy mushroom',
  [SPIKE]: 'thorns',
  [WATER]: 'water',
  [DOOR]: 'gate',
  [START]: 'start',
  [GOAL]: 'sunrise',
  [CHECKPOINT]: 'checkpoint flower',
  [SEED]: 'seed',
  [ACORN]: 'golden acorn',
  [BEETLE]: 'beetle',
  [BEE]: 'bee',
  [SWITCH]: 'switch',
});
