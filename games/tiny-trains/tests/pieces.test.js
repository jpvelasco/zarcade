import test from 'node:test';
import assert from 'node:assert/strict';
import { route, openEdges, pieceJoining, turn, switchParts, N, E, S, W, VARIANTS } from '../src/pieces.js';

test('straights and curves route both ways', () => {
  assert.deepEqual(route('S', 0, 0, N), { exit: S, s: 0 });
  assert.deepEqual(route('S', 1, 0, W), { exit: E, s: 0 });
  assert.equal(route('S', 1, 0, N), null);
  assert.deepEqual(route('C', 0, 0, N), { exit: E, s: 0 });
  assert.deepEqual(route('C', 0, 0, E), { exit: N, s: 0 });
  assert.equal(route('C', 0, 0, S), null);
  assert.deepEqual(route('C', 3, 0, W), { exit: N, s: 0 });
});

test('crossings go straight through from every side', () => {
  for (const e of [N, E, S, W]) assert.equal(route('X', 0, 0, e).exit, (e + 2) % 4);
});

test('switches flip-flop from the stem and trail from the branches', () => {
  // v0: stem north, straight south, curve east.
  assert.deepEqual(switchParts(0), { stem: N, straight: S, curve: E });
  assert.deepEqual(switchParts(4), { stem: N, straight: S, curve: W });
  let r = route('W', 0, 0, N);
  assert.deepEqual(r, { exit: S, s: 1 });
  r = route('W', 0, r.s, N);
  assert.deepEqual(r, { exit: E, s: 0 });
  assert.deepEqual(route('W', 0, 1, S), { exit: N, s: 1 });
  assert.deepEqual(route('W', 0, 0, E), { exit: N, s: 0 });
  assert.equal(route('W', 0, 0, W), null);
});

test('every variant has the right number of open edges and turning cycles', () => {
  const want = { S: 2, C: 2, X: 4, W: 3 };
  for (const [t, n] of Object.entries(VARIANTS)) {
    for (let v = 0; v < n; v++) assert.equal(new Set(openEdges(t, v)).size, want[t]);
    let v = 0;
    for (let k = 0; k < n; k++) v = turn(t, v);
    assert.equal(v, 0);
    assert.equal(turn(t, 0, -1), n - 1);
  }
});

test('pieceJoining picks the straight or curve between two edges', () => {
  assert.deepEqual(pieceJoining(W, E), { t: 'S', v: 1 });
  assert.deepEqual(pieceJoining(S, N), { t: 'S', v: 0 });
  for (const [a, b] of [[N, E], [E, S], [S, W], [W, N], [E, N]]) {
    const p = pieceJoining(a, b);
    assert.equal(p.t, 'C');
    assert.deepEqual(new Set(openEdges(p.t, p.v)), new Set([a, b]));
  }
  assert.equal(pieceJoining(N, N), null);
});
