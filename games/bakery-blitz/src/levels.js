// The campaign: five chapters of nine days. A day spec is small; `buildDay`
// turns it into the exact customer script, which is deterministic from the
// day's id, so every play of day 7 meets the same queue in the same order.
import { Rng, hashSeed } from './rng.js';
import { RECIPES, getCustomer } from './recipes.js';

export const DAYS_PER_CHAPTER = 9;

// `star` is the fraction of the day's par coins needed for 1, 2 and 3 stars.
// Chapter 1 is very forgiving; the finale is tight.
export const CHAPTERS = [
  {
    id: 1,
    name: 'Cozy Mornings',
    blurb: 'Flour hands you an apron. Cocoa, pretzels, and nothing to worry about.',
    adds: 'The mixing bowl, the oven and the cocoa pot',
    stations: ['cocoa', 'mixer', 'oven'],
    pool: [['cocoa', 3], ['pretzel', 3]],
    guests: ['bunny', 'hedgehog', 'fox'],
    regular: null,
    burn: false,
    seats: 4,
    star: [0.3, 0.55, 0.8],
    count: [6, 14],
    seconds: [85, 115],
    patience: [44, 36],
    order: [[1, 1], [1, 2]],
  },
  {
    id: 2,
    name: 'Cupcake Corner',
    blurb: 'An icing bench arrives, and so does the oven timer. Crispy is fine. Crispy is not a disaster.',
    adds: 'The icing bench, cupcakes, and bakes that can go crispy',
    stations: ['cocoa', 'mixer', 'oven', 'icing'],
    pool: [['cocoa', 2], ['pretzel', 2], ['cupcake', 4]],
    guests: ['bunny', 'hedgehog', 'fox', 'cat'],
    regular: 'bear',
    burn: true,
    seats: 4,
    star: [0.33, 0.6, 0.85],
    count: [10, 15],
    seconds: [105, 132],
    patience: [36, 30],
    order: [[1, 2], [2, 3]],
  },
  {
    id: 3,
    name: 'Jam & Jitters',
    blurb: 'The jam pot bubbles all morning, and Nutmeg the squirrel is already late.',
    adds: 'The jam pot, jam tarts, and a squirrel in a hurry',
    stations: ['cocoa', 'mixer', 'jam', 'oven', 'icing'],
    pool: [['cocoa', 2], ['pretzel', 2], ['cupcake', 3], ['tart', 4]],
    guests: ['bunny', 'hedgehog', 'fox', 'cat', 'owl'],
    regular: 'squirrel',
    burn: true,
    seats: 5,
    star: [0.36, 0.65, 0.92],
    count: [13, 19],
    seconds: [118, 142],
    patience: [32, 28],
    order: [[2, 2], [2, 3]],
  },
  {
    id: 4,
    name: 'Layer Cake Lane',
    blurb: 'Sprinkles, ribbons and a mayor who orders for the whole town hall.',
    adds: 'The decorating table, cookie boxes and layer cakes',
    stations: ['cocoa', 'mixer', 'jam', 'oven', 'icing', 'decor'],
    pool: [['cocoa', 2], ['pretzel', 1], ['cupcake', 3], ['tart', 3], ['cookies', 3], ['cake', 2]],
    guests: ['bunny', 'hedgehog', 'fox', 'cat', 'owl'],
    regular: 'moose',
    burn: true,
    seats: 5,
    star: [0.4, 0.72, 1.04],
    count: [16, 22],
    seconds: [130, 155],
    patience: [30, 26],
    order: [[2, 3], [2, 3]],
  },
  {
    id: 5,
    name: 'Starlight Festival',
    blurb: 'The whole town walks past the window. Press juice, bake everything, and enjoy it.',
    adds: 'The juice press, berry smoothies and festival rushes',
    stations: ['cocoa', 'juice', 'mixer', 'jam', 'oven', 'icing', 'decor'],
    pool: [['cocoa', 2], ['smoothie', 3], ['cupcake', 3], ['tart', 3], ['cookies', 3], ['cake', 2]],
    guests: ['bunny', 'hedgehog', 'fox', 'cat', 'owl'],
    regular: 'twins',
    burn: true,
    seats: 5,
    star: [0.5, 0.9, 1.28],
    count: [20, 26],
    seconds: [140, 170],
    patience: [28, 24],
    order: [[2, 3], [2, 4]],
  },
];

const DAY_NAMES = [
  // Cozy Mornings
  'Opening Day', 'First Regulars', 'Pretzel Tuesday', 'Cocoa Weather', 'Morning Rush',
  'Market Day', 'The School Run', 'A Quiet Snowfall', "Baker's Dozen",
  // Cupcake Corner
  'Icing Day', 'Sprinkle Shower', 'Barnaby Naps In', 'Birthday Order', 'Watch the Oven',
  'Cupcake Parade', 'Rainy Afternoon', 'Double Batch', 'Frosting Finale',
  // Jam & Jitters
  'Jam Day', 'Berry Delivery', "Nutmeg's Dash", 'Tart Tuesday', 'Three Pots Bubbling',
  'Lunchtime Crush', 'Jam on Everything', 'Sticky Fingers', 'Preserve the Peace',
  // Layer Cake Lane
  'Sprinkles Arrive', 'Cookie Boxes', 'The Mayor Calls', 'Wedding Order', 'Four Tiers',
  'Cake Walk', 'Candle Count', 'Ribbon Day', 'The Big Bake',
  // Starlight Festival
  'Festival Eve', 'The Juice Press', 'Smoothie Stand', 'Bunting Up', 'Pip & Posy',
  'The Parade Passes', 'Everything At Once', 'Last Orders', 'Starlight Night',
];

// Days that teach something get a line of their own, and sometimes a smaller
// recipe pool so the new thing is the star of the show.
const NOTES = {
  1: { tip: 'Tap the cocoa pot to brew, then tap the counter to serve.', pool: [['cocoa', 1]] },
  2: { tip: 'Pretzels need the mixing bowl first, then the oven.', pool: [['cocoa', 2], ['pretzel', 3]] },
  3: { tip: 'Tap a station with a ding on it to pass the food along.' },
  5: { tip: 'Serve two in a row for a combo tip.', rush: true },
  10: { tip: 'Cupcakes finish at the icing bench.', pool: [['cocoa', 1], ['cupcake', 4]] },
  14: { tip: 'Bakes go crispy if they sit in the oven too long. Crispy still sells!' },
  12: { tip: 'Barnaby the bear will wait a long while. Serve the hurried folk first.' },
  17: { rush: true },
  19: { tip: 'Jam tarts go mixer, jam pot, then oven.', pool: [['cocoa', 1], ['cupcake', 2], ['tart', 4]] },
  21: { tip: 'Nutmeg only wants one thing, and pays double for speed.' },
  24: { rush: true },
  28: { tip: 'Cookie boxes and layer cakes finish at the decorating table.', pool: [['cupcake', 2], ['cookies', 4], ['cake', 2]] },
  30: { tip: 'Mayor Maple orders four at once. Line them all up on the counter first.' },
  33: { rush: true },
  36: { rush: true },
  38: { tip: 'Smoothies come straight off the juice press. Quick coins.', pool: [['smoothie', 4], ['cupcake', 2], ['tart', 2]] },
  41: { tip: 'Pip and Posy share one long order.' },
  43: { rush: true },
  45: { tip: 'The whole town is out tonight. Have fun.', rush: true },
};

const lerp = (a, b, t) => a + (b - a) * t;

function buildSpec(id) {
  const chapter = CHAPTERS[Math.floor((id - 1) / DAYS_PER_CHAPTER)];
  const step = (id - 1) % DAYS_PER_CHAPTER;
  const t = step / (DAYS_PER_CHAPTER - 1);
  const note = NOTES[id] || {};
  return {
    id,
    chapter: chapter.id,
    name: DAY_NAMES[id - 1],
    tip: note.tip || null,
    rush: !!note.rush,
    seats: chapter.seats,
    burn: chapter.burn,
    stations: chapter.stations.slice(),
    pool: (note.pool || chapter.pool).map((p) => p.slice()),
    guests: chapter.guests.slice(),
    regular: chapter.regular,
    // The regular shows up from the chapter's second day onward, twice over
    // the last third of the chapter.
    regulars: chapter.regular && step >= 1 ? (step >= 6 ? 2 : 1) : 0,
    count: Math.round(lerp(chapter.count[0], chapter.count[1], t)),
    seconds: Math.round(lerp(chapter.seconds[0], chapter.seconds[1], t)),
    patience: Math.round(lerp(chapter.patience[0], chapter.patience[1], t)),
    order: [
      Math.round(lerp(chapter.order[0][0], chapter.order[1][0], t)),
      Math.round(lerp(chapter.order[0][1], chapter.order[1][1], t)),
    ],
    star: chapter.star.slice(),
  };
}

export const DAYS = Array.from({ length: CHAPTERS.length * DAYS_PER_CHAPTER }, (_, i) => buildSpec(i + 1));
export const DAY_COUNT = DAYS.length;

export function getSpec(id) {
  return DAYS[Math.max(1, Math.min(DAY_COUNT, id | 0)) - 1];
}

export function chapterOf(id) {
  return CHAPTERS[Math.floor((Math.max(1, Math.min(DAY_COUNT, id | 0)) - 1) / DAYS_PER_CHAPTER)];
}

export function chapterRange(chapterId) {
  const from = (chapterId - 1) * DAYS_PER_CHAPTER + 1;
  return { from, to: from + DAYS_PER_CHAPTER - 1 };
}

// Recipes a day can ask for, in book order.
export function recipesForDay(id) {
  return getSpec(id).pool.map(([recipe]) => recipe);
}

// --------------------------------------------------------------- the script

function pickWeighted(rng, pool) {
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [id, w] of pool) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1][0];
}

// Layer cakes are the longest chain in the game; more than one in a single
// order turns into a traffic jam, so an order only ever holds one.
const HEAVY = new Set(['cake']);

function makeOrder(rng, spec, size) {
  const order = [];
  let heavy = 0;
  for (let i = 0; i < size; i++) {
    let pick = pickWeighted(rng, spec.pool);
    if (HEAVY.has(pick) && heavy >= 1) {
      const light = spec.pool.filter(([id]) => !HEAVY.has(id));
      pick = light.length ? pickWeighted(rng, light) : pick;
    }
    if (HEAVY.has(pick)) heavy++;
    order.push(pick);
  }
  return order;
}

// Coins a dish is worth when it comes out perfect and the customer still has
// all three hearts: the yardstick the star thresholds are measured against.
export function dishPar(recipeId, customerId) {
  const customer = getCustomer(customerId);
  return RECIPES[recipeId].value * customer.pay * (1 + 0.6 * customer.tip);
}

export function planPar(customers) {
  let par = 0;
  for (const c of customers) for (const dish of c.order) par += dishPar(dish, c.kind);
  return par;
}

const ASSIST_TIME = 1.15;
const ASSIST_PATIENCE = 1.25;

// Builds the concrete day: who sits down when, and what they ask for. Pure and
// deterministic, so the tests, the autoplayer and the game all see one day.
export function buildDay(id, { assist = false, seedSalt = 0 } = {}) {
  const spec = getSpec(id);
  const rng = new Rng(hashSeed(spec.id, 0x6b1f, seedSalt));
  const customers = [];
  const window = spec.seconds * 0.76;
  const gap = spec.count > 1 ? window / (spec.count - 1) : window;
  // Which arrivals are the chapter regular, and where the rush cluster sits.
  const regularSlots = new Set();
  for (let r = 0; r < spec.regulars; r++) {
    let slot = 1 + rng.int(Math.max(1, spec.count - 2));
    for (let guard = 0; guard < 8 && regularSlots.has(slot); guard++) slot = 1 + rng.int(Math.max(1, spec.count - 2));
    regularSlots.add(slot);
  }
  const rushFrom = spec.rush ? 2 + rng.int(Math.max(1, spec.count - 6)) : -1;
  let at = 1.4;
  for (let i = 0; i < spec.count; i++) {
    const kind = regularSlots.has(i) ? spec.regular : rng.pick(spec.guests);
    const type = getCustomer(kind);
    const size = type.order[0] === type.order[1]
      ? type.order[0]
      : Math.max(spec.order[0], Math.min(spec.order[1], type.order[0] + rng.int(type.order[1] - type.order[0] + 1)));
    customers.push({ at: Math.round(at * 10) / 10, kind, order: makeOrder(rng, spec, size) });
    const inRush = rushFrom >= 0 && i >= rushFrom && i < rushFrom + 4;
    const jitter = 0.72 + rng.next() * 0.56;
    at += gap * jitter * (inRush ? 0.45 : 1);
  }
  const par = planPar(customers);
  const plan = {
    id: spec.id,
    chapter: spec.chapter,
    name: spec.name,
    tip: spec.tip,
    kind: 'day',
    seats: spec.seats,
    burn: spec.burn,
    stations: spec.stations.slice(),
    pool: spec.pool.map(([recipe]) => recipe),
    seconds: Math.round(spec.seconds * (assist ? ASSIST_TIME : 1)),
    patience: Math.round(spec.patience * (assist ? ASSIST_PATIENCE : 1) * 10) / 10,
    assist,
    customers,
    par: Math.round(par),
    stars: spec.star.map((f) => Math.max(5, Math.round((par * f) / 5) * 5)),
  };
  return plan;
}

// Stars earned for coins on a plan: 0 when the first threshold is missed.
export function starsFor(plan, coins) {
  let stars = 0;
  for (const need of plan.stars) if (coins >= need) stars++;
  return stars;
}
