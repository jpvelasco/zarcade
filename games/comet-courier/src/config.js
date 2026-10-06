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

export const SOLVER = {
  angles: 16,
  powers: [0.3, 0.55, 0.85, 1.0], // multipliers of maxPower; the gentle one sinks cups
  dt: 1 / 120,
  beam: 24, // cap the frontier so generation stays fast
  maxDepth: 5, // the star par window
  cell: 24, // settled positions are deduped on this grid
  maxShot: 8, // seconds, per simulated shot
  maxNodes: 4200, // simulated shots per level before giving up
};

export const WORLDS = [
  { name: 'Letter Belt', blurb: 'First flights down the quiet lane.' },
  { name: 'Asteroid Post', blurb: 'Rockets and chunks of old mail-rock.' },
  { name: 'Wind Alley', blurb: 'The evening breeze takes a side.' },
  { name: 'Spring Steps', blurb: 'Bounce pads speed the route along.' },
  { name: 'Portal Pass', blurb: 'Two doors, one shortcut, no map.' },
];

export const LEVELS_PER_WORLD = 6;
export const LEVEL_COUNT = WORLDS.length * LEVELS_PER_WORLD;
