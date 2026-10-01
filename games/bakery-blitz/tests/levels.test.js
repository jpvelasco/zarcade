import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTERS, DAYS, DAY_COUNT, DAYS_PER_CHAPTER, buildDay, chapterOf, chapterRange,
  getSpec, planPar, recipesForDay, starsFor,
} from '../src/levels.js';
import { RECIPES, STATIONS, firstStation } from '../src/recipes.js';

test('there are at least forty days, numbered in order across five chapters', () => {
  assert.ok(DAY_COUNT >= 40, `only ${DAY_COUNT} days`);
  assert.equal(CHAPTERS.length, 5);
  assert.equal(DAY_COUNT, CHAPTERS.length * DAYS_PER_CHAPTER);
  DAYS.forEach((day, i) => {
    assert.equal(day.id, i + 1);
    assert.ok(day.name.length > 3, `day ${day.id} has no name`);
    assert.equal(day.chapter, chapterOf(day.id).id);
  });
  assert.equal(new Set(DAYS.map((d) => d.name)).size, DAY_COUNT, 'two days share a name');
  for (const chapter of CHAPTERS) {
    const { from, to } = chapterRange(chapter.id);
    assert.equal(getSpec(from).chapter, chapter.id);
    assert.equal(getSpec(to).chapter, chapter.id);
    assert.ok(chapter.blurb.length > 20 && chapter.adds.length > 10, `chapter ${chapter.id} needs words`);
  }
});

test('every chapter can make everything it asks for', () => {
  for (const chapter of CHAPTERS) {
    for (const station of chapter.stations) assert.ok(STATIONS[station], `chapter ${chapter.id}: ${station}`);
    for (const [recipe] of chapter.pool) {
      assert.ok(RECIPES[recipe], `chapter ${chapter.id} asks for unknown ${recipe}`);
      for (const step of RECIPES[recipe].steps) {
        assert.ok(chapter.stations.includes(step), `chapter ${chapter.id} orders ${recipe} with no ${step}`);
      }
    }
  }
});

test('chapters only ever add stations and recipes, never take them away', () => {
  for (let i = 1; i < CHAPTERS.length; i++) {
    const before = CHAPTERS[i - 1];
    const now = CHAPTERS[i];
    for (const station of before.stations) {
      assert.ok(now.stations.includes(station), `chapter ${now.id} lost ${station}`);
    }
    assert.ok(now.stations.length > before.stations.length, `chapter ${now.id} adds no station`);
  }
});

test('every day can make everything its own pool asks for', () => {
  for (const spec of DAYS) {
    for (const [recipe] of spec.pool) {
      for (const step of RECIPES[recipe].steps) {
        assert.ok(spec.stations.includes(step), `day ${spec.id} orders ${recipe} with no ${step}`);
      }
    }
    assert.ok(spec.pool.length >= 1);
    assert.ok(spec.seconds >= 60 && spec.seconds <= 240, `day ${spec.id} runs ${spec.seconds}s`);
    assert.ok(spec.patience >= 18, `day ${spec.id} patience ${spec.patience}s is mean`);
    assert.ok(spec.seats >= 3 && spec.seats <= 6);
    assert.ok(spec.count >= 4);
  }
});

test('the day gets busier as the campaign goes on', () => {
  const load = (id) => {
    const plan = buildDay(id);
    const dishes = plan.customers.reduce((n, c) => n + c.order.length, 0);
    return dishes / plan.seconds;
  };
  const early = (load(1) + load(2) + load(3)) / 3;
  const middle = (load(20) + load(21) + load(22)) / 3;
  const late = (load(43) + load(44) + load(45)) / 3;
  assert.ok(middle > early * 2, `middle ${middle.toFixed(3)} vs early ${early.toFixed(3)}`);
  assert.ok(late > middle, `late ${late.toFixed(3)} vs middle ${middle.toFixed(3)}`);
  // Even the finale stays inside what a person can tap: roughly two a second.
  const finaleActions = buildDay(45).customers
    .reduce((n, c) => n + c.order.reduce((k, r) => k + RECIPES[r].steps.length + 2, 0), 0);
  assert.ok(finaleActions / buildDay(45).seconds < 2.1, `finale needs ${(finaleActions / 170).toFixed(2)} taps a second`);
});

test('a built day is deterministic and its customers all arrive before closing', () => {
  for (let id = 1; id <= DAY_COUNT; id++) {
    const a = buildDay(id);
    const b = buildDay(id);
    assert.deepEqual(a, b, `day ${id} is not deterministic`);
    assert.equal(a.customers.length, getSpec(id).count);
    let last = -1;
    for (const customer of a.customers) {
      assert.ok(customer.at >= 1, `day ${id}: somebody arrives at ${customer.at}s`);
      assert.ok(customer.at <= a.seconds * 0.95, `day ${id}: somebody arrives at ${customer.at} of ${a.seconds}s`);
      assert.ok(customer.at >= last, `day ${id}: arrivals out of order`);
      last = customer.at;
      assert.ok(customer.order.length >= 1 && customer.order.length <= 4);
      for (const dish of customer.order) {
        assert.ok(a.pool.includes(dish), `day ${id} serves ${dish}, which is not on the menu`);
        assert.ok(STATIONS[firstStation(dish)], `day ${id}: ${dish} cannot be started`);
      }
      assert.ok(customer.order.filter((d) => d === 'cake').length <= 1, `day ${id}: two cakes in one order`);
    }
  }
});

test('star thresholds rise, stay inside reach, and tighten over the campaign', () => {
  for (let id = 1; id <= DAY_COUNT; id++) {
    const plan = buildDay(id);
    assert.ok(plan.par > 0, `day ${id} is worth nothing`);
    assert.equal(plan.par, Math.round(planPar(plan.customers)));
    const [one, two, three] = plan.stars;
    assert.ok(one < two && two < three, `day ${id} thresholds ${plan.stars.join('/')}`);
    assert.ok(one <= plan.par * 0.55, `day ${id} wants ${one} of ${plan.par} for one star`);
    assert.ok(three <= plan.par * 1.35, `day ${id} wants ${three} of ${plan.par} for three stars`);
    assert.equal(starsFor(plan, 0), 0);
    assert.equal(starsFor(plan, one), 1);
    assert.equal(starsFor(plan, three), 3);
    assert.equal(starsFor(plan, three * 10), 3);
  }
  const first = chapterOf(1).star;
  const last = chapterOf(DAY_COUNT).star;
  for (let k = 0; k < 3; k++) assert.ok(last[k] > first[k], 'the finale is not tighter than the first morning');
});

test('the assist gives more time and more patience without changing the thresholds', () => {
  const plain = buildDay(30);
  const kind = buildDay(30, { assist: true });
  assert.ok(kind.seconds > plain.seconds);
  assert.ok(kind.patience > plain.patience);
  assert.equal(kind.assist, true);
  assert.deepEqual(kind.stars, plain.stars);
  assert.deepEqual(kind.customers, plain.customers);
});

test('chapter one never burns anything and later chapters do', () => {
  assert.equal(buildDay(1).burn, false);
  assert.equal(buildDay(9).burn, false);
  assert.equal(buildDay(10).burn, true);
  assert.equal(buildDay(45).burn, true);
});

test('the first days of each chapter teach the new thing with a tip', () => {
  for (const id of [1, 2, 10, 19, 28, 38]) {
    assert.ok(getSpec(id).tip && getSpec(id).tip.length > 15, `day ${id} has no tip`);
  }
  assert.deepEqual(recipesForDay(1), ['cocoa']);
  assert.ok(recipesForDay(10).includes('cupcake'));
  assert.ok(recipesForDay(19).includes('tart'));
  assert.ok(recipesForDay(28).includes('cookies'));
  assert.ok(recipesForDay(38).includes('smoothie'));
});

test('the chapter regular turns up, but not on the chapter opener', () => {
  for (const chapter of CHAPTERS) {
    if (!chapter.regular) continue;
    const { from, to } = chapterRange(chapter.id);
    assert.ok(!buildDay(from).customers.some((c) => c.kind === chapter.regular), `chapter ${chapter.id} opens with its regular`);
    let seen = 0;
    for (let id = from; id <= to; id++) {
      seen += buildDay(id).customers.filter((c) => c.kind === chapter.regular).length;
    }
    assert.ok(seen >= 6, `chapter ${chapter.id}'s regular only shows up ${seen} times`);
  }
});
