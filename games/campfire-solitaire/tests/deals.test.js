import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, LEVEL_COUNT, SECTIONS, LEVELS_PER_SECTION, levelDeal, dailyDeal, quickDeal, roundFor,
  dateKey, parseDateKey, dayNumber, findWinnableDeal, DEAL_BUDGET,
} from '../src/deals.js';
import { solve, DRAW } from '../src/solver.js';
import { LAYOUTS, LAYOUT_IDS, layoutById } from '../src/layouts.js';

function playLine(deal, line) {
  const round = roundFor(deal);
  for (const m of line) assert.ok(m === DRAW ? round.draw() : round.play(m));
  return round;
}

test('the trail has three sections of eight levels using every layout', () => {
  assert.equal(SECTIONS.length, 3);
  assert.equal(LEVEL_COUNT, SECTIONS.length * LEVELS_PER_SECTION);
  assert.deepEqual([...new Set(LEVELS.map((l) => l.layoutId))].sort(), [...LAYOUT_IDS].sort());
  for (const lv of LEVELS) {
    assert.ok(LAYOUT_IDS.includes(lv.layoutId));
    assert.ok(lv.stock >= 16 && lv.stock <= 51 - layoutById(lv.layoutId).count);
  }
});

test('every trail level deals a solver-verified winnable deal', () => {
  for (const lv of LEVELS) {
    const deal = levelDeal(lv.index);
    assert.ok(deal.verified, `level ${lv.index + 1} is verified`);
    const res = solve(roundFor(deal).position(), { budget: DEAL_BUDGET });
    assert.equal(res.result, 'win', `level ${lv.index + 1} wins`);
    assert.equal(playLine(deal, res.line).status, 'won');
    assert.ok(deal.streakGoal >= 2 && deal.streakGoal <= Math.max(2, deal.lineStreak), `level ${lv.index + 1} goal is reachable`);
  }
});

test('level deals are deterministic and cached', () => {
  const a = levelDeal(3);
  assert.equal(levelDeal(3), a);
  const fresh = findWinnableDeal(a.layout, LEVELS[3].baseSeed, LEVELS[3].stock);
  assert.equal(fresh.seed, a.seed);
  assert.deepEqual(roundFor(a).cards, roundFor(a).cards);
});

test('streak goals rise along the trail', () => {
  const first = LEVELS.slice(0, 8).map((l) => levelDeal(l.index).streakGoal);
  const last = LEVELS.slice(16).map((l) => levelDeal(l.index).streakGoal);
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(avg(last) > avg(first));
});

test('every Daily Deal for fifteen months is winnable, and it is the same all day', () => {
  const start = new Date(2026, 9, 1, 9);
  const layouts = new Set();
  let maxNodes = 0;
  for (let i = 0; i < 460; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const deal = dailyDeal(d);
    assert.ok(deal.verified, `daily ${deal.key} is verified`);
    assert.equal(deal.key, dateKey(d));
    layouts.add(deal.layout.id);
    maxNodes = Math.max(maxNodes, deal.nodes);
    if (i % 23 === 0) {
      const res = solve(roundFor(deal).position(), { budget: DEAL_BUDGET });
      assert.equal(playLine(deal, res.line).status, 'won', deal.key);
      const late = new Date(d);
      late.setHours(23, 59);
      assert.equal(dailyDeal(late).seed, deal.seed, 'same deal at night');
    }
  }
  assert.equal(layouts.size, LAYOUTS.length, 'the daily visits every layout');
  // Picking is a few solver budgets at most: quick enough for one frame.
  assert.ok(maxNodes < DEAL_BUDGET * 12, `worst daily pick took ${maxNodes} nodes`);
});

test('neighbouring days get different layouts and cards', () => {
  const a = dailyDeal(new Date(2026, 9, 9, 12));
  const b = dailyDeal(new Date(2026, 9, 10, 12));
  assert.notEqual(a.layout.id, b.layout.id);
  assert.notEqual(a.seed, b.seed);
});

test('date keys are local, round-trip, and reject nonsense', () => {
  const d = new Date(2026, 9, 9, 0, 5);
  assert.equal(dateKey(d), '2026-10-09');
  assert.equal(dateKey(parseDateKey('2026-10-09')), '2026-10-09');
  assert.equal(parseDateKey('2026-02-30'), null);
  assert.equal(parseDateKey('soon'), null);
  assert.equal(dayNumber(new Date(2026, 9, 10)) - dayNumber(new Date(2026, 9, 9)), 1);
  // DST change in March: still one day apart.
  assert.equal(dayNumber(new Date(2027, 2, 15)) - dayNumber(new Date(2027, 2, 14)), 1);
});

test('quick deals are verified winnable and stay on layouts already reached', () => {
  const early = new Set();
  for (let i = 0; i < 120; i++) {
    const seed = (i * 2654435761) >>> 0;
    const deal = quickDeal(seed, 0);
    assert.ok(deal.verified);
    early.add(deal.layout.id);
    const later = quickDeal(seed, LEVEL_COUNT - 1);
    assert.ok(later.verified);
  }
  assert.deepEqual([...early], [LEVELS[0].layoutId], 'a new camper only gets the first layout');
});
