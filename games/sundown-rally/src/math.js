export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1).
export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Picks a key from { key: weight } using a random number in [0, 1).
export function weightedPick(weights, r) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let x = r * total;
  for (const [key, w] of entries) {
    if ((x -= w) < 0) return key;
  }
  return entries[entries.length - 1][0];
}
