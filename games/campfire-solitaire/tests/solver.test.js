import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, hintFor, lineStreak, DRAW } from '../src/solver.js';
import { Round } from '../src/game.js';
import { layoutById, LAYOUTS } from '../src/layouts.js';

// Replays a solver line on a real round; returns the round.
function replay(round, line) {
  for (const m of line) {
    const ok = m === DRAW ? round.draw() : round.play(m);
    assert.ok(ok, `move ${m} is legal`);
  }
  return round;
}

test('a winning line found by the solver really clears the layout', () => {
  for (const layout of LAYOUTS) {
    let checked = 0;
    for (let seed = 1; seed < 40 && checked < 3; seed++) {
      const round = new Round({ layout, seed, stockSize: 22 });
      const res = solve(round.position(), { budget: 50000 });
      if (res.result !== 'win') continue;
      replay(round, res.line);
      assert.equal(round.status, 'won', `${layout.id} seed ${seed}`);
      checked++;
    }
    assert.ok(checked > 0, `${layout.id} had a winnable deal`);
  }
});

test('an impossible deal is proven lost, not merely unknown', () => {
  const layout = layoutById('peaks');
  const round = new Round({ layout, seed: 1, stockSize: 3 });
  round.cards = round.cards.map(() => 6); // every card a 7…
  round.waste = [0]; // …on an Ace, with a stock of Jacks
  round.stock = [10, 10, 10];
  const res = solve(round.position(), { budget: 100000 });
  assert.equal(res.result, 'lose');
  assert.equal(res.line, null);
  assert.equal(res.best.cleared, 0);
});

test('a tiny budget reports unknown, and the same budget gives the same answer', () => {
  const layout = layoutById('twin');
  let found = false;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const round = new Round({ layout, seed, stockSize: 19 });
    const full = solve(round.position(), { budget: 400000 });
    if (full.nodes < 2000) continue;
    const small = solve(round.position(), { budget: 500 });
    assert.equal(small.result, 'unknown');
    assert.equal(small.nodes, 500);
    assert.deepEqual(solve(round.position(), { budget: 500 }), small, 'deterministic');
    found = true;
  }
  assert.ok(found);
});

test('the solver searches from mid-round positions too', () => {
  const layout = layoutById('peaks');
  const round = new Round({ layout, seed: 11, stockSize: 24 });
  const res = solve(round.position(), { budget: 100000 });
  assert.equal(res.result, 'win');
  replay(round, res.line.slice(0, 6));
  const mid = solve(round.position(), { budget: 100000 });
  assert.equal(mid.result, 'win');
  replay(round, mid.line);
  assert.equal(round.status, 'won');
});

test('following hints alone clears a winnable deal', () => {
  for (const id of ['peaks', 'pine', 'dipper']) {
    const layout = layoutById(id);
    let seed = 1;
    let round;
    do round = new Round({ layout, seed: seed++, stockSize: 22 });
    while (solve(round.position(), { budget: 50000 }).result !== 'win');
    let guard = 0;
    while (round.status === 'play' && guard++ < 80) {
      const h = hintFor(round);
      assert.equal(h.kind, 'win', `${id}: a hint from a winnable spot is a winning move`);
      round.noteHint();
      if (h.move === DRAW) assert.ok(round.draw());
      else assert.ok(round.play(h.move));
    }
    assert.equal(round.status, 'won', id);
    assert.ok(!round.solo);
  }
});

test('from a lost position the hint says so, and still offers the best move', () => {
  const layout = layoutById('peaks');
  const round = new Round({ layout, seed: 1, stockSize: 2 });
  round.cards = round.cards.map((c, i) => (i === 16 ? 1 : 6)); // one 2, the rest 7s
  round.waste = [0];
  round.stock = [10, 10];
  const h = hintFor(round);
  assert.equal(h.kind, 'lost');
  assert.equal(h.move, 16);
  round.status = 'won';
  assert.equal(hintFor(round).kind, 'none');
});

test('lineStreak counts the longest run of plays between draws', () => {
  assert.equal(lineStreak([]), 0);
  assert.equal(lineStreak([1, 2, DRAW, 3, 4, 5, DRAW, 6]), 3);
  assert.equal(lineStreak([DRAW, DRAW]), 0);
  assert.equal(lineStreak([1, 2], 3), 5, 'continues a streak already running');
});
