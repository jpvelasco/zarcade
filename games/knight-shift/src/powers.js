// Power Squares: where the glowing squares go and what each power does.
// Placement is seeded, and mirrored so both sides have the same chances.
import { POWER_SHIELD, POWER_SWAP, POWER_LEAP, square, sqName } from './chess.js';
import { makeRng } from './rng.js';

export const POWERS = {
  [POWER_SHIELD]: { id: 'shield', name: 'Shield', color: '#5ec8ff', blurb: 'Use your turn to protect one piece: it can\'t be captured on the next move.' },
  [POWER_SWAP]: { id: 'swap', name: 'Swap', color: '#ffb84a', blurb: 'Use your turn to make two of your pieces trade places (not the king).' },
  [POWER_LEAP]: { id: 'leap', name: 'Leap', color: '#b77bff', blurb: 'One piece (not the king) jumps like a knight this turn.' },
};

// Three pairs of squares, one pair per power: one square on White's half
// (ranks 3-4) and its mirror on Black's half (ranks 6-5), same file.
export function placePowers(seed) {
  const rng = makeRng(seed);
  const used = new Set();
  const squares = [];
  for (const type of [POWER_SHIELD, POWER_SWAP, POWER_LEAP]) {
    let file, rank, tries = 0;
    do {
      file = Math.floor(rng() * 8);
      rank = 2 + Math.floor(rng() * 2);
      tries++;
    } while (used.has(file) && tries < 50);
    used.add(file);
    squares.push([sqName(square(file, rank)), type]);
    squares.push([sqName(square(file, 7 - rank)), type]);
  }
  return { squares };
}
