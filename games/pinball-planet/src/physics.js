// Pinball physics: DOM-free so Node can test it.
//
// The table is static colliders (segments, arcs and circles, each with a
// thickness) plus two kinematic flippers. Balls integrate at a fixed step and
// every step is split into sub-steps so that no ball moves more than
// MAX_SUBSTEP_MOVE relative to anything it could hit. Because that is under
// half a ball radius, a ball's centre can never jump across a wall between
// two checks: that is the conservative-advancement guarantee that stops
// tunnelling at any speed (tests fire balls at 6000 units/s).
//
// Units: table units (the table is 640 wide), seconds. +y is down the table.

export const BALL_R = 13;
export const GRAVITY = 1250; // along +y, the table's tilt towards the player
export const STEP = 1 / 240;
export const MAX_SPEED = 6500;
export const MAX_SUBSTEP_MOVE = BALL_R * 0.45;
const MAX_SUBSTEPS = 48;
// Impacts slower than this do not bounce: the ball settles into resting
// contact instead of jittering.
const REST_SPEED = 45;
const ROLL_DAMP = 0.06; // fraction of speed lost per second while rolling

const TAU = Math.PI * 2;

export function normAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

// Closest point on segment AB to P. Writes x, y and the parameter t.
export function closestOnSegment(px, py, ax, ay, bx, by, out) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.x = ax + dx * t;
  out.y = ay + dy * t;
  out.t = t;
  return out;
}

// Closest point on an arc of radius R around C that sweeps from angle a0 to
// a1 (a1 > a0; angles from atan2, so with +y down they run clockwise).
export function closestOnArc(px, py, cx, cy, R, a0, a1, out) {
  const ang = Math.atan2(py - cy, px - cx);
  const span = a1 - a0;
  const d = normAngle(ang - a0);
  if (d <= span) {
    out.x = cx + Math.cos(ang) * R;
    out.y = cy + Math.sin(ang) * R;
    out.t = d / span;
    return out;
  }
  const x0 = cx + Math.cos(a0) * R, y0 = cy + Math.sin(a0) * R;
  const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
  if ((px - x0) ** 2 + (py - y0) ** 2 <= (px - x1) ** 2 + (py - y1) ** 2) {
    out.x = x0; out.y = y0; out.t = 0;
  } else {
    out.x = x1; out.y = y1; out.t = 1;
  }
  return out;
}

const tmp = { x: 0, y: 0, t: 0 };

// Overlap between a ball and a collider. Returns the penetration depth (0 if
// apart) and writes the push-out normal (from the collider to the ball).
export function contact(ball, c, out) {
  let qx, qy;
  if (c.shape === 'circle') {
    qx = c.x; qy = c.y;
  } else if (c.shape === 'seg') {
    if (c.oneWay && (ball.x - c.ax) * c.oneWay.nx + (ball.y - c.ay) * c.oneWay.ny < 0) return 0;
    closestOnSegment(ball.x, ball.y, c.ax, c.ay, c.bx, c.by, tmp);
    qx = tmp.x; qy = tmp.y;
  } else {
    closestOnArc(ball.x, ball.y, c.x, c.y, c.R, c.a0, c.a1, tmp);
    qx = tmp.x; qy = tmp.y;
  }
  const dx = ball.x - qx, dy = ball.y - qy;
  const rr = ball.r + c.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2);
  if (d > 1e-9) {
    out.nx = dx / d; out.ny = dy / d;
  } else if (c.shape === 'seg') {
    const len = Math.hypot(c.bx - c.ax, c.by - c.ay) || 1;
    out.nx = -(c.by - c.ay) / len; out.ny = (c.bx - c.ax) / len;
  } else {
    out.nx = 0; out.ny = -1;
  }
  out.depth = rr - d;
  out.cx = qx + out.nx * c.r;
  out.cy = qy + out.ny * c.r;
  return out.depth;
}

// Push the ball out along n and apply an impulse against a surface moving at
// (svx, svy). Returns the approach speed (0 if it was already separating).
export function resolve(ball, nx, ny, depth, svx, svy, e, mu) {
  ball.x += nx * depth;
  ball.y += ny * depth;
  const rvx = ball.vx - svx, rvy = ball.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const bounce = -vn < REST_SPEED ? 0 : e;
  const jn = -(1 + bounce) * vn;
  const tx = rvx - vn * nx, ty = rvy - vn * ny;
  const vt = Math.hypot(tx, ty);
  let fx = 0, fy = 0;
  if (vt > 1e-9 && mu > 0) {
    const f = Math.min(mu * jn, vt) / vt;
    fx = -tx * f; fy = -ty * f;
  }
  ball.vx = svx + rvx + jn * nx + fx;
  ball.vy = svy + rvy + jn * ny + fy;
  return -vn;
}

// ------------------------------------------------------------ flippers

export const FLIPPER = {
  len: 84,
  r0: 13, // pivot end
  r1: 7, // tip
  restDeg: 30, // below horizontal
  upDeg: 28, // above horizontal
  upSpeed: 32, // rad/s while energised
  downSpeed: 17, // rad/s falling back
  e: 0.42,
  mu: 0.08,
};

// A flipper is a tapered capsule that rotates about its pivot. It is
// kinematic: driven at a fixed angular speed by its coil and stopped hard at
// both ends, so it gives the ball the full surface velocity at the contact
// point (fast near the tip, slow near the pivot), which is what makes
// tip-shots, cradles, drop-catches and post passes behave like a real table.
export class Flipper {
  constructor({ x, y, side, len = FLIPPER.len }) {
    this.x = x;
    this.y = y;
    this.side = side; // 'left' | 'right'
    this.len = len;
    this.r0 = FLIPPER.r0;
    this.r1 = FLIPPER.r1;
    const rest = (FLIPPER.restDeg * Math.PI) / 180;
    const up = (FLIPPER.upDeg * Math.PI) / 180;
    if (side === 'left') {
      this.rest = rest;
      this.up = -up;
    } else {
      this.rest = Math.PI - rest;
      this.up = Math.PI + up;
    }
    this.angle = this.rest;
    this.omega = 0;
    this.pressed = false;
    this.enabled = true;
  }

  get raised() { return this.angle === this.up; }

  // 0 at rest, 1 fully up.
  get lift() { return (this.angle - this.rest) / (this.up - this.rest); }

  get maxTipSpeed() { return FLIPPER.upSpeed * this.len; }

  update(dt) {
    const target = this.pressed && this.enabled ? this.up : this.rest;
    const diff = target - this.angle;
    if (diff === 0) { this.omega = 0; return; }
    const speed = target === this.up ? FLIPPER.upSpeed : FLIPPER.downSpeed;
    const move = Math.sign(diff) * speed * dt;
    if (Math.abs(move) >= Math.abs(diff)) {
      this.angle = target;
      this.omega = diff / dt;
    } else {
      this.angle += move;
      this.omega = move / dt;
    }
  }

  tip() {
    return { x: this.x + Math.cos(this.angle) * this.len, y: this.y + Math.sin(this.angle) * this.len };
  }

  // Overlap with a ball, like contact(); also writes the contact point's
  // surface velocity (svx, svy) and how far along the flipper it is (t).
  contact(ball, out) {
    const tx = this.x + Math.cos(this.angle) * this.len;
    const ty = this.y + Math.sin(this.angle) * this.len;
    closestOnSegment(ball.x, ball.y, this.x, this.y, tx, ty, tmp);
    const r = this.r0 + (this.r1 - this.r0) * tmp.t;
    const dx = ball.x - tmp.x, dy = ball.y - tmp.y;
    const rr = ball.r + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return 0;
    const d = Math.sqrt(d2) || 1e-9;
    out.nx = dx / d; out.ny = dy / d;
    if (d2 === 0) { out.nx = Math.sin(this.angle); out.ny = -Math.cos(this.angle); }
    out.depth = rr - d;
    out.t = tmp.t;
    const cx = tmp.x + out.nx * r, cy = tmp.y + out.ny * r;
    out.cx = cx; out.cy = cy;
    out.svx = -this.omega * (cy - this.y);
    out.svy = this.omega * (cx - this.x);
    return out.depth;
  }
}

// ------------------------------------------------------------ stepping

export function makeBall(x, y, vx = 0, vy = 0) {
  return { x, y, vx, vy, r: BALL_R, layer: 0, px: x, py: y, held: null, id: 0 };
}

// How many sub-steps keep every relative move under MAX_SUBSTEP_MOVE.
export function substepsFor(balls, flippers, dt) {
  let fast = 0;
  for (const b of balls) {
    if (b.held) continue;
    const s = Math.hypot(b.vx, b.vy) + GRAVITY * dt;
    if (s > fast) fast = s;
  }
  let flip = 0;
  for (const f of flippers) {
    const target = f.pressed && f.enabled ? f.up : f.rest;
    if (f.angle !== target || f.omega !== 0) flip = Math.max(flip, f.maxTipSpeed);
  }
  const n = Math.ceil(((fast + flip) * dt) / MAX_SUBSTEP_MOVE);
  return Math.max(1, Math.min(MAX_SUBSTEPS, n));
}

const hit = { nx: 0, ny: 0, depth: 0, cx: 0, cy: 0, svx: 0, svy: 0, t: 0 };

// One fixed step. `hooks.onHit(ball, collider, speed, hit)` is called for
// every impact (and may change the ball's velocity, e.g. bumper kicks);
// `hooks.onFlipper(ball, flipper, speed, hit)` for flipper contacts;
// `hooks.afterMove(ball, dt)` after each sub-step move (sensors, wells).
export function stepPhysics(balls, colliders, flippers, dt, hooks = {}) {
  const n = substepsFor(balls, flippers, dt);
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    for (const f of flippers) f.update(h);
    for (const b of balls) {
      if (b.held) continue;
      b.px = b.x; b.py = b.y;
      b.vy += GRAVITY * h;
      const damp = 1 - ROLL_DAMP * h;
      b.vx *= damp; b.vy *= damp;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
      b.x += b.vx * h;
      b.y += b.vy * h;
      // Two passes settle corners where the ball touches two surfaces.
      for (let pass = 0; pass < 2; pass++) {
        for (const c of colliders) {
          if (!c.enabled || c.layer !== b.layer) continue;
          if (contact(b, c, hit) > 0) {
            const speed = resolve(b, hit.nx, hit.ny, hit.depth, 0, 0, c.e, c.mu);
            if (hooks.onHit && pass === 0) hooks.onHit(b, c, speed, hit);
          }
        }
        if (b.layer === 0) {
          for (const f of flippers) {
            if (f.contact(b, hit) > 0) {
              const speed = resolve(b, hit.nx, hit.ny, hit.depth, hit.svx, hit.svy, FLIPPER.e, FLIPPER.mu);
              if (hooks.onFlipper && pass === 0) hooks.onFlipper(b, f, speed, hit);
            }
          }
        }
      }
      if (hooks.afterMove) hooks.afterMove(b, h);
    }
    collideBalls(balls, hooks);
  }
  return n;
}

function collideBalls(balls, hooks) {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.held) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.held || b.layer !== a.layer) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const push = (rr - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const j2 = (-(1 + 0.9) * vn) / 2;
        a.vx -= j2 * nx; a.vy -= j2 * ny;
        b.vx += j2 * nx; b.vy += j2 * ny;
        if (hooks.onBallHit) hooks.onBallHit(a, b, -vn);
      }
    }
  }
}

// Did the move P0->P1 cross segment AB? (sensor lines)
export function crosses(p0x, p0y, p1x, p1y, ax, ay, bx, by) {
  const d1 = (bx - ax) * (p0y - ay) - (by - ay) * (p0x - ax);
  const d2 = (bx - ax) * (p1y - ay) - (by - ay) * (p1x - ax);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0) || d1 === d2) return false;
  const d3 = (p1x - p0x) * (ay - p0y) - (p1y - p0y) * (ax - p0x);
  const d4 = (p1x - p0x) * (by - p0y) - (p1y - p0y) * (bx - p0x);
  return !((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0));
}
