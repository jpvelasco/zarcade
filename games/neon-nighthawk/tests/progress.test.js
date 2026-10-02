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

test('starring every job in a district unlocks the next one, even without the chapter screen', async () => {
  const { recordJob, loadSave } = await import('../src/progress.js');
  const save = defaultSave();
  recordJob(save, 0, 0, 3);
  recordJob(save, 0, 1, 2);
  assert.equal(save.story.unlocked, 0, 'two of three jobs is not a lit district');
  recordJob(save, 0, 2, 1);
  assert.equal(save.story.unlocked, 1);

  // A save written before this fix, by a player who left at the last results.
  const stuck = { story: { unlocked: 0, stars: [[3, 2, 1], [1, 1, 1], [2, 0, 0]] } };
  const repaired = loadSave({ getItem: () => JSON.stringify(stuck) }).story;
  assert.equal(repaired.unlocked, 2);
  assert.equal(repaired.finished, false);
});

test('the briefing knows which star goals the best run earned', async () => {
  const { recordJob, goalsFor, GOAL_FINISH, GOAL_SPARKS, GOAL_BIKE } = await import('../src/progress.js');
  const save = defaultSave();
  const bikeOnly = goalsFor({ sparks: 3, sparkGoal: 10, integrity: 90 });
  assert.equal(bikeOnly, GOAL_FINISH | GOAL_BIKE);
  recordJob(save, 1, 0, 2, bikeOnly);
  assert.equal(save.story.goals[1][0], GOAL_FINISH | GOAL_BIKE);
  // A worse run keeps the best one's goals; a better one replaces them.
  recordJob(save, 1, 0, 1, GOAL_FINISH);
  assert.equal(save.story.goals[1][0], GOAL_FINISH | GOAL_BIKE);
  recordJob(save, 1, 0, 3, GOAL_FINISH | GOAL_SPARKS | GOAL_BIKE);
  assert.equal(save.story.goals[1][0], 7);
});

test('a damaged save falls back to defaults field by field', async () => {
  const { loadSave } = await import('../src/progress.js');
  const load = (value) => loadSave({ getItem: () => JSON.stringify(value) });
  assert.equal(load({ credits: null }).credits, 0);
  assert.equal(load({ credits: 'lots' }).credits, 0);
  assert.equal(load({ credits: 512.7 }).credits, 512);
  assert.equal(load({ bestScore: -4 }).bestScore, 0);
  const upgrades = load({ upgrades: { flux: '2', fins: -3, echo: 99, quiet: 2 } }).upgrades;
  assert.deepEqual(upgrades, { fins: 0, quiet: 2, echo: 3, flux: 0, clamps: 0 });
  assert.equal(statsFor(upgrades).flux, 1);
  assert.equal(load({ paint: 42 }).paint, 'cyan');
  assert.equal(load({ paint: 'rose' }).paint, 'rose');
  for (const odd of [[], 7, 'x']) assert.deepEqual(load(odd), defaultSave());
  // Goal records that disagree with the star count are forgotten.
  const story = load({ story: { stars: [[2, 1, 0]], goals: [[5, 7, 1]] } }).story;
  assert.deepEqual(story.goals[0], [5, 0, 0]);
});
