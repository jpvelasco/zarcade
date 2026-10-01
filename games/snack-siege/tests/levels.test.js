import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVELS_PER_WORLD, dailyLevel, levelLabel } from '../src/levels.js';
import { Game } from '../src/game.js';
import { MATERIALS, BEANS, BEARS, SLING } from '../src/config.js';
import { wake } from '../src/physics.js';

// Wake a level's fort and let it stand for a while: nothing should move,
// break or pop on its own.
export function standStill(level, seconds = 3) {
  const g = new Game(level);
  const start = new Map();
  for (const b of g.bodies) {
    if (b.isStatic) continue;
    wake(b);
    start.set(b.id, [b.x, b.y, b.a]);
  }
  g.phys.collide();
  let worstOverlap = 0;
  for (const m of g.phys.manifolds.values()) {
    for (let i = 0; i < m.count; i++) worstOverlap = Math.min(worstOverlap, m.points[i].sep);
  }
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) g.update();
  let worstMove = 0;
  let worstTurn = 0;
  for (const b of g.bodies) {
    if (b.isStatic) continue;
    const [x, y, a] = start.get(b.id);
    worstMove = Math.max(worstMove, Math.hypot(b.x - x, b.y - y));
    if (b.shape !== 0) worstTurn = Math.max(worstTurn, Math.abs(b.a - a));
  }
  return { g, worstOverlap, worstMove, worstTurn, start };
}

test('three worlds of twelve levels', () => {
  assert.equal(LEVELS.length, 36);
  assert.equal(LEVELS_PER_WORLD, 12);
  LEVELS.forEach((lv, i) => {
    assert.equal(lv.index, i);
    assert.equal(lv.world, Math.floor(i / 12));
    assert.equal(lv.id, levelLabel(i));
  });
});

test('level data is valid', () => {
  for (const lv of LEVELS) {
    assert.ok(lv.name, `${lv.id} has a name`);
    assert.ok(lv.bears.length >= 1, `${lv.id} has bears`);
    assert.ok(lv.beans.length >= 3, `${lv.id} has at least 3 beans`);
    for (const bean of lv.beans) assert.ok(BEANS[bean], `${lv.id} bean ${bean}`);
    for (const p of lv.pieces) {
      assert.ok(MATERIALS[p.mat], `${lv.id} material ${p.mat}`);
      assert.ok(p.x > SLING.x + 8, `${lv.id} piece sits clear of the slingshot`);
      assert.ok(p.x < lv.width, `${lv.id} piece inside the level`);
    }
    for (const br of lv.bears) assert.ok(BEARS[br.size], `${lv.id} bear size`);
    assert.ok(lv.stars[0] < lv.stars[1], `${lv.id} star targets rise`);
    assert.ok(lv.width <= 44, `${lv.id} fits the camera`);
  }
});

test('every bean and material is introduced somewhere in the campaign', () => {
  const beans = new Set(LEVELS.flatMap((l) => l.beans));
  const mats = new Set(LEVELS.flatMap((l) => l.pieces.map((p) => p.mat)));
  for (const b of Object.keys(BEANS)) assert.ok(beans.has(b), b);
  for (const m of Object.keys(MATERIALS)) assert.ok(mats.has(m), m);
});

for (const lv of LEVELS) {
  test(`level ${lv.id} ${lv.name} stands still when woken`, () => {
    const { g, worstOverlap, worstMove, worstTurn } = standStill(lv);
    assert.ok(worstOverlap > -0.02, `pieces overlap by ${(-worstOverlap).toFixed(3)}`);
    assert.ok(worstMove < 0.12, `something moved ${worstMove.toFixed(3)}`);
    assert.ok(worstTurn < 0.06, `something tilted ${worstTurn.toFixed(3)}`);
    assert.equal(g.bearsLeft, lv.bears.length, 'no bear popped by itself');
    assert.equal(g.broken, 0, 'nothing broke by itself');
    assert.equal(g.phys.awakeCount(), 0, 'everything fell back asleep');
  });
}

test('the daily fort is the same all day and changes day to day', () => {
  const a = dailyLevel('2026-10-01');
  const b = dailyLevel('2026-10-01');
  const c = dailyLevel('2026-10-02');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.pieces, c.pieces);
  assert.equal(a.daily, true);
});

test('daily forts are valid and stable across a month of dates', () => {
  for (let d = 1; d <= 30; d++) {
    const key = `2026-11-${String(d).padStart(2, '0')}`;
    const lv = dailyLevel(key);
    assert.ok(lv.bears.length >= 1);
    assert.ok(lv.beans.length >= 3);
    const { worstOverlap, worstMove, g } = standStill(lv, 2.5);
    assert.ok(worstOverlap > -0.02, `${key} overlap ${worstOverlap}`);
    assert.ok(worstMove < 0.12, `${key} moved ${worstMove}`);
    assert.equal(g.broken, 0, `${key} broke by itself`);
  }
});
