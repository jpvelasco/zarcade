// Small deterministic helpers shared by the simulation and the generator.
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

// A per-second retention factor, e.g. friction 0.5 halves speed each second.
export const perStepKeep = (perSecond, dt) => Math.pow(perSecond, dt);

// Shortest-arc direction of a vector, radians in (-PI, PI].
export function angleOf(vx, vy) {
  return Math.atan2(vy, vx);
}

// Circle vs axis-aligned rectangle: the closest point, plus the push-out
// vector when the circle is inside or touching. Returns null when clear.
export function circleRectHit(px, py, r, box) {
  const cx = clamp(px, box.x, box.x + box.w);
  const cy = clamp(py, box.y, box.y + box.h);
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2);
  if (d > 1e-6) return { nx: dx / d, ny: dy / d, depth: r - d };
  // Centre inside the box: push out along the thinnest axis.
  const left = px - box.x;
  const right = box.x + box.w - px;
  const top = py - box.y;
  const bottom = box.y + box.h - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: r + left };
  if (m === right) return { nx: 1, ny: 0, depth: r + right };
  if (m === top) return { nx: 0, ny: -1, depth: r + top };
  return { nx: 0, ny: 1, depth: r + bottom };
}
