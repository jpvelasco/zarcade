import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSES, PHASE_REST, WINDUP_MIN, bossBox, createBoss, damageBoss, phaseFor, updateBoss } from '../src/bosses.js';

const ARENA = { x0: 1000, x1: 1320, floor: 160, top: 40 };

/** A stand-in world that records what the boss does. */
function fakeWorld() {
  const w = {
    t: 0,
    events: [],
    shots: [],
    markers: [],
    enemies: [],
    player: { x: 1060, y: 140, w: 10, h: 20 },
    nearestPlayer() { return this.player; },
    enemyShot(x, y, vx, vy, opts = {}) { this.shots.push({ x, y, vx, vy, ...opts, at: this.t }); },
    marker(x, y, wd, h, life, kind) { this.markers.push({ x, y, w: wd, h, life, kind, at: this.t }); },
    spawnEnemy(kind, x, y) { this.enemies.push({ kind, x, y, dead: false, at: this.t }); },
  };
  return w;
}

function runBoss(boss, world, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i += 1) {
    world.t += dt;
    updateBoss(boss, world, dt);
  }
}

test('every boss attack has a visible wind-up before it can hurt', () => {
  for (const [type, spec] of Object.entries(BOSSES)) {
    for (const [name, action] of Object.entries(spec.actions)) {
      assert.ok(action.windup >= WINDUP_MIN, `${type}.${name} wind-up ${action.windup}`);
      assert.ok(action.dur > action.windup, `${type}.${name} lasts longer than its wind-up`);
    }
    for (const list of spec.phases) for (const name of list) assert.ok(spec.actions[name], `${type} phase uses ${name}`);
  }
});

test('nothing dangerous appears during a wind-up (only telegraph markers)', () => {
  for (const type of Object.keys(BOSSES)) {
    const boss = createBoss(type, ARENA);
    const world = fakeWorld();
    let start = 0;
    let current = null;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 40; i += 1) {
      world.t += dt;
      const before = world.shots.length;
      const action = boss.action;
      updateBoss(boss, world, dt);
      if (boss.action !== current) { current = boss.action; start = world.t; }
      if (world.shots.length > before && action === boss.action) {
        const windup = BOSSES[type].actions[boss.action].windup;
        assert.ok(boss.actionTime >= windup - 1e-6 && world.t - start >= windup - 1 / 60 - 1e-6, `${type}.${boss.action} fired during its wind-up`);
      }
      // Cycle through phases so every attack gets exercised.
      if (i === 60 * 14) boss.hp = boss.maxHp * 0.6;
      if (i === 60 * 28) boss.hp = boss.maxHp * 0.3;
      boss.phase = phaseFor(boss);
    }
  }
});

test('phases change at two thirds and one third health', () => {
  const boss = createBoss('gorilla', ARENA);
  const world = fakeWorld();
  boss.intro = 0;
  assert.equal(boss.phase, 0);
  damageBoss(boss, Math.ceil(boss.maxHp / 3) + 1, world);
  assert.equal(boss.phase, 1);
  assert.ok(world.events.some((e) => e.type === 'bossPhase' && e.phase === 1));
  damageBoss(boss, Math.ceil(boss.maxHp / 3), world);
  assert.equal(boss.phase, 2);
  damageBoss(boss, boss.maxHp, world);
  assert.equal(boss.hp, 0);
  assert.ok(boss.dying > 0);
  assert.equal(damageBoss(boss, 5, world), false, 'no more damage while exploding');
  runBoss(boss, world, 3);
  assert.equal(boss.dead, true);
});

test('attack patterns repeat in a fixed order (learnable, deterministic)', () => {
  for (const [type, spec] of Object.entries(BOSSES)) {
    const a = createBoss(type, ARENA);
    const b = createBoss(type, ARENA);
    runBoss(a, fakeWorld(), 30);
    runBoss(b, fakeWorld(), 30);
    assert.deepEqual(a.history, b.history, `${type} is deterministic`);
    const list = spec.phases[0];
    a.history.forEach((name, i) => assert.equal(name, list[i % list.length], `${type} follows its phase-1 script`));
    assert.ok(a.history.length >= list.length, `${type} got through its whole script in 30 s`);
  }
});

test('the boss is invulnerable during its intro, and later phases rest less', () => {
  const boss = createBoss('idol', ARENA);
  const world = fakeWorld();
  assert.equal(damageBoss(boss, 5, world), false);
  assert.ok(PHASE_REST[2] < PHASE_REST[0]);
});

test('every boss can be beaten by steady fire, and stays inside the arena', () => {
  for (const type of Object.keys(BOSSES)) {
    const boss = createBoss(type, ARENA);
    const world = fakeWorld();
    let time = 0;
    while (!boss.dead && time < 120) {
      world.t += 1 / 60;
      time += 1 / 60;
      updateBoss(boss, world, 1 / 60);
      if (Math.floor(time * 60) % 10 === 0) damageBoss(boss, 1, world);
      const box = bossBox(boss);
      assert.ok(box.x >= ARENA.x0 - 20 && box.x + box.w <= ARENA.x1 + 20, `${type} left the arena`);
    }
    assert.equal(boss.dead, true, `${type} defeated`);
    assert.ok(time < 90, `${type} took ${time.toFixed(0)} s at six hits per second`);
  }
});

test('telegraphs come before the danger: markers lead rocks, beams and landings', () => {
  const boss = createBoss('mole', ARENA);
  const world = fakeWorld();
  runBoss(boss, world, 12);
  const rocks = world.shots.filter((s) => s.kind === 'rock');
  assert.ok(rocks.length >= 5, 'the mole dropped rocks');
  const first = world.markers.find((m) => m.kind === 'dust');
  assert.ok(first && first.at <= rocks[0].at, 'dust marks where rocks will fall');
});
