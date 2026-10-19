import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, aimVector, bulletBox, canHit, coolGun, fire, markHit, moveBullet } from '../src/weapons.js';
import { createPlayer } from '../src/physics.js';
import { World } from '../src/world.js';
import { createEnemy } from '../src/enemies.js';

const shooter = () => {
  const p = createPlayer(100, 160);
  p.facing = 1;
  return p;
};

test('8-way aim vectors are unit length', () => {
  for (const [x, y] of [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]]) {
    const v = aimVector(x, y);
    assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9);
    assert.equal(Math.sign(v.x), Math.sign(x));
    assert.equal(Math.sign(v.y), Math.sign(y));
  }
});

test('the blaster fires one shot, then waits for its cooldown', () => {
  const gun = { id: 'normal', cooldown: 0 };
  const p = shooter();
  assert.equal(fire(gun, p, 1, 0).length, 1);
  assert.equal(fire(gun, p, 1, 0).length, 0, 'still cooling down');
  coolGun(gun, WEAPONS.normal.cooldown);
  assert.equal(fire(gun, p, 1, 0).length, 1);
});

test('spread fires a symmetric five-way fan', () => {
  const shots = fire({ id: 'spread', cooldown: 0 }, shooter(), 1, 0);
  assert.equal(shots.length, 5);
  const angles = shots.map((s) => s.angle).sort((a, b) => a - b);
  assert.ok(Math.abs(angles[0] + angles[4]) < 1e-9, 'outer pellets mirror each other');
  assert.ok(Math.abs(angles[2]) < 1e-9, 'middle pellet flies straight');
  assert.ok(angles[4] - angles[0] > 0.5, 'the fan is wide');
});

test('rapid fires much faster than the blaster; the laser hits hardest', () => {
  assert.ok(WEAPONS.rapid.cooldown < WEAPONS.normal.cooldown * 0.6);
  assert.ok(WEAPONS.laser.damage >= 3 * WEAPONS.normal.damage);
  assert.ok(WEAPONS.laser.pierce && WEAPONS.flame.pierce);
});

test('flames are short range; laser shots are long', () => {
  const flame = fire({ id: 'flame', cooldown: 0 }, shooter(), 1, 0)[0];
  const startX = flame.x;
  while (!flame.dead) moveBullet(flame, 1 / 60);
  const flameRange = flame.x - startX;
  const laser = fire({ id: 'laser', cooldown: 0 }, shooter(), 1, 0)[0];
  const laserStart = laser.x;
  while (!laser.dead) moveBullet(laser, 1 / 60);
  assert.ok(flameRange > 40 && flameRange < 110, `flame range ${flameRange}`);
  assert.ok(laser.x - laserStart > 200, 'laser crosses most of the screen');
  const grown = fire({ id: 'flame', cooldown: 0 }, shooter(), 1, 0)[0];
  const small = bulletBox(grown).w;
  for (let i = 0; i < 15; i += 1) moveBullet(grown, 1 / 60);
  assert.ok(bulletBox(grown).w > small + 4, 'flames grow as they fly');
});

test('too many shots on screen means no new shots', () => {
  const gun = { id: 'normal', cooldown: 0 };
  assert.equal(fire(gun, shooter(), 1, 0, WEAPONS.normal.max).length, 0);
});

test('piercing shots hit each target once; normal shots stop at the first', () => {
  const laser = fire({ id: 'laser', cooldown: 0 }, shooter(), 1, 0)[0];
  assert.equal(canHit(laser, 7), true);
  markHit(laser, 7);
  assert.equal(canHit(laser, 7), false);
  assert.equal(canHit(laser, 8), true);
  assert.equal(laser.dead, false);
  const shot = fire({ id: 'normal', cooldown: 0 }, shooter(), 1, 0)[0];
  markHit(shot, 7);
  assert.equal(shot.dead, true);
});

test('in the world, a laser pierces a line of raiders while the blaster hits one', () => {
  const run = (gunId) => {
    const w = new World(0);
    const p = w.players[0];
    p.gun.id = gunId;
    p.invuln = 99;
    w.enemies.length = 0;
    w.spawns.forEach((s) => { s.state = 'dead'; });
    const y = p.y + p.h;
    const a = createEnemy('raider', p.x + 60, y, 900);
    const b = createEnemy('raider', p.x + 80, y, 901);
    a.hp = b.hp = 3;
    a.timer = b.timer = 99;
    w.enemies.push(a, b);
    let pulled = false;
    for (let i = 0; i < 20; i += 1) {
      w.step(1 / 60, [{ shoot: !pulled }]);
      pulled = true;
      w.events.length = 0;
    }
    return [a.hp, b.hp];
  };
  const [la, lb] = run('laser');
  assert.ok(la < 3 && lb < 3, 'laser hit both');
  const [na, nb] = run('normal');
  assert.equal(na, 2);
  assert.equal(nb, 3, 'blaster stopped at the first raider');
});
