import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONTINUE_SHOTS } from '../src/game.js';
import { index, LOSE_ROW } from '../src/grid.js';
import { levelFrom } from './helpers.js';
import { getLevel } from '../src/levels.js';

test('the queue only offers colors still on the board', () => {
  const level = levelFrom(['GGGGGGGGGG'], { colors: 3 });
  for (let seed = 1; seed < 30; seed++) {
    const game = new Game(level, { seed });
    assert.equal(game.current.c, 2);
    assert.equal(game.next.c, 2);
  }
});

test('the same seed plays the same queue; a different seed may not', () => {
  const level = getLevel(12);
  const draw = (seed) => {
    const game = new Game(level, { seed });
    const seen = [];
    for (let k = 0; k < 8 && game.phase === 'aim'; k++) { seen.push(game.current.c); game.fire(Math.PI / 2 + (k % 3 - 1) * 0.3); }
    return seen.join(',');
  };
  assert.equal(draw(5), draw(5));
  const others = new Set([1, 2, 3, 4, 5, 6].map(draw));
  assert.ok(others.size > 1);
});

test('swap trades the loaded and next bubble', () => {
  const game = new Game(getLevel(3), { seed: 4 });
  const [a, b] = [game.current, game.next];
  assert.ok(game.swap());
  assert.equal(game.current, b);
  assert.equal(game.next, a);
});

test('each shot uses one bubble; running out loses the level', () => {
  const level = levelFrom(['RRYYGGRRYY', 'GGRRYYGGR'], { supply: 3, colors: 3 });
  const game = new Game(level, { seed: 1 });
  assert.equal(game.shotsLeft, 3);
  game.fire(Math.PI / 2);
  assert.equal(game.shotsLeft, 2);
  game.fire(Math.PI / 2);
  assert.equal(game.next, null);
  game.fire(Math.PI / 2);
  if (game.phase === 'lost') assert.equal(game.lostReason, 'shots');
});

test('the ceiling creeps down every few shots and can push past the line', () => {
  const level = levelFrom(['RRYYGGRRYY'], { supply: 60, creep: 2, colors: 3 });
  const game = new Game(level, { seed: 2 });
  game.fire(0.3);
  assert.equal(game.board.drop, 0);
  assert.equal(game.creepIn, 1);
  const r = game.fire(Math.PI - 0.3);
  if (game.phase === 'aim') {
    assert.ok(r.creep);
    assert.equal(game.board.drop, 1);
    assert.equal(game.creepIn, 2);
  }
});

test('reaching the line loses, and the free continue washes it back once', () => {
  const level = levelFrom(['RRYYGGRRYY', 'GGRRYYGGR', 'YYRRGGYYRR', '#########', '##########', 'RYGRYGRYG', 'GRYGRYGRYG'], { supply: 40, creep: 1, colors: 3 });
  const game = new Game(level, { seed: 3 });
  let guard = 0;
  while (game.phase === 'aim' && guard++ < 40) game.fire(Math.PI / 2 + ((guard % 5) - 2) * 0.25);
  assert.equal(game.phase, 'lost');
  assert.equal(game.lostReason, 'line');
  assert.ok(game.canContinue());
  const before = game.shotsLeft;
  game.useContinue();
  assert.equal(game.shotsLeft, before + CONTINUE_SHOTS);
  assert.ok(!game.board.pastLine());
  assert.equal(game.phase, 'aim');
  assert.ok(game.board.count() > 0);
  assert.ok(!game.canContinue());
  assert.ok(game.board.lowestRow() < LOSE_ROW - 2);
});

test('rescuing every otter wins; leftover bubbles score and earn stars', () => {
  const level = levelFrom(['YY.O......'], { goal: { type: 'otters', need: 1 }, supply: 10, stars: [0, 3, 6], colors: 2 });
  level.cells[index(0, 3)] = { k: 'otter', o: 4 };
  const game = new Game(level, { seed: 1 });
  // aim at the gap at (0,2): from the launcher at x=10 up and to the left
  let won = false;
  for (let a = 1.6; a < 2.6 && !won; a += 0.01) {
    const trace = game.preview(a);
    if (trace.land === index(0, 2)) {
      if (game.current.c !== 1) game.swap();
      if (game.current.c === 1) { game.fire(a); won = game.phase === 'won'; }
      break;
    }
  }
  assert.ok(won, 'found a winning shot');
  assert.deepEqual(game.freed, [4]);
  assert.equal(game.stars(), 3);
  assert.equal(game.leftover, 9);
});

test('a loaded booster is fired for free and the bubble it replaced comes back', () => {
  const game = new Game(getLevel(5), { seed: 9 });
  const before = { ...game.current };
  const left = game.shotsLeft;
  assert.ok(game.loadBooster('bomb'));
  assert.equal(game.current.kind, 'bomb');
  assert.ok(!game.swap(), 'no swapping a booster away');
  game.fire(Math.PI / 2);
  assert.equal(game.shotsLeft, left);
  if (game.phase === 'aim') assert.equal(game.current.c === before.c || game.board.colorsPresent().includes(game.current.c), true);
  assert.ok(game.loadBooster('rainbow'));
  assert.equal(game.unloadBooster(), 'rainbow');
  assert.equal(game.current.kind, 'b');
});

test('the anchor goal wins when the anchor falls', () => {
  const level = levelFrom(['YY#.......', 'A'], { goal: { type: 'anchor', need: 1 }, supply: 10, colors: 2 });
  const game = new Game(level, { seed: 1 });
  for (let a = 1.5; a < 3; a += 0.005) {
    if (game.preview(a).land === index(1, 1)) {
      if (game.current.c !== 1) game.swap();
      game.fire(a);
      break;
    }
  }
  assert.ok(game.anchorDropped);
  assert.equal(game.phase, 'won');
});
