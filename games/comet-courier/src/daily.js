// Daily Delivery: a date-seeded panel (same local date = same layout) plus a
// gentle streak counter. The level is a cup world built from a date seed and
// verified by the solver, so it is always solvable; its par comes from that
// solve.
import { LEVELS_PER_WORLD } from './config.js';
import { buildLevelFor } from './levels.js';
import { solve } from './solver.js';

// The local calendar date as a stable integer seed. Uses the local Y/M/D so
// every player sees the same daily on the same local day.
export function dateSeed(d = new Date()) {
  return ((d.getFullYear() - 2000) * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) >>> 0;
}

// A y-m-d string for the local date, used to remember which dailies were done.
export function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Fold the date seed into an uncorrelated panel seed.
function fold(seed) {
  return (((seed * 2654435761) ^ 0x9e3779b9) >>> 0) & 0x7fffffff;
}

// Build today's (or a given date's) panel and solve it. The world and position
// are derived from the date so each day differs, but the difficulty is always
// a cup world.
export function dailyLevel(date = new Date()) {
  const seed = fold(dateSeed(date));
  const world = 1 + (dateSeed(date) % 4); // cup worlds only (1..4)
  const posInWorld = (seed >> 4) % LEVELS_PER_WORLD;
  const def = buildLevelFor(seed, world, posInWorld);
  const res = solve(def, def.spawn);
  const index = world * LEVELS_PER_WORLD + posInWorld;
  return { ...def, index, name: `Daily ${dateKey(date)}`, par: res ? res.par : 3, line: res ? res.line : null, solved: !!res };
}

// Streak = how many consecutive days (ending today or yesterday) had a
// delivery recorded. A streak tolerates today not yet being done, so the
// counter does not read as broken the moment the day starts.
export function streakOf(daily = {}, date = new Date()) {
  const isToday = !!daily[dateKey(date)];
  let streak = 0;
  const cursor = new Date(date);
  if (!daily[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (daily[dateKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  // Best streak across the whole history: a run ends on a done day, so count
  // backward from each done day, once each (cheap: days × run length).
  let best = streak;
  const doneDays = Object.keys(daily).filter((k) => daily[k]);
  for (const k of doneDays) {
    const cur = new Date(k + 'T12:00:00'); // noon: local date, no UTC drift
    let s = 0;
    while (daily[dateKey(cur)]) {
      s++;
      cur.setDate(cur.getDate() - 1);
    }
    if (s > best) best = s;
  }
  return { streak, best, isToday };
}

// Record today's delivery and return the fresh streak for the UI to celebrate.
export function recordDaily(save, date = new Date()) {
  if (!save.daily || typeof save.daily !== 'object') save.daily = {};
  const today = dateKey(date);
  const first = !save.daily[today];
  save.daily[today] = true;
  return { streak: streakOf(save.daily, date).streak, first };
}
