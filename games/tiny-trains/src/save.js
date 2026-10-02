// Saved progress under localStorage "tiny-trains.v1". DOM-free: callers pass
// the storage object (or null when storage is blocked).

import { starsFor } from './sim.js';
import { unlockedSkins } from './skins.js';

export const SAVE_KEY = 'tiny-trains.v1';

export function freshSave() {
  return {
    v: 1,
    levels: {},          // id -> { stars, best }
    skin: 'puffer',
    skins: ['puffer'],   // unlocked so far (to announce new ones once)
    intros: [],          // world keys whose intro card was shown
    daily: { last: '', streak: 0, bestStreak: 0, solved: 0, days: {} },
    sandbox: null,
    sandboxRuns: 0,
    sound: true,
    music: true,
    fast: false,
  };
}

export function loadSave(storage) {
  const save = freshSave();
  if (!storage) return save;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return save;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return save;
    Object.assign(save, data);
    save.levels = {};
    if (data.levels && typeof data.levels === 'object') {
      // Keep only sane records: a broken entry must not crash or lock the map.
      for (const [id, rec] of Object.entries(data.levels)) {
        if (/^\d+$/.test(id) && rec && typeof rec === 'object' && Number.isFinite(rec.stars)) save.levels[id] = rec;
      }
    }
    save.daily = { ...freshSave().daily, ...(data.daily || {}) };
    save.daily.days = save.daily.days && typeof save.daily.days === 'object' ? save.daily.days : {};
    if (!Array.isArray(save.skins)) save.skins = ['puffer'];
    if (!Array.isArray(save.intros)) save.intros = [];
  } catch {
    return freshSave();
  }
  return save;
}

export function writeSave(storage, save) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(save) {
  let n = 0;
  for (const rec of Object.values(save.levels)) n += rec.stars || 0;
  return n;
}

export function worldsDone(save, levels) {
  const done = [];
  const worlds = [...new Set(levels.map((l) => l.world))];
  for (const w of worlds) {
    if (levels.filter((l) => l.world === w).every((l) => save.levels[l.id])) done.push(w);
  }
  return done;
}

export function progressOf(save, levels) {
  return {
    stars: totalStars(save),
    worldsDone: worldsDone(save, levels),
    dailies: save.daily.solved || 0,
    bestStreak: save.daily.bestStreak || 0,
    sandboxRuns: save.sandboxRuns || 0,
  };
}

// Levels open three ahead of the furthest one solved, so nobody gets stuck.
export function furthestSolved(save) {
  let top = 0;
  for (const id of Object.keys(save.levels)) top = Math.max(top, Number(id));
  return top;
}
export const isLevelOpen = (save, id) => id <= furthestSolved(save) + 3;

// Record a win. Returns what changed so the results screen can celebrate.
export function recordLevel(save, level, pieces) {
  const stars = starsFor(level.par, pieces);
  const prev = save.levels[level.id];
  const rec = { stars: Math.max(stars, prev ? prev.stars : 0), best: Math.min(pieces, prev ? prev.best : Infinity) };
  save.levels[level.id] = rec;
  return {
    stars,
    first: !prev,
    newBest: !!prev && pieces < prev.best,
    moreStars: !!prev && stars > prev.stars,
    best: rec.best,
    underPar: pieces < level.par,
  };
}

// Newly unlocked skins since last time (and remember them).
export function claimSkins(save, levels) {
  const now = unlockedSkins(progressOf(save, levels));
  const fresh = now.filter((k) => !save.skins.includes(k));
  save.skins = [...new Set([...save.skins, ...now])];
  return fresh;
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayBefore(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

// The streak to show today: it only counts if the last solve was today or
// yesterday (a missed day just starts a fresh streak, no fuss).
export function currentStreak(save, today) {
  const { last, streak } = save.daily;
  return last === today || last === dayBefore(today) ? streak : 0;
}

export function recordDaily(save, today, pieces) {
  const daily = save.daily;
  const prevBest = daily.days[today];
  if (daily.last !== today) {
    daily.streak = daily.last === dayBefore(today) ? daily.streak + 1 : 1;
    daily.last = today;
    daily.solved = (daily.solved || 0) + 1;
  }
  daily.bestStreak = Math.max(daily.bestStreak || 0, daily.streak);
  daily.days[today] = Math.min(pieces, prevBest ?? Infinity);
  // Keep the history small.
  const keys = Object.keys(daily.days).sort();
  while (keys.length > 60) delete daily.days[keys.shift()];
  return { first: prevBest === undefined, newBest: prevBest !== undefined && pieces < prevBest, streak: daily.streak };
}
