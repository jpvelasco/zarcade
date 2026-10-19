// Tuning numbers shared by the simulation, the AI and the renderer.
// World units are "arena pixels": a classic arena is about 640 across.

export const STEP = 1 / 120;

export const BLOB = {
  radius: 30,
  mass: 1,
  accel: 1650, // px/s² from the stick
  maxSpeed: 300, // stick-driven top speed relative to the floor
  friction: 5.2, // velocity relaxes toward the floor's velocity at this rate
  chargeTime: 0.75, // seconds to a full dash charge
  dashMin: 420,
  dashMax: 880,
  dashTime: 0.28,
  dashCooldown: 0.35,
  knockTime: 0.38, // after a hard hit you slide further
  knockFriction: 0.5, // friction multiplier while sliding from a hit
  poundRise: 560,
  poundSlam: -1500,
  poundCooldown: 0.9,
  poundRadius: 150,
  poundForce: 820,
  gravity: 2200,
  fallTime: 1.1,
};

export const BUMP = {
  restitution: 0.7,
  boost: 110, // extra equal-and-opposite push on every contact
  dashBoost: 170, // extra push when the hitter is mid-dash
  hitstopMin: 520, // contact speed that triggers a hitstop
  hitstopMax: 0.11,
  bumperKick: 470,
};

export const POWER = {
  every: [7, 11], // seconds between spawns
  max: 2,
  giant: { time: 8, scale: 1.45, mass: 2.4 },
  sticky: { time: 9, slime: 2.4, slow: 0.35 },
  magnet: { time: 6, range: 300, pull: 900 },
  shield: { time: 12 },
};
export const POWER_KINDS = ['giant', 'sticky', 'magnet', 'shield'];

export const HAZARD = {
  every: [6, 10],
  warn: 1.7,
  radius: 115,
  force: 900,
};

export const ROUND = {
  countdown: 3,
  lbsTime: 60, // then sudden death closes in
  suddenTime: 18,
  respawn: 2,
  invulnerable: 1.6,
  timeLimit: 120, // King of the Hill and Coin Grab
  overtime: 30,
  outro: 2.2,
};

export const KOTH = { zoneRadius: 88, moveEvery: 12 };
export const COINS = { every: 0.7, max: 9, bigChance: 0.12, lose: 3 };

export const MODES = ['lbs', 'koth', 'coins'];
export const MODE_INFO = {
  lbs: { name: 'Last Blob Standing', short: 'Last Blob', targets: [2, 3, 5], unit: 'wins', blurb: 'Knock everyone off. Win rounds to win the match.' },
  koth: { name: 'King of the Hill', short: 'King of the Hill', targets: [20, 30, 45], unit: 'points', blurb: 'Sit alone in the glowing zone to score.' },
  coins: { name: 'Coin Grab', short: 'Coin Grab', targets: [15, 25, 40], unit: 'coins', blurb: 'Grab coins. Fall off and you drop some!' },
};
export const DEFAULT_TARGET = { lbs: 3, koth: 30, coins: 25 };

export const BOT_LEVELS = ['easy', 'normal', 'hard'];
