import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, WORLDS, LEVEL_COUNT, worldLevels } from '../src/levels.js';
import { parseLevel } from '../src/board.js';
import { solve } from '../src/solver.js';
import { simulate, piecesUsed } from '../src/sim.js';

test('there are 40+ levels across every world, eight each', () => {
  assert.ok(LEVEL_COUNT >= 40);
  WORLDS.forEach((w, i) => assert.equal(worldLevels(i).length, 8, w.name));
  assert.deepEqual(LEVELS.map((l) => l.id), LEVELS.map((_, i) => i + 1));
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, LEVEL_COUNT);
});

test('level data is well formed and fits a phone', () => {
  for (const lv of LEVELS) {
    const b = parseLevel(lv);
    assert.deepEqual(b.errors, [], `#${lv.id} ${lv.name}`);
    assert.ok(b.w <= 8 && b.h <= 8, `#${lv.id} is ${b.w}x${b.h}`);
    assert.ok(b.trains.length >= 1);
    assert.ok(Number.isInteger(lv.par) && lv.par >= 1, `#${lv.id} par`);
    const stations = b.cells.filter((c) => c.k === 'station');
    assert.ok(stations.length >= 1);
    const departs = new Set();
    for (const t of b.trains) {
      const key = `${t.depot}:${t.depart}`;
      assert.ok(!departs.has(key), `#${lv.id} two trains leave one depot at once`);
      departs.add(key);
    }
  }
});

test('every level is solvable within its par, and the solution really wins', () => {
  for (const lv of LEVELS) {
    const b = parseLevel(lv);
    const s = solve(b, { startBound: lv.par, maxCost: lv.par, nodeLimit: 400000 });
    assert.ok(s.solved, `#${lv.id} ${lv.name} not solved within par ${lv.par} (${s.reason})`);
    const run = simulate(b, s.layout);
    assert.equal(run.outcome, 'win', `#${lv.id} ${lv.name}`);
    assert.ok(piecesUsed(b, s.layout) <= lv.par);
    // Stock limits are respected.
    const count = (t) => [...s.layout.values()].filter((p) => p.t === t).length;
    assert.ok(count('X') <= b.stock.X && count('W') <= b.stock.W, `#${lv.id} stock`);
  }
});

test('par is the true minimum on the quick levels', () => {
  let checked = 0;
  for (const lv of LEVELS) {
    const s = solve(parseLevel(lv), { nodeLimit: 20000 });
    if (!s.solved) continue;
    assert.equal(s.par, lv.par, `#${lv.id} ${lv.name}`);
    checked++;
  }
  assert.ok(checked >= 30, `only ${checked} levels checked`);
});

test('each world introduces its mechanic', () => {
  const uses = (wi, pred) => worldLevels(wi).some((lv) => pred(parseLevel(lv)));
  assert.ok(uses(1, (b) => b.stock.X > 0));
  assert.ok(uses(2, (b) => b.stock.W > 0));
  assert.ok(uses(3, (b) => b.cells.some((c) => c.k === 'portal')));
  assert.ok(uses(4, (b) => b.cells.some((c) => c.k === 'paint')));
  // World one needs nothing but straights and curves.
  for (const lv of worldLevels(0)) {
    const b = parseLevel(lv);
    assert.equal(b.stock.X + b.stock.W, 0);
  }
});
