import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../src/songs.js';
import { SAVE_KEY, STARTING_SONGS, defaultSave, loadSave, writeSave, recordResult, checkUnlocks, isSongUnlocked, DECORATIONS, SKINS } from '../src/progress.js';

function memory(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}
const result = (over = {}) => ({ counts: { perfect: 10, great: 0, good: 0, miss: 0 }, accuracy: 0.8, grade: 'B', score: 700000, maxCombo: 10, fullCombo: false, failed: false, ...over });

test('a fresh save starts kid-friendly with four songs open', () => {
  const s = defaultSave();
  assert.equal(s.noFail, true);
  assert.equal(s.lanes, 4);
  assert.equal(s.songs.length, STARTING_SONGS);
  assert.ok(isSongUnlocked(s, SONGS[0].id));
  assert.ok(!isSongUnlocked(s, SONGS[STARTING_SONGS].id));
  assert.equal(SAVE_KEY, 'groove-garden.v1');
});

test('saves round-trip, and corrupt or hostile data is repaired', () => {
  const store = memory();
  const s = defaultSave();
  s.inputOffsetMs = 42; s.lanes = 3; s.noFail = false; s.speed = 5;
  assert.ok(writeSave(store, s));
  const back = loadSave(store);
  assert.equal(back.inputOffsetMs, 42);
  assert.equal(back.lanes, 3);
  assert.equal(back.noFail, false);
  assert.equal(back.speed, 5);

  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '{not json' })), defaultSave());
  const hostile = loadSave(memory({ [SAVE_KEY]: JSON.stringify({ inputOffsetMs: 1e9, lanes: 7, speed: 'x', songs: ['nope', SONGS[9].id], skin: 'stars', skins: ['stars', 'evil'], best: { [SONGS[0].id]: { easy: { grade: 'Z' }, hard: { grade: 'A', score: 5e9 } } }, stats: { clears: -4 } }) }));
  assert.equal(hostile.inputOffsetMs, 400);
  assert.equal(hostile.lanes, 4);
  assert.equal(hostile.speed, 3);
  assert.ok(hostile.songs.includes(SONGS[9].id) && !hostile.songs.includes('nope'));
  assert.equal(hostile.skin, 'stars');
  assert.ok(!hostile.skins.includes('evil'));
  assert.equal(hostile.best[SONGS[0].id].easy, undefined);
  assert.equal(hostile.best[SONGS[0].id].hard.score, 1000000);
  assert.equal(hostile.stats.clears, 0);
});

test('blocked storage never throws', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(blocked), defaultSave());
  assert.equal(writeSave(blocked, defaultSave()), false);
  assert.equal(writeSave(null, defaultSave()), false);
  assert.deepEqual(loadSave(null), defaultSave());
});

test('finishing a song opens the next one, an S opens two', () => {
  const s = defaultSave();
  const r1 = recordResult(s, { songId: SONGS[0].id, difficulty: 'easy', results: result() });
  assert.ok(r1.newBest);
  assert.deepEqual(r1.unlocks.filter((u) => u.type === 'song').map((u) => u.id), [SONGS[STARTING_SONGS].id]);
  assert.ok(r1.unlocks.some((u) => u.id === 'gnome'));
  const r2 = recordResult(s, { songId: SONGS[0].id, difficulty: 'easy', results: result({ grade: 'S', accuracy: 0.97, score: 980000 }) });
  assert.equal(r2.unlocks.filter((u) => u.type === 'song').length, 2);
  assert.ok(r2.unlocks.some((u) => u.id === 'rainbow'));
  assert.equal(s.best[SONGS[0].id].easy.grade, 'S');
  assert.equal(s.best[SONGS[0].id].easy.score, 980000);
});

test('bests keep the best of each measure', () => {
  const s = defaultSave();
  recordResult(s, { songId: SONGS[1].id, difficulty: 'normal', results: result({ grade: 'A', score: 900000, maxCombo: 50, fullCombo: true }) });
  const r = recordResult(s, { songId: SONGS[1].id, difficulty: 'normal', results: result({ grade: 'B', score: 800000, maxCombo: 70 }) });
  assert.equal(r.newBest, false);
  const best = s.best[SONGS[1].id].normal;
  assert.deepEqual([best.grade, best.score, best.combo, best.fullCombo], ['A', 900000, 70, true]);
});

test('practice and wilted runs never change bests or open songs', () => {
  const s = defaultSave();
  const p = recordResult(s, { songId: SONGS[0].id, difficulty: 'easy', practice: true, results: result({ grade: 'S' }) });
  assert.equal(s.best[SONGS[0].id], undefined);
  assert.deepEqual(p.unlocks.map((u) => u.id), ['watering-can']);
  const f = recordResult(s, { songId: SONGS[0].id, difficulty: 'easy', results: result({ failed: true }) });
  assert.equal(f.unlocks.length, 0);
  assert.equal(s.songs.length, STARTING_SONGS);
});

test('decorations and note skins unlock from milestones', () => {
  const s = defaultSave();
  assert.deepEqual(checkUnlocks(s), []);
  s.calibrated = true;
  assert.deepEqual(checkUnlocks(s).map((u) => u.id), ['wind-chimes']);
  recordResult(s, { songId: SONGS[0].id, difficulty: 'hard', results: result({ grade: 'S', fullCombo: true }) });
  for (const id of ['gnome', 'rainbow', 'scarecrow', 'fairy-lights', 'birdhouse']) assert.ok(s.decor.includes(id), id);
  for (const id of ['ladybugs', 'fruit', 'stars']) assert.ok(s.skins.includes(id), id);
  assert.ok(DECORATIONS.length >= 10 && SKINS.length >= 4);
  // Every style played opens the windmill.
  for (const style of ['lofi', 'disco', 'chiptune', 'reggae', 'synthwave', 'waltz']) {
    const song = SONGS.find((x) => x.style === style);
    recordResult(s, { songId: song.id, difficulty: 'easy', results: result() });
  }
  assert.ok(s.decor.includes('windmill'));
  assert.ok(s.decor.includes('beehive'));
});
