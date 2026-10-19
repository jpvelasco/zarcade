import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSave, writeSave, freshSave, recordLevel, totalStars, isLevelOpen, recordDaily, currentStreak,
  dayBefore, claimSkins, worldsDone, SAVE_KEY,
} from '../src/save.js';
import { LEVELS } from '../src/levels.js';

function memory() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('saves round-trip under the namespaced key', () => {
  const store = memory();
  const save = freshSave();
  recordLevel(save, { id: 1, par: 3 }, 3);
  assert.ok(writeSave(store, save));
  assert.ok(SAVE_KEY in store.data);
  assert.equal(SAVE_KEY, 'tiny-trains.v1');
  assert.equal(loadSave(store).levels[1].stars, 3);
});

test('blocked or broken storage falls back to a fresh save', () => {
  assert.deepEqual(loadSave(null), freshSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), freshSave());
  assert.equal(writeSave(throwing, freshSave()), false);
  const junk = memory();
  junk.setItem(SAVE_KEY, '{nope');
  assert.deepEqual(loadSave(junk), freshSave());
});

test('broken level records are dropped instead of crashing the title', () => {
  const store = memory();
  store.setItem(SAVE_KEY, JSON.stringify({ v: 1, levels: { 1: null, 2: { stars: 2, best: 7 }, abc: { stars: 3, best: 3 }, 3: 'x' } }));
  const save = loadSave(store);
  assert.deepEqual(Object.keys(save.levels), ['2']);
  assert.equal(totalStars(save), 2);
  assert.equal(isLevelOpen(save, 5), true);
  assert.doesNotThrow(() => claimSkins(save, LEVELS));
});

test('recording a level keeps the best and announces improvements', () => {
  const save = freshSave();
  const lv = { id: 4, par: 8 };
  let r = recordLevel(save, lv, 12);
  assert.equal(r.first, true);
  assert.equal(r.stars, 1);
  r = recordLevel(save, lv, 9);
  assert.equal(r.newBest, true);
  assert.equal(r.moreStars, true);
  r = recordLevel(save, lv, 14);
  assert.equal(save.levels[4].best, 9);
  assert.equal(save.levels[4].stars, 2);
  assert.equal(recordLevel(save, lv, 7).underPar, true);
  assert.equal(totalStars(save), 3);
});

test('levels open three ahead of the furthest solved', () => {
  const save = freshSave();
  assert.ok(isLevelOpen(save, 3));
  assert.ok(!isLevelOpen(save, 4));
  recordLevel(save, { id: 5, par: 5 }, 5);
  assert.ok(isLevelOpen(save, 8));
});

test('daily streaks grow on consecutive days and restart gently', () => {
  const save = freshSave();
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
  recordDaily(save, '2026-10-01', 12);
  recordDaily(save, '2026-10-02', 10);
  const r = recordDaily(save, '2026-10-02', 9);
  assert.equal(r.newBest, true);
  assert.equal(save.daily.streak, 2);
  assert.equal(currentStreak(save, '2026-10-03'), 2);
  assert.equal(currentStreak(save, '2026-10-05'), 0);
  recordDaily(save, '2026-10-05', 9);
  assert.equal(save.daily.streak, 1);
  assert.equal(save.daily.bestStreak, 2);
  assert.equal(save.daily.solved, 3);
});

test('skins unlock once and are announced once', () => {
  const save = freshSave();
  for (const lv of LEVELS.filter((l) => l.world === 0)) recordLevel(save, lv, lv.par);
  assert.deepEqual(worldsDone(save, LEVELS), [0]);
  const fresh = claimSkins(save, LEVELS);
  assert.ok(fresh.includes('wooden'));
  assert.ok(fresh.includes('bullet'));
  assert.deepEqual(claimSkins(save, LEVELS), []);
});

test('the mute choice is saved, and damaged sound settings fall back to defaults', () => {
  const store = memory();
  const save = freshSave();
  assert.equal(save.muted, false);
  save.muted = true;
  save.music = false;
  writeSave(store, save);
  const back = loadSave(store);
  assert.equal(back.muted, true);
  assert.equal(back.music, false);
  store.setItem(SAVE_KEY, JSON.stringify({ ...freshSave(), muted: 'yes', sound: 0, music: null }));
  const fixed = loadSave(store);
  assert.equal(fixed.muted, false);
  assert.equal(fixed.sound, true);
  assert.equal(fixed.music, true);
});
