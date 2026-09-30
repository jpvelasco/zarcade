import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { LEVELS } from '../src/levels.js';
import { BOSSES, clawOpenness } from '../src/boss.js';
import { FIELD, PADDLE } from '../src/config.js';

const bossLevel = (kind) => LEVELS.find((l) => l.boss === kind).index;
const IDLE = { targetX: null, axis: 0, launch: false, fire: false };

test('every boss moves along a path that stays in the playfield', () => {
  for (const [kind, def] of Object.entries(BOSSES)) {
    for (let t = 0; t < 60; t += 0.25) {
      const p = def.path(t);
      assert.ok(p.x - def.w / 2 >= 0 && p.x + def.w / 2 <= FIELD.w, `${kind} x at t=${t}`);
      assert.ok(p.y - def.h / 2 >= FIELD.top && p.y + def.h / 2 < PADDLE.y - 300, `${kind} y at t=${t}`);
    }
  }
});

test('the saucer drifts sideways and shoots slow bubbles', () => {
  const w = new World(bossLevel('saucer'));
  const x0 = w.boss.x;
  let shots = 0;
  for (let i = 0; i < 120 * 5; i++) {
    w.step(1 / 120);
    shots += w.events.filter((e) => e.type === 'shoot').length;
    w.events.length = 0;
  }
  assert.ok(Math.abs(w.boss.x - x0) > 50);
  assert.ok(shots >= 1);
  assert.ok(w.shots.every((s) => s.vy < 120), 'bubbles are slow');
});

test('a bubble on the ship makes it sleepy (smaller and slower), then it recovers', () => {
  const w = new World(bossLevel('saucer'));
  w.shots.push({ kind: 'bubble', x: w.paddle.x, y: PADDLE.y - 30, vx: 0, vy: 85, r: 13, t: 0 });
  for (let i = 0; i < 60; i++) w.step(1 / 120, IDLE);
  assert.ok(w.paddle.sleepy > 0);
  for (let i = 0; i < 60; i++) w.step(1 / 120, IDLE);
  assert.ok(w.paddle.w < PADDLE.w * 0.8);
  for (let i = 0; i < 120 * 4; i++) w.step(1 / 120, IDLE);
  assert.equal(w.paddle.sleepy, 0);
});

test('comets pop bubbles', () => {
  const w = new World(bossLevel('saucer'));
  w.step(1 / 120, { ...IDLE, launch: true });
  const b = w.balls[0];
  Object.assign(b, { x: 300, y: 600, dx: 0, dy: -1 });
  w.shots.push({ kind: 'bubble', x: 300, y: 560, vx: 0, vy: 0, r: 13, t: 0 });
  for (let i = 0; i < 12; i++) w.step(1 / 120, IDLE);
  assert.equal(w.shots.length, 0);
});

test('comet hits damage the boss and defeating it clears the level', () => {
  const w = new World(bossLevel('saucer'));
  const hp = w.boss.hp;
  w.step(1 / 120, { ...IDLE, launch: true });
  const b = w.balls[0];
  Object.assign(b, { x: w.boss.x, y: w.boss.y + w.boss.h / 2 + 30, dx: 0, dy: -1 });
  for (let i = 0; i < 20; i++) w.step(1 / 120, IDLE);
  assert.ok(w.boss.hp < hp);
  assert.ok(b.dy > 0, 'bounced off the boss');
  while (w.boss.hp > 0) { w.boss.invuln = 0; w.damageBoss(3, w.boss.x, w.boss.y); }
  assert.equal(w.boss.dead, true);
  for (let i = 0; i < 120 * 3; i++) w.step(1 / 120, IDLE);
  assert.equal(w.status, 'cleared');
});

test('octopus tentacles regrow after being broken', () => {
  const w = new World(bossLevel('octopus'));
  const tentacles = w.boss.parts.filter((p) => p.skin === 'tentacle');
  assert.equal(tentacles.length, 30);
  for (const t of tentacles) w.hitBrick(t, 1);
  assert.ok(tentacles.every((t) => !t.alive));
  for (let i = 0; i < 120 * 8; i++) w.step(1 / 120, IDLE);
  assert.ok(tentacles.every((t) => t.alive), 'all grew back');
  assert.ok(w.events.some((e) => e.type === 'regrow'));
});

test('tentacles follow the octopus as it sways', () => {
  const w = new World(bossLevel('octopus'));
  const t = w.boss.parts[0];
  const rel0 = t.x - w.boss.x;
  for (let i = 0; i < 300; i++) w.step(1 / 120, IDLE);
  assert.ok(Math.abs(t.x - w.boss.x - rel0) < 1e-6);
});

test('crab claws guard its belly, then open', () => {
  const def = BOSSES.crab;
  assert.equal(clawOpenness(def, 0), 0);
  assert.equal(clawOpenness(def, def.claws.closed + def.claws.move + 0.1), 1);
  const w = new World(bossLevel('crab'));
  const claws = w.boss.parts.filter((p) => p.skin === 'claw');
  assert.equal(claws.length, 2);
  assert.ok(claws.every((c) => c.kind === 'metal'));
  const closedY = claws[0].y;
  for (let i = 0; i < 120 * 4.2; i++) w.step(1 / 120, IDLE);
  assert.ok(claws[0].y < closedY - 20, 'claws lift away');
});

test('serpent segments trail behind its head', () => {
  const w = new World(bossLevel('serpent'));
  for (let i = 0; i < 240; i++) w.step(1 / 120, IDLE);
  const segs = w.boss.parts;
  assert.equal(segs.length, 10);
  const q = BOSSES.serpent.path(w.boss.t - BOSSES.serpent.segments.gap);
  assert.ok(Math.abs(segs[0].x + segs[0].w / 2 - q.x) < 1e-6);
});

test('the mech rebuilds its wall and fires meteors', () => {
  const w = new World(bossLevel('mech'));
  const wall = w.boss.parts;
  for (const b of wall) w.hitBrick(b, 1);
  let meteors = 0;
  for (let i = 0; i < 120 * 8; i++) {
    w.step(1 / 120, IDLE);
    meteors += w.events.filter((e) => e.type === 'shoot' && e.kind === 'meteor').length;
    w.events.length = 0;
  }
  assert.ok(wall.every((b) => b.alive));
  assert.ok(meteors >= 2);
});

test('bosses get angrier at half health', () => {
  const w = new World(bossLevel('kraken'));
  w.boss.hp = Math.floor(w.boss.maxHp / 2);
  const t0 = w.boss.t;
  w.step(1, IDLE);
  assert.ok(w.boss.t - t0 > 1.2);
});

test('boss parts are optional: the level ends when the boss is beaten', () => {
  const w = new World(bossLevel('octopus'));
  w.boss.hp = 1;
  w.damageBoss(3, 0, 0);
  assert.ok(w.boss.parts.every((p) => !p.alive));
  w.step(1 / 120);
  assert.equal(w.status, 'clearing');
});
