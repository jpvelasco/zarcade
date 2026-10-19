import test from 'node:test';
import assert from 'node:assert/strict';
import { stepFocus, tabOrder, nearestKey } from '../src/focus.js';

// Three bottom-row cards, one card higher up, and the stock below.
const items = [
  { key: 3, x: 100, y: 300 },
  { key: 1, x: 40, y: 300 },
  { key: 7, x: 160, y: 300 },
  { key: 9, x: 130, y: 200 },
  { key: 'stock', x: 80, y: 500 },
];

test('Tab order runs through the cards left to right, then the stock, and wraps', () => {
  assert.deepEqual(tabOrder(items).map((i) => i.key), [1, 3, 9, 7, 'stock']);
  assert.equal(stepFocus(items, 7, 'next'), 'stock');
  assert.equal(stepFocus(items, 'stock', 'next'), 1);
  assert.equal(stepFocus(items, 1, 'prev'), 'stock');
  assert.equal(stepFocus(items, null, 'next'), 1, 'no focus yet: start at the left');
  assert.equal(stepFocus(items, 'gone', 'right'), 1);
});

test('arrows move to the nearest item that way', () => {
  assert.equal(stepFocus(items, 3, 'right'), 7, 'same row beats a card up and over');
  assert.equal(stepFocus(items, 9, 'right'), 7);
  assert.equal(stepFocus(items, 3, 'left'), 1);
  assert.equal(stepFocus(items, 3, 'down'), 'stock');
  assert.equal(stepFocus(items, 3, 'up'), 9);
  assert.equal(stepFocus(items, 9, 'up'), 9, 'nothing above: stay');
});

test('left and right wrap when nothing lies that way', () => {
  assert.equal(stepFocus(items, 7, 'right'), 1);
  assert.equal(stepFocus(items, 1, 'left'), 7);
});

test('empty lists and the nearest item after a move', () => {
  assert.equal(stepFocus([], 1, 'next'), null);
  assert.equal(nearestKey(items, 150, 290), 7);
  assert.equal(nearestKey([], 0, 0), null);
});
