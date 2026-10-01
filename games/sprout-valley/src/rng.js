// Small seeded random numbers, so a farm's layout, weather and requests are
// the same every time from its seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix any number of integers into one 32-bit seed.
export function hash(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    let v = typeof p === 'string' ? strHash(p) : (p | 0);
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  }
  return h >>> 0;
}

function strHash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
  return h;
}

export const rngFor = (...parts) => mulberry32(hash(...parts));

export function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

export function weightedPick(rand, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}
