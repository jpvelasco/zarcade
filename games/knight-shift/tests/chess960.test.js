import test from 'node:test';
import assert from 'node:assert/strict';
import { backRank, chess960Fen } from '../src/chess960.js';
import { Position } from '../src/chess.js';
import { makeSetup, Game } from '../src/game.js';

test('Scharnagl numbering: 518 is the normal setup, 0 is BBQNNRKR', () => {
  assert.equal(backRank(518), 'rnbqkbnr');
  assert.equal(backRank(0), 'bbqnnrkr');
  assert.equal(backRank(959), 'rkrnnqbb');
});

test('all 960 setups are distinct and valid', () => {
  const seen = new Set();
  for (let n = 0; n < 960; n++) {
    const r = backRank(n);
    seen.add(r);
    const b1 = r.indexOf('b'), b2 = r.lastIndexOf('b');
    assert.notEqual(b1 % 2, b2 % 2, `bishops on opposite colors: ${r}`);
    const k = r.indexOf('k');
    assert.ok(r.indexOf('r') < k && r.lastIndexOf('r') > k, `king between rooks: ${r}`);
    assert.equal(Position.fromFen(chess960Fen(n)).perft(1), Position.fromFen(chess960Fen(n)).legalMoves().length);
  }
  assert.equal(seen.size, 960);
});

test('Chess960 castling: king and rook land on the normal squares', () => {
  // King on b1, rook on a1 and h1: castling long moves the king right.
  const pos = Position.fromFen('rk5r/8/8/8/8/8/8/RK5R w KQkq - 0 1', { chess960: true });
  const long = pos.moveFromSan('O-O-O');
  assert.ok(long);
  pos.make(long);
  assert.equal(pos.fen().split(' ')[0], 'rk5r/8/8/8/8/8/8/2KR3R');
  pos.unmake();
  const short = pos.moveFromSan('O-O');
  pos.make(short);
  assert.equal(pos.fen().split(' ')[0], 'rk5r/8/8/8/8/8/8/R4RK1');
});

test('Chess960 castling when the king already stands on g1', () => {
  const pos = Position.fromFen('6kr/8/8/8/8/8/8/6KR w Kk - 0 1', { chess960: true });
  const m = pos.moveFromSan('O-O');
  assert.ok(m, 'castling with king on g1 and rook on h1');
  pos.make(m);
  assert.equal(pos.fen().split(' ')[0], '6kr/8/8/8/8/8/8/5RK1');
});

test('Chess960 castling is blocked by any piece between, and by attacks', () => {
  const blocked = Position.fromFen('4k3/8/8/8/8/8/8/1RK1N2R w KQ - 0 1', { chess960: true });
  assert.equal(blocked.moveFromSan('O-O'), 0, 'knight in the way');
  assert.ok(blocked.moveFromSan('O-O-O'));
  const path = Position.fromFen('4r1k1/8/8/8/8/8/8/RK5R w KQ - 0 1', { chess960: true });
  assert.equal(path.moveFromSan('O-O'), 0, 'the king would pass the attacked e1');
  assert.ok(path.moveFromSan('O-O-O'));
  const rookSafe = Position.fromFen('3rk3/8/8/8/8/8/8/1RK4R w KQ - 0 1', { chess960: true });
  assert.ok(rookSafe.moveFromSan('O-O-O'), 'only the king\'s path must be safe, not the rook\'s square');
});

test('a Chess960 game replays from its seed', () => {
  const setup = makeSetup('960', 1234);
  assert.equal(setup.index, 1234 % 960);
  const g = new Game(setup);
  for (let i = 0; i < 10; i++) g.play(g.legal[i % g.legal.length]);
  const again = Game.fromSave(JSON.parse(JSON.stringify(g.toSave())));
  assert.equal(again.fen, g.fen);
});
