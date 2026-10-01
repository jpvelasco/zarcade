import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, checkUnlocks, defaultProfile, liveStreak, loadProfile, noteBossDefeated, noteDailyStart, normalize, recordRun, saveProfile,
} from '../src/progress.js';
import { newRun, endRun } from '../src/run.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('profiles save and load, and survive broken or blocked storage', () => {
  const s = memoryStorage();
  const p = defaultProfile();
  p.best = 321;
  assert.ok(saveProfile(s, p));
  assert.equal(loadProfile(s).best, 321);
  assert.ok(s.data.has(SAVE_KEY));
  s.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadProfile(s), defaultProfile());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadProfile(throwing), defaultProfile());
  assert.equal(saveProfile(throwing, p), false);
  assert.equal(saveProfile(null, p), false);
});

test('normalize fills in missing fields and drops finished runs', () => {
  const p = normalize({ v: 1, best: 5, album: { cards: ['scribble'] }, current: { v: 1, phase: 'over' } });
  assert.equal(p.best, 5);
  assert.deepEqual(p.album.monsters, []);
  assert.equal(p.current, null);
  assert.ok(p.unlocked.includes('kid'));
});

test('heroes unlock generously', () => {
  const p = defaultProfile();
  assert.deepEqual(checkUnlocks(p), []);
  p.runs = 1;
  assert.deepEqual(checkUnlocks(p), ['knight']);
  assert.deepEqual(noteBossDefeated(p), ['wizard']);
  assert.deepEqual(noteBossDefeated(p), ['ninja']);
  const q = defaultProfile();
  q.wins = 1;
  q.runs = 1;
  q.bosses = 1;
  assert.deepEqual(checkUnlocks(q), ['knight', 'wizard', 'ninja']);
});

test('the daily streak counts days in a row and resets gently', () => {
  const p = defaultProfile();
  assert.equal(noteDailyStart(p, '2026-10-01'), 1);
  assert.equal(noteDailyStart(p, '2026-10-01'), 1, 'same day counts once');
  assert.equal(noteDailyStart(p, '2026-10-02'), 2);
  assert.equal(liveStreak(p, '2026-10-03'), 2, 'still alive the next day');
  assert.equal(liveStreak(p, '2026-10-05'), 0);
  assert.equal(noteDailyStart(p, '2026-10-05'), 1);
  assert.equal(p.daily.bestStreak, 2);
});

test('recording a run updates bests, album, unlocks and history', () => {
  const p = defaultProfile();
  const run = newRun({ seed: 1, hero: 'kid', daily: true, dateKey: '2026-10-01' });
  run.met.push('blob');
  run.stats.battles = 3;
  endRun(run, 'lost');
  const c = recordRun(p, run, { minutes: 12, date: '2026-10-01' });
  assert.equal(c.newBest, true);
  assert.equal(c.newDailyBest, true);
  assert.deepEqual(c.unlocks, ['knight']);
  assert.ok(c.album.monsters.includes('blob'));
  assert.ok(p.album.cards.includes('scribble'));
  assert.equal(p.history[0].minutes, 12);
  assert.equal(p.history[0].daily, true);
  for (let i = 0; i < 30; i++) recordRun(p, run, { minutes: 1 });
  assert.equal(p.history.length, 20);
  assert.equal(recordRun(p, run).newBest, false);
});
