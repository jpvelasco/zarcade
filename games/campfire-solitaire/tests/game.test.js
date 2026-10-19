import test from 'node:test';
import assert from 'node:assert/strict';
import { Round, SCORING, dealCards, starGoals, starCount } from '../src/game.js';
import { layoutById, LAYOUTS } from '../src/layouts.js';
import { ranksTouch, rankOf, cardLabel, cardName, isRed } from '../src/cards.js';

const peaks = layoutById('peaks');

// A round with chosen cards: `tableau` per slot, a waste card and a stock.
function rigged(layout, tableau, waste, stock) {
  const r = new Round({ layout, seed: 1, stockSize: stock.length });
  r.cards = tableau.slice();
  r.waste = [waste];
  r.stock = stock.slice();
  r.stockSize = stock.length;
  return r;
}

test('ranks touch one apart, and King and Ace wrap', () => {
  assert.ok(ranksTouch(0, 1));
  assert.ok(ranksTouch(5, 4));
  assert.ok(ranksTouch(12, 0), 'K on A');
  assert.ok(ranksTouch(0, 12), 'A on K');
  assert.ok(!ranksTouch(3, 3));
  assert.ok(!ranksTouch(3, 5));
  assert.equal(cardLabel(12), 'K♠');
  assert.equal(cardLabel(13), 'A♥');
  assert.equal(cardName(51), 'King of clubs');
  assert.ok(isRed(13) && isRed(26) && !isRed(0) && !isRed(39));
});

test('a deal is deterministic from its seed and uses each card once', () => {
  const a = dealCards(peaks, 1234, 24);
  const b = dealCards(peaks, 1234, 24);
  assert.deepEqual(a, b);
  const c = dealCards(peaks, 1235, 24);
  assert.notDeepEqual(a.tableau, c.tableau);
  const all = [...a.tableau, a.waste, ...a.stock];
  assert.equal(new Set(all).size, all.length);
  assert.equal(a.stock.length, 24);
  assert.equal(dealCards(peaks, 1, 99).stock.length, 51 - peaks.count, 'stock is capped by the deck');
});

test('only uncovered cards are face up, and they turn over as covers clear', () => {
  const r = new Round({ layout: peaks, seed: 7, stockSize: 24 });
  for (let i = 0; i < peaks.count; i++) assert.equal(r.isFaceUp(i), peaks.coveredBy[i].length === 0);
  // Clear both covers of the first card in row 3 by force: it flips.
  const target = peaks.slots.findIndex((s) => s.y === 2);
  for (const j of peaks.coveredBy[target]) r.mask |= 1 << j;
  assert.ok(r.isFaceUp(target));
});

test('playing scores a growing streak, a draw ends it, and peaks pay a bonus', () => {
  // Row 3 of Three Peaks is slots 16..23; give them a run 2,3,4… on an Ace.
  const tableau = Array(peaks.count).fill(0).map((_, i) => 13 * 3 + (i % 13));
  for (let k = 0; k < 8; k++) tableau[16 + k] = 13 + 1 + k; // 2♥ … 9♥
  const r = rigged(peaks, tableau, 0, [5, 6, 7]);
  assert.ok(r.canPlay(16));
  assert.ok(!r.canPlay(17), '3 does not touch an Ace');
  assert.ok(r.play(16));
  assert.ok(r.play(17));
  assert.ok(r.play(18));
  assert.equal(r.streak, 3);
  assert.equal(r.base, SCORING.card * (1 + 2 + 3));
  const ev = r.events.filter((e) => e.type === 'play');
  assert.deepEqual(ev.map((e) => e.points), [50, 100, 150]);
  assert.ok(r.draw());
  assert.equal(r.streak, 0);
  assert.equal(r.maxStreak, 3);
  assert.equal(r.events.at(-1).broke, 3);
  // Not playable: a no-op with a "nope" event.
  assert.equal(r.play(0), false);
  assert.equal(r.events.at(-1).type, 'nope');
});

test('clearing a peak pays the peak bonus', () => {
  const tiny = layoutById('canoe');
  const r = new Round({ layout: tiny, seed: 3, stockSize: 10 });
  const peak = tiny.peaks[0];
  for (let i = 0; i < tiny.count; i++) if (i !== peak) r.mask |= 1 << i;
  r.cards[peak] = 1; // a 2
  r.waste = [0]; // on an Ace
  const before = r.base;
  r.play(peak);
  assert.equal(r.base - before, SCORING.card + SCORING.peak);
  assert.equal(r.peaksCleared, 1);
});

test('undo restores the board, waste, streak and score, and each undo costs points', () => {
  const r = new Round({ layout: peaks, seed: 42, stockSize: 24 });
  const start = { mask: r.mask, waste: r.waste.slice(), drawn: r.drawn };
  r.draw();
  const move = r.playable()[0];
  if (move !== undefined) r.play(move);
  const scoreBefore = r.base;
  while (r.canUndo()) r.undo();
  assert.equal(r.mask, start.mask);
  assert.deepEqual(r.waste, start.waste);
  assert.equal(r.drawn, start.drawn);
  assert.equal(r.base, 0);
  assert.ok(scoreBefore >= 0);
  assert.equal(r.undoCost, r.undos * SCORING.undo);
  assert.equal(r.score, 0, 'score never goes below zero');
  assert.ok(!r.solo);
  assert.equal(r.events.filter((e) => e.type === 'undo').length, r.undos);
});

test('winning adds the clear, stock and solo bonuses and locks undo', () => {
  const r = new Round({ layout: peaks, seed: 9, stockSize: 24 });
  // Clear everything but one face-up card, then play it.
  const last = peaks.count - 1;
  r.mask = ((1 << peaks.count) - 1) & ~(1 << last);
  r.cards[last] = 4;
  r.waste = [3];
  assert.ok(r.play(last));
  assert.equal(r.status, 'won');
  assert.equal(r.bonus.clear, SCORING.clear);
  assert.equal(r.bonus.stock, 24 * SCORING.stockLeft);
  assert.equal(r.bonus.solo, SCORING.solo);
  assert.equal(r.score, r.base + r.bonus.total);
  assert.ok(!r.canUndo(), 'a win is final');
  assert.ok(!r.draw());
  assert.deepEqual(starGoals(r, 1), [true, true, true]);
  assert.deepEqual(starGoals(r, 2), [true, false, true]);
  assert.equal(starCount(starGoals(r, 2)), 2);
});

test('hints and undos cost the solo bonus and star', () => {
  const r = new Round({ layout: peaks, seed: 9, stockSize: 24 });
  r.noteHint();
  const last = peaks.count - 1;
  r.mask = ((1 << peaks.count) - 1) & ~(1 << last);
  r.cards[last] = 4;
  r.waste = [3];
  r.play(last);
  assert.equal(r.bonus.solo, 0);
  assert.deepEqual(starGoals(r, 1), [true, true, false]);
});

test('an empty stock with no plays is stuck, and undo gets you out', () => {
  const tableau = Array(peaks.count).fill(13 * 2 + 6); // all 7s
  const r = rigged(peaks, tableau, 0, [1]); // Ace on the waste, a 2 in the stock
  assert.equal(r.status, 'play');
  r.draw();
  assert.equal(r.status, 'stuck');
  assert.equal(r.events.at(-1).type, 'stuck');
  assert.equal(r.events.at(-1).remaining, peaks.count);
  assert.ok(r.undo());
  assert.equal(r.status, 'play');
  assert.equal(r.stockLeft, 1);
});

test('the first play events list cards that flip face up', () => {
  for (const layout of LAYOUTS) {
    const r = new Round({ layout, seed: 5, stockSize: 20 });
    let guard = 0;
    while (r.status === 'play' && guard++ < 200) {
      const p = r.playable();
      if (p.length) {
        const i = p[0];
        r.play(i);
        const ev = r.events.at(-1).type === 'play' ? r.events.at(-1) : r.events.at(-2);
        for (const j of ev.flipped) assert.ok(r.isFaceUp(j), `${layout.id}: ${j} flipped`);
      } else if (!r.draw()) break;
    }
    assert.ok(r.status !== 'play', `${layout.id} round ended`);
    assert.equal(rankOf(r.top) >= 0, true);
  }
});
