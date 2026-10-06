import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY,
  defaultSave,
  loadSave,
  writeSave,
  recordClear,
  isUnlocked,
  totalStars,
  SKINS,
  isSkinUnlocked,
  rotateMissions,
  creditMission,
  missionsFromSave,
  isStampEarned,
} from '../src/progress.js';
import { LEVEL_COUNT } from '../src/levels.js';
import { mulberry32 } from '../src/math.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _map: m };
}

test('defaultSave starts fresh with sane values', () => {
  const s = defaultSave();
  assert.equal(s.unlocked, 0);
  assert.deepEqual(s.stars, {});
  assert.equal(s.best, 0);
  assert.equal(s.muted, false);
  assert.equal(s.music, true);
  assert.deepEqual(s.daily, {});
  assert.equal(s.skin, 0);
  assert.ok(Object.keys(s.stamps).length === 0);
});

test('loadSave returns defaults for empty/unavailable storage', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  const s = loadSave(memStorage());
  assert.equal(s.unlocked, 0);
});

test('loadSave sanitizes a damaged save field by field', () => {
  const storage = memStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({
    unlocked: 999, best: -5, muted: 'yes', music: false,
    stars: { 0: 2, '2': 'x', 99: 3 }, daily: { '2026-10-05': true, 'garbage': true },
    skin: 42, skins: { 0: true, 99: true },
  }));
  const s = loadSave(storage);
  assert.equal(s.unlocked, LEVEL_COUNT - 1, 'unlocked clamped');
  assert.equal(s.best, 0, 'negative best clamped to 0');
  assert.equal(s.muted, false, 'non-true muted -> false');
  assert.equal(s.music, false);
  assert.equal(s.stars[0], 2, 'valid star kept');
  assert.equal(s.stars[99], undefined, 'out-of-range star dropped');
  assert.ok(s.daily['2026-10-05'] === true);
  assert.ok(!('garbage' in s.daily));
  assert.equal(s.skin, 0, 'bad skin resets to 0');
  assert.ok(s.skins[0] === true);
});

test('loadSave survives a corrupt JSON string', () => {
  const storage = memStorage();
  storage.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadSave(storage), defaultSave());
});

test('writeSave reports success and failure', () => {
  const ok = memStorage();
  assert.equal(writeSave(ok, defaultSave()), true);
  const failing = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
  assert.equal(writeSave(failing, defaultSave()), false);
});

test('recordClear records stars, unlocks the next level, and sets a new best', () => {
  const save = defaultSave();
  const r = recordClear(save, 0, 3, 1500);
  assert.equal(r.newStars, true);
  assert.equal(save.stars[0], 3);
  assert.equal(r.unlockedNew, true);
  assert.equal(save.unlocked, 1);
  assert.equal(r.newBest, true);
  assert.equal(save.best, 1500);
  // A lower score does not lower the best.
  const r2 = recordClear(save, 1, 1, 900);
  assert.equal(r2.newBest, false);
  assert.equal(save.best, 1500);
  // A 3-star earns the par stamp.
  assert.ok(isStampEarned(save, `par-0`));
});

test('isUnlocked and totalStars track progress', () => {
  const save = defaultSave();
  recordClear(save, 0, 3, 100);
  recordClear(save, 1, 2, 50);
  assert.ok(isUnlocked(save, 2));
  assert.ok(!isUnlocked(save, 3));
  assert.equal(totalStars(save), 5);
});

test('skins unlock from progress rules and gate on the save', () => {
  const save = defaultSave();
  // Skin 0 always available.
  assert.ok(isSkinUnlocked(save, 0));
  assert.ok(!isSkinUnlocked(save, 1));
  // Clearing 3 levels unlocks "Rufus".
  for (let i = 0; i < 3; i++) recordClear(save, i, 1, 10 + i);
  assert.ok(isSkinUnlocked(save, 1), 'Rufus after 3 levels');
  // Skin list is intact and ordered.
  assert.equal(SKINS.length, 6);
  assert.equal(SKINS[0].id, 0);
});

test('missions rotate on a new day and credit progress', () => {
  const save = defaultSave();
  const day = '2026-10-05';
  const set = rotateMissions(save, day, mulberry32(1));
  assert.equal(set.length, 3);
  assert.equal(save.missions.day, day);
  assert.deepEqual(save.missions.set, set.map((g) => g.id));
  const active = missionsFromSave(save);
  assert.equal(active.length, 3);
  // Credit a delivery; a delivery mission (if present) advances.
  const hasDelivery = active.some((g) => g.kind === 'delivery');
  if (hasDelivery) {
    const completed = creditMission(save, 'delivery', 1, day);
    assert.ok(Array.isArray(completed));
  }
  // A different day resets the active set.
  rotateMissions(save, '2026-10-06', mulberry32(2));
  assert.equal(save.missions.day, '2026-10-06');
  assert.deepEqual(save.missions.done, {});
});

test('a world fully cleared earns its world stamp', () => {
  const save = defaultSave();
  for (let i = 0; i < 6; i++) recordClear(save, i, 1, 10 + i); // world 0
  assert.ok(isStampEarned(save, 'world-0'));
});
