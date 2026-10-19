// Element ids, the paint palette and the collection. Pure data, no DOM.

export const EMPTY = 0;
export const SAND = 1;
export const WATER = 2;
export const SOIL = 3;
export const SEED = 4;
export const STONE = 5;
export const LAVA = 6;
export const STEAM = 7;
export const OBSIDIAN = 8;
export const FIRE = 9;
export const STEM = 10;
export const LEAF = 11;
export const FLOWER = 12;
export const WOOD = 13;
export const ACORN = 14;
export const ICE = 15;
export const MOSS = 16;
export const FISH = 17;
export const FIREFLY = 18;
export const TIP = 19; // a growing plant tip; `b` holds its kind
export const TYPE_COUNT = 20;

// Plant kinds, kept in the low three bits of `b` on TIP, STEM, LEAF, WOOD
// and FLOWER cells. Bit 3 is a direction or flag, bits 4–7 a colour.
export const K_FLOWER = 1;
export const K_GRASS = 2;
export const K_VINE = 3;
export const K_TREE = 4;
export const K_BRANCH = 5;
export const K_CROWN = 6;

export const FLOWER_COLOURS = 7;
export const CROWN_VARIANTS = 4; // green, deep green, blossom, autumn

// Wet soil holds 0..WET_MAX; seeds sprout on soil at least WET_SPROUT wet.
export const WET_MAX = 7;
export const WET_SPROUT = 2;

// Cells the update loop never needs to visit.
export const STATIC = new Uint8Array(TYPE_COUNT);
for (const t of [EMPTY, STONE, OBSIDIAN, STEM, LEAF, FLOWER, WOOD, ICE]) STATIC[t] = 1;

// What burns, and for how many steps.
export const BURN_LIFE = new Uint8Array(TYPE_COUNT);
BURN_LIFE[STEM] = 26;
BURN_LIFE[LEAF] = 20;
BURN_LIFE[FLOWER] = 18;
BURN_LIFE[WOOD] = 90;
BURN_LIFE[SEED] = 14;
BURN_LIFE[ACORN] = 30;
BURN_LIFE[MOSS] = 16;
BURN_LIFE[TIP] = 20;

// Solid things vines can climb and moss can cling to.
export const SUPPORT = new Uint8Array(TYPE_COUNT);
for (const t of [STONE, OBSIDIAN, WOOD, ICE]) SUPPORT[t] = 1;
export const SURFACE = new Uint8Array(TYPE_COUNT);
for (const t of [STONE, OBSIDIAN, WOOD, ICE, SOIL, SAND]) SURFACE[t] = 1;

// Ground that refit may extend sideways when a garden gets wider.
export const GROUND = new Uint8Array(TYPE_COUNT);
for (const t of [STONE, SOIL]) GROUND[t] = 1;

// Glowing cells: drawn into the glow layer and left untinted at night.
export const EMISSIVE = new Uint8Array(TYPE_COUNT);
for (const t of [LAVA, FIRE, MOSS, FIREFLY]) EMISSIVE[t] = 1;

// The paint palette, in tray order. `key` is the keyboard shortcut.
// density: share of the brush area filled per stamp (pours for powders and
// liquids, solid for building blocks). `over`: what this brush may replace
// besides empty space and steam.
export const PALETTE = [
  { id: 'sand', el: SAND, name: 'Sand', key: '1', density: 0.35 },
  { id: 'water', el: WATER, name: 'Water', key: '2', density: 0.45 },
  { id: 'soil', el: SOIL, name: 'Soil', key: '3', density: 0.5 },
  { id: 'seed', el: SEED, name: 'Seeds', key: '4', density: 0.05 },
  { id: 'stone', el: STONE, name: 'Stone', key: '5', density: 1, over: [WATER, LAVA, FIRE] },
  { id: 'lava', el: LAVA, name: 'Lava', key: '6', density: 0.35 },
  { id: 'acorn', el: ACORN, name: 'Acorn', key: '7', density: 0.012, unlock: 'waterfall' },
  { id: 'ice', el: ICE, name: 'Ice', key: '8', density: 1, over: [WATER], unlock: 'obsidian' },
  { id: 'moss', el: MOSS, name: 'Glow moss', key: '9', density: 0.6, unlock: 'tall-tree' },
  { id: 'fish', el: FISH, name: 'Fish', key: '0', density: 0, over: [WATER], unlock: 'melt' },
  { id: 'firefly', el: FIREFLY, name: 'Fireflies', key: 'f', density: 0.012, unlock: 'deep-pond' },
];
export const BASE_ELEMENTS = PALETTE.filter((p) => !p.unlock).map((p) => p.id);
export const PALETTE_BY_ID = Object.fromEntries(PALETTE.map((p) => [p.id, p]));

// Brush sizes are radii in cells.
export const BRUSH_SIZES = [0, 1, 2, 4, 7, 11];
export const DEFAULT_SIZE = 3;
export const BRUSHES = [
  { id: 'round', name: 'Round' },
  { id: 'spray', name: 'Spray', unlock: 'sprout' },
  { id: 'line', name: 'Line', unlock: 'flowers' },
];

export const SKIES = [
  { id: 'meadow', name: 'Meadow' },
  { id: 'sunset', name: 'Sunset', unlock: 'rain' },
  { id: 'aurora', name: 'Aurora', unlock: 'glow-cave' },
  { id: 'candy', name: 'Candy', unlock: 'firefly-night' },
];

// The collection: everything a player can find in the garden. `hint` shows
// on the silhouette until it is found.
export const COLLECTION = [
  { id: 'sand', name: 'Sand', fact: 'Piles up and slides down slopes.', hint: 'Paint with sand.' },
  { id: 'water', name: 'Water', fact: 'Flows, fills ponds and soaks into soil.', hint: 'Paint with water.' },
  { id: 'soil', name: 'Soil', fact: 'Seeds grow in it when it is wet.', hint: 'Paint with soil.' },
  { id: 'mud', name: 'Wet soil', fact: 'Dark and damp: seeds love it.', hint: 'Pour water on soil.' },
  { id: 'seed', name: 'Seeds', fact: 'Tiny and light. They sink slowly in water.', hint: 'Paint with seeds.' },
  { id: 'sprout', name: 'Sprout', fact: 'A seed on wet soil wakes up.', hint: 'Drop a seed on wet soil.' },
  { id: 'flower', name: 'Flower', fact: 'Seven colours. Which will you get?', hint: 'Let a sprout grow tall.' },
  { id: 'vine', name: 'Vine', fact: 'Climbs walls of stone and wood.', hint: 'Plant a seed right next to stone.' },
  { id: 'acorn', name: 'Acorn', fact: 'A big seed with a whole tree inside.', hint: 'Finish the waterfall goal.' },
  { id: 'tree', name: 'Tree', fact: 'Green, deep green, blossom or autumn.', hint: 'Plant an acorn in wet soil.' },
  { id: 'stone', name: 'Stone', fact: 'Never moves. Great for walls and dams.', hint: 'Paint with stone.' },
  { id: 'lava', name: 'Lava', fact: 'Hot, slow and glowing.', hint: 'Paint with lava.' },
  { id: 'steam', name: 'Steam', fact: 'Water that got too hot floats up.', hint: 'Let lava touch water.' },
  { id: 'rain', name: 'Rain', fact: 'Steam cools high up and falls again.', hint: 'Make lots of steam.' },
  { id: 'obsidian', name: 'Obsidian', fact: 'Shiny black glass from lava that cooled underwater.', hint: 'Drop lava into a deep pond.' },
  { id: 'fire', name: 'Fire', fact: 'Plants burn near lava. Water puts it out.', hint: 'Let lava touch a plant.' },
  { id: 'ice', name: 'Ice', fact: 'Cold and solid, until lava comes near.', hint: 'Finish the obsidian goal.' },
  { id: 'moss', name: 'Glow moss', fact: 'Creeps over stone and glows at night.', hint: 'Finish the tall tree goal.' },
  { id: 'fish', name: 'Fish', fact: 'Swims in ponds. Flops back to water.', hint: 'Finish the ice goal.' },
  { id: 'firefly', name: 'Firefly', fact: 'Visits flowers at dusk and twinkles.', hint: 'Finish the deep pond goal.' },
];
export const COLLECTION_IDS = COLLECTION.map((c) => c.id);
