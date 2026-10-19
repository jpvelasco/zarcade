import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHit, armorBlocks, hurtPlayer, heartIcons, heal, knockbackStep, towards, PLAYER_IFRAMES, KNOCKBACK_TIME } from '../src/combat.js';
import { makeEnemy } from '../src/enemies.js';
import { newGame } from '../src/save.js';

test('a sword hit damages, knocks back and grants brief invulnerability', () => {
  const e = makeEnemy('slime', 100, 100);
  e.hp = 4;
  assert.equal(applyHit(e, 2, 80, 100), 'hit');
  assert.equal(e.hp, 2);
  assert.ok(e.kb.x > 0 && Math.abs(e.kb.y) < 1e-9, 'pushed away from the attacker');
  assert.equal(applyHit(e, 2, 80, 100), 'immune');
  e.iframes = 0;
  assert.equal(applyHit(e, 2, 80, 100), 'defeated');
});

test('beetle armor blocks hits from the front but not the back or while stunned', () => {
  const b = makeEnemy('beetle', 100, 100);
  b.face = { x: 1, y: 0 };
  assert.ok(armorBlocks(b, 130, 100), 'front');
  assert.ok(!armorBlocks(b, 70, 100), 'back');
  assert.ok(!armorBlocks(b, 100, 130), 'side');
  assert.equal(applyHit(b, 2, 130, 100), 'blocked');
  assert.equal(b.hp, 4);
  b.iframes = 0;
  b.stun = 1;
  assert.equal(applyHit(b, 2, 130, 100), 'hit');
});

test('heavy enemies are pushed less', () => {
  const light = makeEnemy('slime', 0, 0), heavy = makeEnemy('bigslime', 0, 0);
  applyHit(light, 1, -10, 0);
  applyHit(heavy, 1, -10, 0);
  assert.ok(heavy.kb.x < light.kb.x * 0.5);
});

test('knockback decays to nothing', () => {
  const kb = { x: 100, y: 0, t: KNOCKBACK_TIME };
  const first = knockbackStep(kb, 0.05).x;
  const second = knockbackStep(kb, 0.05).x;
  assert.ok(first > second && second > 0);
  for (let i = 0; i < 10; i++) knockbackStep(kb, 0.05);
  assert.equal(knockbackStep(kb, 0.05).x, 0);
});

test('hurting Wren: blink time, Fairy Tea rescue, then down', () => {
  const save = newGame();
  const p = { x: 0, y: 0, hp: 2, iframes: 0, kb: null, face: { x: 0, y: 1 } };
  save.tea = 1;
  assert.equal(hurtPlayer(p, save, 2, 10, 0), 'saved');
  assert.equal(save.tea, 0);
  assert.equal(p.hp, save.maxHearts * 2);
  assert.equal(p.iframes, PLAYER_IFRAMES);
  assert.equal(hurtPlayer(p, save, 2, 10, 0), 'immune');
  p.iframes = 0; p.hp = 1;
  assert.equal(hurtPlayer(p, save, 2, 10, 0), 'down');
  assert.equal(save.hearts, 0);
});

test('heart icons and healing respect containers', () => {
  assert.deepEqual(heartIcons(5, 3), ['full', 'full', 'half']);
  assert.deepEqual(heartIcons(0, 2), ['empty', 'empty']);
  const save = newGame();
  save.hearts = 1;
  heal(save, 99);
  assert.equal(save.hearts, 6);
});

test('towards() is a unit vector and safe at zero distance', () => {
  const d = towards(0, 0, 3, 4);
  assert.ok(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-9);
  assert.deepEqual(towards(5, 5, 5, 5), { x: 0, y: 1 });
});
