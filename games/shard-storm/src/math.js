// Small deterministic helpers shared by the simulation.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Nearest point on the segment a-b to the point (px, py).
export function nearestOnSegment(ax, ay, bx, by, px, py) {
  const abx = bx - ax, aby = by - ay;
  const l2 = abx * abx + aby * aby;
  const t = l2 ? clamp(((px - ax) * abx + (py - ay) * aby) / l2, 0, 1) : 0;
  return { x: ax + abx * t, y: ay + aby * t, t };
}

// True when the segment (ax, ay)-(bx, by) is within `r` of the circle
// centre (cx, cy) — a swept test, so a fast swipe never tunnels.
export function segmentHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const p = nearestOnSegment(ax, ay, bx, by, cx, cy);
  const dx = p.x - cx, dy = p.y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Angle (radians) of a -> b.
export const angleOf = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
