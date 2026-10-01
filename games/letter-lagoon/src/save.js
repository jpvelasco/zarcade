// Progress, stars, coins, the aquarium and the daily streak, kept under one
// namespaced key. DOM-free: the page passes in localStorage (or null).
import { LEVEL_COUNT } from './levels.js';
import { START_COINS } from './game.js';
import { CRITTER_IDS } from './critters.js';

export const SAVE_KEY = 'letter-lagoon.v1';
const DAILY_HISTORY = 60;

export function defaultSave() {
  return {
    unlocked: 1,
    stars: {},
    best: {},
    coins: START_COINS,
    critters: {},
    relax: false,
    muted: false,
    daily: { last: null, streak: 0, done: [] },
    words: 0,
    bonus: 0,
    plays: 0,
  };
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    if (!isObject(data)) return defaultSave();
    const save = { ...defaultSave(), ...data };
    save.stars = isObject(save.stars) ? save.stars : {};
    save.best = isObject(save.best) ? save.best : {};
    save.critters = isObject(save.critters) ? save.critters : {};
    for (const id of Object.keys(save.critters)) if (!CRITTER_IDS.includes(id)) delete save.critters[id];
    save.unlocked = Math.max(1, Math.min(LEVEL_COUNT, save.unlocked | 0 || 1));
    save.coins = Math.max(0, save.coins | 0);
    save.relax = !!save.relax;
    save.muted = !!save.muted;
    const daily = isObject(save.daily) ? save.daily : {};
    save.daily = {
      last: typeof daily.last === 'string' ? daily.last : null,
      streak: Math.max(0, daily.streak | 0),
      done: Array.isArray(daily.done) ? daily.done.filter((d) => typeof d === 'string').slice(-DAILY_HISTORY) : [],
    };
    return save;
  } catch {
    return defaultSave();
  }
}

// Returns false when storage is blocked or full: play on without saving.
export function writeSave(storage, save) {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(save) {
  return Object.values(save.stars).reduce((n, s) => n + (s | 0), 0);
}

export function totalCritters(save) {
  return Object.values(save.critters).reduce((n, s) => n + (s | 0), 0);
}

// Adds the first `count` trapped critters of a level to the aquarium.
export function addCritters(save, level, count) {
  for (const id of level.traps.slice(0, count)) save.critters[id] = (save.critters[id] | 0) + 1;
}

// Records a cleared level. Stars and best score only go up; the first clear
// adds the rescued critters to the aquarium.
export function recordLevel(save, level, { score, stars, rescued, relax }) {
  const id = level.id;
  const first = !(id in save.best);
  const prevStars = save.stars[id] | 0;
  if (!relax && stars > prevStars) save.stars[id] = stars;
  save.best[id] = Math.max(save.best[id] | 0, score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, id + 1));
  if (first) addCritters(save, level, rescued);
  save.plays++;
  return { first, improved: !relax && stars > prevStars, stars: save.stars[id] | 0 };
}

// Previous calendar day for a "YYYY-MM-DD" key.
export function dayBefore(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

export function recordDaily(save, level, { rescued }) {
  const key = level.daily;
  if (save.daily.done.includes(key)) return { already: true, streak: save.daily.streak };
  save.daily.streak = save.daily.last === dayBefore(key) ? save.daily.streak + 1 : 1;
  save.daily.last = key;
  save.daily.done.push(key);
  save.daily.done = save.daily.done.slice(-DAILY_HISTORY);
  addCritters(save, level, rescued);
  save.plays++;
  return { already: false, streak: save.daily.streak };
}
