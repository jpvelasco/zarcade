import test from 'node:test';
import assert from 'node:assert/strict';
import { Shift, HOLD_SECONDS, SCORCH_SECONDS, COMBO_SECONDS, STALE_SECONDS, WIND_DOWN, BUSY_PATIENCE } from '../src/sim.js';
import { effects, BASE_EFFECTS } from '../src/upgrades.js';
import { buildDay } from '../src/levels.js';
import { RECIPES } from '../src/recipes.js';

// A tiny hand-made shift so each rule can be poked at on its own.
function plan(over = {}) {
  return {
    id: 'test', chapter: 1, name: 'Test day', kind: 'day', seats: 2, burn: true,
    stations: ['cocoa', 'mixer', 'oven', 'icing'], pool: ['cocoa', 'pretzel', 'cupcake'],
    seconds: 60, patience: 30, assist: false,
    customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }],
    par: 100, stars: [20, 50, 80],
    ...over,
  };
}

const run = (shift, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) shift.tick(dt);
};
const station = (shift, kind) => shift.stations.find((s) => s.kind === kind);

test('the station row follows the day, with one extra oven and bowl when owned', () => {
  const plain = new Shift(plan());
  assert.deepEqual(plain.stations.map((s) => s.kind), ['cocoa', 'mixer', 'oven', 'icing']);
  const kitted = new Shift(plan(), { effects: effects(['mitts1', 'oven2', 'mix1', 'bowl2']) });
  assert.deepEqual(kitted.stations.map((s) => s.kind), ['cocoa', 'mixer', 'mixer', 'oven', 'oven', 'icing']);
  kitted.stations.forEach((s, i) => assert.equal(s.index, i));
});

test('a customer sits down, their order becomes tickets, and the rail shows them', () => {
  const shift = new Shift(plan({ customers: [{ at: 1, kind: 'bunny', order: ['cocoa', 'pretzel'] }] }));
  assert.equal(shift.tickets().length, 0);
  run(shift, 1.2);
  assert.equal(shift.active.length, 1);
  assert.equal(shift.seats[0].customer.id, 'c1');
  assert.deepEqual(shift.tickets().map((t) => t.recipe), ['cocoa', 'pretzel']);
});

test('tapping a start station begins the most urgent ticket it can', () => {
  const shift = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['pretzel'] }] }));
  run(shift, 0.1);
  assert.equal(shift.tapStation(0).ok, false, 'the cocoa pot cannot make a pretzel');
  const res = shift.tapStation(1);
  assert.equal(res.ok, true);
  assert.equal(station(shift, 'mixer').item.recipe, 'pretzel');
  assert.equal(shift.tickets()[0].state, 'cooking');
  assert.equal(shift.tapStation(1).ok, false, 'the bowl is busy');
});

test('a station only passes its item along once it is finished, and only if there is room', () => {
  const shift = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['pretzel', 'pretzel'] }] }));
  run(shift, 0.1);
  shift.tapStation(1);
  assert.equal(shift.tapStation(1).reason, 'working');
  run(shift, RECIPES.pretzel.steps.length ? 2.3 : 2.3);
  assert.equal(station(shift, 'mixer').item.state, 'ready');
  assert.equal(shift.tapStation(1).ok, true);
  assert.equal(station(shift, 'oven').item.recipe, 'pretzel');
  assert.equal(station(shift, 'mixer').item, null);
  // Second pretzel: the oven is busy, so it has to wait in the bowl.
  shift.tapStation(1);
  run(shift, 2.3);
  const blocked = shift.tapStation(1);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'full');
  assert.ok(station(shift, 'oven').flash > 0, 'the blocking station should flash');
});

test('a finished dish goes to the counter, and the counter can fill up', () => {
  const shift = new Shift(plan({ seats: 3, customers: [0, 1, 2].map(() => ({ at: 0, kind: 'bunny', order: ['cocoa'] })) }));
  run(shift, 0.1);
  assert.equal(shift.counterSlots, BASE_EFFECTS.counterSlots);
  for (let i = 0; i < 3; i++) {
    shift.tapStation(0);
    run(shift, 3.1);
    const res = shift.tapStation(0);
    if (i < 2) assert.equal(res.ok, true);
    else assert.equal(res.reason, 'counterfull');
  }
  assert.equal(shift.counter.length, 2);
});

test('serving pays, counts, and sends a finished customer home happy', () => {
  const shift = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }));
  run(shift, 0.1);
  shift.tapStation(0);
  run(shift, 3.1);
  shift.tapStation(0);
  assert.equal(shift.counter.length, 1);
  const res = shift.serve();
  assert.equal(res.ok, true);
  // Eight coins, three hearts still showing: a 1.6x tip.
  assert.equal(res.coins, Math.round(RECIPES.cocoa.value * 1.6));
  assert.equal(shift.coins, res.coins);
  assert.equal(shift.stats.served, 1);
  assert.equal(shift.stats.happy, 1);
  assert.equal(shift.stats.dishes.cocoa, 1);
  assert.equal(shift.serve().reason, 'empty');
});

test('a dish whose customer had to go is passed to whoever else wants it', () => {
  const shift = new Shift(plan({
    seats: 2, patience: 6,
    customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }, { at: 4, kind: 'bear', order: ['cocoa'] }],
  }));
  run(shift, 0.1);
  shift.tapStation(0);
  run(shift, 9.5);
  // The bunny ran out of patience while the cocoa was brewing; the bear is in.
  assert.equal(shift.stats.missed, 1);
  assert.equal(shift.active.length, 1);
  assert.equal(shift.active[0].kind, 'bear');
  shift.tapStation(0);
  assert.equal(shift.counter.length, 1);
  assert.equal(shift.counter[0].customer, 'c1', 'it was brewed for the bunny');
  const res = shift.serve();
  assert.equal(res.ok, true, 'the bear should happily take it');
  assert.equal(shift.stats.happy, 1);
});

test('nothing can be started that nobody has ordered', () => {
  const shift = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['pretzel'] }] }));
  run(shift, 0.1);
  assert.equal(shift.tapStation(0).reason, 'nothing');
  assert.equal(station(shift, 'cocoa').item, null);
});

test('a bake left in the oven colours, then settles at crispy and sells for half', () => {
  const shift = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['pretzel'] }] }));
  run(shift, 0.1);
  shift.tapStation(1);
  run(shift, 2.3);
  shift.tapStation(1);
  run(shift, RECIPES.pretzel.bake + 0.2);
  const oven = station(shift, 'oven');
  assert.equal(oven.item.state, 'ready');
  assert.equal(oven.item.scorch, 0);
  run(shift, HOLD_SECONDS);
  assert.ok(oven.item.scorch > 0 && oven.item.scorch < 1, `scorch is ${oven.item.scorch}`);
  assert.equal(oven.item.quality, 'perfect');
  run(shift, SCORCH_SECONDS);
  assert.equal(oven.item.scorch, 1);
  assert.equal(oven.item.quality, 'crispy');
  shift.tapStation(2);
  const res = shift.serve();
  assert.equal(shift.stats.crispy, 1);
  assert.ok(res.coins < RECIPES.pretzel.value, `crispy paid ${res.coins}`);
});

test('chapter one ovens never colour anything, and the thermostat buys more time', () => {
  const calm = new Shift(plan({ burn: false, customers: [{ at: 0, kind: 'bunny', order: ['pretzel'] }] }));
  run(calm, 0.1);
  calm.tapStation(1);
  run(calm, 2.3);
  calm.tapStation(1);
  run(calm, RECIPES.pretzel.bake + HOLD_SECONDS + SCORCH_SECONDS + 2);
  assert.equal(station(calm, 'oven').item.quality, 'perfect');
  assert.equal(station(calm, 'oven').item.scorch, 0);

  const thermo = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['pretzel'] }] }), { effects: effects(['thermo']) });
  run(thermo, 0.1);
  thermo.tapStation(1);
  run(thermo, 2.3);
  thermo.tapStation(1);
  run(thermo, RECIPES.pretzel.bake * effects(['thermo']).bakeScale + HOLD_SECONDS + 1);
  assert.equal(station(thermo, 'oven').item.scorch, 0, 'the thermostat should still be holding');
});

test('patience drains, shows fewer hearts, and runs out with a wave and no penalty', () => {
  const shift = new Shift(plan({ patience: 10, customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }));
  run(shift, 0.1);
  const customer = shift.active[0];
  assert.equal(shift.hearts(customer), 3);
  run(shift, 4);
  assert.equal(shift.hearts(customer), 2);
  run(shift, 6.2);
  assert.equal(customer.state, 'leaving');
  assert.equal(customer.happy, false);
  assert.equal(shift.stats.missed, 1);
  assert.equal(shift.coins, 0, 'nobody is charged for a customer who had to go');
  run(shift, 1.3);
  assert.equal(shift.seats[0].customer, null, 'the seat frees up');
});

test('a customer who can see their order being made relaxes', () => {
  const idle = new Shift(plan({ patience: 20, customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }));
  const busy = new Shift(plan({ patience: 20, customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }));
  run(idle, 0.1);
  run(busy, 0.1);
  busy.tapStation(0);
  run(idle, 5);
  run(busy, 5);
  const drained = 1 - idle.active[0].patience;
  const relaxed = 1 - busy.active[0].patience;
  assert.ok(relaxed < drained, 'a started order should drain slower');
  assert.ok(Math.abs(relaxed / drained - BUSY_PATIENCE) < 0.05, `${relaxed} vs ${drained}`);
});

test('serving quickly builds a tip combo that fades when you stop', () => {
  const orders = [0, 1, 2].map(() => ({ at: 0, kind: 'bunny', order: ['cocoa'] }));
  // One straggler keeps the shift open so the combo has time to cool off.
  orders.push({ at: 40, kind: 'bear', order: ['cocoa'] });
  const shift = new Shift(plan({ seats: 3, customers: orders }), { effects: effects(['counter2']) });
  run(shift, 0.1);
  for (let i = 0; i < 3; i++) {
    shift.tapStation(0);
    run(shift, 3.1);
    shift.tapStation(0);
  }
  assert.equal(shift.counter.length, 3);
  const first = shift.serve();
  const second = shift.serve();
  const third = shift.serve();
  assert.equal(first.combo, 1);
  assert.equal(second.combo, 2);
  assert.equal(third.combo, 3);
  assert.ok(third.coins > first.coins, `combo should pay more: ${first.coins} then ${third.coins}`);
  assert.equal(shift.stats.bestCombo, 3);
  run(shift, COMBO_SECONDS + 0.2);
  assert.equal(shift.combo, 0, 'the combo should cool off');
});

test('the jukebox tips better and comfy chairs stretch patience', () => {
  const base = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }));
  const posh = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }), { effects: effects(['jukebox', 'chairs']) });
  for (const shift of [base, posh]) {
    run(shift, 0.1);
    shift.tapStation(0);
    run(shift, 3.1);
    shift.tapStation(0);
  }
  assert.ok(posh.serve().coins > base.serve().coins);
  assert.ok(posh.active[0].span > base.active[0].span * 1.2);
});

test('the player can pick which ticket the next station starts', () => {
  const shift = new Shift(plan({ seats: 2, customers: [
    { at: 0, kind: 'bear', order: ['pretzel'] },
    { at: 0, kind: 'bunny', order: ['cupcake'] },
  ] }));
  run(shift, 0.1);
  // Left alone, the bowl starts the impatient bunny's cupcake.
  const auto = new Shift(plan({ seats: 2, customers: shift.plan.customers }));
  run(auto, 0.1);
  auto.tapStation(1);
  assert.equal(station(auto, 'mixer').item.recipe, 'cupcake');
  // Pick the bear's pretzel and it goes first instead.
  const bearTicket = shift.tickets().find((t) => t.recipe === 'pretzel');
  shift.select(bearTicket.id);
  assert.equal(shift.selected, bearTicket.id);
  shift.tapStation(1);
  assert.equal(station(shift, 'mixer').item.recipe, 'pretzel');
  assert.equal(shift.selected, null, 'the pick is used up');
});

test('the helper mouse serves or rescues all by itself', () => {
  const eff = effects(['chairs', 'mouse']);
  const shift = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }), { effects: eff });
  run(shift, 0.1);
  shift.tapStation(0);
  run(shift, 3.1);
  shift.tapStation(0);
  assert.equal(shift.counter.length, 1);
  run(shift, eff.helperEvery + 0.2);
  assert.equal(shift.counter.length, 0, 'the mouse should have served it');
  assert.ok(shift.coins > 0);
});

test('the shop shuts, finishes what it started, and then the day is over', () => {
  const shift = new Shift(plan({ seconds: 6, customers: [{ at: 0, kind: 'bear', order: ['pretzel'] }] }));
  run(shift, 6.2);
  assert.equal(shift.closing, true);
  assert.equal(shift.done, false, 'the bear is still sitting there');
  shift.tapStation(1);
  run(shift, 2.4);
  shift.tapStation(1);
  run(shift, RECIPES.pretzel.bake + 0.2);
  shift.tapStation(2);
  shift.serve();
  run(shift, 2);
  assert.equal(shift.done, true);
  assert.ok(shift.coins > 0);
});

test('a jammed shift still ends, inside the wind-down', () => {
  const shift = new Shift(plan({ seconds: 4, patience: 999, customers: [{ at: 0, kind: 'bear', order: ['cake'] }] }));
  run(shift, 4 + WIND_DOWN + 2);
  assert.equal(shift.done, true);
  assert.equal(shift.coins, 0);
  assert.equal(shift.result().served, 0);
});

test('a day with nobody left ends early without waiting for the clock', () => {
  const shift = new Shift(plan({ seconds: 120, customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }));
  run(shift, 0.1);
  shift.tapStation(0);
  run(shift, 3.1);
  shift.tapStation(0);
  shift.serve();
  run(shift, 2);
  assert.equal(shift.done, true);
  assert.ok(shift.time < 10, `the day ran for ${shift.time}s`);
});

test('nothing can be done once the day is over', () => {
  const shift = new Shift(plan({ seconds: 1, customers: [] }));
  run(shift, 2);
  assert.equal(shift.done, true);
  assert.equal(shift.tapStation(0).reason, 'over');
  assert.equal(shift.serve().reason, 'over');
});

test('two plays of the same real day with the same taps come out identical', () => {
  const day = buildDay(23);
  const transcript = [];
  const first = new Shift(day, { effects: effects(['mitts1']), seed: 7 });
  for (let t = 0; t < 40; t += 1 / 60) {
    first.tick(1 / 60);
    if (Math.round(t * 60) % 17 === 0) {
      const index = Math.floor(t) % first.stations.length;
      transcript.push(index);
      first.tapStation(index);
      first.serve();
    }
  }
  const second = new Shift(day, { effects: effects(['mitts1']), seed: 7 });
  let step = 0;
  for (let t = 0; t < 40; t += 1 / 60) {
    second.tick(1 / 60);
    if (Math.round(t * 60) % 17 === 0) {
      second.tapStation(transcript[step++]);
      second.serve();
    }
  }
  assert.equal(second.coins, first.coins);
  assert.deepEqual(second.result(), first.result());
});

test('events come out for the sounds and sparkles, and drain cleanly', () => {
  const shift = new Shift(plan({ customers: [{ at: 0, kind: 'bunny', order: ['cocoa'] }] }));
  run(shift, 0.1);
  assert.ok(shift.events.some((e) => e.type === 'arrive'));
  shift.drain();
  assert.equal(shift.events.length, 0);
  shift.tapStation(0);
  run(shift, 3.1);
  assert.ok(shift.drain().some((e) => e.type === 'ding'));
  shift.tapStation(0);
  shift.serve();
  const kinds = shift.drain().map((e) => e.type);
  assert.ok(kinds.includes('plate') && kinds.includes('serve') && kinds.includes('happy'));
});

test('a real day reports a result a results screen can show', () => {
  const day = buildDay(12);
  const shift = new Shift(day, { effects: effects([]) });
  run(shift, 5);
  const result = shift.result();
  for (const key of ['coins', 'par', 'served', 'crispy', 'happy', 'missed', 'bestCombo', 'dishes', 'seconds']) {
    assert.ok(key in result, `result has no ${key}`);
  }
  assert.equal(result.par, day.par);
});

test('a full counter of dishes nobody wants tidies itself so the shop never jams', () => {
  const shift = new Shift(plan({
    seats: 2, patience: 7,
    customers: [
      { at: 0, kind: 'bunny', order: ['cocoa'] },
      { at: 0, kind: 'bunny', order: ['cocoa'] },
      { at: 40, kind: 'bear', order: ['pretzel'] },
    ],
  }));
  run(shift, 0.1);
  for (let i = 0; i < 2; i++) {
    shift.tapStation(0);
    run(shift, 3.1);
    shift.tapStation(0);
  }
  assert.equal(shift.counter.length, 2, 'the counter is full');
  run(shift, 8);
  assert.equal(shift.stats.missed, 2, 'both cocoa drinkers had to go');
  assert.equal(shift.counter.length, 2, 'the dishes are still there for a while');
  run(shift, STALE_SECONDS + 0.3);
  // Freeing one slot is enough: the shop only tidies when it needs the room.
  assert.ok(shift.counter.length < 2, 'the counter made room for itself');
  // And the kitchen still works afterwards.
  run(shift, 32);
  assert.equal(shift.active[0].kind, 'bear');
  assert.equal(shift.tapStation(1).ok, true);
});
