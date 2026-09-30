// Small seeded PRNG (mulberry32). Every random choice in the rules goes
// through one of these so a level replays identically from its seed.
export class Rng {
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }

  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  clone() {
    return new Rng(this.s);
  }
}

// Mixes numbers into a 32-bit seed (for level id + attempt, etc.).
export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}
