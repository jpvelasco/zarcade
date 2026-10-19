// A solver that plays a level the way a player would: it only sees the wheel
// letters, tries every dictionary word it can spell (longest first) and
// stops when the board is full. Used by the tests and the ?autoplay demo.
import { spellable } from './words.js';

// The words to try for a wheel, in order.
export function candidateWords(letters) {
  return spellable(letters.join ? letters.join('') : letters);
}

// Plays `round` to completion. Returns what it typed and whether it won.
export function solve(round, { maxTries = Infinity } = {}) {
  const tried = [];
  for (const word of candidateWords(round.level.letters)) {
    if (round.complete || tried.length >= maxTries) break;
    tried.push({ word, result: round.submit(word).kind });
  }
  return { complete: round.complete, tried };
}

// The next word the solver would type: a word whose length matches an
// unfinished slot on the board, skipping anything already found or tried.
// Pure, for the ?autoplay demo: it does not change the round.
export function nextGuess(round, tried = new Set()) {
  const lengths = new Set(round.remaining.map((t) => t.word.length));
  for (const word of candidateWords(round.level.letters)) {
    if (!lengths.has(word.length)) continue;
    if (round.found.has(word) || round.bonusFound.has(word) || tried.has(word)) continue;
    return word;
  }
  return null;
}
