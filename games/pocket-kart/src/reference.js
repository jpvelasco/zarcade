// Expert reference laps. A careful, skilled AI drives the track alone with
// the same Triple Turbo a time-trial player gets; its best lap sets the
// medal targets and becomes the "gold ghost" you race before you have your
// own. Deterministic, and chunked so a browser can spread it over frames.
import { Race, STEP } from './race.js';
import { RACERS, kartById } from './karts.js';

// Lap-time targets as multiples of the expert's best lap.
export const MEDALS = [
  { id: 'bronze', name: 'Bronze', factor: 1.24 },
  { id: 'silver', name: 'Silver', factor: 1.11 },
  { id: 'gold', name: 'Gold', factor: 1.03 },
];

export function* referenceSteps(track, { chunk = 480 } = {}) {
  const race = new Race({
    track,
    entrants: [{ racer: RACERS.find((r) => r.id === 'ollie'), kart: kartById('buggy'), personality: 'ace' }],
    mode: 'tt', classId: 'zippy', seed: 11, items: false, rubber: false, aiSkill: 1,
  });
  let n = 0;
  while (race.state !== 'done' && race.time < 300) {
    race.step(STEP, null);
    race.events.length = 0;
    if (++n % chunk === 0) yield null;
  }
  const k = race.karts[0];
  const best = Number.isFinite(k.bestLap) ? k.bestLap : 60;
  return {
    best,
    total: k.finishTime ?? race.time,
    targets: MEDALS.map((m) => Math.round(best * m.factor * 100) / 100),
    ghost: race.bestGhost,
  };
}

export function reference(track) {
  const it = referenceSteps(track);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

// 0 none, 1 bronze, 2 silver, 3 gold for a lap time.
export function medalFor(time, targets) {
  if (!Number.isFinite(time) || !targets) return 0;
  let m = 0;
  targets.forEach((t, i) => { if (time <= t) m = i + 1; });
  return m;
}
