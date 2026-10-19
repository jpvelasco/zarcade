import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS, LEVELS } from '../src/levels.js';
import { parseLevel, program, programSize, runProgram, fits, features, cellAt, ALL_OPS, MAX_SIZE } from '../src/rules.js';
import { bfsMin, bruteForce } from '../src/solver.js';

const ref = (def) => program(def.solution.main, def.solution.p1 || '');

test('48 levels in five worlds with unique ids and names', () => {
  assert.equal(WORLDS.length, 5);
  assert.ok(LEVELS.length >= 45);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, LEVELS.length);
  for (const w of WORLDS) assert.ok(w.levels.length >= 9, w.name);
});

test('every board is well formed', () => {
  for (const def of LEVELS) {
    const lv = parseLevel(def);
    assert.ok(lv.w <= MAX_SIZE && lv.h <= MAX_SIZE, `${def.id} fits 8x8`);
    assert.ok(cellAt(lv, lv.start.x, lv.start.y), `${def.id} Bolt starts on a block`);
    assert.ok(lv.lamps.length + lv.batteries.length > 0, `${def.id} has something to do`);
    assert.ok(lv.start.d >= 0, `${def.id} facing`);
    for (const ch of lv.ops) assert.ok(ALL_OPS.includes(ch), `${def.id} op ${ch}`);
    assert.ok(def.par >= 1 && def.par <= lv.limits.main + lv.limits.p1, `${def.id} par within limits`);
    if (lv.ops.includes('1')) assert.ok(lv.limits.p1 > 0, `${def.id} has room in P1`);
  }
});

test('every reference solution wins within its limits and par', () => {
  for (const def of LEVELS) {
    const lv = parseLevel(def);
    const prog = ref(def);
    const f = fits(lv, prog);
    assert.ok(f.ok, `${def.id} fits: ${f.problems}`);
    const r = runProgram(lv, prog);
    assert.equal(r.result, 'win', `${def.id} reference solves it`);
    assert.ok(programSize(prog) <= def.par, `${def.id} reference ${programSize(prog)} <= par ${def.par}`);
  }
});

test('each world teaches its idea', () => {
  const uses = { 2: 'repeat', 3: 'call', 4: 'colour' };
  for (const def of LEVELS) {
    const f = features(ref(def));
    if (def.world === 1) assert.ok(!f.repeat && !f.call && !f.colour, def.id);
    if (uses[def.world]) assert.ok(f[uses[def.world]], `${def.id} uses ${uses[def.world]}`);
  }
  assert.ok(LEVELS.filter((l) => l.world === 3).some((l) => features(ref(l)).recursion), 'recursion appears in Gear Works');
  const w5 = LEVELS.filter((l) => l.world === 5).map((l) => features(ref(l)));
  assert.ok(w5.filter((f) => [f.repeat, f.call, f.colour].filter(Boolean).length >= 2).length >= 5, 'Star Circuit mixes ideas');
});

test('Tinker Yard pars are the true minimum (breadth-first search)', () => {
  for (const def of LEVELS.filter((l) => l.world === 1)) {
    const best = bfsMin(parseLevel(def));
    assert.ok(best, def.id);
    assert.equal(best.length, def.par, `${def.id} BFS ${best.path.join(' ')}`);
  }
});

test('Loop Lagoon pars cannot be beaten (brute force over every smaller program)', () => {
  for (const def of LEVELS.filter((l) => l.world === 2)) {
    const r = bruteForce(parseLevel(def), { maxSize: def.par - 1, maxCount: 9, budget: 5e6 });
    assert.equal(r.exhausted, false, `${def.id} search finished`);
    assert.equal(r.size, null, `${def.id} has nothing smaller than par`);
  }
});

test('later pars have no small shortcut without colours', () => {
  for (const def of LEVELS.filter((l) => l.world >= 3)) {
    const r = bruteForce(parseLevel(def), { maxSize: Math.min(def.par - 1, 4), maxCount: 7, budget: 2e6 });
    assert.equal(r.size, null, `${def.id} beaten by ${r.main?.map((t) => t.op)} / ${r.p1?.map((t) => t.op)}`);
  }
});

test('the first level using a new tile introduces it', () => {
  const seen = new Set();
  for (const def of LEVELS) {
    for (const ch of def.ops) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      assert.ok(def.teach && def.teach.includes(ch), `${def.id} introduces ${ch}`);
    }
  }
});
