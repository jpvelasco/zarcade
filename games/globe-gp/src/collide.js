import { clamp } from './math.js';

// Collision responses. Every solid thing pushes a car out and cancels only
// the velocity going into it, then turns the nose along the face, so a car
// scraping a wall or a prop keeps moving instead of sticking.

const GLANCE_TURN = 8;   // rad/s the nose swings along a face
const TANGENT_KEEP = 0.5; // share of a head-on hit turned into a sideways glance

// Shared response once a contact normal and penetration are known.
function respond(v, nx, nz, pen, dt, tangentHint) {
  v.x += nx * pen;
  v.z += nz * pen;
  const into = v.vx * nx + v.vz * nz;
  let impact = 0;
  // Tangent along the face: the side the nose already leans to.
  let tx = -nz, tz = nx;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let lean = fx * tx + fz * tz;
  if (Math.abs(lean) < 0.15 && tangentHint) lean = tangentHint.x * tx + tangentHint.z * tz;
  if (lean < 0) { tx = -tx; tz = -tz; }
  if (into < 0) {
    impact = -into;
    const speed = Math.hypot(v.vx, v.vz) || 1;
    const headOn = clamp(impact / speed, 0, 1);
    v.vx -= into * nx;
    v.vz -= into * nz;
    v.vx += tx * impact * TANGENT_KEEP * headOn;
    v.vz += tz * impact * TANGENT_KEEP * headOn;
    if (impact > 6) {
      const keep = 1 - 0.25 * clamp((impact - 6) / 20, 0, 1);
      v.vx *= keep;
      v.vz *= keep;
    }
  }
  if (fx * nx + fz * nz < -0.05) {
    let diff = Math.atan2(tx, tz) - v.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    v.heading += clamp(diff, -GLANCE_TURN * dt, GLANCE_TURN * dt);
  }
  return impact;
}

// Two-sided wall segment. The side is decided by where the car was before
// this step, so a car can never tunnel through, and a car that somehow
// ends up behind a wall is held on that side rather than flung across.
export function collideWall(v, w, radius, dt, tangentHint) {
  const t = clamp(((v.x - w.ax) * w.ex + (v.z - w.az) * w.ez) / (w.len * w.len), 0, 1);
  if (t > 0 && t < 1) {
    const sNow = (v.x - w.ax) * w.nx + (v.z - w.az) * w.nz;
    const sPrev = (v.px - w.ax) * w.nx + (v.pz - w.az) * w.nz;
    const side = sPrev >= 0 ? 1 : -1;
    const s = sNow * side;
    if (s >= radius || s < -radius * 3) return 0;
    return respond(v, w.nx * side, w.nz * side, radius - s, dt, tangentHint) || 0.001;
  }
  // Wall ends behave like posts.
  const cx = w.ax + w.ex * t, cz = w.az + w.ez * t;
  const dx = v.x - cx, dz = v.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return 0;
  const d = Math.sqrt(d2) || 0.001;
  return respond(v, dx / d, dz / d, radius - d, dt, tangentHint) || 0.001;
}

// Round prop (tyre stack, rock).
export function collideCircle(v, cx, cz, r, radius, dt, tangentHint) {
  const dx = v.x - cx, dz = v.z - cz;
  const reach = r + radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= reach * reach) return 0;
  const d = Math.sqrt(d2) || 0.001;
  return respond(v, dx / d, dz / d, reach - d, dt, tangentHint) || 0.001;
}

// Car-to-car bump: separate by weight and exchange momentum along the
// contact normal with a little bounce. Returns the closing speed.
export function bumpCars(a, b, ra, rb) {
  if (Math.abs(a.y - b.y) > 1.6) return 0;
  const dx = b.x - a.x, dz = b.z - a.z;
  const reach = ra + rb;
  const d2 = dx * dx + dz * dz;
  if (d2 >= reach * reach) return 0;
  const d = Math.sqrt(d2) || 0.001;
  const nx = dx / d, nz = dz / d;
  const ma = a.stats.weight, mb = b.stats.weight;
  const pen = reach - d;
  a.x -= nx * pen * (mb / (ma + mb));
  a.z -= nz * pen * (mb / (ma + mb));
  b.x += nx * pen * (ma / (ma + mb));
  b.z += nz * pen * (ma / (ma + mb));
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rel >= 0) return 0.001;
  const j = (-(1 + 0.3) * rel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx;
  a.vz -= (j / ma) * nz;
  b.vx += (j / mb) * nx;
  b.vz += (j / mb) * nz;
  return -rel;
}
