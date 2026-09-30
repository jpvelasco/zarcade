// Shared constants for the fixed logical playfield. Everything in the
// simulation is measured in these units; the renderer scales them to fit.
export const FIELD = { w: 600, h: 880, top: 64 };

// The brick grid: 13 columns (odd, so shapes can be symmetric) and up to
// 16 rows starting just under the HUD.
export const GRID = { cols: 13, rows: 16, bw: 44, bh: 22, x: 14, y: 96 };

export const PADDLE = {
  y: 820, // centre line
  h: 18,
  w: 104,
  wideW: 164,
  sleepyScale: 0.68,
  maxSpeed: 1100, // keyboard / gamepad
  accel: 10000,
  followSpeed: 3200, // mouse / touch direct follow cap (px/s)
  maxAngle: (62 * Math.PI) / 180,
};

export const BALL = { r: 8, bigR: 13, maxBalls: 12, minVertical: 0.3, maxSpeedBoost: 260 };

export const TIMING = {
  step: 1 / 120,
  clearDelay: 1.0,
  bossClearDelay: 2.2,
  stickyRelease: 3,
  comboWindow: 2.2,
  restless: 9, // seconds without a hit before the comet gets restless
};

export const LASER = { speed: 950, cooldown: 0.2, autoCooldown: 0.5, w: 4, h: 16 };
export const CAPSULE = { w: 62, h: 22, speed: 150 };
