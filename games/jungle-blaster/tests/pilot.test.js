import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Pilot } from '../src/ai.js';

const DT = 1 / 60;

function autoplay(stage, mode, seconds = 240) {
  const world = new World(stage, { mode });
  const pilot = new Pilot(0);
  const seen = new Set();
  for (let i = 0; i < seconds * 60 && world.status === 'play'; i += 1) {
    world.step(DT, [pilot.controls(world)]);
    for (const e of world.events) seen.add(e.type);
    world.events.length = 0;
  }
  return { world, seen };
}

test('the autopilot clears stage 1 (vines, crocs, logs and the robot gorilla) in Adventure mode', () => {
  const { world, seen } = autoplay(0, 'adventure');
  assert.equal(world.status, 'clear', `stage 1 not cleared: ended "${world.status}" at x=${Math.round(world.players[0].x)}`);
  assert.ok(seen.has('vine') && seen.has('swing'), 'it swung across on vines');
  assert.ok(seen.has('bossIntro') && seen.has('bossDown'), 'it beat the boss');
  assert.ok(world.stats.time < 150, `took ${world.stats.time.toFixed(0)} s`);
  assert.ok(world.run.lives[0] >= 3, 'without burning through lives');
});

test('stage 1 is fair in Arcade mode too: the autopilot clears it without a game over', () => {
  const { world } = autoplay(0, 'arcade');
  assert.equal(world.status, 'clear');
  assert.ok(world.stats.deaths < 3);
});

test('the autopilot run is repeatable', () => {
  const a = autoplay(0, 'adventure', 30).world;
  const b = autoplay(0, 'adventure', 30).world;
  assert.equal(Math.round(a.players[0].x), Math.round(b.players[0].x));
  assert.equal(a.run.score, b.run.score);
});
