import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { playLevel } from '../src/ai.js';
import { LEVELS } from '../src/levels.js';

test('the autopilot clears level 1', () => {
  const w = playLevel(World, 0, { maxTime: 400 });
  assert.equal(w.status, 'cleared');
  assert.equal(w.remaining(), 0);
  assert.ok(w.score > 3000);
});

test('the autopilot beats the first boss', () => {
  const w = playLevel(World, 5, { maxTime: 400 });
  assert.equal(w.status, 'cleared');
  assert.equal(w.boss.dead, true);
});

test('every level can be cleared by the autopilot', () => {
  for (const l of LEVELS) {
    const w = playLevel(World, l.index, { maxTime: 900 });
    assert.equal(w.status, 'cleared', `${l.name} (${w.remaining()} bricks left)`);
  }
});

test('simulation is deterministic', () => {
  const a = playLevel(World, 7, { maxTime: 30 });
  const b = playLevel(World, 7, { maxTime: 30 });
  assert.equal(a.score, b.score);
  assert.equal(a.bricksBroken, b.bricksBroken);
});
