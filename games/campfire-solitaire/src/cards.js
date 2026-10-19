// Cards are integers 0..51: rank = id % 13 (0 = Ace … 12 = King), suit =
// floor(id / 13). DOM-free so the rules, solver and tests share it.

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAMES = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King'];

export const rankOf = (card) => card % 13;
export const suitOf = (card) => Math.floor(card / 13);
export const isRed = (card) => suitOf(card) === 1 || suitOf(card) === 2;
export const cardLabel = (card) => `${RANK_LABELS[rankOf(card)]}${SUIT_SYMBOLS[suitOf(card)]}`;
export const cardName = (card) => `${RANK_NAMES[rankOf(card)]} of ${SUITS[suitOf(card)]}`;

// One rank apart, with King and Ace touching, so a run never dead-ends.
export function ranksTouch(a, b) {
  const d = (a - b + 13) % 13;
  return d === 1 || d === 12;
}

export const cardsTouch = (a, b) => ranksTouch(rankOf(a), rankOf(b));

export function freshDeck() {
  return Array.from({ length: 52 }, (_, i) => i);
}
