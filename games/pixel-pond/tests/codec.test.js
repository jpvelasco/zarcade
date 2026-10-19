import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { buildScene, fillRect } from '../src/scenes.js';
import { encodeWorld, encodeCells, decodeCells, MAX_SCENE_CHARS, ALPHABET } from '../src/codec.js';
import { SOIL, FLOWER, FISH, MOSS, WATER, SEED, K_FLOWER, TYPE_COUNT } from '../src/elements.js';

function grownGarden(w = 240, h = 130) {
  const world = new World(w, h, 3);
  buildScene(world, 'meadow', 11);
  for (let s = 0; s < 600; s++) {
    if (s % 20 === 0) world.spray(40 + (s % 120), 40, 8, SEED, 4);
    if (s < 200) world.paint(60, 20, 2, WATER, 0.4);
    world.step();
  }
  world.addFish(w - 40, h - 25);
  return world;
}

test('a garden survives the round trip: every type, wetness, colour and kind', () => {
  const world = grownGarden();
  const { w, h, data } = encodeWorld(world);
  const back = decodeCells(data, w, h);
  assert.ok(back);
  assert.deepEqual(back.type, world.type);
  for (let i = 0; i < world.n; i++) {
    const t = world.type[i];
    if (t === SOIL) assert.equal(back.a[i], Math.min(7, world.a[i]));
    if (t === FLOWER) assert.equal(back.b[i], world.b[i], 'flower colour and centre');
    if (t === FISH) assert.equal(back.b[i] & 1, world.b[i] & 1);
  }
  assert.ok(data.length < MAX_SCENE_CHARS);
});

test('the encoding is compact: a grown phone-sized garden fits in a few kilobytes', () => {
  const world = grownGarden(130, 231);
  const { data } = encodeWorld(world);
  assert.ok(data.length < 12000, `${data.length} chars for ${world.n} cells`);
  for (const ch of data) assert.ok(ALPHABET.includes(ch));
  const empty = new World(300, 180, 1);
  assert.ok(encodeWorld(empty).data.length <= 6, 'an empty garden is a handful of characters');
});

test('shades are rebuilt the same way every time', () => {
  const world = grownGarden();
  const { w, h, data } = encodeWorld(world);
  assert.deepEqual(decodeCells(data, w, h).tone, decodeCells(data, w, h).tone);
});

test('damaged or hostile text is refused, never half-loaded', () => {
  const world = new World(40, 30, 1);
  fillRect(world, 0, 20, 39, 29, SOIL, 5);
  world.put(5, FLOWER, 0, K_FLOWER | 8 | (3 << 4));
  world.put(9, MOSS, 12);
  const { w, h, data } = encodeWorld(world);
  assert.ok(decodeCells(data, w, h));
  assert.equal(decodeCells(data.slice(0, -1), w, h), null, 'truncated');
  assert.equal(decodeCells(data + 'A', w, h), null, 'too long for the grid');
  assert.equal(decodeCells(data.replace(/.$/, '!'), w, h), null, 'a character outside the alphabet');
  assert.equal(decodeCells(data, w + 1, h), null, 'wrong size');
  assert.equal(decodeCells(data, 4, 4), null, 'too small');
  assert.equal(decodeCells(data, 9000, 9000), null, 'too big');
  assert.equal(decodeCells(null, w, h), null);
  assert.equal(decodeCells('A'.repeat(MAX_SCENE_CHARS + 1), w, h), null, 'over the size cap');
  // A type code past the last element.
  const bad = ALPHABET[TYPE_COUNT + 2] + ALPHABET[63] + ALPHABET[63] + ALPHABET[1];
  assert.equal(decodeCells(bad, 40, 30), null);
  // Run lengths that never end.
  assert.equal(decodeCells('A' + '_'.repeat(30), 40, 30), null);
});

test('encodeCells handles long runs with multi-digit lengths', () => {
  const n = 50000;
  const type = new Uint8Array(n).fill(WATER);
  const out = encodeCells(type, new Uint8Array(n), new Uint8Array(n));
  assert.ok(out.length <= 5);
  const back = decodeCells(out, 250, 200);
  assert.equal(back.type.every((t) => t === WATER), true);
});
