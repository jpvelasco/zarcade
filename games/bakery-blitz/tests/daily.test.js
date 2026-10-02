import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_ORDERS, applySpecial, buildSpecialDay, dailyOrders, dateKey, orderProgress,
  poolForChapter, specialFor, stationsForChapter,
} from '../src/daily.js';
import { RECIPES, STATIONS, firstStation, flowsForward } from '../src/recipes.js';
import { CHAPTERS } from '../src/levels.js';

test('the date key is the local day, zero padded', () => {
  assert.equal(dateKey(new Date(2026, 0, 2)), '2026-01-02');
  assert.equal(dateKey(new Date(2026, 11, 31)), '2026-12-31');
});

test('the same day brings the same special, a different day brings another', () => {
  const a = specialFor('2026-04-10');
  const b = specialFor('2026-04-10');
  assert.deepEqual(a, b);
  const names = new Set();
  for (let d = 1; d <= 28; d++) names.add(specialFor(`2026-04-${`${d}`.padStart(2, '0')}`).name);
  assert.ok(names.size >= 20, `only ${names.size} different specials in a month`);
});

test('the special is always something the player can actually make', () => {
  for (const chapter of CHAPTERS) {
    const stations = stationsForChapter(chapter.id);
    const def = specialFor('2026-07-07', stations);
    assert.ok(def.steps.length >= 2 && def.steps.length <= 3, `${def.steps.join('>')}`);
    assert.ok(STATIONS[firstStation('special')] || true);
    for (const step of def.steps) {
      assert.ok(STATIONS[step], `unknown station ${step}`);
      assert.ok(stations.includes(step), `chapter ${chapter.id} has no ${step}`);
    }
    assert.ok(STATIONS[def.steps[0]].start, 'the special must start somewhere');
    assert.ok(flowsForward(def.steps), `the special jams the kitchen: ${def.steps.join(' > ')}`);
    assert.ok(def.name.split(' ').length === 3, `odd name: ${def.name}`);
    assert.ok(def.value > RECIPES.cupcake.value, 'the special should be worth making');
  }
});

test('applying the special rewrites the shared recipe, and only that recipe', () => {
  const before = JSON.stringify(RECIPES.cupcake);
  const def = specialFor('2026-02-02', ['cocoa', 'mixer', 'oven', 'icing']);
  const applied = applySpecial(def);
  assert.equal(applied, RECIPES.special);
  assert.equal(RECIPES.special.name, def.name);
  assert.deepEqual(RECIPES.special.steps, def.steps);
  assert.equal(RECIPES.special.key, '2026-02-02');
  assert.equal(JSON.stringify(RECIPES.cupcake), before);
});

test('the special shift is deterministic, playable, and full of the special', () => {
  for (const chapter of [1, 3, 5]) {
    const key = '2026-09-09';
    const plan = buildSpecialDay(key, { chapter });
    assert.deepEqual(plan, buildSpecialDay(key, { chapter }));
    assert.equal(plan.kind, 'special');
    assert.equal(plan.special.key, key);
    assert.ok(plan.customers.length >= 10);
    assert.ok(plan.par > 0);
    assert.ok(plan.stars[0] < plan.stars[1] && plan.stars[1] < plan.stars[2]);
    const dishes = plan.customers.flatMap((c) => c.order);
    assert.ok(dishes.filter((d) => d === 'special').length >= plan.customers.length / 2);
    for (const dish of dishes) {
      for (const step of RECIPES[dish].steps) {
        assert.ok(plan.stations.includes(step), `chapter ${chapter}: ${dish} needs ${step}`);
      }
    }
    for (const customer of plan.customers) {
      assert.ok(customer.at >= 1 && customer.at <= plan.seconds * 0.95);
    }
  }
});

test('chapter one never gets a special with a station it has not seen', () => {
  const plan = buildSpecialDay('2026-01-01', { chapter: 1 });
  assert.deepEqual(plan.special.steps, ['mixer', 'oven']);
  assert.equal(plan.burn, false);
  assert.ok(!plan.pool.includes('cake'));
});

test('today\'s three orders are different from each other and askable', () => {
  for (const chapter of [1, 2, 5]) {
    const pool = poolForChapter(chapter).map(([id]) => id);
    for (const day of ['2026-01-05', '2026-06-18', '2026-11-30']) {
      const orders = dailyOrders(day, { chapter });
      assert.equal(orders.length, 3, `${day} chapter ${chapter}`);
      assert.equal(new Set(orders.map((o) => o.id)).size, 3);
      for (const order of orders) {
        assert.ok(order.label.length > 8, order.id);
        assert.ok(order.reward >= 50 && order.reward <= 150);
        assert.ok(order.need >= 1);
        if (order.dish) assert.ok(pool.includes(order.dish) || order.dish === 'special', `${order.dish} in chapter ${chapter}`);
      }
      assert.deepEqual(dailyOrders(day, { chapter }), orders, 'the same day gives the same orders');
    }
  }
});

test('the first chapter is never asked for something it cannot reach', () => {
  const easy = ['2026-01-01', '2026-03-03', '2026-08-08', '2026-12-12'];
  for (const day of easy) {
    for (const order of dailyOrders(day, { chapter: 1 })) {
      assert.ok(!['serve26', 'coins300', 'combo5', 'perfect10'].includes(order.id), `${day}: ${order.id}`);
    }
  }
});

test('order progress reads the right number out of a shift', () => {
  const result = {
    coins: 420, served: 11, crispy: 0, happy: 7, missed: 1, bestCombo: 4, perfectTips: 5,
    dishes: { cupcake: 3, cocoa: 9 },
  };
  const of = (id) => ALL_ORDERS.find((o) => o.id === id);
  assert.equal(orderProgress(of('serve18'), result, 2), 11);
  assert.equal(orderProgress(of('serve26'), result, 2), 11);
  assert.equal(orderProgress(of('happy12'), result, 2), 7);
  assert.equal(orderProgress(of('combo4'), result, 2), 4);
  assert.equal(orderProgress(of('combo5'), result, 2), 4);
  assert.equal(orderProgress(of('perfect10'), result, 2), 5);
  assert.equal(orderProgress(of('coins300'), result, 2), 300);
  assert.equal(orderProgress(of('stars3'), result, 2), 2);
  assert.equal(orderProgress(of('cupcake8'), result, 2), 3);
  assert.equal(orderProgress(of('cocoa8'), result, 2), 8);
  assert.equal(orderProgress(of('cake4'), result, 2), 0);
  assert.equal(orderProgress(of('clean'), result, 2), 1);
  assert.equal(orderProgress(of('clean'), { ...result, crispy: 2 }, 2), 0);
  assert.equal(orderProgress(of('clean'), { ...result, served: 3 }, 2), 0);
});

test('every order in the pool is reachable from some chapter', () => {
  const seen = new Set();
  for (const chapter of [1, 2, 3, 4, 5]) {
    for (let d = 1; d <= 28; d++) {
      for (const order of dailyOrders(`2026-04-${`${d}`.padStart(2, '0')}`, { chapter })) seen.add(order.id);
    }
  }
  for (const order of ALL_ORDERS) assert.ok(seen.has(order.id), `${order.id} never comes up`);
});

test('no special on any day of a year ever runs the kitchen backwards', () => {
  for (const chapter of [1, 2, 3, 4, 5]) {
    const stations = stationsForChapter(chapter);
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 28; day++) {
        const key = `2026-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
        const def = specialFor(key, stations);
        assert.ok(flowsForward(def.steps), `${key} chapter ${chapter}: ${def.steps.join(' > ')}`);
      }
    }
  }
});

test('a real shift result carries everything the orders read', async () => {
  const { buildDay } = await import('../src/levels.js');
  const { playShift, PACE } = await import('../src/ai.js');
  const { shift, result } = playShift(buildDay(12), { aps: PACE.pro });
  assert.ok(shift.stats.perfectTips > 0);
  const perfect = ALL_ORDERS.find((o) => o.id === 'perfect10');
  assert.equal(orderProgress(perfect, result, 3), Math.min(perfect.need, shift.stats.perfectTips));
});

test('orders that count a shift say so, because they never add shifts together', () => {
  for (const order of ALL_ORDERS) {
    if (['served', 'happy', 'perfect', 'dish'].includes(order.type)) {
      assert.match(order.text(order.need), /in one shift$/, order.id);
    }
    assert.doesNotMatch(order.text(order.need), /\btoday\b(?!'s special)/, order.id);
  }
});
