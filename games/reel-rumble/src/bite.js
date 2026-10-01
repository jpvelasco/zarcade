// Nibbles, the bite and setting the hook. Pure and seeded.
//
// A fish at the lure tests it with a few nibbles (the bobber twitches), then
// bites (the bobber dives). Pressing during the nibbles spooks it; pressing
// in the bite window hooks it, and pressing early in the window is a
// "perfect" hook that tires the fish a little before the fight starts.
import { BEHAVIORS } from './data.js';
import { range } from './rng.js';

export const BITE_WINDOW = 0.9; // seconds, before behaviour and bait
export const PERFECT_PART = 0.4; // first 40% of the window

export function createBite(fish, rng, { hook = 1 } = {}) {
  const b = BEHAVIORS[fish.behavior];
  const nibbles = Math.round(range(rng, b.nibbles[0], b.nibbles[1]));
  return {
    fish, rng,
    phase: 'nibble', // nibble | bite | hooked | spooked | stolen
    nibblesLeft: nibbles,
    timer: range(rng, 0.6, 1.3),
    window: BITE_WINDOW * b.window * hook,
    t: 0,
    quality: null,
    events: [],
  };
}

export function stepBite(bite, dt, press) {
  if (bite.phase === 'nibble') {
    if (press) {
      bite.phase = 'spooked';
      bite.events.push({ type: 'early' });
      return bite;
    }
    bite.timer -= dt;
    if (bite.timer <= 0) {
      if (bite.nibblesLeft > 0) {
        bite.nibblesLeft--;
        bite.events.push({ type: 'nibble' });
        bite.timer = range(bite.rng, 0.55, 1.35);
      } else {
        bite.phase = 'bite';
        bite.t = 0;
        bite.events.push({ type: 'bite' });
      }
    }
  } else if (bite.phase === 'bite') {
    if (press) {
      bite.phase = 'hooked';
      bite.quality = bite.t <= bite.window * PERFECT_PART ? 'perfect' : 'good';
      bite.events.push({ type: 'hooked', quality: bite.quality });
      return bite;
    }
    bite.t += dt;
    if (bite.t > bite.window) {
      bite.phase = 'stolen';
      bite.events.push({ type: 'stolen' });
    }
  }
  return bite;
}

export const biteDone = (bite) => bite.phase === 'hooked' || bite.phase === 'spooked' || bite.phase === 'stolen';
