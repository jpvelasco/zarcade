import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONTINUE_MOVES } from '../src/game.js';
import { resolveAll } from '../src/ai.js';
import { getLevel } from '../src/levels.js';
import { isJelly, jelly, coral, STRIPE_H, STRIPE_V, BOMB, RAINBOW } from '../src/board.js';
import { make, gameOf, DEAD } from './helpers.js';

const play = (game, a, b) => {
  const res = game.swap(a, b);
  if (res.ok) resolveAll(game);
  return res;
};

test('a swap that matches nothing is refused and nothing moves', () => {
  const game = gameOf(['112', '221', '122']);
  const before = game.board.cells.map((c) => c.color);
  const res = game.swap(0, 1);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'nomatch');
  assert.deepEqual(game.board.cells.map((c) => c.color), before);
  assert.equal(game.moves, 10, 'a wobble back costs nothing');
});

test('a matching swap spends one move, scores, and refills the board', () => {
  const game = gameOf(['112', '221', '122']);
  assert.equal(play(game, 2, 5).ok, true);
  assert.equal(game.moves, 9);
  assert.ok(game.score > 0);
  assert.ok(game.board.playableIndices().every((i) => game.board.at(i)), 'board is full');
  assert.equal(game.phase, 'input');
});

test('four in a row leaves a striped jelly under your finger', () => {
  const game = gameOf(['11213', '45167', '23456'], [], { colors: 8 });
  const res = game.swap(2, 7); // bring the fourth 1 up into the top row
  assert.equal(res.ok, true);
  const step = game.step();
  assert.equal(step.type, 'clear');
  assert.equal(step.created.length, 1);
  assert.equal(step.created[0].special, STRIPE_H);
  assert.equal(step.created[0].index, 2, 'it appears where the swap happened');
});

test('an L shape leaves a bubble bomb, and firing it clears a 3x3', () => {
  // Swapping the 1 up into the middle of the top row makes a T of five.
  const game = gameOf(['23145', '61712', '34156', '72134'], [], { colors: 8 });
  const res = game.swap(7, 2);
  assert.equal(res.ok, true);
  const step = game.step();
  assert.equal(step.created[0].special, BOMB);
  resolveAll(game);
  const bombIndex = game.board.playableIndices().find((i) => game.board.at(i).special === BOMB);
  assert.ok(bombIndex !== undefined, 'the bomb stayed on the board');
});

test('cascades raise the chain, and the multiplier grows with it', () => {
  const game = gameOf(['523', '562', '114', '581'], { colors: 9 });
  assert.equal(game.swap(8, 11).ok, true);
  const first = game.step();
  assert.equal(first.chain, 1);
  assert.equal(first.mult, 1);
  game.step(); // fall
  const second = game.step();
  assert.equal(second.type, 'clear');
  assert.equal(second.chain, 2);
  assert.ok(second.mult > 1);
  resolveAll(game);
  assert.ok(game.bestChain >= 2);
});

test('collect goals count the jellies of that color', () => {
  const game = gameOf(['112', '221', '122'], [{ type: 'collect', color: 1, count: 3 }]);
  play(game, 2, 5);
  const goal = game.goalStatus()[0];
  assert.ok(game.collected[1] >= 3);
  assert.equal(goal.done, true);
});

test('sand clears one layer at a time under the jellies', () => {
  const game = gameOf(['112', '221', '122'], [{ type: 'sand' }], {
    ground: ['220', '000', '000'],
  });
  assert.equal(game.goalStatus()[0].need, 4);
  const step = (() => { game.swap(2, 5); return game.step(); })();
  assert.equal(step.sand.length, 2, 'both sanded tiles lost a layer');
  assert.deepEqual(step.sand.map((s) => s.left), [1, 1]);
  resolveAll(game);
  assert.equal(game.remaining.sand, 2);
});

test('coral breaks when a match goes off next to it', () => {
  const game = gameOf(['1x2', '112', '221'], [{ type: 'coral' }]);
  assert.equal(game.goalStatus()[0].need, 1);
  assert.equal(game.swap(1, 4).ok, false, 'coral cannot be swapped');
  play(game, 5, 8);
  assert.equal(game.remaining.coral, 0);
  assert.equal(game.goalStatus()[0].done, true);
});

test('ice chips away and the jelly underneath becomes playable again', () => {
  const game = gameOf(['112', '221', '122'], [{ type: 'ice' }], {
    mutate: (board) => { board.at(3).ice = 2; }, // the jelly below the matching row
  });
  assert.equal(game.goalStatus()[0].need, 2);
  const step = (() => { game.swap(2, 5); return game.step(); })();
  assert.equal(step.ice.length, 1);
  assert.equal(step.ice[0].left, 1);
  resolveAll(game);
  assert.equal(game.remaining.ice, 1);
});

test('turtle eggs score and count once they reach the bottom', () => {
  const game = gameOf(['1o2', '112', '221'], [{ type: 'eggs' }]);
  assert.equal(game.goalStatus()[0].need, 1);
  play(game, 5, 8);
  assert.equal(game.counts.eggs, 1);
  assert.equal(game.remaining.eggs, 0);
  assert.ok(game.score >= 2000);
  assert.equal(game.goalStatus()[0].done, true);
});

test('a score goal finishes the level, with leftover moves as a reef party', () => {
  const game = gameOf(['112', '221', '122'], [{ type: 'score', amount: 1 }], { moves: 3 });
  play(game, 2, 5);
  assert.equal(game.phase, 'won');
  assert.equal(game.moves, 0, 'the party spent the rest');
  assert.ok(game.counts.specials >= 2, 'leftover moves became specials');
});

test('running out of moves offers one free continue, then the level is lost', () => {
  const game = gameOf(['112', '221', '122'], [{ type: 'score', amount: 1e9 }], { moves: 1 });
  play(game, 2, 5);
  assert.equal(game.phase, 'outOfMoves');
  assert.equal(game.useContinue(), true);
  assert.equal(game.moves, CONTINUE_MOVES);
  assert.equal(game.phase, 'input');
  game.moves = 0;
  game.phase = 'resolving';
  game.resolveMode = 'check';
  game.step();
  assert.equal(game.phase, 'lost');
  assert.equal(game.useContinue(), false, 'the continue is only free once');
});

test('stars follow the score thresholds', () => {
  const game = gameOf(['112', '221', '122'], [], { stars: [100, 200, 300] });
  assert.equal(game.stars(), 0);
  game.score = 150;
  assert.equal(game.stars(), 1);
  game.score = 250;
  assert.equal(game.stars(), 2);
  game.score = 9999;
  assert.equal(game.stars(), 3);
});

test('a dead board asks for a shuffle and gets its moves back', () => {
  const game = gameOf(DEAD, [], { colors: 4 });
  game.phase = 'resolving';
  game.resolveMode = 'check';
  assert.equal(game.step(), null);
  assert.equal(game.phase, 'input');
  assert.equal(game.pendingShuffle, true);
  const step = game.doShuffle();
  assert.equal(step.type, 'shuffle');
  assert.ok(step.cells.length > 0);
  assert.equal(game.pendingShuffle, false);
  assert.ok(game.bestMove(), 'there is something to play again');
});

test('a pearl swapped onto a plain jelly clears that whole color', () => {
  const game = gameOf(['1234', '2341', '3412', '4123']);
  game.board.at(0).special = RAINBOW;
  game.board.at(0).color = null;
  const target = game.board.at(1).color;
  const before = game.board.playableIndices().filter((i) => game.board.at(i).color === target).length;
  assert.ok(before >= 4);
  const res = game.swap(0, 1);
  assert.equal(res.ok, true);
  assert.equal(res.blast.kind, RAINBOW);
  const step = game.step();
  assert.ok(step.cleared.length >= before);
});

test('stripe plus stripe clears a whole row and column', () => {
  const game = gameOf(['12341', '23412', '34123', '41234', '12341']);
  game.board.at(12).special = STRIPE_H;
  game.board.at(13).special = STRIPE_V;
  const res = game.swap(12, 13);
  assert.equal(res.ok, true);
  const step = game.step();
  const rows = new Set(step.cleared.map((c) => game.board.row(c.index)));
  assert.ok(step.cleared.length >= 9, `cleared ${step.cleared.length}`);
  assert.ok(rows.size >= 4, 'the column reached top and bottom');
});

test('the same seed plays out exactly the same way', () => {
  const level = getLevel(7);
  const a = new Game(level, { seed: 42 });
  const b = new Game(level, { seed: 42 });
  const colors = (g) => g.board.cells.map((c) => (c ? `${c.kind}${c.color}${c.ice}` : '-')).join();
  assert.equal(colors(a), colors(b));
  const other = new Game(level, { seed: 43 });
  assert.notEqual(colors(a), colors(other));
  const move = a.bestMove();
  a.swap(move.a, move.b);
  b.swap(move.a, move.b);
  resolveAll(a);
  resolveAll(b);
  assert.equal(colors(a), colors(b));
  assert.equal(a.score, b.score);
});

test('every level builds a legal, full, playable board', () => {
  for (let id = 1; id <= 44; id++) {
    const game = new Game(getLevel(id), { seed: id * 7 });
    const board = game.board;
    assert.ok(board.playableIndices().every((i) => board.at(i)), `level ${id} has a gap`);
    assert.equal(board.cells.filter((c, i) => c && !board.mask[i]).length, 0, `level ${id} put a jelly in a hole`);
    assert.ok(game.bestMove(), `level ${id} starts with no move`);
    assert.ok(game.goalStatus().every((g) => g.need > 0), `level ${id} has an empty goal`);
    assert.ok(game.goalStatus().every((g) => !g.done), `level ${id} starts finished`);
  }
});
