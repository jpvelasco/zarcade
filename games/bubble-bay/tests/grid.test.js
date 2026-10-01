import test from 'node:test';
import assert from 'node:assert/strict';
import {
  W, ROWS, NEIGHBORS, CX, CY, ROW_H, FIELD_W, LOSE_ROW, index, cols, valid, hexDistance, ring,
  traceShot, resolveShot, colorGroup, washRows, clampAngle, MIN_ANGLE, MAX_ANGLE, Board,
} from '../src/grid.js';
import { boardFrom, landOn } from './helpers.js';

test('rows alternate between W and W-1 cells and fill the field edge to edge', () => {
  assert.equal(cols(0), W);
  assert.equal(cols(1), W - 1);
  assert.equal(CX[index(0, 0)], 1);
  assert.equal(CX[index(0, W - 1)], FIELD_W - 1);
  assert.equal(CX[index(1, 0)], 2);
  assert.equal(CX[index(1, W - 2)], FIELD_W - 2);
  assert.ok(!valid(1, W - 1));
});

test('neighbors are symmetric and exactly two radii apart', () => {
  for (let i = 0; i < ROWS * W; i++) {
    for (const n of NEIGHBORS[i]) {
      assert.ok(NEIGHBORS[n].includes(i), `${n} lists ${i}`);
      const d = Math.hypot(CX[i] - CX[n], CY[i] - CY[n]);
      assert.ok(Math.abs(d - 2) < 1e-9, `distance ${d}`);
    }
    if (valid(Math.floor(i / W), i % W)) assert.ok(NEIGHBORS[i].length <= 6);
  }
  // an inner cell has all six
  assert.equal(NEIGHBORS[index(4, 4)].length, 6);
  assert.equal(NEIGHBORS[index(5, 4)].length, 6);
});

test('hex distance and rings agree', () => {
  const center = index(6, 4);
  for (const n of NEIGHBORS[center]) assert.equal(hexDistance(center, n), 1);
  const two = ring(center, 2);
  assert.equal(two.length, 1 + 6 + 12);
  for (const i of two) assert.ok(hexDistance(center, i) <= 2);
});

test('a straight-up shot climbs to the ceiling and snaps into row 0', () => {
  const board = new Board();
  const trace = traceShot(board, Math.PI / 2);
  assert.equal(trace.path.length, 2);
  assert.ok(trace.land >= 0);
  assert.equal(Math.floor(trace.land / W), 0);
  assert.ok(Math.abs(CX[trace.land] - W) <= 1);
});

test('angled shots bounce off the walls and keep their speed sideways', () => {
  const board = new Board();
  const trace = traceShot(board, MIN_ANGLE + 0.02);
  const bounces = trace.path.filter((p) => p.bounce);
  assert.ok(bounces.length >= 2, `bounced ${bounces.length} times`);
  for (const b of bounces) assert.ok(b.x === 1 || b.x === FIELD_W - 1);
  // mirrored angles land on mirrored cells
  const left = traceShot(board, Math.PI / 2 + 0.4);
  const right = traceShot(board, Math.PI / 2 - 0.4);
  assert.ok(Math.abs(CX[left.land] + CX[right.land] - FIELD_W) < 1e-9);
});

test('angles are clamped so the bubble always goes up', () => {
  assert.equal(clampAngle(0), MIN_ANGLE);
  assert.equal(clampAngle(Math.PI), MAX_ANGLE);
  assert.equal(clampAngle(-1), MIN_ANGLE);
});

test('a shot sticks next to the bubble it hits', () => {
  const board = boardFrom(['RRRRRRRRRR', 'GGGGGGGGG', 'BBBBBBBBBB']);
  const trace = traceShot(board, Math.PI / 2);
  assert.ok(trace.hit >= 0);
  assert.equal(Math.floor(trace.land / W), 3);
  assert.ok(NEIGHBORS[trace.land].includes(trace.hit));
  assert.equal(board.cells[trace.land], null);
});

test('the guide and the real shot agree (same trace, same landing)', () => {
  const board = boardFrom(['RRYYGGRRYY', 'G.G.G.G.G', 'B..B..B..B']);
  for (let k = 0; k < 40; k++) {
    const angle = MIN_ANGLE + ((MAX_ANGLE - MIN_ANGLE) * k) / 39;
    const a = traceShot(board, angle);
    const b = traceShot(board.clone(), angle);
    assert.equal(a.land, b.land);
    assert.ok(a.land >= 0, `angle ${angle} landed`);
    assert.equal(board.cells[a.land], null);
  }
});

test('three of a color pop, and whatever hung from them drops', () => {
  // Y Y . at the top; R hangs under the second Y
  const board = boardFrom(['YY........', ' R']);
  const land = index(0, 2);
  const events = resolveShot(board, { kind: 'b', c: 1 }, landOn(land));
  assert.equal(events.pops.length, 3);
  assert.equal(events.drops.length, 1);
  assert.equal(events.cleared, 4);
  assert.ok(board.isEmpty());
});

test('two of a color just stick', () => {
  const board = boardFrom(['Y.........']);
  const events = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(0, 1)));
  assert.equal(events.pops.length, 0);
  assert.equal(board.count(), 2);
});

test('rainbow bubbles join any color group', () => {
  const board = boardFrom(['Y@........']);
  const group = colorGroup(board, index(0, 0), 1);
  assert.equal(group.length, 2);
  const events = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(0, 2)));
  assert.equal(events.pops.length, 3);
});

test('stones never match but fall when cut loose', () => {
  const board = boardFrom(['YY#.......', '.#']);
  const events = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(1, 0)));
  assert.equal(events.pops.length, 3);
  // the stone at (1,1) still hangs from the stone at (0,2)
  assert.ok(board.cells[index(0, 2)]);
  assert.ok(board.cells[index(1, 1)]);
  const lonely = boardFrom(['YY........', '.#']);
  const ev = resolveShot(lonely, { kind: 'b', c: 1 }, landOn(index(0, 2)));
  assert.equal(ev.drops.filter((d) => d.cell.k === 'stone').length, 1);
  assert.ok(lonely.isEmpty());
});

test('ice takes two hits: a crack, then a shatter', () => {
  const board = boardFrom(['YY.r......']);
  const first = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(0, 2)));
  assert.equal(first.cracks.length, 1);
  assert.equal(board.cells[index(0, 3)].hp, 1);
  board.cells[index(0, 0)] = { k: 'b', c: 1 };
  board.cells[index(0, 1)] = { k: 'b', c: 1 };
  const second = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(0, 2)));
  assert.equal(second.cracks.length, 0);
  assert.ok(second.pops.some((p) => p.cell.k === 'ice'));
  assert.equal(board.cells[index(0, 3)], null);
});

test('otters are freed by a pop beside them or by dropping', () => {
  const beside = boardFrom(['YY.O......']);
  const ev = resolveShot(beside, { kind: 'b', c: 1 }, landOn(index(0, 2)));
  assert.equal(ev.freed.length, 1);
  assert.equal(ev.freed[0].how, 'pop');
  const hanging = boardFrom(['YYY.......', 'O']);
  hanging.cells[index(0, 2)] = null;
  const ev2 = resolveShot(hanging, { kind: 'b', c: 1 }, landOn(index(0, 2)));
  // the otter under (0,0)/(0,1) is freed either way
  assert.equal(ev2.freed.length, 1);
});

test('the anchor only falls when cut loose', () => {
  const board = boardFrom(['YY#.......', 'A']);
  // anchor (1,0) touches (0,0) and (0,1): pop those two with a third Y
  const ev = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(1, 1)));
  assert.ok(ev.anchor);
  const held = boardFrom(['#Y........', 'A']);
  const ev2 = resolveShot(held, { kind: 'b', c: 1 }, landOn(index(0, 2)));
  assert.ok(!ev2.anchor);
});

test('bomb bubbles blast radius 2 when a match pops beside them, and chain', () => {
  const board = boardFrom(['RRRRRRRRRR', 'RRRRRRRRR', 'RRRRRRRRRR', ' RRR*RRRR', 'YY..#.....']);
  // place a third Y at (4,2) touching the bomb at (3,3)? (4,2) neighbors (3,1),(3,2)
  board.cells[index(4, 3)] = { k: 'b', c: 1 };
  board.cells[index(4, 4)] = null;
  const ev = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(4, 2)));
  assert.equal(ev.blasts.length, 1);
  assert.ok(ev.pops.length > 10);
});

test('lightning bubbles clear their whole row', () => {
  const board = boardFrom(['RRRRRRRRRR', 'GGGGGGGGG', 'BBBzBBBBBB', 'YY........']);
  board.cells[index(3, 2)] = null;
  const ev = resolveShot(board, { kind: 'b', c: 1 }, landOn(index(3, 2)));
  // the Y match touches z? (3,2) neighbors (2,2),(2,3): yes
  assert.equal(ev.blasts.filter((b) => b.kind === 'zap').length, 1);
  for (let c = 0; c < cols(2); c++) assert.equal(board.cells[index(2, c)], null);
});

test('a bomb shot blasts where it lands; a rainbow shot pops what it touches', () => {
  const board = boardFrom(['RRGGBBRRGG', 'RGBRGBRGB']);
  const bomb = resolveShot(board.clone(), { kind: 'bomb' }, landOn(index(2, 4)));
  assert.ok(bomb.pops.length >= 6);
  const rb = board.clone();
  const rainbow = resolveShot(rb, { kind: 'rainbow' }, landOn(index(2, 4)));
  assert.ok(rainbow.pops.length >= 3);
});

test('a lightning shot zaps everything along its path to the ceiling', () => {
  const board = boardFrom(['RRRRRRRRRR', 'GGGGGGGGG', 'BBBBBBBBBB', ' A']);
  const trace = traceShot(board, Math.PI / 2, { pass: true });
  assert.equal(trace.land, -1);
  assert.ok(trace.touched.length >= 3);
  const ev = resolveShot(board, { kind: 'zap' }, trace);
  assert.ok(ev.pops.length >= 3);
  assert.ok(!ev.pops.some((p) => p.cell.k === 'anchor'));
});

test('the ceiling drop moves the board down and the line is checked on screen rows', () => {
  const board = boardFrom(['RRRRRRRRRR']);
  assert.equal(board.lowestRow(), 0);
  board.drop = LOSE_ROW;
  assert.ok(board.pastLine());
  assert.equal(board.y(0), CY[0] + LOSE_ROW * ROW_H);
});

test('the continue wave washes the lowest rows and drops what hung from them', () => {
  const board = boardFrom(['RRRRRRRRRR', 'O', 'G', ' G']);
  board.drop = 9;
  const ev = washRows(board, 10);
  assert.ok(ev.pops.length >= 1);
  assert.equal(ev.freed.length, 1);
  assert.equal(board.count(), 10);
});
