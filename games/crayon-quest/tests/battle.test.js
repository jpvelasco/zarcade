import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun } from '../src/run.js';
import {
  HAND_SIZE, attackDamage, createBattle, endTurn, incomingDamage, intentView, living, playCard, beginEnemyTurn, enemyAct, endPlayerTurn, endEnemyTurn,
} from '../src/battle.js';
import { MONSTER } from '../src/data.js';

function setup(enemies = ['blob'], { hero = 'kid', deck = null, stickers = null, seed = 1 } = {}) {
  const run = newRun({ seed, hero });
  if (deck) run.deck = deck.map((id, i) => ({ uid: 100 + i, id, up: false }));
  if (stickers) run.stickers = stickers;
  createBattle(run, enemies, 'battle');
  return run;
}

function handOf(run, ids) {
  const b = run.battle;
  b.hand = ids.map((id, i) => ({ uid: 500 + i, id, up: false }));
}

test('battles start with 3 energy, 5 cards and intents', () => {
  const run = setup(['blob', 'bat']);
  const b = run.battle;
  assert.equal(b.player.energy, 3);
  assert.equal(b.hand.length, HAND_SIZE);
  assert.equal(b.hand.length + b.draw.length, run.deck.length);
  for (const e of b.enemies) assert.ok(e.intent, 'intent chosen');
});

test('damage: power adds, dizzy is 25% softer, soggy is 50% more', () => {
  assert.equal(attackDamage(6, { power: 2, dizzy: 0 }, { soggy: 0 }), 8);
  assert.equal(attackDamage(8, { power: 0, dizzy: 1 }, { soggy: 0 }), 6);
  assert.equal(attackDamage(6, { power: 0, dizzy: 0 }, { soggy: 2 }), 9);
  assert.equal(attackDamage(0, { power: -3, dizzy: 0 }, null), 0);
});

test('a card costs energy, hits the chosen monster and shield soaks damage', () => {
  const run = setup(['blob', 'blob']);
  const b = run.battle;
  handOf(run, ['scribble', 'doodle_shield']);
  const target = b.enemies[1];
  target.block = 2;
  const hp = target.hp;
  assert.ok(playCard(run, 0, target.uid));
  assert.equal(b.player.energy, 2);
  assert.equal(target.block, 0);
  assert.equal(target.hp, hp - 4);
  assert.equal(b.enemies[0].hp, b.enemies[0].maxHp, 'other monster untouched');
  assert.ok(playCard(run, 0, 0));
  assert.equal(b.player.block, 5);
  assert.equal(b.discard.length, 2);
});

test('cards cannot be played without enough energy', () => {
  const run = setup(['blob']);
  const b = run.battle;
  handOf(run, ['heavy_marker', 'heavy_marker']);
  assert.ok(playCard(run, 0, b.enemies[0].uid));
  assert.equal(playCard(run, 0, b.enemies[0].uid), false);
});

test('area attacks hit every monster and defeating them all wins', () => {
  const run = setup(['bat', 'bat']);
  const b = run.battle;
  for (const e of b.enemies) e.hp = 3;
  handOf(run, ['rainbow_wave']);
  playCard(run, 0, 0);
  assert.equal(living(b).length, 0);
  assert.equal(b.over, 'won');
  assert.ok(run.met.includes('bat'));
});

test('smudge ticks at the start of the monster turn and goes down', () => {
  const run = setup(['paperball']);
  const b = run.battle;
  const e = b.enemies[0];
  handOf(run, ['paint_splat']);
  playCard(run, 0, e.uid);
  assert.equal(e.smudge, 5);
  const hp = e.hp;
  endPlayerTurn(run);
  beginEnemyTurn(run);
  assert.equal(e.hp, hp - 5);
  assert.equal(e.smudge, 4);
});

test('soggy from a monster lasts through the next monster turn', () => {
  const run = setup(['snake']);
  const b = run.battle;
  const e = b.enemies[0];
  e.intent = { t: 'atkdebuff', dmg: 4, soggy: 1, idx: 1 };
  endPlayerTurn(run);
  beginEnemyTurn(run);
  enemyAct(run, e.uid);
  assert.equal(b.player.soggy, 1);
  endEnemyTurn(run);
  assert.equal(b.player.soggy, 1, 'still soggy for the next enemy turn');
  b.player.block = 0;
  e.intent = { t: 'atk', dmg: 4, idx: 0 };
  assert.equal(intentView(b, e).dmg, 6, 'intent shows the soggy damage');
  endPlayerTurn(run);
  beginEnemyTurn(run);
  enemyAct(run, e.uid);
  endEnemyTurn(run);
  assert.equal(b.player.soggy, 0);
});

test('dizzy on a monster softens its next attack, then wears off', () => {
  const run = setup(['eraser']);
  const b = run.battle;
  const e = b.enemies[0];
  e.intent = { t: 'atk', dmg: 8, idx: 0 };
  handOf(run, ['tickle_feather']);
  playCard(run, 0, e.uid);
  assert.equal(incomingDamage(b), 6);
  const hp = run.hp;
  b.player.block = 0;
  endTurn(run);
  assert.equal(run.hp, hp - 6);
  assert.equal(e.dizzy, 0);
});

test('magic cards stay all battle and trigger every turn', () => {
  const run = setup(['paperball']);
  const b = run.battle;
  handOf(run, ['crayon_armor', 'masterpiece']);
  b.player.energy = 3;
  playCard(run, 0, 0);
  playCard(run, 0, 0);
  assert.equal(b.poofed.length, 2, 'magic cards leave the deck cycle');
  const e = b.enemies[0];
  e.intent = { t: 'def', block: 0, idx: 0 };
  const hp = e.hp;
  endPlayerTurn(run);
  assert.equal(b.player.block, 3, 'armor at end of turn');
  assert.equal(e.hp, hp - 3, 'masterpiece hits at end of turn');
});

test('flurry hits once for each card played this turn', () => {
  const run = setup(['ruler_robot'], { hero: 'ninja' });
  const b = run.battle;
  handOf(run, ['eraser_dash', 'crayon_toss', 'flurry']);
  const e = b.enemies[0];
  playCard(run, 0, e.uid);
  playCard(run, 0, e.uid);
  const hp = e.hp;
  playCard(run, b.hand.findIndex((c) => c.id === 'flurry'), e.uid);
  assert.equal(hp - e.hp, 9, '3 hits of 3');
});

test('drawing reshuffles the discard pile', () => {
  const run = setup(['blob'], { deck: ['scribble', 'scribble', 'scribble', 'scribble', 'scribble', 'scribble', 'doodle_shield'] });
  const b = run.battle;
  assert.equal(b.draw.length, 2);
  b.enemies[0].intent = { t: 'def', block: 1, idx: 0 };
  endTurn(run);
  assert.equal(b.hand.length, 5);
  assert.equal(b.hand.length + b.draw.length + b.discard.length, 7);
});

test('the hero can lose, and HP never goes below zero', () => {
  const run = setup(['blob']);
  const b = run.battle;
  run.hp = 3;
  b.enemies[0].intent = { t: 'atk', dmg: 30, idx: 0 };
  endTurn(run);
  assert.equal(b.over, 'lost');
  assert.equal(run.hp, 0);
});

test('bosses summon helpers but never more than three monsters', () => {
  const run = setup(['king_scribble']);
  const b = run.battle;
  for (let t = 0; t < 12 && !b.over; t++) {
    b.player.block = 999;
    endTurn(run);
    assert.ok(living(b).length <= 3);
  }
  assert.ok(b.enemies.some((e) => e.id === 'blob'), 'King Scribble called a blob');
});

test('random move patterns never repeat a move three times running', () => {
  const run = setup(['blob']);
  const b = run.battle;
  const e = b.enemies[0];
  const seen = [];
  for (let t = 0; t < 40; t++) {
    seen.push(e.intent.idx);
    b.player.block = 999;
    e.hp = 999;
    e.maxHp = 999;
    endTurn(run);
  }
  for (let i = 2; i < seen.length; i++) assert.ok(!(seen[i] === seen[i - 1] && seen[i] === seen[i - 2]), `run ${seen.join(',')}`);
});

test('sticker effects apply at battle start and every turn', () => {
  const run = setup(['blob', 'blob'], { stickers: ['helmet', 'palette', 'thumbs_up', 'unicorn', 'owl'] });
  const b = run.battle;
  assert.equal(b.player.block, 7);
  assert.equal(b.player.power, 1);
  assert.equal(b.player.energy, 4);
  assert.equal(b.hand.length, 6);
  for (const e of b.enemies) assert.equal(e.smudge, 3);
});

test('gentle mode gives monsters less HP', () => {
  const run = newRun({ seed: 3, gentle: true });
  createBattle(run, ['king_scribble'], 'boss');
  assert.equal(run.battle.enemies[0].maxHp, Math.round(MONSTER.king_scribble.hp[0] * 0.75));
});

test('thorns never turn a knockout into a win', () => {
  const run = setup(['bat'], { stickers: ['cactus'] });
  const b = run.battle;
  const e = b.enemies[0];
  e.hp = 2;
  e.intent = { t: 'atk', dmg: 30, idx: 0 };
  run.hp = 5;
  endTurn(run);
  assert.equal(b.over, 'lost');
  assert.equal(run.hp, 0);
});

test('thorns hurt monsters that hit the hero', () => {
  const run = setup(['paperball'], { stickers: ['cactus'] });
  const b = run.battle;
  const e = b.enemies[0];
  e.intent = { t: 'atk', dmg: 2, hits: 2, idx: 0 };
  const hp = e.hp;
  endTurn(run);
  assert.equal(e.hp, hp - 6);
});
