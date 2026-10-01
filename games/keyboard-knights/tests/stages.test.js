import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, LESSONS, REGIONS, BESTIARY, MONSTERS, BOSSES, poolFor, makeDaily, stageById, STAGES_PER_REGION } from '../src/stages.js';

test('five regions of six stages, each ending in a boss', () => {
  assert.equal(REGIONS.length, 5);
  assert.equal(STAGES.length, REGIONS.length * STAGES_PER_REGION);
  REGIONS.forEach((r, i) => {
    const own = STAGES.filter((s) => s.region === i);
    assert.equal(own.length, 6);
    assert.equal(own[5].boss, r.boss);
    assert.ok(own.slice(0, 5).every((s) => !s.boss));
  });
  assert.equal(new Set(STAGES.map((s) => s.id)).size, STAGES.length);
});

test('every stage has enough words and only known monsters', () => {
  for (const s of [...STAGES, ...LESSONS]) {
    const pool = new Set(poolFor(s));
    assert.ok(pool.size >= Math.min(s.count, 2), `${s.id} has ${pool.size} words`);
    if (s.region > 0 && !s.lesson) assert.ok(pool.size >= 20, `${s.id} has only ${pool.size}`);
    assert.ok(s.monsters.length >= 3, s.id);
    for (const m of s.monsters) assert.ok(MONSTERS[m], m);
    if (s.boss) assert.ok(BOSSES[s.boss] && s.passages.length);
    assert.ok(stageById(s.id) === s);
  }
});

test('targets rise gently through the regions', () => {
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1];
    const b = STAGES[i];
    if (a.region === b.region && !a.boss && !b.boss) assert.ok(b.targetWpm >= a.targetWpm, b.id);
  }
});

test('lesson drills use only the keys taught so far', () => {
  for (const l of LESSONS) {
    if (!l.words.drill) continue;
    const allowed = new Set(l.keys);
    for (const w of poolFor(l)) assert.ok([...w].every((c) => allowed.has(c)), `${l.id}: ${w}`);
    for (const k of l.newKeys) assert.ok(poolFor(l).some((w) => w.includes(k)), `${l.id} practises ${k}`);
  }
  assert.equal(LESSONS.length, 12);
});

test('the daily quest is the same all day and changes the next day', () => {
  const a = makeDaily('2026-10-01', 2);
  const b = makeDaily('2026-10-01', 2);
  const c = makeDaily('2026-10-02', 2);
  assert.deepEqual(a, b);
  assert.notEqual(a.seed, c.seed);
  assert.equal(a.daily, true);
  assert.ok(a.boss && a.passages[0].length === 3);
  assert.equal(makeDaily('2026-10-01', 9).tier, 4);
});

test('the bestiary lists 15 monsters and 5 bosses with facts', () => {
  assert.equal(BESTIARY.length, 20);
  assert.equal(BESTIARY.filter((b) => b.boss).length, 5);
  for (const b of BESTIARY) assert.ok(b.name && b.fact.length > 10);
});
