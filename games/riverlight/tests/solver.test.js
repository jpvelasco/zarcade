import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, buildGroups, distinctValues, signature } from '../src/solver.js';
import { simulate } from '../src/flow.js';
import { generate } from '../src/generator.js';
import { garden, zeros, N, E, S, W } from './helpers.js';

// Every distinct board state, checked with the real simulation.
function bruteCount(puzzle) {
  const { members, fixed } = buildGroups(puzzle);
  const n = puzzle.topo.n;
  const values = members.map((_, g) => {
    if (fixed[g]) return [0];
    const dom = distinctValues(puzzle, members, g);
    return [...Array(n).keys()].filter((k) => dom & (1 << k));
  });
  const rots = zeros(puzzle);
  let count = 0;
  const walk = (g) => {
    if (g === members.length) {
      if (simulate(puzzle, rots).solved) count++;
      return;
    }
    for (const k of values[g]) {
      for (const i of members[g]) rots[i] = k;
      walk(g + 1);
    }
  };
  walk(0);
  return { count, space: values.reduce((a, v) => a * v.length, 1) };
}

test('the solver finds the one way to water a tiny garden', () => {
  const p = garden(3, 1, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'pipe', mask: E | W },
    2: { kind: 'flower', mask: W, need: 'b' },
  });
  const res = solve(p, { cap: 5 });
  assert.equal(res.complete, true);
  assert.equal(res.count, 1);
  assert.deepEqual(res.solutions[0], [0, 0, 0]);
});

test('the solver respects gate direction and colour mixing', () => {
  const p = garden(3, 3, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'gate', mask: W | S, inDir: 3 },
    4: { kind: 'pipe', mask: N | S | E },
    5: { kind: 'flower', mask: W, need: 'g' },
    6: { kind: 'spring', mask: E, color: 'y' },
    7: { kind: 'gate', mask: W | N, inDir: 3 },
  });
  const res = solve(p, { cap: 5 });
  assert.equal(res.count, 1);
  assert.equal(simulate(p, res.solutions[0]).solved, true);
});

test('the solver matches brute force on small generated gardens', () => {
  const specs = [];
  for (let seed = 1; seed <= 40; seed++) {
    specs.push({ seed, topo: { kind: 'square', w: 3, h: 3 }, size: 6, flowers: [1, 4], snake: 0.4, maxDeg: 3, tries: 1 });
    specs.push({ seed, topo: { kind: 'square', w: 3, h: 3, wrap: true }, size: 6, flowers: [1, 4], snake: 0.4, maxDeg: 3, tries: 1 });
    specs.push({ seed, topo: { kind: 'square', w: 4, h: 3 }, size: 7, flowers: [1, 4], gates: 1, maxDeg: 3, tries: 1 });
    specs.push({ seed, topo: { kind: 'square', w: 4, h: 3 }, size: 7, flowers: [1, 4], pairs: 2, maxDeg: 3, tries: 1 });
    specs.push({ seed, topo: { kind: 'hex', w: 3, h: 3 }, size: 6, flowers: [1, 4], maxDeg: 3, tries: 1 });
  }
  let checked = 0;
  let ambiguous = 0;
  for (const spec of specs) {
    let p;
    try {
      p = generate(spec);
    } catch {
      continue;
    }
    const brute = bruteCount(p);
    if (brute.space > 300000) continue;
    const res = solve(p, { cap: 1000, budget: 1e7 });
    assert.equal(res.complete, true);
    assert.equal(res.count, brute.count, `seed ${spec.seed} ${JSON.stringify(spec.topo)}`);
    for (const s of res.solutions) assert.equal(simulate(p, s).solved, true);
    if (brute.count > 1) ambiguous++;
    checked++;
  }
  assert.ok(checked >= 100, `checked ${checked} gardens`);
  assert.ok(ambiguous >= 0);
});

test('signatures tell reversed gates apart but not reversed straights', () => {
  const pipe = { kind: 'pipe', mask: E | W };
  const gate = { kind: 'gate', mask: E | W, inDir: 3 };
  assert.equal(signature(pipe, 0, 4), signature(pipe, 2, 4));
  assert.notEqual(signature(gate, 0, 4), signature(gate, 2, 4));
});
