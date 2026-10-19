// Shared constants. The simulation is measured in logical units; the
// renderer scales the 540x720 field to fit the viewport.
export const FIELD = { w: 540, h: 720 };

export const COMET = {
  r: 10,
  maxPower: 980, // px/s at full charge
  minPower: 260, // px/s at the lightest tap
  settle: 26, // below this speed (px/s) the comet comes to rest
  springBoost: 520,
};

export const PHYSICS = {
  step: 1 / 120,
  rest: 0.8, // wall restitution
  blockRest: 0.85,
  astRest: 0.9,
  friction: 0.5, // fraction of speed kept per second
  shotTimeMax: 9, // a shot always ends; this caps pathological cases
};

// The star's capture radius: the comet's centre must land this close to the
// star's centre. Kept small so a deflected shot that merely settles beside the
// star does not count as a delivery.
export const STAR = { r: 16 };

// Mail letters sit on the side routes. Flying within `pick` of one collects it,
// so a letter is swept up in passing and never needs its own landing.
export const LETTER = { r: 12, pick: 24 };

// Gravity wells pull the comet as it passes. The pull falls off linearly to
// nothing at the rim, which keeps it strong but bounded: no singularity at the
// centre, and friction always wins in the end.
export const WELL = { pull: 1500, r: 104 };

// The aim projection. It follows the real simulation but stops early, so the
// player gets a plan without being handed the answer: later worlds follow fewer
// bounces and a shorter leash. A full-power shot travels about 1400 units.
export const PREVIEW = {
  bounces: [3, 2, 2, 1, 1], // per world: reflections the projection follows through
  len: [1000, 820, 760, 620, 560], // per world: units of travel shown
  sample: 8, // units between projected dots
};

export const SOLVER = {
  angles: 16,
  powers: [0.3, 0.55, 0.85, 1.0], // multipliers of maxPower; the gentle one sinks cups
  dt: 1 / 120,
  beam: 28, // cap the frontier so a solve stays quick
  maxDepth: 5, // the par window
  cell: 24, // settled positions are deduped on this grid
  maxShot: 8, // seconds, per simulated shot
  // Simulated shots before giving up. A par-4 route needs the search to finish
  // depth 3, which costs 64 + 4 * beam * 64 shots, so leave room above that or
  // a solvable panel reads as unsolvable.
  maxNodes: 9000,
};

export const WORLDS = [
  { name: 'Letter Belt', blurb: 'First flights: aim, power, and a bank off the sky.' },
  { name: 'Asteroid Post', blurb: 'Round rocks give back more than walls do.' },
  { name: 'Wind Alley', blurb: 'The evening breeze takes a side.' },
  { name: 'Spring Steps', blurb: 'Bounce pads turn a dying comet into a fresh one.' },
  { name: 'Gravity Gate', blurb: 'Wells bend the route; portals cut it short.' },
];

export const LEVELS_PER_WORLD = 6;
export const LEVEL_COUNT = WORLDS.length * LEVELS_PER_WORLD;
