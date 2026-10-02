import test from 'node:test';
import assert from 'node:assert/strict';
import { AHEAD, CRUISE, THEMES, WINDOW_MAX, makeEndless, pressure, themeById } from '../src/endless.js';
import { World } from '../src/world.js';
import { dailyInfo, dateKey, previousKey } from '../src/daily.js';
import { hashString, makeRng } from '../src/rng.js';

const DT = 1 / 60;

function flyFor(scene, seconds, control = () => ({})) {
  const world = new World(scene);
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && world.status === 'flying'; i += 1) world.step(DT, control(world, i));
  return world;
}

test('the same seed folds the same valley', () => {
  const a = makeEndless({ seed: 99, theme: 'soft' });
  const b = makeEndless({ seed: 99, theme: 'soft' });
  a.ensure(3000);
  b.ensure(3000);
  assert.deepEqual(a.terrain.nodes, b.terrain.nodes);
  assert.deepEqual(a.rings.map((r) => [r.x, r.y]), b.rings.map((r) => [r.x, r.y]));
  assert.deepEqual(a.air.map((s) => [s.t, s.x, s.s]), b.air.map((s) => [s.t, s.x, s.s]));
});

test('different seeds fold different valleys', () => {
  const a = makeEndless({ seed: 1, theme: 'soft' });
  const b = makeEndless({ seed: 2, theme: 'soft' });
  a.ensure(2000);
  b.ensure(2000);
  assert.notDeepEqual(a.terrain.nodes, b.terrain.nodes);
});

test('and flying it twice gives exactly the same run', () => {
  const control = (_, step) => ({ dive: step % 130 < 44 });
  const a = flyFor(makeEndless({ seed: 7, theme: 'thermal' }), 60, control);
  const b = flyFor(makeEndless({ seed: 7, theme: 'thermal' }), 60, control);
  assert.deepEqual(a.result(), b.result());
});

test('the valley grows ahead of the plane and never runs out', () => {
  const scene = makeEndless({ seed: 5 });
  assert.ok(scene.built >= AHEAD);
  const world = flyFor(scene, 120);
  assert.ok(scene.terrain.x1 > world.plane.x, 'there is always more ground ahead');
  for (let x = world.startX; x < world.plane.x; x += 25) {
    assert.ok(Number.isFinite(scene.terrain.heightAt(x)));
  }
});

test('old scenery is forgotten so a long flight stays small', () => {
  const scene = makeEndless({ seed: 11, theme: 'tail' });
  flyFor(scene, 200);
  assert.ok(scene.rings.length < 200, `${scene.rings.length} rings still in memory`);
  assert.ok(scene.air.length < 160, `${scene.air.length} air sources still in memory`);
  assert.ok(scene.terrain.nodes.length < 120, `${scene.terrain.nodes.length} terrain nodes`);
});

test('terrain stays in a sane band and the rings follow it', () => {
  const scene = makeEndless({ seed: 3 });
  scene.ensure(6000);
  for (const node of scene.terrain.nodes) {
    assert.ok(node.y > -80 && node.y < 10, `ground at ${node.x} is ${node.y}`);
  }
  for (const ring of scene.rings) {
    const ground = scene.terrain.heightAt(ring.x);
    assert.ok(ground - ring.y > 18, `ring at ${ring.x} is only ${(ground - ring.y).toFixed(0)} m up`);
    assert.ok(ground - ring.y < CRUISE + 24);
  }
});

test('every window sits on a building the renderer can draw (#60)', () => {
  // Routes cap a window at 34 m; Endless used to string letters up to 48 m,
  // so they floated above their roof.
  let checked = 0;
  for (const seed of [1, 5, 9, 77, 1234, 99999]) {
    const scene = makeEndless({ seed });
    scene.ensure(4000);
    for (const drop of scene.drops) {
      const up = drop.ground - drop.y;
      assert.ok(up >= 8 && up <= WINDOW_MAX, `seed ${seed}: window at ${drop.x} is ${up.toFixed(1)} m up`);
      checked += 1;
    }
  }
  assert.ok(checked > 40);
});

test('hazards and clouds only arrive once the run is going', () => {
  const scene = makeEndless({ seed: 21 });
  scene.ensure(300);
  const early = scene.hazards.filter((h) => h.x < 260);
  assert.equal(early.length, 0, 'the first stretch is clear');
  scene.ensure(5000);
  assert.ok(scene.hazards.length > 3, 'later on there is clutter');
  assert.ok(scene.air.some((s) => s.t === 'rain'), 'and weather');
});

test('it gets harder with distance, and the ramp is bounded', () => {
  assert.equal(pressure(0), 0);
  assert.equal(pressure(100), 0);
  assert.ok(pressure(2000) > 0.3 && pressure(2000) < 0.6);
  assert.equal(pressure(99999), 1);
});

test('every theme is flyable and named', () => {
  for (const theme of THEMES) {
    assert.ok(theme.name.length > 3);
    assert.ok(theme.blurb.length > 10);
    assert.equal(themeById(theme.id), theme);
    const world = flyFor(makeEndless({ seed: 4, theme: theme.id }), 45);
    assert.ok(world.best > 200, `${theme.id} only managed ${world.best.toFixed(0)} m on a lazy glide`);
  }
  assert.equal(themeById('nonsense'), THEMES[0]);
});

test('the daily breeze is the same all day and different tomorrow', () => {
  const key = '2026-10-01';
  const a = dailyInfo(key);
  const b = dailyInfo(key);
  assert.deepEqual(a, b);
  assert.notEqual(dailyInfo('2026-10-02').seed, a.seed);
  assert.ok(a.goal >= 600 && a.goal <= 1500);
  assert.ok(a.name.length > 3);
  assert.ok(THEMES.some((theme) => theme.id === a.theme));
});

test('date keys and the day before behave at month and year ends', () => {
  assert.equal(dateKey(new Date(2026, 9, 1)), '2026-10-01');
  assert.equal(previousKey('2026-10-01'), '2026-09-30');
  assert.equal(previousKey('2027-01-01'), '2026-12-31');
  assert.equal(previousKey('2024-03-01'), '2024-02-29');
});

test('the seeded rng is stable and its helpers stay in range', () => {
  const rng = makeRng(hashString('paper-plane-post'));
  const first = [rng.next(), rng.next(), rng.next()];
  const again = makeRng(hashString('paper-plane-post'));
  assert.deepEqual([again.next(), again.next(), again.next()], first);
  for (let i = 0; i < 200; i += 1) {
    const v = rng.range(-3, 7);
    assert.ok(v >= -3 && v < 7);
    const n = rng.int(2, 5);
    assert.ok(n >= 2 && n <= 5 && Number.isInteger(n));
  }
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 400; i += 1) counts[rng.weighted({ a: 3, b: 1 })] += 1;
  assert.ok(counts.a > counts.b * 1.5);
});
