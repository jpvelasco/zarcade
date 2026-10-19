// Smooth movement against the tile grid. Boxes move one axis at a time in
// small steps, stop flush against walls, and slide along them. When pushing
// straight into a corner that is only slightly in the way, the box is nudged
// around it (like stepping past a doorframe), so movement never feels sticky.
import { TILE } from './tiles.js';

export const NUDGE = 7; // px: how far around a corner we help you slide

/**
 * Does a box centred at (x, y) with half sizes (hw, hh) overlap anything solid?
 * `blocked(tx, ty)` answers for tiles, `rects` are extra solid boxes
 * {x, y, hw, hh} (push blocks, people, chests).
 */
export function overlaps(x, y, hw, hh, blocked, rects) {
  const x0 = Math.floor((x - hw) / TILE), x1 = Math.floor((x + hw - 0.001) / TILE);
  const y0 = Math.floor((y - hh) / TILE), y1 = Math.floor((y + hh - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blocked(tx, ty)) return true;
  if (rects) {
    for (const r of rects) {
      if (Math.abs(r.x - x) < r.hw + hw && Math.abs(r.y - y) < r.hh + hh) return true;
    }
  }
  return false;
}

function stepAxis(b, d, axis, blocked, rects) {
  if (d === 0) return false;
  const sign = Math.sign(d);
  let left = Math.abs(d);
  while (left > 0) {
    const s = Math.min(1, left) * sign;
    const nx = axis === 'x' ? b.x + s : b.x;
    const ny = axis === 'y' ? b.y + s : b.y;
    if (overlaps(nx, ny, b.hw, b.hh, blocked, rects)) {
      // Close the last sub-pixel gap so the box sits flush.
      let lo = 0, hi = Math.abs(s);
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const tx = axis === 'x' ? b.x + mid * sign : b.x;
        const ty = axis === 'y' ? b.y + mid * sign : b.y;
        if (overlaps(tx, ty, b.hw, b.hh, blocked, rects)) hi = mid; else lo = mid;
      }
      if (axis === 'x') b.x += lo * sign; else b.y += lo * sign;
      return true;
    }
    if (axis === 'x') b.x = nx; else b.y = ny;
    left -= Math.abs(s);
  }
  return false;
}

/**
 * Move box `b` ({x, y, hw, hh}) by (dx, dy). Returns { hitX, hitY } for the
 * axes that were stopped. With `nudge`, a box pressing into a corner along
 * one axis slides sideways around it.
 */
export function moveBox(b, dx, dy, blocked, rects = null, nudge = true) {
  const hitX = stepAxis(b, dx, 'x', blocked, rects);
  const hitY = stepAxis(b, dy, 'y', blocked, rects);
  if (nudge) {
    if (hitX && dy === 0) cornerSlide(b, Math.sign(dx), 'x', Math.abs(dx), blocked, rects);
    if (hitY && dx === 0) cornerSlide(b, Math.sign(dy), 'y', Math.abs(dy), blocked, rects);
  }
  return { hitX, hitY };
}

// Pressing along `axis` and stuck: look up to NUDGE px to either side for a
// gap, and slide toward the nearest one.
function cornerSlide(b, sign, axis, speed, blocked, rects) {
  for (let k = 1; k <= NUDGE; k++) {
    for (const side of [-1, 1]) {
      const ox = axis === 'x' ? b.x + sign : b.x + side * k;
      const oy = axis === 'y' ? b.y + sign : b.y + side * k;
      const sx = axis === 'x' ? b.x : b.x + side * k;
      const sy = axis === 'y' ? b.y : b.y + side * k;
      if (!overlaps(sx, sy, b.hw, b.hh, blocked, rects) && !overlaps(ox, oy, b.hw, b.hh, blocked, rects)) {
        const amount = Math.min(speed, k) * side;
        if (axis === 'x') stepAxis(b, amount, 'y', blocked, rects);
        else stepAxis(b, amount, 'x', blocked, rects);
        return true;
      }
    }
  }
  return false;
}
