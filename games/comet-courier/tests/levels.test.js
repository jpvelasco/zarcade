import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, buildSolved, worldOf, levelLabel, isUnlocked } from '../src/levels.js';
import { LEVEL_COUNT, LEVELS_PER_WORLD, FIELD, STAR } from '../src/config.js';
import { replay } from '../src/solver.js';

test('thirty levels across five worlds of six', () => {
  assert.equal(LEVELS.length, LEVEL_COUNT);
  assert.equal(LEVEL_COUNT, 30);
  for (let w = 0; w < 5; w++) {
    const ls = LEVELS.filter((l) => l.world === w);
    assert.equal(ls.length, LEVELS_PER_WORLD, `world ${w + 1}`);
  }
  assert.equal(levelLabel(0), '1-1');
  assert.equal(levelLabel(5), '1-6');
  assert.equal(levelLabel(6), '2-1');
  assert.equal(levelLabel(29), '5-6');
});

test('every level has a unique name and valid star placement', () => {
  const names = new Set(LEVELS.map((l) => l.name));
  assert.equal(names.size, 30, 'unique names');
  for (const l of LEVELS) {
    assert.ok(l.star.x > STAR.r && l.star.x < FIELD.w - STAR.r, `${l.name}: star in field`);
    assert.ok(l.star.y > STAR.r && l.star.y < FIELD.h - STAR.r, `${l.name}: star in field`);
    assert.ok(l.spawn.x > 0 && l.spawn.x < FIELD.w && l.spawn.y > 0 && l.spawn.y < FIELD.h, `${l.name}: spawn in field`);
  }
});

test('blocks and asteroids stay inside the field', () => {
  for (const l of LEVELS) {
    for (const b of l.blocks) {
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= FIELD.w && b.y + b.h <= FIELD.h, `${l.name}: block in field`);
      assert.ok(b.w > 0 && b.h > 0, `${l.name}: block has size`);
    }
    for (const a of l.asteroids) {
      assert.ok(a.x > a.r && a.y > a.r && a.x < FIELD.w - a.r && a.y < FIELD.h - a.r, `${l.name}: asteroid in field`);
    }
  }
});

test('world 1 is a friendly open star (no cup walls)', () => {
  for (const l of LEVELS.filter((x) => x.world === 0)) {
    // No cup: the star should not be surrounded by four walls.
    const near = l.blocks.filter((b) => Math.abs(b.x + b.w / 2 - l.star.x) < 90 && Math.abs(b.y + b.h / 2 - l.star.y) < 90).length;
    assert.ok(near <= 1, `${l.name}: world 1 stays open (blocks near star: ${near})`);
    assert.ok(l.par >= 1, `${l.name}: par >= 1`);
  }
});

test('cup worlds put the star in a guarded pocket', () => {
  for (const l of LEVELS.filter((x) => x.world > 0)) {
    // The cup = at least 4 wall pieces hugging the star.
    const hugging = l.blocks.filter((b) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const d = Math.hypot(cx - l.star.x, cy - l.star.y);
      return d < 120;
    }).length;
    assert.ok(hugging >= 4, `${l.name}: cup has 4+ walls (found ${hugging})`);
  }
});

test('new mechanics appear gradually and are used', () => {
  const firstAst = LEVELS.findIndex((l) => l.asteroids.length > 0);
  const firstWind = LEVELS.findIndex((l) => l.winds.length > 0);
  const firstSpring = LEVELS.findIndex((l) => l.springs.length > 0);
  const firstPortal = LEVELS.findIndex((l) => l.portals.length > 0);
  assert.equal(firstWind >= 12, true, 'no wind before world 3');
  assert.equal(firstSpring >= 18, true, 'no springs before world 4');
  assert.equal(firstPortal >= 24, true, 'no portals before world 5');
  assert.ok(LEVELS.filter((l) => l.winds.length).length >= 4, 'wind is used');
  assert.ok(LEVELS.filter((l) => l.springs.length).length >= 4, 'springs are used');
  assert.ok(LEVELS.filter((l) => l.portals.length).length >= 4, 'portals are used');
});

test('every shipped level is solvable within its par window', () => {
  for (const l of LEVELS) {
    assert.ok(l.par >= 1 && l.par <= 4, `${l.name}: par in window (${l.par})`);
    assert.ok(Array.isArray(l.line) && l.line.length === l.par, `${l.name}: line length == par`);
    // The solver's own line must actually reach the star in the real sim.
    const trace = replay(l, l.spawn, l.line);
    assert.ok(trace, `${l.name}: solver line replays to the star`);
    assert.equal(trace.length, l.par, `${l.name}: replay length == par`);
    assert.equal(trace[trace.length - 1].star, true, `${l.name}: last shot sinks the star`);
  }
});

test('buildSolved is deterministic for a given index', () => {
  const a = buildSolved(10);
  const b = buildSolved(10);
  assert.deepEqual(a.star, b.star);
  assert.deepEqual(a.blocks, b.blocks);
  assert.equal(a.par, b.par);
  assert.deepEqual(a.spawn, b.spawn);
});

test('isUnlocked gates levels behind progress', () => {
  const save = { unlocked: 5 };
  assert.ok(isUnlocked(save, 5));
  assert.ok(!isUnlocked(save, 6));
  assert.equal(worldOf(0), 0);
  assert.equal(worldOf(30 - 1), 4);
});
