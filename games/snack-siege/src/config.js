// Tuning shared by the simulation, levels, autoplayer and renderer.

export const TICK = 1 / 60; // one game tick
export const SUBSTEPS = 2; // physics runs at 120 Hz
export const GRAVITY = -20;

export const SLING = { x: 3.6, y: 3.3 }; // pouch rest position
export const MAX_PULL = 2.4; // world units
export const MAX_SPEED = 25; // launch speed at full pull
export const MIN_PULL = 0.45; // shorter pulls cancel

export const KILL_Y = -7;
export const BEAN_BONUS = 10000;
export const BEAR_SCORE = 5000;
export const COMBO_WINDOW = 0.8;

// Damage: approach speed above DMG_SPEED, times the pair's effective mass.
export const DMG_SPEED = 2.2;
export const DMG_K = 0.36;
export const BEAR_FRAGILITY = 2;
export const BEAN_HIT = 1.4;
export const HEAVY_HIT = 2.2;

export const MATERIALS = {
  cookie: { name: 'Cookie', density: 0.9, friction: 0.75, restitution: 0.08, hp: 3.2, score: 300 },
  glass: { name: 'Sugar glass', density: 0.7, friction: 0.4, restitution: 0.1, hp: 1.1, score: 200 },
  choc: { name: 'Chocolate', density: 1.5, friction: 0.8, restitution: 0.05, hp: 6.5, score: 500 },
  rock: { name: 'Rock candy', density: 2.3, friction: 0.8, restitution: 0.05, hp: 11, score: 800 },
  ice: { name: 'Frosting ice', density: 0.9, friction: 0.08, restitution: 0.1, hp: 2.4, score: 300 },
  marsh: { name: 'Marshmallow', density: 0.4, friction: 0.9, restitution: 0.55, hp: 4, score: 250 },
  fizz: { name: 'Fizz crate', density: 0.6, friction: 0.6, restitution: 0.1, hp: 1.0, score: 500, explode: { radius: 3.3, strength: 22, damage: 7 } },
  gumball: { name: 'Gumball', density: 2.0, friction: 0.5, restitution: 0.3, hp: 7, score: 600, round: true },
};

export const BEARS = {
  s: { r: 0.48, hp: 1.2, density: 1 },
  m: { r: 0.66, hp: 2.4, density: 1 },
  l: { r: 0.9, hp: 5, density: 1, helmet: true },
  k: { r: 1.05, hp: 8, density: 1, crown: true }, // the Bear King
};

export const BEANS = {
  cherry: {
    name: 'Cherry Pip', r: 0.45, density: 3.2, restitution: 0.2, friction: 0.6,
    power: null, blurb: 'A solid all-rounder. Aim true!',
    color: '#ef3b4f', light: '#ff8a96', dark: '#a3122a',
  },
  blue: {
    name: 'Blueberry Trio', r: 0.42, density: 3.2, restitution: 0.2, friction: 0.6,
    power: 'split', blurb: 'Tap while flying to split into three!',
    color: '#3f7cff', light: '#9dbcff', dark: '#1d3fa8',
  },
  lime: {
    name: 'Lime Bouncer', r: 0.45, density: 3.0, restitution: 0.72, friction: 0.35,
    power: 'hop', blurb: 'Super bouncy. Tap while flying to jump!',
    color: '#5fd13b', light: '#b7f59a', dark: '#2d7d17',
  },
  grape: {
    name: 'Grape Boulder', r: 0.5, density: 3.2, restitution: 0.1, friction: 0.7,
    power: 'heavy', blurb: 'Tap to turn heavy and SLAM straight down!',
    color: '#8e45d8', light: '#c99cf5', dark: '#4f1d8a',
  },
  honey: {
    name: 'Honey Drop', r: 0.45, density: 3.0, restitution: 0.05, friction: 0.9,
    power: 'sticky', blurb: 'Sticks to what it hits, then goes POP. Tap to pop early!',
    color: '#ffb31f', light: '#ffe08a', dark: '#b86e00',
  },
  mint: {
    name: 'Mint Rocket', r: 0.42, density: 3.0, restitution: 0.15, friction: 0.5,
    power: 'boost', blurb: 'Tap to rocket forward in a straight line!',
    color: '#3fe0c0', light: '#b4fff0', dark: '#138a74',
  },
};

export const POWERS = {
  split: { spread: 0.2, childR: 0.31 },
  hop: { vy: 12 },
  heavy: { density: 16, vy: -26, keepVx: 0.35 },
  sticky: { fuse: 1.2, radius: 3.4, strength: 26, damage: 8 },
  boost: { speed: 36, gravityScale: 0.25, time: 0.55 },
};

export const WORLDS = [
  { id: 'cookie', name: 'Cookie Canyon', blurb: 'Crumbly cliffs and cookie forts', sky: ['#ffd9a8', '#ffb37a'], accent: '#e8913a' },
  { id: 'soda', name: 'Soda Springs', blurb: 'Fizzy pools and bouncy marshmallows', sky: ['#b8f1ff', '#6fc7f2'], accent: '#2fb4e8' },
  { id: 'frost', name: 'Frosting Peaks', blurb: 'Icy towers on snowy icing', sky: ['#e9dcff', '#a99cf0'], accent: '#8d7cf0' },
];
