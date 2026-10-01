import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENAS, createArenaState, updateArena, onFloor, floorVelocity, floorAccel, randomFloorPoint, safestPoint, spawnPoints, zoneSpots, safeAt, crackAt, tierAt } from '../src/arenas.js';
import { Rng } from '../src/rng.js';

const HEX = /^#[0-9a-f]{6}$/i;
const KINDS = ['disc', 'shrink', 'rect', 'conveyor', 'turntable', 'terraces', 'seesaw', 'tiles', 'donut'];

test('there are at least eight arenas with unique ids, names and valid themes', () => {
  assert.ok(ARENAS.length >= 8);
  assert.equal(new Set(ARENAS.map((a) => a.id)).size, ARENAS.length);
  assert.equal(new Set(ARENAS.map((a) => a.name)).size, ARENAS.length);
  for (const a of ARENAS) {
    assert.ok(KINDS.includes(a.kind), `${a.id} kind`);
    assert.ok(a.blurb.length > 10, `${a.id} blurb`);
    for (const k of ['top', 'top2', 'side', 'rim', 'glow']) assert.match(a.theme[k], HEX, `${a.id} ${k}`);
    assert.ok(a.theme.sky.every((c) => HEX.test(c)), `${a.id} sky`);
  }
});

test('the arenas cover every twist: shrinking, ice, belts, turntable, bumpers, lava, seesaw, tiles', () => {
  const kinds = new Set(ARENAS.map((a) => a.kind));
  for (const k of ['shrink', 'conveyor', 'turntable', 'terraces', 'seesaw', 'tiles']) assert.ok(kinds.has(k), k);
  assert.ok(ARENAS.some((a) => (a.friction ?? 1) < 1), 'an icy arena');
  assert.ok(ARENAS.some((a) => a.bumpers && a.bumpers.length), 'an arena with bumpers');
});

test('every floor fits inside its extent and spawns, zones and the safe spot are on solid ground', () => {
  for (const a of ARENAS) {
    for (const persistent of [false, true]) {
      const st = createArenaState(a, { persistent });
      // Nothing beyond the extent is floor.
      for (let k = 0; k < 64; k++) {
        const ang = (k / 64) * Math.PI * 2;
        assert.equal(onFloor(st, Math.cos(ang) * (a.extent * 1.45), Math.sin(ang) * (a.extent * 1.45)), false, `${a.id} extent`);
      }
      for (const count of [2, 3, 4]) {
        const pts = spawnPoints(st, count);
        assert.equal(pts.length, count);
        for (const p of pts) assert.ok(safeAt(st, p.x, p.y, 34), `${a.id} spawn ${p.x},${p.y}`);
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
          assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 90, `${a.id} spawns apart`);
        }
      }
      const zs = zoneSpots(st);
      assert.ok(zs.length >= 3, `${a.id} zone spots`);
      for (const z of zs) assert.ok(safeAt(st, z.x, z.y, 40), `${a.id} zone ${z.x},${z.y}`);
      const s = safestPoint(st);
      assert.ok(safeAt(st, s.x, s.y, 30), `${a.id} safest`);
    }
  }
});

test('random floor points land on the floor, deterministically', () => {
  for (const a of ARENAS) {
    const st = createArenaState(a);
    const r1 = new Rng(5), r2 = new Rng(5);
    for (let k = 0; k < 20; k++) {
      const p = randomFloorPoint(st, r1, 40);
      assert.ok(onFloor(st, p.x, p.y), a.id);
      assert.deepEqual(p, randomFloorPoint(st, r2, 40));
    }
  }
});

const arena = (id) => ARENAS.find((a) => a.id === id);

test('the sundae shrinks over time but never vanishes', () => {
  const st = createArenaState(arena('sundae'));
  const r0 = st.r;
  for (let t = 0; t < 120; t += 0.1) updateArena(st, 0.1, [], true);
  assert.ok(st.r < r0 * 0.5);
  assert.ok(st.r >= arena('sundae').rMin);
  assert.ok(onFloor(st, 0, 0));
  assert.ok(!onFloor(st, r0 - 5, 0));
});

test('lava rises tier by tier, leaving the summit last', () => {
  const st = createArenaState(arena('lava'));
  assert.equal(tierAt(st, 300, 0)?.h, 1);
  for (let t = 0; t < 40; t += 0.1) updateArena(st, 0.1, [], true);
  assert.equal(onFloor(st, 300, 0), false, 'the beach is under lava');
  for (let t = 0; t < 200; t += 0.1) updateArena(st, 0.1, [], true);
  assert.ok(onFloor(st, 0, 0), 'the summit stays');
});

test('cookie tiles crack under a blob, fall away, and regrow in respawn modes', () => {
  for (const persistent of [false, true]) {
    const st = createArenaState(arena('cookie'), { persistent });
    const tile = st.tiles.find((t) => t.x === 0 && t.y === 0);
    const blob = { x: 0, y: 0, radius: 30, grounded: true };
    for (let t = 0; t < 2.8; t += 0.05) updateArena(st, 0.05, [blob], true);
    blob.grounded = false;
    for (let t = 0; t < 1.6; t += 0.05) updateArena(st, 0.05, [blob], true);
    assert.equal(tile.gone, true);
    assert.equal(onFloor(st, 0, 0), false);
    for (let t = 0; t < 8; t += 0.05) updateArena(st, 0.05, [blob], true);
    assert.equal(tile.gone, !persistent);
  }
  const st = createArenaState(arena('cookie'));
  assert.ok(crackAt(st, 0, 0, 0, true) >= 1);
});

test('the seesaw tips toward the heavier side and slides blobs downhill', () => {
  const st = createArenaState(arena('seesaw'));
  const blobs = [{ x: 250, y: 0, mass: 1, grounded: true }, { x: 240, y: 30, mass: 1, grounded: true }];
  for (let t = 0; t < 2; t += 1 / 120) updateArena(st, 1 / 120, blobs, true);
  assert.ok(st.tilt > 0.1, `tilt ${st.tilt}`);
  const acc = floorAccel(st, 0, 0, { x: 0, y: 0 });
  assert.ok(acc.x > 0);
});

test('belts and the turntable carry blobs; plain floors do not', () => {
  const v = { x: 0, y: 0 };
  const belt = arena('conveyor').belts[0];
  floorVelocity(createArenaState(arena('conveyor')), 0, belt.y, v);
  assert.equal(v.x, belt.v);
  floorVelocity(createArenaState(arena('spin')), 100, 0, v);
  assert.ok(v.y > 0 && v.x === 0);
  floorVelocity(createArenaState(arena('pudding')), 100, 0, v);
  assert.deepEqual(v, { x: 0, y: 0 });
});

test('the donut has a hole and sudden death removes the outside', () => {
  const st = createArenaState(arena('donut'));
  assert.equal(onFloor(st, 0, 0), false);
  assert.equal(onFloor(st, 230, 0), true);
  st.storm = 200;
  assert.equal(onFloor(st, 230, 0), false);
});
