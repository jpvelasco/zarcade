import test from 'node:test';
import assert from 'node:assert/strict';
import { createPicker, wordScore } from '../src/picker.js';
import { recordKey } from '../src/stats.js';
import { mulberry32 } from '../src/rng.js';
import { SHORT } from '../src/words.js';

const draw = (picker, n) => Array.from({ length: n }, () => picker.next());

test('same seed and stats give the same words', () => {
  const ks = {};
  for (let i = 0; i < 5; i++) recordKey(ks, 'q', false);
  const a = draw(createPicker({ pool: SHORT, rng: mulberry32(42), keyStats: ks }), 30);
  const b = draw(createPicker({ pool: SHORT, rng: mulberry32(42), keyStats: ks }), 30);
  assert.deepEqual(a, b);
  const c = draw(createPicker({ pool: SHORT, rng: mulberry32(43), keyStats: ks }), 30);
  assert.notDeepEqual(a, c);
});

test('words with weak keys come up more often when adaptive', () => {
  const ks = {};
  for (const ch of 'abcdefghijklmnoprstuvwy') for (let i = 0; i < 6; i++) recordKey(ks, ch, true, 200);
  for (let i = 0; i < 8; i++) recordKey(ks, 'z', false);
  const count = (adaptive) => draw(createPicker({ pool: SHORT, rng: mulberry32(5), keyStats: ks, adaptive }), 400)
    .filter((w) => w.includes('z')).length;
  assert.ok(count(true) > count(false) * 1.8, `${count(true)} vs ${count(false)}`);
});

test('a weak-key word scores higher than one without', () => {
  const ks = {};
  for (let i = 0; i < 8; i++) { recordKey(ks, 'z', false); recordKey(ks, 'c', true, 200); recordKey(ks, 'a', true, 200); recordKey(ks, 't', true, 200); recordKey(ks, 'o', true, 200); }
  assert.ok(wordScore('zoo', ks, ['z']) > wordScore('cat', ks, ['z']));
});

test('recent words are not repeated and first letters can be avoided', () => {
  const p = createPicker({ pool: SHORT, rng: mulberry32(9), adaptive: false });
  const seq = draw(p, 11);
  assert.equal(new Set(seq).size, seq.length);
  for (let i = 0; i < 50; i++) {
    const w = p.next(new Set(['a', 'b', 'c']));
    assert.ok(!['a', 'b', 'c'].includes(w[0]), w);
  }
});

test('a tiny pool still works', () => {
  const p = createPicker({ pool: ['f', 'j'], rng: mulberry32(1) });
  const seq = draw(p, 10);
  assert.ok(seq.every((w) => w === 'f' || w === 'j'));
  assert.equal(p.next(new Set(['f', 'j'])).length, 1);
});
