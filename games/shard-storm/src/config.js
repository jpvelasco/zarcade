// Shared constants for Shard Storm. Everything the simulation touches is
// measured in field units. The field is always FIELD.h tall; its width follows
// the window's shape (see fieldWidthFor in world.js) so the storm fills the
// screen on a desktop, a phone held upright and a phone on its side. FIELD.w
// is the classic portrait width, used when nothing else is known.
export const FIELD = { w: 600, h: 900, minW: 400, maxW: 2000 };

// Below `refScale` CSS px per field unit (a phone on its side squeezes 900
// units into ~390 px) crystals grow, up to `max`, so they stay big enough to
// read and to hit with a thumb. Hitboxes grow with them.
export const SIZE = { refScale: 0.65, max: 1.6 };

// Fixed physics step (matches the frame-loop STEP in main.js).
export const STEP = 1 / 120;

// Crystals launch from below the field and arc under this gravity.
export const GRAVITY = 620;

// The blade ribbon: how long it lingers, how thick it sweeps, and the
// minimum swipe speed (field px/s) for a pointer move to register as a swing.
// `maxSwipe` caps how long one gesture lasts: a mouse that never stops moving
// would otherwise be a single endless swipe that can only touch each crystal
// once (and whose hit set would grow for the whole run).
export const BLADE = { life: 0.18, radius: 9, maxPts: 48, minSpeed: 130, maxSwipe: 0.6 };

// Combo / slow-mo. The rolling combo counts shards sliced within `window`
// seconds of game time; a big enough swipe or combo dilates time.
export const COMBO = {
  window: 1.4,
  slowShards: 3, // shards in a single swipe frame
  slowCombo: 8, // rolling combo threshold
  slowDur: 0.9,
  slowScale: 0.35,
};

export const LIVES = 3;

// Storm surge: the fail pressure. Every crystal that falls back unsliced
// fills the meter; a full meter costs a life and drops back to `resetTo`.
// Slicing bleeds it off, so a player who keeps up never sees it climb.
export const SURGE = {
  perMiss: 0.12, // a plain crystal lost
  clusterMiss: 0.16, // a cluster is a bigger loss
  goldMiss: 0.06, // gold is a prize, not a duty
  perSlice: 0.02, // every slice bleeds a little off
  mineRelief: 0.03, // letting a mine fall away is the right call
  frostDrain: 0.3, // a frost shard dumps a chunk
  resetTo: 0.4, // where the meter lands after an overload
  warn: 0.65, // the HUD starts shouting here
  // A miss costs more as the storm climbs, so late waves stay dangerous for a
  // player good enough to dodge every mine. The meter is always on screen, so
  // the pressure builds visibly rather than ambushing anyone.
  levelScale: 0.04,
  levelScaleMax: 2,
};

// Storm Break: slicing arms it, Space / the HUD button / a two-finger tap
// fires it, shattering the field for bonus points and surge relief.
export const BREAK = {
  perSlice: 1 / 16, // slices needed to arm it
  surgeRelief: 0.35,
  slowDur: 1.1, // the shatter buys a breath of slow-mo
};

// Storm difficulty. The storm level rises every `time` seconds; the spawn
// interval tightens, mines/shields become more likely, and later levels
// change *which* kinds appear (see KINDS below).
export const WAVE = {
  time: 10,
  baseInterval: 1.7,
  minInterval: 0.52,
  intervalDecay: 0.93,
  riseLo: 0.55, // rise height as a fraction of FIELD.h
  riseHi: 0.9,
  // Mines stay away for the first two levels (20 s), then ramp to the cap.
  mineFreeLevels: 1.5,
  mineChanceStep: 0.035,
  mineChanceMax: 0.3,
  shieldFromLevel: 3,
  shieldChanceStep: 0.025,
  shieldChanceMax: 0.28,
  batchMax: 4,
};

// Per-kind spawn weights by storm level. `from` is the first level the kind
// can appear on; the weight grows by `step` per level up to `max`.
export const KINDS = {
  cluster: { from: 1, base: 0.06, step: 0.012, max: 0.18 },
  frost: { from: 2, base: 0.08, step: 0.004, max: 0.12 },
  gold: { from: 3, base: 0.015, step: 0.003, max: 0.05 },
};

export const SHARD = { r: 26 };
export const MINE = { r: 23 };
export const SHIELD = { r: 42 };
export const CLUSTER = { r: 34, pieces: 4, pieceR: 17, spread: 190 };
export const FROST = { r: 25 };
export const GOLD = { r: 24 };

export const SCORE = {
  shard: 10,
  comboBonus: 2,
  cluster: 15,
  piece: 8,
  frost: 20,
  gold: 150,
  breakEach: 30,
};

// Daily Storm goal: reach this score to clear the day's storm. Tuned against
// the reworked scoring: the headless autopilot clears the top of the band on
// every seed it was measured on, in roughly a minute of decent play.
// See docs/superpowers/specs/2026-10-06-shard-storm-overhaul.md.
export const DAILY = { target: 1400, spread: 700, clear: true };

export const COLORS = {
  bg0: '#060917',
  bg1: '#0c1436',
  // No warm yellow in the crystal palette: gold is the prize colour and has
  // to be unmistakable at a glance on a phone.
  shard: ['#59f2ff', '#8bff5e', '#5e9bff', '#ff7ad9', '#b08bff', '#ff6a5e'],
  mine: '#ff3b4e',
  shield: '#6ff0ff',
  blade: '#ffffff',
  bladeEdge: '#7df9ff',
  accent: '#7df9ff',
  gold: '#ffd159',
  frost: '#cdf3ff',
  cluster: '#9affd8',
  surge: '#ff5a4e',
  surgeWarn: '#ffb347',
};
