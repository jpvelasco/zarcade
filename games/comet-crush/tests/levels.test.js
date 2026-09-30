import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CONSTELLATIONS, LEGEND, MOVE, LEVELS_PER_CONSTELLATION, parseLevel, isBreakable, levelLabel } from '../src/levels.js';
import { GRID, FIELD, PADDLE } from '../src/config.js';
import { BOSSES } from '../src/boss.js';
import { World } from '../src/world.js';

test('six constellations of five brick levels plus a boss', () => {
  assert.equal(CONSTELLATIONS.length, 6);
  assert.equal(LEVELS.length, 36);
  CONSTELLATIONS.forEach((c, ci) => {
    const ls = LEVELS.filter((l) => l.c === ci);
    assert.equal(ls.length, LEVELS_PER_CONSTELLATION);
    assert.deepEqual(ls.map((l) => !!l.boss), [false, false, false, false, false, true], c.name);
    assert.equal(c.palette.length, 6);
    assert.equal(c.stars.length, 6, 'one star per level');
    for (const [a, b] of c.lines) assert.ok(c.stars[a] && c.stars[b]);
  });
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 36, 'unique names');
  assert.equal(levelLabel(0), '1-1');
  assert.equal(levelLabel(5), '1-★');
});

test('every layout fits the grid and uses only known bricks', () => {
  for (const l of LEVELS) {
    assert.ok(l.rows.length <= GRID.rows, `${l.name}: too many rows`);
    for (const row of l.rows) {
      assert.equal(row.length, GRID.cols, `${l.name}: row "${row}"`);
      for (const ch of row) assert.ok(LEGEND.includes(ch), `${l.name}: unknown "${ch}"`);
    }
    const bottom = GRID.y + l.rows.length * GRID.bh;
    assert.ok(bottom < PADDLE.y - 250, `${l.name}: leaves room to play`);
    assert.ok(GRID.x + GRID.cols * GRID.bw <= FIELD.w);
  }
});

test('every brick level has breakable bricks; every boss exists', () => {
  for (const l of LEVELS) {
    const { cells } = parseLevel(l);
    if (l.boss) assert.ok(BOSSES[l.boss], `${l.name}: boss ${l.boss}`);
    else assert.ok(cells.filter((c) => isBreakable(c.ch)).length >= 20, `${l.name}: enough bricks`);
  }
});

test('portals always come in pairs', () => {
  for (const l of LEVELS) {
    const text = l.rows.join('');
    const a = [...text].filter((c) => c === 'A').length, b = [...text].filter((c) => c === 'B').length;
    assert.ok(a === b && a <= 1, `${l.name}: portals`);
  }
});

test('moving bricks never slide into static bricks or out of the field', () => {
  const reach = Math.ceil(MOVE.amp / GRID.bw);
  for (const l of LEVELS) {
    l.rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch !== '~') return;
        assert.ok(GRID.x + c * GRID.bw - MOVE.amp >= 0 && GRID.x + (c + 1) * GRID.bw + MOVE.amp <= FIELD.w, `${l.name} r${r}c${c}: stays in the field`);
        for (let k = c - reach; k <= c + reach; k++) {
          if (k < 0 || k >= row.length) continue;
          assert.ok(row[k] === '.' || row[k] === '~', `${l.name} r${r}c${c}: collides with "${row[k]}"`);
        }
      });
    });
  }
});

test('new brick types appear gradually', () => {
  const firstUse = (ch) => LEVELS.findIndex((l) => l.rows.join('').includes(ch));
  assert.equal(firstUse('M') >= 6, true, 'no metal in the first constellation');
  assert.equal(firstUse('A') >= 12, true, 'portals start in Crystal Caves');
  assert.ok(!LEVELS[0].rows.join('').match(/[TUMX~AB]/), 'level 1 is plain and friendly');
});

test('worlds build from every level', () => {
  for (const l of LEVELS) {
    const w = new World(l.index);
    assert.equal(w.status, 'playing');
    assert.equal(w.balls.length, 1);
    if (!l.boss) assert.ok(w.remaining() > 0);
    else assert.ok(w.boss && w.boss.hp > 0);
  }
});
