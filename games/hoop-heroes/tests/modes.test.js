import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyRules, quickRules, trickRules, TRICK_LEVELS, trickStars, TIMED_SPOTS, RACK_SPOTS } from '../src/modes.js';
import { RIVALS, rivalRules, LADDER_COURTS, courtRivals } from '../src/rivals.js';
import { COURTS, COURT_BY_ID } from '../src/courts.js';
import { DIFFICULTY } from '../src/ai.js';
import { BALLS, JERSEYS, COURT_ITEMS } from '../src/cosmetics.js';
import { MISSIONS } from '../src/missions.js';

test('the daily shootout is the same all day and changes between days', () => {
  assert.deepEqual(dailyRules('2026-10-01'), dailyRules('2026-10-01'));
  const days = new Set();
  for (let d = 1; d <= 20; d++) days.add(JSON.stringify(dailyRules(`2026-10-${String(d).padStart(2, '0')}`)));
  assert.ok(days.size >= 15);
  const kinds = new Set();
  for (let d = 1; d <= 28; d++) kinds.add(dailyRules(`2026-11-${String(d).padStart(2, '0')}`).kind);
  assert.equal(kinds.size, 3);
});

test('daily rules are valid rounds', () => {
  for (let d = 1; d <= 30; d++) {
    const r = dailyRules(`2026-09-${String(d).padStart(2, '0')}`);
    assert.equal(r.time, 60);
    assert.ok(r.spots.length >= 1);
    assert.ok(COURT_BY_ID[r.court]);
    for (const s of r.spots) assert.ok(s.d >= 3.8 && s.d <= 6.2);
  }
});

test('ladder data is complete', () => {
  assert.equal(RIVALS.length, 12);
  assert.equal(new Set(RIVALS.map((r) => r.id)).size, 12);
  for (const c of LADDER_COURTS) assert.equal(courtRivals(c).length, 3);
  for (const r of RIVALS) {
    assert.ok(DIFFICULTY[r.diff], r.id);
    assert.ok(COURT_BY_ID[r.court], r.id);
    const rules = rivalRules(r);
    assert.ok(rules.time > 0 && rules.spots.length > 0, r.id);
    assert.ok(r.hello && r.win && r.lose);
  }
  assert.equal(RIVALS.at(-1).diff, 'champion');
  assert.equal(COURT_BY_ID.space.g < 9.8, true);
});

test('quick play, spots and trick data are well formed', () => {
  for (const k of ['timed', 'moving', 'racks']) assert.equal(quickRules(k, 'park').kind, k);
  assert.equal(RACK_SPOTS.length, 5);
  assert.ok(TIMED_SPOTS.length >= 4);
  assert.equal(TRICK_LEVELS.length, 12);
  for (const l of TRICK_LEVELS) {
    assert.ok(l.stars[0] < l.stars[1] && l.stars[1] < l.stars[2] && l.stars[2] <= l.balls, l.id);
    assert.equal(trickStars(l, l.stars[2]), 3);
    assert.equal(trickStars(l, 0), 0);
    assert.ok(trickRules(l).trick.need);
  }
});

test('cosmetics, courts and missions have unique ids', () => {
  for (const list of [BALLS, JERSEYS, COURT_ITEMS, COURTS, MISSIONS]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  for (const c of COURT_ITEMS) assert.ok(COURT_BY_ID[c.id]);
});
