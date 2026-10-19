// Saves, the daily dive, streaks, paint jobs and personal bests. DOM-free:
// the page passes in a Storage (or null) and today's date key.
import { AREAS, UPGRADE_ORDER } from './areas.js';
import { SPECIES } from './creatures.js';
import { AREA_STAGE } from './gating.js';
import { SHELLS, TREASURES } from './map.js';
import { hashString, mulberry32, shuffle } from './rng.js';

export const SAVE_KEY = 'deep-dive.v1';
export const DAILY_COUNT = 3;

export const PAINTS = [
  { id: 'classic', name: 'Sunny Yellow', body: '#ffd23f', trim: '#ff9f1c', pattern: 'plain', need: null, how: 'Bubbles\' first coat' },
  { id: 'sunset', name: 'Sunset Orange', body: '#ff8a3d', trim: '#c2410c', pattern: 'plain', need: { scans: 5 }, how: 'Scan 5 creatures' },
  { id: 'bubblegum', name: 'Bubblegum', body: '#ff9ccf', trim: '#d6338a', pattern: 'dots', need: { treasures: 5 }, how: 'Find 5 treasures' },
  { id: 'mint', name: 'Mint Chip', body: '#9af2cc', trim: '#2b8a5e', pattern: 'dots', need: { shells: 1 }, how: 'Find a golden shell' },
  { id: 'sailor', name: 'Sailor Stripes', body: '#f4f7ff', trim: '#2f6bff', pattern: 'stripes', need: { daily: 1 }, how: 'Finish a daily dive' },
  { id: 'reef', name: 'Coral Reef', body: '#ff7e8a', trim: '#1fb5b5', pattern: 'dots', need: { ups: 2 }, how: 'Find the Coral Drill' },
  { id: 'tiger', name: 'Tiger Shark', body: '#ffb13d', trim: '#3a2a1a', pattern: 'tiger', need: { scans: 20 }, how: 'Scan 20 creatures' },
  { id: 'glow', name: 'Glow Sub', body: '#5ef2d0', trim: '#1a5a7a', pattern: 'glow', need: { ups: 4 }, how: 'Find the Pressure Hull' },
  { id: 'galaxy', name: 'Galaxy', body: '#4a35a8', trim: '#ff6fd8', pattern: 'stars', need: { streak: 3 }, how: 'Daily dive 3 days in a row' },
  { id: 'explorer', name: 'Explorer Blue', body: '#3fa8ff', trim: '#ffd23f', pattern: 'stripes', need: { heart: 1 }, how: 'Find the Heart of the Sea' },
  { id: 'golden', name: 'Golden Sub', body: '#ffd84f', trim: '#b8860b', pattern: 'shine', need: { shells: SHELLS.length }, how: `Find all ${SHELLS.length} golden shells` },
  { id: 'rainbow', name: 'Rainbow', body: '#ff5a5a', trim: '#ffffff', pattern: 'rainbow', need: { scans: SPECIES.length }, how: 'Complete the encyclopedia' },
];

export function freshSave() {
  return {
    v: 1,
    progress: { upgrades: [], opened: [], scanned: [], treasures: [], shells: [], heart: false, lastDock: 'home', visited: [0], revealed: '' },
    paint: 'classic',
    seenPaints: ['classic'],
    bests: { depth: 0, diveScans: 0, dailyTime: 0 },
    daily: { date: '', goals: [], done: [], time: 0, complete: false },
    streak: { count: 0, last: '', best: 0 },
    stats: { dives: 0, playTime: 0, dailyDone: 0, returns: 0 },
    muted: false,
    music: true,
    started: false,
  };
}

const asArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const asNum = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function loadSave(storage) {
  const s = freshSave();
  let raw = null;
  try { raw = storage ? storage.getItem(SAVE_KEY) : null; } catch { raw = null; }
  if (!raw) return s;
  let d;
  try { d = JSON.parse(raw); } catch { return s; }
  if (!d || typeof d !== 'object') return s;
  const p = d.progress || {};
  s.progress.upgrades = UPGRADE_ORDER.filter((u) => asArray(p.upgrades).includes(u));
  s.progress.opened = asArray(p.opened);
  s.progress.scanned = asArray(p.scanned).filter((id) => SPECIES.some((sp) => sp.id === id));
  s.progress.treasures = asArray(p.treasures);
  s.progress.shells = asArray(p.shells);
  s.progress.heart = !!p.heart;
  s.progress.lastDock = typeof p.lastDock === 'string' ? p.lastDock : 'home';
  s.progress.visited = Array.isArray(p.visited) ? p.visited.filter((a) => Number.isInteger(a) && a >= 0 && a < AREAS.length) : [0];
  s.progress.revealed = typeof p.revealed === 'string' ? p.revealed : '';
  if (PAINTS.some((x) => x.id === d.paint)) s.paint = d.paint;
  s.seenPaints = asArray(d.seenPaints);
  if (!s.seenPaints.includes('classic')) s.seenPaints.push('classic');
  if (d.bests) {
    s.bests.depth = asNum(d.bests.depth);
    s.bests.diveScans = asNum(d.bests.diveScans);
    s.bests.dailyTime = asNum(d.bests.dailyTime);
  }
  if (d.daily && typeof d.daily.date === 'string') {
    // Unknown species (a damaged save, or an id that changed) are dropped; a
    // short list is rebuilt by ensureDaily.
    const known = (list) => asArray(list).filter((id) => SPECIES.some((sp) => sp.id === id));
    let goals = known(d.daily.goals);
    if (goals.length !== asArray(d.daily.goals).length) goals = [];
    s.daily = { date: d.daily.date, goals, done: known(d.daily.done).filter((id) => goals.includes(id)), time: asNum(d.daily.time), complete: !!d.daily.complete && goals.length > 0 };
  }
  if (d.streak) s.streak = { count: asNum(d.streak.count), last: typeof d.streak.last === 'string' ? d.streak.last : '', best: asNum(d.streak.best) };
  if (d.stats) for (const k of Object.keys(s.stats)) s.stats[k] = asNum(d.stats[k]);
  s.muted = !!d.muted;
  s.music = d.music !== false;
  s.started = !!d.started;
  return s;
}

export function writeSave(storage, save) {
  if (!storage) return false;
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch { return false; }
}

// The revealed-cells bitmap, packed 8 cells per byte and base64 encoded.
export function encodeBits(bytes) {
  const packed = new Uint8Array(Math.ceil(bytes.length / 8));
  for (let i = 0; i < bytes.length; i++) if (bytes[i]) packed[i >> 3] |= 1 << (i & 7);
  let bin = '';
  for (let i = 0; i < packed.length; i++) bin += String.fromCharCode(packed[i]);
  return btoa(bin);
}

export function decodeBits(text, length) {
  const out = new Uint8Array(length);
  if (!text) return out;
  let bin;
  try { bin = atob(text); } catch { return out; }
  for (let i = 0; i < length; i++) {
    const b = bin.charCodeAt(i >> 3) || 0;
    if (b & (1 << (i & 7))) out[i] = 1;
  }
  return out;
}

// ---------------------------------------------------------------- dates

export function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function previousDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return dateKey(dt);
}

// ---------------------------------------------------------------- daily dive

// Three species to scan today, only from areas this player can already reach.
export function dailyGoals(key, stage) {
  const pool = SPECIES.filter((s) => AREA_STAGE[s.area] <= stage).map((s) => s.id);
  const rand = mulberry32(hashString(`deep-dive:${key}:${stage}`));
  return shuffle(rand, pool).slice(0, DAILY_COUNT);
}

// Make sure today's daily exists; keeps today's goals if progress changes mid-day.
export function ensureDaily(save, key) {
  if (save.daily.date === key && save.daily.goals.length) return false;
  save.daily = { date: key, goals: dailyGoals(key, save.progress.upgrades.length), done: [], time: 0, complete: false };
  return true;
}

export function dailyRemaining(save) {
  return save.daily.goals.filter((g) => !save.daily.done.includes(g));
}

// A scan happened. Returns { progressed, completed, newBest, streak }.
export function recordDailyScan(save, key, speciesId) {
  const out = { progressed: false, completed: false, newBest: false, streak: currentStreak(save, key) };
  if (save.daily.date !== key || save.daily.complete) return out;
  if (!save.daily.goals.includes(speciesId) || save.daily.done.includes(speciesId)) return out;
  save.daily.done.push(speciesId);
  out.progressed = true;
  if (dailyRemaining(save).length === 0) {
    save.daily.complete = true;
    out.completed = true;
    save.stats.dailyDone++;
    const prev = previousDay(key);
    if (save.streak.last === key) { /* already counted */ } else if (save.streak.last === prev) save.streak.count++;
    else save.streak.count = 1;
    save.streak.last = key;
    save.streak.best = Math.max(save.streak.best, save.streak.count);
    const time = Math.round(save.daily.time);
    if (time > 0 && (!save.bests.dailyTime || time < save.bests.dailyTime)) { save.bests.dailyTime = time; out.newBest = true; }
    out.streak = save.streak.count;
  }
  return out;
}

// The streak still standing today (a missed day shows zero, no guilt copy).
export function currentStreak(save, key) {
  if (save.streak.last === key || save.streak.last === previousDay(key)) return save.streak.count;
  return 0;
}

// ---------------------------------------------------------------- paints and bests

export function metrics(save) {
  const p = save.progress;
  return {
    scans: p.scanned.length,
    treasures: p.treasures.length,
    shells: p.shells.length,
    ups: p.upgrades.length,
    heart: p.heart ? 1 : 0,
    daily: save.stats.dailyDone,
    streak: save.streak.best,
  };
}

export function paintUnlocked(save, paint) {
  if (!paint.need) return true;
  const m = metrics(save);
  return Object.entries(paint.need).every(([k, v]) => (m[k] || 0) >= v);
}

// Paints that just became available (and marks them seen).
export function newPaints(save) {
  const fresh = PAINTS.filter((p) => paintUnlocked(save, p) && !save.seenPaints.includes(p.id));
  for (const p of fresh) save.seenPaints.push(p.id);
  return fresh;
}

// A dive ended (docked or out of air). Returns the bests it beat.
export function recordDive(save, dive) {
  const beat = [];
  if (dive.maxDepth > save.bests.depth) { save.bests.depth = dive.maxDepth; if (dive.maxDepth >= 10) beat.push('depth'); }
  if (dive.scans > save.bests.diveScans) { save.bests.diveScans = dive.scans; if (dive.scans >= 2) beat.push('diveScans'); }
  save.stats.dives++;
  return beat;
}

export function areaCompletion(save) {
  return AREAS.map((a, i) => {
    const list = SPECIES.filter((s) => s.area === i);
    const got = list.filter((s) => save.progress.scanned.includes(s.id)).length;
    return { area: i, name: a.name, got, total: list.length };
  });
}

export const TOTALS = { species: SPECIES.length, treasures: TREASURES.length, shells: SHELLS.length, parts: UPGRADE_ORDER.length };
