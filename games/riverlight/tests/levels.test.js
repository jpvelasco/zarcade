import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COUNT, SEASONS, TWISTS, getLevel, seasonLevels, zenLevel } from '../src/levels.js';
import { generate } from '../src/generator.js';
import { simulate } from '../src/flow.js';
import { solve } from '../src/solver.js';
import { popcount } from '../src/topology.js';

const all = LEVELS.map((l) => getLevel(l.id));

test('there are 72 gardens in six seasons of twelve', () => {
  assert.equal(LEVEL_COUNT, 72);
  assert.equal(SEASONS.length, 6);
  SEASONS.forEach((_, s) => assert.equal(seasonLevels(s).length, 12));
  LEVELS.forEach((l, k) => assert.equal(l.id, k + 1));
  for (const l of LEVELS) if (l.twist) assert.ok(TWISTS[l.twist], `twist ${l.twist} has a card`);
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, LEVEL_COUNT, 'names are unique');
});

test('every garden has valid stones', () => {
  for (const level of all) {
    const { topo, tiles } = level.puzzle;
    const full = (1 << topo.n) - 1;
    const springs = tiles.filter((t) => t && t.kind === 'spring');
    const flowers = tiles.filter((t) => t && t.kind === 'flower');
    assert.ok(springs.length >= 1 && springs.length <= 2, `level ${level.id} springs`);
    assert.ok(flowers.length >= 1, `level ${level.id} flowers`);
    tiles.forEach((t, i) => {
      if (!t) return;
      assert.ok(topo.active[i], `level ${level.id}: stone ${i} is inside the garden`);
      assert.ok(t.mask > 0 && (t.mask & ~full) === 0, `level ${level.id}: mask`);
      if (t.kind === 'flower') assert.equal(popcount(t.mask), 1);
      if (t.kind === 'gate') {
        assert.equal(popcount(t.mask), 2);
        assert.ok(t.mask & (1 << t.inDir), 'gate entry is an open side');
      }
      if (t.kind === 'bridge') assert.ok(popcount(t.mask) >= 4);
      if (t.locked) assert.equal(level.puzzle.rots[i], 0, 'locked stones start solved');
    });
  }
});

test('every garden is complete in its intended orientation and scrambled at the start', () => {
  for (const level of all) {
    const p = level.puzzle;
    assert.equal(simulate(p, new Array(p.topo.count).fill(0)).solved, true, `level ${level.id} intended`);
    assert.equal(simulate(p, p.rots).solved, false, `level ${level.id} starts unsolved`);
    assert.ok(p.par >= 2, `level ${level.id} needs some turning`);
  }
});

test('the solver proves every garden solvable, and most are unique', () => {
  let unique = 0;
  for (const level of all) {
    const res = solve(level.puzzle, { cap: 2 });
    assert.ok(res.count >= 1, `level ${level.id} solvable`);
    assert.equal(simulate(level.puzzle, res.solutions[0]).solved, true);
    if (res.complete && res.count === 1) unique++;
  }
  assert.ok(unique >= LEVEL_COUNT * 0.9, `${unique} unique gardens`);
});

test('generation is deterministic', () => {
  for (const level of LEVELS) {
    const a = generate(level.spec);
    const b = generate(level.spec);
    assert.deepEqual(a.tiles, b.tiles, `level ${level.id}`);
    assert.deepEqual(a.rots, b.rots);
  }
});

test('each season shows off its twist', () => {
  const kinds = (s, pred) => seasonLevels(s).filter((l) => getLevel(l.id).puzzle.tiles.some((t) => t && pred(t))).length;
  assert.ok(kinds(0, (t) => t.kind === 'pipe' && popcount(t.mask) === 3) >= 6, 'spring meadow has splitters');
  assert.ok(kinds(1, (t) => t.kind === 'bridge') >= 10, 'summer pond has bridges');
  assert.ok(kinds(2, (t) => t.kind === 'gate') >= 10, 'autumn has gates');
  assert.ok(kinds(2, (t) => t.locked) >= 6, 'autumn has locks');
  assert.ok(kinds(3, (t) => t.group != null) >= 8, 'winter has twins');
  assert.ok(seasonLevels(3).filter((l) => l.spec.topo.wrap).length >= 6, 'winter wraps');
  assert.ok(kinds(4, (t) => t.kind === 'spring' && t.color === 'y') === 12, 'night has gold springs');
  assert.ok(kinds(4, (t) => t.kind === 'flower' && t.need === 'g') >= 7, 'night mixes green');
  assert.ok(seasonLevels(5).every((l) => getLevel(l.id).puzzle.topo.kind === 'hex'), 'lotus isles are hex');
});

test('gardens grow from small to large', () => {
  const size = (l) => getLevel(l.id).puzzle.tiles.filter(Boolean).length;
  assert.ok(size(LEVELS[0]) <= 5);
  for (let s = 0; s < SEASONS.length; s++) {
    const list = seasonLevels(s);
    assert.ok(size(list[0]) < size(list[10]), `season ${s} grows`);
  }
});

test('zen gardens are deterministic, solvable and never start solved', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const a = zenLevel(seed);
    const b = zenLevel(seed);
    assert.deepEqual(a.puzzle.tiles, b.puzzle.tiles);
    assert.equal(simulate(a.puzzle, a.puzzle.rots).solved, false);
    assert.ok(solve(a.puzzle, { cap: 1 }).count === 1);
  }
});
