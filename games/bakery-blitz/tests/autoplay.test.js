import test from 'node:test';
import assert from 'node:assert/strict';
import { PACE, chooseAction, doAction, playShift } from '../src/ai.js';
import { buildDay, DAY_COUNT, chapterOf, starsFor } from '../src/levels.js';
import { buildSpecialDay } from '../src/daily.js';
import { effects } from '../src/upgrades.js';
import { Shift } from '../src/sim.js';

// What a player plausibly owns by the time they reach each chapter, given how
// generously the days pay. The balance of the campaign is measured against it.
const KIT = {
  1: [],
  2: ['mix1', 'counter2'],
  3: ['mix1', 'counter2', 'mitts1', 'chairs'],
  4: ['mix1', 'counter2', 'mitts1', 'chairs', 'thermo', 'sprinkles', 'oven2'],
  5: ['mix1', 'mix2', 'counter2', 'counter3', 'mitts1', 'mitts2', 'chairs', 'thermo',
    'sprinkles', 'oven2', 'bowl2', 'jukebox', 'mouse'],
};

const kitFor = (id) => effects(KIT[chapterOf(id).id]);

function play(id, aps, over = {}) {
  const plan = buildDay(id, over);
  const out = playShift(plan, { effects: kitFor(id), aps });
  return { plan, ...out, stars: starsFor(plan, out.coins) };
}

test('the autoplayer finishes a day and leaves nothing half-baked', () => {
  const { shift, result, plan } = play(5, PACE.kid);
  assert.equal(shift.done, true);
  assert.ok(result.served > 0);
  assert.ok(shift.time <= plan.seconds + 14, `the day ran ${shift.time.toFixed(1)}s`);
  assert.equal(shift.active.length, 0, 'everybody went home');
  assert.ok(result.coins >= plan.stars[0]);
});

// The point of this one: a seven-year-old tapping about twice a second should
// walk away from the first chapters with every star.
test('a child\'s tapping pace three-stars the first twelve days', () => {
  for (let id = 1; id <= 12; id++) {
    const { stars, coins, plan, result } = play(id, PACE.kid);
    assert.equal(stars, 3, `day ${id} only scored ${stars} (${coins} of ${plan.stars.join('/')})`);
    assert.equal(result.missed, 0, `day ${id} lost ${result.missed} customers`);
  }
});

test('and still clears every single one of the forty-five days', () => {
  const stars = [];
  for (let id = 1; id <= DAY_COUNT; id++) {
    const out = play(id, PACE.kid);
    stars.push(out.stars);
    assert.ok(out.stars >= 1, `day ${id} scored nothing (${out.coins} of ${out.plan.stars.join('/')})`);
  }
  const average = stars.reduce((a, b) => a + b, 0) / stars.length;
  assert.ok(average > 2.2, `average of ${average.toFixed(2)} stars is too mean`);
  assert.ok(average < 2.95, `average of ${average.toFixed(2)} stars means nothing is a challenge`);
});

test('even a very slow player never ends a day with no stars at all', () => {
  for (let id = 1; id <= DAY_COUNT; id += 2) {
    const out = play(id, 1.2);
    assert.ok(out.stars >= 1, `day ${id} scored nothing at a crawl (${out.coins} of ${out.plan.stars[0]})`);
  }
});

test('the last chapter is tight at a child\'s pace and three stars at a practised one', () => {
  for (const id of [40, 43, 45]) {
    const kid = play(id, PACE.kid);
    const pro = play(id, PACE.pro);
    assert.ok(kid.stars >= 1 && kid.stars <= 2, `day ${id} gave a beginner ${kid.stars} stars`);
    assert.equal(pro.stars, 3, `day ${id} only gave a practised player ${pro.stars} stars`);
    assert.ok(pro.coins > kid.coins, `day ${id}: practice should pay`);
  }
});

test('the chapter four days ask for upgrades: the same pace does better with a better kitchen', () => {
  const plan = buildDay(34);
  const bare = playShift(plan, { effects: effects([]), aps: PACE.steady });
  const kitted = playShift(plan, { effects: effects(KIT[5]), aps: PACE.steady });
  assert.ok(kitted.coins > bare.coins * 1.2, `${bare.coins} bare vs ${kitted.coins} kitted`);
  assert.ok(starsFor(plan, bare.coins) < 3, 'a bare kitchen should not ace day 34');
  assert.equal(starsFor(plan, kitted.coins), 3);
});

test('the helping hand makes a hard day easier, never harder', () => {
  for (const id of [32, 44]) {
    const plain = play(id, 1.4);
    const helped = play(id, 1.4, { assist: true });
    assert.ok(helped.coins >= plain.coins, `day ${id}: ${plain.coins} plain vs ${helped.coins} helped`);
    assert.ok(helped.stars >= plain.stars);
  }
});

test('the autoplayer is deterministic', () => {
  const a = play(26, PACE.steady);
  const b = play(26, PACE.steady);
  assert.deepEqual(b.result, a.result);
});

test('it plays today\'s special shift too, whatever the special turns out to be', () => {
  for (const key of ['2026-01-01', '2026-05-17', '2026-09-30', '2026-12-25']) {
    for (const chapter of [1, 3, 5]) {
      const plan = buildSpecialDay(key, { chapter });
      const out = playShift(plan, { effects: effects(KIT[chapter]), aps: PACE.kid });
      assert.equal(out.shift.done, true, `${key} chapter ${chapter} never finished`);
      assert.ok(starsFor(plan, out.coins) >= 1, `${key} chapter ${chapter} scored ${out.coins} of ${plan.stars[0]}`);
      assert.ok(out.result.dishes.special > 0, `${key} chapter ${chapter} never made the special`);
    }
  }
});

test('nothing is ever left stuck in the kitchen when the day ends', () => {
  for (const id of [9, 27, 45]) {
    const { shift } = play(id, PACE.steady);
    assert.equal(shift.active.length, 0);
    for (const station of shift.stations) {
      assert.ok(!station.item || station.item.state !== 'work', `a ${station.kind} was mid-job at closing`);
    }
  }
});

test('an autopilot run makes no illegal move: every action it chooses is accepted', () => {
  const plan = buildDay(35);
  const shift = new Shift(plan, { effects: effects(KIT[4]) });
  let acted = 0;
  let budget = 1;
  const dt = 1 / 60;
  while (!shift.done && shift.time < plan.seconds + 14) {
    shift.tick(dt);
    budget = Math.min(budget + dt * PACE.steady, 1);
    if (budget < 1) continue;
    const action = chooseAction(shift);
    if (!action) continue;
    const res = doAction(shift, action);
    budget -= 1;
    acted++;
    assert.equal(res.ok, true, `action ${JSON.stringify(action)} was refused: ${res.reason}`);
  }
  assert.ok(acted > 60, `only ${acted} actions`);
  assert.equal(shift.stats.crispy, 0, 'a careful player should never burn anything');
});
