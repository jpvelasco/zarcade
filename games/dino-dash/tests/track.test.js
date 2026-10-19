import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, isFull, isPassable } from '../src/track.js';
import { OBSTACLES, MIN_GAP_TIME, START_CLEAR, speedAt } from '../src/config.js';
import { THEMES } from '../src/daily.js';

const THEME_IDS = THEMES.map((t) => t.id);

function build(seed, theme, to = 6000) {
  const t = new Track(seed, { theme });
  t.fill(to);
  return t;
}

test('same seed and theme build the same track', () => {
  const a = build(42, 'mixed', 3000);
  const b = build(42, 'mixed', 3000);
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual(a.coins, b.coins);
  assert.deepEqual(a.powers, b.powers);
  const c = build(43, 'mixed', 3000);
  assert.notDeepEqual(a.rows.map((r) => r.cells), c.rows.map((r) => r.cells));
});

test('every row leaves a passable lane and never closes all three', () => {
  for (const theme of THEME_IDS) {
    for (let seed = 1; seed <= 12; seed++) {
      const t = build(seed, theme);
      for (const r of t.rows) {
        assert.ok(r.cells.some(isPassable), `${theme}/${seed} row at ${r.z.toFixed(1)}: ${r.cells}`);
        assert.ok(r.cells.filter(isFull).length <= 2);
        // A middle hedge can't be crossed, so both sides must stay passable.
        if (r.cells[1] === 'hedge') {
          for (const i of [0, 2]) assert.ok(r.cells[i] === 'hedge' || isPassable(r.cells[i]), `${theme}/${seed} split at ${r.z}`);
        }
      }
    }
  }
});

test('rows are far enough apart for the speed you run there', () => {
  for (const theme of THEME_IDS) {
    for (let seed = 1; seed <= 8; seed++) {
      const t = build(seed, theme);
      assert.ok(t.rows[0].z >= START_CLEAR);
      for (let i = 1; i < t.rows.length; i++) {
        const gap = t.rows[i].z - t.rows[i - 1].z;
        const v = speedAt(t.rows[i].z);
        assert.ok(gap / v >= MIN_GAP_TIME - 1e-6, `${theme}/${seed}: ${gap.toFixed(2)} m at ${v.toFixed(1)} m/s`);
        if (t.rows[i].z < 300) assert.ok(gap / v >= 1.05);
      }
    }
  }
});

test('hedges never cover all three lanes at once', () => {
  for (const theme of ['hedge', 'mixed']) {
    for (let seed = 1; seed <= 12; seed++) {
      const t = build(seed, theme);
      const hedges = t.items.filter((i) => i.kind === 'hedge');
      for (const h of hedges) {
        for (let z = h.z; z < h.z + h.len; z += 1) {
          const lanes = new Set(hedges.filter((o) => o.z <= z && o.z + o.len > z).map((o) => o.lane));
          assert.ok(lanes.size <= 2, `${theme}/${seed}: all lanes hedged at ${z}`);
        }
      }
    }
  }
});

test('amber never sits inside an obstacle', () => {
  for (const theme of THEME_IDS) {
    for (let seed = 1; seed <= 6; seed++) {
      const t = build(seed, theme, 4000);
      for (const c of t.coins) {
        for (const it of t.items) {
          if (it.lane !== c.lane) continue;
          const o = OBSTACLES[it.kind];
          if (c.z < it.z - 0.3 || c.z > it.z + it.len + 0.3) continue;
          const clear = c.y > o.top + 0.2 || c.y < o.bottom - 0.3;
          assert.ok(clear, `${theme}/${seed}: amber at ${c.z.toFixed(1)} y ${c.y.toFixed(2)} inside ${it.kind}`);
        }
      }
    }
  }
});

test('power-ups turn up regularly and are all three kinds', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 6; seed++) {
    const t = build(seed, 'mixed', 5000);
    assert.ok(t.powers.length >= 9 && t.powers.length <= 20, `${t.powers.length} power-ups`);
    for (const p of t.powers) kinds.add(p.kind);
  }
  assert.deepEqual([...kinds].sort(), ['glide', 'magnet', 'shield']);
});

test('the opening stays gentle: no pterodactyls or geysers before 150 m', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t = build(seed, 'mixed', 400);
    for (const it of t.items) {
      if (it.z < 150) assert.ok(it.kind !== 'ptero' && it.kind !== 'geyser', `${it.kind} at ${it.z}`);
    }
  }
});

test('themes lean on their obstacle', () => {
  const count = (theme, kind) => build(7, theme, 4000).items.filter((i) => i.kind === kind).length;
  assert.ok(count('logjam', 'log') > count('mixed', 'log'));
  assert.ok(count('ptero', 'ptero') > count('mixed', 'ptero'));
  assert.ok(count('geyser', 'geyser') > count('mixed', 'geyser'));
  assert.ok(count('hedge', 'hedge') > count('mixed', 'hedge'));
  const coins = (theme) => build(7, theme, 4000).coins.length;
  assert.ok(coins('amber') > coins('mixed'));
});

test('clearing the path removes obstacles and trims hedges', () => {
  const t = build(3, 'hedge', 2000);
  t.clear(500, 540);
  for (const it of t.items) {
    if (it.gone) continue;
    assert.ok(it.z + it.len < 500 || it.z >= 540 - 1e-9, `${it.kind} left at ${it.z}`);
  }
});

test('pruning keeps the track small on long runs', () => {
  const t = new Track(9);
  for (let d = 0; d < 20000; d += 50) {
    t.fill(d + 150);
    t.prune(d);
  }
  assert.ok(t.items.length < 200, `${t.items.length} items`);
  assert.ok(t.coins.length < 400, `${t.coins.length} coins`);
});
