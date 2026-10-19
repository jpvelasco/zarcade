// A scripted play-through: proof that the physics, the level data and the
// collision rules agree well enough to finish a level hands-free.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Bot, botRun } from '../src/ai.js';
import { World } from '../src/world.js';
import { PETALS } from '../src/world.js';
import { findLevel } from '../src/levels.js';

test('a "run right and jump" pilot clears the first level unharmed', () => {
  const world = new World(findLevel(1));
  const run = botRun(world, { seconds: 90 });
  assert.equal(run.finished, true, `stuck at x=${Math.round(world.player.x / 16)} tiles`);
  assert.equal(world.status, 'complete');
  assert.equal(world.petals, PETALS, 'the meadow should not cost a petal');
  assert.ok(run.elapsed < 40, `took ${run.elapsed.toFixed(1)}s`);
  const result = world.result();
  assert.ok(result.seeds > 0, 'it should sweep up seeds on the way');
  assert.ok(result.stars >= 1);
});

test('the pilot is deterministic: the same level plays out identically', () => {
  const first = new World(findLevel(1));
  const second = new World(findLevel(1));
  botRun(first);
  botRun(second);
  assert.equal(first.time.toFixed(4), second.time.toFixed(4));
  assert.equal(first.seedsTaken, second.seedsTaken);
  assert.equal(Math.round(first.player.x), Math.round(second.player.x));
});

test('replaying a recorded input tape lands Pip in the same place', () => {
  const source = new World(findLevel(1));
  const bot = new Bot(source);
  const tape = [];
  const dt = 1 / 60;
  while (source.status === 'play' && tape.length < 5400) {
    const input = bot.input(dt);
    tape.push(input);
    source.step(dt, input);
    source.events.length = 0;
  }
  assert.equal(source.status, 'complete');

  const replay = new World(findLevel(1));
  for (const input of tape) {
    replay.step(dt, input);
    replay.events.length = 0;
  }
  assert.equal(replay.status, 'complete');
  assert.equal(Math.round(replay.player.x), Math.round(source.player.x));
  assert.equal(replay.seedsTaken, source.seedsTaken);
});

test('standing still never finishes a level', () => {
  const world = new World(findLevel(1));
  for (let i = 0; i < 600; i += 1) {
    world.step(1 / 60, {});
    world.events.length = 0;
  }
  assert.equal(world.status, 'play');
});
