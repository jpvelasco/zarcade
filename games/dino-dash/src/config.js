// Tuning shared by the simulation, the generator, the autopilot and the
// renderer. Distances are metres, times seconds.

export const STEP = 1 / 120;
export const LANE_W = 2.2; // metres between lane centres
export const LANES = [-1, 0, 1];

export const SPEED = { base: 10, gain: 14, scale: 2200, max: 24 };
export function speedAt(distance) {
  const d = Math.max(0, distance);
  return Math.min(SPEED.max, SPEED.base + SPEED.gain * (1 - Math.exp(-d / SPEED.scale)));
}

const JUMP_APEX = 1.7;
const JUMP_TIME = 0.6;
export const PLAYER = {
  laneTime: 0.14,
  jumpApex: JUMP_APEX,
  jumpTime: JUMP_TIME,
  gravity: (8 * JUMP_APEX) / (JUMP_TIME * JUMP_TIME),
  jumpSpeed: (4 * JUMP_APEX) / JUMP_TIME,
  slamSpeed: -26, // rolling in the air pulls you down fast
  rollTime: 0.62,
  height: 1.4,
  rollHeight: 0.7,
  halfLen: 0.4, // half the dino's length along the path
  laneReach: 0.6, // lane-units of overlap that count as touching a lane
  buffer: 0.18, // an early press is remembered this long
  glideHeight: 4.2,
};

// Obstacle shapes: vertical extent and length along the path.
export const OBSTACLES = {
  log: { len: 0.7, bottom: 0, top: 0.8, full: false, action: 'jump' },
  ptero: { len: 1.0, bottom: 1.0, top: 2.1, full: false, action: 'roll' },
  geyser: { len: 1.4, bottom: 0, top: 9, full: true },
  boulder: { len: 1.6, bottom: 0, top: 3, full: true },
  hedge: { len: 0, bottom: 0, top: 2.6, full: true }, // length per hedge
};

export const HIT = {
  lavvyWindow: 7, // a second bump this soon after the first ends the run
  immune: 1.0,
  slow: 0.35, // speed lost on a bump, recovering over slowTime
  slowTime: 1.4,
  caughtDelay: 1.4, // seconds of hug before the results screen
};

export const POWER = {
  shield: 30,
  magnetBase: 8,
  glideBase: 6,
  magnetRange: 22, // metres ahead the magnet reaches
  landClear: 1.6, // seconds of path cleared ahead of a landing
};

export const COIN = { spacing: 2.4, y: 0.6, reachZ: 0.9 };

export const VIEW_AHEAD = 150; // metres generated (and drawn) ahead

// Difficulty tiers by distance.
export const TIERS = [0, 300, 900, 1800, 3000];
export function tierAt(distance) {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (distance >= TIERS[i]) t = i;
  return t;
}
// Seconds between obstacle rows, by tier.
export const GAP_TIME = [1.15, 1.0, 0.92, 0.86, 0.82];
export const MIN_GAP_TIME = 0.82;

export const BIOME_LEN = 900;
export const BIOME_BLEND = 60;
export const START_CLEAR = 60; // first obstacle row
