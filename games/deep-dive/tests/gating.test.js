import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, UPGRADE_ORDER, upgradesAfter } from '../src/areas.js';
import { buildMap, WATER, CELL } from '../src/map.js';
import { AREA_STAGE, reach, reachAtStage, homeCell, blockReason, currentAt, findPath } from '../src/gating.js';
import { placeCreatures, SPECIES } from '../src/creatures.js';
import { SONAR_R } from '../src/world.js';

const map = buildMap();
const idx = (o) => o.y * map.cols + o.x;
// The strictest check: squeeze diagonally through any water cell at all.
const strict = (stage) => reach(map, upgradesAfter(stage), homeCell(map), { clear: false, diagonal: true });

test('the home dock is roomy and reachable with no parts', () => {
  assert.ok(reachAtStage(map, 0)[idx(homeCell(map))]);
});

test('each part is reachable with the parts before it, and not one step earlier', () => {
  map.parts.forEach((p, k) => {
    assert.ok(reachAtStage(map, k)[idx(p)], `${p.id} reachable with ${k} parts`);
    if (k > 0) assert.ok(!strict(k - 1)[idx(p)], `${p.id} sealed with only ${k - 1} parts`);
  });
});

test('the Heart of the Sea needs all five parts', () => {
  assert.ok(reachAtStage(map, 5)[idx(map.heart)]);
  assert.ok(!strict(4)[idx(map.heart)]);
});

test('every area opens at its stage and stays sealed before it', () => {
  AREAS.forEach((a, i) => {
    const stage = AREA_STAGE[i];
    const open = reachAtStage(map, stage);
    let cells = 0, reached = 0;
    for (let c = 0; c < map.kind.length; c++) {
      if (map.kind[c] !== WATER || map.area[c] !== i) continue;
      cells++;
      if (open[c]) reached++;
    }
    assert.ok(cells > 30, `${a.name} has water`);
    assert.ok(reached > cells * 0.4, `${a.name}: ${reached}/${cells} roomy cells open at stage ${stage}`);
    if (stage > 0) {
      const early = strict(stage - 1);
      for (let c = 0; c < map.kind.length; c++) {
        if (map.area[c] === i && map.kind[c] === WATER) assert.ok(!early[c], `${a.name} cell ${c % map.cols},${(c / map.cols) | 0} leaks at stage ${stage - 1}`);
      }
    }
  });
});

test('every creature spawns where it can be reached when its area opens', () => {
  const spawns = placeCreatures(map);
  assert.equal(spawns.length, SPECIES.reduce((n, s) => n + s.count, 0));
  for (const s of spawns) {
    const sp = SPECIES[s.species];
    assert.ok(reachAtStage(map, AREA_STAGE[sp.area])[idx(s.cell)], `${sp.id} at ${s.cell.x},${s.cell.y}`);
    assert.equal(map.area[idx(s.cell)], sp.area, `${sp.id} lives in its own area`);
  }
  // Every species appears at least once.
  assert.equal(new Set(spawns.map((s) => s.species)).size, SPECIES.length);
});

test('spawns are deterministic', () => {
  const a = placeCreatures(map).map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`);
  const b = placeCreatures(map).map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`);
  assert.deepEqual(a, b);
});

test('every treasure, golden shell and dock is reachable with all parts', () => {
  const all = reachAtStage(map, 5);
  for (const o of [...map.treasures, ...map.shells]) assert.ok(all[idx(o)], `${o.id} at ${o.x},${o.y}`);
  for (const d of map.docks) assert.ok(all[idx(d)], d.id);
});

test('some golden shells need backtracking with later parts', () => {
  const late = map.shells.filter((s) => !reachAtStage(map, 1)[idx(s)]);
  assert.ok(late.length >= 4, `${late.length} shells need later parts`);
  // The shallows nook needs the drill even though the shallows open at once.
  const nook = map.shells.find((s) => s.id === 's01');
  assert.ok(!reachAtStage(map, 1)[idx(nook)] && reachAtStage(map, 2)[idx(nook)]);
});

test('no soft-locks: at every stage, every reachable cell has a route back to a dock', () => {
  for (let stage = 0; stage <= 5; stage++) {
    const open = reachAtStage(map, stage);
    const ups = upgradesAfter(stage);
    const docks = map.docks.filter((d) => open[idx(d)]);
    assert.ok(docks.length >= 1);
    // Reverse fill from all reachable docks over the same graph.
    const back = new Uint8Array(open.length);
    for (const d of docks) {
      const r = reach(map, ups, d);
      for (let i = 0; i < r.length; i++) if (r[i]) back[i] = 1;
    }
    for (let i = 0; i < open.length; i++) if (open[i]) assert.ok(back[i], `stage ${stage} cell ${i % map.cols},${(i / map.cols) | 0}`);
  }
});

test('each dock opens at its area stage', () => {
  for (const d of map.docks) assert.ok(reachAtStage(map, AREA_STAGE[d.area])[idx(d)], d.id);
});

test('currents always push back toward open water', () => {
  for (const c of map.currents) {
    const without = reachAtStage(map, 4); // all parts but the turbo
    // The water just past the current, in the push direction, is open without turbo.
    const ox = c.dx < 0 ? c.x - 1 : c.dx > 0 ? c.x + c.w : c.x + Math.floor(c.w / 2);
    const oy = c.dy < 0 ? c.y - 1 : c.dy > 0 ? c.y + c.h : c.y + Math.floor(c.h / 2);
    assert.ok(without[oy * map.cols + ox] || blockReason(map, ox, oy, upgradesAfter(5)) === null, `${c.id} pushes into ${ox},${oy}`);
    assert.ok(currentAt(map, c.x, c.y));
  }
});

test('map completion can reach 100%: sonar from reachable water covers every water cell', () => {
  const open = reachAtStage(map, 5);
  const R = Math.floor(SONAR_R / CELL) - 1;
  const near = new Uint8Array(open.length);
  for (let i = 0; i < open.length; i++) {
    if (!open[i]) continue;
    const x = i % map.cols, y = (i / map.cols) | 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < map.cols && yy < map.rows) near[yy * map.cols + xx] = 1;
    }
  }
  for (let i = 0; i < open.length; i++) if (map.kind[i] === WATER) assert.ok(near[i], `water ${i % map.cols},${(i / map.cols) | 0} out of sonar reach`);
});

test('the autopilot path finder routes home to each part in order', () => {
  let from = homeCell(map);
  map.parts.forEach((p, k) => {
    const path = findPath(map, upgradesAfter(k), from, p);
    assert.ok(path && path.length > 3, `route to ${p.id}`);
    from = p;
  });
  assert.equal(UPGRADE_ORDER.length, map.parts.length);
});
