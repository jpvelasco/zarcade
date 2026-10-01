// Seasonal festivals: which one is today, whether it is running, and the
// egg hunt layout. DOM-free.
import { FESTIVALS, FESTIVAL_IDS } from './data.js';
import { dateOf } from './time.js';
import { rngFor } from './rng.js';
import { TOWN, idx } from './map.js';

export function festivalOn(dayIndex) {
  const { season, day } = dateOf(dayIndex);
  return FESTIVAL_IDS.find((id) => FESTIVALS[id].season === season && FESTIVALS[id].day === day) || null;
}

export function festivalRunning(id, minute) {
  if (!id) return false;
  const f = FESTIVALS[id];
  return minute >= f.start && minute < f.end;
}

export function newFestivalState(id) {
  return id ? { id, progress: 0, done: false, lit: [], eggs: 0, fish: 0, result: null } : null;
}

// Egg spots: walkable tiles across town, spread out and seeded.
export function eggSpots(seed, dayIndex, walkable, n) {
  const rand = rngFor(seed, dayIndex, 'eggs');
  const spots = [];
  const taken = new Set();
  let guard = 0;
  while (spots.length < n && guard++ < 5000) {
    const x = TOWN.x0 + 1 + Math.floor(rand() * (TOWN.x1 - TOWN.x0 - 1));
    const y = TOWN.y0 + 1 + Math.floor(rand() * (TOWN.y1 - TOWN.y0 - 1));
    if (!walkable(x, y) || taken.has(idx(x, y))) continue;
    if (spots.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) < 4)) continue;
    taken.add(idx(x, y));
    spots.push([x, y]);
  }
  return spots;
}
