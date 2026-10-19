// One round of Campfire Solitaire: a seeded deal into a layout, plays onto
// the waste, draws from the stock, unlimited undo, streak scoring and
// bonuses. DOM-free: the renderer and audio read `events`, never the reverse.
import { Rng } from './rng.js';
import { freshDeck, rankOf, ranksTouch } from './cards.js';

export const SCORING = {
  card: 50, // × the card's place in the streak: 50, 100, 150 …
  peak: 500, // clearing a peak card
  clear: 1000, // clearing the whole layout
  stockLeft: 100, // per card still in the stock at the clear
  solo: 1000, // finishing without undo or hints
  undo: 50, // each undo costs this much
};

// Deal order: layout slots in reading order, then one waste card, then the
// stock in draw order. Unused cards stay in the box.
export function dealCards(layout, seed, stockSize) {
  const deck = new Rng(seed).shuffle(freshDeck());
  const n = layout.count;
  const size = Math.max(0, Math.min(stockSize, 51 - n));
  return { tableau: deck.slice(0, n), waste: deck[n], stock: deck.slice(n + 1, n + 1 + size) };
}

export class Round {
  constructor({ layout, seed, stockSize }) {
    this.layout = layout;
    this.seed = seed >>> 0;
    const deal = dealCards(layout, this.seed, stockSize);
    this.stockSize = deal.stock.length;
    this.cards = deal.tableau; // card id per slot
    this.mask = 0; // bit i set once slot i is cleared
    this.full = layout.count >= 31 ? -1 : (1 << layout.count) - 1;
    this.stock = deal.stock; // draw order
    this.drawn = 0;
    this.waste = [deal.waste]; // top is last
    this.base = 0; // card and peak points (undo restores it)
    this.undos = 0;
    this.hints = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.peaksCleared = 0;
    this.moves = 0;
    this.history = [];
    this.status = 'play'; // play | stuck | won
    this.bonus = null; // { clear, stock, solo, total } once won
    this.events = [];
  }

  get top() {
    return this.waste[this.waste.length - 1];
  }

  get stockLeft() {
    return this.stock.length - this.drawn;
  }

  get cleared() {
    let n = 0;
    for (let m = this.mask; m; m &= m - 1) n++;
    return n;
  }

  get remaining() {
    return this.layout.count - this.cleared;
  }

  get undoCost() {
    return this.undos * SCORING.undo;
  }

  get score() {
    return Math.max(0, this.base - this.undoCost) + (this.bonus ? this.bonus.total : 0);
  }

  get solo() {
    return this.undos === 0 && this.hints === 0;
  }

  isCleared(i) {
    return ((this.mask >> i) & 1) === 1;
  }

  // Face up once every card lying over it has been cleared.
  isFaceUp(i) {
    if (this.isCleared(i)) return false;
    const cover = this.layout.coverMask[i];
    return (this.mask & cover) === cover;
  }

  canPlay(i) {
    return this.status === 'play' && i >= 0 && i < this.layout.count && this.isFaceUp(i) && ranksTouch(rankOf(this.cards[i]), rankOf(this.top));
  }

  playable() {
    const out = [];
    for (let i = 0; i < this.layout.count; i++) if (this.canPlay(i)) out.push(i);
    return out;
  }

  canDraw() {
    return this.status === 'play' && this.stockLeft > 0;
  }

  canUndo() {
    return this.status !== 'won' && this.history.length > 0;
  }

  snapshot(type, extra) {
    return { type, streak: this.streak, maxStreak: this.maxStreak, base: this.base, peaksCleared: this.peaksCleared, ...extra };
  }

  play(i) {
    if (!this.canPlay(i)) {
      this.events.push({ type: 'nope', slot: i });
      return false;
    }
    const card = this.cards[i];
    this.history.push(this.snapshot('play', { slot: i }));
    this.mask |= 1 << i;
    this.waste.push(card);
    this.streak++;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    const points = SCORING.card * this.streak;
    this.base += points;
    const peak = this.layout.slots[i].peak;
    if (peak) {
      this.base += SCORING.peak;
      this.peaksCleared++;
    }
    const flipped = this.layout.covers[i].filter((j) => this.isFaceUp(j));
    this.moves++;
    this.events.push({ type: 'play', slot: i, card, streak: this.streak, points, peak, flipped });
    this.settle();
    return true;
  }

  draw() {
    if (!this.canDraw()) return false;
    const broke = this.streak;
    this.history.push(this.snapshot('draw'));
    const card = this.stock[this.drawn++];
    this.waste.push(card);
    this.streak = 0;
    this.moves++;
    this.events.push({ type: 'draw', card, broke });
    this.settle();
    return true;
  }

  undo() {
    if (!this.canUndo()) return false;
    const h = this.history.pop();
    const card = this.waste.pop();
    if (h.type === 'play') this.mask &= ~(1 << h.slot);
    else this.drawn--;
    this.streak = h.streak;
    this.maxStreak = h.maxStreak;
    this.base = h.base;
    this.peaksCleared = h.peaksCleared;
    this.undos++;
    this.status = 'play';
    this.events.push({ type: 'undo', move: h.type, slot: h.slot, card });
    return true;
  }

  // The hint button reports here, so the solo bonus and star know about it.
  noteHint() {
    this.hints++;
  }

  settle() {
    if (this.mask === this.full) {
      this.status = 'won';
      const solo = this.solo ? SCORING.solo : 0;
      const stock = this.stockLeft * SCORING.stockLeft;
      this.bonus = { clear: SCORING.clear, stock, solo, total: SCORING.clear + stock + solo };
      this.events.push({ type: 'win', score: this.score });
    } else if (this.stockLeft === 0 && this.playable().length === 0) {
      this.status = 'stuck';
      this.events.push({ type: 'stuck', remaining: this.remaining });
    }
  }

  // The plain position the solver searches from.
  position() {
    return { layout: this.layout, cards: this.cards, mask: this.mask, stock: this.stock, drawn: this.drawn, top: rankOf(this.top) };
  }
}

// Stars: clear the camp, reach the streak goal, finish without undo or hints.
export function starGoals(round, streakGoal) {
  const won = round.status === 'won';
  return [won, won && round.maxStreak >= streakGoal, won && round.solo];
}

export const starCount = (goals) => goals.filter(Boolean).length;
