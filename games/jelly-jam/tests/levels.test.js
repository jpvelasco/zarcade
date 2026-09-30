import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COUNT, AREAS, getLevel, buildBoard, goalLabel, GOAL_ART } from '../src/levels.js';
import { findMatches, hasMoves, settle } from '../src/board.js';

test('there are at least forty levels, numbered in order across four areas', () => {
  assert.ok(LEVEL_COUNT >= 40, `only ${LEVEL_COUNT} levels`);
  assert.equal(AREAS.length, 4);
  LEVELS.forEach((level, i) => {
    assert.equal(level.id, i + 1);
    assert.ok(level.name.length > 2);
    assert.ok(level.area >= 0 && level.area < AREAS.length, `level ${level.id} is outside the map`);
  });
  assert.equal(AREAS[0].from, 1);
  assert.equal(AREAS[AREAS.length - 1].to, LEVEL_COUNT);
  for (let a = 1; a < AREAS.length; a++) assert.equal(AREAS[a].from, AREAS[a - 1].to + 1);
});

test('every layout is a legal eight by eight reef', () => {
  for (const level of LEVELS) {
    const { layout, id } = level;
    assert.equal(layout.length, 8, `level ${id} is not eight rows`);
    for (const row of layout) {
      assert.equal(row.length, 8, `level ${id} has a ragged row: ${row}`);
      assert.match(row, /^[.#12cCiIo]+$/, `level ${id} uses an unknown tile: ${row}`);
    }
    const tiles = layout.join('').replace(/\./g, '').length;
    assert.ok(tiles >= 40, `level ${id} only has ${tiles} tiles`);
  }
});

test('each column of tiles is unbroken, so jellies can always refill it', () => {
  for (const level of LEVELS) {
    for (let c = 0; c < 8; c++) {
      const column = level.layout.map((row) => row[c] !== '.');
      let seen = 0, open = false;
      for (const tile of column) {
        if (tile && !open) { open = true; seen++; }
        if (!tile) open = false;
      }
      assert.equal(seen, 1, `level ${level.id} column ${c} is split in two`);
    }
  }
});

test('blockers sit where the rules can reach them', () => {
  for (const level of LEVELS) {
    for (let c = 0; c < 8; c++) {
      const column = level.layout.map((row) => row[c]);
      const top = column.findIndex((ch) => ch !== '.');
      assert.notEqual(column[top], 'c', `level ${level.id} has coral on a spawn tile`);
      assert.notEqual(column[top], 'C', `level ${level.id} has coral on a spawn tile`);
      const bottom = 7 - [...column].reverse().findIndex((ch) => ch !== '.');
      assert.notEqual(column[bottom], 'o', `level ${level.id} drops an egg that is already home`);
    }
  }
});

test('blockers never wall off a column: at most two side by side', () => {
  for (const level of LEVELS) {
    for (const row of level.layout) {
      for (const run of row.matchAll(/[cCiI]+/g)) {
        assert.ok(run[0].length <= 2, `level ${level.id} has ${run[0].length} blockers in a row: ${row}`);
        if (run[0].length === 2) {
          assert.ok(run.index > 0 && run.index + 2 < row.length, `level ${level.id} pins blockers to the edge: ${row}`);
        }
      }
    }
  }
});

test('every level refills completely after the floor is wiped out', () => {
  for (const level of LEVELS) {
    const board = buildBoard(level, 3);
    for (const i of board.playableIndices()) {
      const cell = board.at(i);
      if (board.row(i) >= 4 && cell && cell.kind === 'jelly' && cell.ice === 0) board.cells[i] = null;
    }
    settle(board);
    const gaps = board.playableIndices().filter((i) => !board.at(i));
    assert.deepEqual(gaps, [], `level ${level.id} could not refill ${gaps.length} tiles`);
  }
});

test('every goal has a real target and a label', () => {
  for (const level of LEVELS) {
    assert.ok(level.goals.length >= 1 && level.goals.length <= 3, `level ${level.id} goal count`);
    for (const goal of level.goals) {
      assert.ok(goal.need > 0, `level ${level.id} goal ${goal.type} needs nothing`);
      assert.ok(goalLabel(goal).length > 3);
      assert.ok(GOAL_ART[goal.type], `no icon for ${goal.type}`);
    }
    const types = level.goals.map((g) => `${g.type}${g.color ?? ''}`);
    assert.equal(new Set(types).size, types.length, `level ${level.id} repeats a goal`);
  }
});

test('moves and star thresholds are sane and rise within each area', () => {
  for (const level of LEVELS) {
    assert.ok(level.moves >= 18 && level.moves <= 40, `level ${level.id} moves ${level.moves}`);
    assert.ok(level.colors === 5 || level.colors === 6);
    const [a, b, c] = level.stars;
    assert.ok(a > 0 && b > a && c > b, `level ${level.id} stars ${level.stars}`);
    const score = level.goals.find((g) => g.type === 'score');
    if (score) assert.ok(a >= score.need, `level ${level.id} gets a star below its score goal`);
  }
});

test('all four kinds of blocker show up across the map', () => {
  const chars = LEVELS.map((l) => l.layout.join('')).join('');
  for (const ch of ['1', '2', 'c', 'C', 'i', 'I', 'o']) {
    assert.ok(chars.includes(ch), `no level uses "${ch}"`);
  }
  const kinds = new Set(LEVELS.flatMap((l) => l.goals.map((g) => g.type)));
  assert.deepEqual([...kinds].sort(), ['collect', 'coral', 'eggs', 'ice', 'sand', 'score']);
});

test('boards build full, quiet and playable from any seed', () => {
  for (const level of LEVELS) {
    for (const seed of [1, 99]) {
      const board = buildBoard(level, seed);
      assert.equal(findMatches(board).length, 0, `level ${level.id} seed ${seed} starts matched`);
      assert.ok(hasMoves(board), `level ${level.id} seed ${seed} starts dead`);
      assert.ok(board.playableIndices().every((i) => board.at(i)), `level ${level.id} has a gap`);
      const { moves } = settle(board);
      assert.equal(moves.length, 0, `level ${level.id} is not settled`);
    }
  }
});

test('the same level and seed always build the same board', () => {
  const fingerprint = (b) => b.cells.map((c) => (c ? `${c.kind}:${c.color}:${c.ice ?? 0}` : '-')).join('|');
  assert.equal(fingerprint(buildBoard(getLevel(12), 5)), fingerprint(buildBoard(getLevel(12), 5)));
  assert.notEqual(fingerprint(buildBoard(getLevel(12), 5)), fingerprint(buildBoard(getLevel(12), 6)));
  assert.equal(getLevel(0).id, 1, 'out of range level ids clamp');
  assert.equal(getLevel(999).id, LEVEL_COUNT);
});
