// Compact text encoding for saved gardens: run-length encoded cells.
//
// Each run is one character for the cell code (type, plus a flag when a
// variant character follows), an optional variant character (soil wetness,
// flower colour, plant kind…), then the run length as base-32 digits, low
// digit first, where the upper half of the alphabet means "more digits".
// A run of one plain cell costs two characters.
import {
  EMPTY, SOIL, STEM, LEAF, FLOWER, WOOD, TIP, MOSS, FISH, FIREFLY, STEAM, FIRE, TYPE_COUNT,
  K_FLOWER, K_GRASS, K_VINE, K_TREE, K_BRANCH, K_CROWN,
} from './elements.js';
import { hash32 } from './rng.js';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INDEX = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET.charCodeAt(i)] = i;

export const MAX_SCENE_CHARS = 40000;
export const MIN_SIDE = 8;
export const MAX_SIDE = 640;
export const MAX_CELLS = 200000;

// The variant (0..63) worth keeping for a cell; 0 means none.
function variantOf(t, a, b) {
  switch (t) {
    case SOIL: return Math.min(7, a);
    case STEM: case LEAF: case WOOD: case FLOWER: case TIP:
      return (b & 7) | (((b >> 4) & 7) << 3);
    case MOSS: return Math.min(63, a);
    case FISH: return b & 1;
    case FIREFLY: return b & 63;
    case STEAM: case FIRE: return Math.min(63, a >> 1);
    default: return 0;
  }
}

// Flower centres are stored as their own type code so the variant stays in
// six bits: code 31 is "flower centre".
const CENTRE = 31;

export function encodeCells(type, a, b) {
  const n = type.length;
  let out = '';
  let i = 0;
  while (i < n) {
    const t = type[i];
    const code = t === FLOWER && (b[i] & 8) ? CENTRE : t;
    const v = variantOf(t, a[i], b[i]);
    let j = i + 1;
    while (j < n) {
      const tj = type[j];
      const cj = tj === FLOWER && (b[j] & 8) ? CENTRE : tj;
      if (cj !== code || variantOf(tj, a[j], b[j]) !== v) break;
      j++;
    }
    out += ALPHABET[code + (v ? 32 : 0)];
    if (v) out += ALPHABET[v];
    let len = j - i - 1;
    do {
      const digit = len & 31;
      len >>>= 5;
      out += ALPHABET[digit + (len ? 32 : 0)];
    } while (len);
    i = j;
  }
  return out;
}

export function encodeWorld(world) {
  return { w: world.w, h: world.h, data: encodeCells(world.type, world.a, world.b) };
}

const KINDS = new Set([K_FLOWER, K_GRASS, K_VINE, K_TREE, K_BRANCH, K_CROWN]);

// Rebuild the cell bytes for one decoded code and variant.
function cellFrom(code, v) {
  if (code === CENTRE) return [FLOWER, 0, K_FLOWER | 8 | (((v >> 3) & 7) << 4)];
  const t = code;
  switch (t) {
    case SOIL: return [t, Math.min(7, v), 0];
    case STEM: case LEAF: case WOOD: case FLOWER: case TIP: {
      const kind = v & 7;
      const colour = (v >> 3) & 7;
      return [t, 0, (KINDS.has(kind) ? kind : 0) | (colour << 4)];
    }
    case MOSS: return [t, v, 0];
    case FISH: return [t, 0, v & 1];
    case FIREFLY: return [t, 0, v & 63];
    case STEAM: case FIRE: return [t, Math.max(1, v << 1), 0];
    default: return [t, 0, 0];
  }
}

// Decode into fresh arrays; null when the text is damaged in any way.
export function decodeCells(data, w, h) {
  if (typeof data !== 'string' || !Number.isInteger(w) || !Number.isInteger(h)) return null;
  if (w < MIN_SIDE || h < MIN_SIDE || w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_CELLS) return null;
  if (data.length > MAX_SCENE_CHARS) return null;
  const n = w * h;
  const type = new Uint8Array(n);
  const a = new Uint8Array(n);
  const b = new Uint8Array(n);
  const tone = new Uint8Array(n);
  let p = 0;
  let i = 0;
  const next = () => (p < data.length ? INDEX[data.charCodeAt(p++) & 127] : -1);
  while (p < data.length) {
    const c = next();
    if (c < 0) return null;
    const code = c & 31;
    const v = c & 32 ? next() : 0;
    if (v < 0) return null;
    if (code !== CENTRE && code >= TYPE_COUNT) return null;
    let len = 0;
    let shift = 0;
    for (;;) {
      const d = next();
      if (d < 0 || shift > 20) return null;
      len += (d & 31) * 2 ** shift;
      shift += 5;
      if (!(d & 32)) break;
    }
    len += 1;
    if (i + len > n) return null;
    const [t, va, vb] = cellFrom(code, v);
    if (t !== EMPTY) {
      type.fill(t, i, i + len);
      if (va) a.fill(va, i, i + len);
      if (vb) b.fill(vb, i, i + len);
    }
    i += len;
  }
  if (i !== n) return null;
  // Shades are not stored: derive them from the position so they repeat.
  for (let k = 0; k < n; k++) tone[k] = hash32(k) & 3;
  return { type, a, b, tone };
}
