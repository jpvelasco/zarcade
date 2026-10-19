// The first three bosses could be beaten by standing still and
// holding fire. A runner who never moves must now lose a life to each of them
// (telegraphed attacks aimed at where they stand), while a runner who moves
// out of the way and keeps shooting (the autopilot) still wins.

import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Pilot } from '../src/ai.js';
import { PHYS } from '../src/physics.js';

const DT = 1 / 60;
const FIGHT = 90;
const FIRST_BOSSES = [0, 1, 2]; // KONG-TRON 2600, the Iron Croc, the Drill Mole

/** Walk in from just outside the arena (as `?boss` starts) until the fight begins. */
function arenaWorld(stage, mode) {
  const world = new World(stage, { mode });
  const arena = world.arena;
  const p = world.players[0];
  world.checkpoint = world.level.checkpoints.length - 1;
  p.x = arena.x0 - 40;
  p.y = arena.floor - PHYS.height;
  p.safe = { x: p.x, y: p.y };
  world.updateCamera(1, true);
  for (let i = 0; i < 600 && !arena.active; i += 1) world.step(DT, [{ right: true }]);
  assert.ok(arena.active, `stage ${stage + 1} fight started`);
  world.events.length = 0;
  return world;
}

/** Move the runner to another spot on the arena floor and let them settle there. */
function standAt(world, dx) {
  const p = world.players[0];
  p.x = world.arena.x0 + dx;
  p.vx = 0;
  p.safe = { x: p.x, y: p.y };
}

function fight(world, policy) {
  const start = world.t;
  let lostLife = null;
  let bossDown = null;
  while (world.status === 'play' && world.t - start < FIGHT) {
    world.step(DT, [policy(world)]);
    for (const e of world.events) {
      if (e.type === 'death' && lostLife === null) lostLife = world.t - start;
      if (e.type === 'bossDown') bossDown = world.t - start;
    }
    world.events.length = 0;
  }
  return { lostLife, bossDown, status: world.status, hits: world.stats.hits, deaths: world.stats.deaths };
}

const statue = () => ({ shoot: true });

test('standing still and holding fire loses a life to each of the first three bosses', () => {
  for (const stage of FIRST_BOSSES) {
    // The spot the fight starts on, then the whole floor from wall to wall.
    const spots = [null];
    for (let dx = 0; dx <= 300; dx += 20) spots.push(dx);
    for (const dx of spots) {
      const world = arenaWorld(stage, 'adventure');
      if (dx !== null) standAt(world, dx);
      const where = dx === null ? 'the fight start' : `x0+${dx}`;
      const r = fight(world, statue);
      // Not a win: it lost a life before the boss went down, or the boss never went down.
      const lostFirst = r.lostLife !== null && (r.bossDown === null || r.lostLife <= r.bossDown);
      assert.ok(lostFirst || r.bossDown === null, `stage ${stage + 1} (${world.boss.type}) beaten by a statue at ${where} with ${r.hits} hits and no life lost`);
    }
  }
});

test('the statue loses its life with time to spare, well before the boss goes down', () => {
  for (const stage of FIRST_BOSSES) {
    const r = fight(arenaWorld(stage, 'adventure'), statue);
    assert.ok(r.lostLife !== null, `stage ${stage + 1} statue lost a life`);
    if (r.bossDown !== null) assert.ok(r.bossDown - r.lostLife > 2, `stage ${stage + 1}: life lost at ${r.lostLife.toFixed(1)} s, boss down at ${r.bossDown.toFixed(1)} s`);
  }
});

test('a runner who dodges and shoots (the autopilot) beats each of the first three bosses', () => {
  for (const stage of FIRST_BOSSES) {
    const pilot = new Pilot(0);
    const adventure = fight(arenaWorld(stage, 'adventure'), (w) => pilot.controls(w));
    assert.equal(adventure.status, 'clear', `stage ${stage + 1} Adventure: ended "${adventure.status}"`);
    assert.equal(adventure.deaths, 0, `stage ${stage + 1} Adventure: the dodger kept every life`);
    const arcadePilot = new Pilot(0);
    const arcade = fight(arenaWorld(stage, 'arcade'), (w) => arcadePilot.controls(w));
    assert.equal(arcade.status, 'clear', `stage ${stage + 1} Arcade: ended "${arcade.status}"`);
  }
});
