// Save and load under one namespaced localStorage key.
import { normalize, newState, STORAGE_KEY } from './progress.js';

export { STORAGE_KEY };

export function loadSave(storage) {
  if (!storage) return { state: newState(), fresh: true };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { state: newState(), fresh: true };
    return { state: normalize(JSON.parse(raw)), fresh: false };
  } catch {
    return { state: newState(), fresh: true, broken: true };
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
