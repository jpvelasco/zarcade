// Save and load under one namespaced localStorage key.
import { normalize, newState } from './alchemy.js';

export const STORAGE_KEY = 'potion-pals.v1';

export function loadSave(storage, seed = 1) {
  if (!storage) return { state: newState(seed), fresh: true };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { state: newState(seed), fresh: true };
    return { state: normalize(JSON.parse(raw), seed), fresh: false };
  } catch {
    return { state: newState(seed), fresh: true, broken: true };
  }
}

export function writeSave(storage, state) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage) {
  try { storage?.removeItem(STORAGE_KEY); return true; } catch { return false; }
}
