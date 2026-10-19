// Seeded random numbers. One uint32 of state, so any room layout can be
// rebuilt exactly from its seed (the daily room and the room codes rely on it).

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mix(a, b) {
  let h = (a ^ Math.imul((b >>> 0) + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  constructor(seed = 1) { this.state = (seed >>> 0) || 1; }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  between(a, b) { return a + this.int(b - a + 1); }
  pick(list) { return list[this.int(list.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }

  // Fisher-Yates on a copy, so callers keep their source list.
  shuffled(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  take(list, n) { return this.shuffled(list).slice(0, n); }
}

// Local date as YYYY-MM-DD, the key behind the daily room and its streak.
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Days between two day keys, for streak bookkeeping.
export function dayGap(a, b) {
  const pa = Date.parse(`${a}T00:00:00`);
  const pb = Date.parse(`${b}T00:00:00`);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return Infinity;
  return Math.round((pb - pa) / 86400000);
}
