import { clamp } from './math.js';
import { SURFACES } from './locations.js';

// Arcade car physics. Pure: no DOM, no rendering.
//
// Input: { throttle 0-1, brake 0-1, steer -1..1 (+1 = right), drift bool,
// boost bool }. Heading h points along (sin h, cos h); steering right
// lowers h.

export const GRAVITY = 24;

// Drift boost: hold drift while steering to slide and charge. Releasing at a
// tier gives that many seconds of mini-turbo.
export const DRIFT = {
  minSpeed: 12,
  tiers: [0.9, 1.9, 3.2],      // charge needed for blue, orange, purple
  turbo: [0.5, 0.9, 1.4],      // seconds of mini-turbo per tier
  meterFill: 0.07,             // boost meter per second of drifting
};

export const BOOST = {
  speed: 1.22,                 // top speed multiplier while boosting
  accel: 2.4,
  burn: 0.42,                  // meter per second while the boost is held
  airFill: 0.3,                // meter per second of air time
};

export function driftTier(charge) {
  let tier = 0;
  for (let i = 0; i < DRIFT.tiers.length; i++) if (charge >= DRIFT.tiers[i]) tier = i + 1;
  return tier;
}

export function miniTurbo(tier) {
  return tier > 0 ? DRIFT.turbo[tier - 1] : 0;
}

// How much a car feels a surface: off-road skill cancels up to 55% of the
// grip and speed penalty.
export function surfaceFactor(surface, offroad = 0) {
  const s = SURFACES[surface] || SURFACES.asphalt;
  const keep = 1 - 0.55 * clamp(offroad, 0, 1);
  return { grip: 1 - (1 - s.grip) * keep, speed: 1 - (1 - s.speed) * keep };
}

export function makeVehicle(x, y, z, heading, stats) {
  return {
    x, y, z, px: x, pz: z, vx: 0, vy: 0, vz: 0, heading, speed: 0, stats,
    grounded: true, airTime: 0, landed: 0,
    steer: 0, drifting: false, driftDir: 0, driftCharge: 0, driftTime: 0, driftAngle: 0,
    turbo: 0, lastTier: 0, meter: 0.35, boosting: false, slip: 0,
    surface: 'asphalt', grip: 1,
  };
}

// One step of driving on the ground plane. `surf` is { grip, speed } from
// surfaceFactor. Returns an event name when a drift starts or a mini-turbo
// fires, else null.
export function stepVehicle(v, input, dt, surf = { grip: 1, speed: 1 }) {
  const s = v.stats;
  let event = null;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let fwd = v.vx * fx + v.vz * fz;
  let latX = v.vx - fx * fwd, latZ = v.vz - fz * fwd;
  const steerIn = clamp(input.steer || 0, -1, 1);
  v.grip = surf.grip;

  // Drift state.
  if (!v.drifting && input.drift && v.grounded && Math.abs(steerIn) > 0.3 && fwd > DRIFT.minSpeed) {
    v.drifting = true;
    v.driftDir = Math.sign(steerIn);
    v.driftCharge = 0;
    v.driftTime = 0;
    event = 'drift';
  } else if (v.drifting && (!input.drift || fwd < DRIFT.minSpeed * 0.6)) {
    const tier = fwd >= DRIFT.minSpeed * 0.6 ? driftTier(v.driftCharge) : 0;
    v.drifting = false;
    v.driftCharge = 0;
    if (tier > 0) {
      v.turbo = Math.max(v.turbo, miniTurbo(tier));
      v.lastTier = tier;
      v.meter = Math.min(1, v.meter + 0.04 * tier);
      event = 'turbo';
    }
  }

  // Boost: held meter burn, mini-turbo, or boost pads (which set turbo).
  v.boosting = !!input.boost && v.meter > 0.01 && fwd > 2;
  if (v.boosting) v.meter = Math.max(0, v.meter - BOOST.burn * dt);
  if (v.turbo > 0) v.turbo = Math.max(0, v.turbo - dt);
  const boostOn = v.boosting || v.turbo > 0;
  const max = s.maxSpeed * surf.speed * (boostOn ? BOOST.speed : 1) * (v.drifting ? 0.98 : 1);

  const control = v.grounded ? 1 : 0.3;
  if (v.grounded) {
    const throttle = boostOn ? 1 : input.throttle || 0;
    if (throttle > 0 && fwd < max) {
      const push = s.accel * (boostOn ? BOOST.accel : 1) * throttle;
      fwd += push * Math.max(0.1, 1 - Math.max(0, fwd) / max) * dt;
    }
    if (fwd > max) fwd -= (fwd - max) * Math.min(1, 1.6 * dt);
    if (input.brake > 0 && !boostOn) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - s.brake * input.brake * dt);
      else fwd = Math.max(-9, fwd - s.accel * 0.6 * input.brake * dt);
    }
    if (!(throttle > 0) && !(input.brake > 0)) {
      const drag = (2.2 + Math.abs(fwd) * 0.05) * dt;
      fwd = Math.abs(fwd) <= drag ? 0 : fwd - Math.sign(fwd) * drag;
    }
    const grip = s.grip * surf.grip * (v.drifting ? 0.42 : 1);
    const k = Math.exp(-grip * dt);
    latX *= k;
    latZ *= k;
  }

  // Steering eases in so keyboard taps are not twitchy.
  v.steer += (steerIn - v.steer) * Math.min(1, 9 * dt);
  const speedFactor = clamp(Math.abs(fwd) / 6, 0, 1) / (1 + Math.abs(fwd) / 70);
  const surfTurn = 0.72 + 0.28 * surf.grip;
  let turn;
  if (v.drifting) {
    const into = clamp(v.steer * v.driftDir, -1, 1);
    const amount = 0.5 + 0.85 * (into + 1) / 2;   // 0.5 counter-steered .. 1.35 tucked in
    turn = v.driftDir * amount * s.turn * 1.1 * speedFactor;
    if (v.grounded) {
      v.driftTime += dt;
      v.driftCharge += dt * (0.75 + 0.5 * (into + 1) / 2) * s.drift;
      v.meter = Math.min(1, v.meter + DRIFT.meterFill * (s.boostFill || 1) * dt);
    }
  } else {
    turn = v.steer * s.turn * speedFactor * surfTurn;
  }
  v.heading -= turn * Math.sign(fwd || 1) * control * dt;

  const nfx = Math.sin(v.heading), nfz = Math.cos(v.heading);
  v.vx = nfx * fwd + latX;
  v.vz = nfz * fwd + latZ;
  v.speed = fwd;
  v.slip = Math.hypot(latX, latZ);
  const targetAngle = v.drifting ? v.driftDir * 0.42 : 0;
  v.driftAngle += (targetAngle - v.driftAngle) * Math.min(1, 6 * dt);

  v.px = v.x;
  v.pz = v.z;
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  if (!v.grounded) {
    v.airTime += dt;
    v.meter = Math.min(1, v.meter + BOOST.airFill * (s.boostFill || 1) * dt);
  }
  return event;
}

// Vertical motion: stick to the ground, or fly when a crest or ramp throws
// the car up faster than the ground falls away.
export function followGround(v, g, dt) {
  v.landed = 0;
  if (v.grounded) {
    const coast = v.y + v.vy * dt - 0.5 * GRAVITY * dt * dt;
    if (v.vy > 3 && coast > g + 0.12) {
      v.grounded = false;
      v.y = coast;
      v.vy -= GRAVITY * dt;
    } else {
      v.vy = clamp((g - v.y) / dt, -30, 30);
      v.y = g;
      v.airTime = 0;
    }
  } else {
    v.vy -= GRAVITY * dt;
    v.y += v.vy * dt;
    if (v.y <= g) {
      v.landed = Math.max(0.01, -v.vy);
      v.y = g;
      v.vy = 0;
      v.grounded = true;
    }
  }
}

export function launch(v, vy) {
  if (!v.grounded && vy <= v.vy) return;
  v.vy = vy;
  v.y += 0.05;
  v.grounded = false;
}
