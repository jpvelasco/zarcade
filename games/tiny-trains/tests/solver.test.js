import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/board.js';
import { solve, stockFits, choosePieces } from '../src/solver.js';
import { simulate } from '../src/sim.js';

test('finds the fewest pieces for a simple run', () => {
  const b = parseLevel({ map: ['r> . . . R-'] });
  const s = solve(b);
  assert.ok(s.solved);
  assert.equal(s.par, 3);
  assert.equal(simulate(b, s.layout).outcome, 'win');
  assert.equal(s.order.length, 3);
  assert.ok(s.order.every((o) => o.options.some((p) => p.t === o.piece.t && p.v === o.piece.v)));
});

test('goes round obstacles', () => {
  const b = parseLevel({ map: ['r> . t . R-', '. . . . .'] });
  const s = solve(b);
  assert.equal(s.par, 5);
  assert.equal(simulate(b, s.layout).outcome, 'win');
});

test('uses a switch only when the stock has one', () => {
  const map = ['r> . . . R-', '. . . . B-'];
  assert.equal(solve(parseLevel({ map, queue: { '0,0': 'rb' } })).solved, false);
  const b = parseLevel({ map, queue: { '0,0': 'rb' }, stock: { W: 1 } });
  const s = solve(b);
  assert.ok(s.solved);
  assert.equal([...s.layout.values()].filter((p) => p.t === 'W').length, 1);
  assert.equal(simulate(b, s.layout).outcome, 'win');
});

test('detours to dodge a crash at a crossing', () => {
  const b = parseLevel({
    map: ['t . b> . . . f', '. . . . . . .', 'r> . . . . . R-', 'w . . . . . w', 'w w . B| . w w'],
    stock: { X: 1 },
  });
  const s = solve(b);
  assert.equal(s.par, 10);
  assert.equal(simulate(b, s.layout).outcome, 'win');
});

test('reports impossible levels', () => {
  const s = solve(parseLevel({ map: ['r> t R-'] }));
  assert.equal(s.solved, false);
});

test('stock checks follow Hall rule', () => {
  const X = [{ t: 'X', v: 0, s: 0 }];
  const Wsw = [{ t: 'W', v: 0, s: 0 }];
  const either = [...X, ...Wsw];
  const plain = [{ t: 'S', v: 0, s: 0 }, ...X];
  const sets = new Map([[1, X], [2, either], [3, plain]]);
  assert.equal(stockFits(sets, { X: 1, W: 0 }), false);
  assert.equal(stockFits(sets, { X: 1, W: 1 }), true);
  assert.equal(stockFits(new Map([[1, X], [2, X]]), { X: 1, W: 5 }), false);
  const pick = choosePieces(sets, { X: 1, W: 1 });
  assert.equal(pick.get(1).t, 'X');
  assert.equal(pick.get(2).t, 'W');
  assert.equal(pick.get(3).t, 'S');
});
