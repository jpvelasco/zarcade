// Static game data: building types, kingdoms, rival personalities, heroes,
// banners. DOM-free.

export const WORLD_W = 1600;
export const WORLD_H = 1000;

// grow: troops per second while owned. cap: growth stops here.
// def: defenders count troops × def. r: size on the map (world units).
export const BUILDINGS = {
  castle: { name: 'Castle', grow: 1.2, cap: 80, def: 1, r: 50, blurb: 'Your home. Big, and grows soldiers steadily.' },
  cottage: { name: 'Cottage', grow: 0.7, cap: 40, def: 1, r: 36, blurb: 'A cosy little house that grows soldiers slowly.' },
  mill: { name: 'Windmill', grow: 1.6, cap: 50, def: 1, r: 40, blurb: 'Windmills grow soldiers fastest of all. Grab them early!' },
  tower: { name: 'Tower', grow: 0.4, cap: 40, def: 1.6, r: 38, range: 190, fire: 1, blurb: 'Towers are hard to capture and shoot arrows at enemy squads walking past.' },
  forge: { name: 'Forge', grow: 0.6, cap: 40, def: 1, r: 38, blurb: 'Each forge you own makes all your squads march 30% faster (up to two).' },
  shrine: { name: 'Shrine', grow: 0.3, cap: 30, def: 1, r: 34, blurb: 'Each shrine you own makes all your buildings grow 25% faster (up to two).' },
};
export const BUILDING_TYPES = Object.keys(BUILDINGS);

export const MARCH_SPEED = 115; // world units per second
export const FORGE_BONUS = 0.3;
export const SHRINE_BONUS = 0.25;
export const MAX_STACK = 2;
export const OVERCAP_DECAY = 0.5;
export const TOWER_DAMAGE = 1;

// Kingdom colours. The player picks one; rivals take the next free ones.
export const COLORS = [
  { id: 'bluebell', name: 'Bluebell', fill: '#3d7fe0', dark: '#1f4f9e', light: '#a9c9ff' },
  { id: 'poppy', name: 'Poppy', fill: '#e2483d', dark: '#9c2219', light: '#ffb3a8' },
  { id: 'violet', name: 'Violet', fill: '#9159db', dark: '#5a2f98', light: '#d6bdfa' },
  { id: 'pumpkin', name: 'Pumpkin', fill: '#f0862a', dark: '#a8520c', light: '#ffd0a1' },
  { id: 'clover', name: 'Clover', fill: '#2fa85a', dark: '#16683a', light: '#a9ebbe' },
  { id: 'sunflower', name: 'Sunflower', fill: '#eab421', dark: '#9a7108', light: '#ffe79a' },
  { id: 'lagoon', name: 'Lagoon', fill: '#17b0b0', dark: '#0b6d70', light: '#9df0ec' },
  { id: 'rose', name: 'Rose', fill: '#e2589f', dark: '#9b2463', light: '#ffbfdf' },
];
export const NEUTRAL_COLOR = { id: 'neutral', name: 'Wild', fill: '#bdb5a6', dark: '#7b7365', light: '#ece6da' };
export const RIVAL_ORDER = ['poppy', 'violet', 'pumpkin', 'sunflower', 'rose', 'lagoon', 'clover', 'bluebell'];

export const EMBLEMS = ['crown', 'star', 'heart', 'moon', 'shield', 'flower', 'sun', 'fish', 'acorn', 'dragon'];
export const EMBLEM_NAMES = {
  crown: 'Crown', star: 'Star', heart: 'Heart', moon: 'Moon', shield: 'Shield',
  flower: 'Flower', sun: 'Sun', fish: 'Fish', acorn: 'Acorn', dragon: 'Dragon',
};

// What unlocks each colour and emblem. `stars` counts campaign stars,
// `wins` counts all wins, `streak` the best daily streak.
export const COLOR_UNLOCKS = {
  bluebell: {}, clover: { stars: 3 }, sunflower: { stars: 9 }, lagoon: { wins: 8 },
  rose: { streak: 2 }, pumpkin: { stars: 30 }, violet: { stars: 50 }, poppy: { stars: 75 },
};
export const EMBLEM_UNLOCKS = {
  crown: {}, star: { stars: 5 }, heart: { wins: 3 }, flower: { stars: 14 }, moon: { streak: 1 },
  shield: { stars: 22 }, fish: { wins: 12 }, sun: { stars: 40 }, acorn: { streak: 4 }, dragon: { stars: 90 },
};

export const PERSONALITIES = {
  cautious: { name: 'Duke Bramble', title: 'the Hedgehog Duke', blurb: 'Careful. Keeps lots of soldiers at home and defends well.', emblem: 'shield' },
  greedy: { name: 'Queen Marigold', title: 'of the Golden Fields', blurb: 'Grabby! Rushes for every free building, especially windmills.', emblem: 'sun' },
  sneaky: { name: 'Baron Fox', title: 'the Sly', blurb: 'Sneaky. Pounces on empty buildings right after you send soldiers away.', emblem: 'moon' },
};

export const DIFFICULTIES = {
  easy: { name: 'Easy', think: 4, sources: 1, grace: 25, defend: false, foresight: 0, noise: 0.35, reserve: 0.15 },
  normal: { name: 'Normal', think: 2.6, sources: 2, grace: 15, defend: true, foresight: 0.5, noise: 0.2, reserve: 0.1 },
  hard: { name: 'Hard', think: 0.9, sources: 4, grace: 0, defend: true, foresight: 1, noise: 0, reserve: 0.05 },
};

export const HEROES = {
  knight: { name: 'Sir Pip', role: 'Knight', blurb: 'Her squad hits 1.5× as hard.', unlock: 3 },
  ranger: { name: 'Wren', role: 'Ranger', blurb: 'His squad marches twice as fast.', unlock: 9 },
  wizard: { name: 'Old Moss', role: 'Wizard', blurb: 'The building he reaches gets a magic shield: defence ×2 for 15 s.', unlock: 17 },
  shepherd: { name: 'Shepherd Bo', role: 'Shepherd', blurb: 'The building she reaches grows twice as fast for 20 s.', unlock: 25 },
};
// unlock: campaign maps cleared before the hero joins.
export const HERO_ORDER = ['knight', 'ranger', 'wizard', 'shepherd'];
export const HERO_COOLDOWN = 25;
export const KNIGHT_POWER = 1.5;
export const WIZARD_SHIELD = 15;
export const SHEPHERD_BOOST = 20;
