import test from 'node:test';
import assert from 'node:assert/strict';
import { Animator } from '../src/animator.js';
import { parseLevel, program, createRun } from '../src/rules.js';

const level = parseLevel({ id: 'a', map: ['0 0L 1 0B'], start: [0, 0, 'E'], ops: 'FJ*G', limits: { main: 9 } });

function play(prog) {
  const sounds = [];
  const anim = new Animator(level, { sound: (n) => sounds.push(n), burst() {}, shake() {}, flash() {}, lamp() {} });
  const run = createRun(level, prog);
  const poses = [];
  while (!run.done) {
    const ev = run.step();
    anim.begin(ev, 1);
    let guard = 0;
    while (!anim.update(1 / 60) && guard++ < 200) poses.push({ ...anim.pose });
  }
  return { anim, run, sounds, poses };
}

test('Bolt ends each animation exactly where the interpreter put him', () => {
  const { anim, run } = play(program('F * J J G'));
  assert.equal(run.result, 'win');
  assert.deepEqual([anim.pose.x, anim.pose.y, anim.pose.h, anim.pose.d], [run.state.x, run.state.y, run.state.h, run.state.d]);
  assert.deepEqual(anim.lit, [true]);
  assert.deepEqual(anim.got, [true]);
});

test('lamps light mid-animation, with a chime, and jumps leave the ground', () => {
  const { sounds, poses } = play(program('F * J J G'));
  assert.ok(sounds.includes('light'));
  assert.ok(sounds.includes('jump'));
  assert.ok(sounds.includes('grab'));
  assert.ok(poses.some((p) => p.lift > 0.3), 'Bolt is airborne during a jump');
  assert.ok(poses.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('a bonk lunges forward and comes back', () => {
  const { poses, sounds, run } = play(program('L F'));
  assert.equal(run.result, 'bonk');
  assert.ok(sounds.includes('bonk'));
  const ys = poses.map((p) => p.y);
  assert.ok(Math.min(...ys) < -0.2, 'leans toward the edge');
});

test('complete() finishes the current animation at once', () => {
  const anim = new Animator(level);
  const run = createRun(level, program('F'));
  anim.begin(run.step(), 1);
  assert.equal(anim.busy, true);
  anim.complete();
  assert.equal(anim.busy, false);
  assert.equal(anim.pose.x, 1);
});
