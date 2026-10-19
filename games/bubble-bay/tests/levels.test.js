import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COUNT, AREAS, PER_AREA, getLevel, dailyLevel, dateKeyOf, seedOfKey, buildLevel } from '../src/levels.js';
import { Board, SIZE, VALID, LOSE_ROW, rowOf, MAX_COLORS } from '../src/grid.js';
import { OTTER_COUNT, OTTER_NAMES, otterLook } from '../src/otters.js';
import { autoplay } from '../src/ai.js';

test('65 levels across five seaside areas', () => {
  assert.ok(LEVEL_COUNT >= 60);
  assert.equal(LEVELS.length, LEVEL_COUNT);
  assert.equal(AREAS.length, 5);
  for (const area of AREAS) assert.equal(area.names.length, PER_AREA);
  LEVELS.forEach((level, k) => assert.equal(level.id, k + 1));
  assert.equal(getLevel(0).id, 1);
  assert.equal(getLevel(999).id, LEVEL_COUNT);
});

test('every level is valid: real cells, hanging from the ceiling, clear of the line', () => {
  for (const level of LEVELS) {
    const board = new Board(level.cells.slice());
    for (let i = 0; i < SIZE; i++) if (level.cells[i]) assert.ok(VALID[i], `level ${level.id} cell ${i}`);
    assert.deepEqual(board.floating(), [], `level ${level.id} has floating cells`);
    assert.ok(board.lowestRow() < LOSE_ROW - 3, `level ${level.id} starts too low`);
    assert.ok(board.count() >= 20, `level ${level.id} is tiny`);
  }
});

test('colors: every level uses all of its colors and no others', () => {
  for (const level of LEVELS) {
    const board = new Board(level.cells.slice());
    const present = board.colorsPresent();
    assert.deepEqual(present, Array.from({ length: level.colors }, (_, k) => k), `level ${level.id}`);
    assert.ok(level.colors >= 3 && level.colors <= MAX_COLORS);
  }
});

test('goals match the board', () => {
  for (const level of LEVELS) {
    const cells = level.cells.filter(Boolean);
    const otters = cells.filter((c) => c.k === 'otter').length;
    const anchors = cells.filter((c) => c.k === 'anchor').length;
    const bubbles = cells.filter((c) => c.k !== 'otter' && c.k !== 'anchor').length;
    if (level.goal.type === 'otters') {
      assert.equal(level.goal.need, otters, `level ${level.id}`);
      assert.ok(otters >= 2);
    } else if (level.goal.type === 'anchor') {
      assert.equal(anchors, 1, `level ${level.id}`);
      assert.ok(rowOf(level.anchor) >= 2, 'the anchor never hangs straight off the ceiling');
    } else {
      assert.equal(level.goal.type, 'pop');
      assert.ok(level.goal.need <= bubbles, `level ${level.id} pop goal ${level.goal.need} of ${bubbles}`);
    }
    if (level.goal.type !== 'anchor') assert.equal(anchors, 0);
  }
});

test('levels ease in: specials only after they are introduced', () => {
  const kindsUpTo = (id) => new Set(LEVELS.slice(0, id).flatMap((l) => l.cells.filter(Boolean).map((c) => c.k)));
  assert.ok(!kindsUpTo(5).has('rainbow'));
  assert.ok(!kindsUpTo(13).has('stone'));
  assert.ok(!kindsUpTo(26).has('ice'));
  assert.ok(!kindsUpTo(39).has('bomb'));
  assert.ok(!kindsUpTo(52).has('zap'));
  const all = kindsUpTo(LEVEL_COUNT);
  for (const kind of ['b', 'rainbow', 'stone', 'ice', 'bomb', 'zap', 'otter', 'anchor']) assert.ok(all.has(kind), kind);
  assert.equal(LEVELS[0].goal.type, 'pop');
});

test('every otter in the collection turns up in the levels, each with a name', () => {
  assert.equal(OTTER_NAMES.length, OTTER_COUNT);
  assert.equal(new Set(OTTER_NAMES).size, OTTER_COUNT);
  const seen = new Set();
  for (const level of LEVELS) for (const cell of level.cells) if (cell?.k === 'otter') seen.add(cell.o);
  assert.equal(seen.size, OTTER_COUNT);
  const looks = new Set(Array.from({ length: OTTER_COUNT }, (_, k) => { const l = otterLook(k); return `${l.fur.fur}/${l.accessory}`; }));
  assert.equal(looks.size, OTTER_COUNT, 'every otter looks different');
});

test('levels are deterministic', () => {
  const again = buildLevel({ id: 30, area: 2, within: 3, seed: LEVELS[29].seed, goal: LEVELS[29].goal.type });
  assert.deepEqual(again.cells.map((c) => c && c.k), LEVELS[29].cells.map((c) => c && c.k));
});

test('the daily tide is the same all day and different the next', () => {
  const a = dailyLevel('2026-10-01');
  const b = dailyLevel('2026-10-01');
  const c = dailyLevel('2026-10-02');
  assert.deepEqual(a.cells, b.cells);
  assert.notDeepEqual(a.cells, c.cells);
  assert.equal(dateKeyOf(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  assert.notEqual(seedOfKey('2026-10-01'), seedOfKey('2026-10-02'));
  for (let d = 1; d <= 30; d++) {
    const level = dailyLevel(`2026-11-${String(d).padStart(2, '0')}`);
    const board = new Board(level.cells.slice());
    assert.deepEqual(board.floating(), []);
    assert.ok(board.count() >= 20);
    if (level.goal.type === 'otters') assert.ok(level.goal.need >= 2);
  }
});

test('every daily tide traps different otters', () => {
  for (let d = 1; d <= 120; d++) {
    const date = new Date(2026, 9, d);
    const ids = dailyLevel(dateKeyOf(date)).cells.filter((c) => c?.k === 'otter').map((c) => c.o);
    assert.equal(new Set(ids).size, ids.length, dateKeyOf(date));
  }
});

test('the opening levels are full boards with real work to do', () => {
  const shots = (level) => [1, 2, 3].map((seed) => autoplay(level, { seed }).shots);
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const level of LEVELS.slice(0, 6)) {
    const bubbles = level.cells.filter((c) => c && c.k !== 'otter' && c.k !== 'anchor').length;
    assert.equal(level.rows, 8, `level ${level.id} rows`);
    assert.ok(bubbles >= 55, `level ${level.id} has ${bubbles} bubbles`);
    // the bot is quicker than a person: ~8+ bot shots is a dozen or more moves for a new player
    assert.ok(median(shots(level)) >= 7, `level ${level.id} is over too fast: ${shots(level)}`);
    assert.ok(level.colors <= 4, `level ${level.id} stays gentle on colors`);
  }
  for (const level of LEVELS.slice(6, 8)) assert.equal(level.rows, 8);
  const spread = LEVELS.slice(0, 10).map((l) => median(shots(l)));
  assert.ok(Math.min(...spread) >= 7, `no level in 1-10 under 7 bot shots: ${spread}`);
  // the first levels need no more than a handful of otters or pops
  assert.ok(LEVELS[0].goal.type === 'pop' && LEVELS[0].goal.need >= 60);
  assert.ok(LEVELS[1].goal.need >= 4 && LEVELS[1].goal.need <= 6);
});

test('the opening levels stay easy: cleared first try with spare bubbles', () => {
  for (const level of LEVELS.slice(0, 3)) {
    for (const seed of [1, 2, 3, 4]) {
      const run = autoplay(level, { seed });
      assert.ok(run.won, `level ${level.id} seed ${seed}`);
      assert.ok(run.stars >= 2, `level ${level.id} seed ${seed} stars ${run.stars}`);
      assert.ok(level.supply - run.shots >= 5, `level ${level.id} leaves room for human mistakes`);
    }
  }
});
