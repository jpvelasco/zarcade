import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCase, gridClues, dailyCase, DIFFICULTY, truePool, stepLines, clueLine } from '../src/cases.js';
import { countSolutions, deduce, holds, NOT_TYPES, EITHER_TYPES } from '../src/logic.js';
import { CRITTERS, PLACES, THINGS, MYSTERIES, byId } from '../src/data.js';

const SEEDS = 150;

function checkCase(k) {
  const clues = gridClues(k);
  assert.equal(countSolutions(k.n, clues, 2), 1, `${k.id} has exactly one answer`);
  const r = deduce(k.n, clues);
  assert.ok(r.solved, `${k.id} is solvable by simple steps`);
  assert.deepEqual(r.world, k.solution, `${k.id} solver finds the answer`);
  for (const c of clues) assert.ok(holds(c, k.solution.place, k.solution.thing), `${k.id} clue is true`);
  const crime = k.clues.filter((c) => c.t === 'crime');
  assert.equal(crime.length, 1);
  assert.equal(k.solution[k.crime.kind][k.culprit], k.crime.idx);
  for (const c of k.clues) {
    assert.ok(c.text && c.text.length <= 90, `${k.id} line is short: ${c.text}`);
    assert.ok(!/undefined|NaN/.test(c.text), c.text);
    if (c.src.kind === 'scene') {
      assert.ok(c.src.place >= 0 && c.src.place < k.n);
      assert.ok(c.src.spot >= 0 && c.src.spot < 6);
    } else {
      assert.ok(c.src.who >= 0 && c.src.who < k.n);
    }
  }
  const spots = k.clues.filter((c) => c.src.kind === 'scene').map((c) => `${c.src.place}:${c.src.spot}`);
  assert.equal(new Set(spots).size, spots.length, 'one clue per spot');
  assert.deepEqual([...k.standing].sort(), [...Array(k.n).keys()]);
  assert.equal(new Set(k.suspects).size, k.n);
  assert.equal(new Set(k.places).size, k.n);
  assert.equal(new Set(k.things).size, k.n);
  for (const s of k.suspects) assert.ok(byId(CRITTERS, s));
  for (const p of k.places) assert.ok(byId(PLACES, p));
  for (const t of k.things) assert.ok(byId(THINGS, t));
}

test('data lists are complete and unique', () => {
  assert.ok(CRITTERS.length >= 18);
  assert.equal(PLACES.length, 12);
  assert.equal(THINGS.length, 12);
  assert.ok(MYSTERIES.length >= 10);
  for (const list of [CRITTERS, PLACES, THINGS, MYSTERIES]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  for (const m of MYSTERIES) assert.ok(m.reasons.length >= 3);
});

test('the true pool only holds true clues', () => {
  const world = { place: [1, 0, 2, 3], thing: [3, 2, 1, 0] };
  const pool = truePool(4, world, DIFFICULTY[3].types);
  assert.ok(pool.length > 20);
  for (const c of pool) assert.ok(holds(c, world.place, world.thing));
});

for (const d of [1, 2, 3]) {
  test(`${DIFFICULTY[d].name} cases: one answer, solvable by simple steps (${SEEDS} seeds)`, () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const k = generateCase(seed * 7919 + 13, d);
      assert.equal(k.n, DIFFICULTY[d].n);
      checkCase(k);
      const types = gridClues(k).map((c) => c.t);
      for (const t of types) assert.ok(DIFFICULTY[d].types.includes(t), `${t} allowed at ${d}`);
      if (d >= 2) assert.ok(types.some((t) => NOT_TYPES.includes(t)), 'has a "not" clue');
      if (d >= 3) assert.ok(types.some((t) => EITHER_TYPES.includes(t)), 'has an either/or clue');
    }
  });
}

test('generation is deterministic per seed', () => {
  const a = generateCase(42, 3);
  const b = generateCase(42, 3);
  assert.deepEqual(a, b);
  assert.notDeepEqual(generateCase(43, 3).clues, a.clues);
});

test('the daily case is the same all day and differs by day', () => {
  assert.deepEqual(dailyCase('2026-10-01'), dailyCase('2026-10-01'));
  assert.notDeepEqual(dailyCase('2026-10-01').solution, dailyCase('2026-10-02').solution);
  checkCase(dailyCase('2026-10-01'));
});

test('every suspect has something to say', () => {
  for (let seed = 0; seed < 40; seed++) {
    const k = generateCase(seed, 2);
    assert.equal(k.flavor.length, k.n);
    for (const line of k.flavor) assert.ok(line.length > 0 && line.length <= 70);
  }
});

test('every solver step has a hint line', () => {
  for (let seed = 0; seed < 30; seed++) {
    for (const d of [1, 2, 3]) {
      const k = generateCase(seed, d);
      const clues = gridClues(k);
      for (const step of deduce(k.n, clues).steps) {
        const lines = stepLines(k, step, clues);
        assert.equal(lines.length, 2);
        for (const line of lines) assert.ok(line && !/undefined/.test(line), `${step.rule}: ${line}`);
      }
    }
  }
});

test('scene traces name the right critter', () => {
  const k = generateCase(5, 1);
  const line = clueLine(k, { t: 'at', s: 0, p: 1, src: { kind: 'scene', place: 1 } });
  assert.ok(line.includes(byId(CRITTERS, k.suspects[0]).name));
});
