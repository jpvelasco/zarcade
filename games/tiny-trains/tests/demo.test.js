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
