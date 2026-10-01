import test from 'node:test';
import assert from 'node:assert/strict';
import { wpm, accuracy, recordKey, weakness, weakKeys, pushHistory, recentWpm, HISTORY_MAX } from '../src/stats.js';

test('wpm uses five characters per word', () => {
  assert.equal(wpm(250, 60), 50);
  assert.equal(wpm(100, 30), 40);
  assert.equal(wpm(10, 0), 0);
});

test('accuracy is correct keys over all keys', () => {
  assert.equal(accuracy(9, 1), 0.9);
  assert.equal(accuracy(0, 0), 1);
});

test('missed keys grow weaker and correct keys recover', () => {
  const ks = {};
  for (let i = 0; i < 6; i++) recordKey(ks, 'k', false);
  for (let i = 0; i < 6; i++) recordKey(ks, 'f', true, 200);
  assert.ok(weakness(ks, 'k') > weakness(ks, 'f'));
  const before = ks.k.e;
  for (let i = 0; i < 10; i++) recordKey(ks, 'k', true, 200);
  assert.ok(ks.k.e < before);
});

test('capitals count toward the base key and spaces are ignored', () => {
  const ks = {};
  recordKey(ks, 'F', false);
  recordKey(ks, ' ', false);
  assert.deepEqual(Object.keys(ks), ['f']);
});

test('slow keys are weaker than fast keys with the same accuracy', () => {
  const ks = {};
  for (let i = 0; i < 8; i++) {
    recordKey(ks, 'a', true, 150);
    recordKey(ks, 's', true, 160);
    recordKey(ks, 'q', true, 600);
  }
  assert.ok(weakness(ks, 'q') > weakness(ks, 'a'));
});

test('weakKeys ranks the most-missed keys first', () => {
  const ks = {};
  for (let i = 0; i < 10; i++) {
    recordKey(ks, 'a', true, 200);
    recordKey(ks, 'z', i % 2 === 0, 200);
    recordKey(ks, 'p', i % 4 === 0, 200);
  }
  assert.deepEqual(weakKeys(ks, 2), ['p', 'z']);
  assert.deepEqual(weakKeys({}), []);
});

test('history keeps the newest runs only', () => {
  const h = [];
  for (let i = 0; i < HISTORY_MAX + 5; i++) pushHistory(h, { d: '2026-10-01', wpm: i, acc: 0.9, stage: 's' });
  assert.equal(h.length, HISTORY_MAX);
  assert.equal(h[h.length - 1].wpm, HISTORY_MAX + 4);
  assert.equal(recentWpm([{ wpm: 10 }, { wpm: 20 }]), 15);
  assert.equal(recentWpm([]), 0);
});
