// Daily Delivery: one of the authored routes, mirrored, chosen by the local
// date — same day, same panel for everyone — plus a gentle streak counter.
//
// Mirroring is exact (see `mirrorLevel`), so the route keeps its par and its
// verified line without re-solving anything, and an old favourite still reads
// as a fresh puzzle from the other side.
import { LEVELS_PER_WORLD, LEVEL_COUNT } from './config.js';
import { LEVELS, mirrorLevel } from './levels.js';

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

// Which route, and which way round, today's delivery is. World 1 is the
// tutorial, so the Daily draws from worlds 2-5: 24 routes x 4 mirrorings.
export function dailyPick(date = new Date()) {
  const seed = fold(dateSeed(date));
  const first = LEVELS_PER_WORLD;
  const index = first + ((seed >>> 7) % (LEVEL_COUNT - first));
  const flip = (seed >>> 3) & 3;
  return { index, flipX: !!(flip & 1), flipY: !!(flip & 2) };
}

// Build today's (or a given date's) panel.
export function dailyLevel(date = new Date()) {
  const { index, flipX, flipY } = dailyPick(date);
  const base = LEVELS[index];
  return {
    ...mirrorLevel(base, flipX, flipY),
    index,
    name: `Daily ${dateKey(date)}`,
    par: base.par,
    solved: true,
    flipX,
    flipY,
  };
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
