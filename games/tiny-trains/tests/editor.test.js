import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor, switchFrom, cellsBetween } from '../src/editor.js';
import { parseLevel } from '../src/board.js';
import { simulate } from '../src/sim.js';
import { N, E, S, W } from '../src/pieces.js';

const row = (w, y, xs) => xs.map((x) => y * w + x);

test('dragging from the depot to the station lays a working line', () => {
  const b = parseLevel({ map: ['r> . . . R-'] });
  const ed = new Editor(b);
  ed.beginStroke();
  ed.drawStroke(row(5, 0, [0, 1, 2, 3, 4]));
  assert.ok(ed.endStroke());
  assert.equal(ed.count, 3);
  assert.equal(simulate(b, ed.layout).outcome, 'win');
  assert.ok(ed.undo());
  assert.equal(ed.count, 0);
});

test('dragging round a corner makes curves', () => {
  const b = parseLevel({ map: ['r> . .', 't t .', '. . R|'] });
  const ed = new Editor(b);
  ed.beginStroke();
  ed.drawStroke([0, 1, 2, 5, 8]);
  ed.endStroke();
  assert.deepEqual(ed.layout.get(2), { t: 'C', v: 2 });
  assert.equal(simulate(b, ed.layout).outcome, 'win');
});

test('drawing across a line makes a crossing when one is in stock', () => {
  const map = ['. . bv . .', 'r> . . . R-', '. . B| . .'];
  const b = parseLevel({ map, stock: { X: 1 } });
  const ed = new Editor(b);
  ed.beginStroke(); ed.drawStroke(row(5, 1, [0, 1, 2, 3, 4])); ed.endStroke();
  ed.beginStroke(); ed.drawStroke([2, 7, 12]); ed.endStroke();
  assert.equal(ed.layout.get(7).t, 'X');
  assert.equal(simulate(b, ed.layout).outcome, 'win');
  const none = new Editor(parseLevel({ map }));
  none.beginStroke(); none.drawStroke(row(5, 1, [0, 1, 2, 3, 4])); none.endStroke();
  none.beginStroke(); none.drawStroke([2, 7, 12]); none.endStroke();
  assert.equal(none.layout.get(7).t, 'S');
});

test('drawing a branch off a line makes a switch when one is in stock', () => {
  const b = parseLevel({ map: ['r> . . R-', '. . . B-'], queue: { '0,0': 'rb' }, stock: { W: 1 } });
  const ed = new Editor(b);
  ed.beginStroke(); ed.drawStroke([0, 1, 2, 3]); ed.endStroke();
  ed.beginStroke(); ed.drawStroke([0, 1, 5, 6, 7]); ed.endStroke();
  assert.equal(ed.layout.get(1).t, 'W');
  assert.equal(simulate(b, ed.layout).outcome, 'win');
});

test('switch shapes from two pieces', () => {
  assert.equal(switchFrom([E, W], [W, S]), W + 4);
  assert.equal(switchFrom([E, W], [W, N]), W);
  assert.equal(switchFrom([N, E], [N, S]), N);
  assert.equal(switchFrom([N, S], [E, W]), null);
});

test('taps place a fitting piece, turn it, and respect the stock', () => {
  const b = parseLevel({ map: ['. bv .', 'r> . .', '. . .'], stock: { X: 1 } });
  const ed = new Editor(b);
  assert.equal(ed.tap(4, 'track'), 'place');
  // It joins the depot to the west and the depot above: a curve W–N.
  assert.deepEqual(ed.layout.get(4), { t: 'C', v: 3 });
  assert.equal(ed.tap(4, 'track'), 'turn');
  assert.deepEqual(ed.layout.get(4), { t: 'C', v: 0 });
  assert.equal(ed.tap(5, 'X'), 'place');
  assert.equal(ed.tap(7, 'X'), 'empty');
  assert.equal(ed.left('X'), 0);
  assert.equal(ed.tap(1, 'track'), null, 'depots are not buildable');
  assert.equal(ed.tap(5, 'erase'), 'remove');
  assert.equal(ed.left('X'), 1);
  assert.ok(ed.clear());
  assert.equal(ed.count, 0);
  ed.undo();
  assert.equal(ed.count, 1);
});

test('cellsBetween steps through every cell', () => {
  assert.deepEqual(cellsBetween(5, 0, 3), [1, 2, 3]);
  assert.deepEqual(cellsBetween(5, 0, 11), [5, 6, 11]);
});

test('a stroke that loops back onto itself joins with a switch', () => {
  const b = parseLevel({ map: ['. . . .', 'r> . . .', '. . . .'], stock: { W: 1 } });
  const ed = new Editor(b);
  ed.beginStroke();
  ed.drawStroke([4, 5, 6, 10, 9, 5]);
  ed.endStroke();
  assert.equal(ed.layout.get(5).t, 'W');
  assert.equal(simulate(b, ed.layout, { requireServed: false }).outcome, 'loop');
});
