import test from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN } from '../src/chess.js';
import { explainMove } from '../src/explain.js';

const at = (fen) => Position.fromFen(fen);
const mv = (pos, san) => pos.moveFromSan(san);

test('good moves get no comment', () => {
  const pos = at(START_FEN);
  assert.equal(explainMove(pos, mv(pos, 'e4'), { best: mv(pos, 'e4'), bestScore: 30, playedScore: 30, reply: 0 }), null);
  assert.equal(explainMove(pos, mv(pos, 'd4'), { best: mv(pos, 'e4'), bestScore: 30, playedScore: 20, reply: 0 }), null);
});

test('hanging a piece is explained with the capturing piece and square', () => {
  const pos = at('4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1');
  const played = mv(pos, 'Qd4');
  pos.make(played);
  const reply = mv(pos, 'exd4');
  pos.unmake();
  const note = explainMove(pos, played, { best: mv(pos, 'Qd7+'), bestScore: 900, playedScore: 0, reply }, 'Pip');
  assert.match(note.text, /pawn can take your queen on d4/);
});

test('allowing mate is called out', () => {
  // 1.e4 e5 2.Qh5 Nc6 3.Bc4 and Black plays Nf6?? allowing Qxf7#.
  const pos = at('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3');
  const played = mv(pos, 'Nf6');
  pos.make(played);
  const reply = mv(pos, 'Qxf7#');
  pos.unmake();
  const note = explainMove(pos, played, { best: mv(pos, 'g6'), bestScore: 0, playedScore: -99990, reply }, 'Bella');
  assert.match(note.text, /Bella checkmate you with Qxf7#/);
  assert.equal(note.severity, 'danger');
});

test('missing a mate or a free piece is pointed out', () => {
  const pos = at('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  const note = explainMove(pos, mv(pos, 'h3'), { best: mv(pos, 'Rd8#'), bestScore: 99999, playedScore: 0, reply: 0 });
  assert.match(note.text, /checkmate! Try Rd8#/);
  const free = at('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
  const n2 = explainMove(free, mv(free, 'Kf2'), { best: mv(free, 'Rxd5'), bestScore: 600, playedScore: -300, reply: 0 });
  assert.match(n2.text, /captured their queen with Rxd5/);
});
