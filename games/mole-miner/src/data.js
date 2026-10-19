// Game data: tiles, layers, ores, upgrades, museum, paints and milestones.
// DOM-free so the generator, the simulation, the bot and Node tests share it.

export const SAVE_KEY = 'mole-miner.v1';
export const METERS_PER_TILE = 2;

// Tile codes. Ores and museum pieces occupy ranges.
export const T = {
  EMPTY: 0, SOIL: 1, BEDROCK: 2, PAD: 3, GAS: 4, BOULDER: 5, LAVA: 6, COOLED: 7,
  FUEL: 8, CORE: 9, BRICK: 10, BOUNCE: 11, ACORN: 12,
  ORE0: 16, RELIC0: 40,
};

// Decoration codes (non-solid art in empty cave tiles).
export const D = { NONE: 0, CRYSTAL_UP: 1, CRYSTAL_DOWN: 2, SHROOM: 3, PILLAR: 4, TORCH: 5, ROOTS: 6, FLOWER: 7 };

export const LAYERS = [
  { id: 'meadow', name: 'Meadow Soil', top: 0, hard: 1, density: 0.11, gas: 0, boulder: 0, caves: 0.025,
    colors: { base: '#9a6438', dark: '#6b4022', light: '#b97a46', bg: '#3b2414', speck: '#d29a62', edge: '#4a2c16' }, music: 0 },
  { id: 'clay', name: 'Clay Banks', top: 30, hard: 2, density: 0.12, gas: 0.012, boulder: 0.018, caves: 0.04,
    colors: { base: '#c36b3c', dark: '#8a4322', light: '#de8a55', bg: '#472013', speck: '#f0a876', edge: '#5a2812' }, music: 1 },
  { id: 'rock', name: 'Stony Deep', top: 70, hard: 3, density: 0.12, gas: 0.014, boulder: 0.03, caves: 0.07,
    colors: { base: '#7d8496', dark: '#525868', light: '#9aa1b3', bg: '#24262f', speck: '#c2c8d6', edge: '#33363f' }, music: 2 },
  { id: 'crystal', name: 'Crystal Caves', top: 118, hard: 4, density: 0.13, gas: 0.014, boulder: 0.022, caves: 0.2,
    colors: { base: '#5d4a8f', dark: '#3d2f63', light: '#7b66b0', bg: '#1c1530', speck: '#c7a8ff', edge: '#2a2046' }, music: 3 },
  { id: 'mushroom', name: 'Glowcap Grotto', top: 166, hard: 5, density: 0.13, gas: 0.022, boulder: 0.018, caves: 0.22,
    colors: { base: '#2f5c6a', dark: '#1e3e49', light: '#3f7787', bg: '#0d2128', speck: '#7ff0d8', edge: '#14303a' }, music: 4 },
  { id: 'lava', name: 'Lava Lands', top: 214, hard: 5, density: 0.13, gas: 0.012, boulder: 0.025, caves: 0.08,
    colors: { base: '#4a2e2e', dark: '#2f1b1d', light: '#64403c', bg: '#1d0e0f', speck: '#ff8a4c', edge: '#251314' }, music: 5 },
  { id: 'ruins', name: 'Ancient Ruins', top: 256, hard: 6, density: 0.12, gas: 0.01, boulder: 0.012, caves: 0,
    colors: { base: '#a58a55', dark: '#6f5a33', light: '#c6a96c', bg: '#2e2414', speck: '#ffe08a', edge: '#3d301a' }, music: 6 },
];

export const MAIN_WORLD = { w: 36, h: 300, baseX0: 1, baseX1: 9, startX: 8, layerTops: null, core: true, relics: true };
// The daily mine is small: three layers squeezed into 74 rows.
export const DAILY_WORLD = { w: 22, h: 74, baseX0: 1, baseX1: 6, startX: 5, layerTops: [0, 24, 48], core: false, relics: false };

// value in coins; rows are where the ore appears in the main mine, peak is
// where it is most common.
export const ORES = [
  { id: 'copper', name: 'Copper', value: 5, rows: [1, 64], peak: 14, color: '#e08a4a', glow: false },
  { id: 'amber', name: 'Amber', value: 12, rows: [4, 76], peak: 26, color: '#ffb52e', glow: false },
  { id: 'iron', name: 'Iron', value: 22, rows: [28, 120], peak: 48, color: '#c9b8a8', glow: false },
  { id: 'topaz', name: 'Topaz', value: 38, rows: [32, 130], peak: 62, color: '#4fd6ff', glow: false },
  { id: 'silver', name: 'Silver', value: 60, rows: [68, 170], peak: 92, color: '#e8eef8', glow: false },
  { id: 'sapphire', name: 'Sapphire', value: 95, rows: [76, 178], peak: 108, color: '#3f6bff', glow: false },
  { id: 'amethyst', name: 'Amethyst', value: 150, rows: [116, 222], peak: 138, color: '#c66bff', glow: true },
  { id: 'emerald', name: 'Emerald', value: 230, rows: [124, 230], peak: 156, color: '#36e07a', glow: true },
  { id: 'glowstone', name: 'Glowstone', value: 330, rows: [164, 262], peak: 186, color: '#9dffb0', glow: true },
  { id: 'moonpearl', name: 'Moonpearl', value: 470, rows: [172, 270], peak: 204, color: '#f3f0ff', glow: true },
  { id: 'ruby', name: 'Ruby', value: 640, rows: [212, 299], peak: 232, color: '#ff3b5c', glow: true },
  { id: 'fireopal', name: 'Fire Opal', value: 880, rows: [220, 299], peak: 248, color: '#ff8a1e', glow: true },
  { id: 'idol', name: 'Idol Coin', value: 1150, rows: [254, 299], peak: 272, color: '#ffd84a', glow: true },
  { id: 'starheart', name: 'Starheart', value: 1600, rows: [262, 299], peak: 290, color: '#fff6c8', glow: true },
];

// Upgrade branches. `tiers[i]` is the stat at tier i; `cost[i]` the price to
// buy tier i (tier 0 is the starting part).
export const UPGRADES = {
  drill: { name: 'Drill', icon: 'drill', tiers: [1, 2, 3, 4, 5, 6], cost: [0, 120, 600, 2100, 6500, 21000],
    names: ['Twig Drill', 'Copper Drill', 'Iron Drill', 'Crystal Drill', 'Glow Drill', 'Star Drill'],
    blurbs: ['Digs meadow soil', 'Digs clay', 'Digs stone', 'Digs crystal rock', 'Digs grotto and lava rock', 'Digs ancient ruins'] },
  tank: { name: 'Fuel Tank', icon: 'tank', tiers: [40, 58, 80, 108, 145, 195], cost: [0, 80, 340, 1200, 3600, 10500],
    names: ['Thimble Tank', 'Jug Tank', 'Barrel Tank', 'Big Barrel', 'Tower Tank', 'Mega Tank'] },
  cargo: { name: 'Cargo Hold', icon: 'cargo', tiers: [8, 12, 17, 24, 32, 42], cost: [0, 80, 320, 1100, 3400, 9800],
    names: ['Pocket', 'Satchel', 'Basket', 'Crate', 'Wagon', 'Vault'] },
  hull: { name: 'Hull', icon: 'hull', tiers: [40, 60, 85, 115, 150, 200], cost: [0, 65, 260, 900, 2900, 8500],
    names: ['Tin Hull', 'Copper Hull', 'Iron Hull', 'Crystal Hull', 'Glow Hull', 'Star Hull'] },
  lamp: { name: 'Lamp', icon: 'lamp', tiers: [3.2, 4.2, 5.2, 6.3, 7.4, 8.6], cost: [0, 50, 210, 780, 2300, 7200],
    names: ['Candle', 'Lantern', 'Bright Lamp', 'Spotlight', 'Glow Beam', 'Sunbeam'] },
  prop: { name: 'Propeller', icon: 'prop', tiers: [5.2, 6.4, 7.6, 8.8, 10.2, 12], cost: [0, 80, 340, 1200, 3600, 10500],
    names: ['Pinwheel', 'Whirly', 'Twin Blade', 'Turbo Fan', 'Jet Fan', 'Rocket Fan'] },
  fan: { name: 'Frost Fan', icon: 'fan', tiers: [0, 1], cost: [0, 12000], names: ['None', 'Frost Fan'],
    blurbs: ['', 'Cools lava so you can dig it'], needsDrill: 4 },
};
export const UPGRADE_ORDER = ['drill', 'tank', 'cargo', 'hull', 'lamp', 'prop', 'fan'];

// Museum: 24 pieces in six sets of four. `layer` is where they are buried.
export const MUSEUM = [
  { id: 'shells', name: 'Seashell Fossils', layers: [0], paint: 'berry', pieces: ['ammonite', 'trilobite', 'fern', 'sharktooth'] },
  { id: 'rex', name: 'Tiny Rex Skeleton', layers: [1, 2], paint: 'rexbone', pieces: ['rexskull', 'rexribs', 'rexleg', 'rextail'] },
  { id: 'gems', name: 'Crystal Treasures', layers: [3], paint: 'geode', pieces: ['geode', 'prism', 'crown', 'bell'] },
  { id: 'grotto', name: 'Glowcap Keepsakes', layers: [4], paint: 'spore', pieces: ['lantern', 'flute', 'caphat', 'glowmap'] },
  { id: 'fire', name: 'Fire Relics', layers: [5], paint: 'phoenix', pieces: ['emberidol', 'dragonscale', 'magmabowl', 'feather'] },
  { id: 'ruins', name: 'Ruins Treasures', layers: [6], paint: 'starlight', pieces: ['sundisk', 'moonkey', 'startablet', 'moleking'] },
];
export const PIECE_NAMES = {
  ammonite: 'Spiral Ammonite', trilobite: 'Trilobite', fern: 'Fern Print', sharktooth: 'Shark Tooth',
  rexskull: 'Rex Skull', rexribs: 'Rex Ribs', rexleg: 'Rex Leg', rextail: 'Rex Tail',
  geode: 'Geode Egg', prism: 'Prism Lens', crown: 'Crystal Crown', bell: 'Echo Bell',
  lantern: 'Spore Lantern', flute: 'Root Flute', caphat: 'Cap Hat', glowmap: 'Glow Map',
  emberidol: 'Ember Idol', dragonscale: 'Dragon Scale', magmabowl: 'Magma Bowl', feather: 'Phoenix Feather',
  sundisk: 'Sun Disk', moonkey: 'Moon Key', startablet: 'Star Tablet', moleking: 'Mole King Statue',
};
export const PIECES = MUSEUM.flatMap((set, si) => set.pieces.map((id, pi) => ({ id, set: set.id, setIndex: si, index: si * 4 + pi, name: PIECE_NAMES[id] })));
export const PIECE_REWARD = [20, 60, 150, 400, 900, 1600]; // coins per piece by set

export const PAINTS = [
  { id: 'sunflower', name: 'Sunflower', body: '#ffc93c', trim: '#e2902a', how: 'Starter paint' },
  { id: 'clover', name: 'Clover', body: '#5fd27a', trim: '#2f9a52', how: 'Reach 60 m' },
  { id: 'pebble', name: 'Pebble', body: '#9fb1c6', trim: '#62738a', how: 'Reach 140 m' },
  { id: 'amethyst', name: 'Amethyst', body: '#b07cff', trim: '#7346c9', how: 'Reach 236 m' },
  { id: 'glowcap', name: 'Glowcap', body: '#44e6cb', trim: '#1c9c8c', how: 'Reach 332 m' },
  { id: 'ember', name: 'Ember', body: '#ff7a45', trim: '#c4421d', how: 'Reach 428 m' },
  { id: 'ruingold', name: 'Ruin Gold', body: '#ecc65e', trim: '#a8822c', how: 'Reach 512 m' },
  { id: 'rainbow', name: 'Rainbow Core', body: '#ff6bd5', trim: '#6b7bff', how: 'Reach the Ancient Core', rainbow: true },
  { id: 'berry', name: 'Berry', body: '#ef5d86', trim: '#b02a55', how: 'Finish Seashell Fossils' },
  { id: 'rexbone', name: 'Rex Bone', body: '#f2e8d2', trim: '#b8a684', how: 'Finish Tiny Rex Skeleton' },
  { id: 'geode', name: 'Geode', body: '#6fd3ff', trim: '#2f8fc4', how: 'Finish Crystal Treasures' },
  { id: 'spore', name: 'Spore', body: '#c8f56c', trim: '#7fae2a', how: 'Finish Glowcap Keepsakes' },
  { id: 'phoenix', name: 'Phoenix', body: '#ffa23c', trim: '#d4471e', how: 'Finish Fire Relics' },
  { id: 'starlight', name: 'Starlight', body: '#fff1a6', trim: '#d9b44a', how: 'Finish Ruins Treasures' },
  { id: 'sunrise', name: 'Sunrise', body: '#ff9ec0', trim: '#e0607e', how: 'Daily Dig streak of 3' },
  { id: 'moonbeam', name: 'Moonbeam', body: '#aebcff', trim: '#6574d6', how: 'Daily Dig streak of 7' },
];

// Depth milestones in meters. Layer milestones unlock a paint.
export const MILESTONES = [
  { m: 20, coins: 20 }, { m: 60, coins: 40, paint: 'clover', label: 'Clay Banks' }, { m: 100, coins: 70 },
  { m: 140, coins: 120, paint: 'pebble', label: 'Stony Deep' }, { m: 190, coins: 200 },
  { m: 236, coins: 300, paint: 'amethyst', label: 'Crystal Caves' }, { m: 290, coins: 450 },
  { m: 332, coins: 600, paint: 'glowcap', label: 'Glowcap Grotto' }, { m: 380, coins: 800 },
  { m: 428, coins: 1000, paint: 'ember', label: 'Lava Lands' }, { m: 470, coins: 1300 },
  { m: 512, coins: 1600, paint: 'ruingold', label: 'Ancient Ruins' }, { m: 550, coins: 2000 },
  { m: 590, coins: 2500, label: 'The Core' },
];

// Physics and fuel tuning (tiles and seconds).
export const PHYS = {
  gravity: 22, maxFall: 14, groundSpeed: 4.6, airSpeed: 4.0, groundAccel: 30, airAccel: 16,
  podW: 0.8, podH: 0.8,
  burnDrill: 0.85, burnFly: 1.0, burnDrive: 0.4, burnIdle: 0.05,
  lavaSting: 7, gasDamage: 3, boulderDamage: 10, wobble: 1.0,
};

export function layerIndexForRow(row, tops = null) {
  const list = tops || LAYERS.map((l) => l.top);
  let li = 0;
  for (let i = 0; i < list.length; i++) if (row >= list[i]) li = i;
  return li;
}
