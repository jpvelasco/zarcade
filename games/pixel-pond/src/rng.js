// Seeded randomness and calendar keys. Pure, so scenes and prompts repeat.

// Mulberry32: a small, fast seeded PRNG returning floats in [0, 1).
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix an integer into a well-spread 32-bit hash.
export function hash32(n) {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

// Local calendar key, e.g. 20261009.
export function dateKey(d = new Date()) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// The key of the day before `key` (handles month and year ends).
export function previousKey(key) {
  const y = Math.floor(key / 10000);
  const m = Math.floor(key / 100) % 100;
  const d = key % 100;
  return dateKey(new Date(y, m - 1, d - 1));
}

// 20261009 -> "Oct 9".
export function keyLabel(key) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Math.floor(key / 100) % 100;
  return `${months[m - 1] || '?'} ${key % 100}`;
}
