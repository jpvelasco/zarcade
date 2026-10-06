// The exact, DOM-free simulation. Node tests and the browser drive the same
// code: feed a launch and the comet flies, bounces, drifts and either reaches
// the star or settles. One step() advances physics by a fixed dt; stepShot()
// runs a whole launch to its end and reports the outcome.
//
// Energy always drains (restitution < 1 plus per-second friction), so every
// shot ends in finite time.
import { FIELD, COMET, PHYSICS, STAR } from './config.js';
import { clamp, perStepKeep, circleRectHit, angleOf } from './math.js';

export const FLYING = 'flying';
export const SETTLED = 'settled';
export const STAR_OUT = 'star';

export function makeShot(px, py, vx, vy) {
  return { x: px, y: py, vx, vy, t: 0, result: FLYING };
}

const MOUTH_R = 18;
const inMouth = (x, y, mx, my) => Math.abs(x - mx) <= MOUTH_R && Math.abs(y - my) <= MOUTH_R;

// Teleport the comet through a portal mouth it is standing in. The mouth
// only triggers when the comet is moving toward (or across) the partner
// mouth, so passing back the way it came is a no-op. The exit lands just
// outside the partner's trigger box, along the direction of travel, so the
// comet does not immediately re-enter it.
function portalTeleport(shot, level) {
  for (const p of level.portals) {
    const inA = inMouth(shot.x, shot.y, p.ax, p.ay);
    const inB = inMouth(shot.x, shot.y, p.bx, p.by);
    if (!inA && !inB) continue;
    const src = inA ? { x: p.ax, y: p.ay } : { x: p.bx, y: p.by };
    const dest = inA ? { x: p.bx, y: p.by } : { x: p.ax, y: p.ay };
    if (shot.vx * (dest.x - src.x) + shot.vy * (dest.y - src.y) < 0) continue;
    const off = MOUTH_R + 3;
    shot.x = dest.x + (Math.abs(shot.vx) > 1e-9 ? (shot.vx > 0 ? off : -off) : 0);
    shot.y = dest.y + (Math.abs(shot.vy) > 1e-9 ? (shot.vy > 0 ? off : -off) : 0);
    break;
  }
}

function inRect(px, py, box) {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}

// Advance one fixed step. The shot's `result` stays FLYING while it is still
// moving; it becomes STAR or SETTLED when the shot ends.
export function step(shot, level, dt = PHYSICS.step) {
  if (shot.result !== FLYING) return shot.result;
  const r = COMET.r;
  shot.t += dt;

  // Wind zones push while the comet is inside them.
  let fx = 0;
  let fy = 0;
  for (const w of level.winds) {
    if (inRect(shot.x, shot.y, w)) {
      fx += w.vx;
      fy += w.vy;
    }
  }
  shot.vx += fx * dt;
  shot.vy += fy * dt;
  shot.x += shot.vx * dt;
  shot.y += shot.vy * dt;

  // Outer walls: reflect and bleed a little energy.
  if (shot.x < r) {
    shot.x = r;
    if (shot.vx < 0) shot.vx *= -PHYSICS.rest;
  } else if (shot.x > FIELD.w - r) {
    shot.x = FIELD.w - r;
    if (shot.vx > 0) shot.vx *= -PHYSICS.rest;
  }
  if (shot.y < r) {
    shot.y = r;
    if (shot.vy < 0) shot.vy *= -PHYSICS.rest;
  } else if (shot.y > FIELD.h - r) {
    shot.y = FIELD.h - r;
    if (shot.vy > 0) shot.vy *= -PHYSICS.rest;
  }

  // Blocks.
  for (const b of level.blocks) {
    const hit = circleRectHit(shot.x, shot.y, r, b);
    if (!hit) continue;
    shot.x += hit.nx * hit.depth;
    shot.y += hit.ny * hit.depth;
    const vn = shot.vx * hit.nx + shot.vy * hit.ny;
    if (vn < 0) {
      shot.vx -= (1 + PHYSICS.blockRest) * vn * hit.nx;
      shot.vy -= (1 + PHYSICS.blockRest) * vn * hit.ny;
    }
  }

  // Asteroids (circles).
  for (const a of level.asteroids) {
    const dx = shot.x - a.x;
    const dy = shot.y - a.y;
    const rr = a.r + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d;
    const ny = dy / d;
    shot.x = a.x + nx * rr;
    shot.y = a.y + ny * rr;
    const vn = shot.vx * nx + shot.vy * ny;
    if (vn < 0) {
      shot.vx -= (1 + PHYSICS.astRest) * vn * nx;
      shot.vy -= (1 + PHYSICS.astRest) * vn * ny;
    }
  }

  // Spring pads: a steady kick along the pad's arrow while inside, so a
  // crossing gives roughly springBoost of speed.
  const springAccel = COMET.springBoost / 0.2;
  for (const s of level.springs) {
    if (!inRect(shot.x, shot.y, s)) continue;
    shot.vx += s.nx * springAccel * dt;
    shot.vy += s.ny * springAccel * dt;
  }

  // Portals: enter one mouth, exit the other with the velocity preserved.
  portalTeleport(shot, level);

  // Friction: keep a fixed fraction of speed each second.
  const keep = perStepKeep(PHYSICS.friction, dt);
  shot.vx *= keep;
  shot.vy *= keep;

  // Capture: the comet's centre inside the star's ring.
  if (Math.hypot(shot.x - level.star.x, shot.y - level.star.y) <= STAR.r) {
    shot.result = STAR_OUT;
    return shot.result;
  }

  // Settle: slow enough, or the shot ran too long.
  if (Math.hypot(shot.vx, shot.vy) < COMET.settle || shot.t > PHYSICS.shotTimeMax) {
    shot.vx = 0;
    shot.vy = 0;
    shot.result = SETTLED;
  }
  return shot.result;
}

// Run a full launch to its end. Returns { outcome, x, y, t }.
export function stepShot(level, px, py, vx, vy, dt = PHYSICS.step) {
  const shot = makeShot(px, py, vx, vy);
  while (step(shot, level, dt) === FLYING) {
    // advance
  }
  return { outcome: shot.result, x: shot.x, y: shot.y, t: shot.t };
}

// A launch vector from an angle (radians) and a power in [0, 1].
export function launchVector(angle, power) {
  const p = clamp(power, 0, 1) * (COMET.maxPower - COMET.minPower) + COMET.minPower;
  return { vx: Math.cos(angle) * p, vy: Math.sin(angle) * p };
}

export const shotAngle = (vx, vy) => angleOf(vx, vy);
