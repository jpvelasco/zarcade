// Pure collision helpers. Balls carry a unit direction (dx, dy); speed is
// applied by the world, so these functions only reason about directions.
import { PADDLE, BALL } from './config.js';
import { clamp } from './math.js';

// Circle vs axis-aligned rectangle. Returns the push-out normal and depth,
// or null when they do not overlap.
export function circleRect(x, y, r, rx, ry, rw, rh) {
  const cx = clamp(x, rx, rx + rw);
  const cy = clamp(y, ry, ry + rh);
  const ex = x - cx, ey = y - cy;
  const d2 = ex * ex + ey * ey;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { nx: ex / d, ny: ey / d, depth: r - d };
  }
  // Centre inside the rectangle: leave through the nearest side.
  const left = x - rx, right = rx + rw - x, top = y - ry, bottom = ry + rh - y;
  const m = Math.min(left, right, top, bottom);
  if (m === top) return { nx: 0, ny: -1, depth: top + r };
  if (m === bottom) return { nx: 0, ny: 1, depth: bottom + r };
  if (m === left) return { nx: -1, ny: 0, depth: left + r };
  return { nx: 1, ny: 0, depth: right + r };
}

// Reflect a direction about a surface normal (only if moving into it).
export function reflect(ball, nx, ny) {
  const dot = ball.dx * nx + ball.dy * ny;
  if (dot >= 0) return false;
  ball.dx -= 2 * dot * nx;
  ball.dy -= 2 * dot * ny;
  normalize(ball);
  return true;
}

export function normalize(ball) {
  const len = Math.hypot(ball.dx, ball.dy) || 1;
  ball.dx /= len;
  ball.dy /= len;
}

// Never let a comet travel almost flat: that makes dull, endless rallies.
export function keepVertical(ball, min = BALL.minVertical) {
  if (Math.abs(ball.dy) >= min) return;
  const sy = ball.dy < 0 ? -1 : 1;
  const sx = ball.dx < 0 ? -1 : 1;
  ball.dy = sy * min;
  ball.dx = sx * Math.sqrt(1 - min * min);
}

// Outgoing direction after hitting the paddle: the further from the centre,
// the steeper the angle (up to PADDLE.maxAngle from vertical).
export function paddleBounce(offset, paddleVx = 0) {
  const o = clamp(offset, -1, 1);
  const english = clamp(paddleVx / 6000, -0.1, 0.1);
  const a = clamp(o * PADDLE.maxAngle + english, -PADDLE.maxAngle, PADDLE.maxAngle);
  return { dx: Math.sin(a), dy: -Math.cos(a) };
}

export function rotate(ball, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = ball.dx * c - ball.dy * s;
  ball.dy = ball.dx * s + ball.dy * c;
  ball.dx = dx;
  normalize(ball);
}

// Where will a ball moving down cross height y, bouncing between the side walls?
export function predictX(x, y, dx, dy, targetY, left, right) {
  if (dy <= 0) return x;
  const t = (targetY - y) / dy;
  const L = right - left;
  let u = (x - left + dx * t) % (2 * L);
  if (u < 0) u += 2 * L;
  if (u > L) u = 2 * L - u;
  return left + u;
}
