// The Daily Critter: a seeded, mirror-symmetric pixel creature for each
// local date, regenerated until the line solver proves it unique. DOM-free.
import { buildPuzzle } from './puzzle.js';
import { solve } from './solver.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Whole days between two YYYY-MM-DD keys (b - a).
export function dayDiff(a, b) {
  const t = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86400000);
}

const BODIES = ['#7bc96f', '#f39a3d', '#9a6ad6', '#4a8fe0', '#e8504f', '#f59ac0', '#3fb3b5', '#f7c843', '#a56b43', '#6c7bd9'];
const SPOTS = ['#fff3d6', '#2d4f9c', '#f7d14c', '#ffffff', '#d4529a', '#2f8a4a'];
const ADJ = ['Wobbly', 'Sparkly', 'Fuzzy', 'Sleepy', 'Bouncy', 'Giggly', 'Tiny', 'Brave', 'Snuggly', 'Zippy', 'Dizzy', 'Jolly', 'Puffy', 'Cosmic', 'Squishy', 'Wiggly'];
const NOUN = ['Glimmerbug', 'Blorb', 'Snoot', 'Puffling', 'Zibble', 'Moonmite', 'Doodlewump', 'Fizzlet', 'Pom', 'Squonk', 'Wibblet', 'Nubbin', 'Bloop', 'Twinklet', 'Mossmouse', 'Gloopy'];
const ANIMS = ['bounce', 'wiggle', 'hop', 'float', 'blink'];

// One candidate critter as art rows (a = body, z = spot, : = eye hole).
function critterArt(rnd, w = 10, h = 10) {
  const half = w / 2;
  let g = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < half; x++) {
      // Denser towards the middle column and the middle rows.
      const cx = (half - 0.5 - x) / half;
      const cy = Math.abs(y - (h - 1) / 2) / (h / 2);
      const p = 0.82 - cx * 0.5 - cy * 0.35;
      row.push(rnd() < p ? 1 : 0);
    }
    g.push(row);
  }
  // Smooth once so it reads as a body, not static.
  const at = (x, y) => (x >= 0 && y >= 0 && y < h && x < half ? g[y][x] : x >= half && x < w && y >= 0 && y < h ? g[y][w - 1 - x] : 0);
  const next = g.map((row, y) => row.map((v, x) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += at(x + dx, y + dy);
    return n >= 5 ? 1 : n <= 2 ? 0 : v;
  }));
  g = next;
  // Little legs or antennae on top/bottom rows sometimes.
  const full = g.map((row) => row.concat(row.slice().reverse()));
  // Eyes: a symmetric pair of holes with body all around them.
  const spots = [];
  for (let y = 1; y < h - 3; y++) {
    for (let x = 1; x < half - 1; x++) {
      if (full[y][x] && full[y][x - 1] && full[y][x + 1] && full[y - 1][x] && full[y + 1][x]) spots.push([x, y]);
    }
  }
  if (!spots.length) return null;
  const [eyeX, eyeY] = spots[Math.floor(rnd() * spots.length)];
  full[eyeY][eyeX] = 2;
  full[eyeY][w - 1 - eyeX] = 2;
  // Spots for the reveal (still filled squares).
  const rows = full.map((row, y) => row.map((v, x) => {
    if (v === 2) return ':';
    if (!v) return '.';
    const mx = Math.min(x, w - 1 - x);
    return (mx * 7 + y * 3) % 5 === 0 && y > eyeY ? 'z' : 'a';
  }).join(''));
  return rows;
}

function fillRatio(art) {
  let n = 0;
  for (const r of art) for (const ch of r) if (ch !== '.' && ch !== ':') n++;
  return n / (art.length * art[0].length);
}

// Deterministic critter for a date key. Always line-solvable.
export function dailyCritter(key) {
  const seed = hashString(`picto-paint:${key}`);
  const rnd = mulberry32(seed);
  const pal = { a: BODIES[Math.floor(rnd() * BODIES.length)], z: SPOTS[Math.floor(rnd() * SPOTS.length)] };
  const name = `${ADJ[Math.floor(rnd() * ADJ.length)]} ${NOUN[Math.floor(rnd() * NOUN.length)]}`;
  const anim = ANIMS[Math.floor(rnd() * ANIMS.length)];
  for (let attempt = 0; attempt < 400; attempt++) {
    const art = critterArt(rnd);
    if (!art) continue;
    const r = fillRatio(art);
    if (r < 0.38 || r > 0.75) continue;
    // Every row and column should have something to do.
    if (art.some((row) => !/[az]/.test(row))) continue;
    const def = { id: `daily-${key}`, name, art, pal, anim };
    const p = buildPuzzle(def);
    p.tint = '#d6f0dc';
    if (solve(p).solved) return { def, puzzle: p, attempt };
  }
  // Fallback that is always solvable: a simple framed critter.
  const art = ['..aaaaaa..', '.aaaaaaaa.', 'aa:aaaa:aa', 'aaaaaaaaaa', 'aaazaazaaa', 'aaaaaaaaaa', '.aaaaaaaa.', '..aa..aa..', '.aa....aa.', 'aa......aa'];
  const def = { id: `daily-${key}`, name, art, pal, anim };
  const puzzle = buildPuzzle(def);
  puzzle.tint = '#d6f0dc';
  return { def, puzzle, attempt: -1 };
}

// Streak bookkeeping. daily = { last, streak, best, done: {key: seconds} }.
export function recordDaily(daily, key, seconds) {
  const d = { last: null, streak: 0, best: 0, done: {}, ...daily, done: { ...(daily?.done || {}) } };
  if (d.done[key] != null) {
    d.done[key] = Math.min(d.done[key], seconds);
    return { daily: d, extended: false };
  }
  d.done[key] = seconds;
  if (d.last && dayDiff(d.last, key) === 1) d.streak += 1;
  else if (!d.last || dayDiff(d.last, key) !== 0) d.streak = 1;
  d.last = key;
  d.best = Math.max(d.best, d.streak);
  return { daily: d, extended: true };
}

// The streak shown today: still alive if the last solve was today or yesterday.
export function liveStreak(daily, key) {
  if (!daily?.last) return 0;
  const gap = dayDiff(daily.last, key);
  return gap <= 1 ? daily.streak : 0;
}
