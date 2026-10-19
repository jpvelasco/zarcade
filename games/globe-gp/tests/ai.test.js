import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATIONS } from '../src/locations.js';
import { CAR_BY_ID, CARS } from '../src/cars.js';
import { simulate } from '../src/race.js';
import { RIVALS, rivalStats, cornerSpeed, speedProfile, DIFFICULTY } from '../src/ai.js';
import { getTrack } from '../src/track.js';

test('six named rivals with distinct personalities and real cars', () => {
  assert.equal(RIVALS.length, 6);
  assert.equal(new Set(RIVALS.map((r) => r.name)).size, 6);
  for (const r of RIVALS) {
    assert.ok(CAR_BY_ID[r.car], r.car);
    assert.ok(r.quip && r.flag);
  }
  const drifters = RIVALS.filter((r) => r.drift > 0.6), bumpers = RIVALS.filter((r) => r.aggression > 0.6);
  assert.ok(drifters.length >= 1 && bumpers.length >= 1);
});

test('rivals race in the player car\'s class and difficulty scales them', () => {
  const kart = CAR_BY_ID.kart;
  const easy = rivalStats(RIVALS[0], kart, 'easy'), hard = rivalStats(RIVALS[0], kart, 'hard');
  assert.ok(easy.maxSpeed < kart.stats.maxSpeed);
  assert.ok(hard.maxSpeed > easy.maxSpeed);
  assert.ok(DIFFICULTY.easy.assist);
});

test('corner speed falls with curvature', () => {
  assert.equal(cornerSpeed(0, 2), Infinity);
  assert.ok(cornerSpeed(0.01, 2) > cornerSpeed(0.03, 2));
  assert.ok(cornerSpeed(0.03, 2.4) > cornerSpeed(0.03, 1.8));
  const t = getTrack(LOCATIONS[0], 'circuit');
  const prof = speedProfile(t, CAR_BY_ID.hatch.stats, 1);
  assert.equal(prof.length, t.samples.length);
  assert.ok(Math.min(...prof) > 8 && Math.max(...prof) <= CAR_BY_ID.hatch.stats.maxSpeed + 1e-6);
});

// The whole field on autopilot, on every track. Everyone must finish in a
// sensible time, and the rivals should be spread out but close.
for (const loc of LOCATIONS) {
  for (const kind of ['circuit', 'sprint']) {
    test(`AI finishes ${loc.id} ${kind} with a fair spread`, () => {
      const race = simulate({ location: loc, kind, car: CAR_BY_ID.hatch, difficulty: 'normal', untilAll: true }, 400);
      const unfinished = race.racers.filter((r) => !r.finished).map((r) => r.name);
      assert.deepEqual(unfinished, [], 'everyone finished');
      const rivals = race.racers.filter((r) => !r.isPlayer).map((r) => r.finishTime);
      const best = Math.min(...rivals), worst = Math.max(...rivals);
      const avg = race.totalDist / best;
      assert.ok(avg > 18 && avg < 45, `average speed ${avg.toFixed(1)} m/s`);
      const spread = (worst - best) / best;
      assert.ok(spread > 0.003, `rivals are not identical (${(spread * 100).toFixed(1)}%)`);
      assert.ok(spread < 0.2, `rivals stay in a pack (${(spread * 100).toFixed(1)}%)`);
    });
  }
}

test('on easy a good driver wins; on hard the race is close', () => {
  const loc = LOCATIONS[0];
  const easy = simulate({ location: loc, kind: 'circuit', car: CAR_BY_ID.hatch, difficulty: 'easy' }, 400);
  assert.equal(easy.player.place, 1);
  const hard = simulate({ location: loc, kind: 'circuit', car: CAR_BY_ID.hatch, difficulty: 'hard', untilAll: true }, 400);
  const res = hard.results();
  const gap = (res[res.length - 1].time - res[0].time) / res[0].time;
  assert.ok(gap < 0.12, `hard field within 12% (${(gap * 100).toFixed(1)}%)`);
});

test('every car can finish a race on autopilot', () => {
  for (const car of CARS) {
    const race = simulate({ location: LOCATIONS[7], kind: 'sprint', car, difficulty: 'easy' }, 300);
    assert.ok(race.player.finished, car.id);
  }
});
