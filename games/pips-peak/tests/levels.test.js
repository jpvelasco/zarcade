import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, ZONES, abilitiesFor, findLevel, levelsByZone } from '../src/levels.js';
import { LEGEND } from '../src/tiles.js';
import { reachable } from '../src/reach.js';

const count = (level, ch) => level.tiles.join('').split(ch).length - 1;

test('there are at least twelve levels spread over four zones', () => {
  assert.ok(LEVELS.length >= 12, `only ${LEVELS.length} levels`);
  assert.equal(ZONES.length, 4);
  for (const group of levelsByZone()) {
    assert.ok(group.levels.length >= 3, `${group.zone.id} needs at least three levels`);
  }
  const zones = LEVELS.map((level) => level.zone);
  assert.deepEqual(zones, [...zones].sort((a, b) => a - b), 'levels climb zone by zone');
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, LEVELS.length, 'ids are unique');
});

test('every grid is rectangular and only uses known tiles', () => {
  for (const level of LEVELS) {
    const width = level.tiles[0].length;
    assert.ok(width >= 24, `${level.id} is too narrow`);
    assert.ok(level.tiles.length >= 14, `${level.id} is too short`);
    for (const [index, row] of level.tiles.entries()) {
      assert.equal(row.length, width, `${level.id} row ${index} is ragged`);
      for (const ch of row) {
        assert.ok(ch in LEGEND, `${level.id} row ${index} has an unknown tile '${ch}'`);
      }
    }
  }
});

test('every level has one start, one sunrise, flowers, seeds and three acorns', () => {
  for (const level of LEVELS) {
    assert.equal(count(level, 'S'), 1, `${level.id} start`);
    assert.equal(count(level, 'G'), 1, `${level.id} goal`);
    assert.equal(count(level, '@'), 3, `${level.id} acorns`);
    assert.ok(count(level, 'f') >= 1, `${level.id} checkpoints`);
    assert.ok(count(level, 'o') >= 12, `${level.id} seeds: ${count(level, 'o')}`);
    assert.ok(level.name && level.hint, `${level.id} needs a name and a hint`);
    assert.ok(level.zone >= 0 && level.zone < ZONES.length, `${level.id} zone`);
  }
});

test('hints that name keys have a touch version that names the on-screen buttons', () => {
  const keyWords = /\b(Arrows?|A\/D|Space|Down|Up|keys?)\b/;
  for (const level of LEVELS) {
    if (!keyWords.test(level.hint)) continue;
    assert.ok(level.touchHint, `${level.id} needs a touchHint`);
    assert.doesNotMatch(level.touchHint, keyWords, `${level.id} touchHint still names keys`);
  }
});

test('the start is on solid footing and the sunrise is not buried', () => {
  for (const level of LEVELS) {
    const rows = level.tiles;
    const find = (ch) => {
      for (let r = 0; r < rows.length; r += 1) {
        const c = rows[r].indexOf(ch);
        if (c >= 0) return { r, c };
      }
      return null;
    };
    const start = find('S');
    const below = rows[start.r + 1]?.[start.c];
    assert.ok('#I-CM'.includes(below), `${level.id} start floats above '${below}'`);
    const goal = find('G');
    assert.ok(goal.r >= 0 && goal.r < rows.length - 1, `${level.id} goal placement`);
  }
});

test('abilities arrive zone by zone and never disappear', () => {
  let doubleJump = false;
  let wallJump = false;
  for (const zone of ZONES) {
    doubleJump = doubleJump || zone.abilities.doubleJump;
    wallJump = wallJump || zone.abilities.wallJump;
    assert.equal(zone.abilities.doubleJump, doubleJump, `${zone.id} keeps the second jump`);
    assert.equal(zone.abilities.wallJump, wallJump, `${zone.id} keeps the wall kick`);
  }
  assert.equal(abilitiesFor(LEVELS[0]).doubleJump, false, 'the meadow teaches the basics first');
  assert.equal(abilitiesFor(LEVELS[LEVELS.length - 1]).wallJump, true, 'the summit has everything');
});

test('movers and wind stay inside their level', () => {
  for (const level of LEVELS) {
    const width = level.tiles[0].length;
    const height = level.tiles.length;
    for (const mover of level.movers || []) {
      assert.ok(mover.x >= 0 && mover.x + (mover.dx || 0) + (mover.w || 2) <= width, `${level.id} mover x`);
      assert.ok(mover.y >= 0 && mover.y + (mover.dy || 0) >= 0, `${level.id} mover y`);
      assert.ok(mover.y <= height, `${level.id} mover y`);
      assert.ok(mover.speed > 0, `${level.id} mover speed`);
    }
    for (const wind of level.winds || []) {
      assert.ok(wind.x >= 0 && wind.x + wind.w <= width, `${level.id} wind x`);
      assert.ok(wind.y >= 0 && wind.y + wind.h <= height, `${level.id} wind y`);
    }
  }
});

test('gates always have latches, and the latches come before the gates', () => {
  for (const level of LEVELS) {
    const gates = count(level, 'D');
    const latches = count(level, '!');
    if (gates > 0) assert.ok(latches > 0, `${level.id} has a gate with no latch`);
    if (latches > 0) assert.ok(gates > 0, `${level.id} has a latch with no gate`);
    if (!latches) continue;
    // With the gates shut, Pip must still be able to press every latch.
    const closed = reachable(level, { gatesOpen: false });
    assert.deepEqual(closed.missing, [], `${level.id} latches are walled off`);
  }
});

test('every flower, seed, acorn and sunrise can actually be reached', () => {
  for (const level of LEVELS) {
    const result = reachable(level);
    assert.ok(result.start, `${level.id} has no start`);
    assert.deepEqual(result.missing, [], `${level.id}: ${result.missing.join(', ')}`);
  }
});

test('levels can be looked up by number or id', () => {
  assert.equal(findLevel(1), LEVELS[0]);
  assert.equal(findLevel(LEVELS[3].id), LEVELS[3]);
  assert.equal(findLevel(999), null);
  assert.equal(findLevel('nope'), null);
});
