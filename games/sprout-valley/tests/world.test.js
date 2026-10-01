import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { idx, BIN, WELL, TROUGH, SHOP_COUNTER, STALL, LANTERNS, FIELD_A, BUILDINGS } from '../src/map.js';
import { CROPS, FESTIVALS, VILLAGERS } from '../src/data.js';
import { isRipe } from '../src/crops.js';
import { DAYS_PER_SEASON } from '../src/time.js';
import { freshWorld, standAt, useOn, takeEvents } from './helpers.js';

// A clean field tile next to the farmer.
function prep(w, x = 14, y = 12) {
  w.obj[idx(x, y)] = null;
  standAt(w, x, y - 1, 'down');
  return [x, y];
}

const menuOf = (events) => events.find((e) => e.type === 'menu')?.menu;

test('till, plant, water, sleep and harvest a turnip', () => {
  const w = freshWorld();
  const [x, y] = prep(w);
  useOn(w, 'hoe', x, y);
  assert.equal(w.soil[idx(x, y)], 1);
  useOn(w, 'turnip_seed', x, y);
  assert.equal(w.crop[idx(x, y)].id, 'turnip');
  assert.equal(w.inv.turnip_seed, 14);
  for (let d = 0; d < CROPS.turnip.days; d++) {
    w.weather = 'sunny';
    useOn(w, 'can', x, y);
    assert.equal(w.wet[idx(x, y)], 1);
    w.sleep();
    standAt(w, x, y - 1, 'down');
  }
  assert.ok(isRipe(w.crop[idx(x, y)]));
  useOn(w, 'hoe', x, y);
  assert.equal(w.crop[idx(x, y)], null);
  assert.equal(w.inv.turnip, 1);
  assert.equal(w.collection.crops.turnip, 1);
  assert.ok(w.goalsDone.harvest);
});

test('rain waters every outdoor crop', () => {
  const w = freshWorld(2);
  const [x, y] = prep(w);
  useOn(w, 'hoe', x, y);
  useOn(w, 'turnip_seed', x, y);
  // Find a rainy day and start it.
  let d = 1;
  while (w.weather !== 'rain') { w.day = d++; w.startDay(); }
  assert.equal(w.wet[idx(x, y)], 1);
});

test('sprinklers water their ring each morning', () => {
  const w = freshWorld();
  const [x, y] = prep(w, 16, 12);
  w.add('sprinkler');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) { w.obj[idx(x + dx, y + dy)] = null; w.soil[idx(x + dx, y + dy)] = 1; }
  useOn(w, 'sprinkler', x, y);
  assert.equal(w.obj[idx(x, y)].type, 'sprinkler');
  w.weather = 'sunny';
  w.sleep();
  // Days without rain still come out watered next to the sprinkler.
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) assert.equal(w.wet[idx(x + dx, y + dy)], 1);
  assert.ok(w.goalsDone.sprinkler);
});

test('seeds refuse the wrong season and out-of-season crops wither', () => {
  const w = freshWorld();
  const [x, y] = prep(w);
  useOn(w, 'hoe', x, y);
  w.add('melon_seed', 1);
  useOn(w, 'melon_seed', x, y);
  assert.equal(w.crop[idx(x, y)], null);
  assert.equal(w.inv.melon_seed, 1);
  useOn(w, 'turnip_seed', x, y);
  w.day = DAYS_PER_SEASON - 1;
  w.sleep();
  assert.equal(w.season, 'summer');
  assert.equal(w.crop[idx(x, y)].dead, true);
  standAt(w, x, y - 1, 'down');
  useOn(w, 'scythe', x, y);
  assert.equal(w.crop[idx(x, y)], null);
});

test('the watering can empties and refills at the well', () => {
  const w = freshWorld();
  const [x, y] = prep(w);
  useOn(w, 'hoe', x, y);
  w.water = 0;
  useOn(w, 'can', x, y);
  assert.equal(w.wet[idx(x, y)], 0);
  standAt(w, WELL[0], WELL[1] + 1, 'up');
  useOn(w, 'can', WELL[0], WELL[1]);
  assert.equal(w.water, w.canInfo.capacity);
});

test('shipping pays overnight and the market only opens on Saturday', () => {
  const w = freshWorld();
  w.add('turnip', 5);
  standAt(w, BIN[0], BIN[1] + 1, 'up');
  useOn(w, 'hoe', BIN[0], BIN[1]);
  assert.equal(menuOf(takeEvents(w)), 'bin');
  assert.ok(w.ship('turnip', 5));
  const before = w.money;
  const s = w.sleep();
  assert.equal(s.income, 5 * CROPS.turnip.sell);
  assert.equal(w.money, before + s.income);
  w.add('egg', 2);
  assert.equal(w.sellAtMarket('egg', 1), false);
  w.day = 5; w.startDay(); w.minute = 10 * 60;
  standAt(w, STALL[1][0], STALL[1][1] + 1, 'up');
  useOn(w, 'hoe', STALL[1][0], STALL[1][1]);
  assert.equal(menuOf(takeEvents(w)), 'market');
  const m0 = w.money;
  assert.ok(w.sellAtMarket('egg', 1));
  assert.ok(w.money > m0 + 45);
});

test('the store opens at 8 and buying upgrades works', () => {
  const w = freshWorld();
  standAt(w, SHOP_COUNTER[1][0], SHOP_COUNTER[1][1] + 1, 'up');
  useOn(w, 'hoe', SHOP_COUNTER[1][0], SHOP_COUNTER[1][1]);
  assert.notEqual(menuOf(takeEvents(w)), 'shop');
  w.minute = 9 * 60;
  useOn(w, 'hoe', SHOP_COUNTER[1][0], SHOP_COUNTER[1][1]);
  assert.equal(menuOf(takeEvents(w)), 'shop');
  assert.equal(w.buy('can1'), true);
  assert.equal(w.canLevel, 1);
  assert.equal(w.water, 40);
  assert.equal(w.buy('can2'), false, 'not enough money yet');
  w.money = 99999;
  assert.ok(w.buy('field'));
  assert.ok(w.tillable(FIELD_A.x1 + 3, FIELD_A.y0));
  assert.ok(w.buy('greenhouse'));
  assert.ok(w.inGreenhouse(5, 12));
  assert.ok(w.buy('cow'));
  assert.ok(w.buy('cow'));
  assert.equal(w.buy('cow'), false, 'the barn holds two cows');
});

test('fed animals make produce; petting is once a day', () => {
  const w = freshWorld();
  assert.equal(w.animals.length, 2);
  standAt(w, TROUGH[0][0], TROUGH[0][1] + 1, 'up');
  useOn(w, 'hoe', TROUGH[0][0], TROUGH[0][1]);
  assert.equal(w.trough, 10);
  assert.equal(w.inv.hay, undefined);
  const a = w.animals[0];
  a.x = 8.5; a.y = 30.5; a.tx = null; a.wait = 99;
  standAt(w, 8, 29, 'down');
  useOn(w, 'hoe', 8, 30);
  assert.equal(a.points, 25);
  useOn(w, 'hoe', 8, 30);
  assert.equal(a.points, 25);
  const s = w.sleep();
  assert.equal(s.produce >= 2, true);
  assert.equal(w.trough, 8);
  assert.ok(w.pickups.filter((p) => p.item === 'egg').length >= 1);
  // Walk over an egg to collect it.
  const egg = w.pickups[0];
  standAt(w, egg.x, egg.y);
  w.step(0.01, {});
  assert.ok(w.inv.egg >= 1);
  assert.ok(w.goalsDone.egg);
  // Hungry animals make nothing.
  w.trough = 0;
  const pickups = w.pickups.length;
  w.sleep();
  assert.equal(w.pickups.length, pickups);
});

test('villagers: talk once a day, gifts by preference, hearts grow', () => {
  const w = freshWorld();
  w.minute = 10 * 60;
  const r1 = w.talkTo('mabel');
  assert.equal(r1.first, true);
  assert.equal(r1.line, VILLAGERS.mabel.intro);
  assert.equal(w.villagers.mabel.points, 20);
  w.talkTo('mabel');
  assert.equal(w.villagers.mabel.points, 20);
  w.add('strawberry', 2);
  const g = w.gift('mabel', 'strawberry');
  assert.equal(g.reaction, 'love');
  assert.equal(w.gift('mabel', 'strawberry'), null, 'one gift a day');
  assert.equal(w.inv.strawberry, 1);
  assert.equal(w.villagers.mabel.known.strawberry, 'love');
  assert.ok(w.goalsDone.gift);
  for (let d = 0; d < 6; d++) { w.sleep(); w.talkTo('mabel'); w.add('jam'); w.gift('mabel', 'jam'); }
  assert.ok(w.goalsDone.hearts3);
});

test('villagers walk their schedules and stay reachable', () => {
  const w = freshWorld();
  for (let i = 0; i < 20 * 60 * 2; i++) {
    w.step(0.5, {});
    for (const [id, v] of Object.entries(w.vpos)) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y), id);
      if (!v.hidden) assert.ok(!w.map.solid[idx(Math.floor(v.x), Math.floor(v.y))], `${id} stands in a wall at ${v.x},${v.y}`);
    }
    if (w.minute > 23 * 60) break;
  }
  // Late evening: everybody is home.
  assert.ok(Object.values(w.vpos).every((v) => v.hidden));
});

test('the egg hunt: find eight eggs to win the prize', () => {
  const w = freshWorld();
  w.day = 3; w.startDay();
  assert.equal(w.festival, 'egghunt');
  assert.equal(w.weather, 'sunny');
  w.minute = FESTIVALS.egghunt.start - 1;
  w.step(1, {});
  const eggs = w.pickups.filter((p) => p.festival);
  assert.equal(eggs.length, FESTIVALS.egghunt.total);
  for (const e of eggs.slice(0, 8)) { standAt(w, e.x, e.y); w.step(0.01, {}); }
  assert.ok(w.festivalsWon.egghunt);
  assert.equal(w.inv.bunny, 1);
  assert.ok(w.goalsDone.festival);
});

test('lantern night: light all eight lanterns', () => {
  const w = freshWorld();
  w.day = 7 + 4; w.startDay();
  assert.equal(w.festival, 'lanterns');
  w.minute = FESTIVALS.lanterns.start + 10;
  for (const [x, y] of LANTERNS) {
    // Stand on a free neighbour of each post.
    const spots = [[x, y + 1], [x, y - 1], [x - 1, y], [x + 1, y]].filter(([sx, sy]) => !w.solidAt(sx, sy) && !w.map.water[idx(sx, sy)]);
    assert.ok(spots.length, `lantern ${x},${y} has room to stand`);
    standAt(w, ...spots[0]);
    useOn(w, 'hoe', x, y);
  }
  assert.ok(w.festivalsWon.lanterns);
  assert.equal(w.inv.lantern, 1);
});

test('harvest fair judging and the snow festival', () => {
  const w = freshWorld();
  w.day = 14 + 4; w.startDay();
  assert.equal(w.festival, 'fair');
  w.minute = 10 * 60;
  w.add('pumpkin'); w.add('egg'); w.add('cheese');
  const res = w.submitFair(['pumpkin', 'egg', 'cheese']);
  assert.equal(res.ribbon, 'gold');
  assert.ok(w.festivalsWon.fair);
  assert.equal(w.submitFair(['pumpkin']), null, 'one entry per fair');
  const s = freshWorld();
  s.day = 21 + 3; s.startDay();
  assert.equal(s.festival, 'snow');
  s.minute = 11 * 60;
  for (let i = 0; i < 3; i++) s.catchFish('town');
  assert.ok(s.festivalsWon.snow);
});

test('decorations go on farm grass and come back with the hoe', () => {
  const w = freshWorld();
  w.add('gnome');
  standAt(w, 20, 20, 'down');
  w.obj[idx(20, 21)] = null;
  w.tuft[idx(20, 21)] = 0;
  const g = w.map.ground[idx(20, 21)];
  useOn(w, 'gnome', 20, 21);
  if (g !== 1) {
    assert.equal(w.obj[idx(20, 21)]?.id, 'gnome');
    // Another tool leaves it in place and says how to pick it up, in words
    // that work for every kind of controller.
    w.events.length = 0;
    useOn(w, 'can', 20, 21);
    assert.equal(w.obj[idx(20, 21)]?.id, 'gnome');
    const tip = w.events.find((e) => e.type === 'toast');
    assert.match(tip.text, /hoe/);
    assert.doesNotMatch(tip.text, /Press|Space|click/i);
    useOn(w, 'hoe', 20, 21);
    assert.equal(w.obj[idx(20, 21)], null);
    assert.equal(w.inv.gnome, 1);
  }
  // Never in town.
  standAt(w, 45, 20, 'down');
  useOn(w, 'gnome', 45, 21);
  assert.equal(w.obj[idx(45, 21)], null);
});

test('fishing: wait for the bite, then pull', () => {
  const w = freshWorld();
  w.minute = 10 * 60;
  // Stand on the shore of the farm pond facing the water.
  let shore = null;
  for (let y = 25; y < 36 && !shore; y++) for (let x = 19; x < 31 && !shore; x++) {
    if (!w.solidAt(x, y) && w.map.water[idx(x + 1, y)]) shore = [x, y];
  }
  assert.ok(shore);
  standAt(w, shore[0], shore[1], 'right');
  useOn(w, 'rod', shore[0] + 1, shore[1]);
  assert.ok(w.player.fishing);
  // The first cast explains how to reel in, without naming a key.
  const tip = w.events.find((e) => e.type === 'toast' && /reel it in/.test(e.text));
  assert.ok(tip);
  assert.doesNotMatch(tip.text, /Space|press|click|tap/i);
  let t = 0;
  while (w.player.fishing.state === 'cast' && t < 10) { w.step(0.05, {}); t += 0.05; }
  assert.equal(w.player.fishing.state, 'bite');
  w.step(0.05, { use: true });
  assert.equal(w.player.fishing, null);
  assert.equal(w.stats.fishCaught, 1);
  assert.ok(w.goalsDone.fish);
});

test('click-to-walk reaches a far tile and acts on it', () => {
  const w = freshWorld();
  w.minute = 9 * 60;
  const [cx, cy] = SHOP_COUNTER[1];
  w.step(0.016, { slot: 0, target: [cx, cy] });
  let opened = false;
  for (let i = 0; i < 3000 && !opened; i++) {
    w.step(0.016, {});
    opened = w.events.some((e) => e.type === 'menu' && e.menu === 'shop');
    w.events.length = 0;
  }
  assert.ok(opened, 'walked to the store counter and opened the shop');
});

test('passing out at 2 am is gentle', () => {
  const w = freshWorld();
  w.minute = 26 * 60 - 1;
  w.step(1, {});
  assert.ok(w.events.some((e) => e.type === 'passout'));
  const money = w.money;
  const s = w.sleep(true);
  assert.equal(s.passedOut, true);
  assert.equal(w.money, money);
  assert.equal(w.day, 1);
});

test('the farm house door opens the home menu', () => {
  const w = freshWorld();
  const house = BUILDINGS.find((b) => b.id === 'house');
  standAt(w, house.door[0], house.door[1] + 1, 'up');
  useOn(w, 'hoe', house.door[0], house.door[1]);
  assert.equal(menuOf(takeEvents(w)), 'home');
  w.add('milk');
  assert.ok(w.craft('cheese'));
  assert.equal(w.inv.cheese, 1);
  assert.ok(w.collection.goods.cheese);
});

test('a new world is deterministic from its seed', () => {
  const a = new World({ seed: 42 }), b = new World({ seed: 42 });
  assert.deepEqual(a.obj, b.obj);
  assert.deepEqual(a.requests, b.requests);
  for (let i = 0; i < 200; i++) { a.step(0.05, { mx: 1 }); b.step(0.05, { mx: 1 }); }
  assert.deepEqual(a.player, b.player);
  assert.deepEqual(a.critters, b.critters);
});
