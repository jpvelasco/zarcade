import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, MAX_GALLERY, defaultSave, sanitise, loadSave, writeSave, unlockedElements, brushUnlocked, skyUnlocked,
  rainbowUnlocked, unlockGoal, recordGoal, goalsDone, recordFound, recordDaily, liveStreak, dailyDone,
  addToGallery, removeFromGallery, mergeSave, cleanScene,
} from '../src/progress.js';
import { World } from '../src/world.js';
import { buildScene } from '../src/scenes.js';
import { encodeWorld } from '../src/codec.js';
import { BASE_ELEMENTS } from '../src/elements.js';

function memory(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

function scene(seed = 1) {
  const w = new World(60, 40, seed);
  buildScene(w, 'meadow', seed);
  return { ...encodeWorld(w), at: 1000 + seed };
}

test('a fresh save has sensible defaults', () => {
  const s = defaultSave();
  assert.equal(s.muted, false);
  assert.deepEqual(s.goals, {});
  assert.equal(s.sky, 'meadow');
  assert.deepEqual([...unlockedElements(s)].sort(), [...BASE_ELEMENTS].sort());
  assert.equal(brushUnlocked(s, 'round'), true);
  assert.equal(brushUnlocked(s, 'spray'), false);
  assert.equal(skyUnlocked(s, 'aurora'), false);
});

test('each damaged field falls back alone; the rest of the save survives', () => {
  const good = scene(2);
  const raw = {
    muted: 'yes',
    goals: { sprout: true, waterfall: 'true', nope: true },
    found: ['sand', 'unicorn', 'water', 'sand'],
    daily: { streak: NaN, best: 5, lastKey: 99999999 },
    gallery: [
      { id: 'g1', name: '<b>My pond</b>', ...good },
      { id: 'g1', name: 'dupe', ...good },
      { id: 'BAD ID', name: 'x', ...good },
      { id: 'g2', name: 'broken', w: 60, h: 40, data: 'not!valid', at: 1 },
      null,
      { id: 'g3', name: 7, ...scene(3) },
    ],
    garden: { w: 60, h: 40, data: '###' },
    sky: 'plaid',
    rainbow: 1,
    brush: { size: 99, shape: 'triangle', element: 'lava' },
  };
  const s = sanitise(raw);
  assert.equal(s.muted, false);
  assert.deepEqual(s.goals, { sprout: true });
  assert.deepEqual(s.found, ['sand', 'water']);
  assert.deepEqual(s.daily, { streak: 0, best: 5, lastKey: 0 });
  assert.deepEqual(s.gallery.map((e) => [e.id, e.name]), [['g1', 'bMy pond/b'], ['g3', 'Garden']]);
  assert.equal(s.garden, null);
  assert.equal(s.sky, 'meadow');
  assert.equal(s.rainbow, false);
  assert.deepEqual(s.brush, { size: 5, shape: 'round', element: 'lava' });
});

test('load survives blocked, empty and corrupt storage', () => {
  const blocked = { getItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSave(blocked), defaultSave());
  assert.deepEqual(loadSave(memory()), defaultSave());
  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '{oops' })), defaultSave());
  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '42' })), defaultSave());
  assert.equal(writeSave({ setItem() { throw new Error('full'); } }, defaultSave()), false);
  assert.equal(writeSave(null, defaultSave()), false);
});

test('a save round-trips through storage', () => {
  const store = memory();
  const s = defaultSave();
  recordGoal(s, 'sprout');
  recordFound(s, 'steam');
  s.garden = scene(4);
  addToGallery(s, { id: 'abc', name: 'Hello', ...scene(5) });
  assert.equal(writeSave(store, s), true);
  assert.deepEqual(loadSave(store), s);
});

test('goals unlock elements, brushes, skies and rainbow flowers', () => {
  const s = defaultSave();
  assert.equal(recordGoal(s, 'waterfall'), true);
  assert.equal(recordGoal(s, 'waterfall'), false, 'only once');
  assert.equal(recordGoal(s, 'made-up'), false);
  assert.ok(unlockedElements(s).has('acorn'));
  assert.ok(!unlockedElements(s).has('fish'));
  assert.ok(unlockedElements(s, ['fish']).has('fish'), 'a goal can lend an element');
  recordGoal(s, 'sprout');
  assert.equal(brushUnlocked(s, 'spray'), true);
  recordGoal(s, 'rain');
  assert.equal(skyUnlocked(s, 'sunset'), true);
  assert.equal(rainbowUnlocked(s), false);
  recordGoal(s, 'vine');
  assert.equal(rainbowUnlocked(s), true);
  assert.equal(goalsDone(s), 4);
  assert.equal(unlockGoal('element', 'fish').id, 'melt');
  assert.equal(unlockGoal('element', 'sand'), null);
});

test('discoveries are recorded once, and only real ones', () => {
  const s = defaultSave();
  assert.equal(recordFound(s, 'obsidian'), true);
  assert.equal(recordFound(s, 'obsidian'), false);
  assert.equal(recordFound(s, 'dragon'), false);
  assert.deepEqual(s.found, ['obsidian']);
});

test('the daily streak grows day by day and starts again gently after a gap', () => {
  const s = defaultSave();
  assert.equal(recordDaily(s, 20261009), 1);
  assert.equal(recordDaily(s, 20261009), null, 'once a day');
  assert.equal(dailyDone(s, 20261009), true);
  assert.equal(recordDaily(s, 20261010), 2);
  assert.equal(recordDaily(s, 20261011), 3);
  assert.equal(liveStreak(s, 20261012), 3, 'still alive the next day');
  assert.equal(liveStreak(s, 20261013), 0, 'a missed day lets it rest');
  assert.equal(recordDaily(s, 20261014), 1);
  assert.equal(s.daily.best, 3, 'the best streak is kept');
  // Across a month end.
  const m = defaultSave();
  recordDaily(m, 20261031);
  assert.equal(recordDaily(m, 20261101), 2);
});

test('the gallery is capped, refuses oversized gardens and deletes by id', () => {
  const s = defaultSave();
  for (let i = 0; i < MAX_GALLERY; i++) assert.equal(addToGallery(s, { id: `g${i}`, name: `G${i}`, ...scene(i + 1) }), 'ok');
  assert.equal(addToGallery(s, { id: 'extra', name: 'x', ...scene(99) }), 'full');
  assert.equal(s.gallery[0].id, `g${MAX_GALLERY - 1}`, 'newest first');
  assert.equal(removeFromGallery(s, 'g3'), true);
  assert.equal(removeFromGallery(s, 'g3'), false);
  assert.equal(addToGallery(s, { id: 'big', name: 'x', w: 60, h: 40, data: 'A'.repeat(50000) }), 'big');
  assert.equal(cleanScene({ w: 60, h: 40, data: 'A'.repeat(50000) }), null);
});

test('another tab\'s save merges in: goals join, deletions stick, the newer garden wins', () => {
  const mine = defaultSave();
  recordGoal(mine, 'sprout');
  recordFound(mine, 'sand');
  addToGallery(mine, { id: 'a', name: 'A', ...scene(1) });
  addToGallery(mine, { id: 'b', name: 'B', ...scene(2) });
  mine.garden = { ...scene(3), at: 50 };
  mine.muted = true;

  const theirs = JSON.parse(JSON.stringify(mine));
  theirs.muted = false;
  theirs.goals.waterfall = true;
  theirs.found.push('steam');
  theirs.gallery = theirs.gallery.filter((e) => e.id !== 'a'); // deleted over there
  theirs.garden = { ...scene(4), at: 90 };
  recordDaily(theirs, 20261009);

  addToGallery(mine, { id: 'c', name: 'C', ...scene(5), at: 5000 }); // saved here since

  const out = mergeSave(mine, theirs);
  assert.deepEqual(Object.keys(out.goals).sort(), ['sprout', 'waterfall']);
  assert.deepEqual(out.found, ['sand', 'steam']);
  assert.deepEqual(out.gallery.map((e) => e.id), ['c', 'b']);
  assert.equal(out.garden.at, 90);
  assert.equal(out.daily.lastKey, 20261009);
  assert.equal(out.muted, true, 'sound settings stay with this tab');
});
