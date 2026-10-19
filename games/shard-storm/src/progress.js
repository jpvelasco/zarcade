// Save data under one namespaced localStorage key.
import { dateKey } from './daily.js';

export const SAVE_KEY = 'shard-storm.v1';

export function defaultSave() {
  return {
    best: 0,
    muted: false,
    music: true,
    daily: { streak: 0, lastKey: 0 },
    stats: { totalSliced: 0, bestCombo: 0, runs: 0, breaks: 0 },
  };
}

// Clamp one stored integer, keeping the default for anything missing or wrong.
function int(value, fallback, max) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
}

export function loadSave(storage) {
  const save = defaultSave();
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    return sanitise(raw, save);
  } catch {
    /* corrupt or unavailable storage: start fresh */
    return save;
  }
}

// Field-by-field sanitising: one damaged value can never stop the load or
// leak NaN into the HUD.
export function sanitise(raw, save = defaultSave()) {
  if (!raw || typeof raw !== 'object') return save;
  save.best = int(raw.best, save.best, 99999999);
  save.muted = raw.muted === true;
  save.music = raw.music !== false;
  const d = raw.daily;
  if (d && typeof d === 'object') {
    save.daily.streak = int(d.streak, save.daily.streak, 9999);
    save.daily.lastKey = int(d.lastKey, save.daily.lastKey, 99999999);
  }
  const s = raw.stats;
  if (s && typeof s === 'object') {
    save.stats.totalSliced = int(s.totalSliced, save.stats.totalSliced, 99999999);
    save.stats.bestCombo = int(s.bestCombo, save.stats.bestCombo, 99999);
    save.stats.runs = int(s.runs, save.stats.runs, 99999999);
    save.stats.breaks = int(s.breaks, save.stats.breaks, 99999999);
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

// Fold another tab's save into ours instead of letting the last writer win:
// every record keeps its better value and the fresher daily wins.
export function mergeSave(mine, theirs) {
  const other = sanitise(theirs);
  const out = {
    best: Math.max(mine.best, other.best),
    muted: mine.muted,
    music: mine.music,
    daily: { ...mine.daily },
    stats: {
      totalSliced: Math.max(mine.stats.totalSliced, other.stats.totalSliced),
      bestCombo: Math.max(mine.stats.bestCombo, other.stats.bestCombo),
      runs: Math.max(mine.stats.runs, other.stats.runs),
      breaks: Math.max(mine.stats.breaks, other.stats.breaks),
    },
  };
  // The newer day wins outright; the same day keeps the longer streak.
  if (other.daily.lastKey > mine.daily.lastKey) out.daily = { ...other.daily };
  else if (other.daily.lastKey === mine.daily.lastKey) out.daily.streak = Math.max(mine.daily.streak, other.daily.streak);
  return out;
}

// Record a finished run. Returns whether the high score changed.
export function recordRun(save, score, sliced, maxCombo = 0, breaks = 0) {
  save.stats.totalSliced += sliced;
  save.stats.bestCombo = Math.max(save.stats.bestCombo, maxCombo);
  save.stats.breaks += breaks;
  save.stats.runs++;
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
