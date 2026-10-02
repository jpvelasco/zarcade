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
// A whole number in [0, max], or 0 for anything else.
const count = (v, max = 1e9) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

// Keeps only level ids 1..LEVEL_COUNT with usable numbers, so one damaged
// entry never garbles totals or counts as a cleared level.
function levelMap(raw, max) {
  const out = {};
  if (!isObject(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id < 1 || id > LEVEL_COUNT || !Number.isFinite(value)) continue;
    out[id] = count(value, max);
  }
  return out;
}

export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    if (!isObject(data)) return defaultSave();
    const save = { ...defaultSave(), ...data };
    save.stars = levelMap(save.stars, 3);
    save.best = levelMap(save.best);
    const critters = isObject(save.critters) ? save.critters : {};
    save.critters = {};
    for (const id of CRITTER_IDS) if (count(critters[id]) > 0) save.critters[id] = count(critters[id], 1e6);
    save.unlocked = Math.max(1, Math.min(LEVEL_COUNT, count(save.unlocked) || 1));
    save.coins = count(save.coins);
    save.words = count(save.words);
    save.bonus = count(save.bonus);
    save.plays = count(save.plays);
    save.relax = !!save.relax;
    save.muted = !!save.muted;
    const daily = isObject(save.daily) ? save.daily : {};
    save.daily = {
      last: typeof daily.last === 'string' ? daily.last : null,
      streak: count(daily.streak),
      done: Array.isArray(daily.done) ? daily.done.filter((d) => typeof d === 'string').slice(-DAILY_HISTORY) : [],
    };
    return save;
  } catch {
    return defaultSave();
  }
}

// Takes another tab's newer save into this tab's save object in place, so a
// stale copy here is never written back over it.
export function adoptSave(save, fresh) {
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, fresh);
  return save;
}

// The streak still alive on `todayKey`: finished today or yesterday.
export function liveStreak(save, todayKey) {
  const last = save.daily.last;
  return last === todayKey || last === dayBefore(todayKey) ? save.daily.streak : 0;
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
