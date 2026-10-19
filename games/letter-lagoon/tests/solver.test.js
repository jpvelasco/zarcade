import test from 'node:test';
import assert from 'node:assert/strict';
import { getLevel, LEVEL_COUNT } from '../src/levels.js';
import { Round } from '../src/game.js';
import { solve, nextGuess, candidateWords } from '../src/solver.js';

test('the solver clears every level using only the wheel letters', () => {
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    const level = getLevel(id);
    const round = new Round(level);
    const { complete, tried } = solve(round);
    assert.ok(complete, `level ${id} (${level.base})`);
    assert.equal(round.hints, 0);
    assert.equal(round.stars(), 3);
    assert.ok(tried.every((t) => t.result !== 'letters'), 'never types letters off the wheel');
  }
});

test('candidate words never need missing letters', () => {
  const level = getLevel(77);
  const words = candidateWords(level.letters);
  for (const t of level.targets) assert.ok(words.includes(t.word), t.word);
});

test('nextGuess is a pure peek that steers toward open slots', () => {
  const round = new Round(getLevel(40));
  const tried = new Set();
  let guesses = 0;
  while (!round.complete && guesses < 200) {
    const word = nextGuess(round, tried);
    assert.ok(word, 'always has something to try');
    tried.add(word);
    round.submit(word);
    guesses++;
  }
  assert.ok(round.complete);
});
