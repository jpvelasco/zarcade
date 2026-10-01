import test from 'node:test';
import assert from 'node:assert/strict';
import { getLevel, buildLevel, LEVEL_COUNT, BASES, ZONES, LEVELS_PER_ZONE, TARGET_RANGE, zoneOf, boardCells } from '../src/levels.js';
import { validateCrossword, buildCrossword, letterGrid, cellsOf } from '../src/crossword.js';
import { TARGETS, WORDS, canSpell, glossFor } from '../src/words.js';
import { Rng } from '../src/rng.js';
import { isBlocked } from './blocklist.js';

const levels = Array.from({ length: LEVEL_COUNT }, (_, i) => getLevel(i + 1));

test('there are 80+ levels across the zones, ten per zone', () => {
  assert.ok(LEVEL_COUNT >= 80);
  assert.equal(LEVEL_COUNT, ZONES.length * LEVELS_PER_ZONE);
  assert.equal(new Set(BASES.map((b) => [...b].sort().join(''))).size, BASES.length, 'no two levels share a wheel');
  assert.equal(zoneOf(1), 0);
  assert.equal(zoneOf(LEVEL_COUNT), ZONES.length - 1);
});

test('wheel sizes grow gently from 3 to 7 letters', () => {
  assert.equal(levels[0].letters.length, 3);
  assert.equal(levels.at(-1).letters.length, 7);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].letters.length >= levels[i - 1].letters.length, `level ${i + 1} is not shorter than ${i}`);
  }
  const sizes = new Set(levels.map((l) => l.letters.length));
  assert.deepEqual([...sizes].sort(), [3, 4, 5, 6, 7]);
});

for (const level of levels) {
  test(`level ${level.id} (${level.base}) is a valid, spellable crossword`, () => {
    const words = level.targets.map((t) => t.word);
    const [minT, maxT] = TARGET_RANGE[level.letters.length];
    assert.ok(words.length >= minT && words.length <= maxT, `${words.length} targets`);
    assert.equal(new Set(words).size, words.length, 'no duplicate targets');
    assert.ok(words.includes(level.base), 'the full-wheel word is on the board');
    assert.deepEqual([...level.letters].sort(), [...level.base].sort(), 'the wheel holds the base letters');
    for (const t of level.targets) {
      assert.ok(TARGETS.has(t.word), `${t.word} is a target word`);
      assert.ok(canSpell(t.word, level.letters.join('')), `${t.word} is spellable`);
      assert.ok(t.gloss && t.gloss === glossFor(t.word), `${t.word} has a gloss`);
      assert.equal(isBlocked(t.word), false);
    }
    assert.deepEqual(validateCrossword({ rows: level.rows, cols: level.cols, placements: level.targets }), []);
    assert.ok(level.rows <= 9 && level.cols <= 10, `${level.rows}x${level.cols} fits a phone`);
    for (const word of level.bonus) {
      assert.ok(WORDS.has(word) && !words.includes(word) && canSpell(word, level.base), word);
    }
    if (level.letters.length > 3) assert.ok(!words.includes(level.letters.join('')), 'the wheel does not spell a target');
    assert.equal(level.traps.length, level.targets.length, 'one trapped critter per answer');
    for (const id of level.traps) assert.ok(ZONES[level.zone].critters.includes(id));
  });
}

test('levels are deterministic', () => {
  for (const id of [1, 17, 45, 90]) {
    const a = getLevel(id);
    const b = buildLevel(a.base, { seed: a.seed, id, zone: a.zone });
    assert.deepEqual(b, a);
  }
});

test('board cells map every letter to one spot', () => {
  const level = getLevel(30);
  const cells = boardCells(level);
  const grid = letterGrid({ rows: level.rows, cols: level.cols, placements: level.targets });
  let filled = 0;
  for (const row of grid) for (const ch of row) if (ch) filled++;
  assert.equal(cells.size, filled);
});

test('the validator rejects broken boards', () => {
  const ok = { rows: 3, cols: 3, placements: [{ word: 'cat', row: 0, col: 0, dir: 'across' }, { word: 'cab', row: 0, col: 0, dir: 'down' }] };
  assert.deepEqual(validateCrossword(ok), []);
  const clash = { rows: 3, cols: 3, placements: [{ word: 'cat', row: 0, col: 0, dir: 'across' }, { word: 'dog', row: 0, col: 0, dir: 'down' }] };
  assert.ok(validateCrossword(clash).some((p) => p.includes('clashes')));
  const apart = { rows: 3, cols: 3, placements: [{ word: 'cat', row: 0, col: 0, dir: 'across' }, { word: 'dog', row: 2, col: 0, dir: 'across' }] };
  assert.ok(validateCrossword(apart).some((p) => p.includes('not connected')));
  const touching = { rows: 2, cols: 3, placements: [{ word: 'cat', row: 0, col: 0, dir: 'across' }, { word: 'dog', row: 1, col: 0, dir: 'across' }] };
  assert.ok(validateCrossword(touching).some((p) => p.includes('stray')));
  const dup = { rows: 3, cols: 3, placements: [{ word: 'cat', row: 0, col: 0, dir: 'across' }, { word: 'cat', row: 0, col: 0, dir: 'down' }] };
  assert.ok(validateCrossword(dup).some((p) => p.includes('duplicate')));
});

test('the builder only places crossing words and respects size limits', () => {
  const board = buildCrossword(['stone', 'notes', 'nest', 'toes', 'zzz'], new Rng(3), { maxRows: 6, maxCols: 6 });
  assert.ok(board.skipped.includes('zzz'));
  assert.deepEqual(validateCrossword(board), []);
  assert.ok(board.rows <= 6 && board.cols <= 6);
  for (const p of board.placements) assert.ok(cellsOf(p).length === p.word.length);
});
