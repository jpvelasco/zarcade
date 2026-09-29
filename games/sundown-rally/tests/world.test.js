import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { TRACKS } from '../src/tracks.js';
import { OBSTACLES } from '../src/entities.js';

const DT = 1 / 60;

function race(def) {
  const w = new World(def, { autopilot: true });
  for (let i = 0; i < 60 * 300 && (w.status === 'countdown' || w.status === 'racing'); i++) {
    w.step(DT, {});
    w.events.length = 0;
  }
  return w;
}

// The AI stands in for a competent player: every track must be finishable,
// and par times (3 stars) should be reachable but not trivial.
for (const def of TRACKS) {
  test(`${def.id}: the AI driver finishes without being wrecked`, () => {
    const w = race(def);
    assert.equal(w.status, 'finished', `ended ${w.status} at ${w.player.along.toFixed(0)} m`);
    assert.ok(w.player.vehicle.hp > 20, `hp ${w.player.vehicle.hp.toFixed(0)}`);
    assert.ok(w.player.finishTime < def.par * 1.15, `time ${w.player.finishTime.toFixed(1)} vs par ${def.par}`);
    assert.ok(w.player.finishTime > def.par * 0.75, `par ${def.par} is too slow for ${w.player.finishTime.toFixed(1)} s`);
    assert.ok(w.player.kills > 5);
  });

  test(`${def.id}: road obstacles always leave a drivable gap`, () => {
    const w = new World(def);
    const t = w.track;
    const onRoad = w.obstacles.filter((o) => !o.decor && !o.roll && !OBSTACLES[o.type].harmless && Math.abs(o.lateral) - o.r < t.half);
    for (const o of onRoad) {
      // Everything on the road within 12 m along of this obstacle.
      const blockers = onRoad.filter((b) => Math.abs(b.along - o.along) < 12);
      const intervals = blockers.map((b) => [b.lateral - b.r, b.lateral + b.r]).sort((a, b) => a[0] - b[0]);
      let edge = -t.half, widest = 0;
      for (const [lo, hi] of intervals) { widest = Math.max(widest, lo - edge); edge = Math.max(edge, hi); }
      widest = Math.max(widest, t.half - edge);
      assert.ok(widest >= 5.5, `only ${widest.toFixed(1)} m free near ${o.along.toFixed(0)} m`);
    }
  });
}

test('countdown holds everyone at the line, then the race starts', () => {
  const w = new World(TRACKS[0]);
  const z0 = w.player.vehicle.z;
  for (let i = 0; i < 60 * 2.5; i++) w.step(DT, { throttle: 1 });
  assert.equal(w.status, 'countdown');
  assert.equal(w.player.vehicle.z, z0);
  for (let i = 0; i < 60; i++) w.step(DT, { throttle: 1 });
  assert.equal(w.status, 'racing');
  assert.ok(w.events.some((e) => e.type === 'go'));
});

function placeAhead(w, entity, ahead = 6) {
  const p = w.track.pointAt(w.player.along + ahead, w.player.lateral);
  entity.x = p.x; entity.z = p.z; entity.y = w.track.groundHeight(p.x, p.z);
}

function startedWorld() {
  const w = new World(TRACKS[0]);
  w.zombies.length = 0;
  w.pickups.length = 0;
  w.obstacles.forEach((o) => { o.alive = false; });
  for (let i = 0; i < 60 * 3.1; i++) w.step(DT, { throttle: 1 });
  w.events.length = 0;
  return w;
}

test('ramming a shambler kills it with a combo and only scratches the jeep', () => {
  const w = startedWorld();
  const z = { id: 999, type: 'shambler', hp: 1, r: 0.6, alive: true, active: true, along: w.player.along + 6, heading: 0, phase: 0, hint: w.player.hint };
  placeAhead(w, z);
  w.zombies.push(z);
  for (let i = 0; i < 180 && z.alive; i++) w.step(DT, { throttle: 1 });
  assert.equal(z.alive, false);
  assert.equal(w.player.kills, 1);
  assert.ok(w.player.vehicle.hp > 97);
  assert.equal(w.corpses.length, 1);
});

test('a shield turns a brute into a pushover', () => {
  const w = startedWorld();
  w.player.shield = 5;
  const z = { id: 998, type: 'brute', hp: 4, r: 0.9, alive: true, active: true, along: w.player.along + 6, heading: 0, phase: 0, hint: w.player.hint };
  placeAhead(w, z);
  w.zombies.push(z);
  for (let i = 0; i < 180 && z.alive; i++) w.step(DT, { throttle: 1 });
  assert.equal(z.alive, false);
  assert.equal(w.player.vehicle.hp, 100);
});

test('pickups apply their effects', () => {
  const w = startedWorld();
  const p = w.player;
  p.vehicle.hp = 50;
  p.vehicle.nitro = 0;
  w.applyPickup(p, 'repair');
  w.applyPickup(p, 'nitro');
  w.applyPickup(p, 'gun');
  w.applyPickup(p, 'gun');
  assert.equal(p.vehicle.hp, 85);
  assert.ok(p.vehicle.nitro > 0.4);
  assert.equal(p.weapon, 'gun');
  assert.equal(p.ammo, 90);
});

test('the roof gun shoots zombies ahead by itself', () => {
  const w = startedWorld();
  w.applyPickup(w.player, 'gun');
  const z = { id: 997, type: 'runner', hp: 1, r: 0.55, alive: true, active: true, along: w.player.along + 35, heading: 0, phase: 0, hint: w.player.hint };
  placeAhead(w, z, 35);
  w.zombies.push(z);
  w.step(DT, { throttle: 1 });
  assert.equal(z.alive, false);
  assert.ok(w.events.some((e) => e.type === 'shot'));
});

test('a barrel blast clears nearby zombies and chains other barrels', () => {
  const w = startedWorld();
  const at = w.track.pointAt(w.player.along + 60);
  const barrels = [0, 5].map((dx, i) => ({ id: 900 + i, type: 'barrel', x: at.x + dx, z: at.z, y: 0, r: 0.7, h: 1.2, alive: true, along: 0, lateral: 0 }));
  w.obstacles.push(...barrels);
  w.buildGrid();
  const z = { id: 996, type: 'shambler', hp: 1, r: 0.6, alive: true, active: true, x: at.x + 2, z: at.z + 2, y: 0, along: 0, heading: 0, phase: 0, hint: 0 };
  w.zombies.push(z);
  w.hitTarget(barrels[0], w.player, 1);
  assert.equal(barrels[0].alive, false);
  assert.equal(barrels[1].alive, false, 'second barrel chained');
  assert.equal(z.alive, false);
  assert.equal(w.events.filter((e) => e.type === 'explosion').length, 2);
});

test('rockets home in and wreck a brute', () => {
  const w = startedWorld();
  w.applyPickup(w.player, 'rockets');
  const z = { id: 995, type: 'brute', hp: 4, r: 0.9, alive: true, active: true, along: w.player.along + 40, heading: 0, phase: 0, hint: w.player.hint };
  placeAhead(w, z, 40);
  w.zombies.push(z);
  w.step(DT, { throttle: 1, fire: true });
  assert.equal(w.player.ammo, 2);
  for (let i = 0; i < 90 && z.alive; i++) w.step(DT, { throttle: 1 });
  assert.equal(z.alive, false);
});

test('the jeep flies over a rock when high enough', () => {
  const w = startedWorld();
  const rock = { id: 994, type: 'rock', x: 0, z: 0, y: 0, r: 2, h: 2.2, alive: true, along: 0, lateral: 0 };
  placeAhead(w, rock, 3);
  w.obstacles.push(rock);
  w.buildGrid();
  w.player.vehicle.y += 3;
  w.player.vehicle.grounded = false;
  const hp = w.player.vehicle.hp;
  w.checkObstacles(w.player);
  assert.equal(w.player.vehicle.hp, hp);
});
