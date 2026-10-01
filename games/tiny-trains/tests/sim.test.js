import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/board.js';
import { simulate, wrapTime, starsFor, piecesUsed } from '../src/sim.js';

const lay = (board, list) => new Map(list.map(([x, y, t, v]) => [y * board.w + x, { t, v }]));

test('a train runs along straights into its station', () => {
  const b = parseLevel({ map: ['r> . . R-'] });
  const r = simulate(b, lay(b, [[1, 0, 'S', 1], [2, 0, 'S', 1]]));
  assert.equal(r.outcome, 'win');
  assert.equal(r.frames.length, 4);
  assert.equal(r.frames[0].trains[0].kind, 'depart');
  assert.equal(r.frames[3].trains[0].kind, 'arrive');
  assert.equal(r.events.filter((e) => e.type === 'deliver').length, 1);
});

test('running off the end of the track is a derail at that edge', () => {
  const b = parseLevel({ map: ['r> . . R-'] });
  const r = simulate(b, lay(b, [[1, 0, 'S', 1]]));
  assert.equal(r.outcome, 'derail');
  assert.equal(r.failures[0].cell, 1);
  assert.equal(r.failures[0].reason, 'grass');
  assert.equal(r.endTime, 2);
});

test('other colours pass straight through a station', () => {
  const b = parseLevel({ map: ['b> . R- . B-'], queue: { '0,0': 'rb' } });
  const r = simulate(b, lay(b, [[1, 0, 'S', 1], [3, 0, 'S', 1]]));
  assert.equal(r.outcome, 'win');
});

test('every station must be served', () => {
  const b = parseLevel({ map: ['r> . R-', '. . B-'] });
  const r = simulate(b, lay(b, [[1, 0, 'S', 1]]));
  assert.equal(r.outcome, 'unserved');
  assert.equal(r.failures[0].color, 'blue');
});

test('two trains in one crossing at once crash; staggered they pass', () => {
  const map = ['. . bv . .', 'r> . . . R-', '. . B| . .'];
  const b = parseLevel({ map });
  const L = lay(b, [[1, 1, 'S', 1], [2, 1, 'X', 0], [3, 1, 'S', 1]]);
  const r = simulate(b, L);
  // Blue reaches the crossing at tick 1, red at tick 2.
  assert.equal(r.outcome, 'win');
  const late = parseLevel({ map, depart: { '2,0': 1 } });
  const crash = simulate(late, L);
  assert.equal(crash.outcome, 'crash');
  assert.equal(crash.failures[0].cell, 7);
});

test('head-on trains swapping cells crash', () => {
  const b = parseLevel({ map: ['r> . . b<', '. . . .'] });
  const r = simulate(b, lay(b, [[1, 0, 'S', 1], [2, 0, 'S', 1]]));
  assert.equal(r.outcome, 'crash');
  assert.ok(r.failures[0].swap);
});

test('a flip-flop switch sends a queue two ways', () => {
  const b = parseLevel({ map: ['r> . . R-', '. . . B-'], queue: { '0,0': 'rb' } });
  // Switch at (1,0): stem west, straight east, curve south (v = 3 + 4).
  const L = lay(b, [[1, 0, 'W', 7], [2, 0, 'S', 1], [1, 1, 'C', 0], [2, 1, 'S', 1]]);
  const r = simulate(b, L);
  assert.equal(r.outcome, 'win');
  const flips = r.events.filter((e) => e.type === 'flip').map((e) => e.s);
  assert.deepEqual(flips, [1, 0]);
});

test('tunnels carry trains to the twin mouth', () => {
  const b = parseLevel({ map: ['r> 1< m 1> R-'] });
  const r = simulate(b, new Map());
  assert.equal(r.outcome, 'win');
  assert.deepEqual(r.frames.map((f) => f.trains[0] && f.trains[0].kind), ['depart', 'in', 'out', 'arrive']);
});

test('paint sheds repaint trains, who then want the new colour', () => {
  const b = parseLevel({ map: ['r> B= . B-'] });
  const r = simulate(b, lay(b, [[2, 0, 'S', 1]]));
  assert.equal(r.outcome, 'win');
  assert.equal(r.events.find((e) => e.type === 'paint').color, 'blue');
});

test('loops are detected and wrap for endless playback', () => {
  const b = parseLevel({ map: ['. . .', 'r> . .'], stock: { W: 1 } });
  // A 2x2 oval joined by a trailing switch: stem east, straight west, curve north.
  const r = simulate(b, lay(b, [[1, 1, 'W', 5], [2, 1, 'C', 3], [2, 0, 'C', 2], [1, 0, 'C', 1]]));
  assert.equal(r.outcome, 'loop');
  assert.equal(r.period, 4);
  const t = r.loopFrom + r.period * 3 + 0.5;
  assert.equal(wrapTime(r, t), r.loopFrom + 0.5);
});

test('stars reward few pieces', () => {
  assert.equal(starsFor(10, 9), 3);
  assert.equal(starsFor(10, 10), 3);
  assert.equal(starsFor(10, 13), 2);
  assert.equal(starsFor(10, 14), 1);
  assert.equal(starsFor(4, 6), 2);
  const b = parseLevel({ map: ['r> . R-'] });
  assert.equal(piecesUsed(b, lay(b, [[1, 0, 'S', 1]])), 1);
});
