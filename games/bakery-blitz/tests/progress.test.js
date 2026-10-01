import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, ASSIST_AFTER, applyOrders, assistFor, bankSpecial, buyUpgrade, daysCleared, defaultSave,
  discover, highestChapter, isUnlocked, loadSave, owns, recordDay, refreshDaily, streakAlive,
  tasteSpecial, totalStars, writeSave,
} from '../src/progress.js';
import { buildDay, DAY_COUNT } from '../src/levels.js';
import { getUpgrade } from '../src/upgrades.js';
import { buildSpecialDay } from '../src/daily.js';

function fakeStore(initial = null) {
  let value = initial;
  return {
    getItem: (key) => (key === SAVE_KEY ? value : null),
    setItem: (key, next) => { if (key === SAVE_KEY) value = next; },
    get raw() { return value; },
  };
}

const result = (over = {}) => ({
  coins: 0, par: 100, served: 0, crispy: 0, happy: 0, missed: 0, bestCombo: 0, dishes: {}, seconds: 60, ...over,
});

test('a fresh bakery starts on day one with nothing bought', () => {
  const save = defaultSave();
  assert.equal(save.unlocked, 1);
  assert.equal(save.coins, 0);
  assert.equal(totalStars(save), 0);
  assert.equal(daysCleared(save), 0);
  assert.deepEqual(save.owned, []);
  assert.deepEqual(save.book, []);
  assert.equal(isUnlocked(save, 1), true);
  assert.equal(isUnlocked(save, 2), false);
  assert.equal(highestChapter(save), 1);
});

test('a save survives a round trip, and rubbish in storage does not break it', () => {
  const store = fakeStore();
  const save = defaultSave();
  save.coins = 320;
  save.stars[3] = 2;
  assert.equal(writeSave(store, save), true);
  const back = loadSave(store);
  assert.equal(back.coins, 320);
  assert.equal(back.stars[3], 2);
  assert.deepEqual(loadSave(fakeStore('not json at all')), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
  const odd = loadSave(fakeStore(JSON.stringify({
    stars: 'nope', best: 7, owned: ['nonsense', 'mitts1'], book: ['bogus', 'cocoa'],
    unlocked: 9999, coins: -40,
  })));
  assert.deepEqual(odd.stars, {});
  assert.deepEqual(odd.best, {});
  assert.deepEqual(odd.owned, ['mitts1']);
  assert.deepEqual(odd.book, ['cocoa']);
  assert.equal(odd.unlocked, DAY_COUNT);
  assert.equal(odd.coins, 0);
});

test('saving where storage is blocked fails quietly', () => {
  const blocked = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); } };
  assert.equal(writeSave(blocked, defaultSave()), false);
  assert.deepEqual(loadSave(blocked), defaultSave());
});

test('a good day banks coins, stars and the next day', () => {
  const save = defaultSave();
  const plan = buildDay(1);
  const out = recordDay(save, plan, result({ coins: plan.stars[2], served: 6, dishes: { cocoa: 6 } }));
  assert.equal(out.stars, 3);
  assert.equal(out.cleared, true);
  assert.equal(out.improved, true);
  assert.equal(out.newBest, true);
  assert.equal(save.unlocked, 2);
  assert.equal(save.coins, plan.stars[2]);
  assert.equal(save.earned, plan.stars[2]);
  assert.deepEqual(save.book, ['cocoa']);
  assert.equal(save.shifts, 1);
});

test('stars and bests only ever go up, and coins bank every time', () => {
  const save = defaultSave();
  const plan = buildDay(1);
  recordDay(save, plan, result({ coins: plan.stars[2] }));
  const again = recordDay(save, plan, result({ coins: plan.stars[0] }));
  assert.equal(again.stars, 1, 'the shift itself scored one star');
  assert.equal(save.stars[1], 3, 'the record keeps the best');
  assert.equal(save.best[1], plan.stars[2]);
  assert.equal(again.newBest, false);
  assert.equal(save.coins, plan.stars[2] + plan.stars[0], 'a weaker shift still pays');
});

test('a starless day still pays, does not unlock, and earns a helping hand', () => {
  const save = defaultSave();
  save.unlocked = 20;
  const plan = buildDay(20);
  for (let attempt = 1; attempt <= ASSIST_AFTER; attempt++) {
    const out = recordDay(save, plan, result({ coins: 10 }));
    assert.equal(out.stars, 0);
    assert.equal(out.cleared, false);
    assert.equal(save.unlocked, 20, 'a starless day does not unlock the next');
  }
  assert.equal(save.coins, 20, 'the coins still bank, so a retry is stronger');
  assert.equal(assistFor(save, 20), true);
  const win = recordDay(save, plan, result({ coins: plan.stars[0] }));
  assert.equal(win.cleared, true);
  assert.equal(save.unlocked, 21);
  assert.equal(assistFor(save, 20), false, 'a cleared day stops being easier');
});

test('the last day does not unlock a day that is not there', () => {
  const save = defaultSave();
  save.unlocked = DAY_COUNT;
  const plan = buildDay(DAY_COUNT);
  const out = recordDay(save, plan, result({ coins: plan.stars[2] }));
  assert.equal(save.unlocked, DAY_COUNT);
  assert.equal(out.nextDay, DAY_COUNT);
});

test('the special shift pays but does not touch the campaign', () => {
  const save = defaultSave();
  const plan = buildSpecialDay('2026-03-04', { chapter: 2 });
  const out = recordDay(save, plan, result({ coins: 400, dishes: { special: 3 } }));
  assert.equal(save.coins, 400);
  assert.equal(save.unlocked, 1);
  assert.deepEqual(Object.keys(save.stars), []);
  assert.ok(out.stars >= 0);
  assert.ok(save.book.includes('special'));
});

test('the recipe book and the special shelf fill up without repeats', () => {
  const save = defaultSave();
  assert.equal(discover(save, 'cupcake'), true);
  assert.equal(discover(save, 'cupcake'), false);
  assert.equal(discover(save, 'not-a-recipe'), false);
  assert.deepEqual(save.book, ['cupcake']);
  assert.equal(tasteSpecial(save, 'Maple Pecan Twist'), true);
  assert.equal(tasteSpecial(save, 'Maple Pecan Twist'), false);
  assert.equal(tasteSpecial(save, ''), false);
  assert.deepEqual(save.specials, ['Maple Pecan Twist']);
});

test('buying an upgrade spends coins once and respects the order', () => {
  const save = defaultSave();
  assert.equal(buyUpgrade(save, 'mitts2').reason, 'locked');
  const cost = getUpgrade('mitts1').cost;
  const poor = buyUpgrade(save, 'mitts1');
  assert.equal(poor.ok, false);
  assert.equal(poor.reason, 'coins');
  assert.equal(poor.short, cost);
  save.coins = cost;
  assert.equal(buyUpgrade(save, 'mitts1').ok, true);
  assert.equal(save.coins, 0);
  assert.equal(owns(save, 'mitts1'), true);
  assert.equal(buyUpgrade(save, 'mitts1').reason, 'locked', 'cannot buy it twice');
  save.coins = 99999;
  assert.equal(buyUpgrade(save, 'mitts2').ok, true);
});

test('the chapter the player is up to drives what the day board offers', () => {
  const save = defaultSave();
  save.unlocked = 1;
  assert.equal(highestChapter(save), 1);
  save.unlocked = 20;
  assert.equal(highestChapter(save), 3);
  save.unlocked = DAY_COUNT;
  assert.equal(highestChapter(save), 5);
});

test('the notice board rolls over when the date changes', () => {
  const save = defaultSave();
  const monday = refreshDaily(save, '2026-05-04', 3);
  assert.equal(monday.orders.length, 3);
  assert.equal(refreshDaily(save, '2026-05-04', 3), monday, 'the same day keeps the same board');
  monday.orders[0].progress = 5;
  const tuesday = refreshDaily(save, '2026-05-05', 3);
  assert.notEqual(tuesday, monday);
  assert.ok(tuesday.orders.every((o) => o.progress === 0 && !o.done));
});

test('orders pay out once, and all three pay a bonus', () => {
  const save = defaultSave();
  const key = '2026-05-04';
  const board = refreshDaily(save, key, 5);
  // Force a board we can finish on purpose.
  board.orders = [
    { id: 'a', type: 'served', need: 4, reward: 50, label: 'serve four', progress: 0, done: false },
    { id: 'b', type: 'happy', need: 2, reward: 60, label: 'two happy', progress: 0, done: false },
    { id: 'c', type: 'combo', need: 3, reward: 70, label: 'combo three', progress: 0, done: false },
  ];
  const first = applyOrders(save, result({ served: 4, happy: 1, bestCombo: 1 }), 1, key);
  assert.equal(first.finished.length, 1);
  assert.equal(save.coins, 50);
  assert.equal(first.bonus, 0);
  const second = applyOrders(save, result({ served: 2, happy: 2, bestCombo: 3 }), 2, key);
  assert.equal(second.finished.length, 2);
  assert.equal(second.bonus > 0, true);
  assert.equal(save.coins, 50 + 60 + 70 + second.bonus);
  const third = applyOrders(save, result({ served: 9, happy: 9, bestCombo: 5 }), 3, key);
  assert.equal(third.finished.length, 0, 'orders only pay once');
  assert.equal(third.bonus, 0);
});

test('the streak counts days in a row and forgets a gap', () => {
  const save = defaultSave();
  assert.equal(bankSpecial(save, '2026-05-04').streak, 1);
  assert.equal(bankSpecial(save, '2026-05-04').first, false, 'only the first finish counts');
  assert.equal(bankSpecial(save, '2026-05-05').streak, 2);
  assert.equal(bankSpecial(save, '2026-05-06').streak, 3);
  assert.equal(streakAlive(save, '2026-05-07'), true, 'there is still today to play');
  assert.equal(bankSpecial(save, '2026-05-09').streak, 1, 'a missed day starts again');
  assert.equal(streakAlive(save, '2026-05-12'), false);
});

test('a loaded save keeps today\'s board and streak', () => {
  const store = fakeStore();
  const save = defaultSave();
  refreshDaily(save, '2026-05-04', 2);
  bankSpecial(save, '2026-05-04');
  save.daily.orders[0].progress = 3;
  writeSave(store, save);
  const back = loadSave(store);
  assert.equal(back.daily.date, '2026-05-04');
  assert.equal(back.daily.orders[0].progress, 3);
  assert.equal(back.daily.specialDone, true);
  assert.equal(back.streak, 1);
});
