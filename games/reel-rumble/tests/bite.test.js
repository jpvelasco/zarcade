import test from 'node:test';
import assert from 'node:assert/strict';
import { createBite, stepBite, PERFECT_PART } from '../src/bite.js';
import { FISH_BY_ID } from '../src/data.js';
import { mulberry32 } from '../src/rng.js';

const DT = 1 / 60;
function untilBite(b) {
  for (let i = 0; i < 60 * 30 && b.phase === 'nibble'; i++) stepBite(b, DT, false);
  return b;
}

test('nibbles come before the bite, and hooking during them spooks the fish', () => {
  const b = createBite(FISH_BY_ID.bluegill, mulberry32(1));
  stepBite(b, DT, true);
  assert.equal(b.phase, 'spooked');
  assert.deepEqual(b.events.map((e) => e.type), ['early']);
});

test('a quick hook is perfect, a later one is good, a missed one is stolen', () => {
  const fish = FISH_BY_ID.perch;
  const quick = untilBite(createBite(fish, mulberry32(2)));
  assert.equal(quick.phase, 'bite');
  stepBite(quick, DT, true);
  assert.equal(quick.phase, 'hooked');
  assert.equal(quick.quality, 'perfect');

  const late = untilBite(createBite(fish, mulberry32(2)));
  const wait = Math.ceil((late.window * (PERFECT_PART + 0.2)) / DT);
  for (let i = 0; i < wait; i++) stepBite(late, DT, false);
  stepBite(late, DT, true);
  assert.equal(late.quality, 'good');

  const missed = untilBite(createBite(fish, mulberry32(2)));
  for (let i = 0; i < 200; i++) stepBite(missed, DT, false);
  assert.equal(missed.phase, 'stolen');
});

test('shy fish nibble more and give less time than greedy ones', () => {
  const count = (id) => {
    let nib = 0, win = 0;
    for (let s = 1; s <= 40; s++) {
      const b = createBite(FISH_BY_ID[id], mulberry32(s));
      win += b.window;
      untilBite(b);
      nib += b.events.filter((e) => e.type === 'nibble').length;
    }
    return { nib, win };
  };
  const darter = count('bluegill'), runner = count('pike');
  assert.ok(darter.nib > runner.nib);
  assert.ok(darter.win < runner.win);
});

test('bites are deterministic for a seed', () => {
  const a = untilBite(createBite(FISH_BY_ID.koi, mulberry32(77)));
  const b = untilBite(createBite(FISH_BY_ID.koi, mulberry32(77)));
  assert.deepEqual(a.events, b.events);
});
