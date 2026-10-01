import { CARS, CAR_BY_ID, UPGRADES } from './cars.js';
import { CUPS } from './championship.js';
import { wrapAngle } from './math.js';

// Save data: coins, cars, upgrades, liveries, stars, best times, settings.
// Storage can throw (private mode, blocked cookies), so every access is
// wrapped and the game plays on without saving.

export const SAVE_KEY = 'globe-gp.v1';
export const GHOST_PREFIX = 'globe-gp.v1.ghost.';
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
    owned: ['kart', 'hatch'],
    car: 'hatch',
    liveries: {},        // carId -> color index
    upgrades: {},        // carId -> { engine, grip, boost }
    cupStars: {},        // cupId -> best stars (1-3)
    cupBest: {},         // cupId -> best place
    cup: null,           // championship in progress
    best: {},            // `${trackId}:${kind}` -> best race time
    bestLap: {},         // trackId -> best time-trial lap
    medals: {},          // trackId -> 'gold' | 'silver' | 'bronze'
    wins: 0,
    races: 0,
    difficulty: 'easy',
    muted: false,
    music: true,
    touchSteer: 'buttons', // buttons | tilt
    autoAccel: true,
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Merges whatever was stored onto the defaults, dropping anything invalid.
export function sanitize(raw) {
  const s = defaultSave();
  if (!isObj(raw)) return s;
  if (Number.isFinite(raw.coins) && raw.coins >= 0) s.coins = Math.floor(raw.coins);
  if (Array.isArray(raw.owned)) s.owned = [...new Set(['kart', 'hatch', ...raw.owned.filter((id) => CAR_BY_ID[id])])];
  if (CAR_BY_ID[raw.car] && s.owned.includes(raw.car)) s.car = raw.car;
  if (isObj(raw.liveries)) for (const [id, i] of Object.entries(raw.liveries)) if (CAR_BY_ID[id] && Number.isInteger(i) && i >= 0 && i < CAR_BY_ID[id].colors.length) s.liveries[id] = i;
  if (isObj(raw.upgrades)) {
    for (const [id, u] of Object.entries(raw.upgrades)) {
      if (!CAR_BY_ID[id] || !isObj(u)) continue;
      s.upgrades[id] = {};
      for (const key of Object.keys(UPGRADES)) {
        const lvl = u[key];
        if (Number.isInteger(lvl) && lvl >= 0 && lvl <= UPGRADES[key].costs.length) s.upgrades[id][key] = lvl;
      }
    }
  }
  const cupIds = new Set(CUPS.map((c) => c.id));
  if (isObj(raw.cupStars)) for (const [id, n] of Object.entries(raw.cupStars)) if (cupIds.has(id) && Number.isInteger(n) && n >= 0 && n <= 3) s.cupStars[id] = n;
  if (isObj(raw.cupBest)) for (const [id, n] of Object.entries(raw.cupBest)) if (cupIds.has(id) && Number.isInteger(n) && n >= 1) s.cupBest[id] = n;
  if (isObj(raw.cup) && cupIds.has(raw.cup.cupId) && Number.isInteger(raw.cup.round) && isObj(raw.cup.points) && isObj(raw.cup.places)) s.cup = raw.cup;
  for (const key of ['best', 'bestLap']) {
    if (isObj(raw[key])) for (const [k, t] of Object.entries(raw[key])) if (Number.isFinite(t) && t > 0) s[key][k] = t;
  }
  if (isObj(raw.medals)) for (const [k, m] of Object.entries(raw.medals)) if (['gold', 'silver', 'bronze'].includes(m)) s.medals[k] = m;
  for (const key of ['wins', 'races']) if (Number.isInteger(raw[key]) && raw[key] >= 0) s[key] = raw[key];
  if (DIFFICULTIES.includes(raw.difficulty)) s.difficulty = raw.difficulty;
  for (const key of ['muted', 'music', 'autoAccel']) if (typeof raw[key] === 'boolean') s[key] = raw[key];
  if (['buttons', 'tilt'].includes(raw.touchSteer)) s.touchSteer = raw.touchSteer;
  return s;
}

export function loadSave(storage) {
  try {
    const text = storage && storage.getItem(SAVE_KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- stars, cars

export function totalStars(save) {
  const cup = Object.values(save.cupStars).reduce((a, b) => a + b, 0);
  const golds = Object.values(save.medals).filter((m) => m === 'gold').length;
  return cup + golds;
}

export function cupUnlocked(save, cup) {
  return totalStars(save) >= cup.needStars;
}

export function carStatus(save, carId) {
  const car = CAR_BY_ID[carId];
  const owned = save.owned.includes(carId);
  const starsOk = totalStars(save) >= car.stars;
  return { owned, starsOk, canBuy: !owned && starsOk && save.coins >= car.price, price: car.price, needStars: car.stars };
}

export function buyCar(save, carId) {
  const st = carStatus(save, carId);
  if (!st.canBuy) return false;
  save.coins -= st.price;
  save.owned.push(carId);
  save.car = carId;
  return true;
}

export function upgradesFor(save, carId) {
  return { engine: 0, grip: 0, boost: 0, ...(save.upgrades[carId] || {}) };
}

export function upgradeCost(save, carId, key) {
  const lvl = upgradesFor(save, carId)[key];
  return UPGRADES[key].costs[lvl] ?? null;
}

export function buyUpgrade(save, carId, key) {
  const cost = upgradeCost(save, carId, key);
  if (cost === null || save.coins < cost || !save.owned.includes(carId)) return false;
  save.coins -= cost;
  save.upgrades[carId] = { ...upgradesFor(save, carId), [key]: upgradesFor(save, carId)[key] + 1 };
  return true;
}

export function liveryFor(save, carId) {
  const car = CAR_BY_ID[carId];
  return { color: car.colors[save.liveries[carId] || 0], accent: '#ffffff' };
}

// ---------------------------------------------------------------- results

// Records one finished race. Returns what changed for the results screen.
export function recordRace(save, { trackId, kind, place, time, coins = 0, earned = 0 }) {
  save.races++;
  if (place === 1) save.wins++;
  const key = `${trackId}:${kind}`;
  const newBest = Number.isFinite(time) && kind !== 'elimination' && (!save.best[key] || time < save.best[key]);
  if (newBest) save.best[key] = time;
  save.coins += coins + earned;
  return { newBest, coins: coins + earned };
}

const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };
export function medalFor(lap, medals) {
  if (!Number.isFinite(lap)) return null;
  if (lap <= medals.gold) return 'gold';
  if (lap <= medals.silver) return 'silver';
  if (lap <= medals.bronze) return 'bronze';
  return null;
}

export function recordTimeTrial(save, trackId, bestLap, medal) {
  const newBest = Number.isFinite(bestLap) && (!save.bestLap[trackId] || bestLap < save.bestLap[trackId]);
  if (newBest) save.bestLap[trackId] = bestLap;
  const had = save.medals[trackId];
  const better = medal && (!had || MEDAL_RANK[medal] > MEDAL_RANK[had]);
  if (better) save.medals[trackId] = medal;
  const earned = better ? { gold: 80, silver: 50, bronze: 30 }[medal] : 10;
  save.coins += earned;
  return { newBest, newMedal: better ? medal : null, earned };
}

export function recordCup(save, cupId, place) {
  const stars = place >= 1 && place <= 3 ? 4 - place : 0;
  const prev = save.cupStars[cupId] || 0;
  if (stars > prev) save.cupStars[cupId] = stars;
  if (!save.cupBest[cupId] || place < save.cupBest[cupId]) save.cupBest[cupId] = place;
  const bonus = [150, 100, 60][place - 1] || 20;
  save.coins += bonus;
  return { stars, newStars: Math.max(0, stars - prev), bonus };
}

// ---------------------------------------------------------------- ghosts

// Ghost frames [x, y, z, heading, ...] packed as Int16 and base64'd so a lap
// fits in a few kilobytes of storage.
const SCALE = [8, 50, 8, 32767 / Math.PI];

export function encodeGhost(frames, lap) {
  const ints = new Int16Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    const k = i % 4;
    const v = k === 3 ? wrapAngle(frames[i]) : frames[i];
    ints[i] = Math.max(-32767, Math.min(32767, Math.round(v * SCALE[k])));
  }
  const bytes = new Uint8Array(ints.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return JSON.stringify({ lap, data: btoa(bin) });
}

export function decodeGhost(text) {
  try {
    const { lap, data } = JSON.parse(text);
    if (!Number.isFinite(lap) || typeof data !== 'string') return null;
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ints = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const frames = new Float32Array(ints.length - (ints.length % 4));
    for (let i = 0; i < frames.length; i++) frames[i] = ints[i] / SCALE[i % 4];
    return { lap, frames };
  } catch {
    return null;
  }
}

export function loadGhost(storage, trackId) {
  try {
    const text = storage.getItem(GHOST_PREFIX + trackId);
    return text ? decodeGhost(text) : null;
  } catch {
    return null;
  }
}

export function saveGhost(storage, trackId, ghost) {
  try {
    storage.setItem(GHOST_PREFIX + trackId, encodeGhost(ghost.frames, ghost.lap));
    return true;
  } catch {
    return false;
  }
}

export { CARS };
