// The save: trophies, best laps, medals, ghosts, the daily streak, the cup
// in progress and settings, under one namespaced key. Every field is read
// defensively so one damaged value never breaks the load or shows NaN.
import { CUPS, TRACKS, TRACK_IDS } from './tracks.js';
import { KARTS, RACERS } from './karts.js';
import { CLASSES } from './ai.js';
import { isDateKey } from './daily.js';
import { decodeGhost } from './ghost.js';

export const SAVE_KEY = 'pocket-kart.v1';
export const CLASS_IDS = CLASSES.map((c) => c.id);
const CAMERAS = ['follow', 'fixed'];

export function defaultSave() {
  return {
    racer: 'bun',
    kart: 'buggy',
    classId: 'cosy',
    trophies: {}, // "cupId:classId" -> 1 bronze, 2 silver, 3 gold
    cupsFinished: {}, // cupId -> true once finished in any place
    best: {}, // trackId -> { lap, race } in seconds
    medals: {}, // trackId -> 1..3
    ghosts: {}, // trackId -> encoded ghost of the best time-trial lap
    daily: { day: '', best: null, ghost: null, medal: 0, streak: 0, bestStreak: 0, lastDay: '', plays: 0 },
    gp: null, // the cup in progress
    settings: { muted: false, music: true, camera: 'follow', easyDrift: true, autoGo: true },
    stats: { races: 0, wins: 0, turbos: 0 },
    announced: [], // unlock ids already celebrated
    tips: { drift: false },
  };
}

const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const time = (v) => (Number.isFinite(v) && v > 1 && v < 3600 ? Math.round(v * 1000) / 1000 : null);
const count = (v, max = 1e7) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
const tier = (v) => (Number.isInteger(v) && v >= 1 && v <= 3 ? v : 0);
const ghost = (v) => (typeof v === 'string' && decodeGhost(v) ? v : null);

export function sanitize(data) {
  const save = defaultSave();
  if (!obj(data)) return save;
  if (RACERS.some((r) => r.id === data.racer)) save.racer = data.racer;
  if (KARTS.some((k) => k.id === data.kart)) save.kart = data.kart;
  if (CLASS_IDS.includes(data.classId)) save.classId = data.classId;
  if (obj(data.trophies)) {
    for (const c of CUPS) for (const cl of CLASS_IDS) {
      const t = tier(data.trophies[`${c.id}:${cl}`]);
      if (t) save.trophies[`${c.id}:${cl}`] = t;
    }
  }
  if (obj(data.cupsFinished)) for (const c of CUPS) if (data.cupsFinished[c.id] === true) save.cupsFinished[c.id] = true;
  if (obj(data.best)) {
    for (const id of TRACK_IDS) {
      const b = data.best[id];
      if (!obj(b)) continue;
      const lap = time(b.lap), race = time(b.race);
      if (lap || race) save.best[id] = { lap, race };
    }
  }
  if (obj(data.medals)) for (const id of TRACK_IDS) { const m = tier(data.medals[id]); if (m) save.medals[id] = m; }
  if (obj(data.ghosts)) for (const id of TRACK_IDS) { const g = ghost(data.ghosts[id]); if (g) save.ghosts[id] = g; }
  if (obj(data.daily)) {
    const d = data.daily, out = save.daily;
    if (isDateKey(d.day)) {
      out.day = d.day;
      out.best = time(d.best);
      out.ghost = ghost(d.ghost);
      out.medal = tier(d.medal);
    }
    out.streak = count(d.streak, 100000);
    out.bestStreak = Math.max(out.streak, count(d.bestStreak, 100000));
    out.lastDay = isDateKey(d.lastDay) ? d.lastDay : '';
    out.plays = count(d.plays, 100000);
  }
  save.gp = sanitizeGp(data.gp);
  if (obj(data.settings)) {
    const s = data.settings;
    if (typeof s.muted === 'boolean') save.settings.muted = s.muted;
    if (typeof s.music === 'boolean') save.settings.music = s.music;
    if (CAMERAS.includes(s.camera)) save.settings.camera = s.camera;
    if (typeof s.easyDrift === 'boolean') save.settings.easyDrift = s.easyDrift;
    if (typeof s.autoGo === 'boolean') save.settings.autoGo = s.autoGo;
  }
  if (obj(data.stats)) for (const k of Object.keys(save.stats)) save.stats[k] = count(data.stats[k]);
  if (Array.isArray(data.announced)) save.announced = [...new Set(data.announced.filter((x) => typeof x === 'string' && x.length < 40))].slice(0, 64);
  if (obj(data.tips)) save.tips.drift = data.tips.drift === true;
  // A pick that isn't unlocked (yet) falls back to a starter.
  if (!isKartUnlocked(save, KARTS.find((k) => k.id === save.kart))) save.kart = 'buggy';
  if (!isRacerUnlocked(save, RACERS.find((r) => r.id === save.racer))) save.racer = 'bun';
  return save;
}

// A cup in progress: which cup and class, the next race, the six entrants
// (player first) and their points so far.
function sanitizeGp(gp) {
  if (!obj(gp)) return null;
  const cup = Number.isInteger(gp.cup) && gp.cup >= 0 && gp.cup < CUPS.length ? gp.cup : -1;
  if (cup < 0 || !CLASS_IDS.includes(gp.classId)) return null;
  const race = Number.isInteger(gp.race) && gp.race >= 0 && gp.race < 4 ? gp.race : -1;
  if (race < 0) return null;
  const racers = Array.isArray(gp.racers) ? gp.racers : [];
  if (racers.length !== 6 || new Set(racers).size !== 6 || !racers.every((id) => RACERS.some((r) => r.id === id))) return null;
  const karts = Array.isArray(gp.karts) && gp.karts.length === 6 && gp.karts.every((id) => KARTS.some((k) => k.id === id)) ? gp.karts : null;
  if (!karts) return null;
  const points = Array.isArray(gp.points) && gp.points.length === 6 ? gp.points.map((p) => count(p, 40)) : null;
  if (!points) return null;
  const places = Array.isArray(gp.places) ? gp.places.filter((p) => Number.isInteger(p) && p >= 1 && p <= 6).slice(0, 4) : [];
  return { cup, classId: gp.classId, race, racers, karts, points, places: places.length === race ? places : places.slice(0, race) };
}

export function loadSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

// False when storage is blocked or full: play on without saving.
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ progress rules

export const trophyForPlace = (place) => (place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0);
export const TROPHY_NAMES = ['', 'Bronze', 'Silver', 'Gold'];

export function isCupOpen(save, c) {
  return c === 0 || !!save.cupsFinished[CUPS[c - 1]?.id];
}

// Records a finished cup the moment the last race is decided. Trophies only
// ever improve.
export function recordCup(save, c, classId, place) {
  const key = `${CUPS[c].id}:${classId}`;
  const before = save.trophies[key] || 0;
  const t = trophyForPlace(place);
  if (t > before) save.trophies[key] = t;
  const firstFinish = !save.cupsFinished[CUPS[c].id];
  save.cupsFinished[CUPS[c].id] = true;
  return { trophy: t, improved: t > before, firstFinish, opened: firstFinish && c + 1 < CUPS.length ? CUPS[c + 1] : null };
}

export function bestTrophy(save, c) {
  let best = 0;
  for (const cl of CLASS_IDS) best = Math.max(best, save.trophies[`${CUPS[c].id}:${cl}`] || 0);
  return best;
}

export function goldCups(save) {
  return CUPS.filter((_, c) => bestTrophy(save, c) === 3).length;
}

export function totalMedals(save) {
  return Object.values(save.medals).filter((m) => m > 0).length;
}

export function isKartUnlocked(save, kart) {
  const u = kart.unlock;
  if (!u) return true;
  if (u.cup !== undefined) return bestTrophy(save, u.cup) > 0;
  if (u.gold !== undefined) return goldCups(save) >= u.gold;
  return false;
}

export function isRacerUnlocked(save, racer) {
  const u = racer.unlock;
  if (!u) return true;
  if (u.medals !== undefined) return totalMedals(save) >= u.medals;
  if (u.dailies !== undefined) return save.daily.plays >= u.dailies;
  return false;
}

export function unlockHint(item) {
  const u = item.unlock;
  if (!u) return '';
  if (u.cup !== undefined) return `Win a trophy in the ${CUPS[u.cup].name}`;
  if (u.gold !== undefined) return `Win gold in all ${u.gold} cups`;
  if (u.medals !== undefined) return `Earn ${u.medals} time trial medals`;
  if (u.dailies !== undefined) return `Race ${u.dailies} Daily Dashes`;
  return '';
}

// Ids of everything unlocked now that has not been celebrated yet. Marks
// them as celebrated.
export function claimUnlocks(save) {
  const fresh = [];
  for (const k of KARTS) if (k.unlock && isKartUnlocked(save, k) && !save.announced.includes(`kart:${k.id}`)) fresh.push(`kart:${k.id}`);
  for (const r of RACERS) if (r.unlock && isRacerUnlocked(save, r) && !save.announced.includes(`racer:${r.id}`)) fresh.push(`racer:${r.id}`);
  for (let c = 1; c < CUPS.length; c++) if (isCupOpen(save, c) && !save.announced.includes(`cup:${CUPS[c].id}`)) fresh.push(`cup:${CUPS[c].id}`);
  save.announced.push(...fresh);
  return fresh;
}

// A time-trial (or race) result for a track. Returns what improved.
export function recordTrackTimes(save, trackId, { lap = null, race = null, ghost: g = null } = {}) {
  const prev = save.best[trackId] || { lap: null, race: null };
  const next = { ...prev };
  const lapBest = Number.isFinite(lap) && (prev.lap === null || lap < prev.lap);
  const raceBest = Number.isFinite(race) && (prev.race === null || race < prev.race);
  if (lapBest) next.lap = Math.round(lap * 1000) / 1000;
  if (raceBest) next.race = Math.round(race * 1000) / 1000;
  if (lapBest || raceBest) save.best[trackId] = next;
  if (lapBest && g) save.ghosts[trackId] = g;
  return { lapBest, raceBest, firstTime: prev.lap === null && prev.race === null };
}

export function recordMedal(save, trackId, medal) {
  const before = save.medals[trackId] || 0;
  if (medal > before) save.medals[trackId] = medal;
  return medal > before;
}

export const trackIndex = (id) => TRACKS.findIndex((t) => t.id === id);
