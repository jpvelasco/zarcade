import test from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../src/chess.js';
import { PUZZLES, CHAPTERS, puzzleStars, goalText } from '../src/puzzles.js';
import { mateIn, mateKeys, moveMatesIn } from '../src/solver.js';
import { Searcher } from '../src/ai.js';
import { PuzzleRun } from '../src/puzzle-run.js';

const VAL = [0, 1, 3, 3, 5, 9, 0];
function material(pos, color) {
  let sum = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = pos.board[s];
    if (p) sum += (p >> 3) === color ? VAL[p & 7] : -VAL[p & 7];
  }
  return sum;
}

test('there are 30+ puzzles with unique ids in known chapters', () => {
  assert.ok(PUZZLES.length >= 30, `${PUZZLES.length} puzzles`);
  assert.equal(new Set(PUZZLES.map((p) => p.id)).size, PUZZLES.length);
  const chapters = new Set(CHAPTERS.map((c) => c.id));
  for (const p of PUZZLES) {
    assert.ok(chapters.has(p.chapter), p.id);
    assert.ok(p.title && p.tip, p.id);
  }
  // Chapters appear in order along the trail.
  const order = PUZZLES.map((p) => CHAPTERS.findIndex((c) => c.id === p.chapter));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
});

for (const p of PUZZLES) {
  test(`puzzle ${p.id}: ${p.title}`, () => {
    const pos = Position.fromFen(p.fen);
    assert.ok(!pos.isAttacked(pos.kings[pos.turn ^ 1], pos.turn), 'the side not to move is not in check');
    assert.ok(!pos.status().over);
    const solver = pos.turn;
    // The line is legal throughout.
    const replay = Position.fromFen(p.fen);
    for (const san of p.line) {
      const m = replay.moveFromSan(san);
      assert.ok(m, `${san} is legal in ${replay.fen()}`);
      replay.make(m);
    }
    assert.equal(p.line.length % 2, 1, 'the line ends with your move');
    if (p.goal === 'mate') {
      assert.equal(p.line.length, p.n * 2 - 1);
      assert.ok(replay.status().reason === 'checkmate', 'the line ends in checkmate');
      for (let k = 1; k < p.n; k++) assert.ok(!mateIn(Position.fromFen(p.fen), k), `no quicker mate in ${k}`);
      // Every move of yours before the last is the only one that keeps the mate.
      const walk = Position.fromFen(p.fen);
      for (let i = 0; i < p.line.length; i++) {
        const m = walk.moveFromSan(p.line[i]);
        if (i % 2 === 0) {
          const left = p.n - i / 2;
          if (left > 1) assert.deepEqual(mateKeys(walk, left).map((x) => walk.san(x)), [walk.san(m)], `unique key at move ${i / 2 + 1}`);
          else assert.ok(moveMatesIn(walk, m, 1));
        }
        walk.make(m);
      }
    } else {
      // A tactic: the first move is clearly the best, and the line wins material.
      const all = new Searcher().scoreAll(Position.fromFen(p.fen), 4);
      const key = pos.moveFromSan(p.line[0]);
      assert.equal(all[0].move, key, `engine agrees on ${p.line[0]}`);
      if (all.length > 1) assert.ok(all[0].score - all[1].score >= 150, `margin ${all[0].score - all[1].score}`);
      assert.ok(material(replay, solver) - material(pos, solver) >= 3, 'wins at least 3 points');
    }
    assert.match(goalText(p, solver), p.goal === 'mate' ? /checkmate in \d/ : /win material/);
  });
}

test('stars: three for clean, two for one slip, one otherwise', () => {
  assert.equal(puzzleStars(0, 0), 3);
  assert.equal(puzzleStars(1, 0), 2);
  assert.equal(puzzleStars(0, 1), 2);
  assert.equal(puzzleStars(2, 1), 1);
});

test('a puzzle run accepts the line, any final mate, and rejects wrong moves', () => {
  const p = PUZZLES.find((x) => x.id === 'philidor');
  const run = new PuzzleRun(p);
  const wrong = run.game.pos.moveFromSan('Qc8');
  assert.equal(run.try(wrong).ok, false);
  assert.equal(run.mistakes, 1);
  const r1 = run.try(run.game.pos.moveFromSan('Qg8+'));
  assert.ok(r1.ok && r1.needsReply);
  assert.equal(run.playReply().san, 'Rxg8');
  const r2 = run.try(run.game.pos.moveFromSan('Nf7#'));
  assert.ok(r2.ok && r2.solved);
  assert.equal(run.stars(), 2);
  // Mate in one: any checkmate counts (both promotions mate here).
  const promo = new PuzzleRun(PUZZLES.find((x) => x.id === 'promotion'));
  const r = promo.try(promo.game.pos.moveFromSan('c8=R#'));
  assert.ok(r.ok && r.solved);
  assert.equal(promo.stars(), 3);
});

test('puzzle hints point at the next move: first the piece, then the move', () => {
  const run = new PuzzleRun(PUZZLES[0]);
  const h1 = run.hint();
  assert.equal(h1.level, 1);
  const h2 = run.hint();
  assert.equal(h2.level, 2);
  assert.equal(h2.move, run.game.pos.moveFromSan(PUZZLES[0].line[0]));
  assert.equal(run.hints, 2);
});
