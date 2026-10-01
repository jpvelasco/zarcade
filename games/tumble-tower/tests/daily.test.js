import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyLevel, dateKey } from '../src/daily.js';
import { flatHeight } from '../src/animals.js';
import { Game } from '../src/game.js';

test('date keys use the local calendar date', () => {
  assert.equal(dateKey(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('same day, same tower; different days differ', () => {
  const a = dailyLevel('2026-10-01'), b = dailyLevel('2026-10-01'), c = dailyLevel('2026-10-02');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.sequence, c.sequence);
  assert.match(a.name, /Oct 1/);
});

test('a year of daily towers are all sensible', () => {
  const flavours = new Set();
  for (let d = 0; d < 365; d++) {
    const key = dateKey(new Date(2026, 0, 1 + d));
    const l = dailyLevel(key);
    flavours.add(l.flavour);
    assert.ok(l.goal >= 4.5 && l.goal <= 6);
    assert.equal(l.sequence.length, l.limit);
    assert.ok(l.par < l.limit);
    const total = l.sequence.reduce((s, p) => s + flatHeight(p.animal), 0);
    assert.ok(total > l.goal * 1.5, key);
    const g = new Game({ mode: 'daily', level: l });
    assert.ok(g.held);
  }
  assert.ok(flavours.size >= 4);
});
