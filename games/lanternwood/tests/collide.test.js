import test from 'node:test';
import assert from 'node:assert/strict';
import { moveBox, overlaps } from '../src/collide.js';

// A tiny map: '#' solid.
function grid(rows) {
  return (tx, ty) => ty < 0 || ty >= rows.length || tx < 0 || tx >= rows[0].length || rows[ty][tx] === '#';
}

test('a box stops flush against a wall', () => {
  const b = { x: 24, y: 24, hw: 5, hh: 4 };
  const blocked = grid(['#####', '#...#', '#...#', '#####']);
  const hit = moveBox(b, 40, 0, blocked);
  assert.ok(hit.hitX);
  assert.ok(Math.abs(b.x + b.hw - 64) < 0.05, `flush at ${b.x}`);
  assert.ok(!overlaps(b.x, b.y, b.hw, b.hh, blocked));
});

test('moving diagonally into a wall slides along it', () => {
  const b = { x: 24, y: 40, hw: 5, hh: 4 };
  const blocked = grid(['######', '#....#', '#....#', '#....#', '######']);
  for (let i = 0; i < 10; i++) moveBox(b, 2, 2, blocked);
  assert.ok(b.x > 40, 'kept moving along x');
  assert.ok(Math.abs(b.y + b.hh - 64) < 0.05, 'resting on the floor');
});

test('walking into a doorway corner nudges you through', () => {
  // A one-tile gap at column 2; the box is 3 px off-centre.
  const blocked = grid(['#####', '##.##', '#...#', '#...#', '#####']);
  const b = { x: 2 * 16 + 8 + 4, y: 2 * 16 + 8, hw: 5, hh: 4 };
  for (let i = 0; i < 30; i++) moveBox(b, 0, -1.4, blocked);
  assert.ok(b.y < 2 * 16, `went up through the gap (y=${b.y.toFixed(1)})`);
});

test('no corner help when the gap is too far away', () => {
  const blocked = grid(['#####', '###.#', '#...#', '#...#', '#####']);
  const b = { x: 1 * 16 + 8, y: 2 * 16 + 8, hw: 5, hh: 4 };
  for (let i = 0; i < 30; i++) moveBox(b, 0, -1.4, blocked);
  assert.ok(b.y >= 2 * 16 + 4 - 0.01);
  assert.ok(Math.abs(b.x - 24) < 0.01, 'did not drift sideways');
});

test('fast moves never tunnel through a thin wall', () => {
  const blocked = grid(['#######', '#..#..#', '#######']);
  const b = { x: 24, y: 24, hw: 5, hh: 4 };
  moveBox(b, 200, 0, blocked);
  assert.ok(b.x < 48);
});

test('extra solid boxes block too', () => {
  const blocked = grid(['#######', '#.....#', '#######']);
  const b = { x: 24, y: 24, hw: 5, hh: 4 };
  moveBox(b, 50, 0, blocked, [{ x: 56, y: 24, hw: 8, hh: 8 }]);
  assert.ok(b.x + b.hw <= 48.01);
});
