import test from 'node:test';
import assert from 'node:assert/strict';
import { newSave, normalize, loadSave, writeSave, encodeDiff, applyDiff, recordDaily, currentStreak, shiftDate, dailyReward } from '../src/progress.js';
import { Session, dailyConfig } from '../src/game.js';
import { SAVE_KEY, T } from '../src/data.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('saves round-trip under the namespaced key', () => {
  const st = memoryStorage();
  const s = newSave();
  s.coins = 321; s.upgrades.drill = 2; s.museum.fern = 1;
  assert.ok(writeSave(st, s));
  assert.ok(st.map.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'mole-miner.v1');
  const back = loadSave(st);
  assert.equal(back.coins, 321);
  assert.equal(back.upgrades.drill, 2);
  assert.equal(back.museum.fern, 1);
});

test('broken or blocked storage never throws', () => {
  assert.equal(loadSave(null).coins, 0);
  assert.equal(writeSave(null, newSave()), false);
  const bad = { getItem: () => '{nope', setItem: () => { throw new Error('full'); } };
  assert.equal(loadSave(bad).coins, 0);
  assert.equal(writeSave(bad, newSave()), false);
  const s = normalize({ v: 1, coins: -5, upgrades: { drill: 'x' }, paints: ['clover'], paint: 'nope' });
  assert.equal(s.coins, 0);
  assert.equal(s.upgrades.drill, 0);
  assert.ok(s.paints.includes('sunflower') && s.paints.includes('clover'));
  assert.equal(s.paint, 'sunflower');
});

test('the dug mine is stored as a compact diff and restored', () => {
  const a = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1]);
  const b = a.slice();
  b[2] = 0; b[7] = 5;
  const diff = encodeDiff(a, b);
  const c = a.slice();
  applyDiff(c, diff);
  assert.deepEqual(c, b);
  assert.equal(encodeDiff(a, a), '');
});

test('a session saves its mine and pod and picks up where it left off', () => {
  const save = newSave('meadow-1');
  const s = new Session(save);
  const m = s.mine;
  m.setTile(12, 0, T.EMPTY);
  m.setTile(12, 1, T.EMPTY);
  s.pod.cargo = [3];
  s.pod.x = 12.5; s.pod.y = 1.6;
  s.store();
  const json = JSON.parse(JSON.stringify(save));
  const s2 = new Session(normalize(json));
  assert.equal(s2.mine.tile(12, 0), T.EMPTY);
  assert.equal(s2.mine.tile(12, 1), T.EMPTY);
  assert.deepEqual(s2.pod.cargo, [3]);
  assert.equal(s2.pod.x, 12.5);
  assert.ok(save.diff.length < 40);
});

test('daily digs are the same all day and differ between days', () => {
  const a = dailyConfig('2026-10-01'), b = dailyConfig('2026-10-01'), c = dailyConfig('2026-10-02');
  assert.deepEqual(a, b);
  assert.notEqual(a.seed, c.seed);
  const types = new Set();
  for (let d = 1; d <= 28; d++) types.add(dailyConfig(`2026-02-${String(d).padStart(2, '0')}`).goal.type);
  assert.deepEqual([...types].sort(), ['acorn', 'depth', 'haul']);
});

test('the daily streak grows on consecutive days and restarts gently', () => {
  const s = newSave();
  assert.equal(recordDaily(s, '2026-10-01', { success: true, score: 100 }).streak, 1);
  assert.equal(recordDaily(s, '2026-10-01', { success: true, score: 300 }).firstClear, false, 'one clear per day');
  assert.equal(s.daily.results['2026-10-01'].best, 300);
  assert.equal(recordDaily(s, '2026-10-02', { success: true, score: 50 }).streak, 2);
  assert.equal(recordDaily(s, '2026-10-03', { success: false, score: 10 }).streak, 2, 'a miss does not break it');
  assert.equal(currentStreak(s, '2026-10-03'), 2);
  assert.equal(currentStreak(s, '2026-10-05'), 0, 'a skipped day lapses');
  assert.equal(recordDaily(s, '2026-10-05', { success: true, score: 50 }).streak, 1);
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.ok(dailyReward(8) > dailyReward(1));
});
