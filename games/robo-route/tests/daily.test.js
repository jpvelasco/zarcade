import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyLevel, dayKey, dayGap, generate, dailySeed } from '../src/daily.js';
import { parseLevel, program, programSize, runProgram, fits } from '../src/rules.js';

test('day keys use the local date and gaps count days', () => {
  assert.equal(dayKey(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  assert.equal(dayGap('2026-09-30', '2026-10-01'), 1);
  assert.equal(dayGap('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayGap('2026-10-01', '2026-10-01'), 0);
  assert.equal(dayGap('2026-10-01', '2026-10-08'), 7);
});

test('the same day gives the same circuit; different days differ', () => {
  const a = dailyLevel('2026-10-01');
  const b = dailyLevel('2026-10-01');
  assert.deepEqual(a, b);
  const c = dailyLevel('2026-10-02');
  assert.notDeepEqual(a.map, c.map);
  assert.notEqual(dailySeed('2026-10-01'), dailySeed('2026-10-02'));
});

test('a season of daily circuits are all solvable within limits and par', () => {
  const kinds = {};
  const start = new Date(2026, 9, 1);
  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const def = dailyLevel(dayKey(d));
    const lv = parseLevel(def);
    kinds[def.kind] = (kinds[def.kind] || 0) + 1;
    const prog = program(def.solution.main, def.solution.p1);
    assert.ok(fits(lv, prog).ok, `${dayKey(d)} fits ${fits(lv, prog).problems}`);
    assert.equal(runProgram(lv, prog).win, true, `${dayKey(d)} solvable`);
    assert.equal(programSize(prog), def.par, `${dayKey(d)} par is the reference size`);
    assert.ok(lv.w <= 7 && lv.h <= 7);
    assert.ok(lv.lamps.length + lv.batteries.length >= 2);
  }
  for (const k of ['loop', 'recursion', 'procedure', 'colours']) assert.ok(kinds[k] >= 10, `${k} appears (${kinds[k]})`);
});

test('generation is quick enough for a page load', () => {
  // CPU time, not wall time: a busy machine (parallel test runs, a browser)
  // stretches the wall clock several-fold and made this flake at ~6.5 s.
  // Twenty generations normally cost about 1 s of CPU.
  const t = process.cpuUsage();
  for (let s = 1; s <= 20; s++) generate(s * 104729);
  const used = process.cpuUsage(t);
  const ms = (used.user + used.system) / 1000;
  assert.ok(ms < 6000, `20 generations took ${Math.round(ms)} ms of CPU`);
});
