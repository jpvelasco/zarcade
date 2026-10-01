import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBoss, updateBoss } from '../src/bosses.js';

// A tiny stand-in for the game: just what the Shade King reads and calls.
function fakeGame(lit) {
  const g = {
    player: { x: 100, y: 120 },
    lit: new Set(lit),
    snuffed: 0,
    litCount: () => g.lit.size,
    pickLitTorch: () => [...g.lit][0] ?? null,
    snuffTorch: (i) => { g.lit.delete(i); g.snuffed++; },
    moveEnemy: (b, dx, dy) => { b.x += dx; b.y += dy; },
    spawnHostile() {},
    emit() {},
    shake() {},
    roomLeft: () => 0,
  };
  return g;
}
const play = (b, g, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) updateBoss(b, g, 1 / 60); };

test('the Shade King never snuffs a torch while all three burn', () => {
  const b = makeBoss('shade', 160, 100);
  const g = fakeGame([1, 2, 3]);
  play(b, g, 40);
  assert.equal(g.snuffed, 0);
  assert.ok(b.revealed);
});

test('while hidden the Shade King snuffs torches only now and then', () => {
  const b = makeBoss('shade', 160, 100);
  const g = fakeGame([1, 2]);
  const relight = () => { if (g.lit.size < 2) g.lit.add(g.lit.has(1) ? 2 : 1); };
  for (let t = 0; t < 40; t += 1 / 60) { updateBoss(b, g, 1 / 60); relight(); }
  // About one attack round every 6-7 seconds, and a snuff every other round.
  assert.ok(g.snuffed >= 1 && g.snuffed <= 4, `snuffed ${g.snuffed} times in 40 s`);
});
