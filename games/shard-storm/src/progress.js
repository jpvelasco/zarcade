// Save data under one namespaced localStorage key.
import { DAILY } from './config.js';
import { dateKey } from './daily.js';

export const SAVE_KEY = 'shard-storm.v1';

export function defaultSave() {
  return { best: 0, muted: false, music: true, daily: { streak: 0, lastKey: 0 }, stats: { totalSliced: 0 } };
}

export function loadSave(storage) {
  const save = defaultSave();
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return save;
    if (Number.isFinite(raw.best)) save.best = Math.max(0, Math.floor(raw.best));
    save.muted = raw.muted === true;
    save.music = raw.music !== false;
    const d = raw.daily;
    if (d && typeof d === 'object') {
      if (Number.isInteger(d.streak)) save.daily.streak = Math.max(0, Math.min(9999, d.streak));
      if (Number.isInteger(d.lastKey)) save.daily.lastKey = Math.max(0, Math.min(99999999, d.lastKey));
    }
    const s = raw.stats;
    if (s && typeof s === 'object' && Number.isInteger(s.totalSliced)) {
      save.stats.totalSliced = Math.max(0, Math.min(99999999, s.totalSliced));
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return save;
}

// Returns false in private mode or when storage is full or blocked.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// Record a finished run. Returns whether the high score changed.
export function recordRun(save, score, sliced) {
  save.stats.totalSliced += sliced;
  const best = score > save.best;
  if (best) save.best = score;
  return best;
}

// Record today's daily clear (idempotent per day). Returns the new streak.
export function recordDaily(save, cleared, key, streak) {
  save.daily.streak = cleared && streak > save.daily.streak ? streak : save.daily.streak;
  if (cleared) save.daily.lastKey = key;
  return save.daily.streak;
}

export const dailyStatus = (save) => (save.daily.lastKey === dateKey() ? 'cleared' : save.daily.streak > 0 ? 'missed' : 'none');
export const streakActive = (save) => save.daily.streak > 0 && dateKey() - save.daily.lastKey <= 1;
