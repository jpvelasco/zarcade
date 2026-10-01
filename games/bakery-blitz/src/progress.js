// What the bakery remembers: stars, coins, upgrades, the recipe book, today's
// orders and the streak. One namespaced key, every read wrapped, because
// storage can be blocked or full and the game must still play.
import { DAY_COUNT, chapterOf, starsFor } from './levels.js';
import { getUpgrade, isAvailable } from './upgrades.js';
import { BOOK_ORDER, CUSTOMERS } from './recipes.js';
import { dailyOrders, orderProgress, ALL_ORDERS_BONUS, dateKey } from './daily.js';

export const SAVE_KEY = 'bakery-blitz.v1';
// Two starless tries and the game quietly makes the day easier.
export const ASSIST_AFTER = 2;

export function defaultSave() {
  return {
    v: 1,
    coins: 0,
    earned: 0,
    unlocked: 1,
    stars: {},
    best: {},
    attempts: {},
    owned: [],
    book: [],
    met: [],
    specials: [],
    bestCombo: 0,
    streak: 0,
    streakDate: '',
    daily: null,
    muted: false,
    shifts: 0,
  };
}

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const save = { ...defaultSave(), ...data };
    save.stars = asObject(save.stars);
    save.best = asObject(save.best);
    save.attempts = asObject(save.attempts);
    save.owned = asArray(save.owned).filter((id) => !!getUpgrade(id));
    save.book = asArray(save.book).filter((id) => BOOK_ORDER.includes(id));
  save.met = asArray(save.met).filter((id) => !!CUSTOMERS[id]);
    save.specials = asArray(save.specials).slice(-40);
    save.coins = Math.max(0, save.coins | 0);
    save.earned = Math.max(save.coins, save.earned | 0);
    save.unlocked = Math.max(1, Math.min(DAY_COUNT, save.unlocked | 0 || 1));
    save.daily = save.daily && typeof save.daily === 'object' ? save.daily : null;
    return save;
  } catch {
    return defaultSave();
  }
}

// Returns false when storage is unavailable: play on without saving.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(save) {
  return Object.values(save.stars).reduce((sum, s) => sum + (s | 0), 0);
}

export function daysCleared(save) {
  return Object.keys(save.stars).filter((id) => save.stars[id] > 0).length;
}

export function isUnlocked(save, id) {
  return id <= save.unlocked;
}

export function highestChapter(save) {
  return chapterOf(Math.min(DAY_COUNT, save.unlocked)).id;
}

// A day that has been tried a couple of times without a star comes back a
// little kinder: more time, more patience, and a note saying so.
export function assistFor(save, dayId) {
  return (save.attempts[dayId] | 0) >= ASSIST_AFTER && !(save.stars[dayId] > 0);
}

export function noteAttempt(save, dayId) {
  save.attempts[dayId] = (save.attempts[dayId] | 0) + 1;
  return save.attempts[dayId];
}

// Records the end of a campaign day. Coins always bank, even on a bad shift,
// so a retry is always a stronger retry.
export function recordDay(save, plan, result) {
  const stars = starsFor(plan, result.coins);
  const dayId = plan.id;
  const campaign = plan.kind === 'day';
  const prevStars = campaign ? save.stars[dayId] | 0 : 0;
  const prevBest = campaign ? save.best[dayId] | 0 : 0;
  save.coins += result.coins;
  save.earned += result.coins;
  save.shifts++;
  save.bestCombo = Math.max(save.bestCombo, result.bestCombo | 0);
  for (const recipe of Object.keys(result.dishes)) discover(save, recipe);
  if (campaign) {
    if (stars > 0) {
      save.stars[dayId] = Math.max(prevStars, stars);
      save.unlocked = Math.max(save.unlocked, Math.min(DAY_COUNT, dayId + 1));
      save.attempts[dayId] = 0;
    } else {
      noteAttempt(save, dayId);
    }
    save.best[dayId] = Math.max(prevBest, result.coins);
  }
  return {
    stars,
    cleared: stars > 0,
    improved: stars > prevStars,
    newBest: campaign && result.coins > prevBest,
    best: campaign ? save.best[dayId] : result.coins,
    nextDay: Math.min(DAY_COUNT, dayId + 1),
    assistNext: campaign && assistFor(save, dayId),
  };
}

export function discover(save, recipeId) {
  if (!BOOK_ORDER.includes(recipeId) || save.book.includes(recipeId)) return false;
  save.book.push(recipeId);
  return true;
}

// Who has been in. The recipe book shows the regulars you have met.
export function meetCustomer(save, kind) {
  if (!CUSTOMERS[kind] || save.met.includes(kind)) return false;
  save.met.push(kind);
  return true;
}

export function tasteSpecial(save, name) {
  if (!name || save.specials.includes(name)) return false;
  save.specials.push(name);
  if (save.specials.length > 40) save.specials.shift();
  return true;
}

// ----------------------------------------------------------------- upgrades

export function owns(save, id) {
  return save.owned.includes(id);
}

export function buyUpgrade(save, id) {
  const up = getUpgrade(id);
  if (!up || owns(save, id) || !isAvailable(id, save.owned)) return { ok: false, reason: 'locked' };
  if (save.coins < up.cost) return { ok: false, reason: 'coins', short: up.cost - save.coins };
  save.coins -= up.cost;
  save.owned.push(id);
  return { ok: true, upgrade: up, coins: save.coins };
}

// -------------------------------------------------------------- daily board

function yesterdayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

// Rolls the notice board over when the date changes. Returns the day's board.
export function refreshDaily(save, key = dateKey(), chapter = highestChapter(save)) {
  if (!save.daily || save.daily.date !== key || !Array.isArray(save.daily.orders) || !save.daily.orders.length) {
    save.daily = {
      date: key,
      chapter,
      orders: dailyOrders(key, { chapter }).map((o) => ({ ...o, progress: 0, done: false })),
      bonusClaimed: false,
      specialDone: false,
    };
  }
  return save.daily;
}

// Credits any of today's orders this shift finished off.
export function applyOrders(save, result, stars, key = dateKey()) {
  const board = refreshDaily(save, key);
  const finished = [];
  for (const order of board.orders) {
    if (order.done) continue;
    order.progress = Math.max(order.progress, orderProgress(order, result, stars));
    if (order.progress < order.need) continue;
    order.done = true;
    save.coins += order.reward;
    save.earned += order.reward;
    finished.push(order);
  }
  let bonus = 0;
  if (!board.bonusClaimed && board.orders.every((o) => o.done)) {
    board.bonusClaimed = true;
    bonus = ALL_ORDERS_BONUS;
    save.coins += bonus;
    save.earned += bonus;
  }
  return { finished, bonus };
}

// First finish of today's special shift keeps the streak alive.
export function bankSpecial(save, key = dateKey()) {
  const board = refreshDaily(save, key);
  if (board.specialDone) return { first: false, streak: save.streak };
  board.specialDone = true;
  save.streak = save.streakDate === yesterdayKey(key) ? (save.streak | 0) + 1 : 1;
  save.streakDate = key;
  return { first: true, streak: save.streak };
}

export function streakAlive(save, key = dateKey()) {
  return save.streakDate === key || save.streakDate === yesterdayKey(key);
}
