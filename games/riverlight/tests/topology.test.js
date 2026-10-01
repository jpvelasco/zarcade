import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTopology, rotMask, popcount, opposite, neighbor, cellAt, stepCursor, bounds } from '../src/topology.js';

test('rotating a mask moves each open side clockwise', () => {
  assert.equal(rotMask(0b0001, 1, 4), 0b0010);
  assert.equal(rotMask(0b1000, 1, 4), 0b0001);
  assert.equal(rotMask(0b0101, 1, 4), 0b1010);
  assert.equal(rotMask(0b0011, -1, 4), 0b1001);
  assert.equal(rotMask(0b100001, 1, 6), 0b000011);
  assert.equal(rotMask(0b000111, 6, 6), 0b000111);
  assert.equal(popcount(0b101101), 4);
});

test('square neighbours stop at the edge unless the board wraps', () => {
  const t = makeTopology({ kind: 'square', w: 3, h: 2 });
  assert.equal(neighbor(t, 0, 0), -1);
  assert.equal(neighbor(t, 0, 1), 1);
  assert.equal(neighbor(t, 0, 2), 3);
  assert.equal(neighbor(t, 0, 3), -1);
  const wrap = makeTopology({ kind: 'square', w: 3, h: 3, wrap: true });
  assert.equal(neighbor(wrap, 0, 3), 2);
  assert.equal(neighbor(wrap, 0, 0), 6);
});

test('neighbours are symmetric on every grid', () => {
  for (const spec of [
    { kind: 'square', w: 5, h: 4 },
    { kind: 'square', w: 4, h: 4, wrap: true },
    { kind: 'hex', w: 7, h: 8, hexRadius: 3 },
    { kind: 'hex', w: 5, h: 5 },
  ]) {
    const t = makeTopology(spec);
    for (let i = 0; i < t.count; i++) {
      for (let d = 0; d < t.n; d++) {
        const j = neighbor(t, i, d);
        if (j < 0) continue;
        assert.equal(neighbor(t, j, opposite(t, d)), i, `${spec.kind} ${i} ${d}`);
        const dist = Math.hypot(t.cx[i] - t.cx[j], t.cy[i] - t.cy[j]);
        if (!t.wrap) assert.ok(Math.abs(dist - 1) < 1e-5, 'neighbours are one unit apart');
      }
    }
  }
});

test('a radius-3 hex garden has 37 stones, the middle one with six neighbours', () => {
  const t = makeTopology({ kind: 'hex', w: 7, h: 8, hexRadius: 3 });
  const active = t.active.reduce((a, b) => a + b, 0);
  assert.equal(active, 37);
  const full = [...Array(t.count).keys()].filter((i) => t.active[i] && [...Array(6).keys()].every((d) => neighbor(t, i, d) >= 0));
  assert.equal(full.length, 19);
});

test('shapes mark cells outside the garden inactive', () => {
  const t = makeTopology({ kind: 'square', w: 3, h: 2, shape: ['#.#', '###'] });
  assert.equal(t.active[1], 0);
  assert.equal(neighbor(t, 0, 1), -1);
  const b = bounds(t);
  assert.equal(b.w, 3);
  assert.equal(b.h, 2);
});

test('pointer and cursor find cells by position and direction', () => {
  const t = makeTopology({ kind: 'square', w: 3, h: 3 });
  assert.equal(cellAt(t, 1.1, 0.9), 4);
  assert.equal(cellAt(t, 5, 5), -1);
  assert.equal(stepCursor(t, 4, 1, 0), 5);
  assert.equal(stepCursor(t, 4, 0, -1), 1);
  assert.equal(stepCursor(t, 5, 1, 0), -1);
  const hex = makeTopology({ kind: 'hex', w: 5, h: 5 });
  const mid = 2 * 5 + 2;
  assert.equal(stepCursor(hex, mid, 0, 1), neighbor(hex, mid, 3));
  assert.ok([neighbor(hex, mid, 1), neighbor(hex, mid, 2)].includes(stepCursor(hex, mid, 1, 0)));
});
