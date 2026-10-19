import test from 'node:test';
import assert from 'node:assert/strict';
import { dateSeed, dateKey, dailyLevel, dailyPick, streakOf, recordDaily } from '../src/daily.js';
import { LEVELS, LEVELS_PER_WORLD } from '../src/levels.js';
import { replay } from '../src/solver.js';
import { allLetters } from '../src/sim.js';

test('dateSeed is stable for a given local date', () => {
  const d = new Date(2026, 9, 5); // Oct 5 2026
  const a = dateSeed(d);
  const b = dateSeed(new Date(2026, 9, 5));
  assert.equal(a, b);
  assert.ok(Number.isInteger(a) && a > 0);
  // A different day gives a different seed.
  assert.notEqual(dateSeed(new Date(2026, 9, 6)), a);
});

test('dateKey formats the local date as y-m-d', () => {
  assert.equal(dateKey(new Date(2026, 0, 1)), '2026-01-01');
  assert.equal(dateKey(new Date(2026, 9, 5)), '2026-10-05');
});

test('the daily level is deterministic for a date and solvable', () => {
  const d = new Date(2026, 9, 5);
  const a = dailyLevel(d);
  const b = dailyLevel(new Date(2026, 9, 5));
  assert.deepEqual(a.star, b.star);
  assert.deepEqual(a.blocks, b.blocks);
  assert.deepEqual(a.asteroids, b.asteroids);
  assert.equal(a.name, `Daily ${dateKey(d)}`);
  assert.ok(a.solved, 'the daily is solver-verified');
  assert.ok(a.par >= 1 && a.par <= 5, 'has a sensible par');
  assert.ok(Array.isArray(a.line) && a.line.length === a.par, 'line length == par');
  // A different date yields a different panel.
  const c = dailyLevel(new Date(2026, 9, 6));
  assert.ok(JSON.stringify([a.star, a.blocks]) !== JSON.stringify([c.star, c.blocks]) || a.par !== c.par, 'differ across days');
});

test("the daily is an authored route, mirrored, and its line still delivers", () => {
  for (let d = 0; d < 40; d++) {
    const date = new Date(2026, 9, 6 + d);
    const pick = dailyPick(date);
    assert.ok(pick.index >= LEVELS_PER_WORLD, 'never draws from the tutorial world');
    assert.ok(pick.index < LEVELS.length);
    const level = dailyLevel(date);
    assert.equal(level.par, LEVELS[pick.index].par, 'par comes from the authored route');
    const trace = replay(level, level.spawn, level.line);
    assert.ok(trace, `daily ${dateKey(date)}: the line delivers`);
    assert.equal(trace.length, level.par);
    assert.equal(trace.at(-1).letters, allLetters(level), 'with the full satchel');
  }
});

test('the daily moves around: dates spread over routes and mirrorings', () => {
  const combos = new Set();
  for (let d = 0; d < 60; d++) {
    const p = dailyPick(new Date(2026, 0, 1 + d));
    combos.add(`${p.index}:${p.flipX}:${p.flipY}`);
  }
  assert.ok(combos.size >= 45, `60 days give plenty of variety (${combos.size})`);
});

test('streak counts consecutive delivered days and tolerates a fresh today', () => {
  const base = new Date(2026, 9, 5);
  const key = (off) => dateKey(new Date(2026, 9, 5 - off));
  const daily = {};
  // 4 consecutive days ending yesterday.
  daily[key(1)] = true;
  daily[key(2)] = true;
  daily[key(3)] = true;
  daily[key(4)] = true;
  const r = streakOf(daily, base);
  assert.equal(r.streak, 4, 'counts back from yesterday');
  assert.equal(r.isToday, false, 'today not yet done');
  assert.equal(r.best, 4);
});

test('recording today extends the streak', () => {
  const base = new Date(2026, 9, 5);
  const key = (off) => dateKey(new Date(2026, 9, 5 - off));
  const save = { daily: {} };
  save.daily[key(1)] = true;
  save.daily[key(2)] = true;
  const { streak, first } = recordDaily(save, base);
  assert.equal(first, true, 'first record today');
  assert.equal(streak, 3, 'yesterday + day before + today');
  // Recording again is not "first".
  const again = recordDaily(save, base);
  assert.equal(again.first, false);
});

test('best streak is the longest run in history', () => {
  const key = (off) => dateKey(new Date(2026, 9, 5 - off));
  const daily = {};
  // A long run 5-8 days ago.
  for (let off = 5; off <= 8; off++) daily[key(off)] = true;
  // A short run ending yesterday.
  daily[key(1)] = true;
  daily[key(2)] = true;
  const r = streakOf(daily, new Date(2026, 9, 5));
  assert.equal(r.streak, 2, 'current streak');
  assert.equal(r.best, 4, 'best streak');
});
