import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, choices, generateMap, validateMap } from '../src/map.js';

const seeds = Array.from({ length: 120 }, (_, i) => i * 2654435761 + 7);

test('every map is connected with no dead ends', () => {
  for (const seed of seeds) {
    for (let floor = 0; floor < 3; floor++) {
      const map = generateMap(seed, floor);
      assert.deepEqual(validateMap(map), [], `seed ${seed} floor ${floor}`);
      assert.ok(choices(map, null).length >= 2, 'at least two starting pages');
    }
  }
});

test('room rules: battles first, treasure in the middle, rest before the boss, a shop somewhere', () => {
  for (const seed of seeds) {
    const map = generateMap(seed, 1);
    const nodes = Object.values(map.nodes);
    assert.equal(nodes.filter((n) => n.type === 'boss').length, 1);
    for (const n of nodes) {
      if (n.type === 'boss') continue;
      assert.ok(n.col >= 0 && n.col < COLS && n.row >= 0 && n.row < ROWS);
      if (n.row === 0) assert.equal(n.type, 'battle');
      if (n.row === 3) assert.equal(n.type, 'treasure');
      if (n.row === ROWS - 1) assert.equal(n.type, 'rest');
      if (n.type === 'elite') assert.ok(n.row >= 2, 'no early elites');
      for (const p of n.prev) {
        const prev = map.nodes[p];
        if (['elite', 'shop', 'rest'].includes(n.type)) assert.notEqual(prev.type, n.type, `${n.type} after ${prev.type}`);
      }
    }
    assert.ok(nodes.some((n) => n.type === 'shop'), `seed ${seed} has a shop`);
  }
});

test('paths never cross', () => {
  for (const seed of seeds) {
    const map = generateMap(seed, 0);
    const edges = [];
    for (const n of Object.values(map.nodes)) for (const id of n.next) if (id !== 'boss') edges.push([n.row, n.col, map.nodes[id].col]);
    for (const [r, a, b] of edges) {
      for (const [r2, a2, b2] of edges) {
        if (r !== r2) continue;
        assert.ok(!((a < a2 && b > b2) || (a > a2 && b < b2)), `crossing on row ${r} seed ${seed}`);
      }
    }
  }
});

test('maps are deterministic per seed and floor', () => {
  assert.deepEqual(generateMap(77, 2), generateMap(77, 2));
  assert.notDeepEqual(generateMap(77, 0), generateMap(77, 1));
});
