import test from 'node:test';
import assert from 'node:assert/strict';
import {
  available, buyCard, buySticker, chooseEvent, choosePick, dailyHero, enterNode, eventOptionEnabled, finishBattle, leaveNode, newRun,
  openChest, restColor, restNap, startErase, startFight, takeRewardCard, upgradable, cardChoices, scoreRun,
} from '../src/run.js';
import { CARD, EVENTS, HERO, HEROES } from '../src/data.js';
import { endTurn, living, playCard } from '../src/battle.js';
import { dailySeed } from '../src/rng.js';
import { botStep } from '../src/bot.js';

// Leave every monster on 1 HP and hand the hero a Rainbow Wave.
function setUpWin(run) {
  const b = run.battle;
  for (const e of living(b)) e.hp = 1;
  b.hand = [{ uid: 999, id: 'rainbow_wave', up: false }];
  b.player.energy = 3;
}

test('new runs start with the hero deck, sticker and full HP', () => {
  for (const h of HEROES) {
    const run = newRun({ seed: 1, hero: h.id });
    assert.equal(run.deck.length, 10);
    assert.equal(run.hp, h.hp);
    assert.deepEqual(run.stickers, [h.sticker]);
    assert.equal(new Set(run.deck.map((c) => c.uid)).size, 10, 'unique card ids');
    assert.equal(run.phase, 'map');
  }
});

test('entering a battle node starts a fight and winning gives a reward', () => {
  const run = newRun({ seed: 2 });
  const start = available(run)[0];
  assert.ok(enterNode(run, start));
  assert.equal(run.phase, 'battle');
  setUpWin(run);
  assert.ok(playCard(run, 0, 0));
  assert.equal(run.battle.over, 'won');
  const gold = run.gold;
  finishBattle(run);
  assert.equal(run.phase, 'reward');
  assert.ok(run.gold > gold);
  assert.equal(run.reward.cards.length, 3);
  assert.ok(takeRewardCard(run, 1));
  assert.equal(takeRewardCard(run, 0), false, 'only one card per reward');
  assert.equal(run.deck.length, 11);
  leaveNode(run);
  assert.equal(run.phase, 'map');
  assert.deepEqual(available(run), run.map.nodes[start].next);
});

test('card rewards respect the hero pool', () => {
  const run = newRun({ seed: 9, hero: 'knight' });
  for (let i = 0; i < 60; i++) {
    for (const id of cardChoices(run, 'battle')) {
      const c = CARD[id];
      assert.notEqual(c.rarity, 'starter');
      assert.ok(c.hero === null || c.hero === 'knight', id);
    }
  }
  assert.ok(cardChoices(run, 'boss').every((id) => CARD[id].rarity === 'rare'));
});

test('losing a battle ends the run with a score', () => {
  const run = newRun({ seed: 3 });
  enterNode(run, available(run)[0]);
  run.hp = 1;
  for (const e of run.battle.enemies) e.intent = { t: 'atk', dmg: 50, idx: 0 };
  endTurn(run);
  assert.equal(run.battle.over, 'lost');
  finishBattle(run);
  assert.equal(run.phase, 'over');
  assert.equal(run.result, 'lost');
  assert.equal(run.score, scoreRun(run));
});

test('rest stops heal or upgrade', () => {
  const run = newRun({ seed: 4 });
  run.phase = 'rest';
  run.rest = { done: false };
  run.hp = 20;
  assert.equal(restNap(run), 21);
  assert.equal(run.hp, 41);
  const r2 = newRun({ seed: 4 });
  r2.phase = 'rest';
  r2.rest = { done: false };
  const before = upgradable(r2).length;
  assert.ok(restColor(r2));
  assert.ok(choosePick(r2, r2.deck[0].uid));
  assert.equal(upgradable(r2).length, before - 1);
  assert.equal(r2.rest.done, true);
});

test('the shop sells cards and stickers and erases cards', () => {
  const run = newRun({ seed: 5 });
  run.gold = 1000;
  enterNode(run, available(run)[0]);
  // jump straight into a shop
  run.battle = null;
  run.phase = 'map';
  const shopId = Object.values(run.map.nodes).find((n) => n.type === 'shop').id;
  run.at = null;
  run.map.nodes[shopId].row = 0; // reachable for the test
  enterNode(run, shopId);
  assert.equal(run.phase, 'shop');
  assert.equal(run.shop.cards.length, 5);
  const deck = run.deck.length;
  assert.ok(buyCard(run, 0));
  assert.equal(buyCard(run, 0), false, 'sold out');
  assert.ok(buySticker(run, 0));
  assert.equal(run.stickers.length, 2);
  assert.ok(startErase(run));
  assert.ok(choosePick(run, run.deck[0].uid));
  assert.equal(run.deck.length, deck);
  assert.equal(startErase(run), false, 'one erase per shop');
  const spent = 1000 - run.gold;
  assert.equal(spent, run.shop.cards[0].price + run.shop.stickers[0].price + run.shop.erasePrice);
});

test('every mystery page option works and stays gentle', () => {
  for (const ev of EVENTS) {
    ev.options.forEach((opt, i) => {
      const run = newRun({ seed: 11 });
      run.gold = 100;
      run.phase = 'event';
      run.nodeKind = 'mystery';
      run.event = { id: ev.id, result: null };
      assert.ok(eventOptionEnabled(run, opt), `${ev.id}:${i}`);
      assert.ok(chooseEvent(run, i), `${ev.id}:${i}`);
      assert.ok(run.hp >= 1);
      for (let guard = 0; guard < 400 && run.phase !== 'map' && run.phase !== 'over'; guard++) botStep(run);
      assert.equal(run.phase, 'map', `${ev.id}:${i} returns to the map`);
    });
  }
});

test('heal events never say "healed 0 HP"', () => {
  for (const hp of ['full', 'hurt']) {
    const run = newRun({ seed: 11 });
    if (hp === 'hurt') run.hp -= 4;
    run.phase = 'event';
    run.event = { id: 'door', result: null };
    assert.ok(chooseEvent(run, 1));
    assert.doesNotMatch(run.event.result, /healed 0/);
    if (hp === 'hurt') assert.equal(run.event.result, 'You healed 4 HP.');
  }
});

test('treasure gives gold and a sticker', () => {
  const run = newRun({ seed: 12 });
  run.phase = 'map';
  const id = Object.values(run.map.nodes).find((n) => n.type === 'treasure').id;
  run.map.nodes[id].row = 0;
  enterNode(run, id);
  const gold = run.gold;
  assert.ok(openChest(run));
  assert.ok(run.gold > gold);
  assert.equal(run.stickers.length, 2);
  assert.equal(openChest(run), false);
});

test('beating a boss turns the page; the last boss wins the run', () => {
  const run = newRun({ seed: 13 });
  for (let floor = 0; floor < 3; floor++) {
    run.phase = 'map';
    run.nodeKind = 'boss';
    startFight(run, 'boss');
    for (const e of run.battle.enemies) e.dead = true;
    run.battle.over = 'won';
    run.hp = 10;
    finishBattle(run);
    assert.equal(run.phase, 'reward');
    assert.ok(run.reward.sticker, 'boss sticker');
    leaveNode(run);
    if (floor < 2) {
      assert.equal(run.floor, floor + 1);
      assert.equal(run.phase, 'map');
      assert.ok(run.hp > 10, 'healed between pages');
    }
  }
  assert.equal(run.phase, 'over');
  assert.equal(run.result, 'won');
  assert.ok(run.score > 300);
});

test('runs survive a JSON round trip and continue identically', () => {
  const a = newRun({ seed: 21, hero: 'wizard' });
  for (let i = 0; i < 60; i++) botStep(a);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 400; i++) {
    botStep(a);
    botStep(b);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('the daily page is the same run for everyone on the same day', () => {
  const seed = dailySeed('2026-10-01');
  const a = newRun({ seed, daily: true, dateKey: '2026-10-01', gentle: true });
  const b = newRun({ seed, daily: true, dateKey: '2026-10-01' });
  assert.equal(a.hero, dailyHero(seed));
  assert.ok(HERO[a.hero]);
  assert.equal(a.gentle, false, 'daily is always normal mode');
  assert.deepEqual(a.map, b.map);
  assert.deepEqual(a.deck, b.deck);
  const other = newRun({ seed: dailySeed('2026-10-02'), daily: true });
  assert.notDeepEqual(other.map, a.map);
});
