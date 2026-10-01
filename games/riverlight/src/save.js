// Progress, settings and the garden in progress, under one namespaced key.
import { LEVEL_COUNT } from './levels.js';

export const SAVE_KEY = 'riverlight.v1';

export function defaultSave() {
  return { stars: {}, best: {}, unlocked: 1, sound: true, music: true, zen: 0, current: null, seen: [] };
}

export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const save = { ...defaultSave(), ...data };
    for (const key of ['stars', 'best']) if (!save[key] || typeof save[key] !== 'object') save[key] = {};
    save.unlocked = Math.max(1, Math.min(LEVEL_COUNT, save.unlocked | 0 || 1));
    save.zen = Math.max(0, save.zen | 0);
    save.sound = save.sound !== false;
    save.music = save.music !== false;
    if (!Array.isArray(save.seen)) save.seen = [];
    if (!save.current || typeof save.current !== 'object' || !Array.isArray(save.current.rots)) save.current = null;
    return save;
  } catch {
    return defaultSave();
  }
}

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

export function isUnlocked(save, id) {
  return id <= save.unlocked;
}

// A finished garden: stars and best moves only ever improve.
export function recordWin(save, id, { stars, moves }) {
  const prev = save.stars[id] | 0;
  const prevBest = save.best[id];
  save.stars[id] = Math.max(prev, stars);
  save.best[id] = prevBest == null ? moves : Math.min(prevBest, moves);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, id + 1));
  if (save.current && save.current.id === id) save.current = null;
  return { improved: stars > prev, firstClear: !prev, bestMoves: save.best[id] };
}
