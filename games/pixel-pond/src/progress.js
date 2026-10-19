// The save: goals, discoveries, the daily streak, the gallery and settings,
// all under one localStorage key. Every field is sanitised on its own, so
// one damaged value never stops the game from loading.
import { PALETTE, BASE_ELEMENTS, BRUSHES, SKIES, COLLECTION_IDS, BRUSH_SIZES, DEFAULT_SIZE } from './elements.js';
import { GOALS, GOAL_BY_ID } from './goals.js';
import { decodeCells, MAX_SCENE_CHARS } from './codec.js';
import { previousKey } from './rng.js';

export const SAVE_KEY = 'pixel-pond.v1';
export const MAX_GALLERY = 12;
const NAME_MAX = 32;

export function defaultSave() {
  return {
    muted: false,
    goals: {},
    found: [],
    daily: { streak: 0, best: 0, lastKey: 0 },
    gallery: [],
    garden: null,
    sky: 'meadow',
    rainbow: false,
    brush: { size: DEFAULT_SIZE, shape: 'round', element: 'sand' },
  };
}

const int = (v, fallback, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : fallback);
const validKey = (k) => Number.isInteger(k) && k >= 20000101 && k <= 29991231;

function cleanName(v, fallback) {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NAME_MAX);
  return s || fallback;
}

// A stored garden is kept only if it decodes cleanly.
export function cleanScene(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { w, h, data } = raw;
  if (typeof data !== 'string' || data.length > MAX_SCENE_CHARS) return null;
  if (!decodeCells(data, w, h)) return null;
  return { w, h, data, at: int(raw.at, 0, 0, 8.64e15) };
}

function cleanEntry(raw) {
  const scene = cleanScene(raw);
  if (!scene) return null;
  const id = typeof raw.id === 'string' && /^[a-z0-9-]{1,24}$/.test(raw.id) ? raw.id : null;
  if (!id) return null;
  return { id, name: cleanName(raw.name, 'Garden'), ...scene };
}

export function sanitise(raw, save = defaultSave()) {
  if (!raw || typeof raw !== 'object') return save;
  save.muted = raw.muted === true;
  if (raw.goals && typeof raw.goals === 'object') {
    for (const g of GOALS) if (raw.goals[g.id] === true) save.goals[g.id] = true;
  }
  if (Array.isArray(raw.found)) save.found = COLLECTION_IDS.filter((id) => raw.found.includes(id));
  const d = raw.daily;
  if (d && typeof d === 'object') {
    save.daily.streak = int(d.streak, 0, 0, 9999);
    save.daily.best = Math.max(save.daily.streak, int(d.best, 0, 0, 9999));
    save.daily.lastKey = validKey(d.lastKey) ? d.lastKey : 0;
  }
  if (Array.isArray(raw.gallery)) {
    const ids = new Set();
    for (const e of raw.gallery.slice(0, MAX_GALLERY * 2)) {
      const entry = cleanEntry(e);
      if (!entry || ids.has(entry.id)) continue;
      ids.add(entry.id);
      save.gallery.push(entry);
      if (save.gallery.length >= MAX_GALLERY) break;
    }
  }
  save.garden = cleanScene(raw.garden);
  if (SKIES.some((s) => s.id === raw.sky)) save.sky = raw.sky;
  save.rainbow = raw.rainbow === true;
  const b = raw.brush;
  if (b && typeof b === 'object') {
    save.brush.size = int(b.size, DEFAULT_SIZE, 0, BRUSH_SIZES.length - 1);
    if (BRUSHES.some((x) => x.id === b.shape)) save.brush.shape = b.shape;
    if (PALETTE.some((p) => p.id === b.element) || b.element === 'eraser') save.brush.element = b.element;
  }
  return save;
}

export function loadSave(storage) {
  try {
    return sanitise(JSON.parse(storage.getItem(SAVE_KEY) || 'null'));
  } catch {
    return defaultSave(); // blocked or corrupt storage: start fresh
  }
}

// False when storage is blocked, full or missing.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ unlocks

const doneGoal = (save, id) => !!(id && save.goals[id]);

export function unlockedElements(save, lend = []) {
  const out = new Set(BASE_ELEMENTS);
  for (const p of PALETTE) if (doneGoal(save, p.unlock)) out.add(p.id);
  for (const id of lend) out.add(id);
  return out;
}

export const brushUnlocked = (save, id) => {
  const b = BRUSHES.find((x) => x.id === id);
  return !!b && (!b.unlock || doneGoal(save, b.unlock));
};

export const skyUnlocked = (save, id) => {
  const s = SKIES.find((x) => x.id === id);
  return !!s && (!s.unlock || doneGoal(save, s.unlock));
};

export const rainbowUnlocked = (save) => doneGoal(save, 'vine');

// The goal that unlocks a palette element, brush or sky (for "how do I get
// this?" messages).
export function unlockGoal(kind, id) {
  const list = kind === 'element' ? PALETTE : kind === 'brush' ? BRUSHES : SKIES;
  const item = list.find((x) => x.id === id);
  return item && item.unlock ? GOAL_BY_ID[item.unlock] : null;
}

// Record a finished goal the moment it is earned. Returns whether it is new.
export function recordGoal(save, id) {
  if (!GOAL_BY_ID[id] || save.goals[id]) return false;
  save.goals[id] = true;
  return true;
}

export const goalsDone = (save) => GOALS.filter((g) => save.goals[g.id]).length;

export function recordFound(save, id) {
  if (!COLLECTION_IDS.includes(id) || save.found.includes(id)) return false;
  save.found.push(id);
  return true;
}

// ------------------------------------------------------------ daily

// Finishing today's prompt: yesterday's finish continues the streak, a gap
// starts it again at one (no scolding). Returns the streak, or null when
// today was already done.
export function recordDaily(save, key) {
  const d = save.daily;
  if (d.lastKey === key) return null;
  d.streak = d.lastKey && d.lastKey === previousKey(key) ? d.streak + 1 : 1;
  d.best = Math.max(d.best, d.streak);
  d.lastKey = key;
  return d.streak;
}

// The streak as it stands today: alive if the last finish was today or
// yesterday.
export function liveStreak(save, today) {
  const { lastKey, streak } = save.daily;
  return lastKey === today || lastKey === previousKey(today) ? streak : 0;
}

export const dailyDone = (save, today) => save.daily.lastKey === today;

// ------------------------------------------------------------ gallery

// 'ok', 'full' or 'big' (too detailed to store).
export function addToGallery(save, entry) {
  if (save.gallery.length >= MAX_GALLERY) return 'full';
  if (!entry || typeof entry.data !== 'string' || entry.data.length > MAX_SCENE_CHARS) return 'big';
  save.gallery.unshift({ ...entry, name: cleanName(entry.name, 'Garden') });
  return 'ok';
}

export function removeFromGallery(save, id) {
  const before = save.gallery.length;
  save.gallery = save.gallery.filter((e) => e.id !== id);
  return save.gallery.length < before;
}

// ------------------------------------------------------------ other tabs

// Fold another tab's save into ours rather than letting the last writer
// win: goals and finds join, the newer daily and free-play garden win. The
// other tab wrote last, so its gallery stands (deletions stick), plus any of
// ours saved after everything it knows about.
export function mergeSave(mine, theirsRaw) {
  const theirs = sanitise(theirsRaw);
  const out = sanitise(JSON.parse(JSON.stringify(mine)));
  for (const id of Object.keys(theirs.goals)) out.goals[id] = true;
  for (const id of theirs.found) if (!out.found.includes(id)) out.found.push(id);
  if (theirs.daily.lastKey > out.daily.lastKey) out.daily = { ...theirs.daily, best: Math.max(theirs.daily.best, out.daily.best) };
  else if (theirs.daily.lastKey === out.daily.lastKey) {
    out.daily.streak = Math.max(out.daily.streak, theirs.daily.streak);
    out.daily.best = Math.max(out.daily.best, theirs.daily.best);
  }
  const newest = theirs.gallery.reduce((m, e) => Math.max(m, e.at), 0);
  const ids = new Set(theirs.gallery.map((e) => e.id));
  const mineNewer = out.gallery.filter((e) => !ids.has(e.id) && e.at > newest);
  out.gallery = [...mineNewer, ...theirs.gallery].slice(0, MAX_GALLERY);
  if (theirs.garden && (!out.garden || theirs.garden.at > out.garden.at)) out.garden = theirs.garden;
  return out;
}
