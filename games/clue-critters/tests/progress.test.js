import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, normalize, loadSave, writeSave, clearSave, starsFor, rankFor, RANKS, recordSolve, totalStars,
  unlockedIds, currentStreak, HATS, COATS, needText, dailyDone, STORAGE_KEY,
} from '../src/progress.js';

const kase = (over = {}) => ({ id: 'pie', kind: 'story', difficulty: 1, title: 'The Prize Pie', suspects: ['bunny', 'duck', 'bear'], culprit: 2, reason: 'Yum', ...over });

function memoryStorage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data };
}

test('stars reward clean solves', () => {
  assert.equal(starsFor(0, 0), 3);
  assert.equal(starsFor(1, 0), 2);
  assert.equal(starsFor(1, 1), 2);
  assert.equal(starsFor(2, 1), 1);
});

test('ranks climb with stars', () => {
  assert.equal(rankFor(0).name, 'Pup');
  assert.equal(rankFor(3).name, 'Sniffer');
  assert.equal(rankFor(1000).name, 'Chief Inspector');
  assert.equal(rankFor(1000).next, null);
  assert.ok(rankFor(5).progress > 0 && rankFor(5).progress < 1);
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].stars > RANKS[i - 1].stars);
});

test('a story solve keeps the best stars and makes friends', () => {
  const st = newState();
  const r1 = recordSolve(st, kase(), { wrong: 2, hints: 0 });
  assert.equal(r1.stars, 2);
  assert.deepEqual(r1.newFriends, ['bunny', 'duck', 'bear']);
  const r2 = recordSolve(st, kase(), { wrong: 0, hints: 0 });
  assert.equal(r2.stars, 3);
  assert.ok(r2.newBest);
  assert.equal(st.story.pie.stars, 3);
  recordSolve(st, kase(), { wrong: 5 });
  assert.equal(st.story.pie.stars, 3);
  assert.equal(r2.newFriends.length, 0);
  assert.equal(st.book.length, 3);
  assert.equal(st.book[0].culprit, 'bear');
  assert.equal(totalStars(st), 3);
});

test('endless solves count stars and move to the next seed', () => {
  const st = newState();
  recordSolve(st, kase({ id: 'gen-2-1', kind: 'gen', difficulty: 2 }), {});
  assert.equal(st.endless[2], 1);
  assert.equal(st.endlessNext[2], 2);
  assert.equal(totalStars(st), 3);
});

test('the daily streak grows on back-to-back days and restarts gently', () => {
  const st = newState();
  const daily = kase({ id: 'daily', kind: 'daily', difficulty: 2 });
  recordSolve(st, daily, { day: '2026-10-01' });
  assert.equal(st.daily.streak, 1);
  assert.ok(dailyDone(st, '2026-10-01'));
  recordSolve(st, daily, { day: '2026-10-01' });
  assert.equal(st.daily.days, 1, 'same day counts once');
  recordSolve(st, daily, { day: '2026-10-02' });
  recordSolve(st, daily, { day: '2026-10-03' });
  assert.equal(st.daily.streak, 3);
  assert.equal(currentStreak(st, '2026-10-04'), 3);
  assert.equal(currentStreak(st, '2026-10-06'), 0);
  recordSolve(st, daily, { day: '2026-10-08' });
  assert.equal(st.daily.streak, 1);
  assert.equal(st.daily.best, 3);
});

test('outfits unlock as you play', () => {
  const st = newState();
  assert.deepEqual(unlockedIds(st).sort(), ['deerstalker', 'trench']);
  const r = recordSolve(st, kase(), {});
  assert.ok(r.unlocked.includes('bowler'), 'Sniffer rank unlocks the bowler');
  recordSolve(st, kase({ id: 'hat' }), {});
  assert.ok(unlockedIds(st).includes('raincoat'));
  for (const x of [...HATS, ...COATS]) assert.ok(needText(x.need).length > 0);
});

test('saves round-trip and survive bad data', () => {
  const storage = memoryStorage();
  const st = newState();
  recordSolve(st, kase(), {});
  assert.ok(writeSave(storage, st));
  assert.deepEqual(loadSave(storage), normalize(JSON.parse(storage.data[STORAGE_KEY])));
  assert.equal(loadSave(storage).story.pie.stars, 3);
  storage.setItem(STORAGE_KEY, '{nope');
  assert.deepEqual(loadSave(storage), newState());
  assert.deepEqual(normalize({ v: 99 }), newState());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), newState());
  assert.equal(writeSave(throwing, st), false);
  assert.equal(loadSave(null).v, 1);
  assert.ok(clearSave(storage));
});

test('damaged case-file entries are dropped on load (#96)', () => {
  const good = { id: 'pie', kind: 'story', title: 'The Prize Pie', culprit: 'bunny', reason: 'Yum!', stars: 3, day: '', storyIndex: 0 };
  const out = normalize({ v: 1, book: [null, { id: 3 }, 'x', { ...good, culprit: 'dragon' }, good, { ...good, stars: 9 }, { ...good, stars: -2 }] });
  assert.equal(out.book.length, 3);
  assert.deepEqual(out.book.map((e) => e.stars), [3, 3, 0]);
  assert.ok(out.book.every((e) => e.culprit === 'bunny'));
});
