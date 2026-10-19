// Racers (cartoon critters with driving personalities) and karts (small,
// honest stat trade-offs). Every kart's five stats add up to the same total,
// so none is simply better than another.

export const STAT_TOTAL = 15;
export const STATS = ['speed', 'accel', 'handling', 'drift', 'weight'];
export const STAT_LABELS = { speed: 'Speed', accel: 'Zoom-off', handling: 'Steering', drift: 'Drift', weight: 'Weight' };

export const KARTS = [
  { id: 'buggy', name: 'Buggy', blurb: 'Good at everything', stats: { speed: 3, accel: 3, handling: 3, drift: 3, weight: 3 }, unlock: null },
  { id: 'bumble', name: 'Bumble', blurb: 'Quick off the line, easy to steer', stats: { speed: 2, accel: 4, handling: 4, drift: 3, weight: 2 }, unlock: null },
  { id: 'zoomer', name: 'Zoomer', blurb: 'Top speed, slow to get going', stats: { speed: 5, accel: 2, handling: 2, drift: 3, weight: 3 }, unlock: { cup: 0 } },
  { id: 'chonk', name: 'Chonk', blurb: 'Heavy: bumps others aside', stats: { speed: 3, accel: 2, handling: 2, drift: 3, weight: 5 }, unlock: { cup: 1 } },
  { id: 'swish', name: 'Swish', blurb: 'Charges drift sparks fastest', stats: { speed: 3, accel: 3, handling: 3, drift: 5, weight: 1 }, unlock: { cup: 2 } },
  { id: 'comet', name: 'Comet', blurb: 'Fast and drifty, but light', stats: { speed: 4, accel: 3, handling: 3, drift: 4, weight: 1 }, unlock: { gold: 3 } },
];

// Personalities shape how an AI racer drives; the physics are the same for
// everyone.
//   skill     how closely it follows its racing line and speed profile
//   look      look-ahead multiplier for steering
//   brake     corner speed margin (>1 brakes earlier)
//   drift     how keen it is to drift long bends (0..1)
//   patience  0..3: how long it holds a drift before releasing
//   items     item style: eager | careful | trapper | hunter
//   shortcut  chance to take a shortcut when it has a boost (0..1)
//   bump      how much it steers into nearby racers (0..1)
//   wobble    seeded steering noise
//   bias      preferred lateral bias on the racing line (-1..1)
export const PERSONALITIES = {
  speedy: { skill: 0.94, look: 1.0, brake: 1.0, drift: 0.85, patience: 1, items: 'eager', shortcut: 0.6, bump: 0.25, wobble: 0.1, bias: 0.15 },
  steady: { skill: 0.93, look: 1.15, brake: 1.08, drift: 0.55, patience: 2, items: 'careful', shortcut: 0.25, bump: 0.05, wobble: 0.05, bias: -0.1 },
  sly: { skill: 0.92, look: 1.0, brake: 1.02, drift: 0.7, patience: 1, items: 'trapper', shortcut: 1.0, bump: 0.2, wobble: 0.1, bias: 0.2 },
  bumper: { skill: 0.9, look: 0.95, brake: 0.98, drift: 0.5, patience: 1, items: 'hunter', shortcut: 0.4, bump: 0.9, wobble: 0.12, bias: 0 },
  drifter: { skill: 0.95, look: 1.05, brake: 1.0, drift: 1.0, patience: 3, items: 'careful', shortcut: 0.5, bump: 0.1, wobble: 0.06, bias: -0.2 },
  wild: { skill: 0.87, look: 0.9, brake: 0.96, drift: 0.75, patience: 1, items: 'eager', shortcut: 0.7, bump: 0.5, wobble: 0.3, bias: 0.3 },
  careful: { skill: 0.9, look: 1.2, brake: 1.12, drift: 0.4, patience: 2, items: 'careful', shortcut: 0.1, bump: 0, wobble: 0.04, bias: 0 },
  ace: { skill: 0.97, look: 1.05, brake: 1.0, drift: 0.95, patience: 2, items: 'hunter', shortcut: 0.8, bump: 0.3, wobble: 0.04, bias: 0.05 },
};

export const RACERS = [
  { id: 'bun', name: 'Bun', animal: 'bunny', color: '#ff6fae', light: '#ffd0e4', fur: '#fff4f8', personality: 'speedy', kart: 'zoomer', blurb: 'Hops into every drift', unlock: null },
  { id: 'fen', name: 'Fen', animal: 'fox', color: '#ff8a3d', light: '#ffd2a8', fur: '#ff9f55', personality: 'sly', kart: 'buggy', blurb: 'Knows every shortcut', unlock: null },
  { id: 'pip', name: 'Pip', animal: 'penguin', color: '#3d9bff', light: '#bfe0ff', fur: '#2b3550', personality: 'steady', kart: 'bumble', blurb: 'Smooth and steady', unlock: null },
  { id: 'bo', name: 'Bo', animal: 'bear', color: '#b5713f', light: '#f0c9a2', fur: '#9c6234', personality: 'bumper', kart: 'chonk', blurb: 'Loves a friendly bump', unlock: null },
  { id: 'mimi', name: 'Mimi', animal: 'cat', color: '#a879ff', light: '#e3d4ff', fur: '#f2f0f6', personality: 'drifter', kart: 'swish', blurb: 'Drift queen', unlock: null },
  { id: 'toto', name: 'Toto', animal: 'frog', color: '#48c75a', light: '#c8f5c9', fur: '#6ad66f', personality: 'wild', kart: 'buggy', blurb: 'Wobbly but brave', unlock: null },
  { id: 'dot', name: 'Dot', animal: 'duck', color: '#ffc928', light: '#fff1b0', fur: '#ffe066', personality: 'careful', kart: 'bumble', blurb: 'Never misses a boost pad', unlock: { medals: 4 } },
  { id: 'ollie', name: 'Ollie', animal: 'owl', color: '#3fc6c0', light: '#c4f2ef', fur: '#8b6a4f', personality: 'ace', kart: 'comet', blurb: 'The night-time ace', unlock: { dailies: 3 } },
];

export const racerById = (id) => RACERS.find((r) => r.id === id) || RACERS[0];
export const kartById = (id) => KARTS.find((k) => k.id === id) || KARTS[0];

// Physics multipliers from a kart's stats (3 is the middle of every scale).
export function kartModifiers(kart) {
  const s = kart.stats;
  return {
    speed: 1 + (s.speed - 3) * 0.025,
    accel: 1 + (s.accel - 3) * 0.13,
    turn: 1 + (s.handling - 3) * 0.05,
    grip: 1 + (s.handling - 3) * 0.08,
    verge: (s.handling - 3) * 0.02,
    charge: 1 + (s.drift - 3) * 0.11,
    mass: 1 + (s.weight - 3) * 0.2,
  };
}

// The rivals for a race: five racers other than the player's, in a stable
// order picked by the seed.
export function pickRivals(playerId, rng) {
  const pool = RACERS.filter((r) => r.id !== playerId);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}
