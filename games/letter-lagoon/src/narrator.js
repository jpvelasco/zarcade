// Pinch the crab's lines. DOM-free: the page asks for a line for an event and
// gets a friendly, rotating answer.
export const NARRATOR = 'Pinch';

export const LINES = {
  start: [
    'Ahoy! Swipe the bubbles to spell a word.',
    'These critters are stuck in bubbles. Let\'s spell them free!',
    'Ready, friend? Let\'s find some words!',
    'Snip snap! Another puzzle to crack.',
    'Look at the empty boxes. How long is each word?',
  ],
  found: [
    'Splendid!', 'You did it!', 'Clawsome!', 'Shell yes!', 'Super speller!', 'Fin-tastic!',
    'Wave hello to a new friend!', 'Bubble popped!', 'Great word!', 'Wow, you are quick!',
  ],
  full: [
    'You used every letter! Amazing!',
    'The whole wheel! I\'m doing a happy sideways dance!',
  ],
  bonus: [
    'A bonus word! Here are some coins.',
    'Ooh, a secret word! Coins for you.',
    'That one\'s not on the board, but it\'s a real word!',
    'Bonus! Your treasure chest is jingling.',
  ],
  repeat: [
    'You already found that one!',
    'That word is already on the board.',
    'Good word, but we have it already!',
  ],
  unknown: [
    'Hmm, I don\'t know that word. Try another!',
    'Not quite. Keep trying, you\'ve got this!',
    'Close! Try mixing the letters around.',
    'Bubbles! That one didn\'t work. Try again.',
  ],
  short: [
    'Words need at least three letters.',
  ],
  hint: [
    'Here\'s a peek!',
    'Psst... that letter goes there.',
    'A little clue from your crab pal.',
  ],
  nocoins: [
    'Out of coins! Find bonus words to earn more.',
  ],
  shuffle: [
    'Swirl! New letter spots.',
    'Shuffled! Does that help?',
  ],
  stuck: [
    'Try tapping Shuffle to see the letters in a new way.',
    'Look for small words first, like three letters.',
    'Need help? The light bulb shows a letter.',
  ],
  win: [
    'Hooray! Every critter is free!',
    'You rescued them all! The reef is so happy.',
    'Brilliant! Off to the aquarium they go!',
  ],
};

export function line(event, n = 0) {
  const list = LINES[event] || LINES.found;
  return list[((n % list.length) + list.length) % list.length];
}

// Keeps a counter per event so lines rotate instead of repeating.
export class Narrator {
  constructor(seed = 0) {
    this.counts = {};
    this.seed = seed;
  }

  say(event) {
    const n = (this.counts[event] = (this.counts[event] ?? this.seed) + 1);
    return line(event, n);
  }
}
