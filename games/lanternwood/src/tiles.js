// Tile characters and what they mean. Maps are strings of these characters,
// one per 16 px tile, and both the game and the solver read them through the
// predicates below so they always agree about what blocks what.

export const TILE = 16;
export const ROOM_W = 20; // tiles per screen / room
export const ROOM_H = 12;

// solid: blocks walking.  fly: thrown things and the grapple vine pass over it.
// cut: becomes this tile when the sword (or leafarang) cuts it.
const T = {
  '.': { name: 'ground' },
  ',': { name: 'tall grass', cut: '.', grass: true },
  '-': { name: 'path' },
  ':': { name: 'sand' },
  'f': { name: 'flowers' },
  '=': { name: 'planks' },
  '_': { name: 'stone' },
  'P': { name: 'plate', plate: true },
  '+': { name: 'stairs', warp: true },
  'T': { name: 'tree', solid: true, tall: true },
  '^': { name: 'cliff', solid: true },
  'r': { name: 'rock', solid: true },
  'b': { name: 'bush', solid: true, cut: '.' },
  '~': { name: 'water', solid: true, fly: true, water: true },
  'x': { name: 'pit', solid: true, fly: true, pit: true },
  'o': { name: 'post', solid: true, post: true },
  '|': { name: 'fence', solid: true },
  'Y': { name: 'lamp post', solid: true, lamp: true },
  't': { name: 'torch', solid: true, torch: true },
  'c': { name: 'switch', solid: true, switch: true },
  '%': { name: 'cracked rock', solid: true, crack: true },
  'g': { name: 'bars', solid: true, gate: true, opened: '.' },
  'w': { name: 'drawbridge', solid: true, fly: true, gate: true, opened: '=' },
  'S': { name: 'shutter', solid: true, gate: true, opened: '.' },
  'L': { name: 'locked door', solid: true, lock: 'key' },
  'B': { name: 'boss door', solid: true, lock: 'bigkey' },
  '#': { name: 'wall', solid: true, wall: true },
  'R': { name: 'roof', solid: true },
  'H': { name: 'house', solid: true },
  'O': { name: 'great lantern', solid: true },
  'W': { name: 'well', solid: true },
  'k': { name: 'counter', solid: true },
};

export const TILES = T;
const NONE = { name: 'void', solid: true };
const CACHE = new Array(128).fill(NONE);
for (const [ch, def] of Object.entries(T)) CACHE[ch.charCodeAt(0)] = def;

/** Tile definition for a char code. Unknown codes are solid. */
export const tileDef = (code) => CACHE[code] || NONE;
export const code = (ch) => ch.charCodeAt(0);
export const isSolid = (c) => !!tileDef(c).solid;
// Thrown things (leafarang, ember, vine) fly over open ground, water and pits.
export const isFlyable = (c) => { const d = tileDef(c); return !d.solid || !!d.fly; };
export const isPost = (c) => !!tileDef(c).post;
export const isKnownTile = (ch) => Object.prototype.hasOwnProperty.call(T, ch);

export const ITEM_RANGE = {
  sword: 1,      // tiles: hits what is right in front
  ember: 3,      // lantern flame lights torches this far away
  boomerang: 7,  // leafarang flies this far and back
  grapple: 6,    // vine seed reaches this far
};
