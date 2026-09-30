import test from 'node:test';
import assert from 'node:assert/strict';
import { aiInput } from '../src/ai.js';
import { BLOCK } from '../src/city.js';
import { CHAPTERS } from '../src/story.js';
import { World, assistDirection, blockKey } from '../src/world.js';

const DT = 1 / 60;

function startedWorld(seed = 911, chapter = 0, job = 0) {
  const world = new World(seed, { chapter, job });
  world.startContract();
  world.nextPatrolAt = Infinity;
  world.patrols = [];
  world.traffic = [];
  return world;
}

function ride(world, input, seconds) {
  for (let t = 0; t < seconds; t += DT) {
    world.step(DT, typeof input === 'function' ? input(world) : input);
    world.events.length = 0;
  }
}

function visit(world, stop) {
  world.player.x = stop.x;
  world.player.y = stop.y;
  world.step(DT, {});
}

test('a delivery moves from pickup to drop and awards a result', () => {
  const world = startedWorld();
  const [pickup] = world.contract.legs[0];
  visit(world, pickup);
  assert.equal(world.status, 'delivery');
  assert.equal(world.player.carrying, true);

  visit(world, world.contract.legs[1][0]);
  assert.equal(world.status, 'debrief');
  assert.ok(world.currentResult.earned > 0);
  assert.equal(world.currentResult.contractsDone, 1);
  assert.ok(world.currentResult.stars >= 2, 'a clean ride earns at least two stars');
});

test('holding a direction drives that way on screen, and letting go coasts to a stop', () => {
  const world = startedWorld();
  const start = { x: world.player.x, y: world.player.y };
  ride(world, { moveX: 0, moveY: -1 }, 0.8);
  assert.ok(world.player.y < start.y - 120, 'up moves the bike up the screen');
  assert.ok(Math.abs(world.player.x - start.x) < 8, 'and keeps it on the street');
  ride(world, {}, 1.2);
  assert.ok(world.player.speed < 5, 'no input brings the bike to rest');
});

test('a held turn waits for the next intersection instead of hitting a wall', () => {
  const world = startedWorld();
  const player = world.player;
  player.x = 0;
  player.y = -BLOCK * 0.5;
  player.angle = -Math.PI / 2;
  player.vy = -250;
  ride(world, { moveX: -1, moveY: 0 }, 1.1);
  assert.equal(world.player.integrity, 100, 'no wall damage');
  assert.ok(Math.abs(player.y + BLOCK) < 10, 'turned onto the cross street');
  assert.ok(player.x < -60, 'and headed left along it');
});

test('assistDirection keeps to the street between intersections', () => {
  const heading = -Math.PI / 2;
  const onVertical = { x: 0, y: -BLOCK / 2 };
  assert.deepEqual(assistDirection(onVertical, { x: 0, y: -200 }, heading, { x: -1, y: 0 }), { x: 0, y: -1 });
  assert.deepEqual(assistDirection(onVertical, { x: 0, y: -200 }, heading, { x: 0, y: 1 }), { x: 0, y: 1 });
  assert.equal(assistDirection(onVertical, { x: 0, y: 0 }, heading, { x: 0.1, y: 0 }), null);
  // At the middle of a crossing the held direction wins.
  assert.deepEqual(assistDirection({ x: 0, y: 0 }, { x: 0, y: -200 }, heading, { x: -1, y: 0 }), { x: -1, y: 0 });
  // A diagonal means "take the next turn".
  assert.deepEqual(assistDirection({ x: 0, y: 4 }, { x: 0, y: -200 }, heading, { x: -1, y: -1 }), { x: -1, y: 0 });
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

test('a slow curb correction does not damage the bike', () => {
  const world = startedWorld();
  world.player.x = -31;
  world.player.y = 49;
  world.player.vx = 2;
  world.player.vy = 0;
  const integrity = world.player.integrity;
  world.step(DT, {});
  assert.equal(world.player.integrity, integrity);
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

test('sparks add charge and light the block beside them', () => {
  const world = startedWorld();
  const spark = world.contract.sparks[0];
  const charge = world.player.charge;
  world.player.x = spark.x;
  world.player.y = spark.y;
  world.checkSparks();
  assert.equal(spark.taken, true);
  assert.ok(world.player.charge > charge);
  assert.ok(world.lit.has(blockKey(Math.floor(spark.x / BLOCK), Math.floor(spark.y / BLOCK))));
});

test('a drop-off sends a wave of light through nearby blocks', () => {
  const world = startedWorld();
  visit(world, world.contract.legs[0][0]);
  const drop = world.contract.legs[1][0];
  const before = world.lit.size;
  visit(world, drop);
  assert.ok(world.lit.size >= before + 12);
  assert.ok(world.lightWaves.length > 0);
});

test('a multi-drop job accepts its drops in any order', () => {
  const world = startedWorld(5, 0, 2);
  assert.equal(world.contract.kind, 'multi');
  visit(world, world.contract.legs[0][0]);
  const drops = world.contract.legs[1].slice().reverse();
  for (const drop of drops.slice(0, -1)) {
    visit(world, drop);
    assert.equal(world.status, 'delivery');
  }
  visit(world, drops.at(-1));
  assert.equal(world.status, 'debrief');
});

test('a runner flees the bike but stays near home, and can be caught', () => {
  const world = startedWorld(21, 1, 1);
  assert.equal(world.contract.kind, 'chase');
  const home = world.runner.home;
  world.player.x = world.runner.x + 150;
  world.player.y = world.runner.y;
  ride(world, {}, 6);
  const blocksFromHome = (Math.abs(world.runner.x - home.x) + Math.abs(world.runner.y - home.y)) / BLOCK;
  assert.ok(blocksFromHome <= 5, `runner strayed ${blocksFromHome} blocks`);
  visit(world, world.runner);
  assert.equal(world.runner.caught, true);
  assert.equal(world.status, 'delivery');
});

test('a stealth job fails after three scanner locks', () => {
  const world = startedWorld(8, 2, 1);
  assert.equal(world.contract.kind, 'stealth');
  for (let i = 0; i < 3; i++) {
    world.player.scanCooldown = 0;
    world.scanHit();
  }
  assert.equal(world.status, 'failed');
  assert.match(world.failure, /three times/);
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
    mode: 'hunter', x: player.x + 30, y: player.y, vx: 0, vy: 0, angle: 0,
    scan: 0, jammed: 0, radius: 20, flash: 0, chasingEcho: false, hitCooldown: 0,
  });
  player.charge = player.maxCharge;
  world.step(DT, { pulse: true });
  assert.ok(world.patrols[0].jammed > 0);
});

test('a sentry that spots the bike gives chase, then returns to its post', () => {
  const world = new World(3, { chapter: 2, job: 1 });
  world.startContract();
  world.traffic = [];
  world.nextPatrolAt = Infinity;
  const sentry = world.patrols.find((p) => p.mode === 'sentry');
  assert.ok(sentry, 'stealth jobs post sentries');
  world.patrols = [sentry];
  sentry.angle = 0;
  sentry.base = 0;
  sentry.sweep = 0;
  world.player.x = sentry.x + 150;
  world.player.y = sentry.y;
  ride(world, {}, 0.5);
  assert.ok(sentry.alert > 0, 'the sentry is alerted');
  world.player.x += BLOCK * 20;
  ride(world, {}, 8);
  assert.ok(Math.hypot(sentry.x - sentry.post.x, sentry.y - sentry.post.y) < 12, 'back on post');
});

test('a contract expires into a recoverable failure state', () => {
  const world = startedWorld();
  world.contract.timeRemaining = 0.001;
  world.step(DT, {});
  assert.equal(world.status, 'failed');
  assert.equal(world.retryContract(), true);
  assert.equal(world.status, 'briefing');
});

test('three jobs finish the chapter', () => {
  const world = startedWorld();
  for (let job = 0; job < 3; job++) {
    world.nextPatrolAt = Infinity;
    world.patrols = [];
    for (const leg of world.contract.legs) {
      for (const stop of leg) {
        if (world.runner && !world.runner.caught) visit(world, world.runner);
        else visit(world, stop);
      }
    }
    assert.equal(world.status, 'debrief', `job ${job}`);
    world.nextContract();
    if (job < 2) world.startContract();
  }
  assert.equal(world.status, 'chapter-complete');
  assert.equal(world.results.length, 3);
});

test('the autopilot finishes every job in the story', () => {
  for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
    for (let job = 0; job < 3; job++) {
      const world = new World(9417, { chapter, job });
      world.startContract();
      for (let frame = 0; frame < 60 * 180 && world.active; frame++) {
        world.step(DT, aiInput(world));
        world.events.length = 0;
      }
      assert.equal(world.status, 'debrief', `${chapter}/${job}: ${world.failure || 'did not finish'}`);
    }
  }
});
