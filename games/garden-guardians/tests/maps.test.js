import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, AREAS, COLS, ROWS, mapInfo, tracePath, isPathTile, routePos } from '../src/maps.js';

test('there are at least 8 maps across the garden areas', () => {
  assert.ok(MAPS.length >= 8);
  assert.ok(AREAS.length >= 2);
  for (const m of MAPS) assert.ok(AREAS.some((a) => a.id === m.area), m.id);
  assert.equal(new Set(MAPS.map((m) => m.id)).size, MAPS.length);
});

MAPS.forEach((m, i) => {
  test(`map ${m.name} is valid`, () => {
    assert.equal(m.layout.length, ROWS);
    for (const row of m.layout) {
      assert.equal(row.length, COLS);
      assert.match(row, /^[.#ABGtrwf]+$/);
    }
    assert.ok(m.waves >= 12 && m.waves <= 20, 'waves 12–20');
    const info = mapInfo(i);
    assert.ok(info.spawns.length >= 1);
    // every spawn is on the board edge and connects to the picnic
    for (const [k, s] of info.spawns.entries()) {
      assert.ok(s.x === 0 || s.y === 0 || s.x === COLS - 1 || s.y === ROWS - 1, 'spawn on edge');
      const cells = tracePath(m, s, info.goal);
      assert.ok(cells, 'path connected');
      assert.deepEqual(cells.at(-1), info.goal);
      for (let j = 1; j < cells.length; j++) {
        assert.equal(Math.abs(cells[j].x - cells[j - 1].x) + Math.abs(cells[j].y - cells[j - 1].y), 1);
      }
      const end = routePos(info.routes[k], info.routes[k].length);
      assert.deepEqual({ x: end.x, y: end.y }, { x: info.goal.x + 0.5, y: info.goal.y + 0.5 });
      assert.ok(info.routes[k].length >= 12, 'route long enough');
    }
    // no stray or looping path tiles: every path tile is on a traced route
    const used = new Set(info.cellPaths.flat().map((c) => `${c.x},${c.y}`));
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (isPathTile(m.layout[y][x])) assert.ok(used.has(`${x},${y}`), `unused path tile ${x},${y}`);
    }
    assert.ok(info.buildable.length >= 60, 'plenty of grass to plant on');
    // grass next to the path exists so defenders can reach it
    const nearPath = info.buildable.filter((t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => used.has(`${t.x + dx},${t.y + dy}`)));
    assert.ok(nearPath.length >= 12);
  });
});

test('routePos walks along corners', () => {
  const info = mapInfo(0);
  const r = info.routes[0];
  const a = routePos(r, 0), b = routePos(r, r.length / 2);
  assert.ok(a.x < 0.6, 'starts off the left edge');
  assert.ok(b.x >= 0 && b.x <= COLS && b.y >= 0 && b.y <= ROWS);
});
