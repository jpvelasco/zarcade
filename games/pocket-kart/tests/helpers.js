// Shared test helpers: build tracks once, make entrants, run races.
import { buildTrack } from '../src/track.js';
import { TRACKS } from '../src/tracks.js';
import { RACERS, kartById } from '../src/karts.js';
import { Race, STEP } from '../src/race.js';

const cache = new Map();
export function track(id) {
  if (!cache.has(id)) cache.set(id, buildTrack(TRACKS.find((t) => t.id === id)));
  return cache.get(id);
}

export const allTracks = () => TRACKS.map((t) => track(t.id));

// Six AI entrants (the first `players` of them human-controlled).
export function entrants({ player = false, kart = null } = {}) {
  return RACERS.slice(0, 6).map((r, i) => ({ racer: r, kart: kartById(kart || r.kart), player: player && i === 5 }));
}

export function aiRace(t, opts = {}) {
  return new Race({ track: t, entrants: entrants(), mode: 'attract', seed: 7, ...opts });
}

// Steps a race until `until(race)` or the time limit; returns collected events.
export function run(race, { until = (r) => r.state === 'done', maxTime = 300, controls = null, onStep = null } = {}) {
  const events = [];
  let guard = 0;
  while (!until(race) && race.time < maxTime && guard++ < maxTime * 130) {
    race.step(STEP, controls ? controls(race) : null);
    for (const e of race.events) events.push(e);
    race.events.length = 0;
    onStep?.(race);
  }
  return events;
}

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}
