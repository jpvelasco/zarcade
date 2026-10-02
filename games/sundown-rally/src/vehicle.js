import { clamp } from './math.js';

export const GRAVITY = 22; // a bit more than real gravity keeps jumps snappy

export const BASE_STATS = {
  maxSpeed: 34,      // m/s (~122 km/h)
  accel: 14,
  brake: 30,
  reverseMax: 9,
  turn: 1.75,        // rad/s at low speed
  grip: 7,           // how fast sideways sliding dies out on the road
  offroadGrip: 3.2,
  offroadMax: 0.6,   // fraction of top speed off the road
  nitroBoost: 1.4,
  nitroAccel: 1.9,
  nitroBurn: 0.3,    // tank fraction per second
  armor: 1,          // damage multiplier
  radius: 1.7,
};

export function makeVehicle(x, z, y, heading, stats = BASE_STATS) {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, heading, speed: 0, stats,
    grounded: true, airTime: 0, landed: 0,
    nitro: 0.5, nitroOn: false, hp: 100, offroad: false,
    steerVisual: 0,
  };
}

// Advances one vehicle. `input` is { throttle, brake, steer, nitro } with
// steer +1 meaning "right on screen". `ground` is { height(x, z), offroad }.
export function stepVehicle(v, input, dt, ground) {
  const s = v.stats;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let fwd = v.vx * fx + v.vz * fz;
  let latX = v.vx - fx * fwd, latZ = v.vz - fz * fwd;

  v.nitroOn = !!input.nitro && v.nitro > 0 && fwd > 3;
  if (v.nitroOn) v.nitro = Math.max(0, v.nitro - s.nitroBurn * dt);
  v.offroad = ground.offroad;
  const max = s.maxSpeed * (v.offroad ? s.offroadMax : 1) * (v.nitroOn ? s.nitroBoost : 1);

  const control = v.grounded ? 1 : 0.25;
  if (v.grounded) {
    if (input.throttle > 0 && fwd < max) {
      const push = s.accel * (v.nitroOn ? s.nitroAccel : 1) * input.throttle;
      fwd += push * Math.max(0.12, 1 - Math.max(0, fwd) / max) * dt;
    }
    if (fwd > max) fwd -= (fwd - max) * Math.min(1, 1.8 * dt);
    if (input.brake > 0) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - s.brake * input.brake * dt);
      else fwd = Math.max(-s.reverseMax, fwd - s.accel * 0.6 * input.brake * dt);
    }
    if (!(input.throttle > 0) && !(input.brake > 0)) {
      const drag = (2.5 + Math.abs(fwd) * 0.06) * dt;
      fwd = Math.abs(fwd) <= drag ? 0 : fwd - Math.sign(fwd) * drag;
    }
    const grip = v.offroad ? s.offroadGrip : s.grip;
    const k = Math.exp(-grip * dt);
    latX *= k;
    latZ *= k;
  }

  // Steering is weak when crawling, strongest at medium speed, a little
  // calmer at top speed.
  // Steering eases in over ~0.12 s so keyboard taps aren't twitchy.
  v.steerVisual += ((input.steer || 0) - v.steerVisual) * Math.min(1, 8 * dt);
  const speedFactor = clamp(Math.abs(fwd) / 7, 0, 1) / (1 + Math.abs(fwd) / 55);
  v.heading -= v.steerVisual * s.turn * speedFactor * Math.sign(fwd || 1) * control * dt;

  const nfx = Math.sin(v.heading), nfz = Math.cos(v.heading);
  v.vx = nfx * fwd + latX;
  v.vz = nfz * fwd + latZ;
  v.speed = fwd;
  v.x += v.vx * dt;
  v.z += v.vz * dt;

  // Vertical: follow the ground while grounded, fly ballistically otherwise.
  // Climbing momentum carries the jeep off crests.
  const g = ground.height(v.x, v.z);
  v.landed = 0;
  if (v.grounded) {
    const coast = v.y + v.vy * dt - 0.5 * GRAVITY * dt * dt;
    if (v.vy > 2.5 && coast > g + 0.15) {
      v.grounded = false;
      v.y = coast;
      v.vy -= GRAVITY * dt;
    } else if (g < v.y - 0.6) {
      // The ground fell away (a ramp's top edge): drop instead of snapping down.
      v.grounded = false;
      v.vy = Math.min(0, v.vy) - GRAVITY * dt;
      v.y += v.vy * dt;
    } else {
      v.vy = clamp((g - v.y) / dt, -25, 25);
      v.y = g;
      v.airTime = 0;
    }
  } else {
    v.vy -= GRAVITY * dt;
    v.y += v.vy * dt;
    v.airTime += dt;
    if (v.y <= g) {
      v.landed = Math.max(0.01, -v.vy); // impact speed, read by the world
      v.y = g;
      v.vy = 0;
      v.grounded = true;
    }
  }
  return v;
}

// Throws the jeep into the air (ramps, explosions).
export function launch(v, vy) {
  if (vy <= v.vy && !v.grounded) return;
  v.vy = vy;
  v.y += 0.05;
  v.grounded = false;
}
