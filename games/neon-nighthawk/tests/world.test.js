import test from 'node:test';
import assert from 'node:assert/strict';
import { aiInput } from '../src/ai.js';
import { World } from '../src/world.js';

const DT = 1 / 60;

function startedWorld(seed = 911) {
  const world = new World(seed);
  world.startContract();
  world.nextPatrolAt = Infinity;
  world.traffic = [];
  return world;
}

test('a contract moves from pickup to delivery and awards a result', () => {
  const world = startedWorld();
  world.player.x = world.contract.pickup.x;
  world.player.y = world.contract.pickup.y;
  world.step(DT, {});
  assert.equal(world.status, 'delivery');
  assert.equal(world.player.carrying, true);

  world.player.x = world.contract.delivery.x;
  world.player.y = world.contract.delivery.y;
  world.step(DT, {});
  assert.equal(world.status, 'debrief');
  assert.ok(world.currentResult.earned > 0);
  assert.equal(world.currentResult.contractsDone, 1);
});

test('dash spends charge and grants a short invulnerable burst', () => {
  const world = startedWorld();
  world.player.charge = world.player.maxCharge;
  const before = world.player.charge;
  world.step(DT, { dash: true });
  assert.ok(world.player.charge < before);
  assert.ok(world.player.dash > 0);
  assert.equal(world.damage(50, 'traffic'), false);
});

test('a slow curb correction does not repeatedly damage the bike', () => {
  const world = startedWorld();
  world.player.x = -31;
  world.player.y = 49;
  world.player.vx = 2;
  world.player.vy = 0;
  const integrity = world.player.integrity;
  world.step(DT, {});
  assert.equal(world.player.integrity, integrity);
});

test('street stabilizers pull an edge-bound bike back toward a safe centerline', () => {
  const world = startedWorld();
  world.player.x = -30;
  world.player.y = 145;
  world.player.vx = 0;
  world.player.vy = 160;
  const before = Math.abs(world.player.x);
  world.step(DT, {});
  assert.ok(Math.abs(world.player.x) < before);
});

test('centerline riding earns a near miss from curb-lane traffic without a collision', () => {
  const world = startedWorld();
  const player = world.player;
  player.x = 0;
  player.y = 0;
  player.speed = 220;
  world.traffic = [{
    axis: 'y', road: 0, lane: 27, dir: 1, pos: 0, speed: 100, length: 25, nearCooldown: 0, hitCooldown: 0,
  }];
  const integrity = player.integrity;
  world.checkTraffic();
  assert.equal(player.integrity, integrity);
  assert.ok(player.charge > 46);
});

test('an echo replays a trail and a pulse jams nearby patrols', () => {
  const world = startedWorld();
  const player = world.player;
  player.charge = player.maxCharge;
  player.trail = Array.from({ length: 12 }, (_, index) => ({
    x: index * 8,
    y: 0,
    age: 0.3 + index * 0.08,
    drifting: true,
  }));
  world.step(DT, { echo: true });
  assert.equal(world.echoes.length, 1);

  world.step(DT, {});
  world.patrols.push({
    x: player.x + 30, y: player.y, vx: 0, vy: 0, angle: 0,
    scan: 0, jammed: 0, radius: 20, flash: 0, chasingEcho: false, hitCooldown: 0,
  });
  player.charge = player.maxCharge;
  world.step(DT, { pulse: true });
  assert.ok(world.patrols[0].jammed > 0);
});

test('only signal-sensitive cargo loses integrity to a scan', () => {
  const glasshouse = startedWorld(34);
  glasshouse.status = 'delivery';
  glasshouse.player.carrying = true;
  glasshouse.contract.type = { ...glasshouse.contract.type, scanDamage: 0 };
  const glassIntegrity = glasshouse.player.integrity;
  glasshouse.scanHit();
  assert.equal(glasshouse.player.integrity, glassIntegrity);

  const signal = startedWorld(35);
  signal.status = 'delivery';
  signal.player.carrying = true;
  signal.contract.type = { ...signal.contract.type, scanDamage: 1.45 };
  const signalIntegrity = signal.player.integrity;
  signal.scanHit();
  assert.equal(signal.player.integrity, signalIntegrity - 6.525);
});

test('a contract expires into a recoverable failure state', () => {
  const world = startedWorld();
  world.contract.timeRemaining = 0.001;
  world.step(DT, {});
  assert.equal(world.status, 'failed');
  assert.match(world.failure, /window/);
  assert.equal(world.retryContract(), true);
  assert.equal(world.status, 'briefing');
});

test('the cautious autopilot can complete a generated delivery without traffic', () => {
  const world = startedWorld(34);
  for (let frame = 0; frame < 60 * 210 && world.status !== 'debrief' && world.status !== 'failed'; frame++) {
    world.step(DT, aiInput(world));
    world.events.length = 0;
  }
  assert.equal(world.status, 'debrief', world.failure || 'pilot did not deliver');
  assert.ok(world.currentResult.integrity > 65);
});
