import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, ISLANDS, levelSequence, drawSequence, islandLevels } from '../src/levels.js';
import { ANIMAL_BY_ID, STARTERS, flatHeight, animalShape } from '../src/animals.js';

test('32 levels over five islands', () => {
  assert.ok(LEVELS.length >= 30);
  assert.equal(ISLANDS.length, 5);
  for (let i = 0; i < ISLANDS.length; i++) assert.ok(islandLevels(i).length >= 6);
});

test('every level has sane numbers', () => {
  for (const l of LEVELS) {
    assert.ok(l.goal > 0 && l.goal < 15, l.name);
    assert.ok(l.par >= 2 && l.par <= l.limit, l.name);
    assert.ok(l.limit >= l.par + 2, `${l.name} leaves room for mistakes`);
    assert.ok(l.width >= 4 && l.width <= 7, l.name);
    for (const id of Object.keys(l.pool)) assert.ok(ANIMAL_BY_ID[id], `${l.name}: ${id}`);
  }
});

test('levels only use animals the player has met by then', () => {
  const met = new Set(STARTERS);
  for (let i = 0; i < ISLANDS.length; i++) {
    for (const l of islandLevels(i)) for (const a of levelSequence(l)) assert.ok(met.has(a.animal), `${l.name} uses ${a.animal} too early`);
    for (const a of ISLANDS[i].reward) met.add(a);
  }
});

test('features appear on their islands', () => {
  for (const l of islandLevels(1)) assert.ok(l.wind);
  for (const l of islandLevels(2)) assert.ok(l.ice > 0);
  for (const l of islandLevels(3)) assert.ok(l.mover);
  for (const l of islandLevels(0)) assert.ok(!l.wind && !l.ice && !l.mover);
});

test('each goal is reachable with the animals given, stacked flat', () => {
  for (const l of LEVELS) {
    const seq = levelSequence(l);
    const sorted = seq.map((p) => flatHeight(p.animal)).sort((a, b) => b - a);
    const parHeight = sorted.slice(0, l.par).reduce((a, b) => a + b, 0);
    const all = sorted.reduce((a, b) => a + b, 0);
    assert.ok(all > l.goal * 1.4, `${l.name}: ${all.toFixed(2)} m of animals for a ${l.goal} m goal`);
    assert.ok(parHeight + 1.5 > l.goal, `${l.name}: par ${l.par} can reach ${parHeight.toFixed(2)} m`);
  }
});

test('sequences are seeded and start with a good base', () => {
  for (const l of LEVELS) {
    const a = levelSequence(l), b = levelSequence(l);
    assert.deepEqual(a, b);
    assert.equal(a.length, l.limit);
    assert.notEqual(animalShape(a[0].animal).type, 'circle');
    assert.equal(a[0].ice, false);
  }
  assert.notDeepEqual(drawSequence({ hippo: 1, turtle: 1, giraffe: 1 }, 10, 1), drawSequence({ hippo: 1, turtle: 1, giraffe: 1 }, 10, 2));
});

test('round animals never come twice in a row', () => {
  for (const l of LEVELS) {
    const s = levelSequence(l);
    for (let i = 1; i < s.length; i++) {
      const r = (id) => animalShape(id).type === 'circle';
      assert.ok(!(r(s[i].animal) && r(s[i - 1].animal)), `${l.name} #${i}`);
    }
  }
});
