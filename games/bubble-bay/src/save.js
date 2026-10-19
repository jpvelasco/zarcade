// Progress, boosters, the otter collection and the daily streak, kept under
// one namespaced key. DOM-free: the page passes in its storage.
import { LEVEL_COUNT } from './levels.js';
import { OTTER_COUNT } from './otters.js';
import { BOOSTERS } from './game.js';

export const SAVE_KEY = 'bubble-bay.v1';
export const BOOSTER_CAP = 9;

export function defaultSave() {
  return {
    stars: {},
    best: {},
    unlocked: 1,
    boosters: { rainbow: 1, bomb: 1, zap: 1 },
    otters: [],
    daily: { last: null, streak: 0, bestStreak: 0, best: 0, bestKey: null, plays: {} },
    muted: false,
    tips: {},
    plays: 0,
  };
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

export function loadSave(storage) {
  const base = defaultSave();
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    if (!isObj(data)) return base;
    const save = { ...base, ...data };
    save.stars = isObj(save.stars) ? save.stars : {};
    save.best = isObj(save.best) ? save.best : {};
    save.tips = isObj(save.tips) ? save.tips : {};
    save.unlocked = Math.max(1, Math.min(LEVEL_COUNT, save.unlocked | 0 || 1));
    save.boosters = { ...base.boosters, ...(isObj(save.boosters) ? save.boosters : {}) };
    for (const kind of BOOSTERS) save.boosters[kind] = Math.max(0, Math.min(BOOSTER_CAP, save.boosters[kind] | 0));
    save.otters = Array.isArray(save.otters)
      ? [...new Set(save.otters.filter((o) => Number.isInteger(o) && o >= 0 && o < OTTER_COUNT))]
      : [];
    save.daily = { ...base.daily, ...(isObj(save.daily) ? save.daily : {}) };
    if (!isObj(save.daily.plays)) save.daily.plays = {};
    save.muted = !!save.muted;
    return save;
  } catch {
    return base;
  }
}

// Returns false in private browsing or when storage is blocked: play on
// without saving.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(save) {
  return Object.values(save.stars).reduce((n, s) => n + (s | 0), 0);
}

export function addBooster(save, kind, n = 1) {
  const before = save.boosters[kind] | 0;
  save.boosters[kind] = Math.min(BOOSTER_CAP, before + n);
  return save.boosters[kind] - before;
}

export function useBooster(save, kind) {
  if ((save.boosters[kind] | 0) <= 0) return false;
  save.boosters[kind]--;
  return true;
}

// Otters rescued in play join the cove. Returns the ones that are new.
export function addOtters(save, ids) {
  const fresh = [];
  for (const id of ids) {
    if (id == null || save.otters.includes(id) || fresh.includes(id)) continue;
    fresh.push(id);
  }
  save.otters.push(...fresh);
  return fresh;
}

// A cleared level: stars and best only go up. Boosters are the reward for
// play: every third level's first clear, and every new three-star result.
export function recordWin(save, id, { score, stars }) {
  const prevStars = save.stars[id] | 0;
  const prevBest = save.best[id] | 0;
  const firstClear = prevStars === 0;
  save.stars[id] = Math.max(prevStars, stars);
  save.best[id] = Math.max(prevBest, score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, id + 1));
  const rewards = [];
  if (firstClear && id % 3 === 0) {
    const kind = BOOSTERS[(id / 3) % BOOSTERS.length];
    if (addBooster(save, kind)) rewards.push(kind);
  }
  if (stars === 3 && prevStars < 3) {
    const kind = BOOSTERS[id % BOOSTERS.length];
    if (addBooster(save, kind)) rewards.push(kind);
  }
  return {
    firstClear,
    improved: stars > prevStars,
    newBest: score > prevBest,
    prevBest,
    stars: save.stars[id],
    best: save.best[id],
    rewards,
    unlockedNext: firstClear && id < LEVEL_COUNT,
  };
}

// ------------------------------------------------------------- daily

export function previousKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d - 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// The streak a player would see today: still alive if they played today or
// yesterday, otherwise gently back to zero.
export function currentStreak(save, todayKey) {
  const { last, streak } = save.daily;
  if (last === todayKey || last === previousKey(todayKey)) return streak;
  return 0;
}

export function dailyDone(save, key) {
  return save.daily.last === key;
}

// A finished daily tide. The first win of the day grows the streak and
// earns a booster.
export function recordDaily(save, key, { score, won }) {
  const daily = save.daily;
  daily.plays[key] = (daily.plays[key] | 0) + 1;
  // keep the per-day play log short
  const keys = Object.keys(daily.plays).sort();
  while (keys.length > 14) delete daily.plays[keys.shift()];
  const result = { firstToday: false, streak: currentStreak(save, key), newBest: false, rewards: [] };
  if (!won) return result;
  if (daily.last !== key) {
    daily.streak = daily.last === previousKey(key) ? daily.streak + 1 : 1;
    daily.last = key;
    daily.bestStreak = Math.max(daily.bestStreak, daily.streak);
    result.firstToday = true;
    const kind = BOOSTERS[daily.streak % BOOSTERS.length];
    if (addBooster(save, kind)) result.rewards.push(kind);
  }
  if (daily.bestKey !== key) { daily.bestKey = key; daily.best = 0; }
  if (score > daily.best) { daily.best = score; result.newBest = true; }
  result.streak = daily.streak;
  return result;
}
