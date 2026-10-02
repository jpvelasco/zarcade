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
    // Keep only real levels with sane values, so a damaged field never shows
    // impossible stars or counts a level as cleared.
    save.stars = levelMap(save.stars, (v) => (Number.isInteger(v) && v >= 1 && v <= 3 ? v : 0));
    save.best = levelMap(save.best, (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0));
    save.unlocked = Math.max(1, Math.min(LEVEL_COUNT, save.unlocked | 0 || 1));
    save.muted = save.muted === true;
    save.plays = Math.max(0, save.plays | 0);
    return save;
  } catch {
    return defaultSave();
  }
}

function levelMap(x, clean) {
  const out = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
  for (const [k, v] of Object.entries(x)) {
    const id = Number(k);
    const value = clean(v);
    if (Number.isInteger(id) && id >= 1 && id <= LEVEL_COUNT && value) out[id] = value;
  }
  return out;
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
