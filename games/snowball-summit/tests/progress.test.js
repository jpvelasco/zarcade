import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, freshSave, recordSlope, recordEndless, recordDaily, recordAttempt, totalStars, museumCount, slopeUnlocked, unlockedIds, currentStreak, markDaily, SAVE_KEY } from '../src/progress.js';
import { SLOPES } from '../src/levels.js';
import { localDateKey, dayDiff } from '../src/rng.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('saves round-trip under the namespaced key and survive bad data', () => {
  const st = memory();
  const s = freshSave();
  s.museum.pinecone = 3;
  assert.equal(writeSave(st, s), true);
  assert.ok(st.map.has(SAVE_KEY) && SAVE_KEY === 'snowball-summit.v1');
  assert.equal(loadSave(st).museum.pinecone, 3);
  st.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadSave(st), freshSave());
  assert.deepEqual(loadSave(null), freshSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), freshSave());
  assert.equal(writeSave(throwing, s), false);
});

test('broken nested save values fall back to defaults (#76)', () => {
  const st = memory();
  st.setItem(SAVE_KEY, JSON.stringify({ slopes: { '1-1': null, '1-2': { done: true, stars: 2, best: null } }, daily: { days: null, streak: 3 }, museum: null, skin: 5, endless: [] }));
  const s = loadSave(st);
  assert.deepEqual(Object.keys(s.slopes), ['1-2']);
  assert.equal(totalStars(s), 2);
  assert.deepEqual(s.daily.days, {});
  assert.equal(s.daily.streak, 3);
  assert.deepEqual(s.museum, {});
  assert.equal(s.skin, 'snowy');
  assert.deepEqual(s.endless, freshSave().endless);
  assert.doesNotThrow(() => { unlockedIds(s); currentStreak(s, '2026-10-02'); });
});

test('finishing a slope records stars, bests and the museum, and opens the next', () => {
  const s = freshSave();
  assert.equal(slopeUnlocked(s, SLOPES, 0), true);
  assert.equal(slopeUnlocked(s, SLOPES, 1), false);
  const first = recordSlope(s, '1-1', { stars: 1, size: 40, items: 30, time: 50, byType: { pinecone: 20, mitten: 10 } });
  assert.equal(first.firstClear, true);
  assert.deepEqual(first.newTypes.sort(), ['mitten', 'pinecone']);
  assert.equal(slopeUnlocked(s, SLOPES, 1), true);
  const again = recordSlope(s, '1-1', { stars: 3, size: 38, items: 45, time: 41, byType: { pinecone: 5 } });
  assert.deepEqual(again.newBest, { size: false, items: true, time: true });
  assert.equal(again.starsGained, 2);
  assert.deepEqual(s.slopes['1-1'].best, { size: 40, items: 45, time: 41 });
  assert.equal(totalStars(s), 3);
  assert.equal(s.museum.pinecone, 25);
  assert.equal(museumCount(s), 2);
  recordSlope(s, '1-1', { stars: 0, size: 10, items: 1, time: 99, byType: {} });
  assert.equal(s.slopes['1-1'].stars, 3, 'stars never go down');
});

test('cosmetics unlock generously and are reported once', () => {
  const s = freshSave();
  assert.deepEqual(unlockedIds(s), { skins: ['snowy'], hats: ['none', 'beanie'] });
  const out = recordSlope(s, '1-1', { stars: 3, size: 40, items: 30, time: 50, byType: {} });
  assert.deepEqual(out.unlocks, []);
  const r2 = recordSlope(s, '1-2', { stars: 2, size: 40, items: 30, time: 50, byType: {} });
  assert.deepEqual(r2.unlocks.map((u) => u.id), ['beach'], '5 stars');
  const r3 = recordSlope(s, '1-3', { stars: 3, size: 40, items: 30, time: 50, byType: {} });
  assert.deepEqual(r3.unlocks.map((u) => u.id), ['tophat'], '8 stars');
  const r4 = recordSlope(s, '1-4', { stars: 1, size: 40, items: 30, time: 50, byType: {} });
  assert.deepEqual(r4.unlocks.map((u) => u.id), []);
  const r5 = recordEndless(s, { dist: 1200, size: 900, byType: { cocoa: 1 } });
  assert.equal(r5.newBest, true);
  assert.deepEqual(r5.unlocks.map((u) => u.id), ['propeller']);
  const r6 = recordDaily(s, '2026-10-01', { stars: 2, size: 50, byType: {} });
  assert.deepEqual(r6.unlocks.map((u) => u.id), ['party']);
});

test('runs that end early still fill the museum', () => {
  const s = freshSave();
  const out = recordAttempt(s, { byType: { penguin: 2 } });
  assert.deepEqual(out.newTypes, ['penguin']);
  assert.equal(s.museum.penguin, 2);
});

test('the daily streak counts consecutive days and restarts after a gap', () => {
  const s = freshSave();
  assert.equal(markDaily(s, '2026-10-01'), 1);
  assert.equal(markDaily(s, '2026-10-01'), 1, 'same day twice');
  assert.equal(markDaily(s, '2026-10-02'), 2);
  assert.equal(currentStreak(s, '2026-10-03'), 2, 'still alive the next day');
  assert.equal(currentStreak(s, '2026-10-05'), 0, 'gone after a gap');
  assert.equal(markDaily(s, '2026-10-05'), 1);
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
  assert.match(localDateKey(new Date(2026, 0, 5)), /^2026-01-05$/);
});
