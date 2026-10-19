import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP, HOLD_SECONDS, ENDLESS_HEARTS } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

function run(g, frames, controls = () => ({})) {
  for (let i = 0; i < frames; i++) { g.step(STEP, controls(i)); g.events.length = 0; }
}

function settle(g, max = 600) {
  for (let i = 0; i < max && g.phase === 'settling'; i++) { g.step(STEP, {}); g.events.length = 0; }
}

test('the crane holds the next animal above everything built', () => {
  const g = new Game({ mode: 'climb', level: LEVELS[0] });
  assert.ok(g.held);
  assert.equal(g.held.animal, g.sequence[0].animal);
  assert.ok(g.craneY > 0.5);
  assert.ok(g.drop());
  assert.equal(g.used, 1);
  assert.equal(g.held, null);
  settle(g);
  assert.equal(g.phase, 'aim');
  assert.ok(g.held);
  assert.ok(g.craneY > g.blocks[0].maxY + 0.5, 'crane clears the tower');
});

test('moving and turning the held animal is clamped and in 45° steps', () => {
  const g = new Game({ mode: 'climb', level: LEVELS[0] });
  run(g, 120, () => ({ axis: 1 }));
  assert.ok(Math.abs(g.held.x - g.reach) < 1e-9);
  run(g, 1, () => ({ rotate: -1 }));
  run(g, 30);
  assert.ok(Math.abs(g.held.angle + Math.PI / 4) < 1e-6);
  run(g, 30, () => ({ targetX: 0.5 }));
  assert.ok(Math.abs(g.held.x - 0.5) < 0.01);
});

test('dropped animals land and the height counts only steady blocks', () => {
  const g = new Game({ mode: 'climb', level: LEVELS[0] });
  g.drop();
  run(g, 3);
  assert.equal(g.top, 0, 'a falling block does not count');
  settle(g);
  run(g, 30);
  assert.ok(g.top > 0.5 && g.top < 1.4, `top ${g.top}`);
});

test('a block that falls off the island splashes', () => {
  const g = new Game({ mode: 'endless', seed: 3 });
  g.held.x = g.reach;
  g.drop();
  const events = [];
  for (let i = 0; i < 240; i++) { g.step(STEP, {}); events.push(...g.events); g.events.length = 0; }
  assert.equal(g.splashes, 1);
  assert.equal(g.hearts, ENDLESS_HEARTS - 1);
  assert.ok(events.some((e) => e.type === 'splash'));
  assert.equal(g.blocks.length, 0);
});

test('Endless ends after three splashes and keeps the best height', () => {
  const g = new Game({ mode: 'endless', seed: 5 });
  g.drop(); settle(g); run(g, 20);
  const h = g.bestTop;
  assert.ok(h > 0.4);
  for (let k = 0; k < 3; k++) {
    g.held.x = -g.reach;
    g.drop();
    for (let i = 0; i < 400 && g.phase === 'settling'; i++) { g.step(STEP, {}); g.events.length = 0; }
  }
  assert.equal(g.phase, 'lost');
  assert.equal(g.result.reason, 'splashes');
  assert.ok(g.result.height >= h - 1e-9);
});

test('reaching the goal and holding for 3 seconds wins', () => {
  const level = { ...LEVELS[0], goal: 0.5, par: 1 };
  const g = new Game({ mode: 'climb', level });
  g.drop();
  const events = [];
  for (let i = 0; i < 60 * 6 && g.phase !== 'won'; i++) { g.step(STEP, {}); events.push(...g.events); g.events.length = 0; }
  assert.equal(g.phase, 'won');
  assert.ok(events.some((e) => e.type === 'hold-start'));
  assert.ok(g.time > HOLD_SECONDS);
  assert.ok(g.result.stars >= 2, 'used par animals');
});

test('drops are blocked while the tower is holding', () => {
  const level = { ...LEVELS[0], goal: 0.5 };
  const g = new Game({ mode: 'climb', level });
  g.drop();
  for (let i = 0; i < 200 && g.holdTime === 0; i++) { g.step(STEP, {}); g.events.length = 0; }
  assert.ok(g.holdTime > 0);
  assert.equal(g.canDrop(), false);
});

test('running out of animals below the line is a fail', () => {
  const level = { ...LEVELS[0], goal: 50, limit: 2 };
  const g = new Game({ mode: 'climb', level });
  for (let k = 0; k < 2; k++) { g.drop(); settle(g); }
  for (let i = 0; i < 600 && g.phase !== 'lost'; i++) { g.step(STEP, {}); g.events.length = 0; }
  assert.equal(g.phase, 'lost');
  assert.equal(g.result.reason, 'out');
});

test('Pass & Play rotates turns and whoever splashes loses', () => {
  const g = new Game({ mode: 'pass', seed: 9, players: 3 });
  assert.equal(g.turn, 0);
  g.drop(); settle(g);
  assert.equal(g.turn, 1);
  g.drop(); settle(g);
  assert.equal(g.turn, 2);
  g.held.x = g.reach; // player 3 drops into the sea
  g.drop();
  for (let i = 0; i < 600 && g.phase !== 'lost'; i++) { g.step(STEP, {}); g.events.length = 0; }
  assert.equal(g.phase, 'lost');
  assert.equal(g.loser, 2);
});

test('wind pushes falling animals downwind', () => {
  const calm = new Game({ mode: 'climb', level: { ...LEVELS[0] } });
  const windy = new Game({ mode: 'climb', level: { ...LEVELS[0], wind: { strength: 2, gust: 0 } } });
  calm.drop(); windy.drop();
  run(calm, 20); run(windy, 20);
  assert.ok(windy.blocks[0].x > calm.blocks[0].x + 0.05);
});

test('the raft level moves the island', () => {
  const g = new Game({ mode: 'climb', level: LEVELS.find((l) => l.mover) });
  const x0 = g.platform.x;
  run(g, 60);
  assert.notEqual(g.platform.x, x0);
  assert.equal(g.platform.kind, 'kinematic');
});

test('games are deterministic for the same inputs', () => {
  const play = () => {
    const g = new Game({ mode: 'climb', level: LEVELS[4] });
    for (let i = 0; i < 60 * 25 && g.phase !== 'won' && g.phase !== 'lost'; i++) {
      const c = g.canDrop() && g.calmTime > 0.3 ? { drop: true, rotate: i % 3 === 0 ? 1 : 0 } : { axis: Math.sin(i * 0.05) };
      g.step(STEP, c);
      g.events.length = 0;
    }
    return { phase: g.phase, used: g.used, top: g.top, pos: g.blocks.map((b) => [b.x, b.y, b.angle]) };
  };
  assert.deepEqual(play(), play());
});

test('next-animal preview matches what spawns', () => {
  const g = new Game({ mode: 'endless', seed: 42 });
  for (let k = 0; k < 6; k++) {
    const next = g.peekNext();
    g.drop(); settle(g);
    if (g.held) assert.equal(g.held.animal, next.animal);
  }
});
