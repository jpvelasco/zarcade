// Shared helpers for the Bumper Blobs tests.
import { World } from '../src/world.js';
import { STEP } from '../src/config.js';

export const run = (world, seconds, controls = []) => {
  const steps = Math.round(seconds / STEP);
  for (let s = 0; s < steps; s++) world.step(STEP, typeof controls === 'function' ? controls(world) : controls);
};

// A world past its countdown, with power-ups and hazards off unless asked.
export function playWorld(opts = {}) {
  const w = new World({ arena: 'pudding', mode: 'lbs', players: [{}, {}], seed: 1, powerups: false, hazards: false, ...opts });
  while (w.phase === 'countdown') w.step(STEP, []);
  w.events.length = 0;
  return w;
}

export const place = (b, x, y) => { b.x = x; b.y = y; b.vx = 0; b.vy = 0; };
export const types = (w) => w.events.map((e) => e.type);
