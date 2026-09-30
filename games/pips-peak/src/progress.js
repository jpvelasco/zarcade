// Saved progress. Pure functions over a storage-like object so Node tests can
// pass a plain fake instead of localStorage.

import { LEVELS } from './levels.js';

export const SAVE_KEY = 'pips-peak.v1';

export function emptySave() {
  return { v: 1, muted: false, levels: {} };
}

export function loadSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.levels !== 'object') return emptySave();
    return { ...emptySave(), ...parsed, levels: { ...parsed.levels } };
  } catch {
    return emptySave();
  }
}

export function writeSave(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private browsing and full quotas are not worth interrupting play for.
  }
  return save;
}

export function entryFor(save, levelId) {
  return save.levels[levelId] || { stars: 0, best: 0, seeds: 0, acorns: 0, done: false };
}

/**
 * Fold a finished run into the save, keeping the player's best of everything.
 * Returns `{ save, entry, record }` where `record` is true for a new best time.
 */
export function recordRun(save, result) {
  const previous = entryFor(save, result.levelId);
  const record = previous.done ? result.time < previous.best : true;
  const entry = {
    done: true,
    stars: Math.max(previous.stars, result.stars),
    best: previous.best ? Math.min(previous.best, result.time) : result.time,
    seeds: Math.max(previous.seeds, result.seeds),
    acorns: Math.max(previous.acorns, result.acorns),
  };
  save.levels[result.levelId] = entry;
  return { save, entry, record };
}

/**
 * The first level is always open; every other one needs the level before it.
 * A level you have already finished stays open even if the save skipped ahead
 * (for instance after playing with the `?level=` link).
 */
export function isUnlocked(save, index) {
  if (index <= 0) return true;
  if (entryFor(save, LEVELS[index].id).done) return true;
  return entryFor(save, LEVELS[index - 1].id).done;
}

export function unlockedCount(save) {
  let count = 1;
  while (count < LEVELS.length && isUnlocked(save, count)) count += 1;
  return count;
}

/** Index of the level the title screen's Continue button should open. */
export function nextLevelIndex(save) {
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (!entryFor(save, LEVELS[i].id).done) return i;
  }
  return LEVELS.length - 1;
}

export function totals(save) {
  let stars = 0;
  let seeds = 0;
  let acorns = 0;
  let done = 0;
  for (const level of LEVELS) {
    const entry = entryFor(save, level.id);
    stars += entry.stars;
    seeds += entry.seeds;
    acorns += entry.acorns;
    if (entry.done) done += 1;
  }
  return { stars, seeds, acorns, done, levels: LEVELS.length, maxStars: LEVELS.length * 3 };
}

/** `1:04.20`, the shape used on the results screen and the level map. */
export function formatTime(seconds) {
  const whole = Math.max(0, seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole - mins * 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(2)}`;
}
