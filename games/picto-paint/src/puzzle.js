// Turns a picture (rows of palette letters) into a playable puzzle. DOM-free.
import { cluesOf } from './solver.js';

// The shared paint box. Puzzles may override letters with `pal`.
export const PALETTE = {
  k: '#2b2440', // ink
  e: '#2b2440', // eye (filled, blinks)
  w: '#ffffff',
  r: '#e8504f',
  R: '#a8323a',
  o: '#f39a3d',
  y: '#f7d14c',
  Y: '#c99a2e',
  g: '#5cbf5a',
  G: '#2f8a4a',
  l: '#b8e05a',
  b: '#4a8fe0',
  B: '#2d4f9c',
  c: '#86d4f2',
  p: '#f59ac0',
  m: '#d4529a',
  P: '#9a6ad6',
  v: '#c9b2f0',
  n: '#a56b43',
  N: '#6b4428',
  t: '#efc994',
  s: '#b4bac6',
  S: '#6b7280',
  i: '#fff3d6', // ivory / cream
};
// `:` is an empty eye hole (blinks), `.` is empty.
const EMPTY_CHARS = new Set(['.', ':']);

export const PAR_SECONDS = { 5: 90, 8: 240, 10: 360, 12: 540, 15: 840 };

export function parFor(size, colour) {
  const keys = Object.keys(PAR_SECONDS).map(Number).sort((a, b) => a - b);
  let base = PAR_SECONDS[keys[keys.length - 1]];
  for (const k of keys) if (size <= k) { base = PAR_SECONDS[k]; break; }
  return Math.round(base * (colour ? 1.25 : 1));
}

// def: { id, name, art: [...rows], colour?: bool, pal?: {}, anim?: string }
// Drop empty rows and columns around the picture: they add nothing.
export function cropArt(art) {
  const blank = (ch) => ch === '.';
  let top = 0;
  let bottom = art.length - 1;
  while (top < bottom && [...art[top]].every(blank)) top++;
  while (bottom > top && [...art[bottom]].every(blank)) bottom--;
  const rows = art.slice(top, bottom + 1);
  let left = 0;
  let right = rows[0].length - 1;
  while (left < right && rows.every((r) => blank(r[left]))) left++;
  while (right > left && rows.every((r) => blank(r[right]))) right--;
  return rows.map((r) => r.slice(left, right + 1));
}

export function buildPuzzle(def) {
  for (const row of def.art) {
    if (row.length !== def.art[0].length) throw new Error(`${def.id}: ragged row "${row}"`);
  }
  const art = cropArt(def.art);
  const h = art.length;
  const w = art[0].length;
  const pal = { ...PALETTE, ...(def.pal || {}) };
  // Hex colour of every art cell (null = empty).
  const hex = [];
  const eyes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = art[y][x];
      if (ch === 'e' || ch === ':') eyes.push(y * w + x);
      if (EMPTY_CHARS.has(ch)) { hex.push(null); continue; }
      const col = pal[ch];
      if (!col) throw new Error(`${def.id}: unknown paint "${ch}"`);
      hex.push(col);
    }
  }
  // Clue colours: distinct hexes in order of first appearance.
  const colourHex = [];
  const solution = new Int8Array(w * h).fill(-1);
  for (let i = 0; i < hex.length; i++) {
    if (!hex[i]) continue;
    if (!def.colour) { solution[i] = 0; continue; }
    let k = colourHex.indexOf(hex[i]);
    if (k < 0) { k = colourHex.length; colourHex.push(hex[i]); }
    solution[i] = k;
  }
  const colours = def.colour ? colourHex.length : 1;
  const grid = [];
  for (let y = 0; y < h; y++) grid.push(Array.from(solution.slice(y * w, y * w + w)));
  const { rows, cols } = cluesOf(grid);
  return {
    id: def.id,
    name: def.name,
    w,
    h,
    colour: !!def.colour,
    colours,
    // Colours of the clue paints (colour puzzles); mono puzzles fill with ink.
    paints: def.colour ? colourHex : ['#2b2440'],
    art: hex,
    eyes,
    solution,
    rows,
    cols,
    anim: def.anim || 'bounce',
    par: parFor(Math.max(w, h), !!def.colour),
    bg: def.bg || null,
  };
}

// Ways a finished picture can come to life (see anim.js).
export const ANIM_TYPES = ['beat', 'blink', 'twinkle', 'smoke', 'bounce', 'wiggle', 'sway', 'bob', 'hop', 'drive', 'swim', 'steam', 'spin', 'fly', 'float', 'launch', 'flap'];
