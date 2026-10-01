import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/flow.js';
import { garden, zeros, N, E, S, W } from './helpers.js';

test('a straight run from spring to flower is complete', () => {
  const p = garden(3, 1, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'pipe', mask: E | W },
    2: { kind: 'flower', mask: W, need: 'b' },
  });
  const res = simulate(p, zeros(p));
  assert.equal(res.solved, true);
  assert.equal(res.bloomed, 1);
  assert.deepEqual([...res.depth], [0, 1, 2]);
});

test('a turned stone spills the water and leaves the flower dry', () => {
  const p = garden(3, 1, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'pipe', mask: E | W },
    2: { kind: 'flower', mask: W, need: 'b' },
  });
  const res = simulate(p, [0, 1, 0]);
  assert.equal(res.solved, false);
  assert.deepEqual(res.spills, [{ i: 0, d: 1 }]);
  assert.equal(res.dry, 2);
});

test('water running off the board edge is a spill', () => {
  const p = garden(2, 1, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'flower', mask: W, need: 'b' },
  });
  const res = simulate(p, [2, 0]);
  assert.deepEqual(res.spills, [{ i: 0, d: 3 }]);
});

test('every stone must be wet, even with every flower watered', () => {
  const p = garden(3, 1, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'flower', mask: W, need: 'b' },
    2: { kind: 'pipe', mask: N | S },
  });
  const res = simulate(p, zeros(p));
  assert.equal(res.bloomed, 1);
  assert.equal(res.solved, false);
});

test('bridges carry two streams across without mixing', () => {
  const p = garden(3, 3, {
    3: { kind: 'spring', mask: E, color: 'b' },
    4: { kind: 'bridge', mask: N | E | S | W },
    5: { kind: 'flower', mask: W, need: 'b' },
    1: { kind: 'spring', mask: S, color: 'y' },
    7: { kind: 'flower', mask: N, need: 'y' },
  });
  const res = simulate(p, zeros(p));
  assert.equal(res.solved, true);
  assert.equal(res.wet[4 * 3 + 1], 1, 'east-west channel is blue');
  assert.equal(res.wet[4 * 3 + 0], 2, 'north-south channel is gold');
});

test('gates only pass water entering by their arrow', () => {
  const p = garden(3, 1, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'gate', mask: E | W, inDir: 3 },
    2: { kind: 'flower', mask: W, need: 'b' },
  });
  assert.equal(simulate(p, zeros(p)).solved, true);
  const flipped = simulate(p, [0, 2, 0]);
  assert.equal(flipped.solved, false);
  assert.equal(flipped.spills.length, 0, 'a closed gate holds water back without spilling');
  assert.deepEqual(flipped.blocked, [1]);
  assert.equal(flipped.flowers[0].have, 0);
});

test('blue and gold meet through gates to make green, and stay apart upstream', () => {
  const p = garden(3, 3, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'gate', mask: W | S, inDir: 3 },
    4: { kind: 'pipe', mask: N | S | E },
    5: { kind: 'flower', mask: W, need: 'g' },
    6: { kind: 'spring', mask: E, color: 'y' },
    7: { kind: 'gate', mask: W | N, inDir: 3 },
  });
  const res = simulate(p, zeros(p));
  assert.equal(res.solved, true);
  assert.equal(res.wet[0], 1, 'the blue spring stays blue');
  assert.equal(res.wet[6 * 3], 2, 'the gold spring stays gold');
  assert.equal(res.wet[5 * 3], 3, 'the flower gets green');
});

test('a flower given the wrong colour does not count', () => {
  const p = garden(2, 1, {
    0: { kind: 'spring', mask: E, color: 'y' },
    1: { kind: 'flower', mask: W, need: 'b' },
  });
  const res = simulate(p, zeros(p));
  assert.equal(res.solved, false);
  assert.equal(res.flowers[0].ok, false);
});

test('streams wrap around the edges of a wrapping lake', () => {
  const p = garden(3, 1, {
    0: { kind: 'spring', mask: W, color: 'b' },
    2: { kind: 'flower', mask: E, need: 'b' },
  }, { wrap: true });
  assert.equal(simulate(p, zeros(p)).solved, true);
});
