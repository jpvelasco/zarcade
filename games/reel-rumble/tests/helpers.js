// Shared test helpers: run a Trip with the bot until it ends.
import { Trip } from '../src/trip.js';
import { Bot } from '../src/bot.js';
import { mulberry32 } from '../src/rng.js';

export const BEST = { rod: 'starlight', reel: 'tidal', line: 'silk' };
export const STARTER = { rod: 'twig', reel: 'clicker', line: 'cotton', bait: 'worm' };

// One cast: returns { trip, outcome: 'landed' | 'lost' | 'timeout', events }.
export function playCast(opts, { seed = 1, skill = 1, maxSeconds = 150, dt = 1 / 30 } = {}) {
  const trip = new Trip({ seed, ...opts });
  const bot = new Bot({ skill, rng: mulberry32(seed * 31 + 7) });
  const events = [];
  for (let t = 0; t < maxSeconds; t += dt) {
    trip.step(dt, bot.controls(trip, dt));
    for (const e of trip.events) events.push(e.type);
    trip.events.length = 0;
    if (trip.state === 'landed' || trip.state === 'lost') break;
  }
  const outcome = trip.state === 'landed' ? 'landed' : trip.state === 'lost' ? 'lost' : 'timeout';
  return { trip, outcome, events };
}
