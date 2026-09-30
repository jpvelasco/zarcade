// Stats for everything in space. Distances in meters, speeds in m/s.

export const LANE = { halfU: 28, halfW: 18 };

export const PLAYER = {
  radius: 1.8,
  hull: 100,
  shield: 40,
  shieldRegen: 12,       // per second, after a pause
  shieldDelay: 2.5,
  cruise: 70,
  boost: 115,
  brake: 42,
  lateral: 30,
  boltSpeed: 330,        // added to the jet's own speed
  missileSpeed: 150,
  missileDamage: 10,
  missileBlast: 7,
  rollTime: 0.55,
  rollCooldown: 1.1,
};

// Cannon power levels during a journey. Every shot fires one bolt from each
// wing gun (offsets, meters sideways) plus a mirrored pair per spread angle.
export const CANNON = [
  null,
  { offsets: [-1.4, 1.4], angles: [], interval: 0.14 },
  { offsets: [-1.4, 1.4], angles: [], interval: 0.095 },
  { offsets: [-1.4, 1.4], angles: [0.07], interval: 0.11 },
  { offsets: [-1.4, 1.4], angles: [0.06, 0.13], interval: 0.1 },
];

export const ENEMIES = {
  fighter: { r: 3.4, hp: 4, score: 100, dust: 3, fire: 1.7, contact: 18 },
  drone: { r: 2.3, hp: 2, score: 60, dust: 2, speed: 36, contact: 14 },
  ghost: { r: 4, hp: 6, score: 150, dust: 5, fire: 1.5, contact: 18, visible: 1.7, hidden: 1.3 },
  turret: { r: 1.8, hp: 7, score: 80, dust: 3, fire: 1.3, contact: 0 },
  bosspart: { r: 3.2, hp: 26, score: 200, dust: 6, fire: 1.5, contact: 0 },
  bosscore: { r: 6, hp: 80, score: 1000, dust: 30, fire: 1.1, contact: 0 },
};

export const HAZARDS = {
  asteroid: {
    3: { r: 6.5, hp: 10, damage: 22, score: 60, dust: 3 },
    2: { r: 3.4, hp: 4, damage: 14, score: 40, dust: 2 },
    1: { r: 1.8, hp: 2, damage: 8, score: 20, dust: 1 },
  },
  mine: { r: 1.5, hp: 1, trigger: 7, blast: 10, damage: 18, score: 30, dust: 1 },
  wreck: { damage: 14 },
};

export const PICKUPS = {
  dust: { r: 2.4 },
  power: { r: 3.2 },
  shield: { r: 3.2 },
  repair: { r: 3.2 },
  missiles: { r: 3.2, amount: 4 },
  hyper: { r: 3.6, duration: 6, speed: 5 },
};

export const BOLT = { enemySpeed: 85, enemyDamage: 7, life: 1.4 };
