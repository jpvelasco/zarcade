// Save data: stars and bests per level, skins, the daily fort and its
// streak. Pure functions over a plain object; the page owns storage.
import { previousDateKey } from './rng.js';

export const SAVE_KEY = 'snack-siege.v1';
export const LEVEL_COUNT = 36;
export const PER_WORLD = 12;

// Slingshot skins. `need` is what unlocks each one.
export const SKINS = [
  { id: 'pretzel', name: 'Pretzel Classic', need: null, wood: '#b8742e', wood2: '#e3a65a', band: '#7a2a1a', trail: '#fff4e0', style: 'pretzel' },
  { id: 'cane', name: 'Candy Cane', need: { stars: 6 }, wood: '#fff7f7', wood2: '#e8344a', band: '#2f9e44', trail: '#ff8fa3', style: 'stripe' },
  { id: 'licorice', name: 'Licorice Twist', need: { stars: 15 }, wood: '#2b1d2e', wood2: '#5b3d63', band: '#ff3d6e', trail: '#c77dff', style: 'twist' },
  { id: 'waffle', name: 'Golden Waffle', need: { world: 0 }, wood: '#e9b44c', wood2: '#b97d1d', band: '#8a4b0f', trail: '#ffd84f', style: 'grid' },
  { id: 'gummy', name: 'Gummy Worm', need: { daily: 3 }, wood: '#ff9f1c', wood2: '#2ec4b6', band: '#ff4fa0', trail: '#7cf2c8', style: 'worm' },
  { id: 'lolly', name: 'Rainbow Lollipop', need: { stars: 30 }, wood: '#ff5d8f', wood2: '#5dd3ff', band: '#ffffff', trail: 'rainbow', style: 'rainbow' },
  { id: 'cotton', name: 'Cotton Candy', need: { world: 1 }, wood: '#ffc2e2', wood2: '#a8dcff', band: '#ff7bc2', trail: '#ffd6ee', style: 'fluff' },
  { id: 'choco', name: 'Choco Bar', need: { stars: 50 }, wood: '#6b3a22', wood2: '#9a5a36', band: '#ffd84f', trail: '#d9a066', style: 'grid' },
  { id: 'frosty', name: 'Frosty Mint', need: { stars: 75 }, wood: '#d9fff5', wood2: '#5fd6c0', band: '#3a7cff', trail: '#c9f6ff', style: 'stripe' },
  { id: 'star', name: 'Starlight', need: { world: 2 }, wood: '#ffe066', wood2: '#ffb000', band: '#ff4fd8', trail: 'sparkle', style: 'star' },
];

export function defaultSave() {
  return {
    v: 1,
    stars: {},
    best: {},
    fails: {},
    skipped: {},
    skin: 'pretzel',
    seenSkins: ['pretzel'],
    seenBeans: [],
    muted: false,
    music: true,
    daily: { date: '', best: 0, stars: 0, cleared: false },
    dailyClears: 0,
    streak: { last: '', count: 0 },
    pops: 0,
  };
}

export function loadSave(storage) {
  const save = defaultSave();
  if (!storage) return save;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return save;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return save;
    for (const k of Object.keys(save)) {
      const v = data[k];
      // Keep the default when a field is missing or the wrong type, so an
      // odd save can never stop the game from starting.
      if (v === undefined || v === null || typeof v !== typeof save[k] || Array.isArray(v) !== Array.isArray(save[k])) continue;
      if (typeof save[k] === 'object' && !Array.isArray(save[k])) save[k] = { ...save[k], ...v };
      else save[k] = v;
    }
    if (!SKINS.some((s) => s.id === save.skin)) save.skin = 'pretzel';
  } catch {
    // Corrupt or blocked storage: start fresh.
  }
  return save;
}

export function writeSave(storage, save) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(save) {
  let n = 0;
  for (let i = 0; i < LEVEL_COUNT; i++) n += save.stars[i] || 0;
  return n;
}

export function worldStars(save, w) {
  let n = 0;
  for (let i = w * PER_WORLD; i < (w + 1) * PER_WORLD; i++) n += save.stars[i] || 0;
  return n;
}

export function worldCleared(save, w) {
  for (let i = w * PER_WORLD; i < (w + 1) * PER_WORLD; i++) if (!save.stars[i]) return false;
  return true;
}

export function isUnlocked(save, i) {
  if (i <= 0) return true;
  return !!(save.stars[i] || save.stars[i - 1] || save.skipped[i - 1]);
}

// The first level the player hasn't cleared yet (or the last level).
export function nextLevel(save) {
  for (let i = 0; i < LEVEL_COUNT; i++) if (!save.stars[i] && isUnlocked(save, i)) return i;
  for (let i = 0; i < LEVEL_COUNT; i++) if (!save.stars[i]) return Math.max(0, i);
  return LEVEL_COUNT - 1;
}

export function recordClear(save, i, stars, score) {
  const before = save.stars[i] || 0;
  const firstClear = !before;
  const newBest = score > (save.best[i] || 0);
  if (stars > before) save.stars[i] = stars;
  if (newBest) save.best[i] = score;
  save.fails[i] = 0;
  delete save.skipped[i];
  return { firstClear, newBest, starsGained: Math.max(0, stars - before), hadBest: before > 0 };
}

export function recordFail(save, i) {
  save.fails[i] = (save.fails[i] || 0) + 1;
  return save.fails[i];
}

// After a few tries, kids can skip ahead; the skipped level stays open.
export const SKIP_AFTER = 3;
export function canSkip(save, i) {
  return (save.fails[i] || 0) >= SKIP_AFTER && i < LEVEL_COUNT - 1 && !save.stars[i];
}
export function skipLevel(save, i) {
  save.skipped[i] = true;
}

export function skinUnlocked(save, skin) {
  const n = skin.need;
  if (!n) return true;
  if (n.stars !== undefined) return totalStars(save) >= n.stars;
  if (n.world !== undefined) return worldCleared(save, n.world);
  if (n.daily !== undefined) return save.dailyClears >= n.daily;
  return false;
}

export function needText(skin) {
  const n = skin.need;
  if (!n) return 'Ready to fling';
  if (n.stars !== undefined) return `Earn ${n.stars} ★`;
  if (n.world !== undefined) return `Clear ${['Cookie Canyon', 'Soda Springs', 'Frosting Peaks'][n.world]}`;
  if (n.daily !== undefined) return `Beat ${n.daily} daily forts`;
  return '';
}

// Skins unlocked since the player last looked.
export function freshSkins(save) {
  return SKINS.filter((s) => skinUnlocked(save, s) && !save.seenSkins.includes(s.id));
}

export function markSkinsSeen(save) {
  for (const s of SKINS) if (skinUnlocked(save, s) && !save.seenSkins.includes(s.id)) save.seenSkins.push(s.id);
}

export function chooseSkin(save, id) {
  const skin = SKINS.find((s) => s.id === id);
  if (!skin || !skinUnlocked(save, skin)) return false;
  save.skin = id;
  return true;
}

export function skinOf(save) {
  return SKINS.find((s) => s.id === save.skin) || SKINS[0];
}

// The daily fort: best score for today, and a streak of days in a row.
export function dailyState(save, today) {
  const d = save.daily.date === today ? save.daily : { date: today, best: 0, stars: 0, cleared: false };
  const alive = save.streak.last === today || save.streak.last === previousDateKey(today);
  return { ...d, streak: alive ? save.streak.count : 0 };
}

export function recordDaily(save, today, won, score, stars) {
  if (save.daily.date !== today) save.daily = { date: today, best: 0, stars: 0, cleared: false };
  const d = save.daily;
  const newBest = won && score > d.best;
  if (newBest) d.best = score;
  if (won) d.stars = Math.max(d.stars, stars);
  let streakUp = false;
  if (won && !d.cleared) {
    d.cleared = true;
    save.dailyClears++;
    if (save.streak.last === previousDateKey(today)) save.streak.count++;
    else if (save.streak.last !== today) save.streak.count = 1;
    save.streak.last = today;
    streakUp = true;
  }
  return { newBest, streakUp, streak: save.streak.count };
}
