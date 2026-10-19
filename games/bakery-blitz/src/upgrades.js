// Kitchen upgrades: what you can buy with coins, and the numbers that come
// out of owning them. DOM-free so tests and the simulation share one truth.

export const BRANCHES = [
  { id: 'oven', name: 'The oven', icon: 'oven', blurb: 'Bake faster, burn later, bake twice.' },
  { id: 'counter', name: 'The counter', icon: 'counter', blurb: 'More room to keep dishes waiting.' },
  { id: 'speed', name: 'The kitchen', icon: 'mixer', blurb: 'Mixing, icing and sprinkling, quicker.' },
  { id: 'front', name: 'Front of house', icon: 'chair', blurb: 'Keep everybody comfy and tipping.' },
];

// `requires` must be owned first. Everything here also changes how the shop
// looks, which is half the fun of buying it.
export const UPGRADES = [
  {
    id: 'mitts1', branch: 'oven', name: 'Oven Mitts', cost: 450,
    desc: 'Bake 12% faster.', shop: 'Striped mitts hang by the oven.',
  },
  {
    id: 'thermo', branch: 'oven', name: 'Thermostat', cost: 700,
    desc: 'Bakes stay perfect 2.5s longer before they crisp.', shop: 'A brass dial on the oven door.',
  },
  {
    id: 'mitts2', branch: 'oven', name: 'Oven Mitts II', cost: 1100, requires: 'mitts1',
    desc: 'Bake 22% faster.', shop: 'Quilted mitts, and a timer that dings.',
  },
  {
    id: 'oven2', branch: 'oven', name: 'Second Oven', cost: 1800, requires: 'mitts1',
    desc: 'A whole second oven joins the row.', shop: 'Two ovens, side by side.',
  },
  {
    id: 'flowers', branch: 'counter', name: 'Window Flowers', cost: 150,
    desc: 'Cheers the place up. Purely lovely.', shop: 'Daisies in the window box.',
  },
  {
    id: 'counter2', branch: 'counter', name: 'Bigger Counter', cost: 400,
    desc: 'Three dishes can wait on the counter.', shop: 'A wider glass case.',
  },
  {
    id: 'counter3', branch: 'counter', name: 'Grand Display', cost: 1200, requires: 'counter2',
    desc: 'Four dishes can wait on the counter.', shop: 'A curved display with a brass rail.',
  },
  {
    id: 'bunting', branch: 'counter', name: 'Festival Bunting', cost: 500, requires: 'flowers',
    desc: 'Little flags over the counter. Purely lovely.', shop: 'Bunting strung wall to wall.',
  },
  {
    id: 'mix1', branch: 'speed', name: 'Quick Mixer', cost: 400,
    desc: 'Mix 15% faster.', shop: 'A shiny new paddle.',
  },
  {
    id: 'sprinkles', branch: 'speed', name: 'Sprinkle Jar', cost: 800,
    desc: 'Icing, jam and decorating 20% faster.', shop: 'Jars of sprinkles on the shelf.',
  },
  {
    id: 'mix2', branch: 'speed', name: 'Quick Mixer II', cost: 1100, requires: 'mix1',
    desc: 'Mix 26% faster.', shop: 'A mixer that hums.',
  },
  {
    id: 'bowl2', branch: 'speed', name: 'Second Bowl', cost: 1600, requires: 'mix1',
    desc: 'A second mixing bowl joins the row.', shop: 'Two bowls on the bench.',
  },
  {
    id: 'chairs', branch: 'front', name: 'Comfy Chairs', cost: 500,
    desc: 'Everybody waits 25% longer.', shop: 'Soft armchairs by the window.',
  },
  {
    id: 'jukebox', branch: 'front', name: 'Jukebox', cost: 1000,
    desc: 'Tips are 10% bigger.', shop: 'A little jukebox glowing on the wall.',
  },
  {
    id: 'mouse', branch: 'front', name: 'Helper Mouse', cost: 2200, requires: 'chairs',
    desc: 'Flour the mouse serves a waiting dish every few seconds.', shop: 'A mouse in an apron, running.',
  },
];

export const UPGRADE_IDS = UPGRADES.map((u) => u.id);
export const TOTAL_COST = UPGRADES.reduce((sum, u) => sum + u.cost, 0);

export function getUpgrade(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}

export function upgradesIn(branch) {
  return UPGRADES.filter((u) => u.branch === branch);
}

// An upgrade shows on the shelf once its prerequisite is owned.
export function isAvailable(id, owned = []) {
  const up = getUpgrade(id);
  if (!up || owned.includes(id)) return false;
  return !up.requires || owned.includes(up.requires);
}

export function canBuy(id, owned = [], coins = 0) {
  const up = getUpgrade(id);
  return !!up && isAvailable(id, owned) && coins >= up.cost;
}

export const BASE_EFFECTS = {
  bakeScale: 1,
  mixScale: 1,
  finishScale: 1,
  holdBonus: 0,
  counterSlots: 2,
  ovenCount: 1,
  mixerCount: 1,
  patienceScale: 1,
  tipBonus: 0,
  helper: false,
  helperEvery: 4.5,
  decor: { flowers: false, bunting: false, jukebox: false, chairs: false, mouse: false, mitts: false, thermo: false },
};

// Everything the simulation needs to know about what the player owns.
export function effects(owned = []) {
  const has = (id) => owned.includes(id);
  const eff = {
    ...BASE_EFFECTS,
    decor: {
      flowers: has('flowers'),
      bunting: has('bunting'),
      jukebox: has('jukebox'),
      chairs: has('chairs'),
      mouse: has('mouse'),
      mitts: has('mitts1') || has('mitts2'),
      thermo: has('thermo'),
    },
  };
  if (has('mitts2')) eff.bakeScale = 0.78;
  else if (has('mitts1')) eff.bakeScale = 0.88;
  if (has('mix2')) eff.mixScale = 0.74;
  else if (has('mix1')) eff.mixScale = 0.85;
  if (has('sprinkles')) eff.finishScale = 0.8;
  if (has('thermo')) eff.holdBonus = 2.5;
  if (has('counter3')) eff.counterSlots = 4;
  else if (has('counter2')) eff.counterSlots = 3;
  if (has('oven2')) eff.ovenCount = 2;
  if (has('bowl2')) eff.mixerCount = 2;
  if (has('chairs')) eff.patienceScale = 1.25;
  if (has('jukebox')) eff.tipBonus = 0.1;
  if (has('mouse')) eff.helper = true;
  return eff;
}

// How long one step takes with these upgrades.
export function scaledTime(base, stationId, eff = BASE_EFFECTS) {
  if (stationId === 'oven') return base * eff.bakeScale;
  if (stationId === 'mixer') return base * eff.mixScale;
  if (stationId === 'icing' || stationId === 'decor' || stationId === 'jam') return base * eff.finishScale;
  return base;
}
