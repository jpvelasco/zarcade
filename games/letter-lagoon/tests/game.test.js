import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Round, starsFor, HINT_COST, BONUS_COINS, FINISH_COINS, STAR_COINS, FINISH_POINTS,
  POINTS_PER_LETTER, BONUS_POINTS_PER_LETTER, FULL_WHEEL_MULTIPLIER, START_COINS,
} from '../src/game.js';
import { getLevel, buildLevel } from '../src/levels.js';
import { cellsOf } from '../src/crossword.js';

const level = getLevel(10); // east: tea, east, eats, teas, eat

test('a target word fills its cells and scores per letter', () => {
  const round = new Round(level);
  const res = round.submit('TEA');
  assert.equal(res.kind, 'target');
  assert.equal(res.points, 3 * POINTS_PER_LETTER);
  assert.equal(round.score, 30);
  const t = level.targets.find((x) => x.word === 'tea');
  for (const c of cellsOf(t)) assert.ok(round.isRevealed(c.row, c.col));
  assert.ok(res.gloss.length > 3);
  assert.equal(round.submit('tea').kind, 'repeat');
});

test('the full-wheel word scores double', () => {
  const round = new Round(level);
  const res = round.submit('east');
  assert.ok(res.full);
  assert.equal(res.points, 4 * POINTS_PER_LETTER * FULL_WHEEL_MULTIPLIER);
});

test('bonus words earn coins once; nonsense and short words do not', () => {
  const round = new Round(level);
  assert.ok(level.bonus.includes('sat'));
  const res = round.submit('sat');
  assert.equal(res.kind, 'bonus');
  assert.equal(round.coins, START_COINS + BONUS_COINS);
  assert.equal(round.score, 3 * BONUS_POINTS_PER_LETTER);
  assert.equal(round.submit('sat').kind, 'repeat-bonus');
  assert.equal(round.coins, START_COINS + BONUS_COINS);
  assert.equal(round.submit('tse').kind, 'unknown');
  assert.equal(round.submit('at').kind, 'short');
  assert.equal(round.submit('zebra').kind, 'letters');
  assert.equal(round.misses, 1);
});

test('hints reveal the first hidden letter of the shortest open word and cost coins', () => {
  const round = new Round(level, { coins: HINT_COST * 2 });
  const expect = round.nextHintCell();
  const shortest = Math.min(...level.targets.map((t) => t.word.length));
  assert.equal(expect.word.length, shortest);
  const t = level.targets[expect.index];
  assert.deepEqual([expect.row, expect.col], [t.row, t.col], 'starts at the first letter');
  const res = round.hint();
  assert.ok(res.ok);
  assert.ok(round.isRevealed(expect.row, expect.col));
  assert.equal(round.coins, HINT_COST);
  assert.equal(round.hints, 1);
  const second = round.hint();
  assert.ok(second.ok);
  assert.notDeepEqual([second.cell.row, second.cell.col], [expect.row, expect.col]);
  const broke = round.hint();
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, 'coins');
  assert.equal(round.canHint(), false);
});

test('hints that uncover a whole word complete it', () => {
  const round = new Round(level, { coins: 999 });
  const word = round.nextHintCell().word;
  let completed = [];
  for (let i = 0; i < word.length && !completed.length; i++) {
    const res = round.hint();
    completed = res.alsoFound;
  }
  assert.ok(round.found.has(word));
  assert.ok(!round.typed.has(word), 'revealed, not typed');
});

test('relax mode hints are free and there are no stars', () => {
  const round = new Round(level, { relax: true, coins: 0 });
  assert.ok(round.canHint());
  assert.ok(round.hint().ok);
  assert.equal(round.coins, 0);
  for (const t of level.targets) round.submit(t.word);
  assert.ok(round.complete);
  assert.equal(round.stars(), 0);
});

test('stars come from hints used', () => {
  assert.equal(starsFor(0), 3);
  assert.equal(starsFor(1), 2);
  assert.equal(starsFor(2), 2);
  assert.equal(starsFor(3), 1);
  assert.equal(starsFor(20), 1);
});

test('finishing awards points and coins exactly once', () => {
  const round = new Round(level, { coins: 0 });
  let finish = null;
  for (const t of level.targets) {
    const res = round.submit(t.word);
    if (res.finish) finish = res.finish;
  }
  assert.ok(round.complete && round.finished);
  assert.equal(finish.stars, 3);
  assert.equal(finish.coins, FINISH_COINS + 3 * STAR_COINS);
  assert.equal(round.coins, FINISH_COINS + 3 * STAR_COINS);
  const total = level.targets.reduce((n, t) => n + t.word.length * POINTS_PER_LETTER * (t.word.length === 4 ? 2 : 1), 0);
  assert.equal(round.score, total + FINISH_POINTS);
  assert.equal(round.submit('sat').kind, 'done');
  assert.equal(round.hint().ok, false);
});

test('shuffle keeps the letters and changes the order', () => {
  const round = new Round(getLevel(60));
  const before = round.wheel.join('');
  const after = round.shuffle().join('');
  assert.notEqual(after, before);
  assert.deepEqual([...after].sort(), [...before].sort());
  const again = new Round(getLevel(60));
  assert.equal(again.shuffle().join(''), after, 'shuffles are seeded');
});

test('a three-letter level works end to end', () => {
  const round = new Round(buildLevel('ate', { seed: 1, id: 1 }));
  for (const word of ['eat', 'tea', 'ate']) assert.equal(round.submit(word).kind, 'target');
  assert.ok(round.complete);
  assert.equal(round.rescued(), 3);
});
