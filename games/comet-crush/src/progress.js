// Save data under one namespaced localStorage key.
import { LEVELS, LEVELS_PER_CONSTELLATION } from './levels.js';

export const SAVE_KEY = 'comet-crush.v1';

export function defaultSave() {
  return { unlocked: 0, stars: {}, best: 0, muted: false, music: true };
}

export function loadSave(storage) {
  const save = defaultSave();
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return save;
    if (Number.isInteger(raw.unlocked)) save.unlocked = Math.max(0, Math.min(LEVELS.length - 1, raw.unlocked));
    if (Number.isFinite(raw.best)) save.best = Math.max(0, Math.floor(raw.best));
    save.muted = raw.muted === true;
    save.music = raw.music !== false;
    if (raw.stars && typeof raw.stars === 'object') {
      for (const [k, v] of Object.entries(raw.stars)) {
        const i = Number(k);
        if (Number.isInteger(i) && i >= 0 && i < LEVELS.length && [1, 2, 3].includes(v)) save.stars[i] = v;
      }
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return save;
}

export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* private mode or full: progress just won't persist */
  }
}

export function recordScore(save, score) {
  if (score <= save.best) return false;
  save.best = score;
  return true;
}

// Record a cleared level. Returns what changed so the UI can celebrate.
export function recordClear(save, levelIndex, stars, score) {
  const prev = save.stars[levelIndex] || 0;
  if (stars > prev) save.stars[levelIndex] = stars;
  const next = Math.min(LEVELS.length - 1, levelIndex + 1);
  const unlockedNew = next > save.unlocked;
  if (unlockedNew) save.unlocked = next;
  return { newStars: stars > prev, unlockedNew, newBest: recordScore(save, score) };
}

export const constellationsReached = (save) => Math.floor(save.unlocked / LEVELS_PER_CONSTELLATION) + 1;
export const isUnlocked = (save, index) => index <= save.unlocked;
export const totalStars = (save) => Object.values(save.stars).reduce((a, b) => a + b, 0);
