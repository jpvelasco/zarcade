// The runner's movement: running, jumping, ladders, vines and quicksand.
// Pure functions over plain objects, so Node tests (and the autopilot's
// look-ahead) drive the exact physics the browser runs.
//
// The feel we are after: snappy acceleration, a jump you can shorten by
// letting go, generous timing windows (coyote time and jump buffering), and
// vines that swing like real pendulums you can pump.

import { TILE, isHazard, isLadder, isLedge, isSinking, isSolid, LAVA, SPIKES, WATER } from './tiles.js';

export const PHYS = Object.freeze({
  width: 10,
  height: 20,

  runMax: 96,
  runAccel: 900,
  airAccel: 720,
  turnBoost: 1.8,
  groundFriction: 1400,
  airFriction: 160,

  gravity: 900,       // while rising with jump held
  fallGravity: 1250,  // falling, or after letting go
  maxFall: 360,

  jumpVel: 320,
  jumpCut: 0.42,
  coyote: 0.1,
  buffer: 0.13,

  climbSpeed: 72,
  ladderHopX: 80,
  ladderHopY: 210,

  vineGravity: 900,
  vinePump: 2.4,
  vineDamp: 0.06,
  vineMaxAngle: 1.22,
  vineAmplitude: 0.72,
  vineDrive: 1.6,
  vineBoost: 170,
  vineRegrab: 0.32,
  vineReach: 10,

  sinkSpeed: 11,
  sinkMax: 14,
  sandRun: 0.45,
  sandJump: 0.82,

  stunTime: 0.45,
  safeEvery: 0.2,
});

/** A fresh runner standing with feet centered on (x, y). */
export function createPlayer(x, y, id = 0) {
  return {
    id,
    x: x - PHYS.width / 2,
    y: y - PHYS.height,
    w: PHYS.width,
    h: PHYS.height,
    vx: 0,
    vy: 0,
    mode: 'run',        // run | ladder | vine | stun
    onGround: false,
    coyote: 0,
    buffer: 0,
    jumpHeld: false,
    rising: false,
    facing: 1,
    duck: false,
    aimX: 1,
    aimY: 0,
    sink: 0,
    onSand: false,
    vine: -1,
    regrab: 0,
    stun: 0,
    carrier: -1,
    dropThrough: 0,
    hazard: null,
    safe: { x: x - PHYS.width / 2, y: y - PHYS.height },
    safeTimer: 0,
    airTime: 0,
    runTime: 0,
  };
}

/** Copy of the movement state, used by the autopilot's look-ahead. */
export function clonePlayer(p) {
  return { ...p, safe: { ...p.safe } };
}

/** A vine hanging from (ax, ay). Idle vines keep swinging on their own. */
export function createVine(ax, ay, len, phase = 0) {
  return { ax, ay, len, theta: PHYS.vineAmplitude * Math.sin(phase), omega: PHYS.vineAmplitude * Math.cos(phase) * Math.sqrt(PHYS.vineGravity / len), holder: -1 };
}

export function vineEnd(v) {
  return { x: v.ax + v.len * Math.sin(v.theta), y: v.ay + v.len * Math.cos(v.theta) };
}

/**
 * One step of the pendulum. A vine nobody holds is nudged toward a steady
 * swing (so it is always catchable); a held vine responds to pumping.
 */
export function stepVine(v, dt, pump = 0) {
  const k = PHYS.vineGravity / v.len;
  let acc = -k * Math.sin(v.theta);
  if (v.holder < 0) {
    const energy = 0.5 * v.omega * v.omega + k * (1 - Math.cos(v.theta));
    const target = k * (1 - Math.cos(PHYS.vineAmplitude));
    acc += PHYS.vineDrive * (target - energy) / Math.max(0.2, target) * v.omega;
  } else {
    acc -= PHYS.vineDamp * v.omega;
    if (pump !== 0 && (pump * v.omega > 0 || Math.abs(v.omega) < 0.35)) acc += pump * PHYS.vinePump;
  }
  v.omega += acc * dt;
  v.theta += v.omega * dt;
  if (Math.abs(v.theta) > PHYS.vineMaxAngle) {
    v.theta = Math.sign(v.theta) * PHYS.vineMaxAngle;
    v.omega *= -0.2;
  }
}

export function hurtbox(p) {
  if (p.duck) return { x: p.x + 1, y: p.y + 11, w: p.w - 2, h: p.h - 11 };
  return { x: p.x + 2, y: p.y + 4, w: p.w - 4, h: p.h - 5 };
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function span(min, size) {
  return [Math.floor(min / TILE), Math.floor((min + size - 1e-6) / TILE)];
}

/** True when the box overlaps any solid tile. */
export function boxHitsSolid(env, box) {
  const [c0, c1] = span(box.x, box.w);
  const [r0, r1] = span(box.y, box.h);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (isSolid(env.tileAt(c, r))) return true;
    }
  }
  return false;
}

function moveX(p, env, dx) {
  p.x += dx;
  const [c0, c1] = span(p.x, p.w);
  const [r0, r1] = span(p.y, p.h);
  let hit = 0;
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (!isSolid(env.tileAt(c, r))) continue;
      if (dx > 0) { p.x = Math.min(p.x, c * TILE - p.w); hit = 1; }
      else if (dx < 0) { p.x = Math.max(p.x, (c + 1) * TILE); hit = -1; }
    }
  }
  if (p.x < env.minX) { p.x = env.minX; hit = -1; }
  if (p.x + p.w > env.maxX) { p.x = env.maxX - p.w; hit = 1; }
  if (hit !== 0) p.vx = 0;
  return hit;
}

/** Can the top of this ladder tile be stood on? Only the topmost rung. */
function ladderTop(env, c, r) {
  return isLadder(env.tileAt(c, r)) && !isLadder(env.tileAt(c, r - 1));
}

function moveY(p, env, dy, opts) {
  const prevBottom = p.y + p.h;
  p.y += dy;
  const out = { land: 0, sand: false, rect: -1 };
  const [c0, c1] = span(p.x, p.w);
  const [r0, r1] = span(p.y, p.h);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const tile = env.tileAt(c, r);
      const top = r * TILE;
      if (isSolid(tile)) {
        if (dy > 0) { p.y = Math.min(p.y, top - p.h); out.land = 1; out.sand = false; }
        else if (dy < 0) { p.y = Math.max(p.y, top + TILE); out.land = -1; }
        continue;
      }
      if (dy <= 0 || opts.dropThrough) continue;
      let surface = null;
      if (isLedge(tile) || (ladderTop(env, c, r) && !opts.climbing)) surface = top;
      else if (isSinking(tile)) {
        // Sand catches you at whatever depth you are already sunk to.
        surface = top + Math.max(p.sink, Math.min(PHYS.sinkMax, prevBottom - top));
      }
      if (surface !== null && prevBottom <= surface + 1 && p.y + p.h > surface) {
        p.y = surface - p.h;
        if (isSinking(tile)) p.sink = surface - top;
        out.land = 1;
        out.sand = isSinking(tile);
      }
    }
  }
  if (dy > 0 && !opts.dropThrough) {
    const rects = env.rects;
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i];
      if (p.x + p.w <= rect.x || p.x >= rect.x + rect.w) continue;
      if (prevBottom <= rect.y + 2 && p.y + p.h > rect.y) {
        p.y = rect.y - p.h;
        out.land = 1;
        out.sand = false;
        out.rect = i;
      }
    }
  }
  if (out.land !== 0) p.vy = 0;
  return out;
}

function ladderUnder(p, env) {
  const c = Math.floor((p.x + p.w / 2) / TILE);
  const [r0, r1] = span(p.y + 2, p.h - 2);
  for (let r = r0; r <= r1; r += 1) if (isLadder(env.tileAt(c, r))) return c;
  return -1;
}

/** Aim direction from the stick, Contra style: 8 ways, prone on the ground. */
export function aimFrom(p, input) {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const up = !!input.up;
  const down = !!input.down;
  if (p.mode === 'ladder') return { x: p.facing, y: 0 };
  if (up && dx === 0) return { x: 0, y: -1 };
  if (up) return { x: dx, y: -1 };
  if (down && p.onGround && p.mode === 'run') return dx === 0 ? { x: p.facing, y: 0 } : { x: dx, y: 1 };
  if (down && dx === 0) return { x: 0, y: 1 };
  if (down) return { x: dx, y: 1 };
  return { x: dx || p.facing, y: 0 };
}

function tryGrabVine(p, env, out) {
  if (p.regrab > 0 || p.onGround || !env.vines) return;
  const hx = p.x + p.w / 2;
  const hy = p.y + 3;
  for (let i = 0; i < env.vines.length; i += 1) {
    const v = env.vines[i];
    if (v.holder >= 0 && v.holder !== p.id) continue;
    const end = vineEnd(v);
    const sx = end.x - v.ax;
    const sy = end.y - v.ay;
    const s = ((hx - v.ax) * sx + (hy - v.ay) * sy) / (v.len * v.len);
    if (s < 0.45 || s > 1.08) continue;
    const px = v.ax + sx * s;
    const py = v.ay + sy * s;
    if (Math.hypot(hx - px, hy - py) > PHYS.vineReach) continue;
    // Catch it: the runner's momentum feeds the swing.
    const tangential = p.vx * Math.cos(v.theta) - p.vy * Math.sin(v.theta);
    v.omega = 0.45 * v.omega + 0.7 * tangential / v.len;
    v.holder = p.id;
    p.mode = 'vine';
    p.vine = i;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.sink = 0;
    p.buffer = 0;
    out.grabbed = true;
    return;
  }
}

function placeOnVine(p, v) {
  const end = vineEnd(v);
  p.x = end.x - p.w / 2;
  p.y = end.y - 3;
}

/**
 * Advance the runner one fixed step.
 *
 * `input` is `{ left, right, up, down, jump, jumpPressed }`. `env` provides
 * `tileAt(c, r)`, `rects` (platforms you can land on: rafts, croc heads),
 * `hazards` (rects that hurt), `vines`, the horizontal bounds `minX`/`maxX`
 * and the level `bottom`.
 *
 * Returns what happened so the caller can make noise and dust.
 */
export function stepPlayer(p, input, env, dt) {
  const out = { jumped: false, landed: false, grabbed: false, released: false, climbing: false, bonk: false, sank: false };
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.hazard = null;
  p.regrab = Math.max(0, p.regrab - dt);
  p.dropThrough = Math.max(0, p.dropThrough - dt);
  if (input.jumpPressed) p.buffer = PHYS.buffer;
  else p.buffer = Math.max(0, p.buffer - dt);
  const wasHeld = p.jumpHeld;
  p.jumpHeld = !!input.jump;

  // ---------------------------------------------------------------- vine
  if (p.mode === 'vine') {
    const v = env.vines[p.vine];
    if (!v || v.holder !== p.id) {
      p.mode = 'run';
    } else {
      stepVine(v, dt, dir);
      placeOnVine(p, v);
      if (dir !== 0) p.facing = dir;
      if (p.buffer > 0 || input.down && input.jumpPressed) {
        const drop = !!input.down;
        p.vx = v.len * v.omega * Math.cos(v.theta);
        p.vy = drop ? 0 : Math.min(0, -v.len * v.omega * Math.sin(v.theta)) - PHYS.vineBoost;
        if (!drop && dir !== 0 && p.vx * dir < 60) p.vx = dir * 60;
        v.holder = -1;
        p.mode = 'run';
        p.vine = -1;
        p.regrab = PHYS.vineRegrab;
        p.buffer = 0;
        p.rising = !drop;
        p.coyote = 0;
        p.facing = p.vx >= 0 ? 1 : -1;
        out.released = true;
      } else if (boxHitsSolid(env, p)) {
        // Swung into a wall: let go rather than clip into it.
        v.holder = -1;
        p.mode = 'run';
        p.vine = -1;
        p.regrab = PHYS.vineRegrab;
        p.vx = 0;
        while (boxHitsSolid(env, p) && p.y > -64) p.y -= 1;
      } else {
        finish(p, env, dt, out);
        return out;
      }
    }
  }

  // --------------------------------------------------------------- stun
  if (p.mode === 'stun') {
    p.stun -= dt;
    if (p.stun <= 0) p.mode = 'run';
  }

  // -------------------------------------------------------------- ladder
  if (p.mode === 'run' && !p.duck) {
    const lc = ladderUnder(p, env);
    const below = Math.floor((p.x + p.w / 2) / TILE);
    const feetRow = Math.floor((p.y + p.h + 1) / TILE);
    if (input.up && !input.jump && lc >= 0 && p.regrab <= 0) {
      p.mode = 'ladder';
      p.x = lc * TILE + TILE / 2 - p.w / 2;
    } else if (input.down && p.onGround && dir === 0 && isLadder(env.tileAt(below, feetRow))) {
      p.mode = 'ladder';
      p.x = below * TILE + TILE / 2 - p.w / 2;
      p.y += 2;
    }
  }
  if (p.mode === 'ladder') {
    out.climbing = true;
    p.vx = 0;
    p.onGround = false;
    p.sink = 0;
    if (dir !== 0) p.facing = dir;
    if (p.buffer > 0 && dir !== 0) {
      p.mode = 'run';
      p.vx = dir * PHYS.ladderHopX;
      p.vy = -PHYS.ladderHopY;
      p.buffer = 0;
      p.rising = true;
      p.regrab = 0.25;
      out.jumped = true;
    } else {
      const vy = ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * PHYS.climbSpeed;
      p.vy = vy;
      const res = moveY(p, env, vy * dt, { dropThrough: true, climbing: true });
      const c = Math.floor((p.x + p.w / 2) / TILE);
      if (res.land > 0) {
        p.mode = 'run';
        p.onGround = true;
      } else if (ladderUnder(p, env) < 0) {
        // Off the top of the ladder: step onto it.
        let r = Math.floor((p.y + p.h + 2) / TILE);
        if (vy < 0 && isLadder(env.tileAt(c, r))) {
          while (isLadder(env.tileAt(c, r - 1))) r -= 1;
          p.y = r * TILE - p.h;
          p.onGround = true;
        }
        p.mode = 'run';
      }
      p.runTime += Math.abs(vy) * dt;
      finish(p, env, dt, out);
      return out;
    }
  }

  // ------------------------------------------------------- run and jump
  const stunned = p.mode === 'stun';
  const sandy = p.onGround && p.onSand;
  const move = stunned ? 0 : dir;
  p.duck = !stunned && p.onGround && !!input.down && move === 0;
  const maxSpeed = PHYS.runMax * (sandy ? PHYS.sandRun : 1);
  let accel = p.onGround ? PHYS.runAccel : PHYS.airAccel;
  const friction = p.onGround ? PHYS.groundFriction : PHYS.airFriction;
  if (move !== 0 && !p.duck) {
    if (move * p.vx < 0) accel *= PHYS.turnBoost;
    const before = p.vx;
    p.vx += move * accel * dt;
    if (move > 0) p.vx = Math.min(p.vx, Math.max(maxSpeed, before * (p.onGround ? 0 : 1)));
    else p.vx = Math.max(p.vx, Math.min(-maxSpeed, before * (p.onGround ? 0 : 1)));
    p.facing = move;
  } else if (p.vx !== 0) {
    const drop = friction * dt;
    p.vx = Math.abs(p.vx) <= drop ? 0 : p.vx - Math.sign(p.vx) * drop;
  }

  // Down + jump on a ledge drops through it.
  const onLedge = p.onGround && isLedge(env.tileAt(Math.floor((p.x + p.w / 2) / TILE), Math.floor((p.y + p.h + 1) / TILE)));
  if (!stunned && p.buffer > 0 && input.down && onLedge) {
    p.dropThrough = 0.16;
    p.onGround = false;
    p.buffer = 0;
    p.y += 1;
  } else if (!stunned && p.buffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = -PHYS.jumpVel * (sandy ? PHYS.sandJump : 1);
    p.onGround = false;
    p.coyote = 0;
    p.buffer = 0;
    p.rising = true;
    p.duck = false;
    p.sink = 0;
    p.onSand = false;
    out.jumped = true;
  }
  // Variable height: letting go early clips the rest of the rise.
  if (p.rising && wasHeld && !p.jumpHeld && p.vy < -PHYS.jumpVel * PHYS.jumpCut) p.vy *= PHYS.jumpCut;
  if (p.rising && !p.jumpHeld && !wasHeld && p.vy < -PHYS.jumpVel * PHYS.jumpCut && p.airTime > 0.05) p.vy *= PHYS.jumpCut;
  if (p.vy >= 0) p.rising = false;

  const g = p.rising && p.jumpHeld ? PHYS.gravity : PHYS.fallGravity;
  p.vy = Math.min(PHYS.maxFall, p.vy + g * dt);

  // Ride whatever we are standing on.
  if (p.onGround && p.carrier >= 0 && env.rects[p.carrier]) {
    const rect = env.rects[p.carrier];
    p.x += rect.dx || 0;
    p.y += rect.dy || 0;
  }

  if (moveX(p, env, p.vx * dt) !== 0 && p.onGround) p.vx = 0;
  const wasGround = p.onGround;
  if (p.onGround && p.onSand) {
    p.sink = Math.min(PHYS.sinkMax, p.sink + PHYS.sinkSpeed * dt);
    if (p.sink >= PHYS.sinkMax) {
      p.hazard = 'sand';
      out.sank = true;
    }
  }
  const res = moveY(p, env, p.vy * dt + (p.onSand && p.onGround ? 0.5 : 0), { dropThrough: p.dropThrough > 0, climbing: false });
  if (res.land > 0) {
    if (!wasGround) out.landed = true;
    p.onGround = true;
    p.rising = false;
    p.airTime = 0;
    p.onSand = res.sand;
    if (!res.sand) p.sink = 0;
    p.carrier = res.rect;
  } else {
    if (res.land < 0) { out.bonk = true; p.rising = false; }
    p.onGround = false;
    p.onSand = false;
    p.carrier = -1;
  }
  if (p.onGround) p.coyote = PHYS.coyote;
  else {
    p.coyote = Math.max(0, p.coyote - dt);
    p.airTime += dt;
  }
  if (p.onGround) p.runTime += Math.abs(p.vx) * dt;
  if (!p.onGround && p.mode === 'run') tryGrabVine(p, env, out);
  finish(p, env, dt, out);
  return out;
}

/** Hazards, quicksand and the "last safe spot" used for kind respawns. */
function finish(p, env, dt, out) {
  if (p.x < env.minX) p.x = env.minX;
  if (p.x + p.w > env.maxX) p.x = env.maxX - p.w;
  if (p.y > env.bottom) {
    p.hazard = 'pit';
    return;
  }
  if (p.hazard) return;
  const box = hurtbox(p);
  const [c0, c1] = span(box.x, box.w);
  const [r0, r1] = span(box.y, box.h);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const tile = env.tileAt(c, r);
      if (!isHazard(tile)) continue;
      const lip = tile === SPIKES ? 7 : 6;
      if (box.y + box.h > r * TILE + lip) {
        p.hazard = tile === WATER ? 'water' : tile === LAVA ? 'lava' : 'spikes';
        return;
      }
    }
  }
  if (env.hazards) {
    for (const zone of env.hazards) {
      if (overlaps(box, zone)) {
        p.hazard = zone.kind || 'bite';
        return;
      }
    }
  }
  // Remember solid footing a little away from edges, for respawns.
  if (p.onGround && !p.onSand && p.carrier < 0 && p.mode === 'run') {
    const row = Math.floor((p.y + p.h + 1) / TILE);
    const left = env.tileAt(Math.floor((p.x - 6) / TILE), row);
    const right = env.tileAt(Math.floor((p.x + p.w + 6) / TILE), row);
    const firm = (t) => isSolid(t) || isLedge(t) || t === 'H';
    if (firm(left) && firm(right)) {
      p.safeTimer += dt;
      if (p.safeTimer >= PHYS.safeEvery) {
        p.safeTimer = 0;
        p.safe.x = p.x;
        p.safe.y = p.y;
      }
    }
  }
}
