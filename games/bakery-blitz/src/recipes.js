// What the bakery can make and who comes in to eat it. DOM-free data: the
// simulation, the tests and the renderer all read these tables.

// ----------------------------------------------------------------- stations

// `start: true` means a station can begin a recipe on its own (it pulls raw
// ingredients from the shelf). `time` is the base seconds for one item, before
// upgrades; the oven uses the recipe's own bake time instead.
export const STATIONS = {
  mixer: { id: 'mixer', name: 'Mixing bowl', short: 'Mix', time: 2.2, start: true, slots: 1 },
  oven: { id: 'oven', name: 'Oven', short: 'Bake', time: 3.4, slots: 1, bakes: true },
  icing: { id: 'icing', name: 'Icing bench', short: 'Ice', time: 1.8, slots: 1 },
  jam: { id: 'jam', name: 'Jam pot', short: 'Jam', time: 2.4, slots: 1 },
  cocoa: { id: 'cocoa', name: 'Cocoa pot', short: 'Brew', time: 3.0, start: true, slots: 1 },
  decor: { id: 'decor', name: 'Decorating table', short: 'Decorate', time: 2.6, slots: 1 },
  juice: { id: 'juice', name: 'Juice press', short: 'Press', time: 2.2, start: true, slots: 1 },
};

export const STATION_IDS = Object.keys(STATIONS);

// Work only ever flows one way through the kitchen. Every recipe's steps must
// climb this list, which is what makes a jam impossible: a station can only
// ever wait on a station further down, so the waiting never goes in a circle.
export const FLOW = ['cocoa', 'juice', 'mixer', 'jam', 'oven', 'icing', 'decor'];

export function flowIndex(stationId) {
  return FLOW.indexOf(stationId);
}

// True when a chain of stations is legal: forwards only, no repeats.
export function flowsForward(steps) {
  for (let i = 1; i < steps.length; i++) {
    if (flowIndex(steps[i]) <= flowIndex(steps[i - 1])) return false;
  }
  return steps.every((s) => flowIndex(s) >= 0);
}

// ------------------------------------------------------------------ recipes

// `steps` is the chain of stations, in order. `bake` is the oven time for the
// recipe's oven step. `value` is the coins a perfect one is worth before tips.
export const RECIPES = {
  cocoa: {
    id: 'cocoa', name: 'Hot Cocoa', steps: ['cocoa'], value: 8, color: '#8d5524',
    blurb: 'Warm milk, a spoon of chocolate, one marshmallow raft.',
  },
  pretzel: {
    id: 'pretzel', name: 'Pretzel', steps: ['mixer', 'oven'], bake: 3.2, value: 12, color: '#c8812f',
    blurb: 'Twist the dough, bake it golden, finish with big salt.',
  },
  smoothie: {
    id: 'smoothie', name: 'Berry Smoothie', steps: ['juice'], value: 14, color: '#d05283',
    blurb: 'Berries from the market, pressed cold and frothy.',
  },
  cupcake: {
    id: 'cupcake', name: 'Cupcake', steps: ['mixer', 'oven', 'icing'], bake: 3.4, value: 18, color: '#ff7fb0',
    blurb: 'Vanilla sponge under a tall swirl of strawberry frosting.',
  },
  tart: {
    id: 'tart', name: 'Jam Tart', steps: ['mixer', 'jam', 'oven'], bake: 3.6, value: 22, color: '#e0433f',
    blurb: 'Shortcrust, a spoon of summer jam, a lattice on top.',
  },
  cookies: {
    id: 'cookies', name: 'Cookie Box', steps: ['mixer', 'oven', 'decor'], bake: 3.0, value: 26, color: '#b5703a',
    blurb: 'Six chocolate-chip cookies in a ribboned box.',
  },
  cake: {
    id: 'cake', name: 'Layer Cake', steps: ['mixer', 'oven', 'icing', 'decor'], bake: 4.6, value: 34, color: '#ffd166',
    blurb: 'Three sponges, buttercream between, berries on the crown.',
  },
  special: {
    id: 'special', name: 'Daily Special', steps: ['mixer', 'oven', 'decor'], bake: 3.8, value: 40, color: '#9b7bff',
    blurb: "Whatever Flour dreamed up last night. It changes every day.",
  },
};

export const RECIPE_IDS = Object.keys(RECIPES);

// Recipes in the order the campaign teaches them, for the recipe book.
export const BOOK_ORDER = ['cocoa', 'pretzel', 'cupcake', 'tart', 'cookies', 'cake', 'smoothie', 'special'];

export function getRecipe(id) {
  return RECIPES[id] || null;
}

// Seconds a station needs for one item of a recipe, before upgrades.
export function stepTime(recipeId, stationId) {
  const recipe = RECIPES[recipeId];
  if (stationId === 'oven') return (recipe && recipe.bake) || STATIONS.oven.time;
  return STATIONS[stationId] ? STATIONS[stationId].time : 2;
}

// The station a recipe's item goes to after finishing at `stationId`, or null
// when the dish is done and belongs on the display counter.
export function nextStation(recipeId, stationId) {
  const steps = RECIPES[recipeId].steps;
  const at = steps.indexOf(stationId);
  return at >= 0 && at + 1 < steps.length ? steps[at + 1] : null;
}

export function firstStation(recipeId) {
  return RECIPES[recipeId].steps[0];
}

// Sum of every step's base time: how long one dish takes with no waiting.
export function recipeTime(recipeId) {
  return RECIPES[recipeId].steps.reduce((total, s) => total + stepTime(recipeId, s), 0);
}

// ---------------------------------------------------------------- customers

// `patience` scales the day's patience seconds, `pay` scales the coins, `tip`
// scales the tip on top. Regulars have names and show them above their seat.
export const CUSTOMERS = {
  bunny: { id: 'bunny', name: 'Bun', patience: 1, pay: 1, tip: 1, order: [1, 2], fur: '#f6e7dd', ear: '#f3b9c4' },
  hedgehog: { id: 'hedgehog', name: 'Prickle', patience: 1.05, pay: 1, tip: 1, order: [1, 2], fur: '#b08968', ear: '#e0c3a3' },
  fox: { id: 'fox', name: 'Ember', patience: 0.9, pay: 1.05, tip: 1.1, order: [1, 2], fur: '#f08a3c', ear: '#ffe0c2' },
  cat: { id: 'cat', name: 'Mittens', patience: 0.95, pay: 1, tip: 1, order: [1, 3], fur: '#8d8fa3', ear: '#ded0e4' },
  owl: { id: 'owl', name: 'Professor Hoot', patience: 1.3, pay: 1.1, tip: 1, order: [2, 3], fur: '#9a7f5f', ear: '#efe2c9' },
  bear: {
    id: 'bear', name: 'Barnaby', regular: true, patience: 2.2, pay: 1.3, tip: 1, order: [3, 3],
    fur: '#a9754f', ear: '#e3bb95', note: 'Sleepy. Never in a hurry. Tips like a bear.',
  },
  squirrel: {
    id: 'squirrel', name: 'Nutmeg', regular: true, patience: 0.55, pay: 1, tip: 2, order: [1, 1],
    fur: '#c9743a', ear: '#f0c49a', note: 'Always late for something. Pays double for speed.',
  },
  moose: {
    id: 'moose', name: 'Mayor Maple', regular: true, patience: 1.6, pay: 1.5, tip: 1, order: [4, 4],
    fur: '#7f5a3c', ear: '#d8b58c', note: 'Orders for the whole town hall.',
  },
  twins: {
    id: 'twins', name: 'Pip & Posy', regular: true, patience: 1.15, pay: 1.2, tip: 1.1, order: [4, 4],
    fur: '#f0e2f7', ear: '#c6a4e8', note: 'Two bunnies, one very long order.',
  },
};

export const CUSTOMER_IDS = Object.keys(CUSTOMERS);

export function getCustomer(id) {
  return CUSTOMERS[id] || CUSTOMERS.bunny;
}

// Tip multiplier for the hearts still showing when a dish is handed over.
export const TIP_BY_HEARTS = [1, 1, 1.3, 1.6];

export function tipForHearts(hearts) {
  return TIP_BY_HEARTS[Math.max(0, Math.min(3, hearts | 0))];
}

// Hearts shown for a patience fraction between 0 and 1.
export function heartsFor(patience) {
  if (patience <= 0) return 0;
  return Math.max(1, Math.min(3, Math.ceil(patience * 3)));
}
