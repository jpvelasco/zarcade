import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDALS, medalFor, reference, referenceSteps } from '../src/reference.js';
import { Race } from '../src/race.js';
import { RACERS, kartById } from '../src/karts.js';
import { allTracks, run, track } from './helpers.js';

test('reference laps give ordered medal targets and a gold ghost on every track', () => {
  for (const t of allTracks()) {
    const r = reference(t);
    assert.ok(r.best > 15 && r.best < 40, `${t.id} best ${r.best}`);
    assert.equal(r.targets.length, 3);
    assert.ok(r.targets[0] > r.targets[1] && r.targets[1] > r.targets[2], t.id);
    assert.ok(r.ghost && r.ghost.samples.length > 300, `${t.id} ghost`);
  }
});

test('reference laps are deterministic and can run in chunks', () => {
  const t = track('lollipop-lanes');
  const a = reference(t);
  const it = referenceSteps(t, { chunk: 100 });
  let chunks = 0, out;
  for (;;) { const s = it.next(); if (s.done) { out = s.value; break; } chunks++; }
  assert.ok(chunks > 20);
  assert.equal(out.best, a.best);
});

test('medals: slower than bronze earns nothing, faster than gold earns gold', () => {
  const targets = [30, 27, 25];
  assert.equal(medalFor(31, targets), 0);
  assert.equal(medalFor(29, targets), 1);
  assert.equal(medalFor(26, targets), 2);
  assert.equal(medalFor(24, targets), 3);
  assert.equal(medalFor(NaN, targets), 0);
  assert.deepEqual(MEDALS.map((m) => m.id), ['bronze', 'silver', 'gold']);
});

test('balance: a careful, cautious driver still earns bronze on the first cup', () => {
  for (const id of ['toybox-speedway', 'block-tower-bend', 'crayon-curves', 'train-set-twister']) {
    const t = track(id);
    const { targets } = reference(t);
    const race = new Race({ track: t, entrants: [{ racer: RACERS[2], kart: kartById('bumble'), personality: 'careful' }], mode: 'tt', items: false, rubber: false, seed: 5, aiSkill: 0.9 });
    run(race, { maxTime: 200 });
    const best = race.karts[0].bestLap;
    assert.ok(medalFor(best, targets) >= 1, `${id}: ${best.toFixed(2)} vs bronze ${targets[0]}`);
  }
});
