import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, Driver, cornerSpeed, curvatureAhead, turnAhead } from '../src/ai.js';
import { PERSONALITIES, RACERS, kartById } from '../src/karts.js';
import { Race } from '../src/race.js';
import { aiRace, run, track } from './helpers.js';

test('every racer has a distinct personality, colour and kart', () => {
  assert.equal(RACERS.length, 8);
  assert.equal(new Set(RACERS.map((r) => r.personality)).size, 8);
  assert.equal(new Set(RACERS.map((r) => r.color)).size, 8);
  for (const r of RACERS) {
    assert.ok(PERSONALITIES[r.personality], r.id);
    assert.ok(kartById(r.kart).id === r.kart, r.id);
  }
});

test('personalities drive differently', () => {
  const t = track('crayon-curves');
  const stats = {};
  for (const id of ['drifter', 'careful', 'wild']) {
    const race = new Race({ track: t, entrants: [{ racer: RACERS[0], kart: kartById('buggy'), personality: id }], mode: 'attract', seed: 4, items: false, rubber: false });
    const ev = run(race, { maxTime: 120 });
    stats[id] = { time: race.karts[0].finishTime, turbos: ev.filter((e) => e.type === 'miniturbo').length };
  }
  assert.ok(stats.drifter.turbos > stats.careful.turbos, JSON.stringify(stats));
  assert.notEqual(stats.drifter.time, stats.wild.time);
});

test('rivals drift for mini-turbos and use items', () => {
  const race = aiRace(track('candy-canyon'));
  const ev = run(race, { maxTime: 200 });
  assert.ok(ev.filter((e) => e.type === 'miniturbo').length > 10);
  const used = new Set(ev.filter((e) => ['shield', 'star-drop', 'mushroom', 'jelly-fire', 'comet'].includes(e.type)).map((e) => e.type));
  assert.ok(used.size >= 3, [...used].join(','));
});

test('somebody takes a shortcut with a mushroom', () => {
  let taken = 0;
  for (const id of ['candy-canyon', 'starlight-docks', 'crayon-curves']) {
    const race = aiRace(track(id));
    run(race, { maxTime: 200, onStep: (r) => { for (const k of r.karts) if (k.shortcut >= 0 && k.surface === 'shortcut') taken++; } });
  }
  assert.ok(taken > 0);
});

test('AI corner speeds: tighter bends are slower, drifting is faster', () => {
  const race = aiRace(track('toybox-speedway'));
  const k = race.karts[0];
  assert.ok(cornerSpeed(k, 1 / 150) < cornerSpeed(k, 1 / 400));
  assert.ok(cornerSpeed(k, 1 / 150, true) > cornerSpeed(k, 1 / 150, false));
  assert.equal(cornerSpeed(k, 0), Infinity);
});

test('track reading helpers', () => {
  const t = track('toybox-speedway');
  assert.ok(curvatureAhead(t, 0, 400) >= 0);
  // A full lap of turning adds up to one full turn.
  assert.ok(Math.abs(Math.abs(turnAhead(t, 0, t.length)) - Math.PI * 2) < 0.2);
});

test('classes run from gentle to fierce', () => {
  assert.deepEqual(CLASSES.map((c) => c.id), ['cosy', 'zippy', 'turbo']);
  for (let i = 1; i < CLASSES.length; i++) {
    assert.ok(CLASSES[i].speed > CLASSES[i - 1].speed);
    assert.ok(CLASSES[i].skill >= CLASSES[i - 1].skill);
  }
});

test('a stuck AI backs out and gets going again', () => {
  const t = track('toybox-speedway');
  const race = new Race({ track: t, entrants: [{ racer: RACERS[0], kart: kartById('buggy'), personality: 'steady' }], mode: 'attract', seed: 2, items: false });
  run(race, { until: (r) => r.state === 'racing' });
  const k = race.karts[0];
  const m = t.main;
  // Facing straight into the wall, nose against it.
  const i = 60;
  const lat = m.hw[i] + t.verge - 12;
  k.x = m.x[i] + m.nx[i] * lat; k.y = m.y[i] + m.ny[i] * lat;
  k.h = k.m = Math.atan2(m.ny[i], m.nx[i]);
  k.v = 0; k.hint = i;
  const d0 = k.dist;
  run(race, { maxTime: race.time + 6 });
  assert.ok(k.dist - d0 > 300, `got going (${k.dist - d0})`);
});

test('Driver works from a personality name', () => {
  const d = new Driver('speedy', { seed: 1 });
  assert.equal(d.p, PERSONALITIES.speedy);
});
