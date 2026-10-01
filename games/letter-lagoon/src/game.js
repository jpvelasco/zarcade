// One level in progress: found words, bonus words, hints, score and coins.
// DOM-free; the page calls submit(), hint() and shuffle() and draws the state.
import { Rng, hashSeed } from './rng.js';
import { WORDS, MIN_LEN, canSpell, normalize, glossFor } from './words.js';
import { cellsOf } from './crossword.js';

export const POINTS_PER_LETTER = 10;
export const BONUS_POINTS_PER_LETTER = 5;
export const FULL_WHEEL_MULTIPLIER = 2;
export const FINISH_POINTS = 50;
export const HINT_COST = 15;
export const BONUS_COINS = 2;
export const FINISH_COINS = 10;
export const STAR_COINS = 2;
export const START_COINS = 45;

const cellKey = (row, col) => `${row},${col}`;

// Stars depend only on how many letters were revealed with hints.
export function starsFor(hints) {
  if (hints <= 0) return 3;
  if (hints <= 2) return 2;
  return 1;
}

export class Round {
  constructor(level, { relax = false, coins = START_COINS, seed = 1 } = {}) {
    this.level = level;
    this.relax = relax;
    this.coins = coins;
    this.wheel = level.letters.slice();
    this.rng = new Rng(hashSeed(seed, level.seed));
    this.found = new Set();       // target words solved (typed or revealed)
    this.typed = new Set();       // target words the player actually spelled
    this.bonusFound = new Set();
    this.revealed = new Set();    // board cells showing a letter
    this.hints = 0;
    this.score = 0;
    this.coinsEarned = 0;
    this.misses = 0;
    this.streak = 0;
    this.finished = false;
    this.finishAwarded = false;
    this.cellOwners = new Map();  // cell -> [target index...]
    level.targets.forEach((t, i) => {
      for (const c of cellsOf(t)) {
        const k = cellKey(c.row, c.col);
        if (!this.cellOwners.has(k)) this.cellOwners.set(k, []);
        this.cellOwners.get(k).push(i);
      }
    });
  }

  get targets() { return this.level.targets; }
  get remaining() { return this.targets.filter((t) => !this.found.has(t.word)); }
  get complete() { return this.found.size === this.targets.length; }

  isRevealed(row, col) { return this.revealed.has(cellKey(row, col)); }

  // Words whose every cell is now showing count as found ("revealed").
  sweep() {
    const completed = [];
    for (const t of this.targets) {
      if (this.found.has(t.word)) continue;
      if (cellsOf(t).every((c) => this.revealed.has(cellKey(c.row, c.col)))) {
        this.found.add(t.word);
        completed.push(t.word);
      }
    }
    return completed;
  }

  submit(input) {
    const word = normalize(input);
    if (this.finished) return { kind: 'done', word };
    if (word.length < MIN_LEN) return { kind: 'short', word };
    if (!canSpell(word, this.level.letters)) return { kind: 'letters', word };
    const index = this.targets.findIndex((t) => t.word === word);
    if (index >= 0) {
      if (this.found.has(word)) return { kind: 'repeat', word, index };
      const target = this.targets[index];
      this.found.add(word);
      this.typed.add(word);
      const newCells = [];
      for (const c of cellsOf(target)) {
        const k = cellKey(c.row, c.col);
        if (!this.revealed.has(k)) newCells.push(c);
        this.revealed.add(k);
      }
      // Using the whole wheel is special once the wheel has four or more letters.
      const full = word.length === this.level.letters.length && word.length >= 4;
      const points = word.length * POINTS_PER_LETTER * (full ? FULL_WHEEL_MULTIPLIER : 1);
      this.score += points;
      this.streak++;
      const alsoFound = this.sweep();
      const finish = this.checkFinish();
      return { kind: 'target', word, index, target, gloss: target.gloss || glossFor(word), points, full, newCells, alsoFound, finish };
    }
    if (WORDS.has(word)) {
      if (this.bonusFound.has(word)) return { kind: 'repeat-bonus', word };
      this.bonusFound.add(word);
      const points = word.length * BONUS_POINTS_PER_LETTER;
      this.score += points;
      this.coins += BONUS_COINS;
      this.coinsEarned += BONUS_COINS;
      return { kind: 'bonus', word, points, coins: BONUS_COINS, gloss: glossFor(word) };
    }
    this.misses++;
    this.streak = 0;
    return { kind: 'unknown', word };
  }

  hintCost() {
    return this.relax ? 0 : HINT_COST;
  }

  canHint() {
    return !this.finished && this.coins >= this.hintCost() && this.nextHintCell() !== null;
  }

  // The cell a hint would reveal: the first hidden letter of the shortest
  // unfinished word (ties go to the top-left word), so hints help a child
  // finish one word at a time.
  nextHintCell() {
    const open = this.targets
      .map((t, index) => ({ t, index, hidden: cellsOf(t).filter((c) => !this.revealed.has(cellKey(c.row, c.col))) }))
      .filter((x) => !this.found.has(x.t.word) && x.hidden.length);
    if (!open.length) return null;
    open.sort((a, b) => a.t.word.length - b.t.word.length || a.hidden.length - b.hidden.length || a.index - b.index);
    const pick = open[0];
    return { ...pick.hidden[0], word: pick.t.word, index: pick.index };
  }

  hint() {
    if (this.finished) return { ok: false, reason: 'done' };
    const cell = this.nextHintCell();
    if (!cell) return { ok: false, reason: 'none' };
    const cost = this.hintCost();
    if (this.coins < cost) return { ok: false, reason: 'coins', cost };
    this.coins -= cost;
    this.hints++;
    this.revealed.add(cellKey(cell.row, cell.col));
    const alsoFound = this.sweep();
    const finish = this.checkFinish();
    return { ok: true, cell, cost, alsoFound, finish };
  }

  // A new wheel order that differs from the current one when possible.
  shuffle() {
    const before = this.wheel.join('');
    for (let tries = 0; tries < 12; tries++) {
      this.rng.shuffle(this.wheel);
      if (this.wheel.join('') !== before) break;
    }
    return this.wheel.slice();
  }

  stars() {
    return this.relax ? 0 : starsFor(this.hints);
  }

  checkFinish() {
    if (!this.complete || this.finishAwarded) return null;
    this.finishAwarded = true;
    this.finished = true;
    this.score += FINISH_POINTS;
    const stars = this.stars();
    const coins = FINISH_COINS + stars * STAR_COINS;
    this.coins += coins;
    this.coinsEarned += coins;
    return { stars, coins, score: this.score };
  }

  // Critters rescued so far: one per solved target.
  rescued() {
    return this.found.size;
  }
}
