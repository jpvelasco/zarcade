// Progress, stars and best scores, kept under one namespaced key.
import { LEVEL_COUNT } from './levels.js';

export const SAVE_KEY = 'jelly-jam.v1';

export function defaultSave() {
  return { stars: {}, best: {}, unlocked: 1, muted: false, plays: 0 };
}

export function loadSave(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const save = { ...defaultSave(), ...data };
    save.stars = typeof save.stars === 'object' && save.stars ? save.stars : {};
    save.best = typeof save.best === 'object' && save.best ? save.best : {};
    save.unlocked = Math.max(1, Math.min(LEVEL_COUNT, save.unlocked | 0 || 1));
    return save;
  } catch {
    return defaultSave();
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

export function isUnlocked(save, id) {
  return id <= save.unlocked;
}

// Records a cleared level: stars and best score only ever go up.
export function recordWin(save, id, { score, stars }) {
  const prevStars = save.stars[id] | 0;
  const prevBest = save.best[id] | 0;
  const improved = stars > prevStars;
  save.stars[id] = Math.max(prevStars, stars);
  save.best[id] = Math.max(prevBest, score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, id + 1));
  return { improved, newBest: score > prevBest, stars: save.stars[id], best: save.best[id] };
}
