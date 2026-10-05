import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, dailySetup, skirmishSetup, dateKey, labelNodes, maxRivals, LETTERS } from '../src/mapgen.js';
import { WORLD_W, WORLD_H, BUILDINGS } from '../src/data.js';

test('the generator is deterministic', () => {
  for (const kingdoms of [2, 3, 4]) {
    const a = generateMap({ seed: 1234, size: 'large', kingdoms });
    const b = generateMap({ seed: 1234, size: 'large', kingdoms });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, generateMap({ seed: 1235, size: 'large', kingdoms }));
  }
});

test('generated maps are valid for every size and kingdom count', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const kingdoms of [2, 3, 4]) for (const size of ['small', 'medium', 'large']) {
      const m = generateMap({ seed, size, kingdoms });
      assert.ok(m.nodes.length <= LETTERS.length);
      const castles = m.nodes.filter((n) => n.owner);
      assert.equal(castles.length, kingdoms);
      assert.ok(m.nodes.length >= kingdoms * 3, `${seed} ${kingdoms} ${size}: ${m.nodes.length}`);
      for (const n of m.nodes) {
        assert.ok(n.x >= 60 && n.x <= WORLD_W - 60 && n.y >= 60 && n.y <= WORLD_H - 60);
        assert.ok(BUILDINGS[n.type]);
      }
      for (let i = 0; i < m.nodes.length; i++) for (let j = i + 1; j < m.nodes.length; j++) {
        const a = m.nodes[i], b = m.nodes[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 140, `${seed}/${kingdoms}/${size} overlap`);
      }
    }
  }
});

test('two- and four-kingdom maps are exactly symmetric (fair starts)', () => {
  const sig = (nodes, f) => nodes.map((n) => { const p = f(n); return `${p.x},${p.y},${n.type},${n.owner ? 'K' : n.troops}`; }).sort();
  for (let seed = 1; seed <= 10; seed++) {
    const m2 = generateMap({ seed, size: 'large', kingdoms: 2 });
    assert.deepEqual(sig(m2.nodes, (n) => n), sig(m2.nodes, (n) => ({ x: WORLD_W - n.x, y: WORLD_H - n.y })));
    const m4 = generateMap({ seed, size: 'medium', kingdoms: 4 });
    assert.deepEqual(sig(m4.nodes, (n) => n), sig(m4.nodes, (n) => ({ x: WORLD_W - n.x, y: n.y })));
    assert.deepEqual(sig(m4.nodes, (n) => n), sig(m4.nodes, (n) => ({ x: n.x, y: WORLD_H - n.y })));
  }
});

test('ensure puts a new building type on the map', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = generateMap({ seed, size: 'small', types: ['cottage', 'mill', 'tower'], ensure: ['tower'] });
    assert.ok(m.nodes.some((n) => n.type === 'tower'));
  }
});

test('the daily skirmish depends only on the date', () => {
  const a = dailySetup('2026-10-01');
  const b = dailySetup('2026-10-01');
  assert.deepEqual(a, b);
  assert.notEqual(dailySetup('2026-10-02').seed, a.seed);
  assert.equal(a.rivals.length, a.kingdoms - 1);
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('skirmish setup follows its settings', () => {
  const s = skirmishSetup({ seed: 99, size: 'small', rivals: 3, difficulty: 'hard' });
  assert.equal(s.rivals.length, 3);
  assert.ok(s.rivals.every((r) => r.difficulty === 'hard'));
  assert.equal(s.map.kingdoms, 4);
});

test('every building gets a unique letter, skipping the F, H, M and P hotkeys', () => {
  const m = generateMap({ seed: 3, size: 'large', kingdoms: 4 });
  const labels = labelNodes(m.nodes);
  assert.equal(new Set(labels).size, m.nodes.length);
  for (const l of labels) assert.ok(l && !'FHMP'.includes(l));
});

test('every size offered with a rival count makes a bigger island than the size below it', () => {
  const sizes = ['small', 'medium', 'large'];
  assert.deepEqual(sizes.map(maxRivals), [3, 3, 2]);
  for (let rivals = 1; rivals <= 3; rivals++) {
    for (let i = 1; i < sizes.length; i++) {
      if (rivals > maxRivals(sizes[i])) continue;
      for (let seed = 1; seed <= 30; seed++) {
        const smaller = generateMap({ seed, size: sizes[i - 1], kingdoms: rivals + 1 }).nodes.length;
        const bigger = generateMap({ seed, size: sizes[i], kingdoms: rivals + 1 }).nodes.length;
        assert.ok(bigger > smaller, `${sizes[i]} vs ${rivals} rivals, seed ${seed}: ${bigger} <= ${smaller}`);
      }
    }
  }
});

test('a Large skirmish asked for 3 rivals gets 2', () => {
  const s = skirmishSetup({ seed: 9, size: 'large', rivals: 3 });
  assert.equal(s.rivals.length, 2);
  assert.equal(s.map.kingdoms, 3);
  assert.equal(skirmishSetup({ seed: 9, size: 'medium', rivals: 3 }).rivals.length, 3);
});
