import test from 'node:test';
import assert from 'node:assert/strict';
import { STRIPE_H, STRIPE_V, BOMB, RAINBOW, findMatches } from '../src/board.js';
import { areaFor, detonate, swapBlast, dominantColor, CROSS, BIG_CROSS, MEGA, WHOLE } from '../src/specials.js';
import { Rng } from '../src/rng.js';
import { make } from './helpers.js';

const grid = () => make([
  '123456',
  '234561',
  '345612',
  '456123',
  '561234',
  '612345',
]);

test('a striped jelly clears its whole row or column', () => {
  const b = grid();
  assert.deepEqual(areaFor(b, 14, STRIPE_H), [12, 13, 14, 15, 16, 17]);
  assert.deepEqual(areaFor(b, 14, STRIPE_V), [2, 8, 14, 20, 26, 32]);
});

test('a bubble bomb clears three by three and stops at the edge', () => {
  const b = grid();
  assert.equal(areaFor(b, 7, BOMB).length, 9);
  assert.equal(areaFor(b, 0, BOMB).length, 4);
});

test('a rainbow pearl clears every jelly of one color', () => {
  const b = grid();
  const cells = areaFor(b, 0, RAINBOW, 3);
  assert.ok(cells.length >= 6);
  assert.ok(cells.every((i) => i === 0 || b.at(i).color === 3));
});

test('holes are never part of a blast', () => {
  const b = make(['.123.', '12345', '23451']);
  assert.deepEqual(areaFor(b, 6, STRIPE_H), [5, 6, 7, 8, 9]);
  assert.deepEqual(areaFor(b, 5, STRIPE_V), [5, 10], 'the hole above is skipped');
});

test('blasts chain into other specials they touch', () => {
  const b = grid();
  b.at(14).special = STRIPE_H;
  b.at(16).special = STRIPE_V;  // sits in the row that is about to go off
  const { hits, blasts } = detonate(b, [{ index: 14, kind: STRIPE_H }]);
  assert.equal(blasts.length, 2, 'the second stripe fires too');
  assert.ok(hits.includes(4) && hits.includes(34), 'its column cleared as well');
});

test('stripe plus stripe clears a full cross', () => {
  const b = grid();
  b.at(14).special = STRIPE_H;
  b.at(15).special = STRIPE_V;
  const blast = swapBlast(b, 14, 15);
  assert.equal(blast.kind, CROSS);
  assert.equal(areaFor(b, 15, CROSS).length, 6 + 6 - 1);
});

test('bomb plus stripe clears a fat cross, bomb plus bomb a five by five', () => {
  const b = grid();
  b.at(14).special = BOMB;
  b.at(15).special = STRIPE_H;
  assert.equal(swapBlast(b, 14, 15).kind, BIG_CROSS);
  assert.equal(areaFor(b, 21, BIG_CROSS).length, 6 * 3 + 6 * 3 - 9);
  b.at(15).special = BOMB;
  assert.equal(swapBlast(b, 14, 15).kind, MEGA);
  assert.equal(areaFor(b, 21, MEGA).length, 25);
});

test('pearl plus pearl clears the whole board', () => {
  const b = grid();
  b.at(14).special = RAINBOW;
  b.at(14).color = null;
  b.at(15).special = RAINBOW;
  b.at(15).color = null;
  const blast = swapBlast(b, 14, 15);
  assert.equal(blast.kind, WHOLE);
  const { hits } = detonate(b, blast.seeds);
  assert.equal(hits.length, b.playableIndices().length);
});

test('pearl plus a plain jelly clears that color', () => {
  const b = grid();
  b.at(14).special = RAINBOW;
  b.at(14).color = null;
  const target = b.at(15).color;
  const blast = swapBlast(b, 14, 15);
  assert.equal(blast.kind, RAINBOW);
  const { hits } = detonate(b, blast.seeds);
  assert.ok(hits.every((i) => i === 14 || b.at(i).color === target));
});

test('pearl plus striped turns every jelly of that color into a stripe', () => {
  const b = grid();
  b.at(14).special = RAINBOW;
  b.at(14).color = null;
  b.at(15).special = STRIPE_H;
  const color = b.at(15).color;
  const blast = swapBlast(b, 14, 15);
  assert.equal(blast.kind, 'pearlStripe');
  assert.ok(blast.transforms.length >= 5);
  assert.ok(blast.transforms.every((t) => b.at(t.index).color === color));
  for (const t of blast.transforms) b.at(t.index).special = t.special;
  const { hits } = detonate(b, blast.seeds);
  assert.ok(hits.length > 20, 'a lot of the board goes off');
});

test('pearl plus bomb turns that color into bombs', () => {
  const b = grid();
  b.at(14).special = RAINBOW;
  b.at(14).color = null;
  b.at(15).special = BOMB;
  const blast = swapBlast(b, 14, 15);
  assert.equal(blast.kind, 'pearlBomb');
  assert.ok(blast.transforms.every((t) => t.special === BOMB));
});

test('a special swapped with a plain jelly simply goes off', () => {
  const b = grid();
  b.at(14).special = BOMB;
  const blast = swapBlast(b, 14, 15);
  assert.equal(blast.kind, BOMB);
  assert.deepEqual(blast.seeds.map((s) => s.index), [14]);
  assert.equal(swapBlast(b, 20, 21), null, 'two plain jellies make no blast');
});

test('a chained pearl picks the color there is most of', () => {
  const b = make(['111', '112', '345']);
  assert.equal(dominantColor(b, new Rng(1)), 1);
  b.at(0).special = RAINBOW;
  b.at(0).color = null;
  const { blasts } = detonate(b, [{ index: 0, kind: RAINBOW }], { rng: new Rng(1) });
  assert.equal(blasts[0].color, 1);
});

test('a matched special is detonated, not just cleared', () => {
  const b = make(['1112', '2345', '3456']);
  b.at(1).special = STRIPE_V;
  const groups = findMatches(b);
  assert.equal(groups.length, 1);
  const seeds = groups[0].cells
    .filter((i) => b.at(i).special)
    .map((i) => ({ index: i, kind: b.at(i).special, color: b.at(i).color }));
  const { hits } = detonate(b, seeds);
  assert.ok(hits.includes(5) && hits.includes(9), 'the column went off');
});
