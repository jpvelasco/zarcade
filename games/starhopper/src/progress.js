import { PLAYER } from './entities.js';
import { children } from './galaxy.js';

export const SAVE_KEY = 'starhopper.v1';

export const UPGRADES = {
  cannon: { label: 'Cannons', blurb: 'Start every journey with more firepower', costs: [80, 180, 320] },
  hull: { label: 'Hull plating', blurb: 'More hull to soak up hits', costs: [60, 140, 260] },
  shield: { label: 'Deflector', blurb: 'Stronger shields that recharge sooner', costs: [60, 140, 260] },
  engine: { label: 'Engines', blurb: 'Longer boost, quicker steering', costs: [50, 120, 220] },
  missiles: { label: 'Missile rack', blurb: 'More missiles, bigger booms', costs: [50, 120, 220] },
};

export const PAINTS = ['#e8eef5', '#ff7a3a', '#4fb4ff', '#6dff9e', '#ffd54a', '#c77dff'];

// The Space Burger menu. Prices go up the farther you travel.
export const MENU = [
  { id: 'burger', icon: '🍔', name: 'Nebula Burger', blurb: 'Repairs 40 hull', price: 25 },
  { id: 'fries', icon: '🍟', name: 'Rocket Fries', blurb: '+4 missiles', price: 20 },
  { id: 'shake', icon: '🥤', name: 'Plasma Shake', blurb: 'Cannon power up', price: 30 },
  { id: 'cola', icon: '🧃', name: 'Comet Cola', blurb: 'Shield fully charged', price: 12 },
  { id: 'combo', icon: '🌟', name: 'Galactic Combo', blurb: 'All of the above!', price: 70 },
];

// Every visit comes with one free Comet Cola, so even a new pilot who has
// barely any stardust leaves the drive-thru with a treat.
export const FREE_ITEM = 'cola';

export const menuPrice = (item, depth, { freebie = false } = {}) =>
  freebie && item.id === FREE_ITEM ? 0 : Math.round(item.price * (1 + 0.15 * Math.max(0, depth - 1)));

export function defaultSave() {
  return {
    cleared: {},          // planet id -> best stars
    stardust: 0,
    upgrades: { cannon: 0, hull: 0, shield: 0, engine: 0, missiles: 0 },
    paint: PAINTS[0],
    view: 'cockpit',
    muted: false,
    selected: null,
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
// old or damaged save can never stop the game from starting. A visited
// planet only counts if it is a real planet whose parent was visited too.
export function cleanSave(raw) {
  const save = defaultSave();
  if (!isRecord(raw)) return save;
  if (isRecord(raw.cleared)) {
    const ids = Object.keys(raw.cleared).filter((id) => /^H(\.\d+)+$/.test(id) && Number.isFinite(raw.cleared[id]));
    ids.sort((a, b) => a.split('.').length - b.split('.').length);
    for (const id of ids) {
      const parent = id.slice(0, id.lastIndexOf('.'));
      if ((parent === 'H' || parent in save.cleared) && children(parent).includes(id)) save.cleared[id] = count(raw.cleared[id], 1, 3);
    }
  }
  save.stardust = count(raw.stardust, 0, Number.MAX_SAFE_INTEGER);
  for (const [key, u] of Object.entries(UPGRADES)) {
    if (isRecord(raw.upgrades)) save.upgrades[key] = count(raw.upgrades[key], 0, u.costs.length);
  }
  if (PAINTS.includes(raw.paint)) save.paint = raw.paint;
  if (raw.view === 'chase') save.view = 'chase';
  save.muted = raw.muted === true;
  if (typeof raw.selected === 'string') save.selected = raw.selected;
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

export function statsFor(upgrades = {}) {
  const { cannon = 0, hull = 0, shield = 0, engine = 0, missiles = 0 } = upgrades;
  return {
    hull: PLAYER.hull + 25 * hull,
    shield: PLAYER.shield + 15 * shield,
    shieldRegen: PLAYER.shieldRegen + 4 * shield,
    shieldDelay: PLAYER.shieldDelay - 0.3 * shield,
    cruise: PLAYER.cruise,
    boost: PLAYER.boost + 10 * engine,
    boostBurn: 0.35 - 0.06 * engine,
    lateral: PLAYER.lateral + 3 * engine,
    cannonStart: 1 + Math.floor(cannon * 0.67),
    cannonDamage: 0.5 + 0.1 * cannon,
    missiles: 3 + 2 * missiles,
    missileDamage: PLAYER.missileDamage + 4 * missiles,
  };
}

export function upgradeCost(save, key) {
  const level = save.upgrades[key];
  return level >= UPGRADES[key].costs.length ? null : UPGRADES[key].costs[level];
}

export function buyUpgrade(save, key) {
  const cost = upgradeCost(save, key);
  if (cost === null || save.stardust < cost) return false;
  save.stardust -= cost;
  save.upgrades[key]++;
  return true;
}

// 1 star for arriving, 2 for also clearing half the enemies, 3 for also
// arriving with 60% hull.
export function starsFor({ kills, spawned, hull, maxHull }) {
  let stars = 1;
  if (kills >= spawned * 0.5) {
    stars = 2;
    if (hull >= maxHull * 0.6) stars = 3;
  }
  return stars;
}

export const rewardFor = ({ dust, stars, depth }) => dust + stars * 15 + depth * 10;

export function recordArrival(save, planet, result) {
  const stars = starsFor(result);
  const earned = rewardFor({ dust: result.dust, stars, depth: planet.depth });
  const firstTime = !(planet.id in save.cleared);
  save.stardust += earned;
  save.cleared[planet.id] = Math.max(save.cleared[planet.id] || 0, stars);
  return { stars, earned, firstTime, revealed: firstTime ? children(planet.id) : [] };
}
