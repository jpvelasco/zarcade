// Tile characters and the questions the physics asks about them. Levels are
// ASCII grids, so every tile is one character.

export const TILE = 16;

export const AIR = ' ';
export const GROUND = '#';    // earth, rock or metal, depending on the stage
export const BRICK = '=';     // brick or stone walls (solid)
export const LEDGE = '-';     // one-way branch or ledge: land from above, jump up through
export const LADDER = 'H';
export const WATER = '~';
export const LAVA = 'L';
export const SAND = 'Q';      // quicksand: you sink slowly and have to hop out
export const TAR = 'T';       // tar pit: quicksand that looks like tar
export const SPIKES = '^';

const SOLID = new Set([GROUND, BRICK]);
const HAZARD = new Set([WATER, LAVA, SPIKES]);
const SINKING = new Set([SAND, TAR]);

export const isSolid = (tile) => SOLID.has(tile);
export const isLedge = (tile) => tile === LEDGE;
export const isLadder = (tile) => tile === LADDER;
export const isHazard = (tile) => HAZARD.has(tile);
export const isSinking = (tile) => SINKING.has(tile);
/** Something you can stand on (from above). */
export const isSupport = (tile) => SOLID.has(tile) || tile === LEDGE || tile === LADDER || SINKING.has(tile);
