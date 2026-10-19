import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, autoplay, starsFor, starTargets } from '../src/game.js';
import { LEVELS, getLevel } from '../src/levels.js';
import { garden, E, W } from './helpers.js';

function lineLevel() {
  const p = garden(3, 1, {
    0: { kind: 'spring', mask: E, color: 'b' },
    1: { kind: 'pipe', mask: E | W },
    2: { kind: 'flower', mask: W, need: 'b' },
  });
  return { id: 1, puzzle: { ...p, rots: [1, 1, 3], par: 3 } };
}

test('tapping turns a stone clockwise and counts a move', () => {
  const game = new Game(lineLevel());
  const res = game.rotate(1, 1);
  assert.deepEqual(res.tiles, [1]);
  assert.equal(game.rots[1], 2);
  assert.equal(game.moves, 1);
  game.rotate(1, -1);
  assert.equal(game.rots[1], 1);
  assert.equal(game.rotate(-1, 1), null);
});

test('undo steps back and reset can be undone', () => {
  const game = new Game(lineLevel());
  game.rotate(0, 1);
  game.rotate(2, 1);
  assert.equal(game.moves, 2);
  game.undo();
  assert.deepEqual(game.rots, [2, 1, 3]);
  assert.equal(game.moves, 1);
  game.reset();
  assert.deepEqual(game.rots, [1, 1, 3]);
  assert.equal(game.moves, 0);
  game.undo();
  assert.deepEqual(game.rots, [2, 1, 3]);
  assert.equal(game.moves, 1);
  game.undo();
  assert.equal(game.undo(), null);
  assert.equal(game.reset(), null, 'nothing to reset');
});

test('finishing a garden reports the blooms and freezes the board', () => {
  const game = new Game(lineLevel());
  game.rotate(0, -1);
  game.rotate(1, 1);
  const last = game.rotate(2, 1);
  assert.equal(last.justSolved, true);
  assert.deepEqual(last.bloomed, [2]);
  assert.equal(game.solved, true);
  assert.equal(game.rotate(1, 1), null);
  assert.equal(game.undo(), null);
  assert.equal(game.stars(), 3);
});

test('stars reward few moves but always give at least one', () => {
  const t = starTargets(10);
  assert.equal(starsFor(10, 10), 3);
  assert.equal(starsFor(t.three, 10), 3);
  assert.equal(starsFor(t.three + 1, 10), 2);
  assert.equal(starsFor(t.two + 1, 10), 1);
  assert.equal(starsFor(999, 10), 1);
});

test('locked stones never turn and twins turn together', () => {
  const locked = getLevel(LEVELS.find((l) => l.twist === 'locks').id);
  const g1 = new Game(locked);
  const i = locked.puzzle.tiles.findIndex((t) => t && t.locked);
  assert.equal(g1.rotate(i, 1), null);
  const twins = getLevel(LEVELS.find((l) => l.twist === 'pairs').id);
  const g2 = new Game(twins);
  const a = twins.puzzle.tiles.findIndex((t) => t && t.group === 0);
  const pair = g2.partners(a);
  assert.equal(pair.length, 2);
  const before = pair.map((k) => g2.rots[k]);
  g2.rotate(a, 1);
  pair.forEach((k, j) => assert.equal(g2.rots[k], (before[j] + 1) % 4));
});

test('hints follow the stream and the autoplayer finishes every garden in par', () => {
  for (const level of LEVELS) {
    const game = new Game(getLevel(level.id));
    const h = game.hint();
    assert.ok(h && h.steps >= 1, `level ${level.id} hint`);
    const steps = autoplay(game);
    assert.equal(game.solved, true, `level ${level.id} solved by autoplay`);
    assert.equal(steps, game.puzzle.par, `level ${level.id} in par`);
    assert.equal(game.stars(), 3);
    assert.equal(game.hint(), null);
  }
});

test('a saved garden in progress resumes, and bad saves are ignored', () => {
  const level = getLevel(30);
  const a = new Game(level);
  const h = a.hint();
  a.rotate(h.i, h.dir);
  const b = new Game(level, a.serialize());
  assert.deepEqual(b.rots, a.rots);
  assert.equal(b.moves, 1);
  const locked = level.puzzle.tiles.findIndex((t) => t && t.locked);
  const bad = a.serialize();
  bad.rots[locked] = 1;
  assert.deepEqual(new Game(level, bad).rots, level.puzzle.rots);
  assert.deepEqual(new Game(level, { rots: [1, 2] }).rots, level.puzzle.rots);
});
