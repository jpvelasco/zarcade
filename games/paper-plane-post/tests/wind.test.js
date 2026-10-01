import test from 'node:test';
import assert from 'node:assert/strict';
import {
  band, gust, rain, ridge, sourceBounds, sourceStrength, sourcesInView, sunbeam, updraft, windAt,
} from '../src/wind.js';

test('a warm column lifts hardest at its base and fades out at the top', () => {
  const column = updraft(100, 0, 100, 20, 6);
  const low = windAt([column], 100, -5);
  assert.ok(low.y < -5, `core lift ${low.y}`);
  const high = windAt([column], 100, -95);
  assert.ok(high.y > low.y, 'the top of the column is weaker');
  assert.equal(windAt([column], 100, -140).y, 0, 'nothing above the column');
  assert.equal(windAt([column], 200, -20).y, 0, 'nothing beside the column');
});

test('a column fades smoothly across its width', () => {
  const column = updraft(0, 0, 100, 20, 6);
  const core = Math.abs(windAt([column], 0, -20).y);
  const edge = Math.abs(windAt([column], 16, -20).y);
  const outside = Math.abs(windAt([column], 21, -20).y);
  assert.ok(core > edge && edge > outside);
  assert.equal(outside, 0);
});

test('bands push along, and a negative band pushes back', () => {
  const tail = windAt([band(0, 0, 60, 20, 5)], 0, 0);
  assert.ok(tail.x > 4 && tail.x < 5.01);
  const head = windAt([band(0, 0, 60, 20, -5)], 0, 0);
  assert.ok(head.x < -4);
});

test('a gust breathes over time but stays inside its strength', () => {
  const source = gust(0, 0, 60, 20, 6, 4);
  let min = Infinity;
  let max = -Infinity;
  for (let t = 0; t < 8; t += 0.05) {
    const w = windAt([source], 0, 0, t);
    min = Math.min(min, w.x);
    max = Math.max(max, w.x);
  }
  assert.ok(min >= 0 && max <= 6.01, `${min}..${max}`);
  assert.ok(max - min > 2, 'a gust should actually pulse');
});

test('rain pushes down and wets the paper; sun lifts and dries it', () => {
  const wet = windAt([rain(0, 0, 30, 20, 4, { rain: 1 })], 0, 0);
  assert.ok(wet.y > 3);
  assert.ok(wet.rain > 0.9);
  const dry = windAt([sunbeam(0, 0, 30, 20, 3)], 0, 0);
  assert.ok(dry.y < -2.5);
  assert.ok(dry.dry > 1.5);
  assert.equal(dry.rain, 0);
});

test('the regional breeze is the baseline everywhere', () => {
  const w = windAt([], 500, -40, 0, { x: 2, y: 0 });
  assert.deepEqual({ x: w.x, y: w.y }, { x: 2, y: 0 });
});

test('windAt is pure and reuses the output object', () => {
  const sources = [updraft(0, 0, 90, 20, 5), band(0, -40, 40, 10, 3)];
  const out = { x: 0, y: 0, rain: 0, dry: 1, lift: 0 };
  const a = windAt(sources, 0, -20, 0, null, out);
  assert.equal(a, out);
  const first = { ...out };
  windAt(sources, 900, -20, 0, null, out);
  const again = windAt(sources, 0, -20, 0, null, out);
  assert.deepEqual({ ...again }, first);
});

test('lift is reported separately so the game can spot a thermal', () => {
  const w = windAt([ridge(0, 0, 120, 40, 5)], 0, -20);
  assert.ok(w.lift > 2);
  assert.ok(w.x > 0, 'ridge lift leans downwind');
  assert.equal(windAt([band(0, 0, 40, 20, 4)], 0, 0).lift, 0);
});

test('bounds cover the source, and the view filter uses them', () => {
  const sources = [updraft(100, 0, 90, 20, 5), updraft(900, 0, 90, 20, 5)];
  for (const source of sources) {
    const box = sourceBounds(source);
    assert.ok(box.x0 < source.x && box.x1 > source.x);
    assert.ok(box.y0 < source.y);
    // Anything outside the box must be felt as nothing at all.
    assert.equal(sourceStrength(source, box.x1 + 1, source.y - 10), 0);
    assert.equal(sourceStrength(source, source.x, box.y0 - 1), 0);
  }
  const seen = sourcesInView(sources, 0, 300, -200, 20);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].x, 100);
});
