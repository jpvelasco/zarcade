// Saves, personal bests, the museum, unlockable skins and hats, and the
// daily streak. DOM-free; storage is passed in (and may be null).
import { ITEMS } from './items.js';
import { dayDiff } from './rng.js';

export const SAVE_KEY = 'snowball-summit.v1';

export const SKINS = [
  { id: 'snowy', name: 'Snowy', need: 'Free', test: () => true },
  { id: 'beach', name: 'Beach Ball', need: 'Earn 5 stars', test: (s) => totalStars(s) >= 5 },
  { id: 'cookie', name: 'Cookie Dough', need: 'Earn 12 stars', test: (s) => totalStars(s) >= 12 },
  { id: 'melon', name: 'Watermelon', need: 'Find 12 museum things', test: (s) => museumCount(s) >= 12 },
  { id: 'disco', name: 'Disco', need: 'Earn 24 stars', test: (s) => totalStars(s) >= 24 },
  { id: 'starlight', name: 'Starlight', need: 'Finish all three peaks', test: (s) => !!s.slopes['3-4']?.done },
];

export const HATS = [
  { id: 'none', name: 'No hat', need: 'Free', test: () => true },
  { id: 'beanie', name: 'Beanie', need: 'Free', test: () => true },
  { id: 'party', name: 'Party Hat', need: 'Play a Daily Slope', test: (s) => s.daily.played >= 1 },
  { id: 'tophat', name: 'Top Hat', need: 'Earn 8 stars', test: (s) => totalStars(s) >= 8 },
  { id: 'earmuffs', name: 'Earmuffs', need: 'Find 20 museum things', test: (s) => museumCount(s) >= 20 },
  { id: 'propeller', name: 'Propeller Cap', need: 'Roll 1 km on Endless Mountain', test: (s) => s.endless.dist >= 1000 },
  { id: 'crown', name: 'Crown', need: 'Earn 30 stars', test: (s) => totalStars(s) >= 30 },
];

export function freshSave() {
  return {
    v: 1,
    slopes: {},
    museum: {},
    skin: 'snowy',
    hat: 'beanie',
    endless: { dist: 0, size: 0, runs: 0 },
    daily: { last: null, streak: 0, played: 0, days: {} },
    totals: { items: 0, runs: 0 },
    seen: {},
    muted: false,
    music: true,
  };
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

export function loadSave(storage) {
  const save = freshSave();
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return save;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return save;
    for (const k of Object.keys(save)) {
      const v = data[k];
      if (v === undefined) continue;
      if (isObj(save[k])) { if (isObj(v)) save[k] = { ...save[k], ...v }; } else if (typeof v === typeof save[k]) save[k] = v;
    }
    // Drop broken nested parts so one bad value can't stop the game loading.
    for (const [id, r] of Object.entries(save.slopes)) if (!isObj(r)) delete save.slopes[id];
    if (!isObj(save.daily.days)) save.daily.days = {};
  } catch { /* corrupt or blocked: start fresh */ }
  return save;
}

export function writeSave(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return !!storage;
  } catch {
    return false;
  }
}

export function totalStars(save) {
  return Object.values(save.slopes).reduce((n, r) => n + (r.stars || 0), 0);
}

export function museumCount(save) {
  return ITEMS.filter((it) => save.museum[it.id] > 0).length;
}

// Slope i is open when it is the first or the one before it was finished.
export function slopeUnlocked(save, slopes, i) {
  return i === 0 || !!save.slopes[slopes[i - 1].id]?.done;
}

export function unlockedIds(save) {
  return { skins: SKINS.filter((x) => x.test(save)).map((x) => x.id), hats: HATS.filter((x) => x.test(save)).map((x) => x.id) };
}

// Things collected this run go into the museum. Returns the new types.
export function recordMuseum(save, byType) {
  const fresh = [];
  for (const [id, n] of Object.entries(byType)) {
    if (!save.museum[id]) fresh.push(id);
    save.museum[id] = (save.museum[id] || 0) + n;
    save.totals.items += n;
  }
  return fresh;
}

// Wrap a change to the save and report cosmetics it unlocked.
function withUnlocks(save, fn) {
  const before = unlockedIds(save);
  const out = fn();
  const after = unlockedIds(save);
  out.unlocks = [
    ...after.skins.filter((id) => !before.skins.includes(id)).map((id) => ({ kind: 'skin', ...SKINS.find((x) => x.id === id) })),
    ...after.hats.filter((id) => !before.hats.includes(id)).map((id) => ({ kind: 'hat', ...HATS.find((x) => x.id === id) })),
  ];
  return out;
}

// A finished slope: stars, bests ({ size, items, time }) and the museum.
export function recordSlope(save, slopeId, result) {
  return withUnlocks(save, () => {
    const prev = save.slopes[slopeId] || { stars: 0, done: false, best: null };
    const best = prev.best || { size: 0, items: 0, time: Infinity };
    const newBest = {
      size: result.size > best.size,
      items: result.items > best.items,
      time: result.time < (best.time ?? Infinity),
    };
    const firstClear = !prev.done;
    save.slopes[slopeId] = {
      done: true,
      stars: Math.max(prev.stars || 0, result.stars),
      best: {
        size: Math.max(best.size, result.size),
        items: Math.max(best.items, result.items),
        time: Math.min(best.time ?? Infinity, result.time),
      },
    };
    save.totals.runs++;
    const newTypes = recordMuseum(save, result.byType || {});
    return { newBest: firstClear ? { size: false, items: false, time: false } : newBest, firstClear, starsGained: Math.max(0, result.stars - (prev.stars || 0)), newTypes };
  });
}

// A run that did not finish still fills the museum.
export function recordAttempt(save, result) {
  return withUnlocks(save, () => {
    save.totals.runs++;
    return { newTypes: recordMuseum(save, result.byType || {}) };
  });
}

export function recordEndless(save, result) {
  return withUnlocks(save, () => {
    const e = save.endless;
    const newBest = result.dist > e.dist;
    e.dist = Math.max(e.dist, Math.round(result.dist));
    e.size = Math.max(e.size, result.size);
    e.runs++;
    save.totals.runs++;
    return { newBest, newTypes: recordMuseum(save, result.byType || {}) };
  });
}

// Mark the daily slope as played today; the streak counts consecutive days.
export function markDaily(save, dateKey) {
  const d = save.daily;
  if (d.last === dateKey) return d.streak;
  d.streak = d.last && dayDiff(d.last, dateKey) === 1 ? d.streak + 1 : 1;
  d.last = dateKey;
  return d.streak;
}

export function recordDaily(save, dateKey, result) {
  return withUnlocks(save, () => {
    const d = save.daily;
    markDaily(save, dateKey);
    d.played++;
    const prev = d.days[dateKey];
    const newBest = !prev || result.size > prev.size;
    d.days[dateKey] = { stars: Math.max(prev?.stars || 0, result.stars || 0), size: Math.max(prev?.size || 0, result.size || 0) };
    // Keep the history small.
    const keys = Object.keys(d.days).sort();
    while (keys.length > 30) delete d.days[keys.shift()];
    save.totals.runs++;
    return { newBest, streak: d.streak, newTypes: recordMuseum(save, result.byType || {}) };
  });
}

// Streak to show today: a gap of more than a day means it starts again.
export function currentStreak(save, todayKey) {
  const d = save.daily;
  if (!d.last) return 0;
  const gap = dayDiff(d.last, todayKey);
  return gap <= 1 ? d.streak : 0;
}
