import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSave, loadSave, writeSave, STORAGE_KEY, recordRun, regionsOpen, isStageUnlocked, nextStageIndex,
  checkUnlocks, isOwned, equip, liveStreak, dailyDoneToday, recordPoof, totalStars, MAX_STARS, currentTier,
} from '../src/progress.js';
import { STAGES, LESSONS, makeDaily } from '../src/stages.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}
const result = (over = {}) => ({ stars: 2, score: 300, wpm: 20, acc: 0.9, words: 12, correct: 40, maxCombo: 6, ...over });

test('saves round-trip and survive broken or blocked storage', () => {
  const store = memoryStorage();
  const s = defaultSave();
  s.stars['meadow-1'] = 3;
  assert.equal(writeSave(store, s), true);
  assert.equal(loadSave(store).stars['meadow-1'], 3);
  assert.ok(store.data.has(STORAGE_KEY));
  store.setItem(STORAGE_KEY, '{nope');
  assert.deepEqual(loadSave(store), defaultSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), defaultSave());
  assert.equal(writeSave(throwing, s), false);
  assert.deepEqual(loadSave(null), defaultSave());
});

test('stages open in order and bosses open the next region', () => {
  const s = defaultSave();
  assert.equal(regionsOpen(s), 1);
  assert.equal(isStageUnlocked(s, 0), true);
  assert.equal(isStageUnlocked(s, 1), false);
  recordRun(s, STAGES[0], result(), '2026-10-01');
  assert.equal(isStageUnlocked(s, 1), true);
  assert.equal(nextStageIndex(s), 1);
  assert.equal(isStageUnlocked(s, 6), false);
  for (let i = 1; i < 6; i++) recordRun(s, STAGES[i], result(), '2026-10-01');
  assert.equal(regionsOpen(s), 2);
  assert.equal(isStageUnlocked(s, 6), true);
  assert.equal(nextStageIndex(s), 6);
});

test('choosing a grown-up knight opens the map up to the sentences', () => {
  const s = defaultSave();
  s.who = 3;
  assert.equal(regionsOpen(s), 4);
  assert.equal(isStageUnlocked(s, 18), true);
  assert.equal(isStageUnlocked(s, 24), false);
  assert.equal(currentTier(s), 3);
});

test('best stars, scores and WPM are kept with a new-best flag', () => {
  const s = defaultSave();
  let out = recordRun(s, STAGES[0], result({ wpm: 20 }), '2026-10-01');
  assert.equal(out.newBestWpm, false, 'the first record is not a "new best"');
  assert.equal(s.bestWpm, 20);
  out = recordRun(s, STAGES[0], result({ stars: 1, wpm: 25, score: 100 }), '2026-10-01');
  assert.equal(out.newBestWpm, true);
  assert.equal(s.stars['meadow-1'], 2, 'stars never go down');
  assert.equal(s.best['meadow-1'], 300);
  recordRun(s, STAGES[0], result({ wpm: 90, correct: 5 }), '2026-10-01');
  assert.equal(s.bestWpm, 25, 'tiny runs do not set records');
  assert.equal(s.history.length, 2);
});

test('stars, bosses, lessons and dailies unlock the wardrobe', () => {
  const s = defaultSave();
  assert.deepEqual(checkUnlocks(s), []);
  for (let i = 0; i < 3; i++) recordRun(s, STAGES[i], result({ stars: 3 }), '2026-10-01');
  assert.ok(isOwned(s, 'armour', 'leaf'));
  assert.equal(equip(s, 'armour', 'leaf'), true);
  assert.equal(equip(s, 'armour', 'gold'), false);
  for (let i = 3; i < 6; i++) recordRun(s, STAGES[i], result(), '2026-10-01');
  assert.ok(isOwned(s, 'sword', 'iron'));
  const out = recordRun(s, makeDaily('2026-10-01', 0), result(), '2026-10-01');
  assert.ok(out.unlocked.some((u) => u.id === 'puppy'));
  for (const l of LESSONS.slice(0, 6)) recordRun(s, l, result(), '2026-10-01');
  assert.ok(isOwned(s, 'sword', 'lolly'));
  assert.ok(MAX_STARS >= 90 && totalStars(s) > 0);
});

test('daily streak counts days in a row, once per day', () => {
  const s = defaultSave();
  const daily = (d) => recordRun(s, makeDaily(d, 1), result(), d);
  assert.equal(daily('2026-10-01').streak, 1);
  assert.equal(daily('2026-10-01').dailyRepeat, true);
  assert.equal(daily('2026-10-02').streak, 2);
  assert.equal(liveStreak(s, '2026-10-03'), 2);
  assert.equal(liveStreak(s, '2026-10-05'), 0);
  assert.equal(daily('2026-10-05').streak, 1);
  assert.equal(s.daily.best, 2);
  assert.equal(s.daily.clears, 3);
  assert.equal(dailyDoneToday(s, '2026-10-05'), true);
  assert.equal(Object.keys(s.stars).length, 0, 'dailies do not add map stars');
});

test('the bestiary counts poofs and spots first meetings', () => {
  const s = defaultSave();
  assert.equal(recordPoof(s, 'goose'), true);
  assert.equal(recordPoof(s, 'goose'), false);
  assert.equal(s.bestiary.goose, 2);
});
