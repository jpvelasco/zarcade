// The player's profile: unlocks, album, run history, daily streak, settings
// and the run in progress. Saved under one localStorage key. DOM-free: the
// page passes in a storage object (or null when storage is blocked).
import { HEROES } from './data.js';
import { dayDiff } from './rng.js';

export const SAVE_KEY = 'crayon-quest.v1';
export const HISTORY_LIMIT = 20;

export function defaultProfile() {
  return {
    v: 1,
    runs: 0, wins: 0, bosses: 0, best: 0, bestHero: {},
    unlocked: ['kid'],
    album: { cards: [], monsters: [], stickers: [] },
    history: [],
    daily: { lastKey: null, streak: 0, bestStreak: 0, todayKey: null, todayBest: 0, best: 0 },
    settings: { sound: true, music: true, gentle: false },
    lastHero: 'kid',
    current: null,
  };
}

// Fill in anything missing from an older or damaged save.
export function normalize(data) {
  const base = defaultProfile();
  if (!data || typeof data !== 'object' || data.v !== 1) return base;
  const out = { ...base, ...data };
  out.album = { ...base.album, ...(data.album || {}) };
  out.daily = { ...base.daily, ...(data.daily || {}) };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  out.bestHero = { ...(data.bestHero || {}) };
  for (const k of ['cards', 'monsters', 'stickers']) if (!Array.isArray(out.album[k])) out.album[k] = [];
  if (!Array.isArray(out.history)) out.history = [];
  if (!Array.isArray(out.unlocked) || !out.unlocked.includes('kid')) out.unlocked = ['kid', ...(Array.isArray(out.unlocked) ? out.unlocked : [])];
  if (out.current && (out.current.phase === 'over' || !plausibleRun(out.current))) out.current = null;
  return out;
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ROOM = { reward: 'reward', shop: 'shop', event: 'event', rest: 'rest', treasure: 'treasure' };

// A saved run has the shape the game needs to resume it. A damaged or
// half-written one is dropped rather than crashing the page.
export function plausibleRun(r) {
  if (!isObj(r) || r.v !== 1) return false;
  for (const k of ['deck', 'stickers', 'visited', 'met', 'seenCards', 'seenStickers']) if (!Array.isArray(r[k])) return false;
  if (!isObj(r.rng) || !Number.isFinite(r.rng.s) || !isObj(r.map) || !isObj(r.map.nodes) || !isObj(r.stats)) return false;
  if (!Number.isFinite(r.hp) || !Number.isFinite(r.maxHp) || !Number.isFinite(r.gold) || !Number.isInteger(r.floor)) return false;
  if (r.phase === 'battle') {
    const b = r.battle;
    if (!isObj(b) || !isObj(b.player) || !isObj(b.player.magic)) return false;
    for (const k of ['enemies', 'draw', 'hand', 'discard', 'poofed']) if (!Array.isArray(b[k])) return false;
  } else if (ROOM[r.phase]) {
    if (!isObj(r[ROOM[r.phase]])) return false;
  } else if (r.phase !== 'map') return false;
  return true;
}

export function loadProfile(storage) {
  try {
    const raw = storage ? storage.getItem(SAVE_KEY) : null;
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(storage, profile) {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

function addAll(list, items) {
  const added = [];
  for (const id of items) {
    if (!list.includes(id)) {
      list.push(id);
      added.push(id);
    }
  }
  return added;
}

// Copy what the run has seen into the album. Returns the new entries.
export function mergeAlbum(profile, run) {
  return {
    cards: addAll(profile.album.cards, run.seenCards),
    monsters: addAll(profile.album.monsters, run.met),
    stickers: addAll(profile.album.stickers, run.seenStickers),
  };
}

const RULES = {
  runs1: (p) => p.runs >= 1,
  boss1: (p) => p.bosses >= 1,
  boss2: (p) => p.bosses >= 2 || p.wins >= 1,
};

// Unlock any heroes whose rule is now met. Returns the new hero ids.
export function checkUnlocks(profile) {
  const fresh = [];
  for (const h of HEROES) {
    if (profile.unlocked.includes(h.id) || !h.unlock) continue;
    if (RULES[h.unlock](profile)) {
      profile.unlocked.push(h.id);
      fresh.push(h.id);
    }
  }
  return fresh;
}

export function noteBossDefeated(profile) {
  profile.bosses++;
  return checkUnlocks(profile);
}

// Starting the daily page counts toward the streak once per day.
export function noteDailyStart(profile, key) {
  const d = profile.daily;
  if (d.lastKey === key) return d.streak;
  d.streak = d.lastKey && dayDiff(d.lastKey, key) === 1 ? d.streak + 1 : 1;
  d.bestStreak = Math.max(d.bestStreak, d.streak);
  d.lastKey = key;
  return d.streak;
}

// The streak still shows today if the last daily was today or yesterday.
export function liveStreak(profile, key) {
  const d = profile.daily;
  if (!d.lastKey) return 0;
  const gap = dayDiff(d.lastKey, key);
  return gap <= 1 ? d.streak : 0;
}

// Record a finished run. Returns what to celebrate on the results screen.
export function recordRun(profile, run, { minutes = 0, date = run.dateKey } = {}) {
  profile.runs++;
  if (run.result === 'won') profile.wins++;
  const newBest = run.score > profile.best;
  if (newBest) profile.best = run.score;
  const heroBest = profile.bestHero[run.hero] || 0;
  const newHeroBest = run.score > heroBest;
  if (newHeroBest) profile.bestHero[run.hero] = run.score;
  let newDailyBest = false;
  if (run.daily) {
    const d = profile.daily;
    if (d.todayKey !== run.dateKey) {
      d.todayKey = run.dateKey;
      d.todayBest = 0;
    }
    if (run.score > d.todayBest) {
      d.todayBest = run.score;
      newDailyBest = true;
    }
    d.best = Math.max(d.best, run.score);
  }
  const album = mergeAlbum(profile, run);
  const unlocks = checkUnlocks(profile);
  profile.history.unshift({
    date, hero: run.hero, daily: run.daily, gentle: run.gentle, result: run.result,
    floor: run.floor + 1, score: run.score, minutes: Math.round(minutes),
    battles: run.stats.battles, bosses: run.stats.bosses,
  });
  if (profile.history.length > HISTORY_LIMIT) profile.history.length = HISTORY_LIMIT;
  profile.current = null;
  return { newBest, newHeroBest, newDailyBest, unlocks, album };
}

export function albumCounts(profile) {
  return {
    cards: profile.album.cards.length,
    monsters: profile.album.monsters.length,
    stickers: profile.album.stickers.length,
  };
}
