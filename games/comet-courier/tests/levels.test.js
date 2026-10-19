import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, buildLevel, mirrorLevel, worldOf, levelLabel, isUnlocked, spotBlocked } from '../src/levels.js';
import { LEVEL_COUNT, LEVELS_PER_WORLD, FIELD, STAR, COMET, LETTER } from '../src/config.js';
import { replay, solve } from '../src/solver.js';
import { allLetters } from '../src/sim.js';

test('thirty authored levels across five worlds of six', () => {
  assert.equal(LEVELS.length, LEVEL_COUNT);
  assert.equal(LEVEL_COUNT, 30);
  for (let w = 0; w < 5; w++) {
    assert.equal(LEVELS.filter((l) => l.world === w).length, LEVELS_PER_WORLD, `world ${w + 1}`);
  }
  assert.equal(levelLabel(0), '1-1');
  assert.equal(levelLabel(5), '1-6');
  assert.equal(levelLabel(6), '2-1');
  assert.equal(levelLabel(29), '5-6');
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 30, 'unique names');
  for (const l of LEVELS) assert.ok(l.note && l.note.length > 10, `${l.name}: has a design note`);
});

test('no panel is empty: every level is built from real geometry', () => {
  for (const l of LEVELS) {
    const pieces = l.blocks.length + l.asteroids.length + l.winds.length + l.springs.length + l.portals.length + l.wells.length;
    assert.ok(pieces >= 1, `${l.name}: has something in it`);
    assert.ok(l.letters.length >= 1 && l.letters.length <= 3, `${l.name}: 1-3 letters (${l.letters.length})`);
  }
  // World 1 is where a new player starts, so it must not be a bare box either.
  for (const l of LEVELS.filter((x) => x.world === 0)) {
    assert.ok(l.blocks.length + l.asteroids.length >= 1, `${l.name}: world 1 still has obstacles`);
  }
});

test('walls, rocks and zones stay inside the field and have real size', () => {
  for (const l of LEVELS) {
    for (const b of l.blocks) {
      assert.ok(b.w > 0 && b.h > 0, `${l.name}: wall has size`);
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= FIELD.w && b.y + b.h <= FIELD.h, `${l.name}: wall in field`);
    }
    for (const a of l.asteroids) {
      assert.ok(a.r > 0, `${l.name}: rock has size`);
      assert.ok(a.x > a.r && a.y > a.r && a.x < FIELD.w - a.r && a.y < FIELD.h - a.r, `${l.name}: rock in field`);
    }
    for (const w of l.wells) {
      assert.ok(w.r > 20 && w.g > 0, `${l.name}: well has a rim and a pull`);
    }
    for (const z of [...l.winds, ...l.springs]) {
      assert.ok(z.w > 0 && z.h > 0, `${l.name}: zone has size`);
      assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= FIELD.w && z.y + z.h <= FIELD.h, `${l.name}: zone in field`);
    }
  }
});

test('nothing the player needs is buried in a wall', () => {
  for (const l of LEVELS) {
    assert.ok(!spotBlocked(l, l.spawn.x, l.spawn.y, COMET.r + 4), `${l.name}: spawn is clear`);
    assert.ok(!spotBlocked(l, l.star.x, l.star.y, STAR.r), `${l.name}: star is clear`);
    l.letters.forEach((p, i) => {
      assert.ok(!spotBlocked(l, p.x, p.y, COMET.r + 2), `${l.name}: letter ${i} is reachable`);
      assert.ok(Math.hypot(p.x - l.star.x, p.y - l.star.y) > STAR.r + LETTER.pick, `${l.name}: letter ${i} is not on the star`);
      assert.ok(Math.hypot(p.x - l.spawn.x, p.y - l.spawn.y) > LETTER.pick, `${l.name}: letter ${i} is not a freebie at the spawn`);
    });
  }
});

test('mechanics arrive one world at a time and all get used', () => {
  const firstWith = (key) => LEVELS.findIndex((l) => l[key].length > 0);
  assert.ok(firstWith('winds') >= 2 * LEVELS_PER_WORLD, 'no wind before world 3');
  assert.ok(firstWith('springs') >= 3 * LEVELS_PER_WORLD, 'no spring pads before world 4');
  assert.ok(firstWith('wells') >= 4 * LEVELS_PER_WORLD, 'no gravity wells before world 5');
  assert.ok(firstWith('portals') >= 4 * LEVELS_PER_WORLD, 'no portals before world 5');
  // World 1 teaches with walls and a single rock, nothing more exotic.
  for (const l of LEVELS.filter((x) => x.world === 0)) {
    assert.equal(l.winds.length + l.springs.length + l.portals.length + l.wells.length, 0, `${l.name}: world 1 stays simple`);
  }
  for (const key of ['asteroids', 'winds', 'springs', 'portals', 'wells']) {
    assert.ok(LEVELS.filter((l) => l[key].length).length >= 3, `${key} is used in at least three levels`);
  }
});

test('par is 2 to 4, gentle in world 1 and never trivial afterwards', () => {
  for (const l of LEVELS) {
    assert.ok(l.par >= 2 && l.par <= 4, `${l.name}: par ${l.par} in 2..4`);
    assert.equal(l.line.length, l.par, `${l.name}: line length == par`);
    if (l.world > 0) assert.ok(l.par >= 3, `${l.name}: past the tutorial, par is 3 or more`);
  }
  // The point of the overhaul: most routes are more than a two-launch job.
  assert.ok(LEVELS.filter((l) => l.par >= 3).length >= 25, 'at least 25 routes need three launches or more');
  assert.ok(LEVELS.filter((l) => l.par === 4).length >= 6, 'and a good handful need four');
});

test("every shipped line delivers a full satchel in exactly the level's par", () => {
  for (const l of LEVELS) {
    const trace = replay(l, l.spawn, l.line);
    assert.ok(trace, `${l.name}: the shipped line delivers`);
    assert.equal(trace.length, l.par, `${l.name}: in par launches`);
    assert.equal(trace.at(-1).star, true, `${l.name}: the last launch sinks the star`);
    assert.equal(trace.at(-1).letters, allLetters(l), `${l.name}: with every letter aboard`);
    for (const t of trace.slice(0, -1)) assert.equal(t.star, false, `${l.name}: only the last launch delivers`);
  }
});

test('no level can be finished in fewer launches than its par', () => {
  // The shipped line proves par is reachable; this proves it is also the floor.
  // Searching only to depth par-2 is the cheap half of a full solve: it asks
  // "is there anything shorter?" and must come back with nothing.
  for (const l of LEVELS) {
    const stats = {};
    const better = solve(l, l.spawn, { maxDepth: l.par - 2, stats });
    assert.equal(better, null, `${l.name}: par ${l.par} cannot be beaten`);
    assert.equal(stats.capped, false, `${l.name}: the search finished rather than running out of budget`);
  }
});

test('buildLevel is pure: the same index always builds the same panel', () => {
  for (const i of [0, 7, 15, 23, 29]) {
    assert.deepEqual(buildLevel(i), buildLevel(i), `level ${i + 1} is stable`);
  }
});

test('all four mirrorings of every route still deliver (the Daily uses them)', () => {
  for (const l of LEVELS) {
    for (const [fx, fy] of [[false, false], [true, false], [false, true], [true, true]]) {
      const m = mirrorLevel(l, fx, fy);
      assert.equal(m.par, l.par, `${l.name} ${fx}/${fy}: par survives the mirror`);
      const trace = replay(m, m.spawn, m.line);
      assert.ok(trace, `${l.name} mirrored ${fx}/${fy}: still delivers`);
      assert.equal(trace.length, l.par, `${l.name} mirrored ${fx}/${fy}: in par launches`);
      assert.equal(trace.at(-1).letters, allLetters(m), `${l.name} mirrored ${fx}/${fy}: full satchel`);
      // Geometry stays inside the panel after mirroring.
      for (const b of m.blocks) {
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= FIELD.w && b.y + b.h <= FIELD.h, `${l.name} mirrored: wall in field`);
      }
    }
  }
});

test('isUnlocked gates levels behind progress', () => {
  const save = { unlocked: 5 };
  assert.ok(isUnlocked(save, 5));
  assert.ok(!isUnlocked(save, 6));
  assert.equal(worldOf(0), 0);
  assert.equal(worldOf(LEVEL_COUNT - 1), 4);
});
