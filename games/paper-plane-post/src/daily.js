// The Daily Breeze: the local date names the wind, picks the valley and sets a
// distance to beat. Same day, same flight, so a household can compare.

import { hashString, makeRng } from './rng.js';
import { THEMES } from './endless.js';

const pad = (n) => String(n).padStart(2, '0');

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The key for the day before `key`; handles month and year ends. */
export function previousKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

const NAMES = [
  'Mellow Westerly', 'Morning Thermal', 'Quiet Southerly', 'Hilltop Draught',
  'Chimney Warm', 'Harbour Breath', 'Pine Whisper', 'Lakeside Drift',
  'Snowmelt Air', 'Market-Day Gust', 'Rooftop Rise', 'Evening Calm',
];

export function dailyInfo(key = dateKey()) {
  const seed = hashString(`paper-plane-post:${key}`);
  const rng = makeRng(seed);
  const theme = THEMES[Math.floor(rng.next() * THEMES.length)];
  const name = NAMES[Math.floor(rng.next() * NAMES.length)];
  const goal = 600 + 100 * rng.int(0, 9);   // 600..1500 m
  return { key, seed, theme: theme.id, themeName: theme.name, blurb: theme.blurb, name, goal };
}
