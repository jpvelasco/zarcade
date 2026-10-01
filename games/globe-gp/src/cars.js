// The eight cars. Stats feed vehicle.js directly; `bars` is the 1-5 rating
// shown in the garage. Engine sound settings feed audio.js.
//
// maxSpeed m/s, accel m/s², grip (sideways slide damping), turn rad/s,
// drift (how hard it swings and how fast it charges), weight (bump mass),
// offroad 0-1 (how much of a surface penalty it ignores).

export const CARS = [
  {
    id: 'kart', name: 'Zippy Kart', kind: 'Kart', stars: 0, price: 0,
    blurb: 'Tiny, twitchy and quick off the line. Great for beginners.',
    stats: { maxSpeed: 33, accel: 20, brake: 30, grip: 9, turn: 2.35, drift: 1.25, weight: 0.6, offroad: 0.35, radius: 1.25 },
    engine: { base: 70, range: 260, wave: 'square', gears: 5, buzz: 0.6 },
    colors: ['#ff4a5a', '#ffd23d', '#3fd0ff', '#7cff6a', '#c86aff', '#ffffff'],
  },
  {
    id: 'hatch', name: 'Pocket Hatch', kind: 'Hatchback', stars: 0, price: 0,
    blurb: 'Friendly all-rounder that does everything well.',
    stats: { maxSpeed: 35, accel: 16.5, brake: 30, grip: 8.2, turn: 2.05, drift: 1.05, weight: 0.9, offroad: 0.5, radius: 1.5 },
    engine: { base: 55, range: 200, wave: 'sawtooth', gears: 5, buzz: 0.4 },
    colors: ['#3fa0ff', '#ff6a3d', '#ffd23d', '#2ac46b', '#f4f4f4', '#ff7ac8'],
  },
  {
    id: 'bug', name: 'Beetle Bop', kind: 'Retro bug', stars: 1, price: 120,
    blurb: 'Round and jolly with a long, loopy drift.',
    stats: { maxSpeed: 35, accel: 15.5, brake: 28, grip: 7.6, turn: 2.1, drift: 1.4, weight: 0.85, offroad: 0.6, radius: 1.5 },
    engine: { base: 48, range: 150, wave: 'square', gears: 4, buzz: 0.8 },
    colors: ['#8fd4ff', '#ffb0c8', '#ffe07a', '#9ae6a0', '#ff8a5a', '#f6efe0'],
  },
  {
    id: 'pickup', name: 'Ranch Hand', kind: 'Pickup', stars: 2, price: 220,
    blurb: 'Heavy and tough. Shrugs off sand, snow and rivals.',
    stats: { maxSpeed: 36, accel: 14.5, brake: 27, grip: 7, turn: 1.85, drift: 0.95, weight: 1.6, offroad: 0.9, radius: 1.75 },
    engine: { base: 38, range: 130, wave: 'sawtooth', gears: 4, buzz: 0.9 },
    colors: ['#c8402c', '#2a5aa0', '#e8e0d0', '#3a3a3a', '#e8a030', '#4a8a4a'],
  },
  {
    id: 'rally', name: 'Gravel Gecko', kind: 'Rally car', stars: 3, price: 320,
    blurb: 'Built for loose ground. Loves a sideways slide.',
    stats: { maxSpeed: 38, accel: 17.5, brake: 30, grip: 8, turn: 2.1, drift: 1.45, weight: 1, offroad: 1, radius: 1.55 },
    engine: { base: 58, range: 230, wave: 'sawtooth', gears: 6, buzz: 0.7 },
    colors: ['#f4f4f4', '#1a5ad8', '#ffd23d', '#2ac46b', '#ff4a2a', '#2a2a2a'],
  },
  {
    id: 'muscle', name: 'Thunder V8', kind: 'Muscle car', stars: 5, price: 450,
    blurb: 'Monster top speed. Brake early, it is a handful!',
    stats: { maxSpeed: 41.5, accel: 15.5, brake: 26, grip: 6.4, turn: 1.8, drift: 1.15, weight: 1.35, offroad: 0.4, radius: 1.75 },
    engine: { base: 34, range: 150, wave: 'sawtooth', gears: 4, buzz: 1 },
    colors: ['#ff8a1a', '#1a1a1a', '#c8102e', '#2a6ad8', '#f4d000', '#e8e8e8'],
  },
  {
    id: 'sports', name: 'Sakura GT', kind: 'Sports car', stars: 7, price: 600,
    blurb: 'Sharp, fast and glued to the road.',
    stats: { maxSpeed: 42, accel: 18, brake: 33, grip: 8.8, turn: 2.0, drift: 1.1, weight: 1, offroad: 0.35, radius: 1.6 },
    engine: { base: 62, range: 300, wave: 'sawtooth', gears: 6, buzz: 0.5 },
    colors: ['#e83a5a', '#f4f4f4', '#1a1a2a', '#ffd23d', '#3a8aff', '#ff9ac0'],
  },
  {
    id: 'ev', name: 'Volt Arrow', kind: 'Future EV', stars: 9, price: 800,
    blurb: 'Silent rocket from the future. Instant torque!',
    stats: { maxSpeed: 43.5, accel: 21, brake: 34, grip: 8.4, turn: 2.0, drift: 1.05, weight: 1.1, offroad: 0.5, radius: 1.6 },
    engine: { base: 110, range: 520, wave: 'sine', gears: 1, buzz: 0.15 },
    colors: ['#3fe5ff', '#f4f4f4', '#b06cff', '#7cff6a', '#ff3fa4', '#1a1a2a'],
  },
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));

// Upgrades bought per car with coins: three levels each.
export const UPGRADES = {
  engine: { label: 'Engine', blurb: 'Higher top speed', costs: [60, 120, 200] },
  grip: { label: 'Tyres', blurb: 'More grip and sharper steering', costs: [50, 100, 170] },
  boost: { label: 'Turbo', blurb: 'Fills the boost meter faster', costs: [50, 100, 170] },
};

// Stats after upgrades, as a fresh object.
export function carStats(car, upgrades = {}) {
  const s = { ...car.stats };
  const e = upgrades.engine || 0, g = upgrades.grip || 0, b = upgrades.boost || 0;
  s.maxSpeed *= 1 + 0.035 * e;
  s.accel *= 1 + 0.03 * e;
  s.grip *= 1 + 0.06 * g;
  s.turn *= 1 + 0.03 * g;
  s.boostFill = 1 + 0.2 * b;
  return s;
}

// Garage bars, 1-5.
export function statBars(car) {
  const s = car.stats;
  const scale = (v, lo, hi) => Math.max(1, Math.min(5, Math.round(1 + ((v - lo) / (hi - lo)) * 4)));
  return {
    speed: scale(s.maxSpeed, 32, 44),
    accel: scale(s.accel, 14, 21),
    grip: scale(s.grip, 6.2, 9),
    drift: scale(s.drift, 0.9, 1.45),
    weight: scale(s.weight, 0.6, 1.6),
  };
}
