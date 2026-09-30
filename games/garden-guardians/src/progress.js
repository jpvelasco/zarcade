// Save data under one namespaced localStorage key.
import { DEFENDERS, DEFENDER_ORDER } from './data.js';
import { MAPS } from './maps.js';

export const SAVE_KEY = 'garden-guardians.v1';

export function defaultSave() {
  return { stars: {}, muted: false, music: true, fast: false };
}

export function loadSave(storage) {
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const save = { ...defaultSave(), ...data };
    save.stars = typeof data.stars === 'object' && data.stars ? { ...data.stars } : {};
    return save;
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage, save) {
  try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage full or disabled */ }
}

export function isMapUnlocked(save, index) {
  return index === 0 || (save.stars[MAPS[index - 1]?.id] || 0) > 0;
}

// The furthest map the player can reach sets which defenders they own.
export function highestUnlocked(save) {
  let i = 0;
  while (i + 1 < MAPS.length && isMapUnlocked(save, i + 1)) i++;
  return i;
}

export function unlockedDefenders(save, mapIndex = 0) {
  const level = Math.max(highestUnlocked(save), mapIndex);
  return DEFENDER_ORDER.filter((t) => DEFENDERS[t].unlock <= level);
}

// Record a finished map. Returns what changed for the results screen.
export function recordResult(save, mapIndex, stars) {
  const id = MAPS[mapIndex].id;
  const before = unlockedDefenders(save);
  const prev = save.stars[id] || 0;
  const firstClear = stars > 0 && prev === 0;
  if (stars > prev) save.stars[id] = stars;
  const after = unlockedDefenders(save);
  return {
    best: Math.max(prev, stars),
    improved: stars > prev,
    newDefenders: after.filter((t) => !before.includes(t)),
    newMap: firstClear && mapIndex + 1 < MAPS.length ? mapIndex + 1 : null,
  };
}

export function totalStars(save) {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}
