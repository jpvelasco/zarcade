import test from 'node:test';
import assert from 'node:assert/strict';
import { damageAfterArmor, effectiveSpeed, pickTarget, auraFor, starsFor, canTarget } from '../src/combat.js';
import { DEFENDERS, SLIME_BOOST } from '../src/data.js';
import { Game } from '../src/game.js';

const bug = (id, x, y, hp, remaining, flying = false) => ({ id, x, y, hp, remaining, flying });

test('targeting modes pick first, strongest and closest', () => {
  const tower = { x: 0, y: 0 };
  const bugs = [bug(1, 2, 0, 10, 5), bug(2, 1, 0, 50, 9), bug(3, 0, 1.5, 30, 2), bug(4, 9, 9, 999, 0)];
  assert.equal(pickTarget(tower, 2.5, bugs, 'first').id, 3);
  assert.equal(pickTarget(tower, 2.5, bugs, 'strongest').id, 2);
  assert.equal(pickTarget(tower, 2.5, bugs, 'closest').id, 2);
  assert.equal(pickTarget(tower, 0.5, bugs, 'first'), null, 'out of range');
  bugs[2].hp = 0;
  assert.equal(pickTarget(tower, 2.5, bugs, 'first').id, 1, 'ignores shooed bugs');
});

test('air and ground filters follow defender roles', () => {
  const flyer = bug(1, 0, 0, 10, 1, true), walker = bug(2, 0, 0, 10, 2);
  assert.equal(canTarget(DEFENDERS.pea, flyer), true);
  assert.equal(canTarget(DEFENDERS.sunflower, flyer), false);
  assert.equal(canTarget(DEFENDERS.thistle, walker), false);
  assert.equal(pickTarget({ x: 0, y: 0 }, 3, [flyer, walker], 'first', (b) => canTarget(DEFENDERS.thistle, b)).id, 1);
});

test('armor subtracts flat damage but lets at least 20% through; magic ignores it', () => {
  assert.equal(damageAfterArmor(10, 0), 10);
  assert.equal(damageAfterArmor(10, 4), 6);
  assert.equal(damageAfterArmor(10, 12), 2);
  assert.equal(damageAfterArmor(10, 12, true), 10);
});

test('slow, slime and slow resistance combine', () => {
  assert.equal(effectiveSpeed(1, 0), 1);
  assert.equal(effectiveSpeed(1, 0.5), 0.5);
  assert.ok(Math.abs(effectiveSpeed(1, 0, true) - (1 + SLIME_BOOST)) < 1e-9);
  assert.equal(effectiveSpeed(1, 0.5, false, 0.5), 0.75);
  assert.ok(effectiveSpeed(1, 5) > 0, 'never fully stopped');
});

test('lavender auras buff neighbours and do not stack', () => {
  const a = { type: 'pea', x: 1.5, y: 1.5 };
  const l1 = { type: 'lavender', tier: 0, x: 2.5, y: 1.5 };
  const l2 = { type: 'lavender', tier: 2, x: 1.5, y: 2.5 };
  const far = { type: 'lavender', tier: 2, x: 9.5, y: 9.5 };
  assert.equal(auraFor(a, [a, far]).dmg, 0);
  assert.equal(auraFor(a, [a, l1]).dmg, 0.15);
  assert.equal(auraFor(a, [a, l1, l2]).dmg, 0.35);
});

test('stars follow picnic baskets left', () => {
  assert.equal(starsFor(10, 10), 3);
  assert.equal(starsFor(9, 10), 3);
  assert.equal(starsFor(6, 10), 2);
  assert.equal(starsFor(1, 10), 1);
  assert.equal(starsFor(0, 10), 0);
});

function runUntil(game, pred, max = 60 * 120) {
  for (let i = 0; i < max && !pred(); i++) game.step();
}

test('beetle armor slows pea kills; mage magic ignores it', () => {
  const g = new Game(0, { recordEvents: false });
  const b = g.spawnBug('beetle', 0, 1, 5);
  g.status = 'playing';
  const hpBefore = b.hp;
  g.hurt(b, 9, false);
  assert.equal(hpBefore - b.hp, 5);
  g.hurt(b, 9, true);
  assert.equal(hpBefore - b.hp, 14);
});

test('honey puddles slow ground bugs but not flyers', () => {
  const g = new Game(3, { recordEvents: false });
  g.status = 'playing';
  const ant = g.spawnBug('ant', 0, 1, 4);
  const fly = g.spawnBug('butterfly', 0, 1, 4);
  g.puddles.push({ x: ant.x, y: ant.y, r: 3, slow: 0.5, life: 10, max: 10 });
  g.puddles.push({ x: fly.x, y: fly.y, r: 3, slow: 0.5, life: 10, max: 10 });
  const a0 = ant.dist, f0 = fly.dist;
  g.step(0.1);
  assert.ok(Math.abs(ant.dist - a0 - 0.1 * 1.05 * 0.5) < 1e-6);
  assert.ok(Math.abs(fly.dist - f0 - 0.1 * 1.05) < 1e-6);
});

test('snails leave slime that speeds up other bugs', () => {
  const g = new Game(1, { recordEvents: false });
  g.status = 'playing';
  const snail = g.spawnBug('snail', 0, 1, 3);
  runUntil(g, () => g.slimes.length > 0);
  const s = g.slimes[0];
  const ant = g.spawnBug('ant', 0, 1, snail.dist - 0.1);
  g.step(1 / 60);
  assert.equal(ant.slimed, true, `ant at ${ant.x},${ant.y} vs slime ${s.x},${s.y}`);
});

test('caterpillars split into wigglers when shooed', () => {
  const g = new Game(2, { recordEvents: false });
  g.status = 'playing';
  const c = g.spawnBug('caterpillar', 0, 1, 5);
  g.hurt(c, 999, false);
  const kids = g.bugs.filter((b) => b.alive && b.type === 'wiggler');
  assert.equal(kids.length, 2);
  assert.ok(kids.every((k) => Math.abs(k.dist - c.dist) < 0.5));
});

test('flyers take the corner-cutting route and reach the picnic sooner', () => {
  const g = new Game(4, { recordEvents: false });
  assert.ok(g.info.flyRoutes[0].length < g.info.routes[0].length * 0.6);
});

test('leaking bugs cost baskets and losing ends the game', () => {
  const g = new Game(0);
  g.startWave();
  const b = g.spawnBug('ant', 0, 1, g.info.routes[0].length - 0.01);
  g.baskets = 1;
  g.step();
  assert.equal(b.alive, false);
  assert.equal(g.status, 'lost');
  assert.ok(g.events.some((e) => e.type === 'leak'));
});
