// The exact, DOM-free simulation. Node tests and the browser drive the same
// code: feed a launch and the comet flies, bounces, drifts and either reaches
// the star or settles. One step() advances physics by a fixed dt; stepShot()
// runs a whole launch to its end and reports the outcome.
//
// Energy always drains (restitution < 1 plus per-second friction), so every
// shot ends in finite time.
import { FIELD, COMET, PHYSICS, STAR, LETTER } from './config.js';
import { clamp, perStepKeep, circleRectHit, angleOf } from './math.js';

export const FLYING = 'flying';
export const SETTLED = 'settled';
export const STAR_OUT = 'star';

const NONE = [];

// Letters already in the satchel are carried from shot to shot as a bitmask, so
// a whole delivery attempt is described by (position, mask).
export function makeShot(px, py, vx, vy, letters = 0) {
  // `hits` counts reflections for the whole shot; `hit` carries the one from
  // the step just taken (impact point, normal and speed) so the browser can
  // play a thock and spark exactly where the comet struck, and the aim preview
  // can stop after a set number of bounces. `got` is the letter index picked up
  // on this step, or -1.
  return { x: px, y: py, vx, vy, t: 0, result: FLYING, hits: 0, hit: null, letters, got: -1, warp: null };
}

export const hasLetter = (mask, i) => (mask & (1 << i)) !== 0;
export const allLetters = (level) => (1 << (level.letters?.length || 0)) - 1;
export const letterCount = (mask) => {
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
};

// Record a reflection. Called before the velocity is changed, so `speed` is the
// impact speed.
function bump(shot, nx, ny) {
  shot.hits++;
  shot.hit = { x: shot.x, y: shot.y, nx, ny, speed: Math.hypot(shot.vx, shot.vy) };
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
    const fromX = shot.x;
    const fromY = shot.y;
    shot.x = dest.x + (Math.abs(shot.vx) > 1e-9 ? (shot.vx > 0 ? off : -off) : 0);
    shot.y = dest.y + (Math.abs(shot.vy) > 1e-9 ? (shot.vy > 0 ? off : -off) : 0);
    // A jump, not travel: callers must not count it as distance flown, and the
    // drawn path must not run a dotted line straight through the walls between.
    shot.warp = { fromX, fromY, x: shot.x, y: shot.y };
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
  shot.hit = null;
  shot.got = -1;
  shot.warp = null;

  // Wind zones push while the comet is inside them.
  let fx = 0;
  let fy = 0;
  for (const w of level.winds) {
    if (inRect(shot.x, shot.y, w)) {
      fx += w.vx;
      fy += w.vy;
    }
  }

  // Gravity wells pull toward their centre, strongest at the middle and nothing
  // at the rim. Linear falloff: no singularity, and the whole pull a crossing
  // can add is bounded by sqrt(g * r).
  for (const w of level.wells || NONE) {
    const dx = w.x - shot.x;
    const dy = w.y - shot.y;
    const d = Math.hypot(dx, dy);
    if (d >= w.r || d < 1e-6) continue;
    const a = w.g * (1 - d / w.r);
    fx += (dx / d) * a;
    fy += (dy / d) * a;
  }
  shot.vx += fx * dt;
  shot.vy += fy * dt;
  shot.x += shot.vx * dt;
  shot.y += shot.vy * dt;

  // Outer walls: reflect and bleed a little energy.
  if (shot.x < r) {
    shot.x = r;
    if (shot.vx < 0) { bump(shot, 1, 0); shot.vx *= -PHYSICS.rest; }
  } else if (shot.x > FIELD.w - r) {
    shot.x = FIELD.w - r;
    if (shot.vx > 0) { bump(shot, -1, 0); shot.vx *= -PHYSICS.rest; }
  }
  if (shot.y < r) {
    shot.y = r;
    if (shot.vy < 0) { bump(shot, 0, 1); shot.vy *= -PHYSICS.rest; }
  } else if (shot.y > FIELD.h - r) {
    shot.y = FIELD.h - r;
    if (shot.vy > 0) { bump(shot, 0, -1); shot.vy *= -PHYSICS.rest; }
  }

  // Blocks.
  for (const b of level.blocks) {
    const hit = circleRectHit(shot.x, shot.y, r, b);
    if (!hit) continue;
    shot.x += hit.nx * hit.depth;
    shot.y += hit.ny * hit.depth;
    const vn = shot.vx * hit.nx + shot.vy * hit.ny;
    if (vn < 0) {
      bump(shot, hit.nx, hit.ny);
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
      bump(shot, nx, ny);
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

  // Mail letters: swept up in passing, and carried for the rest of the attempt.
  const letters = level.letters || NONE;
  for (let i = 0; i < letters.length; i++) {
    if (shot.letters & (1 << i)) continue;
    const l = letters[i];
    if (Math.hypot(shot.x - l.x, shot.y - l.y) > LETTER.pick) continue;
    shot.letters |= 1 << i;
    shot.got = i;
  }

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

// Run a full launch to its end. Returns { outcome, x, y, t, letters }.
export function stepShot(level, px, py, vx, vy, dt = PHYSICS.step, letters = 0) {
  const shot = makeShot(px, py, vx, vy, letters);
  while (step(shot, level, dt) === FLYING) {
    // advance
  }
  return { outcome: shot.result, x: shot.x, y: shot.y, t: shot.t, letters: shot.letters };
}

// The aim projection: the real simulation run forward from where the comet
// rests, so what the player is shown is exactly what will happen. It is cut
// short on purpose — after `bounces` reflections or `maxLen` units of travel —
// so it reads as a plan rather than a promise, and later worlds can show less.
//
// Returns sampled points (`bounce: true` marks an impact), where the projection
// stopped and why: 'star' (this aim delivers), 'settle' (the comet stops there),
// or 'cut' (the projection ran out before the shot did). `complete` says whether
// the satchel would be full at that point, so an aim that delivers early — and
// leaves letters behind — can be drawn as the warning it is.
export function previewPath(level, px, py, angle, power, opts = {}) {
  const {
    bounces = 2,
    maxLen = 900,
    maxTime = PHYSICS.shotTimeMax,
    dt = PHYSICS.step,
    sample = 8,
    letters = 0,
  } = opts;
  const v = launchVector(angle, power);
  const shot = makeShot(px, py, v.vx, v.vy, letters);
  const pts = [{ x: px, y: py, bounce: false }];
  let prevX = px;
  let prevY = py;
  let len = 0;
  let since = 0;
  let end = 'cut';
  // The step count is bounded by maxTime, but keep a hard cap as a backstop.
  for (let i = 0; i < 20000; i++) {
    const res = step(shot, level, dt);
    const warped = !!shot.warp;
    const seg = warped ? 0 : Math.hypot(shot.x - prevX, shot.y - prevY);
    prevX = shot.x;
    prevY = shot.y;
    len += seg;
    since += seg;
    if (warped) {
      pts.push({ x: shot.x, y: shot.y, bounce: false, warp: true });
      since = 0;
    } else if (shot.hit) {
      pts.push({ x: shot.x, y: shot.y, bounce: true });
      since = 0;
      if (shot.hits > bounces) break;
    } else if (since >= sample) {
      pts.push({ x: shot.x, y: shot.y, bounce: false });
      since = 0;
    }
    if (res === STAR_OUT) { end = 'star'; break; }
    if (res === SETTLED) { end = 'settle'; break; }
    if (len >= maxLen || shot.t >= maxTime) break;
  }
  const tail = pts[pts.length - 1];
  if (tail.x !== shot.x || tail.y !== shot.y) pts.push({ x: shot.x, y: shot.y, bounce: false });
  return { pts, end, len, x: shot.x, y: shot.y, letters: shot.letters, complete: shot.letters === allLetters(level) };
}

// A launch vector from an angle (radians) and a power in [0, 1].
export function launchVector(angle, power) {
  const p = clamp(power, 0, 1) * (COMET.maxPower - COMET.minPower) + COMET.minPower;
  return { vx: Math.cos(angle) * p, vy: Math.sin(angle) * p };
}

export const shotAngle = (vx, vy) => angleOf(vx, vy);
