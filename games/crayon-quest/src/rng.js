// Seeded random numbers. The state is a single uint32 so a whole run
// (including its RNG) can be saved as JSON and resumed exactly.

export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 step on a holder object { s }.
export function next(holder) {
  holder.s = (holder.s + 0x6d2b79f5) >>> 0;
  let t = holder.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makeRng(seed) {
  return { s: seed >>> 0 };
}

export function int(holder, n) {
  return Math.floor(next(holder) * n);
}

export function range(holder, lo, hi) {
  return lo + int(holder, hi - lo + 1);
}

export function pick(holder, list) {
  return list[int(holder, list.length)];
}

export function chance(holder, p) {
  return next(holder) < p;
}

export function shuffle(holder, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = int(holder, i + 1);
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

// Weighted pick from [[item, weight], ...].
export function weighted(holder, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = next(holder) * total;
  for (const [item, w] of entries) {
    roll -= w;
    if (roll < 0) return item;
  }
  return entries[entries.length - 1][0];
}

// A fresh, independent stream derived from a parent seed and a label, so
// e.g. the map does not change when the battle code draws more numbers.
export function derive(seed, label) {
  return makeRng(hashString(`${seed >>> 0}:${label}`));
}

// Local-date key and seed for the daily page: same day, same run.
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailySeed(key) {
  return hashString(`crayon-quest-daily:${key}`);
}

// Whole days between two YYYY-MM-DD keys (b - a).
export function dayDiff(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}
