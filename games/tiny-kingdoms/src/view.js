// World ↔ screen transform. Tall screens turn the 16:10 world a quarter
// turn so phones get a big board, with your side (the left of the world)
// at the bottom. DOM-free.
import { WORLD_W, WORLD_H } from './data.js';

export const PAD = 40; // world units of sea around the map

// bounds: the part of the world to fit (defaults to all of it).
export function makeView(w, h, { top = 0, bottom = 0, side = 0 } = {}, bounds = null) {
  const b = bounds || { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H };
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const availW = Math.max(1, w - side * 2), availH = Math.max(1, h - top - bottom);
  const rotate = availH > availW * 1.15;
  const ww = (rotate ? bh : bw) + PAD * 2;
  const wh = (rotate ? bw : bh) + PAD * 2;
  const s = Math.min(availW / ww, availH / wh);
  const ox = side + (availW - ww * s) / 2 + PAD * s;
  const oy = top + (availH - wh * s) / 2 + PAD * s;
  return {
    w, h, s, rotate, ox, oy, bounds: b,
    toScreen(x, y) {
      return rotate ? { x: ox + (y - b.y0) * s, y: oy + (b.x1 - x) * s } : { x: ox + (x - b.x0) * s, y: oy + (y - b.y0) * s };
    },
    toWorld(sx, sy) {
      return rotate ? { x: b.x1 - (sy - oy) / s, y: b.y0 + (sx - ox) / s } : { x: b.x0 + (sx - ox) / s, y: b.y0 + (sy - oy) / s };
    },
  };
}

// The part of the world worth showing: every building plus its island,
// never smaller than a comfortable minimum.
export function mapBounds(nodes, margin = 120, minW = 760, minH = 480) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
  }
  x0 -= margin; y0 -= margin; x1 += margin; y1 += margin;
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
  if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
  return { x0, y0, x1, y1 };
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
