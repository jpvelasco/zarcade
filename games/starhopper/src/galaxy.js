import { rng } from './math.js';
import { BIOME_KEYS } from './biomes.js';

// An endless galaxy. Planet ids are paths from Home Port ("H", "H.0",
// "H.0.2", ...), so any planet can be regenerated from its id alone.
export const HOME = 'H';

const SYLLABLES = ['ka', 'zor', 'vel', 'ny', 'tri', 'ox', 'qua', 'li', 'mar', 'sol', 'the', 'ion', 'bri', 'rho', 'ze', 'cy', 'dra', 'lum', 'no', 'va', 'pix', 'ul', 'fen', 'gor'];
const SUFFIXES = ['', '', '', ' Prime', ' Minor', ' IV', ' VII', ' b', ' Major', ' IX'];
// The first ring is fixed so every player starts with a gentle choice.
const FIRST_RING = ['jungle', 'ice', 'lava'];

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function depthOf(id) {
  return id.split('.').length - 1;
}

export function parentOf(id) {
  const i = id.lastIndexOf('.');
  return i < 0 ? null : id.slice(0, i);
}

function makeName(r) {
  const n = 2 + (r() < 0.35 ? 1 : 0);
  let name = '';
  for (let i = 0; i < n; i++) name += SYLLABLES[Math.floor(r() * SYLLABLES.length)];
  return name[0].toUpperCase() + name.slice(1) + SUFFIXES[Math.floor(r() * SUFFIXES.length)];
}

export function planet(id) {
  if (id === HOME) return { id, name: 'Home Port', biome: 'home', depth: 0, seed: 1, parent: null };
  const seed = hashString(id);
  const r = rng(seed);
  const depth = depthOf(id);
  const index = Number(id.slice(id.lastIndexOf('.') + 1));
  let biome;
  if (depth === 1) biome = FIRST_RING[index % FIRST_RING.length];
  else {
    // Spooky ghost worlds only show up once you've traveled a bit.
    const pool = depth < 3 ? BIOME_KEYS.filter((b) => b !== 'ghost') : BIOME_KEYS;
    biome = pool[Math.floor(r() * pool.length)];
  }
  return { id, name: makeName(r), biome, depth, seed, parent: parentOf(id) };
}

export function children(id) {
  const r = rng(hashString(id) ^ 0x5bd1e995);
  const n = id === HOME ? 3 : 2 + (r() < 0.45 ? 1 : 0);
  return Array.from({ length: n }, (_, i) => `${id}.${i}`);
}

// Planets the player can see on the map: Home, everything cleared, and the
// children of cleared planets (the frontier).
export function visiblePlanets(cleared) {
  const ids = new Set([HOME]);
  const done = new Set([HOME, ...Object.keys(cleared)]);
  for (const id of done) {
    ids.add(id);
    for (const c of children(id)) ids.add(c);
  }
  // Only keep planets whose whole ancestry is visible.
  return [...ids].filter((id) => {
    for (let p = parentOf(id); p; p = parentOf(p)) if (!done.has(p)) return false;
    return true;
  });
}

export function isReachable(id, cleared) {
  const p = parentOf(id);
  return id !== HOME && (p === HOME || p in cleared);
}
