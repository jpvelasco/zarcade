import test from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN, WHITE } from '../src/chess.js';
import { Searcher, chooseMove, evaluate, LEVELS, MATE_BOUND } from '../src/ai.js';
import { createThinker } from '../src/think.js';
import { makeSetup } from '../src/game.js';

const searcher = new Searcher();
const best = (fen, opts = { timeMs: 600 }) => {
  const pos = Position.fromFen(fen);
  const r = searcher.search(pos, opts);
  return { san: pos.san(r.move), ...r };
};

test('evaluation is symmetric and starts level', () => {
  assert.equal(evaluate(Position.fromFen(START_FEN)), 0);
  const w = evaluate(Position.fromFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'));
  const b = evaluate(Position.fromFen('3qk3/8/8/8/8/8/8/4K3 b - - 0 1'));
  assert.equal(w, b);
  assert.ok(w > 800);
});

test('finds mate in one and mate in two', () => {
  assert.equal(best('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1').san, 'Rd8#');
  const m2 = best('5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1');
  assert.equal(m2.san, 'Qg8+');
  assert.ok(m2.score >= MATE_BOUND);
});

test('takes a free queen and avoids hanging its own', () => {
  assert.equal(best('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1').san, 'Rxd5');
  const r = best('4k3/8/8/8/8/2n5/8/Q3K3 w - - 0 1');
  assert.notEqual(r.san, 'Qa2');
});

test('respects its time budget', () => {
  const pos = Position.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const r = new Searcher().search(pos, { timeMs: 250 });
  assert.ok(r.ms < 600, `took ${r.ms}ms`);
  assert.ok(r.depth >= 3);
  assert.ok(pos.legalMoves().includes(r.move));
});

test('node-limited searches are deterministic', () => {
  const a = new Searcher().search(Position.fromFen(START_FEN), { nodeLimit: 20000, timeMs: 1e9 });
  const b = new Searcher().search(Position.fromFen(START_FEN), { nodeLimit: 20000, timeMs: 1e9 });
  assert.equal(a.move, b.move);
  assert.equal(a.score, b.score);
});

test('every bot level returns a legal move, and the same seed repeats', () => {
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const pos = Position.fromFen(START_FEN);
    const r = chooseMove(new Searcher(), pos, lv, 99, { timeScale: 0.1 });
    assert.ok(pos.legalMoves().includes(r.move), `level ${lv}`);
    if (lv < 3) assert.equal(chooseMove(new Searcher(), Position.fromFen(START_FEN), lv, 99).move, r.move);
  }
});

test('even Pip takes a mate in one, but Pip blunders more than Owl', () => {
  const pos = Position.fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  let pipMates = 0;
  for (let seed = 1; seed <= 20; seed++) if (pos.san(chooseMove(new Searcher(), pos, 0, seed).move) === 'Rd8#') pipMates++;
  assert.ok(pipMates >= 10, `Pip found mate ${pipMates}/20 times`);
  // A free queen: Owl always takes it; Pip sometimes doesn't.
  const q = Position.fromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
  let pipTakes = 0;
  for (let seed = 1; seed <= 30; seed++) if (q.san(chooseMove(new Searcher(), q, 0, seed).move) === 'Rxd5') pipTakes++;
  assert.ok(pipTakes < 30 && pipTakes > 5, `Pip took the queen ${pipTakes}/30 times`);
  assert.equal(q.san(chooseMove(new Searcher(), q, 4, 1, { timeScale: 0.2 }).move), 'Rxd5');
});

test('Grandmaster Owl mates with king and queen against a lone king', () => {
  const pos = Position.fromFen('8/8/8/4k3/8/8/8/3QK3 w - - 0 1');
  const s = new Searcher();
  for (let ply = 0; ply < 60 && !pos.status().over; ply++) {
    const r = s.search(pos, { timeMs: 120, maxDepth: 12 });
    pos.make(r.move);
  }
  const st = pos.status();
  assert.equal(st.reason, 'checkmate', pos.fen());
  assert.equal(st.winner, WHITE);
});

test('the bots use powers and stay legal in Power Squares', () => {
  const think = createThinker();
  const setup = makeSetup('powers', 9);
  const pos = Position.fromFen(setup.fen, { powers: { squares: [], inv: [[1, 1, 1], [1, 1, 1]] } });
  const r = new Searcher().search(pos, { timeMs: 200 });
  assert.ok(pos.legalMoves().includes(r.move));
  const res = think({ id: 1, type: 'move', setup, moves: ['e2e4', 'e7e5'], level: 3, seed: 2 });
  assert.ok(res.move && res.ms >= 0);
});

test('the worker thinker answers hints and coach analysis', () => {
  const think = createThinker();
  const setup = { mode: 'classic', fen: START_FEN };
  // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? — the coach looks at Black's last move.
  const moves = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6'];
  const res = think({ id: 7, type: 'move', setup, moves, level: 0, seed: 1, coach: true });
  assert.equal(res.id, 7);
  assert.ok(res.coach);
  assert.ok(res.coach.bestScore - res.coach.playedScore > 500, 'Nf6 allows mate');
  assert.equal(res.coach.reply, 'h5f7');
  const hint = think({ id: 8, type: 'hint', setup, moves, timeMs: 200 });
  assert.equal(hint.move, 'h5f7');
});
