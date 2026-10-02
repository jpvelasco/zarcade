import test from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN, POWER_SHIELD, POWER_SWAP, POWER_LEAP, SHIELD, SWAP, LEAP, mFlag, parseSq, sqName, WHITE, BLACK } from '../src/chess.js';
import { placePowers } from '../src/powers.js';
import { Game, makeSetup } from '../src/game.js';

const withPowers = (fen, squares = [], inv) => Position.fromFen(fen, { powers: { squares, inv } });

test('power squares are seeded, mirrored and on empty middle squares', () => {
  const a = placePowers(42), b = placePowers(42), c = placePowers(43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (let seed = 1; seed < 200; seed++) {
    const { squares } = placePowers(seed);
    assert.equal(squares.length, 6);
    assert.equal(new Set(squares.map(([s]) => s)).size, 6, 'no square used twice');
    for (let i = 0; i < 6; i += 2) {
      const [w, tw] = squares[i], [bl, tb] = squares[i + 1];
      assert.equal(tw, tb);
      assert.equal(w[0], bl[0], 'same file');
      assert.equal(+w[1] + +bl[1], 9, 'mirrored ranks');
      assert.ok(+w[1] >= 3 && +w[1] <= 4);
    }
  }
});

test('stepping on a power square collects it, and undo puts it back', () => {
  const pos = withPowers(START_FEN, [['e4', POWER_LEAP]]);
  const h = [pos.h1, pos.h2];
  pos.make(pos.moveFromSan('e4'));
  assert.equal(pos.inv[WHITE][POWER_LEAP], 1);
  assert.equal(pos.powerSq[parseSq('e4')], 0);
  const after = [pos.h1, pos.h2];
  pos.computeHash();
  assert.deepEqual([pos.h1, pos.h2], after, 'incremental hash includes powers');
  pos.unmake();
  assert.equal(pos.inv[WHITE][POWER_LEAP], 0);
  assert.equal(pos.powerSq[parseSq('e4')], POWER_LEAP);
  assert.deepEqual([pos.h1, pos.h2], h);
});

test('shield: uses the turn and blocks captures of that piece for one move', () => {
  const pos = withPowers('4k3/8/8/3q4/4N3/8/8/4K3 w - - 0 1', [], [[1, 0, 0], [0, 0, 0]]);
  const shield = pos.legalMoves().filter((m) => mFlag(m) === SHIELD);
  assert.equal(shield.length, 1, 'only the knight (kings cannot be shielded)');
  pos.make(shield[0]);
  assert.equal(pos.turn, BLACK);
  assert.ok(!pos.legalMoves().some((m) => sqName((m >> 7) & 127) === 'e4'), 'the queen cannot take the shielded knight');
  pos.make(pos.moveFromSan('Qc6'));
  assert.equal(pos.shield, -1, 'the shield lasts one move');
  pos.make(pos.moveFromSan('Kd1'));
  assert.ok(pos.moveFromSan('Qxe4'), 'the knight can be captured again');
});

test('shield cannot be used to ignore check', () => {
  const pos = withPowers('4k3/8/8/8/8/8/3N4/4K2r w - - 0 1', [], [[1, 0, 0], [0, 0, 0]]);
  assert.ok(pos.inCheck());
  assert.ok(!pos.legalMoves().some((m) => mFlag(m) === SHIELD));
});

test('swap trades two of your pieces and respects pawn ranks and castling', () => {
  const pos = withPowers('4k3/8/8/8/8/8/P7/R3K1N1 w Q - 0 1', [], [[0, 1, 0], [0, 0, 0]]);
  const swaps = pos.legalMoves().filter((m) => mFlag(m) === SWAP).map((m) => pos.san(m));
  assert.ok(swaps.includes('Swap Ra1/Ng1'));
  assert.ok(!swaps.some((s) => /a2.*[a-h]1|[a-h]1.*a2/.test(s)), 'a pawn may not land on the first rank');
  pos.make(pos.legalMoves().find((m) => pos.san(m) === 'Swap Ra1/Ng1'));
  assert.equal(pos.fen().split(' ').slice(0, 3).join(' '), '4k3/8/8/8/8/8/P7/N3K1R1 b -');
  assert.equal(pos.inv[WHITE][POWER_SWAP], 0);
  pos.unmake();
  assert.equal(pos.fen(), '4k3/8/8/8/8/8/P7/R3K1N1 w Q - 0 1');
});

test('leap: any piece but king or knight jumps like a knight, once', () => {
  const pos = withPowers('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', [], [[0, 0, 1], [0, 0, 0]]);
  const leaps = pos.legalMoves().filter((m) => mFlag(m) === LEAP).map((m) => pos.san(m));
  assert.deepEqual(leaps.sort(), ['Ra1~b3', 'Ra1~c2'].sort());
  pos.make(pos.legalMoves().find((m) => pos.san(m) === 'Ra1~b3'));
  assert.equal(pos.inv[WHITE][POWER_LEAP], 0);
  pos.make(pos.moveFromSan('Kd8'));
  assert.ok(!pos.legalMoves().some((m) => mFlag(m) === LEAP), 'used up');
});

test('a leaping pawn promotes on the last rank', () => {
  const pos = withPowers('4k3/8/1P6/8/8/8/8/4K3 w - - 0 1', [], [[0, 0, 1], [0, 0, 0]]);
  const sans = pos.legalMoves().filter((m) => mFlag(m) === LEAP).map((m) => pos.san(m).replace('+', ''));
  assert.ok(sans.includes('b6~a8=Q') && sans.includes('b6~c8=N'));
});

test('a leap can never land on a king', () => {
  // The rook on d4 is a knight's jump from the black king on e6.
  const pos = withPowers('8/8/4k3/8/3R4/8/8/4K3 w - - 0 1', [], [[0, 0, 1], [0, 0, 0]]);
  const leaps = pos.legalMoves().filter((m) => mFlag(m) === LEAP).map((m) => pos.uci(m));
  assert.ok(leaps.length > 0, 'the rook can still leap elsewhere');
  assert.ok(!leaps.includes('L:d4e6'), 'no leap onto the king');
  assert.equal(pos.moveFromUci('L:d4e6'), 0);
});

test('power games replay deterministically from a save', () => {
  const setup = makeSetup('powers', 777);
  const g = new Game(setup);
  let guard = 0;
  while (!g.status().over && g.history.length < 80 && guard++ < 200) {
    // Prefer power moves when available so the test exercises them.
    const power = g.legal.find((m) => mFlag(m) >= LEAP);
    g.play(power || g.legal[(g.history.length * 7) % g.legal.length]);
  }
  assert.ok(g.history.some((h) => h.collected), 'some power was collected');
  assert.ok(g.history.some((h) => h.power), 'some power was used');
  const again = Game.fromSave(JSON.parse(JSON.stringify(g.toSave())));
  assert.equal(again.fen, g.fen);
  assert.deepEqual([again.pos.h1, again.pos.h2], [g.pos.h1, g.pos.h2]);
});

test('perft with powers in hand stays consistent after make/unmake', () => {
  const pos = withPowers(START_FEN, placePowers(5).squares, [[1, 1, 1], [1, 1, 1]]);
  const fen = pos.fen(), h = [pos.h1, pos.h2];
  const n = pos.perft(3);
  assert.ok(n > 8902, 'powers add moves');
  assert.equal(pos.fen(), fen);
  assert.deepEqual([pos.h1, pos.h2], h);
});
