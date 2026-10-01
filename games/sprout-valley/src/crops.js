// Crop rules: planting, nightly growth, harvests and seasonal withering.
// A crop is { id, age, harvests, dead }: `age` counts watered nights.
import { CROPS } from './data.js';

export const STAGES = 4; // seedling, sprout, leafy, budding; then ripe

export function canPlant(cropId, season, greenhouse = false) {
  const c = CROPS[cropId];
  return !!c && (greenhouse || c.seasons.includes(season));
}

export function plant(cropId) {
  return { id: cropId, age: 0, harvests: 0, dead: false };
}

export const isRipe = (crop) => !!crop && !crop.dead && crop.age >= CROPS[crop.id].days;

// 0..STAGES-1 while growing, STAGES when ripe.
export function stageOf(crop) {
  const c = CROPS[crop.id];
  if (crop.age >= c.days) return STAGES;
  if (crop.harvests > 0) return STAGES - 1; // regrowing plants stay leafy
  return Math.min(STAGES - 1, Math.floor((crop.age / c.days) * STAGES));
}

// One night passes. Watered (or greenhouse) crops grow a day.
export function growNight(crop, watered, greenhouse = false) {
  if (!crop || crop.dead) return crop;
  if ((watered || greenhouse) && crop.age < CROPS[crop.id].days) crop.age++;
  return crop;
}

// At dawn: crops out of season wither (never in the greenhouse).
export function checkSeason(crop, season, greenhouse = false) {
  if (!crop || crop.dead || greenhouse) return crop;
  if (!CROPS[crop.id].seasons.includes(season)) crop.dead = true;
  return crop;
}

// Harvest a ripe crop. Returns { item, n, keep } where `keep` says whether
// the plant stays in the ground to regrow.
export function harvest(crop) {
  if (!isRipe(crop)) return null;
  const c = CROPS[crop.id];
  crop.harvests++;
  if (c.regrow) {
    crop.age = c.days - c.regrow;
    return { item: crop.id, n: c.yield || 1, keep: true };
  }
  return { item: crop.id, n: c.yield || 1, keep: false };
}

// Days until ripe if watered every night (0 when ripe).
export const daysLeft = (crop) => Math.max(0, CROPS[crop.id].days - crop.age);
