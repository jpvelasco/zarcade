import test from 'node:test';
import assert from 'node:assert/strict';
import { World, INTRO } from '../src/world.js';
import { buildJourney } from '../src/journey.js';
import { planet } from '../src/galaxy.js';
import { aiInput } from '../src/ai.js';
import { statsFor } from '../src/progress.js';
import { LANE } from '../src/entities.js';

const DT = 1 / 60;
const PLANETS = ['H.0', 'H.1', 'H.2', 'H.0.0', 'H.1.1', 'H.2.0.1', 'H.0.1.2.0', 'H.2.2.1.0.1'];

function fly(world, controller, maxSeconds = 360) {
  for (let i = 0; i < maxSeconds * 60 && !['finished', 'destroyed'].includes(world.status); i++) {
    world.step(DT, controller ? controller(world) : {});
    if (world.status === 'shop') { world.applyMenuItem('burger'); world.leaveShop(); }
    world.events.length = 0;
  }
  return world;
}

// A clumsy young pilot: never dodges bolts or rolls, reacts 0.3 s late,
// and wobbles. With the upgrades a player could afford by then, they should
// still reach every planet.
function kid(seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const queue = [];
  return (w) => {
    const want = w.time >= 0 ? aiInput(w, { dodgeBolts: false }) : {};
    queue.push({ ...want, x: (want.x || 0) + (rand() - 0.5) * 0.8, y: (want.y || 0) + (rand() - 0.5) * 0.8 });
    return queue.length > 18 ? queue.shift() : {};
  };
}
const TYPICAL_UPGRADES = [{}, {}, { cannon: 1 }, { cannon: 1, hull: 1, shield: 1 }, { cannon: 2, hull: 1, shield: 1 }, { cannon: 2, hull: 2, shield: 2, missiles: 1 }];

for (const id of PLANETS) {
  const p = planet(id);
  test(`${id} (${p.biome}, depth ${p.depth}): autopilot arrives with hull to spare`, () => {
    const w = fly(new World(p, { autopilot: true }));
    assert.equal(w.status, 'finished');
    assert.ok(w.player.hull > w.player.maxHull * 0.5, `hull ${w.player.hull}`);
    assert.ok(w.player.kills >= w.player.spawned * 0.5);
    assert.ok(w.time > 90 && w.time < 240, `journey took ${w.time.toFixed(0)} s`);
  });

  test(`${id}: a clumsy kid with typical upgrades still arrives`, () => {
    const w = fly(new World(p, { stats: statsFor(TYPICAL_UPGRADES[Math.min(5, p.depth)]) }), kid(p.depth + 1));
    assert.equal(w.status, 'finished', `destroyed at ${Math.round((w.player.s / w.journey.length) * 100)}%`);
  });
}

test('journeys are deterministic and keep landmarks clear', () => {
  const a = buildJourney(planet('H.2.1'));
  assert.deepEqual(a, buildJourney(planet('H.2.1')));
  for (const o of a.statics) {
    assert.ok(Math.abs(o.s - a.burger.s) > 250, 'nothing parked on the drive-thru');
    assert.ok(o.s < a.bossS - 250, 'boss arena is clear');
  }
  for (let i = 1; i < a.stretches.length; i++) {
    if (a.stretches[i].s0 === a.stretches[i - 1].s1) assert.ok(a.stretches.filter((s) => s.type === a.stretches[i].type).length < a.stretches.length);
  }
});

test('the intro holds the jet, then it launches at cruise speed', () => {
  const w = new World(planet('H.0'));
  for (let i = 0; i < 60 * (INTRO - 0.5); i++) w.step(DT, { fire: true });
  assert.equal(w.status, 'intro');
  assert.equal(w.player.s, 0);
  for (let i = 0; i < 60; i++) w.step(DT, {});
  assert.equal(w.status, 'flying');
  assert.ok(w.player.s > 0);
});

function quietWorld() {
  const w = new World(planet('H.0'));
  w.statics = []; w.pickups = []; w.journey.spawns = [];
  for (let i = 0; i < 60 * (INTRO + 0.2); i++) w.step(DT, {});
  w.events.length = 0;
  return w;
}

test('steering stays inside the lane', () => {
  const w = quietWorld();
  for (let i = 0; i < 300; i++) w.step(DT, { x: 1, y: 1 });
  assert.ok(w.player.u <= LANE.halfU && w.player.w <= LANE.halfW);
  assert.ok(w.player.u > LANE.halfU - 1);
});

test('aimed cannons destroy a fighter ahead', () => {
  const w = quietWorld();
  const e = w.addEnemy('fighter', { s: w.player.s + 120, u: 3, w: 1, vs: w.player.speed, state: 'engage', t: 0, engage: 99, hold: 120 });
  for (let i = 0; i < 180 && e.alive; i++) w.step(DT, { fire: true });
  assert.equal(e.alive, false);
  assert.equal(w.player.kills, 1);
  assert.ok(w.player.dust > 0);
});

test('shields soak damage before the hull; rolling deflects bolts', () => {
  const w = quietWorld();
  const p = w.player;
  w.damage(10, { bolt: true });
  assert.equal(p.hull, p.maxHull);
  assert.equal(p.shield, p.maxShield - 10);
  p.shield = 0;
  w.damage(10, { bolt: true });
  assert.equal(p.hull, p.maxHull - 10);
  p.roll = 0.3;
  assert.equal(w.damage(10, { bolt: true }), false);
});

test('flying through the drive-thru opens the shop; missing it does not', () => {
  const w = quietWorld();
  const b = w.journey.burger;
  w.player.s = b.s - 5; w.player.u = b.u; w.player.w = b.w;
  for (let i = 0; i < 10 && w.status !== 'shop'; i++) w.step(DT, {});
  assert.equal(w.status, 'shop');
  const hull = (w.player.hull = 40);
  w.applyMenuItem('combo');
  assert.ok(w.player.hull > hull && w.player.shield === w.player.maxShield);
  w.leaveShop();
  assert.equal(w.status, 'flying');

  const miss = quietWorld();
  const mb = miss.journey.burger;
  miss.player.s = mb.s - 5; miss.player.u = mb.u + 20;
  for (let i = 0; i < 10; i++) miss.step(DT, {});
  assert.notEqual(miss.status, 'shop');
});

test('hyperspace warps ahead but always stops short of the next landmark', () => {
  const w = quietWorld();
  w.applyPickup('hyper');
  assert.equal(w.status, 'hyper');
  for (let i = 0; i < 60 * 8 && w.status === 'hyper'; i++) w.step(DT, {});
  assert.equal(w.status, 'flying');
  assert.ok(w.player.s < w.journey.burger.s - 300);
  assert.ok(w.player.s > 1500);
});

test('the boss needs its weak points broken before the core, then you arrive', () => {
  const w = quietWorld();
  w.player.s = w.journey.bossS - 200;
  w.player.burgerDone = true;
  for (let i = 0; i < 60 * 12 && (!w.boss || w.boss.phase === "arrive"); i++) w.step(DT, {});
  const b = w.boss;
  assert.equal(b.phase, 'fight');
  assert.equal(w.targetable(b.core), false, 'core is shielded');
  for (const part of b.parts) w.hitEnemy(part, 999);
  assert.equal(b.phase, 'core');
  assert.equal(w.targetable(b.core), true);
  w.hitEnemy(b.core, 999);
  assert.equal(w.status, 'arriving');
  for (let i = 0; i < 60 * 5; i++) w.step(DT, {});
  assert.equal(w.status, 'finished');
});

test('asteroids split into smaller rocks when shot', () => {
  const w = quietWorld();
  const rock = { id: 1, kind: 'asteroid', size: 3, s: w.player.s + 20, u: 0, w: 0, hp: 1, du: 0, dw: 0, alive: true };
  w.statics.push(rock);
  const out = [];
  w.breakAsteroid(rock, out);
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o.size === 2));
});
