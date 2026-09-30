import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES,
  buyUpgrade,
  defaultSave,
  paintFor,
  statsFor,
  upgradeCost,
} from '../src/progress.js';

test('new saves include every upgrade and a valid paint', () => {
  const save = defaultSave();
  assert.deepEqual(Object.keys(save.upgrades), Object.keys(UPGRADES));
  assert.equal(paintFor(save).id, 'cyan');
});

test('upgrades spend credits and improve simulation stats', () => {
  const save = defaultSave();
  save.credits = 10_000;
  const before = statsFor(save.upgrades);
  assert.equal(buyUpgrade(save, 'fins'), true);
  assert.equal(save.upgrades.fins, 1);
  assert.ok(save.credits < 10_000);
  assert.ok(statsFor(save.upgrades).driftGain > before.driftGain);
});

test('upgrades cannot be bought without credits or beyond their maximum', () => {
  const save = defaultSave();
  assert.equal(buyUpgrade(save, 'echo'), false);
  save.credits = 100_000;
  while (upgradeCost(save, 'echo') !== null) assert.equal(buyUpgrade(save, 'echo'), true);
  assert.equal(upgradeCost(save, 'echo'), null);
  assert.equal(buyUpgrade(save, 'echo'), false);
});

test('story progress records best stars and unlocks chapters in order', async () => {
  const { recordJob, recordChapter, chapterStars, loadSave, writeSave, SAVE_KEY } = await import('../src/progress.js');
  const save = defaultSave();
  recordJob(save, 0, 1, 2);
  recordJob(save, 0, 1, 1);
  assert.equal(save.story.stars[0][1], 2);
  assert.equal(chapterStars(save, 0), 2);
  recordChapter(save, 0);
  assert.equal(save.story.unlocked, 1);
  recordChapter(save, 4);
  assert.equal(save.story.finished, true);
  assert.equal(save.story.unlocked, 4);

  const data = {};
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  writeSave(storage, save);
  assert.deepEqual(loadSave(storage).story, save.story);
  data[SAVE_KEY] = JSON.stringify({ story: { unlocked: 99, stars: [[9, -1, 'x']] } });
  const odd = loadSave(storage).story;
  assert.equal(odd.unlocked, 4);
  assert.deepEqual(odd.stars[0], [3, 0, 0]);
});
