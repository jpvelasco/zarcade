import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN, POINTS, Race, STEP, pointsFor } from '../src/race.js';
import { linePoint, lapDelta } from '../src/track.js';
import { autopilot } from '../src/ai.js';
import { RACERS, kartById } from '../src/karts.js';
import { entrants, run, track } from './helpers.js';

const t = track('toybox-speedway');

const playerRace = (opts = {}) => new Race({ track: t, entrants: entrants({ player: true }), mode: 'gp', seed: 9, ...opts });

test('countdown, then GO', () => {
  const race = playerRace();
  const events = run(race, { until: (r) => r.state === 'racing' });
  assert.deepEqual(events.filter((e) => e.type === 'count').map((e) => e.n), [3, 2, 1]);
  assert.ok(events.some((e) => e.type === 'go'));
  for (const k of race.karts) assert.ok(k.v === 0 || k.rocket, 'nobody moves before GO');
});

test('a rocket start needs drift pressed just before GO', () => {
  const early = playerRace();
  run(early, { until: (r) => r.clock > -1.5, controls: () => ({ drift: true }) });
  run(early, { until: (r) => r.state === 'racing', controls: () => ({ drift: true }) });
  assert.ok(!early.player.rocket, 'pressed too early');
  const timed = playerRace();
  run(timed, { until: (r) => r.clock > -0.3 });
  run(timed, { until: (r) => r.state === 'racing', controls: () => ({ drift: true }) });
  assert.equal(timed.player.rocket, true);
  assert.ok(timed.player.boostT > 0);
});

test('a lap only counts after every checkpoint, in order', () => {
  const race = playerRace();
  run(race, { until: (r) => r.state === 'racing' });
  const k = race.player;
  // Reverse over the line and back: no lap.
  const events = run(race, { maxTime: 4, controls: () => ({ brake: true }) });
  run(race, { maxTime: 8, controls: (r) => autopilot(r, k) });
  assert.equal(k.laps, 0);
  assert.ok(!events.some((e) => e.type === 'lap' && e.kart === k.index));
  // Drive it properly.
  const ev = run(race, { until: () => k.laps >= 1, maxTime: 60, controls: (r) => autopilot(r, k) });
  const cps = ev.filter((e) => e.type === 'checkpoint' && e.kart === k.index).map((e) => e.cp);
  assert.deepEqual(cps.slice(0, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(k.laps, 1);
});

test('progress never jumps: a kart teleported across the map gains nothing', () => {
  const race = playerRace();
  run(race, { until: (r) => r.state === 'racing' });
  const k = race.player;
  const before = k.dist;
  const far = linePoint(t, k.s + t.length / 2);
  k.x = far.x; k.y = far.y; k.hint = null;
  race.step(STEP, {});
  assert.ok(k.dist - before < 50, `gained ${k.dist - before}`);
});

test('the result is fixed the moment the player crosses the line', () => {
  const race = playerRace();
  run(race, { until: (r) => r.player.finished, maxTime: 200, controls: (r) => autopilot(r, r.player) });
  assert.ok(race.result, 'result recorded at the line');
  const frozen = JSON.stringify(race.result.order);
  assert.equal(race.result.playerPlace, race.player.place);
  run(race, { maxTime: 300 });
  assert.equal(race.state, 'done');
  assert.equal(JSON.stringify(race.result.order), frozen);
  assert.equal(race.result.lapTimes.length, 3);
});

test('no fail state: a player who never moves still gets a placing and the race ends', () => {
  const race = playerRace();
  run(race, { maxTime: 400 });
  assert.equal(race.state, 'done');
  assert.equal(race.result.playerPlace, 6);
  assert.equal(race.result.order.length, 6);
});

test('a racer far behind gets a tail wind', () => {
  const race = playerRace();
  run(race, { maxTime: 25 });
  const k = race.player; // has not moved
  assert.equal(k.mercy, true);
  assert.ok(k.speedMul > race.cls.speed);
});

test('rubber-banding stays within its class caps and never moves a kart', () => {
  const race = playerRace({ classId: 'zippy' });
  run(race, { until: (r) => r.state === 'racing' });
  let maxStep = 0;
  run(race, {
    maxTime: 40,
    onStep: (r) => {
      for (let i = 0; i < r.karts.length; i++) {
        const k = r.karts[i];
        if (k.player) continue;
        const mul = k.speedMul / r.cls.speed / (k.mercy ? 1.06 : 1);
        assert.ok(mul >= 1 - r.cls.ahead - 1e-9 && mul <= 1 + r.cls.behind + 1e-9, `rubber ${mul}`);
        assert.ok(r.cls.ahead <= 0.1 && r.cls.behind <= 0.05);
      }
    },
  });
  // No kart ever moves faster than a comet ride allows.
  const race2 = playerRace();
  const last = race2.karts.map((k) => [k.x, k.y]);
  run(race2, {
    maxTime: 40,
    onStep: (r) => r.karts.forEach((k, i) => {
      const d = Math.hypot(k.x - last[i][0], k.y - last[i][1]);
      maxStep = Math.max(maxStep, d);
      last[i] = [k.x, k.y];
    }),
  });
  assert.ok(maxStep < 600 * STEP + 3, `largest step ${maxStep}`);
});

test('places follow race distance, and points follow places', () => {
  const race = playerRace();
  run(race, { maxTime: 20 });
  for (let i = 1; i < race.order.length; i++) assert.ok(race.order[i - 1].dist >= race.order[i].dist);
  const pts = pointsFor([2, 0, 1, 5, 4, 3]);
  assert.equal(pts[2], POINTS[0]);
  assert.equal(pts[3], POINTS[5]);
});

test('the same seed and inputs replay the same race', () => {
  const a = new Race({ track: t, entrants: entrants(), mode: 'attract', seed: 21 });
  const b = new Race({ track: t, entrants: entrants(), mode: 'attract', seed: 21 });
  run(a, { maxTime: 300 });
  run(b, { maxTime: 300 });
  assert.deepEqual(a.result.order, b.result.order);
  assert.deepEqual(a.result.times, b.result.times);
});

test('time trials start with a Triple Turbo and record a best-lap ghost', () => {
  const race = new Race({ track: t, entrants: [{ racer: RACERS[0], kart: kartById('buggy'), player: true }], mode: 'tt', items: false, seed: 1 });
  run(race, { until: (r) => r.state === 'racing' });
  assert.equal(race.player.item, 'triple');
  assert.equal(race.boxes.length, 0);
  run(race, { maxTime: 200, controls: (r) => autopilot(r, r.player) });
  assert.equal(race.state, 'done');
  assert.ok(race.result.bestLap > 10);
  assert.ok(race.bestGhost && Math.abs(race.bestGhost.time - race.result.bestLap) < 1e-9);
  assert.ok(race.bestGhost.samples.length / 3 > race.bestGhost.time * 19);
});

test('countdown length matches the HUD', () => {
  assert.equal(COUNTDOWN, 3);
  assert.ok(lapDelta(t, t.length - 10, 10) === 20);
});
