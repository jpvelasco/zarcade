// Shared constants for Shard Storm. Everything the simulation touches is
// measured in the fixed FIELD; the renderer scales it to fit the window.
export const FIELD = { w: 600, h: 900 };

// Fixed physics step (matches the frame-loop STEP in main.js).
export const STEP = 1 / 120;

// Crystals launch from below the field and arc under this gravity.
export const GRAVITY = 620;

// The blade ribbon: how long it lingers, how thick it sweeps, and the
// minimum swipe speed (field px/s) for a pointer move to register as a swing.
export const BLADE = { life: 0.18, radius: 9, maxPts: 48, minSpeed: 130 };

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

// Storm difficulty. The storm level rises every `time` seconds; the spawn
// interval tightens and mines/shields become more likely.
export const WAVE = {
  time: 12,
  baseInterval: 1.7,
  minInterval: 0.5,
  riseLo: 0.55, // rise height as a fraction of FIELD.h
  riseHi: 0.9,
  vxBase: 90,
  vxStep: 22,
  mineChance0: 0.09,
  mineChanceStep: 0.03,
  mineChanceMax: 0.32,
  shieldChance0: 0.04,
  shieldChanceStep: 0.02,
  shieldChanceMax: 0.3,
  batchMax: 4,
};

export const SHARD = { r: 26 };
export const MINE = { r: 23 };
export const SHIELD = { r: 42 };

export const SCORE = { shard: 10, comboBonus: 2 };

// Daily Storm goal: reach this score to clear the day's storm.
export const DAILY = { target: 900, clear: true };

export const COLORS = {
  bg0: '#060917',
  bg1: '#0c1436',
  shard: ['#59f2ff', '#8bff5e', '#ffd159', '#ff7ad9', '#b08bff', '#ff6a5e'],
  mine: '#ff3b4e',
  shield: '#6ff0ff',
  blade: '#ffffff',
  bladeEdge: '#7df9ff',
  accent: '#7df9ff',
  gold: '#ffd159',
};
