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
  starsFor,
  scoreFor,
  lettersIn,
  lettersGot,
  totalLetters,
  letterTotal,
  fullSatchels,
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

test('a skin unlock is reported as a skin, not as a postmark', () => {
  const save = defaultSave();
  recordClear(save, 0, 1, 10);
  recordClear(save, 1, 1, 11);
  const r = recordClear(save, 2, 1, 12); // the third clear unlocks Rufus
  assert.equal(r.skin, 1, 'Rufus is the reported unlock');
  assert.equal(r.stamp, null, 'no postmark was earned');
  assert.deepEqual(save.stamps, {});
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

test('stars: one for delivering, one for par, one for the whole satchel', () => {
  // A perfect round: inside par with every letter.
  assert.equal(starsFor(3, 3, 2, 2), 3);
  assert.equal(starsFor(2, 3, 2, 2), 3, 'under par still counts');
  // A lucky dash to the star that leaves mail behind is not perfect.
  assert.equal(starsFor(1, 4, 0, 3), 2, 'inside par, no letters');
  // The whole satchel but too many launches.
  assert.equal(starsFor(6, 3, 3, 3), 2, 'all letters, over par');
  // Neither: still a delivery, still a star, nothing is ever a fail.
  assert.equal(starsFor(9, 3, 1, 3), 1);
  // A level with no letters cannot be punished for them.
  assert.equal(starsFor(2, 2, 0, 0), 3);
  // Score never goes negative however long the round ran.
  assert.ok(scoreFor(40, 2, 0) >= 0);
  assert.ok(scoreFor(2, 3, 3) > scoreFor(2, 3, 0), 'letters are worth points');
});

test('letters are recorded per route, clamped, and never go backwards', () => {
  const save = defaultSave();
  const idx = 10;
  const total = lettersIn(idx);
  assert.ok(total >= 1, 'the route carries letters');
  recordClear(save, idx, 2, 100, 1);
  assert.equal(lettersGot(save, idx), 1);
  // A worse round does not erase the better one.
  recordClear(save, idx, 1, 50, 0);
  assert.equal(lettersGot(save, idx), 1, 'best letters kept');
  recordClear(save, idx, 3, 300, total);
  assert.equal(lettersGot(save, idx), total);
  assert.equal(fullSatchels(save), 1);
  // A nonsense count is clamped to what the route actually carries.
  recordClear(save, idx, 3, 300, 99);
  assert.equal(lettersGot(save, idx), total, 'clamped to the route');
  assert.ok(totalLetters(save) === total);
  assert.ok(letterTotal() >= 30, 'the whole game has a letter count');
});

test('a damaged letter count loads as something sane', () => {
  const storage = memStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ letters: { 0: 99, 1: -4, 2: 1.5, 99: 2, bad: 3 } }));
  const s = loadSave(storage);
  assert.equal(s.letters[0], lettersIn(0), 'too many is clamped to the route');
  assert.equal(s.letters[1], undefined, 'negative dropped');
  assert.equal(s.letters[2], undefined, 'fractional dropped');
  assert.equal(s.letters[99], undefined, 'out of range dropped');
  assert.equal(s.letters.bad, undefined);
});

test('posting every letter in a world earns its letter stamp', () => {
  const save = defaultSave();
  for (let i = 0; i < 6; i++) recordClear(save, i, 3, 100, lettersIn(i));
  assert.ok(isStampEarned(save, 'letters-0'), 'world 1 fully posted');
  assert.ok(isStampEarned(save, 'world-0'), 'and cleared');
  assert.ok(!isStampEarned(save, 'letters-1'), 'world 2 is not');
});
