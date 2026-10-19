// Arcade kart physics. DOM-free; every racer (player, AI, ghost reference)
// runs exactly this code with the same kind of controls:
//   { steer: -1..1, gas: 0..1, brake: bool, drift: bool }
//
// Speed is a scalar along a *move angle* that chases the heading: quickly
// when gripping, slowly while drifting, so a drifting kart slides outward
// with its nose pointed into the bend. Bumps and wall hits add a short-lived
// push vector on top.
import { approach, approachAngle, clamp, wrapAngle } from './math.js';
import { KART_RADIUS, locate } from './track.js';
import { kartModifiers } from './karts.js';

export const KART = {
  top: 300, // base top speed, world units per second
  accel: 290, // from rest
  brake: 560,
  reverse: 95,
  turn: 2.55, // rad/s
  turnFade: 0.38, // share of the turn rate lost at top speed (drifts keep it)
  turnRef: 90, // below this speed steering fades out
  grip: 13, // how fast the move angle chases the heading
  driftGrip: 4.4,
  driftTurn: 2.05, // base turn rate while drifting
  driftRange: 0.95, // how much steering tightens or widens a drift
  driftMin: 125, // slowest speed that can start a drift
  hop: 105,
  gravity: 950,
  tiers: [0.5, 1.05, 1.7], // drift seconds for blue, orange, pink sparks
  turbo: [0.5, 0.85, 1.25], // mini-turbo seconds per tier
  boostMul: 1.3,
  boostAccel: 950,
  verge: 0.62, // top speed on the verge
  vergeBoost: 0.95, // on the verge while boosting
  wallKeep: 0.9,
  wallBounce: 0.4,
  headOnKeep: 0.35,
  wobble: 0.75, // seconds of wobble when hit
  radius: KART_RADIUS,
};

export function makeKart({ racer, kart, slot, index }) {
  return {
    index,
    racer,
    kart,
    mods: kartModifiers(kart),
    x: slot.x, y: slot.y,
    h: slot.angle, m: slot.angle, v: 0,
    px: 0, py: 0, z: 0, vz: 0,
    steer: 0,
    drift: 0, driftT: 0, tier: 0, hopT: 9, driftHeld: false,
    boostT: 0, boostMul: KART.boostMul, boostKind: '',
    wobbleT: 0, spin: 0, shieldT: 0, cometT: 0, starT: 0,
    hint: slot.i, s: slot.s, surface: 'road', shortcut: -1, over: 0,
    bumpT: 0, wallT: 0, lastPad: -1, padT: 0,
    speedMul: 1, // set by the race each step: class × rubber band × tail wind
  };
}

// Effective top speed before boosts.
export function topSpeed(k) {
  return KART.top * k.mods.speed * k.speedMul;
}

export function surfaceFactor(k) {
  const boosting = k.boostT > 0 || k.cometT > 0;
  if (k.surface === 'road') return 1;
  if (k.surface === 'shortcut') {
    const g = k.surfaceGrip ?? 0.8;
    return boosting ? Math.max(g, KART.vergeBoost) : g;
  }
  const verge = clamp(KART.verge + k.mods.verge, 0.4, 0.8);
  return boosting ? KART.vergeBoost : verge;
}

export function startBoost(k, seconds, mul = KART.boostMul, kind = 'turbo') {
  // A stronger boost takes over; overlapping boosts keep the longer time.
  k.boostMul = k.boostT > 0 ? Math.max(k.boostMul, mul) : mul;
  k.boostT = Math.max(k.boostT, seconds);
  k.boostKind = kind;
}

// A hit (item or trap): a short wobble, never a stop. Returns false when a
// shield or a comet ride absorbs it.
export function hitKart(k, events, { strength = 1, by = -1, kind = 'jelly' } = {}) {
  if (k.cometT > 0 || k.starT > 0) return false;
  if (k.shieldT > 0) {
    k.shieldT = 0;
    events?.push({ type: 'shield-pop', kart: k.index, x: k.x, y: k.y });
    return false;
  }
  k.wobbleT = KART.wobble * strength;
  k.starT = KART.wobble * strength + 0.6; // a moment of safety after a hit
  k.vz = Math.max(k.vz, 150 * strength);
  endDrift(k, events, false);
  k.boostT = 0;
  events?.push({ type: 'hit', kart: k.index, by, kind, x: k.x, y: k.y });
  return true;
}

function endDrift(k, events, fire) {
  if (!k.drift) return;
  if (fire && k.tier > 0) {
    startBoost(k, KART.turbo[k.tier - 1], KART.boostMul, 'drift');
    events?.push({ type: 'miniturbo', kart: k.index, tier: k.tier, x: k.x, y: k.y });
  }
  k.drift = 0;
  k.driftT = 0;
  k.tier = 0;
}

// Advances one kart by dt with the given controls. `track` answers where it
// is; `events` collects things the renderer and audio care about.
export function stepKart(k, c, track, dt, events) {
  const mods = k.mods;
  let steer = clamp(c.steer || 0, -1, 1);
  let gas = clamp(c.gas || 0, 0, 1);
  let brake = !!c.brake;
  let driftHeld = !!c.drift;

  // Wobbling after a hit: no control for a moment.
  if (k.wobbleT > 0) {
    k.wobbleT -= dt;
    k.spin += dt * 13;
    steer = 0; gas = 0; brake = false; driftHeld = false;
  } else if (k.spin) {
    // Unwind the visual spin to the nearest turn.
    const rest = Math.round(k.spin / (Math.PI * 2)) * Math.PI * 2;
    k.spin = approach(k.spin, rest, dt * 10);
    if (Math.abs(k.spin - rest) < 1e-3) k.spin = 0;
  }
  k.starT = Math.max(0, k.starT - dt);
  k.shieldT = Math.max(0, k.shieldT - dt);
  k.bumpT = Math.max(0, k.bumpT - dt);
  k.wallT = Math.max(0, k.wallT - dt);
  k.padT = Math.max(0, k.padT - dt);

  // Smooth the steering a touch so digital keys still feel analogue.
  const rate = Math.abs(steer) > Math.abs(k.steer) ? 9 : 14;
  k.steer = approach(k.steer, steer, rate * dt);
  steer = k.steer;

  // ---- drift: press to hop, steer to pick a side, release to fire.
  const pressed = driftHeld && !k.driftHeld;
  k.driftHeld = driftHeld;
  k.hopT += dt;
  if (pressed && k.z <= 0.01) {
    k.vz = KART.hop;
    k.hopT = 0;
    events?.push({ type: 'hop', kart: k.index });
  }
  if (!k.drift && driftHeld && k.hopT < 0.3 && Math.abs(steer) > 0.25 && k.v > KART.driftMin) {
    k.drift = Math.sign(steer);
    k.driftT = 0;
    k.tier = 0;
    events?.push({ type: 'drift-start', kart: k.index, dir: k.drift });
  }
  if (k.drift) {
    if (!driftHeld) endDrift(k, events, true);
    else if (k.v < KART.driftMin * 0.7) endDrift(k, events, false);
    else {
      const tight = Math.max(0, steer * k.drift);
      k.driftT += dt * mods.charge * (0.7 + 0.6 * tight);
      let tier = 0;
      while (tier < KART.tiers.length && k.driftT >= KART.tiers[tier]) tier++;
      if (tier > k.tier) events?.push({ type: 'spark-tier', kart: k.index, tier });
      k.tier = tier;
    }
  }

  // ---- steering
  const top = topSpeed(k);
  const low = clamp(Math.abs(k.v) / KART.turnRef, 0, 1);
  const speedF = low * (1 - KART.turnFade * clamp(k.v / top, 0, 1.3));
  const riding = k.cometT > 0 ? 1.8 : 1; // a comet ride steers itself sharply
  if (k.drift) {
    const turn = Math.max(0.85, KART.driftTurn + KART.driftRange * steer * k.drift);
    k.h += k.drift * turn * mods.turn * low * dt;
  } else {
    k.h += steer * KART.turn * mods.turn * riding * speedF * Math.sign(k.v || 1) * dt;
  }
  k.h = wrapAngle(k.h);
  const g = k.drift ? KART.driftGrip : KART.grip * mods.grip * riding;
  k.m = wrapAngle(k.m + wrapAngle(k.h - k.m) * (1 - Math.exp(-g * dt)));

  // ---- speed
  const surf = surfaceFactor(k);
  const cap = top * surf * (k.drift ? 0.97 : 1);
  if (k.cometT > 0) {
    k.cometT -= dt;
    k.v = approach(k.v, Math.min(top * 1.45, c.cap ?? Infinity), KART.boostAccel * dt);
  } else if (k.boostT > 0) {
    k.boostT -= dt;
    const target = top * k.boostMul * Math.max(surf, KART.vergeBoost);
    k.v = k.v < target ? approach(k.v, target, KART.boostAccel * dt) : approach(k.v, target, 300 * dt);
  } else if (brake) {
    if (k.v > 0) k.v = Math.max(-KART.reverse, k.v - KART.brake * dt);
    else k.v = Math.max(-KART.reverse, k.v - 220 * dt);
  } else if (gas > 0) {
    if (k.v < cap * gas) {
      const f = clamp(k.v / cap, 0, 1);
      const a = KART.accel * mods.accel * (1 - Math.pow(f, 1.7)) + 30;
      k.v = Math.min(cap * gas, k.v + a * dt);
    } else {
      k.v = approach(k.v, cap * gas, 240 * dt);
    }
  } else {
    k.v = approach(k.v, 0, (50 + 0.55 * Math.abs(k.v)) * dt);
  }

  // ---- integrate
  const decay = Math.exp(-5.5 * dt);
  k.px *= decay;
  k.py *= decay;
  const cm = Math.cos(k.m), sm = Math.sin(k.m);
  k.x += (cm * k.v + k.px) * dt;
  k.y += (sm * k.v + k.py) * dt;
  k.vz -= KART.gravity * dt;
  k.z += k.vz * dt;
  if (k.z <= 0) {
    if (k.vz < -160) events?.push({ type: 'land', kart: k.index });
    k.z = 0;
    k.vz = 0;
  }

  collideWalls(k, track, events);
}

// Keeps a kart inside the corridor. The into-wall part of its velocity
// bounces back softly; the along-wall part mostly survives; a head-on hit
// turns the nose along the wall and keeps a third of the speed.
export function collideWalls(k, track, events) {
  const loc = locate(track, k.x, k.y, k.hint, KART.radius);
  k.hint = loc.i;
  k.s = loc.s;
  k.lat = loc.lat;
  k.surface = loc.surface;
  k.surfaceGrip = loc.grip;
  k.shortcut = loc.shortcut;
  k.over = loc.over;
  if (loc.over <= 0) return null;
  const nx = loc.normalX, ny = loc.normalY;
  k.x += nx * loc.over;
  k.y += ny * loc.over;
  const vx = Math.cos(k.m) * k.v + k.px;
  const vy = Math.sin(k.m) * k.v + k.py;
  const vn = vx * nx + vy * ny;
  if (vn >= 0) return null;
  const speed = Math.hypot(vx, vy) || 1;
  const frac = Math.min(1, -vn / speed);
  let tx = vx - nx * vn, ty = vy - ny * vn;
  let along = Math.hypot(tx, ty);
  if (k.v >= 0) {
    if (along < speed * KART.headOnKeep) {
      // Head-on: slide along the wall in the track's forward direction.
      const m = track.main;
      let wx = -ny, wy = nx;
      if (wx * m.tx[loc.i] + wy * m.ty[loc.i] < 0) { wx = -wx; wy = -wy; }
      tx = wx; ty = wy;
      along = speed * KART.headOnKeep;
    } else {
      tx /= along; ty /= along;
      along *= KART.wallKeep * (1 - 0.2 * frac);
    }
    k.m = Math.atan2(ty, tx);
    k.v = along;
    k.h = approachAngle(k.h, k.m, 0.5 * frac + 0.04);
  } else {
    k.v *= 0.5;
  }
  const bounce = (-vn * KART.wallBounce) / k.mods.mass;
  k.px = nx * bounce;
  k.py = ny * bounce;
  if (frac > 0.35 && k.drift) endDrift(k, events, true);
  if (k.wallT <= 0 && -vn > 45) {
    k.wallT = 0.18;
    k.bumpT = 0.25;
    events?.push({ type: 'wall', kart: k.index, x: k.x - nx * KART.radius, y: k.y - ny * KART.radius, power: Math.min(1, -vn / 260) });
  }
  return frac;
}

// Bouncy static bumpers (toy balls, gumdrops, buoys).
export function collideBumpers(k, track, events) {
  for (const b of track.bumpers) {
    const dx = k.x - b.x, dy = k.y - b.y;
    const r = b.r + KART.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d, ny = dy / d;
    k.x = b.x + nx * r;
    k.y = b.y + ny * r;
    const vx = Math.cos(k.m) * k.v + k.px, vy = Math.sin(k.m) * k.v + k.py;
    const vn = vx * nx + vy * ny;
    if (vn < 0) {
      const tx = vx - nx * vn, ty = vy - ny * vn;
      const along = Math.hypot(tx, ty);
      if (along > 1) k.m = Math.atan2(ty, tx);
      k.v = Math.max(along * 0.95, Math.abs(k.v) * 0.55);
      k.px = nx * (-vn * 0.9 + 40);
      k.py = ny * (-vn * 0.9 + 40);
      k.bumpT = 0.3;
      events?.push({ type: 'bumper', kart: k.index, x: b.x + nx * b.r, y: b.y + ny * b.r, bumper: b });
    }
  }
}

// Kart-to-kart: bouncy circles, heavier karts push harder. A shield or a
// comet ride shoves the other kart further.
export function collideKarts(a, b, events) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const r = KART.radius * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const ma = a.mods.mass * (a.shieldT > 0 || a.cometT > 0 ? 2.5 : 1);
  const mb = b.mods.mass * (b.shieldT > 0 || b.cometT > 0 ? 2.5 : 1);
  const overlap = r - d;
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x -= nx * overlap * wa; a.y -= ny * overlap * wa;
  b.x += nx * overlap * wb; b.y += ny * overlap * wb;
  const avx = Math.cos(a.m) * a.v + a.px, avy = Math.sin(a.m) * a.v + a.py;
  const bvx = Math.cos(b.m) * b.v + b.px, bvy = Math.sin(b.m) * b.v + b.py;
  const rel = (bvx - avx) * nx + (bvy - avy) * ny;
  if (rel < 0) {
    const j = (-(1 + 0.75) * rel) / (1 / ma + 1 / mb);
    const kick = 30;
    a.px -= nx * (j / ma + kick * wa); a.py -= ny * (j / ma + kick * wa);
    b.px += nx * (j / mb + kick * wb); b.py += ny * (j / mb + kick * wb);
    // Bumps cost a little speed, the lighter kart more.
    a.v *= 1 - 0.06 * wa;
    b.v *= 1 - 0.06 * wb;
    a.bumpT = b.bumpT = 0.25;
    if (-rel > 30) events?.push({ type: 'bump', a: a.index, b: b.index, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: Math.min(1, -rel / 200) });
  }
  return true;
}
