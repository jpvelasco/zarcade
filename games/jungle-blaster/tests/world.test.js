import test from 'node:test';
import assert from 'node:assert/strict';
import { World, createRun, crocPhase, EXTRA_LIFE_EVERY, MODES, VIEW_W } from '../src/world.js';
import { createEnemy } from '../src/enemies.js';
import { TILE } from '../src/tiles.js';

const DT = 1 / 60;

function quiet(world) {
  world.spawns.forEach((s) => { s.state = 'dead'; });
  world.rollers.length = 0;
  world.enemies.length = 0;
}

function steps(world, n, input = {}) {
  for (let i = 0; i < n; i += 1) {
    world.step(DT, [typeof input === 'function' ? input(i) : input, {}]);
    world.events.length = 0;
  }
}

test('adventure mode: hearts soak hits; arcade mode: one hit costs a life', () => {
  const adv = new World(0, { mode: 'adventure' });
  quiet(adv);
  const p = adv.players[0];
  p.invuln = 0;
  adv.hurtPlayer(p, 'shot');
  assert.equal(p.hearts, MODES.adventure.hearts - 1);
  assert.equal(p.state, 'alive');
  assert.ok(p.invuln > 1, 'blinks after a hit');
  adv.hurtPlayer(p, 'shot');
  assert.equal(p.hearts, MODES.adventure.hearts - 1, 'no double hits while blinking');

  const arc = new World(0, { mode: 'arcade' });
  quiet(arc);
  const q = arc.players[0];
  q.invuln = 0;
  arc.hurtPlayer(q, 'shot');
  assert.equal(q.state, 'dead');
  assert.equal(arc.run.lives[0], MODES.arcade.lives - 1);
});

test('falling in the water puts you back on safe ground (kindly)', () => {
  const w = new World(0, { mode: 'adventure' });
  quiet(w);
  const p = w.players[0];
  // Walk right into the first water pit (room 2, columns 48-50).
  let splashed = false;
  for (let i = 0; i < 60 * 12 && !splashed; i += 1) {
    w.step(DT, [{ right: true }]);
    splashed = w.events.some((e) => e.type === 'splash');
    w.events.length = 0;
  }
  assert.ok(splashed);
  assert.equal(p.state, 'alive');
  assert.ok(p.x < 48 * TILE, 'back on the near bank');
  assert.equal(p.hearts, MODES.adventure.hearts - 1);
  steps(w, 30);
  assert.equal(p.onGround, true);
});

test('dying with lives left respawns; running out ends the game; continue picks it back up', () => {
  const w = new World(0, { mode: 'arcade' });
  quiet(w);
  const p = w.players[0];
  for (let life = 0; life < MODES.arcade.lives; life += 1) {
    p.invuln = 0;
    w.hurtPlayer(p, 'enemy');
    steps(w, 100);
  }
  assert.equal(w.status, 'over');
  w.run.score = 12345;
  assert.equal(w.continueGame(), true);
  assert.equal(w.status, 'play');
  assert.equal(w.run.score, 0, 'arcade continues reset the score');
  assert.equal(w.run.continuesLeft, MODES.arcade.continues - 1);
  assert.equal(p.state, 'alive');
  assert.equal(w.run.lives[0], MODES.arcade.lives);
});

test('checkpoints refill hearts in adventure mode', () => {
  const w = new World(0, { mode: 'adventure' });
  quiet(w);
  const p = w.players[0];
  p.hearts = 1;
  const cp = w.level.checkpoints[0];
  p.x = cp.x + 4;
  p.y = cp.y - p.h;
  steps(w, 2);
  assert.equal(w.checkpoint, 0);
  assert.equal(p.hearts, MODES.adventure.hearts);
  assert.deepEqual(w.respawnPoint(), { x: cp.x, y: cp.y });
});

test('rolling logs trip you up instead of hurting', () => {
  const w = new World(0);
  quiet(w);
  const p = w.players[0];
  steps(w, 20);
  p.invuln = 0;
  w.enemies.push(createEnemy('log', p.x + 30, p.y + p.h, 999));
  let tripped = false;
  for (let i = 0; i < 60 && !tripped; i += 1) {
    w.step(DT, [{}]);
    tripped = w.events.some((e) => e.type === 'trip');
    w.events.length = 0;
  }
  assert.ok(tripped);
  assert.equal(p.hearts, MODES.adventure.hearts);
  assert.equal(p.mode, 'stun');
});

test('crocs open and shut on a cycle; open jaws bite, the back of the head stays safe', () => {
  const croc = { x: 100, y: 160, phase: 0 };
  const phases = new Set();
  for (let t = 0; t < 3.2; t += 0.05) phases.add(crocPhase(croc, t));
  assert.deepEqual([...phases].sort(), ['closed', 'open', 'warn']);
  const w = new World(0);
  const c = w.crocs[0];
  let open = 0;
  while (crocPhase(c, open) !== 'open') open += 0.05;
  const { rects, hazards } = w.surfacesAt(open);
  assert.ok(hazards.some((h) => h.kind === 'bite' && h.x < c.x));
  assert.ok(rects.some((r) => r.x >= c.x - 2 && r.w < 20), 'a narrower safe platform remains');
});

test('treasure scores and counts; shooting a pod opens it; touching collects the gun', () => {
  const w = new World(0);
  quiet(w);
  const p = w.players[0];
  const gold = w.items.find((i) => i.kind === 'gold');
  w.collect(p, gold);
  assert.equal(w.stats.treasures, 1);
  assert.equal(w.run.score, 2000);
  const pod = w.items.find((i) => i.kind === 'spread');
  p.x = pod.x - 40;
  p.y = pod.y - 8 - 8;
  p.facing = 1;
  w.camera.x = p.x - 100;
  w.camera.y = 0;
  for (let i = 0; i < 30 && pod.state === 'pod'; i += 1) {
    w.bullets.push({ kind: 'normal', owner: 0, x: pod.x - 6, y: pod.y, vx: 200, vy: 0, angle: 0, size: 3, damage: 1, life: 1, age: 0, pierce: false, hits: null, dead: false });
    w.updateBullets(DT);
  }
  assert.equal(pod.state, 'drop');
  w.collect(p, pod);
  assert.equal(p.gun.id, 'spread');
  assert.equal(w.run.guns[0], 'spread');
});

test('a smart bomb clears enemy bullets and hurts everything on screen', () => {
  const w = new World(0);
  quiet(w);
  const p = w.players[0];
  steps(w, 5);
  const e = createEnemy('raider', p.x + 80, p.y + p.h, 500);
  w.enemies.push(e);
  w.enemyShot(p.x + 60, p.y + 5, -50, 0);
  const bombs = p.bombs;
  assert.equal(w.bomb(p), true);
  assert.equal(p.bombs, bombs - 1);
  assert.equal(w.shots.every((s) => s.dead), true);
  assert.equal(e.dead, true);
  p.bombs = 0;
  assert.equal(w.bomb(p), false, 'no bombs left');
});

test('an extra life every 30,000 points', () => {
  const w = new World(0);
  const lives = w.run.lives[0];
  w.addScore(EXTRA_LIFE_EVERY - 1);
  assert.equal(w.run.lives[0], lives);
  w.addScore(2);
  assert.equal(w.run.lives[0], lives + 1);
  w.addScore(EXTRA_LIFE_EVERY * 2);
  assert.equal(w.run.lives[0], lives + 3);
});

test('entering the arena locks the camera and wakes the boss', () => {
  const w = new World(0);
  quiet(w);
  const p = w.players[0];
  p.x = w.arena.x0 + 50;
  p.y = w.arena.floor - p.h;
  steps(w, 2);
  assert.equal(w.arena.active, true);
  assert.equal(w.boss.type, 'gorilla');
  steps(w, 120);
  assert.equal(Math.round(w.camera.x), w.arena.x0);
  for (let i = 0; i < 200; i += 1) w.step(DT, [{ left: true }]);
  assert.ok(p.x >= w.arena.x0, 'cannot leave the arena');
});

test('two players: the camera keeps both on screen', () => {
  const run = createRun({ mode: 'adventure', players: 2 });
  const w = new World(0, { run });
  quiet(w);
  assert.equal(w.players.length, 2);
  for (let i = 0; i < 240; i += 1) w.step(DT, [{ right: true }, {}]);
  const [a, b] = w.players;
  assert.ok(a.x - b.x <= VIEW_W, 'P1 is held back by P2');
  assert.ok(a.x + a.w <= w.camera.x + VIEW_W + 1);
  assert.ok(b.x >= w.camera.x - 1);
});

test('the clear bonus banks once and reports treasure and time', () => {
  const w = new World(0);
  w.stats.time = 100;
  w.stats.treasures = 2;
  const res = w.result();
  assert.equal(res.treasureBonus, 2000);
  assert.ok(res.timeBonus > 0);
  assert.equal(res.flawless, 5000);
  const before = w.run.score;
  w.bankClear();
  assert.equal(w.run.score, before + res.bonus);
});

test('the simulation is deterministic', () => {
  const play = () => {
    const w = new World(0, { mode: 'arcade' });
    for (let i = 0; i < 600; i += 1) {
      w.step(DT, [{ right: i % 90 < 70, jump: i % 50 < 12, jumpPressed: i % 50 === 0, shoot: true, up: i % 120 > 100 }]);
      w.events.length = 0;
    }
    const p = w.players[0];
    return [Math.round(p.x * 100), Math.round(p.y * 100), w.run.score, w.stats.kills, w.enemies.length, w.shots.length];
  };
  assert.deepEqual(play(), play());
});
