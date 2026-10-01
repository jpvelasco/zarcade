import test from 'node:test';
import assert from 'node:assert/strict';
import { LruCache } from '../src/cache.js';
import { Particles, burst } from '../src/particles.js';
import { QUALITY_LEVELS, QualityScaler, qualityIndex } from '../src/quality.js';
import { LOT, blockScenery, crossingDecor, segmentDecor } from '../src/scenery.js';
import { BLOCK, ROAD_HALF, blockAt, isRoad } from '../src/city.js';
import { loadSave } from '../src/progress.js';

test('the LRU cache evicts the least recently used entry', () => {
  const evicted = [];
  const cache = new LruCache(3, (key) => evicted.push(key));
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), 1); // a is now the most recent
  cache.set('d', 4);
  assert.deepEqual(evicted, ['b']);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.size, 3);
  assert.equal(cache.peek('c'), 3);
  cache.set('e', 5); // peek did not refresh c
  assert.deepEqual(evicted, ['b', 'c']);
  cache.setLimit(1);
  assert.equal(cache.size, 1);
  assert.equal(cache.has('e'), true);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.deepEqual(evicted, ['b', 'c', 'a', 'd', 'e']);
});

test('the quality scaler steps down on slow frames and not on one hitch', () => {
  const scaler = new QualityScaler();
  for (let i = 0; i < 200; i++) assert.equal(scaler.sample(16.7), -1);
  assert.equal(scaler.sample(400), -1, 'a single long frame is ignored');
  assert.equal(scaler.level, 0);
  let changed = -1;
  let elapsed = 0;
  while (changed < 0 && elapsed < 5000) {
    changed = scaler.sample(33);
    elapsed += 33;
  }
  assert.equal(changed, 1);
  assert.ok(elapsed < 2500, `stepped down after ${elapsed} ms`);
  assert.equal(QUALITY_LEVELS[scaler.level].name, 'medium');
});

test('the quality scaler climbs back after a smooth stretch and backs off when that fails', () => {
  const scaler = new QualityScaler({ level: 2 });
  let elapsed = 0;
  while (scaler.level === 2 && elapsed < 20000) {
    scaler.sample(16.7);
    elapsed += 16.7;
  }
  assert.equal(scaler.level, 1);
  const firstWait = elapsed;
  // The upgrade is too much: frames slow down straight away.
  while (scaler.level === 1) scaler.sample(30);
  assert.equal(scaler.level, 2);
  elapsed = 0;
  while (scaler.level === 2 && elapsed < 60000) {
    scaler.sample(16.7);
    elapsed += 16.7;
  }
  assert.equal(scaler.level, 1);
  assert.ok(elapsed > firstWait * 1.5, 'the second upgrade waited longer');
});

test('the quality scaler never leaves the defined levels', () => {
  const scaler = new QualityScaler({ level: QUALITY_LEVELS.length - 1 });
  for (let i = 0; i < 1000; i++) scaler.sample(60);
  assert.equal(scaler.level, QUALITY_LEVELS.length - 1);
  const top = new QualityScaler();
  for (let i = 0; i < 2000; i++) top.sample(8.3);
  assert.equal(top.level, 0);
  assert.equal(qualityIndex('low'), 2);
  assert.equal(qualityIndex('nope'), -1);
  for (const level of QUALITY_LEVELS) assert.ok(level.particles > 0 && level.dpr > 0);
});

test('particles respect their cap and expire', () => {
  const particles = new Particles(10);
  for (let i = 0; i < 25; i++) particles.spawn({ x: i, life: 0.5 });
  assert.equal(particles.count, 10);
  particles.update(0.3);
  assert.equal(particles.count, 10);
  particles.update(0.3);
  assert.equal(particles.count, 0);
  particles.spawn({ life: 1, vx: 100, drag: 0 });
  particles.update(0.5);
  assert.ok(Math.abs(particles.items[0].x - 50) < 1e-9);
  particles.setLimit(0);
  assert.equal(particles.spawn({}), null);
  const spread = burst(12, 100, () => 0.5);
  assert.equal(spread.length, 12);
});

test('block scenery is deterministic and stays inside its lot', () => {
  for (const seed of [9417, 77, 123456]) {
    for (let column = -4; column <= 4; column++) {
      for (let row = -4; row <= 4; row++) {
        const a = blockScenery(column, row, seed);
        assert.deepEqual(a, blockScenery(column, row, seed));
        assert.equal(blockAt(column * BLOCK + ROAD_HALF, row * BLOCK + ROAD_HALF, seed).column, column);
        for (const building of a.buildings) {
          assert.ok(building.x >= 0 && building.y >= 0, 'building starts inside the lot');
          assert.ok(building.x + building.w <= LOT + 1e-9 && building.y + building.h <= LOT + 1e-9, 'building ends inside the lot');
          assert.ok(building.roofH + building.facade === building.h);
          assert.equal(building.windows.length, building.columns * building.rows);
        }
        assert.equal(a.lamps.length, 2);
      }
    }
  }
  assert.notDeepEqual(blockScenery(1, 2, 9417), blockScenery(1, 2, 9418));
});

test('street decorations hang over roads and puddles lie on them', () => {
  let strings = 0;
  let puddles = 0;
  let crossings = 0;
  for (let column = -6; column <= 6; column++) {
    for (let row = -6; row <= 6; row++) {
      for (const axis of ['x', 'y']) {
        const decor = segmentDecor(column, row, axis, 9417);
        assert.deepEqual(decor, segmentDecor(column, row, axis, 9417));
        assert.equal(decor.blocks.length, 2);
        if (decor.string) {
          strings++;
          for (const lantern of decor.string.lanterns) assert.ok(isRoad(lantern.x, lantern.y), 'lantern over a road');
        }
        for (const puddle of decor.puddles) {
          puddles++;
          assert.ok(isRoad(puddle.x, puddle.y), 'puddle on a road');
        }
      }
      const crossing = crossingDecor(column, row, 9417);
      if (crossing) {
        crossings++;
        assert.equal(crossing.blocks.length, 4);
        assert.equal(crossing.string.lanterns.length, 4);
      }
    }
  }
  assert.ok(strings > 150 && puddles > 100 && crossings > 30, `${strings} strings, ${puddles} puddles, ${crossings} crossings`);
});

test('older saves keep their mute choice for music too', () => {
  const store = (value) => ({ getItem: () => JSON.stringify(value) });
  assert.equal(loadSave(store({ muted: true })).musicMuted, true);
  assert.equal(loadSave(store({ muted: false })).musicMuted, false);
  const split = loadSave(store({ muted: true, musicMuted: false }));
  assert.equal(split.muted, true);
  assert.equal(split.musicMuted, false);
  assert.equal(loadSave(null).musicMuted, false);
});
