// Climb mode: five islands, 32 levels. Each level fixes its animal sequence
// with a seed so every player (and the solver test) gets the same tower.
import { rng } from './rng.js';
import { ANIMAL_BY_ID, animalShape } from './animals.js';

export const ISLANDS = [
  { id: 'meadow', name: 'Meadow Isle', blurb: 'Stack your first friends', feature: 'none', colors: ['#7ed957', '#3f9b3a'], reward: ['penguin', 'frog'] },
  { id: 'bluffs', name: 'Breezy Bluffs', blurb: 'Wind pushes harder up high', feature: 'wind', colors: ['#8fd3ff', '#3a8fd9'], reward: ['owl', 'pig'] },
  { id: 'floe', name: 'Frosty Floe', blurb: 'Icy animals slip and slide', feature: 'ice', colors: ['#c9f1ff', '#6fb7e0'], reward: ['elephant', 'hedgehog'] },
  { id: 'bay', name: 'Bobbing Bay', blurb: 'Build on a rocking raft', feature: 'mover', colors: ['#ffd27a', '#d98a3a'], reward: ['croc', 'chick'] },
  { id: 'summit', name: 'Summit Isle', blurb: 'Everything at once!', feature: 'mix', colors: ['#d7a8ff', '#8a52d9'], reward: [] },
];

const BASIC = { hippo: 3, turtle: 2, giraffe: 2, panda: 1 };
const I2 = { ...BASIC, penguin: 2, frog: 1 };
const I3 = { ...I2, owl: 2, pig: 2 };
const I4 = { ...I3, elephant: 2, hedgehog: 1 };
const I5 = { ...I4, croc: 2, chick: 1 };

// goal: metres above the island; limit: animals you get; par: for the ★.
const RAW = [
  // Meadow Isle
  { i: 0, name: 'First Stack', goal: 2.5, limit: 6, par: 3, width: 6, pool: { hippo: 3, turtle: 2 } },
  { i: 0, name: 'Long Necks', goal: 3.5, limit: 7, par: 4, width: 6, pool: { hippo: 2, giraffe: 2, turtle: 1 } },
  { i: 0, name: 'Roly Poly', goal: 4, limit: 8, par: 5, width: 6, pool: { hippo: 2, turtle: 2, panda: 1, giraffe: 1 } },
  { i: 0, name: 'Narrow Ledge', goal: 4, limit: 8, par: 4, width: 4.2, pool: BASIC },
  { i: 0, name: 'Mixed Herd', goal: 5, limit: 9, par: 5, width: 5.5, pool: BASIC },
  { i: 0, name: 'Meadow Spire', goal: 6, limit: 10, par: 6, width: 5.5, pool: BASIC },
  // Breezy Bluffs
  { i: 1, name: 'First Breeze', goal: 3.5, limit: 7, par: 4, width: 6, pool: I2, wind: { strength: 0.7, gust: 0.4 } },
  { i: 1, name: 'Penguin Parade', goal: 4.5, limit: 8, par: 4, width: 5.5, pool: { ...I2, penguin: 4 }, wind: { strength: 0.9, gust: 0.5 } },
  { i: 1, name: 'Frog Hop', goal: 4.5, limit: 8, par: 5, width: 5.5, pool: { ...I2, frog: 3 }, wind: { strength: 1.0, gust: 0.6 } },
  { i: 1, name: 'Gusty Gap', goal: 5, limit: 9, par: 5, width: 5, pool: I2, wind: { strength: 1.3, gust: 0.9 } },
  { i: 1, name: 'Switching Winds', goal: 5, limit: 9, par: 5, width: 5.5, pool: I2, wind: { strength: 1.2, gust: 0.4, flip: true } },
  { i: 1, name: 'Kite Hill', goal: 6, limit: 10, par: 6, width: 5.5, pool: I2, wind: { strength: 1.4, gust: 0.6 } },
  { i: 1, name: 'Gale Tower', goal: 7, limit: 11, par: 7, width: 5.5, pool: I2, wind: { strength: 1.6, gust: 0.7, flip: true } },
  // Frosty Floe
  { i: 2, name: 'Slippery Start', goal: 3.5, limit: 7, par: 4, width: 6, pool: I3, ice: 0.3 },
  { i: 2, name: 'Owl Igloo', goal: 4.5, limit: 8, par: 4, width: 5.5, pool: { ...I3, owl: 4 }, ice: 0.35 },
  { i: 2, name: 'Piggy Slide', goal: 5, limit: 9, par: 5, width: 5.5, pool: { ...I3, pig: 4 }, ice: 0.4 },
  { i: 2, name: 'Frozen Narrows', goal: 5, limit: 9, par: 5, width: 4.4, pool: I3, ice: 0.4 },
  { i: 2, name: 'Snowdrift', goal: 6, limit: 10, par: 6, width: 5.5, pool: I3, ice: 0.5 },
  { i: 2, name: 'Ice Palace', goal: 7, limit: 11, par: 7, width: 5.5, pool: I3, ice: 0.55 },
  // Bobbing Bay
  { i: 3, name: 'Gentle Bob', goal: 3.5, limit: 7, par: 4, width: 6, pool: I4, mover: { amp: 0.5, speed: 0.45 } },
  { i: 3, name: 'Elephant Raft', goal: 4.5, limit: 8, par: 4, width: 6, pool: { ...I4, elephant: 4 }, mover: { amp: 0.6, speed: 0.5 } },
  { i: 3, name: 'Rocking Boat', goal: 5, limit: 9, par: 5, width: 6, pool: I4, mover: { amp: 0.6, speed: 0.5, rock: 0.015 } },
  { i: 3, name: 'Hedgehog Harbour', goal: 5, limit: 9, par: 5, width: 5.5, pool: { ...I4, hedgehog: 3 }, mover: { amp: 0.7, speed: 0.5 } },
  { i: 3, name: 'Choppy Water', goal: 6, limit: 10, par: 6, width: 5.5, pool: I4, mover: { amp: 0.8, speed: 0.5, rock: 0.018 } },
  { i: 3, name: 'Lighthouse Run', goal: 7, limit: 11, par: 7, width: 5.5, pool: I4, mover: { amp: 0.9, speed: 0.55, rock: 0.02 } },
  // Summit Isle
  { i: 4, name: 'Base Camp', goal: 5, limit: 9, par: 5, width: 5.5, pool: I5, wind: { strength: 0.8, gust: 0.5 } },
  { i: 4, name: 'Croc Ridge', goal: 6, limit: 10, par: 6, width: 5.5, pool: { ...I5, croc: 4 }, ice: 0.3 },
  { i: 4, name: 'Chick Ledge', goal: 6, limit: 10, par: 6, width: 5.5, pool: { ...I5, chick: 3 }, mover: { amp: 0.6, speed: 0.5 } },
  { i: 4, name: 'Windy Ice', goal: 6.5, limit: 11, par: 6, width: 5.5, pool: I5, wind: { strength: 1.1, gust: 0.5 }, ice: 0.35 },
  { i: 4, name: 'Bobbing Breeze', goal: 7, limit: 11, par: 7, width: 5.5, pool: I5, wind: { strength: 0.8, gust: 0.5 }, mover: { amp: 0.6, speed: 0.5 } },
  { i: 4, name: 'Last Ledge', goal: 7, limit: 12, par: 7, width: 4.6, pool: I5, wind: { strength: 0.8, gust: 0.4 }, ice: 0.25 },
  { i: 4, name: 'The Summit', goal: 8.5, limit: 13, par: 8, width: 5.5, pool: I5, wind: { strength: 1.0, gust: 0.6, flip: true }, ice: 0.3, mover: { amp: 0.5, speed: 0.45 } },
];

export const LEVELS = RAW.map((r, index) => ({
  index,
  island: r.i,
  number: RAW.slice(0, index).filter((q) => q.i === r.i).length + 1,
  name: r.name,
  goal: r.goal,
  limit: r.limit,
  par: r.par,
  width: r.width,
  pool: r.pool,
  wind: r.wind || null,
  ice: r.ice || 0,
  mover: r.mover || null,
  seed: 1000 + index * 7919,
}));

export const levelLabel = (i) => `${LEVELS[i].island + 1}-${LEVELS[i].number}`;
export const islandLevels = (island) => LEVELS.filter((l) => l.island === island);

const isRound = (id) => animalShape(id).type === 'circle';
const isPointy = (id) => id === 'frog' || id === 'hedgehog';

// Draw `count` animals from a weighted pool. The first is always a good
// base, round or pointy animals never come twice in a row, and the same
// animal never comes three times in a row.
export function drawSequence(pool, count, seed, { ice = 0, startIndex = 0, iceAfter = 1 } = {}) {
  const r = rng(seed);
  const entries = Object.entries(pool).filter(([id, w]) => w > 0 && ANIMAL_BY_ID[id]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    let id = null;
    for (let tries = 0; tries < 12; tries++) {
      let x = r() * total;
      id = entries[entries.length - 1][0];
      for (const [k, w] of entries) { x -= w; if (x < 0) { id = k; break; } }
      const prev = out[i - 1]?.animal, prev2 = out[i - 2]?.animal;
      const n = startIndex + i;
      if (n === 0 && (isRound(id) || isPointy(id) || id === 'penguin')) continue;
      if (prev && (isRound(prev) || isPointy(prev)) && (isRound(id) || isPointy(id))) continue;
      if (prev === id && prev2 === id) continue;
      break;
    }
    const iceRoll = r();
    out.push({ animal: id, ice: startIndex + i >= iceAfter && iceRoll < ice });
  }
  return out;
}

export function levelSequence(level) {
  return drawSequence(level.pool, level.limit, level.seed, { ice: level.ice });
}

// Animals a level can hand out (for unlock checks).
export function levelAnimals(level) {
  return Object.keys(level.pool).filter((id) => level.pool[id] > 0);
}
