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
    return cleanSave(JSON.parse(storage.getItem(SAVE_KEY)));
  } catch {
    return defaultSave();
  }
}

const isRecord = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const count = (x, lo, hi) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.floor(x))) : lo);

// Keeps whatever is usable from a stored save and repairs the rest, so an
// old or damaged save can never stop the game from starting.
export function cleanSave(raw) {
  const save = defaultSave();
  if (!isRecord(raw)) return save;
  save.unlocked = count(raw.unlocked, 1, TRACKS.length);
  save.coins = count(raw.coins, 0, Number.MAX_SAFE_INTEGER);
  for (const t of TRACKS) {
    if (isRecord(raw.stars) && Number.isFinite(raw.stars[t.id])) save.stars[t.id] = count(raw.stars[t.id], 0, 3);
    if (isRecord(raw.best) && Number.isFinite(raw.best[t.id]) && raw.best[t.id] > 0) save.best[t.id] = raw.best[t.id];
  }
  for (const [key, u] of Object.entries(UPGRADES)) {
    if (isRecord(raw.upgrades)) save.upgrades[key] = count(raw.upgrades[key], 0, u.costs.length);
  }
  if (PAINTS.includes(raw.paint)) save.paint = raw.paint;
  save.muted = raw.muted === true;
  return save;
}

// Returns false when storage is unavailable (private mode, full quota).
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
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
