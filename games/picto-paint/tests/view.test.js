import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/render.js';
import { Board } from '../src/board.js';
import { BY_ID } from '../src/progress.js';

// The renderer's layout maths without a canvas: a phone-sized view.
function view(id, W = 390, H = 844) {
  const r = Object.create(Renderer.prototype);
  const p = BY_ID.get(id);
  Object.assign(r, { W, H, board: new Board(p), rowClues: p.rows, colClues: p.cols, view: { z: 1, tx: 0, ty: 0 } });
  r.layout({ top: 60, bottom: 110, right: 0 });
  return r;
}

test('unzoomed, every square is reachable from its own spot', () => {
  const r = view('earth');
  const L = r.lay;
  assert.equal(r.cellAt(L.gx + 1, L.gy + 1), 0);
  assert.equal(r.cellAt(L.gx - 1, L.gy + 1), -1);
  const last = r.board.w * r.board.h - 1;
  assert.equal(r.cellAt(L.gx + r.board.w * L.s - 1, L.gy + r.board.h * L.s - 1), last);
});

test('zoomed in, the pinned clue bands cover squares and taps there paint nothing', () => {
  const r = view('earth');
  r.zoomAt(3, 250, 500);
  r.panBy(-400, -400); // scroll into the middle of the board
  assert.ok(r.view.z > 2);
  const edge = r.bandEdges();
  // A square sits under each band, but taps on the band don't reach it.
  assert.ok(Math.floor((edge.x - 5 - r.sx(r.lay.gx)) / r.S) >= 0, 'a square is hidden under the row clues');
  assert.equal(r.cellAt(edge.x - 5, 500), -1);
  assert.equal(r.cellAt(250, edge.y - 5), -1);
  assert.ok(r.cellAt(edge.x + 2, edge.y + 2) >= 0);
  // A drag that slides onto a band stops at the first visible square.
  const near = r.cellNear(edge.x - 30, 500);
  assert.equal(near, r.cellAt(edge.x + 0.5, 500));
});

test('big boards on a phone offer a zoom that makes finger-sized squares', () => {
  const r = view('earth');
  assert.ok(r.lay.s < 24, `earth fits at ${r.lay.s} px`);
  assert.equal(r.smallSquares(), true);
  r.toggleZoom(200, 400);
  assert.ok(r.S >= 40, `zoomed squares are ${r.S} px`);
  r.toggleZoom(200, 400);
  assert.equal(r.view.z, 1);
  // Small boards and roomy screens don't need it.
  assert.equal(view('heart').smallSquares(), false);
  assert.equal(view('earth', 1366, 860).smallSquares(), false);
});
