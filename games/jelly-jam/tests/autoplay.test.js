import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { autoPlay, pickMove, resolveAll } from '../src/ai.js';
import { getLevel, LEVEL_COUNT } from '../src/levels.js';
import { findMoves } from '../src/board.js';
import { Rng } from '../src/rng.js';

// The autoplayer stands in for a patient beginner: if it can finish a level
// without the free continue, the level is generous enough.
test('the autoplayer clears the first five levels on several seeds', () => {
  for (let id = 1; id <= 5; id++) {
    for (const seed of [1, 2, 3]) {
      const game = new Game(getLevel(id), { seed });
      const result = autoPlay(game, { useContinue: false });
      assert.equal(result.won, true, `level ${id} seed ${seed} ended as ${result.phase}`);
      assert.ok(result.stars >= 1, `level ${id} seed ${seed} scored no star`);
      assert.equal(game.moves, 0, 'the reef party spends the leftover moves');
    }
  }
});

test('one level from each area is winnable with the free continue', () => {
  for (const id of [6, 17, 28, 39]) {
    const game = new Game(getLevel(id), { seed: 4 });
    const result = autoPlay(game, { useContinue: true });
    assert.equal(result.won, true, `level ${id} ended as ${result.phase}`);
  }
});

test('a played-out level keeps its board legal the whole way through', () => {
  const game = new Game(getLevel(9), { seed: 11 });
  let turns = 0;
  while (game.phase === 'input' && turns++ < 40) {
    if (game.pendingShuffle) game.doShuffle();
    const move = pickMove(game);
    if (!move) { game.doShuffle(); continue; }
    game.swap(move.a, move.b);
    resolveAll(game);
    const board = game.board;
    assert.ok(board.playableIndices().every((i) => board.at(i)), `gap after turn ${turns}`);
    assert.equal(board.cells.filter((c, i) => c && !board.mask[i]).length, 0, 'a jelly ended up in a hole');
    assert.ok(game.moves >= 0);
  }
  assert.ok(turns > 1);
});

test('the last level is reachable and finishes', () => {
  const game = new Game(getLevel(LEVEL_COUNT), { seed: 2 });
  const result = autoPlay(game, { useContinue: true });
  assert.ok(['won', 'lost'].includes(result.phase));
  assert.ok(result.score > 0);
});

// A casual player: half the time the best move, otherwise any legal swap.
// Uses the free continue like a real player would.
function casualWins(id, deals) {
  let wins = 0;
  for (let seed = 1; seed <= deals; seed++) {
    const game = new Game(getLevel(id), { seed });
    const rng = new Rng(seed * 7919 + id);
    for (let turns = 0; turns < 300; turns++) {
      if (game.phase === 'outOfMoves' && !game.useContinue()) game.giveUp();
      if (game.phase === 'won' || game.phase === 'lost') break;
      if (game.pendingShuffle) game.doShuffle();
      if (game.phase !== 'input') { resolveAll(game); continue; }
      const moves = findMoves(game.board);
      if (!moves.length) { game.doShuffle(); continue; }
      const move = rng.next() < 0.5 ? pickMove(game) : moves[rng.int(moves.length)];
      if (!game.swap(move.a, move.b).ok) break;
      resolveAll(game);
    }
    if (game.phase === 'won') wins++;
  }
  return wins;
}

test('Kelp Cascade is no harder for a casual player than the levels around it', () => {
  // Its sand used to sit in the very corners, which casual play rarely
  // clears: this player won 16 of these 40 deals. Now it wins 27.
  const wins = casualWins(21, 40);
  assert.ok(wins >= 22, `Kelp Cascade won ${wins} of 40 casual deals`);
});
