// Save data under one namespaced key, plus stars, personal bests, the daily
// streak and camp-gear unlocks. Every field is sanitized on load, so one
// damaged value can never stop the game from loading or show NaN. Unlocks are
// derived from progress (never stored), so they can't drift out of sync.
import { LEVEL_COUNT, LEVELS_PER_SECTION, dateKey, parseDateKey } from './deals.js';

export const SAVE_KEY = 'campfire-solitaire.v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SCORE = 1e7;

export function defaultSave() {
  return {
    unlocked: 0, // highest trail level you may play (0-based)
    stars: {}, // level index -> 1..3
    best: {}, // level index -> best score
    daily: {}, // 'YYYY-MM-DD' -> best score that day (cleared)
    quickBest: 0,
    quickWins: 0,
    bestStreak: 0, // longest chain ever, any mode
    wins: 0,
    back: 'plaid', // chosen card back
    muted: false,
    music: true,
  };
}

const cleanScore = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(MAX_SCORE, Math.floor(v)) : 0);
const cleanCount = (v, max = 1e6) => (Number.isInteger(v) && v >= 0 ? Math.min(max, v) : 0);

function levelMap(raw, clean) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const i = Number(k);
    const value = clean(v);
    if (Number.isInteger(i) && i >= 0 && i < LEVEL_COUNT && value) out[i] = value;
  }
  return out;
}

export function sanitize(raw) {
  const save = defaultSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return save;
  if (Number.isInteger(raw.unlocked)) save.unlocked = Math.max(0, Math.min(LEVEL_COUNT - 1, raw.unlocked));
  save.stars = levelMap(raw.stars, (v) => ([1, 2, 3].includes(v) ? v : 0));
  save.best = levelMap(raw.best, cleanScore);
  if (raw.daily && typeof raw.daily === 'object' && !Array.isArray(raw.daily)) {
    for (const [k, v] of Object.entries(raw.daily)) {
      if (DATE_RE.test(k) && parseDateKey(k) && Number.isFinite(v) && v >= 0) save.daily[k] = cleanScore(v);
    }
  }
  save.quickBest = cleanScore(raw.quickBest);
  save.quickWins = cleanCount(raw.quickWins);
  save.bestStreak = cleanCount(raw.bestStreak, 52);
  save.wins = cleanCount(raw.wins);
  if (typeof raw.back === 'string' && BACKS.some((b) => b.id === raw.back)) save.back = raw.back;
  save.muted = raw.muted === true;
  save.music = raw.music !== false;
  // A star on a level means it was cleared, so the next one is open.
  for (const k of Object.keys(save.stars)) save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT - 1, Number(k) + 1));
  return save;
}

export function loadSave(storage) {
  try {
    return sanitize(JSON.parse(storage.getItem(SAVE_KEY) || 'null'));
  } catch {
    return defaultSave();
  }
}

// False in private mode, or when storage is full or blocked: play goes on.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export const totalStars = (save) => Object.values(save.stars).reduce((n, s) => n + s, 0);
export const levelsCleared = (save) => Object.keys(save.stars).length;
export const dailyClears = (save) => Object.keys(save.daily).length;
export const isUnlocked = (save, i) => i >= 0 && i <= save.unlocked;
// Levels cleared in a row from the start (sections finish in order).
const clearedThrough = (save, count) => {
  for (let i = 0; i < count; i++) if (!save.stars[i]) return false;
  return true;
};

// ------------------------------------------------------------------ results

// A cleared trail level. Stars and bests only ever go up.
export function recordLevel(save, index, { score, stars, maxStreak }) {
  const before = unlockedIds(save);
  const prevStars = save.stars[index] || 0;
  const prevBest = save.best[index] || 0;
  if (stars > prevStars) save.stars[index] = stars;
  if (score > prevBest) save.best[index] = score;
  const next = Math.min(LEVEL_COUNT - 1, index + 1);
  const unlockedNew = next > save.unlocked;
  if (unlockedNew) save.unlocked = next;
  save.wins++;
  const streakBest = noteStreak(save, maxStreak);
  return { newStars: stars > prevStars, newBest: score > prevBest && prevBest > 0, firstClear: !prevStars, unlockedNew, streakBest, unlocks: newUnlocks(before, save) };
}

// A cleared Daily Deal for the given local date key.
export function recordDaily(save, key, { score, maxStreak }, today = new Date()) {
  const before = unlockedIds(save);
  const first = !(key in save.daily);
  const prev = save.daily[key] || 0;
  if (first || score > prev) save.daily[key] = score;
  save.wins++;
  const streakBest = noteStreak(save, maxStreak);
  return { first, newBest: !first && score > prev, streak: dailyStreak(save, today).streak, streakBest, unlocks: newUnlocks(before, save) };
}

export function recordQuick(save, { score, maxStreak }) {
  const before = unlockedIds(save);
  const prev = save.quickBest;
  if (score > prev) save.quickBest = score;
  save.quickWins++;
  save.wins++;
  const streakBest = noteStreak(save, maxStreak);
  return { newBest: score > prev && prev > 0, streakBest, unlocks: newUnlocks(before, save) };
}

// A round that ended stuck or was left still counts toward the longest chain.
export function noteStreak(save, maxStreak) {
  const s = cleanCount(maxStreak, 52);
  if (s <= save.bestStreak) return false;
  save.bestStreak = s;
  return true;
}

// ------------------------------------------------------------------ daily

// Consecutive days with a cleared Daily Deal, ending today or yesterday: the
// streak stays alive until a whole day goes by without one.
export function dailyStreak(save, today = new Date()) {
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const doneToday = dateKey(cursor) in save.daily;
  if (!doneToday) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dateKey(cursor) in save.daily) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, doneToday };
}

export function bestDailyStreak(save) {
  const days = Object.keys(save.daily).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of days) {
    const d = parseDateKey(k);
    if (prev) {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      run = dateKey(next) === k ? run + 1 : 1;
    } else run = 1;
    prev = d;
    best = Math.max(best, run);
  }
  return best;
}

// ------------------------------------------------------------------ camp gear

const levelGoal = (n) => (s) => levelsCleared(s) >= n;
const starGoal = (n) => (s) => totalStars(s) >= n;
const sectionGoal = (k) => (s) => clearedThrough(s, LEVELS_PER_SECTION * k);

// Card backs: rules are generous, kids never grind.
export const BACKS = [
  { id: 'plaid', name: 'Plaid Blanket', rule: 'Ready to go', test: () => true },
  { id: 'starry', name: 'Starry Night', rule: 'Earn 5 stars', test: starGoal(5) },
  { id: 'pines', name: 'Pine Forest', rule: 'Earn 12 stars', test: starGoal(12) },
  { id: 'embers', name: 'Campfire Embers', rule: 'Clear 3 Daily Deals', test: (s) => dailyClears(s) >= 3 },
  { id: 'moon', name: 'Moon & Owl', rule: 'Earn 24 stars', test: starGoal(24) },
  { id: 'aurora', name: 'Aurora', rule: 'Earn 40 stars', test: starGoal(40) },
  { id: 'gold', name: 'Golden Stars', rule: 'Finish Starry Ridge', test: sectionGoal(3) },
];

// Decorations that appear around the table once earned.
export const DECOR = [
  { id: 'lanterns', name: 'String Lanterns', rule: 'Clear 2 levels', test: levelGoal(2) },
  { id: 'tent', name: 'Tent', rule: 'Clear 4 levels', test: levelGoal(4) },
  { id: 'marshmallows', name: 'Marshmallows', rule: 'Clear a Daily Deal', test: (s) => dailyClears(s) >= 1 },
  { id: 'guitar', name: 'Guitar', rule: 'Finish Pine Hollow', test: sectionGoal(1) },
  { id: 'fireflies', name: 'Fireflies', rule: 'Make a streak of 8', test: (s) => s.bestStreak >= 8 },
  { id: 'owl', name: 'Owl', rule: 'Earn 15 stars', test: starGoal(15) },
  { id: 'canoe', name: 'Canoe', rule: 'Clear 12 levels', test: levelGoal(12) },
  { id: 'telescope', name: 'Telescope', rule: 'Finish Lakeside', test: sectionGoal(2) },
  { id: 'shooting', name: 'Shooting Stars', rule: 'Finish Starry Ridge', test: sectionGoal(3) },
];

export const hasBack = (save, id) => BACKS.some((b) => b.id === id && b.test(save));
export const hasDecor = (save, id) => DECOR.some((d) => d.id === id && d.test(save));
// The back to draw: the chosen one if it is still earned, else the blanket.
export const activeBack = (save) => (hasBack(save, save.back) ? save.back : 'plaid');

export function unlockedIds(save) {
  return new Set([...BACKS.filter((b) => b.test(save)).map((b) => `back:${b.id}`), ...DECOR.filter((d) => d.test(save)).map((d) => `decor:${d.id}`)]);
}

function newUnlocks(before, save) {
  return [...unlockedIds(save)].filter((id) => !before.has(id));
}

export function gearName(id) {
  const [kind, key] = id.split(':');
  const list = kind === 'back' ? BACKS : DECOR;
  const item = list.find((x) => x.id === key);
  return item ? `${item.name}${kind === 'back' ? ' card back' : ''}` : id;
}
