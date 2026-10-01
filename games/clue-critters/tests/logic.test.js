import test from 'node:test';
import assert from 'node:assert/strict';
import {
  holds, permutations, countSolutions, solutions, deduce, emptyGrid, autoFill, wrongMarks,
  gridComplete, nextHint, applyFacts, cycleCell, BLANK, NO, YES,
} from '../src/logic.js';

const world = { place: [0, 1, 2], thing: [2, 0, 1] };

test('permutations lists every ordering once', () => {
  assert.equal(permutations(3).length, 6);
  assert.equal(permutations(5).length, 120);
  assert.equal(new Set(permutations(4).map(String)).size, 24);
});

test('each clue type holds in the world it describes', () => {
  const { place, thing } = world;
  assert.ok(holds({ t: 'at', s: 1, p: 1 }, place, thing));
  assert.ok(!holds({ t: 'at', s: 1, p: 2 }, place, thing));
  assert.ok(holds({ t: 'notAt', s: 1, p: 2 }, place, thing));
  assert.ok(holds({ t: 'atEither', s: 2, p: 0, q: 2 }, place, thing));
  assert.ok(holds({ t: 'whoAt', p: 2, s: 0, r: 2 }, place, thing));
  assert.ok(!holds({ t: 'whoAt', p: 2, s: 0, r: 1 }, place, thing));
  assert.ok(holds({ t: 'has', s: 0, k: 2 }, place, thing));
  assert.ok(holds({ t: 'notHas', s: 0, k: 1 }, place, thing));
  assert.ok(holds({ t: 'hasEither', s: 1, k: 1, j: 0 }, place, thing));
  assert.ok(holds({ t: 'whoHas', k: 1, s: 0, r: 2 }, place, thing));
  assert.ok(holds({ t: 'link', k: 2, p: 0 }, place, thing));
  assert.ok(!holds({ t: 'link', k: 2, p: 1 }, place, thing));
  assert.ok(holds({ t: 'notLink', k: 2, p: 1 }, place, thing));
  assert.throws(() => holds({ t: 'nope' }, place, thing));
});

test('brute force counts worlds', () => {
  assert.equal(countSolutions(3, []), 36);
  assert.equal(countSolutions(3, [{ t: 'at', s: 0, p: 0 }]), 12);
  const clues = [{ t: 'at', s: 0, p: 0 }, { t: 'at', s: 1, p: 1 }, { t: 'has', s: 0, k: 2 }, { t: 'link', k: 0, p: 1 }];
  assert.deepEqual(solutions(3, clues), [world]);
});

test('the solver finishes a simple grid and its steps are sound', () => {
  const clues = [{ t: 'at', s: 0, p: 0 }, { t: 'at', s: 1, p: 1 }, { t: 'has', s: 0, k: 2 }, { t: 'link', k: 0, p: 1 }];
  const r = deduce(3, clues);
  assert.ok(r.solved);
  assert.deepEqual(r.world, world);
  for (const step of r.steps) {
    for (const f of step.facts) {
      const truth = world[f.cat][f.s] === f.v;
      assert.equal(f.mark === 'yes', truth, `${step.rule} says ${JSON.stringify(f)}`);
    }
  }
  assert.equal(r.steps[0].rule, 'clue');
});

test('the solver reasons through either/or and not clues', () => {
  const clues = [
    { t: 'whoAt', p: 2, s: 0, r: 2 },
    { t: 'notAt', s: 0, p: 2 },
    { t: 'atEither', s: 1, p: 1, q: 2 },
    { t: 'notHas', s: 0, k: 0 }, { t: 'notHas', s: 0, k: 1 },
    { t: 'notLink', k: 1, p: 1 },
  ];
  const r = deduce(3, clues);
  assert.ok(r.solved);
  assert.deepEqual(r.world, world);
  assert.ok(r.steps.some((s) => s.rule === 'notLinkPlace'));
});

test('the solver stops when clues are not enough', () => {
  const r = deduce(3, [{ t: 'at', s: 0, p: 0 }]);
  assert.equal(r.solved, false);
  assert.equal(r.broken, false);
});

test('the solver notices impossible clues', () => {
  const r = deduce(3, [{ t: 'at', s: 0, p: 0 }, { t: 'notAt', s: 0, p: 0 }]);
  assert.ok(r.broken);
});

test('cells cycle blank, no, yes', () => {
  assert.equal(cycleCell(BLANK), NO);
  assert.equal(cycleCell(NO), YES);
  assert.equal(cycleCell(YES), BLANK);
});

test('helpers cross out rows and columns, then fill the last blank', () => {
  const g = emptyGrid(3);
  g.place[0][0] = YES;
  const changed = autoFill(g, 3, 1);
  assert.deepEqual(g.place[0], [YES, NO, NO]);
  assert.deepEqual(g.place.map((r) => r[0]), [YES, NO, NO]);
  assert.equal(changed.length, 4);
  assert.equal(autoFill(emptyGrid(3), 3, 0).length, 0);
  g.place[1][1] = YES;
  autoFill(g, 3, 2);
  assert.deepEqual(g.place[2], [NO, NO, YES]);
});

test('wrong marks and completion follow the answer', () => {
  const g = emptyGrid(3);
  g.place[0][1] = YES;
  assert.deepEqual(wrongMarks(g, 3, world), [{ s: 0, cat: 'place', v: 1 }]);
  g.place[0][1] = BLANK;
  for (let s = 0; s < 3; s++) { g.place[s][world.place[s]] = YES; g.thing[s][world.thing[s]] = YES; }
  assert.ok(gridComplete(g, 3, world));
});

test('hints point at wrong marks first, then the next step, then more clues', () => {
  const clues = [{ t: 'at', s: 0, p: 0 }, { t: 'at', s: 1, p: 1 }, { t: 'has', s: 0, k: 2 }, { t: 'link', k: 0, p: 1 }];
  const g = emptyGrid(3);
  g.thing[0][0] = YES;
  assert.equal(nextHint(g, 3, world, clues).kind, 'wrong');
  g.thing[0][0] = BLANK;
  let h = nextHint(g, 3, world, clues);
  assert.equal(h.kind, 'step');
  let guard = 0;
  while (h.kind === 'step' && guard++ < 100) {
    applyFacts(g, h.missing);
    h = nextHint(g, 3, world, clues);
  }
  assert.equal(h.kind, 'done');
  assert.equal(nextHint(emptyGrid(3), 3, world, clues.slice(0, 1)).kind, 'step');
  const g2 = emptyGrid(3);
  applyFacts(g2, deduce(3, clues.slice(0, 1)).steps.flatMap((s) => s.facts));
  assert.equal(nextHint(g2, 3, world, clues.slice(0, 1)).kind, 'more');
});
