import test from 'node:test';
import assert from 'node:assert/strict';
import { CUPS, cupRaces, newCup, applyResult, standings, cupComplete, placeOf, pointsFor, trophyFor, starsFor, raceCoins, POINTS } from '../src/championship.js';
import { LOCATIONS, RACE_KINDS } from '../src/locations.js';

const roster = ['player', 'yuki', 'bruno', 'ingrid', 'amara', 'pierre', 'tilly'];

test('cups have 3-4 valid races and visit every location', () => {
  assert.equal(CUPS.length, 4);
  const visited = new Set();
  for (const cup of CUPS) {
    assert.ok(cup.races.length >= 3 && cup.races.length <= 4, cup.id);
    for (const r of cupRaces(cup)) {
      assert.ok(r.location, `${cup.id}: ${r.loc}`);
      assert.ok(RACE_KINDS[r.kind] && r.kind !== 'timetrial');
      visited.add(r.loc);
    }
  }
  assert.equal(visited.size, LOCATIONS.length);
  for (let i = 1; i < CUPS.length; i++) assert.ok(CUPS[i].needStars > CUPS[i - 1].needStars);
});

test('points by place', () => {
  assert.deepEqual([1, 2, 3, 7, 8].map(pointsFor), [10, 8, 6, 2, 0]);
  assert.equal(POINTS.length, 7);
});

test('scoring a cup and the standings', () => {
  const s = newCup('sunrise', roster);
  applyResult(s, ['player', 'yuki', 'bruno', 'ingrid', 'amara', 'pierre', 'tilly']);
  applyResult(s, ['yuki', 'player', 'bruno', 'ingrid', 'amara', 'pierre', 'tilly']);
  assert.equal(cupComplete(s), false);
  applyResult(s, ['bruno', 'player', 'yuki', 'ingrid', 'amara', 'pierre', 'tilly']);
  assert.equal(cupComplete(s), true);
  const st = standings(s);
  assert.equal(st[0].key, 'player');
  assert.equal(st[0].points, 26);
  assert.equal(st[1].key, 'yuki');
  assert.equal(st[1].points, 24);
  assert.equal(placeOf(s, 'bruno'), 3);
});

test('ties go to more wins, then the better last race', () => {
  const s = newCup('sunrise', ['a', 'b', 'c']);
  applyResult(s, ['a', 'c', 'b']); // a 10, c 8, b 6
  applyResult(s, ['b', 'c', 'a']); // b 16, c 16, a 16
  const st = standings(s);
  assert.deepEqual(st.map((x) => x.points), [16, 16, 16]);
  // a and b each have a win; c has none.
  assert.equal(st[2].key, 'c');
  assert.equal(st[0].key, 'b', 'b won the last race');
});

test('trophies, stars and coins', () => {
  assert.deepEqual([1, 2, 3, 4].map(trophyFor), ['gold', 'silver', 'bronze', null]);
  assert.deepEqual([1, 2, 3, 4].map(starsFor), [3, 2, 1, 0]);
  assert.ok(raceCoins(1, 'circuit') > raceCoins(7, 'circuit'));
  assert.ok(raceCoins(9, 'sprint') > 0);
});
