// Pure collision maths for blobs: circle-vs-circle bumps with momentum
// exchange, and bouncy static bumpers. No DOM, no world state.
import { BUMP } from './config.js';

// Resolve a contact between blobs a and b ({x, y, vx, vy, mass, radius}).
// Pushes them apart (heavier blobs move less) and exchanges momentum along
// the contact normal. `boost` is an extra equal-and-opposite impulse, so
// total momentum is conserved whatever the boost.
// Returns null if they do not touch, else the contact { nx, ny, speed, impulse }.
export function collideBlobs(a, b, { restitution = BUMP.restitution, boost = 0, immovableA = false, immovableB = false } = {}) {
  let dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.radius + b.radius;
  let d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return null;
  let d = Math.sqrt(d2);
  if (d < 1e-6) { dx = 1; dy = 0; d = 1; d2 = 1; }
  const nx = dx / d, ny = dy / d;
  // Inverse masses; an immovable blob behaves as infinitely heavy.
  const ia = immovableA ? 0 : 1 / a.mass;
  const ib = immovableB ? 0 : 1 / b.mass;
  const isum = ia + ib;
  if (isum === 0) return null;
  // Positional correction, split by inverse mass.
  const overlap = rr - d;
  a.x -= nx * overlap * (ia / isum);
  a.y -= ny * overlap * (ia / isum);
  b.x += nx * overlap * (ib / isum);
  b.y += ny * overlap * (ib / isum);
  // Closing speed along the normal (positive when approaching).
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  // Only approaching blobs bounce: resting contact just separates.
  let j = 0;
  if (closing > 0) j = ((1 + restitution) * closing) / isum + boost;
  a.vx -= nx * j * ia;
  a.vy -= ny * j * ia;
  b.vx += nx * j * ib;
  b.vy += ny * j * ib;
  return { nx, ny, speed: Math.max(0, closing), impulse: j };
}

// Bounce a blob off a static round bumper with an extra kick.
// Returns the outward normal if they touched.
export function collideBumper(blob, bumper, kick = BUMP.bumperKick) {
  const dx = blob.x - bumper.x, dy = blob.y - bumper.y;
  const rr = blob.radius + bumper.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1;
  const nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0;
  blob.x = bumper.x + nx * rr;
  blob.y = bumper.y + ny * rr;
  const vn = blob.vx * nx + blob.vy * ny;
  // Reflect the inward part, then add the kick (lighter blobs fly further).
  if (vn < 0) { blob.vx -= 1.6 * vn * nx; blob.vy -= 1.6 * vn * ny; }
  const k = kick / Math.sqrt(blob.mass);
  blob.vx += nx * k;
  blob.vy += ny * k;
  return { nx, ny, speed: Math.max(0, -vn) + k };
}

// Radial shove from a point (ground pounds, bombs). Strength falls off
// linearly to a third at the edge of the radius. Returns the speed added.
export function radialPush(blob, x, y, radius, force) {
  const dx = blob.x - x, dy = blob.y - y;
  const reach = radius + blob.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return 0;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
  const f = (force * (1 - (2 / 3) * (d / reach))) / blob.mass;
  blob.vx += nx * f;
  blob.vy += ny * f;
  return f;
}

export const momentum = (blobs) => blobs.reduce((m, b) => ({ x: m.x + b.mass * b.vx, y: m.y + b.mass * b.vy }), { x: 0, y: 0 });
