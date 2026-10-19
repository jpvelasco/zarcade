// Ball flight, rim, board, blocker, trampoline and floor physics.
// DOM-free and deterministic: fixed step, no randomness, plain objects.
//
// Units are metres and seconds. x is right, y is up, z points from the
// shooter toward the hoop. The rim centre is the hoop position; the board's
// front face sits BOARD.offset behind it.

export const STEP = 1 / 240;
export const BALL_R = 0.12;
export const RIM_R = 0.28;
export const RIM_TUBE = 0.02;
export const RIM_Y = 3.05;
export const BOARD = { offset: 0.4, thick: 0.06, halfW: 0.9, below: 0.2, above: 0.9 };
export const NET_DEPTH = 0.46;
export const TRAMP_Y = 0.32;

export const BOUNCE = {
  rim: 0.55, rimSlide: 0.85,
  board: 0.62, boardSlide: 0.9,
  blocker: 0.8, blockerSlide: 0.9,
  floor: 0.68, floorSlide: 0.86,
  trampUp: 8, trampMax: 11,
};

// Where a (possibly moving) hoop is at time t, with its velocity so rim hits
// are resolved relative to the moving rim.
export function hoopState(hoop, t, out = {}) {
  const m = hoop.motion;
  out.z = hoop.z;
  if (!m) {
    out.x = hoop.x; out.y = hoop.y; out.vx = 0; out.vy = 0;
    return out;
  }
  const ax = m.ax || 0, wx = m.wx || 0, ay = m.ay || 0, wy = m.wy || 0, ph = m.ph || 0;
  out.x = hoop.x + ax * Math.sin(wx * t + ph);
  out.vx = ax * wx * Math.cos(wx * t + ph);
  out.y = hoop.y + ay * Math.sin(wy * t + ph * 0.7);
  out.vy = ay * wy * Math.cos(wy * t + ph * 0.7);
  return out;
}

// A blocker (box) at time t. Blockers may sway side to side.
export function blockerState(b, t, out = {}) {
  const sway = b.sway ? b.sway.ax * Math.sin(b.sway.w * t + (b.sway.ph || 0)) : 0;
  out.x = b.x + sway;
  out.vx = b.sway ? b.sway.ax * b.sway.w * Math.cos(b.sway.w * t + (b.sway.ph || 0)) : 0;
  out.y = b.y; out.z = b.z; out.hx = b.hx; out.hy = b.hy; out.hz = b.hz;
  return out;
}

export function makeBall(p, v, extra = {}) {
  return {
    p: { x: p.x, y: p.y, z: p.z },
    v: { x: v.x, y: v.y, z: v.z },
    t: 0,
    rot: 0,
    spin: -9, // backspin, radians per second around the shot's side axis
    rimHits: 0,
    touchedRim: false,
    touchedBoard: false,
    boardBeforeMake: false,
    rimBeforeMake: false,
    tramp: false,
    blocked: false,
    made: false,
    madeAt: -1,
    floorHits: 0,
    dead: false,
    rest: 0,
    ...extra,
  };
}

// Resolve a contact: push the ball out along n and bounce its velocity
// relative to a surface moving at (svx, svy, 0).
function bounce(ball, nx, ny, nz, depth, e, slide, svx, svy) {
  const p = ball.p, v = ball.v;
  p.x += nx * depth; p.y += ny * depth; p.z += nz * depth;
  const rx = v.x - svx, ry = v.y - svy, rz = v.z;
  const vn = rx * nx + ry * ny + rz * nz;
  if (vn >= 0) return 0;
  const tx = rx - vn * nx, ty = ry - vn * ny, tz = rz - vn * nz;
  const out = -vn * e;
  v.x = tx * slide + out * nx + svx;
  v.y = ty * slide + out * ny + svy;
  v.z = tz * slide + out * nz;
  return -vn;
}

// Sphere vs axis-aligned box given by centre and half sizes.
function boxContact(ball, cx, cy, cz, hx, hy, hz, e, slide, svx) {
  const p = ball.p;
  const qx = Math.max(cx - hx, Math.min(cx + hx, p.x));
  const qy = Math.max(cy - hy, Math.min(cy + hy, p.y));
  const qz = Math.max(cz - hz, Math.min(cz + hz, p.z));
  let dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
  let d = Math.hypot(dx, dy, dz);
  if (d >= BALL_R) return 0;
  if (d < 1e-6) {
    // Centre inside the box: leave by the nearest face.
    const ox = hx - Math.abs(p.x - cx), oy = hy - Math.abs(p.y - cy), oz = hz - Math.abs(p.z - cz);
    if (ox <= oy && ox <= oz) { dx = Math.sign(p.x - cx) || 1; dy = 0; dz = 0; d = -ox; }
    else if (oy <= oz) { dx = 0; dy = Math.sign(p.y - cy) || 1; dz = 0; d = -oy; }
    else { dx = 0; dy = 0; dz = Math.sign(p.z - cz) || -1; d = -oz; }
    return bounce(ball, dx, dy, dz, BALL_R - d, e, slide, svx, 0) || 0.01;
  }
  return bounce(ball, dx / d, dy / d, dz / d, BALL_R - d, e, slide, svx, 0) || 0.01;
}

const tmpHoop = {};
const tmpBlock = {};

// Advance one ball by dt. env: { g, hoop, time, blockers, tramp, rim }
//   hoop      { x, y, z, motion } (see hoopState)
//   time      the round clock at the start of this step (for moving parts)
//   blockers  [{ x, y, z, hx, hy, hz, sway }]
//   tramp     { x, z, r } or null
//   rim       false turns rim collisions off (used by the shot solver)
// Pushes events ({ type, ball, speed }) into `events` when given.
export function stepBall(ball, env, dt, events) {
  if (ball.dead) return;
  const p = ball.p, v = ball.v;
  const g = env.g;
  const h = hoopState(env.hoop, env.time || 0, tmpHoop);
  const py = p.y;
  const pxPrev = p.x, pzPrev = p.z;

  p.x += v.x * dt;
  p.y += v.y * dt - 0.5 * g * dt * dt;
  p.z += v.z * dt;
  v.y -= g * dt;
  ball.t += dt;
  ball.rot += ball.spin * dt;

  // Through the hoop: centre crosses the rim plane downward inside the ring.
  if (!ball.made && py >= h.y && p.y < h.y && v.y < 0) {
    const f = (py - h.y) / (py - p.y);
    const cx = pxPrev + (p.x - pxPrev) * f - h.x;
    const cz = pzPrev + (p.z - pzPrev) * f - h.z;
    if (cx * cx + cz * cz < RIM_R * RIM_R) {
      ball.made = true;
      ball.madeAt = ball.t;
      ball.boardBeforeMake = ball.touchedBoard;
      ball.rimBeforeMake = ball.touchedRim;
      events?.push({ type: 'make', ball, speed: -v.y });
    }
  }

  // The net catches a ball that went through and drops it out underneath.
  if (ball.made && p.y < h.y && p.y > h.y - NET_DEPTH - 0.1) {
    const dx = p.x - h.x, dz = p.z - h.z;
    if (dx * dx + dz * dz < RIM_R * RIM_R * 1.4) {
      const k = Math.exp(-7 * dt);
      v.x = h.vx + (v.x - h.vx) * k;
      v.z *= k;
      v.y *= Math.exp(-2.5 * dt);
    }
  }

  // Rim: closest point on the rim circle (torus with a thin tube).
  if (env.rim !== false) {
    const dx = p.x - h.x, dz = p.z - h.z;
    const dh = Math.hypot(dx, dz);
    const ux = dh > 1e-6 ? dx / dh : 1, uz = dh > 1e-6 ? dz / dh : 0;
    const nx0 = p.x - (h.x + ux * RIM_R), ny0 = p.y - h.y, nz0 = p.z - (h.z + uz * RIM_R);
    const d = Math.hypot(nx0, ny0, nz0);
    const minD = BALL_R + RIM_TUBE;
    if (d < minD && d > 1e-6) {
      const hit = bounce(ball, nx0 / d, ny0 / d, nz0 / d, minD - d, BOUNCE.rim, BOUNCE.rimSlide, h.vx, h.vy);
      if (hit > 0) {
        ball.touchedRim = true;
        ball.rimHits++;
        if (hit > 0.35) events?.push({ type: 'rim', ball, speed: hit });
      }
    }
  }

  // Backboard.
  {
    const bz = h.z + BOARD.offset + BOARD.thick / 2;
    const by = h.y + (BOARD.above - BOARD.below) / 2;
    const hit = boxContact(ball, h.x, by, bz, BOARD.halfW, (BOARD.above + BOARD.below) / 2, BOARD.thick / 2, BOUNCE.board, BOUNCE.boardSlide, h.vx);
    if (hit > 0) {
      if (!ball.touchedBoard && hit > 0.3) events?.push({ type: 'board', ball, speed: hit });
      ball.touchedBoard = true;
    }
  }

  // Blockers (inflatable defenders in trick shots).
  if (env.blockers) {
    for (const b0 of env.blockers) {
      const b = blockerState(b0, env.time || 0, tmpBlock);
      const hit = boxContact(ball, b.x, b.y, b.z, b.hx, b.hy, b.hz, BOUNCE.blocker, BOUNCE.blockerSlide, b.vx);
      if (hit > 0) {
        if (!ball.blocked && hit > 0.3) events?.push({ type: 'blocker', ball, speed: hit });
        ball.blocked = true;
      }
    }
  }

  // Trampoline: a springy floor disc that always throws the ball up at least
  // trampUp (scaled with gravity), keeping its forward speed.
  const tr = env.tramp;
  if (tr && v.y < 0 && py - BALL_R >= TRAMP_Y - 0.02 && p.y - BALL_R < TRAMP_Y) {
    const dx = p.x - tr.x, dz = p.z - tr.z;
    if (dx * dx + dz * dz < tr.r * tr.r) {
      p.y = TRAMP_Y + BALL_R;
      v.y = Math.min(BOUNCE.trampMax, Math.max(-v.y * 0.9, BOUNCE.trampUp * Math.sqrt(g / 9.8)));
      if (!ball.tramp) events?.push({ type: 'tramp', ball, speed: v.y });
      ball.tramp = true;
    }
  }

  // Floor.
  if (p.y < BALL_R) {
    p.y = BALL_R;
    if (v.y < 0) {
      const sp = -v.y;
      v.y = sp * BOUNCE.floor;
      v.x *= BOUNCE.floorSlide;
      v.z *= BOUNCE.floorSlide;
      if (sp > 0.8) {
        ball.floorHits++;
        events?.push({ type: 'floor', ball, speed: sp });
      }
      if (v.y < 0.4) v.y = 0;
    }
    // Rolling friction once it has settled.
    if (v.y === 0) {
      const k = Math.exp(-1.6 * dt);
      v.x *= k; v.z *= k;
    }
  }

  // A ball sitting on the rim for ages gets a tiny nudge (no stuck balls).
  if (ball.touchedRim && !ball.made && Math.abs(p.y - h.y) < 0.25 && Math.hypot(v.x, v.y, v.z) < 0.25) {
    ball.rest += dt;
    if (ball.rest > 1.2) {
      const dx = p.x - h.x, dz = p.z - h.z, dh = Math.hypot(dx, dz) || 1;
      v.x += (dx / dh) * 0.6; v.z += (dz / dh) * 0.6;
      ball.rest = 0;
    }
  }

  if (ball.made ? ball.floorHits >= 2 || ball.t - ball.madeAt > 2.5 : ball.floorHits >= 2 || ball.t > 7 || p.z > 6 || Math.abs(p.x - h.x) > 14) {
    ball.dead = true;
  }
}

// The shooter's launch velocity from yaw (0 = straight down +z, positive to
// the right), elevation above horizontal, and speed.
export function launchVelocity(yaw, elev, speed) {
  const c = Math.cos(elev) * speed;
  return { x: Math.sin(yaw) * c, y: Math.sin(elev) * speed, z: Math.cos(yaw) * c };
}
