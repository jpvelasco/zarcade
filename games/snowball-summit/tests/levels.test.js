import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOPES, PEAKS, SLOPES_PER_PEAK, dailySlope, endlessLevel, resolveTier, niceSize } from '../src/levels.js';
import { ITEMS, ITEM_BY_ID } from '../src/items.js';
import { autoplay, calibrate } from '../src/autoplayer.js';
import { buildTerrain } from '../src/terrain.js';
import { World, STEP } from '../src/world.js';
import { Rng } from '../src/rng.js';

test('three peaks of four handcrafted slopes, with sane data', () => {
  assert.equal(PEAKS.length, 3);
  assert.equal(SLOPES.length, PEAKS.length * SLOPES_PER_PEAK);
  assert.ok(SLOPES.length >= 12);
  const ids = new Set();
  for (const lv of SLOPES) {
    assert.ok(!ids.has(lv.id), `unique id ${lv.id}`);
    ids.add(lv.id);
    assert.ok(lv.name && lv.tip, `${lv.id} has a name and tip`);
    assert.ok(lv.goals.size > lv.start && lv.goals.items > 10 && lv.goals.time > 20, `${lv.id} goals`);
    assert.equal(lv.segments.at(-1).t, 'finish');
    const t = buildTerrain(lv);
    for (const it of t.items) assert.ok(ITEM_BY_ID[it.type], `${lv.id} item ${it.type}`);
    for (const y of t.ys) assert.ok(Number.isFinite(y));
    assert.ok(t.items.length >= 60, `${lv.id} has plenty to collect`);
  }
  assert.ok(SLOPES.filter((l) => l.avalanche).length >= 4, 'the Snow Cloud chases on several slopes');
  assert.ok(SLOPES.some((l) => l.segments.some((s) => s.t === 'gate')) && SLOPES.some((l) => l.segments.some((s) => s.t === 'bridge')));
});

test('slopes build the same mountain every time', () => {
  for (const lv of SLOPES.slice(0, 4)) {
    const a = buildTerrain(lv), b = buildTerrain(lv);
    assert.deepEqual(a.items.map((i) => `${i.type}@${i.x.toFixed(2)}`), b.items.map((i) => `${i.type}@${i.x.toFixed(2)}`));
    assert.deepEqual(a.ys.slice(0, 500), b.ys.slice(0, 500));
  }
});

test('size tiers pick things in their size window', () => {
  const rng = new Rng(5);
  for (const D of [20, 60, 200, 800]) {
    for (let i = 0; i < 20; i++) {
      const id = resolveTier('m', D, 2, rng);
      const r = ITEM_BY_ID[id].size / D;
      assert.ok(r >= 0.25 && r <= 0.6, `m at ${D}: ${id} ${r}`);
    }
  }
  assert.equal(resolveTier('penguin', 50, 0, rng), 'penguin');
  assert.equal(niceSize(47), 45);
  assert.equal(niceSize(333), 325);
});

test('the autoplayer finishes every slope and earns all three stars', () => {
  for (const lv of SLOPES) {
    const w = autoplay(lv);
    assert.equal(w.status, 'finished', `${lv.id} finished`);
    assert.deepEqual(w.starChecks(), [true, true, true], `${lv.id} stars (D ${w.ball.D.toFixed(0)}, ${w.collected}, ${w.finishTime.toFixed(1)}s)`);
  }
});

test('a gentle player (less speed-up, later jumps) still finishes every slope', () => {
  for (const lv of SLOPES) {
    const w = autoplay(lv, { skill: 0.3 });
    assert.equal(w.status, 'finished', `${lv.id}`);
    assert.ok(w.stars() >= 1, `${lv.id} earns a star`);
  }
});

test('size gates can be passed: a good run is big enough for every gate on the first try', () => {
  for (const lv of SLOPES.filter((l) => l.segments.some((s) => s.t === 'gate'))) {
    const w = autoplay(lv);
    assert.equal(w.gateBlocks, 0, `${lv.id} gates ${w.terrain.gates.map((g) => g.min).join(',')}`);
    assert.equal(w.gatesSmashed, w.terrain.gates.length);
  }
});

test('nobody gets stuck: a ball left alone finishes every slope without the Snow Cloud', () => {
  for (const lv of SLOPES) {
    const w = autoplay(lv, { avalanche: false, controls: () => ({}) });
    assert.equal(w.status, 'finished', `${lv.id} after ${w.time.toFixed(0)}s at ${(w.progress() * 100).toFixed(0)}%`);
  }
});

test('a ball too heavy for a bridge falls into the gully and still finishes', () => {
  for (const lv of SLOPES.filter((l) => l.segments.some((s) => s.t === 'bridge'))) {
    const big = { ...lv, start: lv.start * 3, avalanche: null };
    const w = autoplay(big);
    assert.ok(w.bridgesBroken >= 1, `${lv.id} broke a bridge`);
    assert.equal(w.status, 'finished', `${lv.id}`);
  }
});

test('the Snow Cloud catches a ball that never speeds up, but not one that does', () => {
  const lv = SLOPES.find((l) => l.avalanche);
  assert.equal(autoplay(lv, { controls: () => ({ brake: 0.5 }) }).status, 'caught');
  assert.equal(autoplay(lv).status, 'finished');
});

test('the daily slope is the same all day, different the next, and finishable', () => {
  const a = dailySlope('2026-10-01'), b = dailySlope('2026-10-01'), c = dailySlope('2026-10-02');
  assert.equal(a.seed, b.seed);
  assert.deepEqual(buildTerrain(a).items.map((i) => i.type), buildTerrain(b).items.map((i) => i.type));
  assert.notEqual(a.seed, c.seed);
  for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2027-01-01', '2027-02-14']) {
    const lv = dailySlope(day);
    lv.goals = calibrate(lv);
    const w = autoplay(lv);
    assert.equal(w.status, 'finished', day);
    assert.equal(w.stars(), 3, day);
  }
});

test('Endless Mountain grows from its seed and the Snow Cloud ends every run', () => {
  const a = new World(endlessLevel(99)), b = new World(endlessLevel(99));
  assert.deepEqual(a.terrain.items.slice(0, 40).map((i) => i.type), b.terrain.items.slice(0, 40).map((i) => i.type));
  const w = autoplay(endlessLevel(99), { maxTime: 900 });
  assert.equal(w.status, 'caught');
  assert.ok(w.chunk > 5, 'it kept building new mountain');
  assert.ok(w.distance / 100 > 300, `rolled ${w.distance / 100} m`);
  assert.ok(w.time > 45 && w.time < 600, `run lasted ${w.time}s`);
});

test('every museum thing can be found somewhere', () => {
  const seen = new Set();
  for (const lv of SLOPES) for (const it of buildTerrain(lv).items) seen.add(it.type);
  for (let d = 1; d <= 28; d++) for (const it of buildTerrain(dailySlope(`2026-11-${String(d).padStart(2, '0')}`)).items) seen.add(it.type);
  const missing = ITEMS.filter((it) => !seen.has(it.id)).map((it) => it.id);
  assert.deepEqual(missing, []);
});
