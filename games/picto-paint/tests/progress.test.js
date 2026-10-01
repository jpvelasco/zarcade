import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES, ALBUMS, starsFor, recordSolve, nextPuzzle, puzzleAfter, albumUnlocked, totalStars, unlockedCosmetics, formatTime, PALETTES, PENCILS } from '../src/progress.js';
import { defaultSave } from '../src/save.js';

test('three stars: solve, no hints, beat the par time', () => {
  const p = PUZZLES[0];
  assert.equal(starsFor(p, p.par, 0), 3);
  assert.equal(starsFor(p, p.par + 1, 0), 2);
  assert.equal(starsFor(p, 1, 2), 2);
  assert.equal(starsFor(p, 9999, 5), 1);
});

test('recording a solve keeps the best stars and time', () => {
  const save = defaultSave();
  const p = PUZZLES[0];
  save.progress[p.id] = { cells: '', time: 3, hints: 0 };
  let r = recordSolve(save, p, 50, 1);
  assert.equal(r.first, true);
  assert.equal(r.newBest, true);
  assert.equal(save.progress[p.id], undefined);
  r = recordSolve(save, p, 80, 0);
  assert.equal(r.newBest, false);
  assert.equal(save.puzzles[p.id].best, 50);
  assert.equal(save.puzzles[p.id].stars, 3);
});

test('albums open after a few solves and cosmetics after stars', () => {
  const save = defaultSave();
  assert.equal(albumUnlocked(save, 0), true);
  assert.equal(albumUnlocked(save, 1), false);
  let unlocks = [];
  for (const p of PUZZLES.slice(0, ALBUMS[1].unlock)) unlocks.push(...recordSolve(save, p, 1, 0).unlocks);
  assert.equal(albumUnlocked(save, 1), true);
  assert.ok(unlocks.some((u) => u.kind === 'album' && u.id === ALBUMS[1].id));
  assert.ok(unlocks.some((u) => u.kind === 'pencil'));
  assert.equal(totalStars(save), ALBUMS[1].unlock * 3);
  const c = unlockedCosmetics(save);
  assert.ok(c.pencils.length >= 2);
  assert.equal(PALETTES[0].stars, 0);
  assert.equal(PENCILS[0].stars, 0);
});

test('Play picks up an unfinished board, then the next unsolved picture', () => {
  const save = defaultSave();
  assert.equal(nextPuzzle(save), PUZZLES[0]);
  recordSolve(save, PUZZLES[0], 10, 0);
  assert.equal(nextPuzzle(save), PUZZLES[1]);
  save.lastPlayed = PUZZLES[5].id;
  save.progress[PUZZLES[5].id] = { cells: '', time: 1, hints: 0 };
  assert.equal(nextPuzzle(save), PUZZLES[5]);
  assert.equal(puzzleAfter(save, PUZZLES[0]), PUZZLES[1]);
});

test('every star total needed is reachable', () => {
  for (const x of [...PALETTES, ...PENCILS]) assert.ok(x.stars <= PUZZLES.length * 3);
  assert.equal(formatTime(75), '1:15');
});
