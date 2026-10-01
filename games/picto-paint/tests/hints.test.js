import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, UNKNOWN, CROSS } from '../src/board.js';
import { nextHint, applyHint } from '../src/hints.js';
import { PUZZLES } from '../src/progress.js';
import { buildPuzzle } from '../src/puzzle.js';

// Autoplay with hints only: every step must agree with the picture.
function autoplay(p, mode = 'expert') {
  const b = new Board(p, { mode });
  let steps = 0;
  while (!b.solved && steps < 2000) {
    const h = nextHint(b);
    assert.ok(h, `${p.id}: stuck after ${steps} hints`);
    assert.notEqual(h.kind, 'mistake', `${p.id}: a hint made a mistake`);
    assert.ok(h.text.length > 20);
    for (const c of h.cells) {
      const want = p.solution[c.i];
      assert.equal(c.value, want >= 0 ? want : CROSS, `${p.id}: hint disagrees with picture`);
    }
    applyHint(b, h);
    steps++;
  }
  return { b, steps };
}

test('hints alone solve every puzzle without a wrong square', () => {
  const kinds = new Set();
  for (const p of PUZZLES) {
    const { b } = autoplay(p);
    assert.equal(b.solved, true, p.id);
    assert.ok(b.hints > 0);
  }
  // Sample the kinds of reasoning on a few boards.
  const b = new Board(PUZZLES[0]);
  for (let k = 0; k < 6 && !b.solved; k++) { const h = nextHint(b); kinds.add(h.kind); applyHint(b, h); }
  assert.ok(kinds.size >= 1);
});

test('the easiest step comes first: a zero line, then an exact fit', () => {
  const p = buildPuzzle({ id: 'z', name: 'Z', art: ['kkkkk', '.....', 'k.k.k'].map((r) => r).concat(['kkkkk']) });
  const b = new Board(p);
  const h = nextHint(b);
  assert.equal(h.kind, 'zero');
  assert.match(h.text, /Row 2 has a 0/);
  applyHint(b, h);
  const h2 = nextHint(b);
  assert.equal(h2.kind, 'exact');
});

test('a mistake gets pointed out before anything else', () => {
  const p = PUZZLES[0];
  const b = new Board(p, { mode: 'expert' });
  const wrong = p.solution.findIndex((v) => v < 0);
  b.cells[wrong] = 0;
  const h = nextHint(b);
  assert.equal(h.kind, 'mistake');
  applyHint(b, h);
  assert.equal(b.cells[wrong], UNKNOWN);
  assert.equal(b.hints, 1);
});

test('a solved board has no hint', () => {
  const p = PUZZLES[0];
  const { b } = autoplay(p);
  assert.equal(nextHint(b), null);
});
