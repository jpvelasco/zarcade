// Everything that changes with the date: today's special recipe, today's three
// orders from the notice board, and the bonus shift they belong to. All of it
// is derived from the local date, so the same day always brings the same
// special, and nothing needs a server.
import { Rng } from './rng.js';
import { RECIPES, getCustomer } from './recipes.js';
import { CHAPTERS, planPar } from './levels.js';

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function keySeed(key) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const FLAVOURS = ['Maple', 'Honey', 'Cinnamon', 'Blueberry', 'Lavender', 'Pumpkin', 'Hazelnut', 'Strawberry', 'Lemon', 'Toffee', 'Apple', 'Pistachio', 'Raspberry', 'Ginger', 'Coconut', 'Plum'];
const EXTRAS = ['Pecan', 'Cloud', 'Moonbeam', 'Sunrise', 'Snowdrift', 'Starlight', 'Meadow', 'Velvet', 'Ribbon', 'Sprinkle', 'Marble', 'Frost'];
const FORMS = ['Twist', 'Swirl', 'Bun', 'Tart', 'Crown', 'Roll', 'Puff', 'Knot', 'Slice', 'Braid'];

// A special only ever finishes after the oven, so its chain still flows one
// way through the kitchen and can never deadlock against a jam tart.
const FINISHERS = ['icing', 'decor'];

// Today's special: a name, a colour and a short chain of stations the player
// already owns. `apply` writes it into the shared recipe table so the whole
// game (sim, renderer, book) sees one definition.
export function specialFor(key, stations = ['mixer', 'oven', 'icing']) {
  const rng = new Rng(keySeed(key));
  const flavour = rng.pick(FLAVOURS);
  let extra = rng.pick(EXTRAS);
  const form = rng.pick(FORMS);
  if (extra === flavour) extra = EXTRAS[(EXTRAS.indexOf(extra) + 3) % EXTRAS.length];
  const hue = rng.int(360);
  const finishers = FINISHERS.filter((s) => stations.includes(s));
  const steps = ['mixer', 'oven'];
  if (finishers.length) steps.push(rng.pick(finishers));
  return {
    id: 'special',
    key,
    name: `${flavour} ${extra} ${form}`,
    steps,
    bake: 3.8,
    value: 40,
    color: `hsl(${hue} 72% 62%)`,
    blurb: `Flour dreamed this one up on ${key}. Tomorrow it will be something else.`,
  };
}

// The special is a real recipe for one day only, so it lives in the shared
// table and gets rewritten when the date (or the player's kitchen) changes.
export function applySpecial(def) {
  Object.assign(RECIPES.special, {
    name: def.name, steps: def.steps.slice(), bake: def.bake, value: def.value,
    color: def.color, blurb: def.blurb, key: def.key,
  });
  return RECIPES.special;
}

export function stationsForChapter(chapterId) {
  const chapter = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, chapterId - 1))];
  return chapter.stations.slice();
}

export function poolForChapter(chapterId) {
  const chapter = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, chapterId - 1))];
  return chapter.pool.map((p) => p.slice());
}

// The bonus shift built around today's special. Shorter than a campaign day,
// with every recipe the player has learned so far.
export function buildSpecialDay(key, { chapter = 1, assist = false } = {}) {
  const stations = stationsForChapter(chapter);
  const def = specialFor(key, stations);
  applySpecial(def);
  const pool = poolForChapter(chapter).filter(([id]) => id !== 'cake');
  pool.push(['special', 4]);
  const rng = new Rng(keySeed(key) ^ 0x51ed);
  const seconds = 110;
  const count = 10 + Math.min(6, chapter * 2);
  const guests = ['bunny', 'hedgehog', 'fox', 'cat', 'owl'];
  const customers = [];
  const gap = (seconds * 0.74) / Math.max(1, count - 1);
  let at = 1.4;
  for (let i = 0; i < count; i++) {
    const kind = rng.next() < 0.18 ? rng.pick(['bear', 'squirrel']) : rng.pick(guests);
    const type = getCustomer(kind);
    const size = type.order[0] === type.order[1] ? type.order[0] : 1 + rng.int(2);
    const order = [];
    // Everybody wants to try the special at least once.
    order.push(i % 2 === 0 ? 'special' : pickFrom(rng, pool));
    for (let k = 1; k < size; k++) order.push(pickFrom(rng, pool));
    customers.push({ at: Math.round(at * 10) / 10, kind, order });
    at += gap * (0.75 + rng.next() * 0.5);
  }
  const par = planPar(customers);
  return {
    id: `special-${key}`,
    chapter,
    kind: 'special',
    name: def.name,
    tip: `Today's special: ${def.name}. ${def.steps.length} steps, 40 coins each.`,
    seats: 5,
    burn: chapter > 1,
    stations,
    pool: pool.map(([id]) => id),
    seconds: Math.round(seconds * (assist ? 1.15 : 1)),
    patience: 32 * (assist ? 1.25 : 1),
    assist,
    special: def,
    customers,
    par: Math.round(par),
    stars: [0.34, 0.56, 0.74].map((f) => Math.max(5, Math.round((par * f) / 5) * 5)),
  };
}

function pickFrom(rng, pool) {
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [id, w] of pool) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1][0];
}

// -------------------------------------------------------------- the orders

// Three jobs from the notice board. Targets stay small so a kid clears them in
// a couple of shifts, and the reward is coins, never a gate.
const ORDER_POOL = [
  { id: 'serve18', type: 'served', need: 18, reward: 60, text: (n) => `Serve ${n} dishes today` },
  { id: 'serve26', type: 'served', need: 26, reward: 90, text: (n) => `Serve ${n} dishes today` },
  { id: 'happy12', type: 'happy', need: 12, reward: 70, text: (n) => `Send ${n} customers away happy` },
  { id: 'combo4', type: 'combo', need: 4, reward: 70, text: (n) => `Hit a ×${n} tip combo` },
  { id: 'combo5', type: 'combo', need: 5, reward: 110, text: (n) => `Hit a ×${n} tip combo` },
  { id: 'perfect10', type: 'perfect', need: 10, reward: 80, text: (n) => `Serve ${n} people at three hearts` },
  { id: 'coins300', type: 'coins', need: 300, reward: 80, text: (n) => `Earn ${n} coins in one shift` },
  { id: 'stars3', type: 'stars', need: 3, reward: 100, text: (n) => `Finish a shift with ${n} stars` },
  { id: 'cupcake8', type: 'dish', dish: 'cupcake', need: 8, reward: 70, text: (n) => `Serve ${n} cupcakes` },
  { id: 'cocoa8', type: 'dish', dish: 'cocoa', need: 8, reward: 55, text: (n) => `Brew ${n} hot cocoas` },
  { id: 'pretzel8', type: 'dish', dish: 'pretzel', need: 8, reward: 60, text: (n) => `Bake ${n} pretzels` },
  { id: 'tart6', type: 'dish', dish: 'tart', need: 6, reward: 75, text: (n) => `Bake ${n} jam tarts` },
  { id: 'cake4', type: 'dish', dish: 'cake', need: 4, reward: 95, text: (n) => `Finish ${n} layer cakes` },
  { id: 'cookies5', type: 'dish', dish: 'cookies', need: 5, reward: 80, text: (n) => `Pack ${n} cookie boxes` },
  { id: 'special3', type: 'dish', dish: 'special', need: 3, reward: 100, text: (n) => `Serve ${n} of today's special` },
  { id: 'clean', type: 'nocrispy', need: 1, reward: 85, text: () => 'Finish a shift with nothing crispy' },
];

export const ALL_ORDERS = ORDER_POOL;

// Orders only ask for things the player can actually make today.
export function dailyOrders(key, { chapter = 1 } = {}) {
  const pool = poolForChapter(chapter).map(([id]) => id);
  pool.push('special');
  const usable = ORDER_POOL.filter((o) => {
    if (o.type === 'dish') return pool.includes(o.dish);
    if (chapter < 2 && (o.id === 'serve26' || o.id === 'coins300' || o.id === 'combo5' || o.id === 'perfect10')) return false;
    return true;
  });
  const rng = new Rng(keySeed(key) ^ 0x2f0d);
  const picked = [];
  const bag = rng.shuffle(usable.slice());
  for (const order of bag) {
    if (picked.length >= 3) break;
    if (picked.some((p) => p.type === order.type && p.dish === order.dish)) continue;
    picked.push(order);
  }
  return picked.map((o) => ({
    id: o.id, type: o.type, dish: o.dish || null, need: o.need, reward: o.reward,
    label: o.text(o.need),
  }));
}

// How far one shift took an order. Orders are per-shift, not cumulative, so a
// fresh attempt is a fresh chance.
export function orderProgress(order, result, stars) {
  switch (order.type) {
    case 'served': return Math.min(order.need, result.served);
    case 'happy': return Math.min(order.need, result.happy);
    case 'combo': return Math.min(order.need, result.bestCombo);
    case 'perfect': return Math.min(order.need, result.perfectTips || 0);
    case 'coins': return Math.min(order.need, result.coins);
    case 'stars': return Math.min(order.need, stars);
    case 'dish': return Math.min(order.need, result.dishes[order.dish] || 0);
    case 'nocrispy': return result.served >= 6 && result.crispy === 0 ? 1 : 0;
    default: return 0;
  }
}

export const ALL_ORDERS_BONUS = 150;
