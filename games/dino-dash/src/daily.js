// Daily Dash: the local date picks the seed, a theme and a goal distance.
// Same day, same run, for everyone on that device.
import { hashString, makeRng } from './rng.js';

export const THEMES = [
  { id: 'logjam', name: 'Log Jam', blurb: 'Logs everywhere: hop hop hop!' },
  { id: 'ptero', name: 'Ptero Parade', blurb: 'The pterodactyls are out in flocks. Roll!' },
  { id: 'geyser', name: 'Geyser Gulch', blurb: 'Steamy geysers line the path.' },
  { id: 'amber', name: 'Amber Rain', blurb: 'Extra amber on every stretch.' },
  { id: 'hedge', name: 'Hedge Maze', blurb: 'Long bramble hedges make twisty corridors.' },
  { id: 'mixed', name: 'Dino Mix', blurb: 'A bit of everything.' },
];

const pad = (n) => String(n).padStart(2, '0');

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The key for the day before `key` (handles month and year ends).
export function previousKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

export function dailyInfo(key) {
  const seed = hashString(`dino-dash:${key}`);
  const rng = makeRng(seed);
  const theme = THEMES[Math.floor(rng.next() * THEMES.length)];
  const goal = 700 + 100 * rng.int(0, 7); // 700..1400 m
  return { key, seed, theme: theme.id, themeName: theme.name, blurb: theme.blurb, goal, reward: 250 };
}
