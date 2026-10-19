import test from 'node:test';
import assert from 'node:assert/strict';
import { touchDragTarget } from '../src/input.js';
import { FIELD, PADDLE } from '../src/config.js';

test('a touch drag inside the field moves the ship by the scaled finger distance', () => {
  const r = touchDragTarget(300, 80);
  assert.equal(r.target, 400);
  assert.equal(r.rebase, false);
});

test('a touch drag past a wall stops at the wall and rebases', () => {
  const half = PADDLE.w / 2;
  const right = touchDragTarget(300, 600, half);
  assert.equal(right.target, FIELD.w - half);
  assert.equal(right.rebase, true);
  // After rebasing, pulling the finger back moves the ship straight away.
  const back = touchDragTarget(right.target, -40, half);
  assert.ok(back.target < FIELD.w - half);
  assert.equal(back.rebase, false);
  const left = touchDragTarget(300, -900, half);
  assert.equal(left.target, half);
  assert.equal(left.rebase, true);
});

test('a wider ship reaches less far, so its drag rebases sooner', () => {
  const r = touchDragTarget(500, 40, PADDLE.wideW / 2);
  assert.equal(r.target, FIELD.w - PADDLE.wideW / 2);
  assert.equal(r.rebase, true);
});
