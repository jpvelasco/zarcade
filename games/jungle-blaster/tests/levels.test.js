import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, ROOM_H, ROOM_W, STAGES, buildStage, TREASURES } from '../src/levels.js';
import { BOSSES } from '../src/bosses.js';
import { ENEMY } from '../src/enemies.js';
import { reachability } from '../src/reach.js';
import { TILE, isSolid } from '../src/tiles.js';

const LEGAL = new Set(' #=-H~LQT^PKZvcRmfgkjbstp$%*123456'.split(''));

test('every room is exactly 20 × 15 and uses only known characters', () => {
  for (const [name, rows] of Object.entries(ROOMS)) {
    assert.equal(rows.length, ROOM_H, `${name} height`);
    for (const row of rows) {
      assert.equal(row.length, ROOM_W, `${name} row "${row}"`);
      for (const ch of row) assert.ok(LEGAL.has(ch), `${name} has unknown tile "${ch}"`);
    }
    // Every room has bedrock except the bottomless cave chasm.
    if (name !== 'chasm') assert.equal(rows[ROOM_H - 1].split('').every((ch) => ch === '#' || ch === '='), true, `${name} has bedrock`);
  }
});

test('there are six stages, each with a start, checkpoints, a boss arena and a real boss', () => {
  assert.equal(STAGES.length, 6);
  assert.deepEqual(STAGES.map((s) => s.id), ['jungle', 'river', 'caves', 'temple', 'volcano', 'alien']);
  STAGES.forEach((stage, i) => {
    const level = buildStage(i);
    assert.ok(level.start, `${stage.id} start`);
    assert.ok(level.arena, `${stage.id} arena`);
    assert.equal(level.arena.x1, level.width, `${stage.id} arena is the last room`);
    assert.ok(level.checkpoints.length >= 1, `${stage.id} checkpoints`);
    assert.ok(BOSSES[stage.boss], `${stage.id} boss ${stage.boss}`);
    assert.ok(level.treasureTotal >= 2, `${stage.id} has treasure to find`);
    assert.ok(level.cols >= 200, `${stage.id} is a proper length`);
    for (const e of level.enemies) assert.ok(ENEMY[e.kind], `${stage.id} enemy ${e.kind}`);
  });
  assert.equal(new Set(STAGES.map((s) => s.boss)).size, 6, 'six different bosses');
});

test('the boss arena floor is solid wall to wall', () => {
  STAGES.forEach((stage, i) => {
    const level = buildStage(i);
    const row = level.arena.floor / TILE;
    for (let c = level.arena.x0 / TILE; c < level.arena.x1 / TILE; c += 1) {
      assert.ok(isSolid(level.grid[row][c]), `${stage.id} arena floor at column ${c}`);
    }
  });
});

test('every stage is finishable: the boss arena, checkpoints and every treasure are reachable', () => {
  STAGES.forEach((stage, i) => {
    const level = buildStage(i);
    const reach = reachability(level);
    const arenaCol = level.arena.x0 / TILE + 4;
    const arenaRow = level.arena.floor / TILE - 1;
    assert.ok(reach.has(arenaCol, arenaRow), `${stage.id}: boss arena reachable`);
    for (const cp of level.checkpoints) {
      assert.ok(reach.has(cp.col, Math.floor((cp.y - 1) / TILE)), `${stage.id}: checkpoint at column ${cp.col}`);
    }
    for (const item of level.items) {
      const c = Math.floor(item.x / TILE);
      const r = Math.floor(item.y / TILE);
      assert.ok(reach.touchable(c, r), `${stage.id}: ${item.kind} at column ${c}, row ${r}`);
    }
  });
});

test('the reachability check catches a gap that is too wide', () => {
  const level = buildStage(0);
  const broken = { ...level, vines: [] };
  const reach = reachability(broken);
  assert.equal(reach.has(broken.arena.x0 / TILE + 4, broken.arena.floor / TILE - 1), false, 'without vines the jungle cannot be crossed');
});

test('gaps that need help have it: wide gaps get a vine, raft or croc', () => {
  STAGES.forEach((stage, i) => {
    const level = buildStage(i);
    const surface = 10;
    let run = 0;
    for (let c = 0; c <= level.cols; c += 1) {
      const t = c < level.cols ? level.grid[surface][c] : '#';
      if (t === '~' || t === 'L' || t === '^' || t === ' ' || t === 'T') { run += 1; continue; }
      if (run > 4) {
        const x0 = (c - run) * TILE;
        const x1 = c * TILE;
        const helped = level.vines.some((v) => v.ax > x0 && v.ax < x1)
          || level.movers.some((m) => m.x + m.w > x0 && m.x < x1)
          || level.crocs.some((k) => k.x > x0 && k.x < x1);
        assert.ok(helped, `${stage.id}: ${run}-tile gap at column ${c - run} needs a vine, raft or croc`);
      }
      run = 0;
    }
  });
});

test('rafts stay inside the gap they cross', () => {
  STAGES.forEach((stage, i) => {
    const level = buildStage(i);
    for (const m of level.movers.filter((mv) => mv.kind === 'raft')) {
      const row = Math.floor((m.y + 4) / TILE);
      const leftCol = Math.floor((m.x - m.ax) / TILE);
      const rightCol = Math.floor((m.x + m.w + m.ax - 1) / TILE);
      for (let c = leftCol; c <= rightCol; c += 1) assert.ok(!isSolid(level.grid[row][c]), `${stage.id}: raft swings into ground at column ${c}`);
    }
  });
});

test('vines hang in open air with room to swing', () => {
  STAGES.forEach((stage, i) => {
    const level = buildStage(i);
    for (const v of level.vines) {
      for (const angle of [-0.9, 0, 0.9]) {
        for (let s = 8; s <= v.len; s += 8) {
          const x = v.ax + Math.sin(angle) * s;
          const y = v.ay + Math.cos(angle) * s;
          const t = level.grid[Math.floor(y / TILE)][Math.floor(x / TILE)];
          assert.ok(!isSolid(t), `${stage.id}: vine at ${v.ax} hits a wall`);
        }
      }
    }
  });
});

test('treasure values are known and stage building is deterministic', () => {
  const a = buildStage(2);
  const b = buildStage(2);
  assert.deepEqual(a.grid, b.grid);
  assert.deepEqual(a.items, b.items);
  for (const item of a.items) if (TREASURES.has(item.kind)) assert.ok(['gold', 'ring', 'idol'].includes(item.kind));
});
