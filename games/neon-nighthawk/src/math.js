export const TAU = Math.PI * 2;

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const lerp = (a, b, amount) => a + (b - a) * amount;
export const approach = (value, target, delta) =>
  value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);
export const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
export const length = (x, y) => Math.hypot(x, y);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (ax, ay, bx, by) => ax * bx + ay * by;
export const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

// Small seeded random number generator. Procedural city content and contracts
// use it so a Shift Code can reliably recreate a night.
export function rng(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// A stable integer hash for map cells and procedural labels.
export function hash(value) {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

export function hash2(x, y, seed = 0) {
  return hash(Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (seed | 0));
}

export function hashFloat(x, y, seed = 0) {
  return hash2(x, y, seed) / 0x100000000;
}

export function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

export function formatClock(secondsAfterNine) {
  const minutes = Math.max(0, Math.floor(secondsAfterNine / 2.4));
  const hour = (21 + Math.floor(minutes / 60)) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
