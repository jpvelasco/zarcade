// Seeded randomness so a seed always rebuilds the same track.

// mulberry32: small, fast, good enough for level generation.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    // Pick a key from { key: weight } (weights may be 0).
    weighted(weights) {
      let total = 0;
      for (const k in weights) total += Math.max(0, weights[k]);
      let r = next() * total;
      for (const k in weights) {
        r -= Math.max(0, weights[k]);
        if (r < 0) return k;
      }
      return Object.keys(weights)[0];
    },
  };
}

// FNV-1a string hash to a 32-bit seed.
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Stateless hash of integers to [0, 1): roadside props use it so scenery is
// the same every time you pass the same spot, without storing anything.
export function hash01(a, b = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
