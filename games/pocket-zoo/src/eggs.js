// Egg rolls: rarity weights, a new-species bias and pity counters so every
// biome's collection can always be finished.
import { BIOMES, RARITIES, RARITY, animalsOf, PITY_RARE, PITY_LEGEND } from './data.js';
import { hashString } from './rng.js';

export const DAILY_WEIGHTS = [0, 60, 30, 10];
export const NEW_BIAS = 3;

export function rarityWeights(state, b, { daily = false } = {}) {
  const p = state.pity[b];
  if (p.legend >= PITY_LEGEND - 1 && !ownsLegendary(state, b)) return [0, 0, 0, 1];
  if (p.rare >= PITY_RARE - 1) return [0, 0, 80, 20];
  return daily ? DAILY_WEIGHTS.slice() : RARITIES.map((r) => RARITY[r].weight);
}

function ownsLegendary(state, b) {
  return animalsOf(BIOMES[b].id).some((a) => a.rarity === 'legendary' && state.animals[a.id]);
}

// Roll one animal from biome b. Updates pity counters; the caller adds the
// animal to the collection.
export function rollEgg(state, b, rng, opts = {}) {
  const ri = rng.weighted(rarityWeights(state, b, opts));
  const rarity = RARITIES[ri];
  const pool = animalsOf(BIOMES[b].id).filter((a) => a.rarity === rarity);
  const weights = pool.map((a) => (state.animals[a.id] ? 1 : NEW_BIAS));
  const animal = pool[rng.weighted(weights)];
  const p = state.pity[b];
  p.rare = ri >= 2 ? 0 : p.rare + 1;
  p.legend = ri === 3 ? 0 : p.legend + 1;
  return animal;
}

// Local calendar day as YYYY-MM-DD.
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export const dailySeed = (key) => hashString(`pocket-zoo:${key}`);

// The day's featured biome among the unlocked ones.
export const dailyBiome = (key, unlocked) => dailySeed(key) % Math.max(1, unlocked);

export function dailyAvailable(state, key) {
  return state.daily.last !== key;
}

// Streak after claiming today: consecutive days grow it, a gap restarts at 1.
export function nextStreak(daily, key) {
  if (!daily.last) return 1;
  const gap = dayNumber(key) - dayNumber(daily.last);
  if (gap === 1) return daily.streak + 1;
  if (gap === 0) return daily.streak;
  return 1;
}
