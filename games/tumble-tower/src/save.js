// Progress, unlocks and bests, saved under `tumble-tower.v1`. DOM-free: the
// page passes in `localStorage` (or null when storage is blocked).
import { LEVELS, ISLANDS, islandLevels } from './levels.js';
import { STARTERS } from './animals.js';
import { THEMES } from './themes.js';

export const SAVE_KEY = 'tumble-tower.v1';

export function freshSave() {
  return {
    v: 1,
    stars: [],
    animals: STARTERS.slice(),
    newAnimals: [],
    themes: ['sunny'],
    theme: 'sunny',
    endlessBest: 0,
    endlessRuns: 0,
    daily: {},
    streak: { last: null, count: 0, best: 0 },
    passGames: 0,
    muted: false,
    music: true,
  };
}

export function loadSave(storage) {
  const s = freshSave();
  if (!storage) return s;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return s;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return s;
    if (Array.isArray(d.stars)) s.stars = d.stars.map((n) => Math.max(0, Math.min(3, n | 0))).slice(0, LEVELS.length);
    if (Array.isArray(d.animals)) s.animals = [...new Set([...STARTERS, ...d.animals.filter((a) => typeof a === 'string')])];
    if (Array.isArray(d.newAnimals)) s.newAnimals = d.newAnimals.filter((a) => s.animals.includes(a));
    if (Array.isArray(d.themes)) s.themes = [...new Set(['sunny', ...d.themes.filter((t) => THEMES.some((x) => x.id === t))])];
    if (typeof d.theme === 'string' && s.themes.includes(d.theme)) s.theme = d.theme;
    if (Number.isFinite(d.endlessBest)) s.endlessBest = Math.max(0, d.endlessBest);
    if (Number.isFinite(d.endlessRuns)) s.endlessRuns = d.endlessRuns | 0;
    if (d.daily && typeof d.daily === 'object') for (const [k, v] of Object.entries(d.daily)) if (/^\d{4}-\d\d-\d\d$/.test(k)) s.daily[k] = Math.max(0, Math.min(3, v | 0));
    if (d.streak && typeof d.streak === 'object') {
      s.streak.last = typeof d.streak.last === 'string' ? d.streak.last : null;
      s.streak.count = d.streak.count | 0;
      s.streak.best = d.streak.best | 0;
    }
    if (Number.isFinite(d.passGames)) s.passGames = d.passGames | 0;
    s.muted = !!d.muted;
    s.music = d.music !== false;
  } catch { /* corrupt save: start fresh */ }
  return s;
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

export const totalStars = (save) => save.stars.reduce((a, b) => a + (b || 0), 0);
export const levelUnlocked = (save, i) => i === 0 || (save.stars[i - 1] || 0) > 0;
export function islandUnlocked(save, island) {
  if (island === 0) return true;
  const prev = islandLevels(island - 1);
  return (save.stars[prev[prev.length - 1].index] || 0) > 0;
}
export const islandCleared = (save, island) => islandLevels(island).every((l) => (save.stars[l.index] || 0) > 0);
export const islandStars = (save, island) => islandLevels(island).reduce((n, l) => n + (save.stars[l.index] || 0), 0);

// The next level to play: the first without stars (or the last level).
export function nextLevel(save) {
  for (let i = 0; i < LEVELS.length; i++) if (!save.stars[i]) return i;
  return LEVELS.length - 1;
}

function addAnimal(save, id, out) {
  if (save.animals.includes(id)) return;
  save.animals.push(id);
  save.newAnimals.push(id);
  out.animals.push(id);
}

// Re-check every unlock rule; returns what is new.
export function checkUnlocks(save) {
  const out = { animals: [], themes: [] };
  ISLANDS.forEach((isl, i) => {
    if (islandCleared(save, i)) for (const a of isl.reward) addAnimal(save, a, out);
  });
  for (const t of THEMES) {
    if (save.themes.includes(t.id)) continue;
    if (t.unlock(save)) { save.themes.push(t.id); out.themes.push(t.id); }
  }
  return out;
}

export function recordLevel(save, index, stars) {
  const before = save.stars[index] || 0;
  while (save.stars.length <= index) save.stars.push(0);
  save.stars[index] = Math.max(before, stars);
  const unlocks = checkUnlocks(save);
  return { improved: stars > before, before, ...unlocks };
}

export function recordEndless(save, height) {
  save.endlessRuns++;
  const newBest = height > save.endlessBest + 0.005;
  const previous = save.endlessBest;
  if (newBest) save.endlessBest = Math.round(height * 100) / 100;
  return { newBest, previous, ...checkUnlocks(save) };
}

function dayBefore(key) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// A daily clear keeps the streak going (yesterday → +1, earlier → 1).
export function recordDaily(save, key, stars) {
  const before = save.daily[key] || 0;
  save.daily[key] = Math.max(before, stars);
  if (stars > 0 && save.streak.last !== key) {
    save.streak.count = save.streak.last === dayBefore(key) ? save.streak.count + 1 : 1;
    save.streak.last = key;
    save.streak.best = Math.max(save.streak.best, save.streak.count);
  }
  return { improved: stars > before, streak: save.streak.count, ...checkUnlocks(save) };
}

// The streak shown on the title: still alive if the last clear was today or
// yesterday.
export function liveStreak(save, today) {
  const l = save.streak.last;
  return l === today || l === dayBefore(today) ? save.streak.count : 0;
}

export { dayBefore };
