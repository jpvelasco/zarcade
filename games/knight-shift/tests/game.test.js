import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, makeSetup, fogVisible, buildPosition } from '../src/game.js';
import { parseSq, sqName, WHITE, BLACK, KING, ROOK, POWER_LEAP, LEAP, mFlag } from '../src/chess.js';

test('a game records SAN, captures, and undoes cleanly', () => {
  const g = new Game(makeSetup('classic'));
  for (const u of ['e2e4', 'd7d5', 'e4d5', 'd8d5']) g.play(g.pos.moveFromUci(u));
  assert.deepEqual(g.history.map((h) => h.san), ['e4', 'd5', 'exd5', 'Qxd5']);
  assert.equal(g.capturedBy(WHITE).length, 1);
  assert.equal(g.capturedBy(BLACK).length, 1);
  assert.equal(g.materialBalance(), 0);
  g.undo();
  assert.equal(g.materialBalance(), 1);
  assert.equal(g.turn, BLACK);
  assert.equal(g.history.length, 3);
});

test('movesFrom lists targets, castling answers to king square and rook square', () => {
  const g = new Game({ mode: 'classic', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' });
  const t = g.movesFrom(parseSq('e1'));
  assert.ok(t.has(parseSq('g1')) && t.has(parseSq('h1')) && t.has(parseSq('c1')) && t.has(parseSq('a1')));
  const rec = g.play(t.get(parseSq('g1'))[0]);
  assert.equal(rec.san, 'O-O');
  assert.deepEqual(rec.slides.map((s) => [s.piece & 7, sqName(s.from), sqName(s.to)]), [[KING, 'e1', 'g1'], [ROOK, 'h1', 'f1']]);
});

test('promotion offers four choices on one target', () => {
  const g = new Game({ mode: 'classic', fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' });
  assert.equal(g.movesFrom(parseSq('a7')).get(parseSq('a8')).length, 4);
});

test('fog shows your squares and where your pieces reach, nothing else', () => {
  const pos = buildPosition(makeSetup('fog'));
  const vis = fogVisible(pos, WHITE);
  for (const s of ['a1', 'h2', 'e3', 'e4', 'a3', 'c3', 'f3', 'h3']) assert.equal(vis[parseSq(s)], 1, s);
  for (const s of ['e5', 'a6', 'd7', 'e8', 'a5']) assert.equal(vis[parseSq(s)], 0, s);
  const black = fogVisible(pos, BLACK);
  assert.equal(black[parseSq('e5')], 1);
  assert.equal(black[parseSq('e4')], 0);
  // Sliders see through empty squares up to the first piece.
  const rook = buildPosition({ fen: '4k3/8/8/8/R2p4/8/8/4K3 w - - 0 1' });
  const rv = fogVisible(rook, WHITE);
  assert.equal(rv[parseSq('d4')], 1);
  assert.equal(rv[parseSq('e4')], 0);
  assert.equal(rv[parseSq('a8')], 1);
});

test('power moves are reported for the UI and recorded in history', () => {
  const g = new Game({ mode: 'powers', fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', powers: { squares: [['b3', POWER_LEAP]] } });
  assert.equal(g.powerMoves(POWER_LEAP).length, 0);
  g.play(g.pos.moveFromSan('Ra3'));
  g.play(g.pos.moveFromSan('Kd8'));
  const rec = g.play(g.pos.moveFromSan('Rb3'));
  assert.equal(rec.collected, POWER_LEAP);
  g.play(g.pos.moveFromSan('Kc8'));
  assert.equal(g.powerCount(WHITE, POWER_LEAP), 1);
  const leaps = g.powerMoves(POWER_LEAP);
  assert.ok(leaps.length > 0 && leaps.every((m) => mFlag(m) === LEAP));
  const used = g.play(leaps[0]);
  assert.equal(used.power, POWER_LEAP);
  assert.ok(used.slides[0].jump);
});

test('saves replay to the same position, and a broken save throws', () => {
  const g = new Game(makeSetup('classic'));
  for (const u of ['g1f3', 'g8f6', 'b1c3']) g.play(g.pos.moveFromUci(u));
  const copy = Game.fromSave(JSON.parse(JSON.stringify(g.toSave())));
  assert.equal(copy.fen, g.fen);
  assert.throws(() => Game.fromSave({ setup: makeSetup('classic'), moves: ['e2e5'] }));
});
