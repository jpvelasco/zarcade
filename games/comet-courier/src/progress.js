// Save data, stars, the stamp gallery, comet skins and missions, under one
// namespaced localStorage key. Every field is sanitized so a damaged save
// cannot stop the game from loading.
import { LEVELS, LEVEL_COUNT, LEVELS_PER_WORLD } from './levels.js';

export const SAVE_KEY = 'comet-courier.v1';

export function defaultSave() {
  return {
    unlocked: 0,
    stars: {}, // level index -> 1..3
    best: 0, // best single-level star count / personal best score
    muted: false,
    music: true,
    daily: {}, // "y-m-d" -> true (dailies delivered)
    dailyBest: 0,
    stamps: {}, // stamp id -> true
    skin: 0, // selected comet skin index
    skins: {}, // skin id -> true (unlocked)
    missions: { day: null, done: {} },
  };
}

export function loadSave(storage) {
  const save = defaultSave();
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return save;
    if (Number.isInteger(raw.unlocked)) save.unlocked = Math.max(0, Math.min(LEVEL_COUNT - 1, raw.unlocked));
    if (Number.isFinite(raw.best)) save.best = Math.max(0, Math.floor(raw.best));
    save.muted = raw.muted === true;
    save.music = raw.music !== false;
    if (raw.daily && typeof raw.daily === 'object') {
      for (const k of Object.keys(raw.daily)) {
        if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) save.daily[k] = true;
      }
    }
    if (Number.isFinite(raw.dailyBest)) save.dailyBest = Math.max(0, Math.floor(raw.dailyBest));
    if (raw.stamps && typeof raw.stamps === 'object') {
      for (const k of Object.keys(raw.stamps)) if (STAMP_IDS.has(k)) save.stamps[k] = true;
    }
    if (Number.isInteger(raw.skin) && raw.skin >= 0 && raw.skin < SKINS.length) save.skin = raw.skin;
    if (raw.skins && typeof raw.skins === 'object') {
      for (const k of Object.keys(raw.skins)) {
        const i = Number(k);
        if (Number.isInteger(i) && i >= 0 && i < SKINS.length) save.skins[i] = true;
      }
    }
    if (raw.stars && typeof raw.stars === 'object') {
      for (const [k, v] of Object.entries(raw.stars)) {
        const i = Number(k);
        if (Number.isInteger(i) && i >= 0 && i < LEVEL_COUNT && [1, 2, 3].includes(v)) save.stars[i] = v;
      }
    }
    if (raw.missions && typeof raw.missions === 'object') {
      if (typeof raw.missions.day === 'string') save.missions.day = raw.missions.day;
      if (raw.missions.done && typeof raw.missions.done === 'object') {
        for (const k of Object.keys(raw.missions.done)) if (Number.isFinite(raw.missions.done[k])) save.missions.done[k] = Math.max(0, Math.floor(raw.missions.done[k]));
      }
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return save;
}

// Returns false in private mode or when storage is full or blocked: progress
// just won't persist.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// Record a cleared level (1..3 stars) and a score. Returns what changed so the
// UI can celebrate ("New best!", a fresh stamp, a skin unlock).
export function recordClear(save, levelIndex, stars, score) {
  const prev = save.stars[levelIndex] || 0;
  const newStars = stars > prev;
  if (newStars) save.stars[levelIndex] = stars;
  const next = Math.min(LEVEL_COUNT - 1, levelIndex + 1);
  const unlockedNew = next > save.unlocked;
  if (unlockedNew) save.unlocked = next;
  const newBest = score > save.best;
  if (newBest) save.best = score;
  return { newStars, unlockedNew, newBest, stamp: earnStamp(save, levelIndex, stars, score) };
}

export const isUnlocked = (save, index) => index <= save.unlocked;
export const totalStars = (save) => Object.values(save.stars).reduce((a, b) => a + b, 0);
export const constellationsCleared = (save) => Object.keys(save.stars).length;

// --- Comet skins: a visual reward that shows up in play. ---------------------
// Unlock rules are simple and generous; kids never grind.
export const SKINS = [
  { id: 0, name: 'Penny', rule: 'Starts with you', color: '#ffe27a', tail: '#7ad1ff' },
  { id: 1, name: 'Rufus', rule: 'Clear 3 levels', color: '#ff9b6b', tail: '#ffd35c', test: (s) => constellationsCleared(s) >= 3 },
  { id: 2, name: 'Minty', rule: 'Earn 6 stars', color: '#8affc1', tail: '#2ee6c8', test: (s) => totalStars(s) >= 6 },
  { id: 3, name: 'Bolt', rule: 'Finish world 1', color: '#9ad0ff', tail: '#ffffff', test: (s) => s.unlocked >= LEVELS_PER_WORLD },
  { id: 4, name: 'Berry', rule: 'Earn 12 stars', color: '#ff7ad9', tail: '#c79bff', test: (s) => totalStars(s) >= 12 },
  { id: 5, name: 'Nova', rule: 'Finish world 3', color: '#fff1a8', tail: '#ff9b2f', test: (s) => s.unlocked >= LEVELS_PER_WORLD * 3 },
];

// Earn any stamps/skins whose rules are now true. Returns the newly earned
// stamp (or null) for the celebration.
function earnStamp(save, levelIndex, stars, score) {
  let earned = null;
  if (save.stars[levelIndex] === 3 && !save.stamps[`par-${levelIndex}`]) {
    save.stamps[`par-${levelIndex}`] = true;
    earned = `par-${levelIndex}`;
  }
  const w = worldOfSave(save, levelIndex);
  if (worldFullyCleared(save, w) && !save.stamps[`world-${w}`]) {
    save.stamps[`world-${w}`] = true;
    earned = `world-${w}`;
  }
  if (!save.stamps['champion'] && save.unlocked >= LEVEL_COUNT - 1) {
    save.stamps['champion'] = true;
    earned = 'champion';
  }
  // Unlock skins whose rules now pass.
  if (!save.skins || typeof save.skins !== 'object') save.skins = {};
  for (const skin of SKINS) {
    if (skin.test && !save.skins[skin.id] && skin.test(save)) {
      save.skins[skin.id] = true;
      if (!earned) earned = `skin-${skin.id}`;
    }
  }
  return earned;
}

function worldOfSave(save, index) {
  return Math.floor(index / LEVELS_PER_WORLD);
}

function worldFullyCleared(save, world) {
  for (let i = world * LEVELS_PER_WORLD; i < (world + 1) * LEVELS_PER_WORLD; i++) {
    if (!(save.stars[i] > 0)) return false;
  }
  return true;
}

export const STAMP_IDS = (() => {
  const ids = new Set(['champion', 'world-0', 'world-1', 'world-2', 'world-3', 'world-4']);
  for (let i = 0; i < LEVEL_COUNT; i++) ids.add(`par-${i}`);
  return ids;
})();

export const isSkinUnlocked = (save, id) => id === 0 || !!save.skins[id];
export const isStampEarned = (save, id) => !!save.stamps[id];

// --- Missions: three rotating daily goals. ---------------------------------
// The active set is keyed by the local date; progress is stored per goal.
const GOALS = [
  { id: 0, name: 'Deliver 3 pieces of mail', target: 3, kind: 'delivery' },
  { id: 1, name: 'Sink the star in 2 shots', target: 1, kind: 'twoShot' },
  { id: 2, name: 'Earn a 3-star delivery', target: 1, kind: 'threeStar' },
  { id: 3, name: 'Deliver 5 pieces of mail', target: 5, kind: 'delivery' },
  { id: 4, name: 'Earn two 3-star deliveries', target: 2, kind: 'threeStar' },
  { id: 5, name: 'Sink the star in 1 shot', target: 1, kind: 'oneShot' },
];

// The three active goals for a given date (deterministic pick via the rng the
// caller seeds from the date). Returns [goal, goal, goal].
export function missionsFor(rng) {
  const pool = GOALS.slice();
  const picked = [];
  for (let i = 0; i < 3; i++) {
    const pick = Math.floor(rng() * pool.length);
    picked.push(pool.splice(pick, 1)[0]);
  }
  return picked;
}

// Credit progress toward the active missions of a kind; returns the ids that
// just completed. A delivery on a wrong day (before a rotate) credits nothing.
export function creditMission(save, kind, amount = 1, day) {
  if (!save.missions || save.missions.day !== day || !Array.isArray(save.missions.set)) return [];
  if (!save.missions.done || typeof save.missions.done !== 'object') save.missions.done = {};
  const done = save.missions.done;
  const completed = [];
  for (const id of save.missions.set) {
    const g = GOALS.find((x) => x.id === id);
    if (!g || g.kind !== kind || (done[g.id] || 0) >= g.target) continue;
    done[g.id] = (done[g.id] || 0) + amount;
    if (done[g.id] >= g.target) completed.push(g.id);
  }
  return completed;
}

// Rotate the daily missions when the local date changes; returns the new set.
// The rng (seeded from the date by the caller) makes the pick deterministic.
export function rotateMissions(save, day, rng) {
  if (save.missions.day === day && Array.isArray(save.missions.set)) return missionsFromSave(save);
  save.missions = { day, done: {}, set: missionsFor(rng).map((g) => g.id) };
  return missionsFromSave(save);
}
// The active mission set (ids) from the save, for display.
export function missionsFromSave(save) {
  const ids = Array.isArray(save.missions?.set) ? save.missions.set : GOALS.slice(0, 3).map((g) => g.id);
  return ids.map((id) => GOALS.find((g) => g.id === id)).filter(Boolean);
}

export { LEVELS, LEVEL_COUNT };
