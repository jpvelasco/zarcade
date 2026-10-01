import test from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN, WHITE, BLACK, sqName, parseSq } from '../src/chess.js';

// Well-known perft counts (chessprogramming.org "Perft Results").
const PERFT = [
  ['start position', START_FEN, [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['position 3 (en passant, pins)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4 (promotions, castling)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['position 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
  ['Chess960 #1 (Shredder-FEN castling)', 'bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9', [21, 528, 12189, 326672]],
  ['Chess960 #2', '2nnrbkr/p1qppppp/8/1ppb4/6PP/3PP3/PPP2P2/BQNNRBKR w HEhe - 1 9', [21, 807, 18002, 667366]],
];

for (const [name, fen, counts] of PERFT) {
  test(`perft: ${name}`, () => {
    const pos = Position.fromFen(fen);
    counts.forEach((n, i) => assert.equal(pos.perft(i + 1), n, `depth ${i + 1}`));
    assert.equal(pos.fen().split(' ')[0], fen.split(' ')[0], 'perft leaves the board untouched');
  });
}

test('FEN round-trips', () => {
  for (const fen of [
    START_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
    '8/8/8/4k3/8/8/8/4K3 b - - 42 77',
  ]) assert.equal(Position.fromFen(fen).fen(), fen);
});

test('bad FEN is rejected', () => {
  assert.throws(() => Position.fromFen('8/8/8/8/8/8/8/8 w - - 0 1'));
  assert.throws(() => Position.fromFen('rnbqkbnr/pppppppp/8/8 w KQkq - 0 1'));
});

test('square names', () => {
  assert.equal(sqName(parseSq('e4')), 'e4');
  assert.equal(parseSq('i9'), -1);
});

function play(pos, ...sans) {
  for (const s of sans) {
    const m = pos.moveFromSan(s);
    assert.ok(m, `legal: ${s} in ${pos.fen()}`);
    pos.make(m);
  }
  return pos;
}

test('SAN: disambiguation, captures, castling, promotion, check and mate', () => {
  const pos = Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const sans = pos.legalMoves().map((m) => pos.san(m));
  assert.ok(sans.includes('O-O') && sans.includes('O-O-O'));
  assert.ok(sans.includes('Rxa8+'));
  const knights = Position.fromFen('4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1');
  assert.ok(knights.legalMoves().map((m) => knights.san(m)).includes('Nce4'));
  const files = Position.fromFen('4k3/8/8/8/N7/8/N7/4K3 w - - 0 1');
  const fs = files.legalMoves().map((m) => files.san(m));
  assert.ok(fs.includes('N2c3') && fs.includes('N4c3'), 'same file: rank disambiguates');
  const promo = Position.fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const ps = promo.legalMoves().map((m) => promo.san(m));
  for (const p of ['a8=Q', 'a8=R', 'a8=B', 'a8=N']) assert.ok(ps.includes(p), p);
  const mate = play(Position.fromFen(), 'f3', 'e5', 'g4');
  assert.equal(mate.san(mate.moveFromSan('Qh4')), 'Qh4#');
});

test('en passant is offered only right after the double step', () => {
  const pos = play(Position.fromFen(), 'e4', 'a6', 'e5', 'd5');
  assert.ok(pos.moveFromSan('exd6'), 'en passant available');
  play(pos, 'a3', 'a5');
  assert.equal(pos.moveFromSan('exd6'), 0, 'en passant expired');
});

test('castling rules: no castling out of, through, or into check', () => {
  const through = Position.fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  const t = through.legalMoves().map((m) => through.san(m));
  assert.ok(!t.includes('O-O'), 'f1 attacked');
  assert.ok(t.includes('O-O-O'));
  const inCheck = Position.fromFen('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
  assert.ok(!inCheck.legalMoves().map((m) => inCheck.san(m)).some((s) => s.startsWith('O-O')));
  const moved = play(Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'Rh2', 'Rh7', 'Rh1', 'Rh8');
  assert.equal(moved.fen().split(' ')[2], 'Qq');
});

test('checkmate, stalemate and insufficient material', () => {
  const mate = play(Position.fromFen(), 'f3', 'e5', 'g4', 'Qh4');
  assert.deepEqual([mate.status().reason, mate.status().winner], ['checkmate', BLACK]);
  const stale = Position.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(stale.status().reason, 'stalemate');
  for (const fen of ['8/8/8/4k3/8/8/8/4K3 w - - 0 1', '8/8/8/4k3/8/8/8/4KN2 w - - 0 1', '8/8/8/2b1k3/8/8/8/3KB3 w - - 0 1']) {
    assert.equal(Position.fromFen(fen).status().reason, 'material', fen);
  }
  assert.equal(Position.fromFen('8/8/8/2b1k3/8/8/8/4KB2 w - - 0 1').status().over, false, 'bishops on opposite colors can still mate');
  assert.equal(Position.fromFen('8/8/8/4k3/8/8/8/4KNN1 w - - 0 1').status().over, false);
});

test('threefold repetition and the fifty-move rule', () => {
  const pos = Position.fromFen();
  play(pos, 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1');
  assert.equal(pos.status().over, false);
  play(pos, 'Ng8');
  assert.equal(pos.status().reason, 'repetition');
  const fifty = Position.fromFen('8/8/8/4k3/8/8/1R6/4K3 w - - 99 80');
  assert.equal(fifty.status().over, false);
  play(fifty, 'Rb3');
  assert.equal(fifty.status().reason, 'fifty');
  // Checkmate on the fiftieth move still wins.
  const late = Position.fromFen('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 99 80');
  play(late, 'Rd8');
  assert.equal(late.status().reason, 'checkmate');
});

test('make/unmake restores everything, including the hash', () => {
  const pos = Position.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const fen = pos.fen(), h = [pos.h1, pos.h2];
  for (const m of pos.legalMoves()) {
    pos.make(m);
    const after = [pos.h1, pos.h2];
    pos.computeHash();
    assert.deepEqual([pos.h1, pos.h2], after, `incremental hash after ${pos.uci(m)}`);
    pos.unmake();
  }
  assert.equal(pos.fen(), fen);
  assert.deepEqual([pos.h1, pos.h2], h);
});

test('UCI move strings round-trip, castling both ways', () => {
  const pos = Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  for (const m of pos.legalMoves()) assert.equal(pos.moveFromUci(pos.uci(m)), m);
  assert.ok(pos.moveFromUci('e1g1'), 'e1g1 castles in normal chess');
  assert.equal(pos.uci(pos.moveFromUci('e1g1')), 'e1h1');
  assert.equal(pos.turn, WHITE);
});
