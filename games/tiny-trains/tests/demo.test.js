import test from 'node:test';
import assert from 'node:assert/strict';
import { titleScene, sandboxBoard, packSandbox, emptySandbox, SANDBOX_W, SANDBOX_H } from '../src/demo.js';
import { simulate } from '../src/sim.js';
import { Editor } from '../src/editor.js';

test('the title diorama loops forever without a bump', () => {
  const { board, layout } = titleScene();
  assert.deepEqual(board.errors, []);
  const r = simulate(board, layout);
  assert.equal(r.outcome, 'loop');
  assert.ok(r.period > 10);
  assert.equal(r.failures.length, 0);
});

test('sandbox boards round-trip and send one train per depot', () => {
  const { board, layout } = sandboxBoard(null);
  assert.equal(board.cells.length, SANDBOX_W * SANDBOX_H);
  assert.equal(board.trains.length, 0);
  board.cells[10] = { k: 'depot', dir: 1, color: 'blue', x: 1, y: 1 };
  board.cells[13] = { k: 'station', t: 'S', v: 1, color: 'blue', x: 4, y: 1 };
  const ed = new Editor(board, { layout, unlimited: true });
  ed.beginStroke(); ed.drawStroke([10, 11, 12, 13]); ed.endStroke();
  const packed = JSON.parse(JSON.stringify(packSandbox(board, ed.layout)));
  const again = sandboxBoard(packed);
  assert.equal(again.board.trains.length, 1);
  assert.equal(simulate(again.board, again.layout, { requireServed: false }).outcome, 'win');
  assert.equal(sandboxBoard({ cells: [1, 2] }).board.cells.length, emptySandbox().cells.length);
});

test('sandbox undo takes back board changes like a new depot', () => {
  const { board, layout } = sandboxBoard(null);
  const ed = new Editor(board, { layout, unlimited: true, undoBoard: true });
  ed.beginStroke(); ed.drawStroke([19, 20, 21, 22, 23]); ed.endStroke();
  assert.equal(ed.count, 5);
  // Put a depot on a track square, the way the sandbox tool does.
  ed.push();
  ed.layout.delete(21);
  board.cells[21] = { k: 'depot', dir: 1, color: 'red', x: 3, y: 2 };
  assert.ok(ed.undo());
  assert.equal(board.cells[21].k, 'grass');
  assert.equal(ed.count, 5);
  assert.ok(ed.undo());
  assert.equal(ed.count, 0);
});
