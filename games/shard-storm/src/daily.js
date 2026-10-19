// The Daily Storm: one storm per local day. The seed comes from the date so
// everyone on the same day gets the same storm; clearing it (reaching the
// target score) extends the streak.
import { mulberry32 } from './math.js';
import { DAILY } from './config.js';

// Local calendar key, e.g. 20261006.
export function dateKey(d = new Date()) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// A stable integer seed for the day's storm.
export function dailySeed(d = new Date()) {
  const key = dateKey(d);
  return mulberry32(key * 2654435761 % 4294967296)() * 4294967296;
}

export function dailyTarget(d = new Date()) {
  return DAILY.target + Math.floor(mulberry32(Math.floor(dailySeed(d) / 3) + 7)() * DAILY.spread);
}

// yyyymmdd -> "MM-DD", the short form the HUD shows.
export function dailyLabel(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

// Streak: clearing today's storm today continues it; a missed day resets it.
export function nextStreak(streak, lastKey, key) {
  if (streak > 0 && lastKey === key - 1) return streak + 1;
  return 1;
}
