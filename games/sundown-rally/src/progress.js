import { BASE_STATS } from './vehicle.js';
import { TRACKS } from './tracks.js';

export const SAVE_KEY = 'sundown-rally.v1';

export const UPGRADES = {
  engine: { label: 'Engine', blurb: 'Higher top speed and acceleration', costs: [60, 140, 260] },
  armor: { label: 'Armor', blurb: 'Take less damage from crashes and blasts', costs: [50, 120, 220] },
  nitro: { label: 'Nitro', blurb: 'Nitro lasts longer and pushes harder', costs: [50, 120, 220] },
  tires: { label: 'Tires', blurb: 'More grip, faster off the road', costs: [40, 100, 180] },
};

export const PAINTS = ['#e8a33a', '#d8453a', '#3f8fd6', '#5fae4c', '#f2f0e6', '#8a5bd1'];

export function defaultSave() {
  return {
    unlocked: 1,
    stars: {},
    best: {},
    coins: 0,
    upgrades: { engine: 0, armor: 0, nitro: 0, tires: 0 },
    paint: PAINTS[0],
    muted: false,
  };
}

export function loadSave(storage) {
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    const base = defaultSave();
    if (!raw) return base;
    return { ...base, ...raw, upgrades: { ...base.upgrades, ...raw.upgrades } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage, save) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function statsFor(upgrades) {
  const { engine = 0, armor = 0, nitro = 0, tires = 0 } = upgrades;
  return {
    ...BASE_STATS,
    maxSpeed: BASE_STATS.maxSpeed * (1 + 0.06 * engine),
    accel: BASE_STATS.accel * (1 + 0.1 * engine),
    armor: BASE_STATS.armor * (1 - 0.15 * armor),
    nitroBurn: BASE_STATS.nitroBurn * (1 - 0.15 * nitro),
    nitroBoost: BASE_STATS.nitroBoost + 0.05 * nitro,
    grip: BASE_STATS.grip + 0.8 * tires,
    offroadGrip: BASE_STATS.offroadGrip + 0.7 * tires,
    offroadMax: BASE_STATS.offroadMax + 0.07 * tires,
  };
}

export function upgradeCost(save, key) {
  const level = save.upgrades[key];
  return level >= UPGRADES[key].costs.length ? null : UPGRADES[key].costs[level];
}

export function buyUpgrade(save, key) {
  const cost = upgradeCost(save, key);
  if (cost === null || save.coins < cost) return false;
  save.coins -= cost;
  save.upgrades[key]++;
  return true;
}

export function starsFor(time, par) {
  if (time <= par) return 3;
  if (time <= par * 1.2) return 2;
  return 1;
}

// Coins earned for a finished race: pickups, zombies, and stars.
export function rewardFor({ coins, kills, stars }) {
  return coins + Math.floor(kills / 2) + stars * 15;
}

// Records a finished race. Returns what changed so the results screen can
// celebrate it.
export function recordFinish(save, trackIndex, { time, coins, kills }) {
  const track = TRACKS[trackIndex];
  const stars = starsFor(time, track.par);
  const earned = rewardFor({ coins, kills, stars });
  const prevBest = save.best[track.id];
  const newBest = prevBest === undefined || time < prevBest;
  save.coins += earned;
  save.stars[track.id] = Math.max(save.stars[track.id] || 0, stars);
  if (newBest) save.best[track.id] = time;
  const unlockedNext = trackIndex + 1 < TRACKS.length && save.unlocked < trackIndex + 2;
  if (unlockedNext) save.unlocked = trackIndex + 2;
  return { stars, earned, newBest, unlockedNext };
}
