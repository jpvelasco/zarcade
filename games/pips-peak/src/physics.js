// Pip's movement. Pure functions over plain objects so Node tests can drive
// the exact same physics the browser runs.
//
// The feel we are after: quick to top speed, quick to stop, a jump you can
// shorten by letting go, and generous timing windows (coyote time + jump
// buffering) so a jump almost never feels stolen.

import { ICE, MUSHROOM, PLATFORM, TILE, isBlocking, isPlatform } from './tiles.js';

export const PHYS = Object.freeze({
  width: 10,
  height: 14,

  runMax: 128,
  runAccel: 1000,
  airAccel: 760,
  turnBoost: 1.9,
  groundFriction: 1250,
  airFriction: 220,

  iceAccel: 330,
  iceFriction: 90,
  iceMax: 146,

  gravity: 1100,
  fallGravity: 1500,
  maxFall: 430,

  jumpVel: 340,
  doubleJumpVel: 292,
  jumpCut: 0.38,
  coyote: 0.1,
  buffer: 0.12,

  wallSlideMax: 96,
  wallJumpX: 158,
  wallJumpY: 326,
  wallLock: 0.11,
  wallStick: 3,      // how far past the wall we probe for a grab
  wallGrace: 0.13,   // a kick still lands just after leaving the wall

  mushroomVel: 524,
  enemyBounce: 306,
  windScale: 1,
});

/** A fresh Pip standing at the given world position (feet centered on x). */
export function createPlayer(x, y) {
  return {
    x: x - PHYS.width / 2,
    y: y - PHYS.height,
    w: PHYS.width,
    h: PHYS.height,
    vx: 0,
    vy: 0,
    onGround: false,
    groundTile: ' ',
    coyote: 0,
    buffer: 0,
    airJumps: 0,
    jumpHeld: false,
    rising: false,
    launched: false, // rising from a spring or a bounce, not a held button
    wallDir: 0,
    wallSlide: false,
    wallLock: 0,
    wallTouch: 0,
    wallGrace: 0,
    facing: 1,
    squash: 0, // >0 squashed (landing), <0 stretched (rising)
    airTime: 0,
    rideDx: 0,
    rideDy: 0,
    dropThrough: 0,
    carrier: null,
  };
}

export function playerCenter(p) {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Tile columns/rows a box covers, clamped to nothing (callers guard bounds). */
function span(min, size) {
  return [Math.floor(min / TILE), Math.floor((min + size - 1e-6) / TILE)];
}

/**
 * True when the box overlaps any blocking tile. Used for wall probes and
 * spawn-safety checks.
 */
export function boxHitsSolid(terrain, box) {
  const [c0, c1] = span(box.x, box.w);
  const [r0, r1] = span(box.y, box.h);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (isBlocking(terrain.tileAt(c, r))) return true;
    }
  }
  return false;
}

function moveX(p, terrain, rects, dx) {
  const prevX = p.x;
  p.x += dx;
  let hit = 0;
  const [c0, c1] = span(p.x, p.w);
  const [r0, r1] = span(p.y, p.h);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (!isBlocking(terrain.tileAt(c, r))) continue;
      if (dx > 0) {
        p.x = Math.min(p.x, c * TILE - p.w);
        hit = 1;
      } else if (dx < 0) {
        p.x = Math.max(p.x, (c + 1) * TILE);
        hit = -1;
      }
    }
  }
  for (const rect of rects) {
    if (!rect.solid || !overlaps(p, rect)) continue;
    // Only a side Pip ran into counts. An overlap he was already in (a stone
    // that rose into his feet) is left for the vertical move to settle.
    if (dx > 0 && prevX + p.w <= rect.x + 0.5) {
      p.x = rect.x - p.w;
      hit = 1;
    } else if (dx < 0 && prevX >= rect.x + rect.w - 0.5) {
      p.x = rect.x + rect.w;
      hit = -1;
    }
  }
  if (hit !== 0) p.vx = 0;
  return hit;
}

function moveY(p, terrain, rects, dy, dropThrough) {
  const prevBottom = p.y + p.h;
  p.y += dy;
  const out = { land: 0, landedOn: ' ', rect: null };
  const [c0, c1] = span(p.x, p.w);
  const [r0, r1] = span(p.y, p.h);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const tile = terrain.tileAt(c, r);
      const top = r * TILE;
      if (isPlatform(tile)) {
        // One-way: only catches a falling Pip whose feet were above it.
        if (dy > 0 && !dropThrough && prevBottom <= top + 1) {
          p.y = top - p.h;
          out.land = 1;
          out.landedOn = tile;
        }
        continue;
      }
      if (!isBlocking(tile)) continue;
      if (dy > 0) {
        p.y = Math.min(p.y, top - p.h);
        out.land = 1;
        out.landedOn = tile;
      } else if (dy < 0) {
        p.y = Math.max(p.y, top + TILE);
        out.land = -1;
      }
    }
  }
  for (const rect of rects) {
    if (!overlaps(p, rect)) continue;
    // Leaves are one-way like planks, so dropping through skips them too.
    if (dy > 0 && (rect.solid || (!dropThrough && prevBottom <= rect.y + 1))) {
      p.y = rect.y - p.h;
      out.land = 1;
      out.landedOn = rect.tile || '-';
      out.rect = rect;
    } else if (dy < 0 && rect.solid) {
      p.y = rect.y + rect.h;
      out.land = -1;
    }
  }
  if (out.land !== 0) p.vy = 0;
  return out;
}

/** Which tile Pip is standing on, so ice can be slippery. */
function surfaceUnder(p, terrain, rects) {
  for (const rect of rects) {
    if (p.x < rect.x + rect.w && p.x + p.w > rect.x && Math.abs(p.y + p.h - rect.y) < 1.5) {
      return rect.tile || '-';
    }
  }
  const row = Math.floor((p.y + p.h + 1) / TILE);
  const [c0, c1] = span(p.x, p.w);
  for (let c = c0; c <= c1; c += 1) {
    const tile = terrain.tileAt(c, row);
    if (isBlocking(tile) || isPlatform(tile)) return tile;
  }
  return ' ';
}

/**
 * Advance Pip one fixed step.
 *
 * `input` is `{ left, right, down, jump, jumpPressed, dropPressed }`; `opts` carries the
 * level abilities, the solid rectangles contributed by moving platforms, and
 * any wind acceleration.
 *
 * Returns the notable things that happened this step so the caller can make
 * noise and puff dust.
 */
export function stepPlayer(p, input, terrain, dt, opts = {}) {
  const abilities = opts.abilities || {};
  const rects = opts.rects || [];
  const windAx = opts.windAx || 0;
  const windAy = opts.windAy || 0;
  const out = { jumped: null, landed: false, bounced: false, bonked: false, startedWallSlide: false };

  // Down + jump on a one-way platform steps off it instead of jumping. The
  // touch duck button sends `dropPressed` so one thumb can do it alone.
  const onOneWay = p.onGround && (p.groundTile === PLATFORM || (p.carrier && !p.carrier.solid));
  const wantDrop = onOneWay && (!!input.dropPressed || (!!input.down && !!input.jumpPressed));
  if (wantDrop) {
    p.dropThrough = 0.14;
    p.onGround = false;
    p.y += 1;
  } else if (input.jumpPressed) {
    p.buffer = PHYS.buffer;
  }
  p.dropThrough = Math.max(0, p.dropThrough - dt);
  p.buffer = Math.max(0, p.buffer - dt);
  p.wallLock = Math.max(0, p.wallLock - dt);
  const wasHeld = p.jumpHeld;
  p.jumpHeld = !!input.jump;

  // --- horizontal intent -----------------------------------------------
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const icy = p.onGround && p.groundTile === ICE;
  const maxSpeed = icy ? PHYS.iceMax : PHYS.runMax;
  let accel = p.onGround ? (icy ? PHYS.iceAccel : PHYS.runAccel) : PHYS.airAccel;
  const friction = p.onGround ? (icy ? PHYS.iceFriction : PHYS.groundFriction) : PHYS.airFriction;

  if (dir !== 0 && p.wallLock <= 0) {
    if (dir * p.vx < 0) accel *= PHYS.turnBoost;
    const before = p.vx;
    p.vx += dir * accel * dt;
    // Accelerating never pushes past top speed, but existing overspeed from a
    // spring, a gust or a wall jump is allowed to bleed off on its own.
    if (dir > 0) p.vx = Math.min(p.vx, Math.max(maxSpeed, before));
    else p.vx = Math.max(p.vx, Math.min(-maxSpeed, before));
    p.facing = dir;
  } else if (p.vx !== 0) {
    const drop = friction * dt;
    p.vx = Math.abs(p.vx) <= drop ? 0 : p.vx - Math.sign(p.vx) * drop;
  }
  p.vx += windAx * dt;

  // --- walls ------------------------------------------------------------
  // Touching a wall is tracked on both sides, so a kick still works if you
  // have already tilted away from it. Sliding needs you to lean in. Either
  // one needs Pip to have stopped rising fast, so brushing a wall on the way
  // up from a jump never hands out a bonus kick.
  let wall = 0;
  if (abilities.wallJump && !p.onGround) {
    const probe = { y: p.y + 2, w: p.w, h: p.h - 4 };
    if (boxHitsSolid(terrain, { ...probe, x: p.x + PHYS.wallStick })) wall = 1;
    else if (boxHitsSolid(terrain, { ...probe, x: p.x - PHYS.wallStick })) wall = -1;
  }
  const grips = wall !== 0 && p.vy > -40;
  if (grips) {
    p.wallTouch = wall;
    p.wallGrace = PHYS.wallGrace;
  } else {
    p.wallGrace = Math.max(0, p.wallGrace - dt);
    if (p.wallGrace === 0) p.wallTouch = 0;
  }
  const sliding = grips && dir === wall;
  if (sliding && !p.wallSlide) out.startedWallSlide = true;
  p.wallSlide = sliding;
  p.wallDir = wall;

  // --- jumps ------------------------------------------------------------
  if (p.buffer > 0) {
    if (p.onGround || p.coyote > 0) {
      p.vy = -PHYS.jumpVel;
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      p.rising = true;
      p.launched = false;
      p.squash = -0.8;
      out.jumped = 'ground';
    } else if (p.wallGrace > 0 && p.wallTouch !== 0) {
      const from = p.wallTouch;
      p.vy = -PHYS.wallJumpY;
      p.vx = -from * PHYS.wallJumpX;
      p.facing = -from;
      p.wallGrace = 0;
      p.wallTouch = 0;
      p.wallLock = PHYS.wallLock;
      p.buffer = 0;
      p.rising = true;
      p.launched = false;
      p.squash = -0.8;
      p.airJumps = abilities.doubleJump ? 1 : 0;
      out.jumped = 'wall';
    } else if (p.airJumps > 0) {
      p.airJumps -= 1;
      p.vy = -PHYS.doubleJumpVel;
      p.buffer = 0;
      p.rising = true;
      p.launched = false;
      p.squash = -0.7;
      out.jumped = 'double';
    }
  }
  // Variable height: letting go early clips the rest of the rise. A spring
  // launch is not the player's jump, so it is never cut short.
  if (p.rising && !p.launched && wasHeld && !p.jumpHeld && p.vy < -PHYS.jumpVel * PHYS.jumpCut) {
    p.vy *= PHYS.jumpCut;
  }
  if (p.vy >= 0) p.rising = false;

  // --- gravity ----------------------------------------------------------
  const g = p.rising && (p.jumpHeld || p.launched) ? PHYS.gravity : PHYS.fallGravity;
  p.vy += (g + windAy) * dt;
  p.vy = Math.min(p.vy, PHYS.maxFall);
  if (sliding) p.vy = Math.min(p.vy, PHYS.wallSlideMax);

  // --- integrate + collide ---------------------------------------------
  p.x += p.rideDx;
  p.y += p.rideDy;
  p.rideDx = 0;
  p.rideDy = 0;

  // A stone that slid into Pip this step pushes him along, rather than
  // leaving him inside it for the vertical move to snap to its top or bottom.
  for (const rect of rects) {
    if (!rect.solid || !rect.dx || rect === p.carrier || !overlaps(p, rect)) continue;
    const depth = rect.dx > 0 ? rect.x + rect.w - p.x : p.x + p.w - rect.x;
    if (depth <= Math.abs(rect.dx) + 0.5) p.x = rect.dx > 0 ? rect.x + rect.w : rect.x - p.w;
  }

  moveX(p, terrain, rects, p.vx * dt);
  const wasGround = p.onGround;
  const vertical = moveY(p, terrain, rects, p.vy * dt, p.dropThrough > 0);

  if (vertical.land > 0) {
    if (vertical.landedOn === MUSHROOM) {
      p.vy = -PHYS.mushroomVel;
      p.rising = true;
      p.launched = true;
      p.airJumps = abilities.doubleJump ? 1 : 0;
      p.squash = 0.9;
      p.onGround = false;
      out.bounced = true;
    } else {
      if (!wasGround) {
        out.landed = true;
        p.squash = Math.min(1, 0.35 + p.airTime * 0.9);
      }
      p.onGround = true;
      p.launched = false;
      p.airTime = 0;
      p.airJumps = abilities.doubleJump ? 1 : 0;
      p.rising = false;
    }
    p.carrier = vertical.rect || null;
  } else {
    if (vertical.land < 0) out.bonked = true;
    p.onGround = false;
    p.carrier = null;
  }

  p.groundTile = p.onGround ? surfaceUnder(p, terrain, rects) : ' ';
  if (p.onGround) {
    p.coyote = PHYS.coyote;
  } else {
    p.coyote = Math.max(0, p.coyote - dt);
    p.airTime += dt;
  }
  p.squash += (0 - p.squash) * Math.min(1, dt * 12);
  return out;
}

/** Bounce off an enemy's head: a little higher when the jump button is held. */
export function bounceOffEnemy(p, held, abilities = {}) {
  p.vy = -(held ? PHYS.enemyBounce * 1.18 : PHYS.enemyBounce);
  p.rising = true;
  p.launched = true;
  p.squash = 0.85;
  p.onGround = false;
  p.coyote = 0;
  p.airJumps = abilities.doubleJump ? 1 : 0;
}
