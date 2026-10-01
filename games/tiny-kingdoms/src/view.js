// World ↔ screen transform. Tall screens turn the 16:10 world a quarter
// turn so phones get a big board, with your side (the left of the world)
// at the bottom. DOM-free.
import { WORLD_W, WORLD_H } from './data.js';

export const PAD = 40; // world units of sea around the map

export function makeView(w, h, { top = 0, bottom = 0, side = 0 } = {}) {
  const availW = Math.max(1, w - side * 2), availH = Math.max(1, h - top - bottom);
  const rotate = availH > availW * 1.15;
  const ww = (rotate ? WORLD_H : WORLD_W) + PAD * 2;
  const wh = (rotate ? WORLD_W : WORLD_H) + PAD * 2;
  const s = Math.min(availW / ww, availH / wh);
  const ox = side + (availW - ww * s) / 2 + PAD * s;
  const oy = top + (availH - wh * s) / 2 + PAD * s;
  return {
    w, h, s, rotate, ox, oy,
    toScreen(x, y) {
      return rotate ? { x: ox + y * s, y: oy + (WORLD_W - x) * s } : { x: ox + x * s, y: oy + y * s };
    },
    toWorld(sx, sy) {
      return rotate ? { x: WORLD_W - (sy - oy) / s, y: (sx - ox) / s } : { x: (sx - ox) / s, y: (sy - oy) / s };
    },
  };
}

// The building under a world point, with `slop` extra world units of reach
// (bigger for fingers). Returns an id or null.
export function hitNode(nodes, x, y, slop = 20) {
  let best = null, bestD = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.r + slop && d < bestD) { bestD = d; best = n.id; }
  }
  return best;
}

// The nearest building from `from` roughly in direction (dx, dy), for
// arrow keys and the gamepad d-pad. Directions are in world space.
export function nearestInDirection(nodes, from, dx, dy) {
  let best = null, bestScore = Infinity;
  for (const n of nodes) {
    if (n.id === from.id) continue;
    const vx = n.x - from.x, vy = n.y - from.y;
    const d = Math.hypot(vx, vy);
    const along = (vx * dx + vy * dy) / d;
    if (along < 0.35) continue;
    const score = d * (2 - along);
    if (score < bestScore) { bestScore = score; best = n.id; }
  }
  return best;
}
