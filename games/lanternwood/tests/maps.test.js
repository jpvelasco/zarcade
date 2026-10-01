import test from 'node:test';
import assert from 'node:assert/strict';
import { OVERWORLD } from '../src/data/overworld.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { allAreas, F, liveGrid, roomKey } from '../src/areas.js';
import { isKnownTile, isSolid, isFlyable, tileDef, ROOM_W, ROOM_H, TILE } from '../src/tiles.js';
import { solveAdventure, solveDungeon, newState, explore, flood, entityBlockers } from '../src/solver.js';
import { NPC_IDS } from '../src/dialogue.js';
import { ENEMY_TYPES } from '../src/enemies.js';
import { BOSS_TYPES } from '../src/bosses.js';
import { SPEED, ROOM_SLIDE, RACE_TIME } from '../src/world.js';

const areas = allAreas();
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

test('every overworld screen is 20 x 12 known tiles and the grid is complete', () => {
  assert.equal(OVERWORLD.screens.length, OVERWORLD.cols * OVERWORLD.rows);
  const seen = new Set();
  for (const s of OVERWORLD.screens) {
    seen.add(s.at.join(','));
    assert.equal(s.map.length, ROOM_H, `${s.name} rows`);
    s.map.forEach((row, y) => {
      assert.equal(row.length, ROOM_W, `${s.name} row ${y}`);
      for (const ch of row) assert.ok(isKnownTile(ch), `${s.name} unknown tile '${ch}'`);
    });
  }
  assert.equal(seen.size, 16);
});

test('every dungeon room interior is 18 x 10 known tiles', () => {
  for (const d of DUNGEONS) {
    for (const [key, r] of Object.entries(d.rooms)) {
      assert.equal(r.map.length, ROOM_H - 2, `${d.id} ${key}`);
      for (const row of r.map) {
        assert.equal(row.length, ROOM_W - 2, `${d.id} ${key} row`);
        for (const ch of row) assert.ok(isKnownTile(ch), `${d.id} ${key} '${ch}'`);
      }
    }
  }
});

test('dungeon links join neighbouring rooms and doors open onto floor', () => {
  for (const d of DUNGEONS) {
    const area = areas[d.id];
    for (const link of area.links.values()) {
      assert.ok(area.rooms.has(link.a) && area.rooms.has(link.b), `${link.id} joins real rooms`);
      // The tile just inside each door must be walkable (once opened).
      for (const t of link.tiles) {
        const x = t % area.w, y = Math.floor(t / area.w);
        const inner = D4.map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => {
          const lx = nx % ROOM_W, ly = ny % ROOM_H;
          return lx > 0 && ly > 0 && lx < ROOM_W - 1 && ly < ROOM_H - 1;
        });
        assert.ok(inner.length > 0);
        for (const [nx, ny] of inner) assert.ok(!isSolid(area.base[ny * area.w + nx]) || tileDef(area.base[ny * area.w + nx]).post, `${link.id} inner tile ${nx},${ny}`);
      }
    }
  }
});

test('people, signs, chests and statues stand on open ground; enemies can move', () => {
  for (const area of Object.values(areas)) {
    for (const e of area.entities) {
      const c = area.base[e.y * area.w + e.x];
      const where = `${area.id} ${e.type} ${e.kind || e.id || ''} at ${e.room} ${e.x % ROOM_W},${e.y % ROOM_H}`;
      if (e.type === 'warp') assert.ok(tileDef(c).warp, where);
      else if (e.type === 'enemy' || e.type === 'boss') {
        const fly = (ENEMY_TYPES[e.kind] || BOSS_TYPES[e.kind]).fly;
        assert.ok(fly ? isFlyable(c) : !isSolid(c), where);
      } else assert.ok(!isSolid(c) || e.type === 'chest', where);
      if (e.type === 'npc') assert.ok(NPC_IDS.includes(e.id), `${where} has a script`);
      if (e.type === 'enemy') assert.ok(ENEMY_TYPES[e.kind], where);
      if (e.type === 'boss') assert.ok(BOSS_TYPES[e.kind], where);
    }
  }
});

test('rooms that must be cleared have enemies, puzzle rooms have their pieces', () => {
  for (const area of Object.values(areas)) {
    for (const room of area.rooms.values()) {
      const ents = area.entities.filter((e) => e.room === room.key);
      const tiles = [];
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) tiles.push(tileDef(area.base[(room.ry * ROOM_H + y) * area.w + room.rx * ROOM_W + x]));
      const name = `${area.id} ${room.key} ${room.cond}`;
      if (room.cond === 'clear') assert.ok(ents.some((e) => e.type === 'enemy'), name);
      if (room.cond === 'switch') assert.ok(tiles.some((t) => t.switch), name);
      if (room.cond === 'torches') assert.ok(tiles.some((t) => t.torch), name);
      if (room.cond === 'plates') {
        const plates = tiles.filter((t) => t.plate).length;
        assert.ok(plates > 0 && ents.filter((e) => e.type === 'block').length >= plates, name);
      }
      if (room.cond === 'boss') assert.equal(ents.filter((e) => e.type === 'boss').length, 1, name);
      for (const e of ents) if (e.appear) assert.ok(room.cond, `${name} appearing chest needs a condition`);
    }
  }
});

test('each dungeon has enough small keys for its locks, one big key and one boss door', () => {
  for (const d of DUNGEONS) {
    const area = areas[d.id];
    const chests = area.entities.filter((e) => e.type === 'chest');
    const keys = chests.filter((c) => c.contents === 'key').length;
    const locks = [...area.links.values()].filter((l) => l.type === 'locked').length;
    assert.ok(keys >= locks, `${d.id}: ${keys} keys for ${locks} locks`);
    assert.equal(chests.filter((c) => c.contents === 'bigkey').length, 1, d.id);
    assert.equal([...area.links.values()].filter((l) => l.type === 'boss').length, 1, d.id);
    assert.equal(chests.filter((c) => c.contents === d.item).length, 1, `${d.id} holds its item`);
  }
});

test('Mossy Burrow is finishable with the starting sword and lantern, in any key order', () => {
  const res = solveDungeon(areas.burrow, newState({ sword: true, lantern: true }));
  assert.ok(res.complete);
  assert.ok(res.everyOrder, 'no order of opening doors can get you stuck');
  assert.ok(res.state.items.boomerang, 'the leafarang is found inside');
});

test('the Sunken Bell Temple needs the leafarang and gives the vine seeds', () => {
  assert.equal(solveDungeon(areas.temple, newState({ sword: true, lantern: true })).complete, false);
  const res = solveDungeon(areas.temple, newState({ sword: true, lantern: true, boomerang: true }));
  assert.ok(res.complete && res.everyOrder);
  assert.ok(res.state.items.grapple);
});

test('Clockwork Peak needs the vine seeds and gives the ember dash', () => {
  assert.equal(solveDungeon(areas.peak, newState({ sword: true, lantern: true, boomerang: true })).complete, false);
  const res = solveDungeon(areas.peak, newState({ sword: true, lantern: true, boomerang: true, grapple: true }));
  assert.ok(res.complete && res.everyOrder);
  assert.ok(res.state.items.dash);
});

test('every dungeon room is reached on the way to the boss', () => {
  for (const d of DUNGEONS) {
    const items = { sword: true, lantern: true, boomerang: true, grapple: true, dash: true };
    const res = solveDungeon(areas[d.id], newState(items));
    const area = areas[d.id];
    const { reach } = explore(area, res.state, [area.start.y * area.w + area.start.x]);
    const rooms = new Set([...reach].map((i) => roomKey(Math.floor((i % area.w) / ROOM_W), Math.floor(Math.floor(i / area.w) / ROOM_H))));
    for (const key of area.rooms.keys()) assert.ok(rooms.has(key), `${d.id} room ${key}`);
  }
});

test('the whole adventure can be finished in order: burrow, temple, peak', () => {
  const { order, state, reach } = solveAdventure(areas);
  assert.deepEqual(order, ['burrow', 'temple', 'peak']);
  assert.equal(state.shards.length, 3);
  const ow = areas.overworld;
  const screens = new Set([...reach].map((i) => roomKey(Math.floor((i % ow.w) / ROOM_W), Math.floor(Math.floor(i / ow.w) / ROOM_H))));
  assert.equal(screens.size, 16, 'every overworld screen is reachable');
  // Every overworld chest opened, every person, lamp, honeycap and quest spot reachable.
  for (const e of ow.entities) {
    const i = e.y * ow.w + e.x;
    const near = [i, ...D4.map(([dx, dy]) => (e.y + dy) * ow.w + e.x + dx)].some((n) => reach.has(n));
    if (e.type === 'chest') assert.ok(state.flags.has(F.chest(e.uid)), `chest ${e.uid}`);
    else if (e.type !== 'enemy') assert.ok(near, `${e.type} ${e.id || ''} at ${e.uid}`);
  }
  let lamps = 0;
  for (let i = 0; i < ow.base.length; i++) {
    if (!tileDef(ow.base[i]).lamp) continue;
    lamps++;
    const x = i % ow.w, y = Math.floor(i / ow.w);
    assert.ok(D4.some(([dx, dy]) => reach.has((y + dy) * ow.w + x + dx)), `lamp at ${x},${y}`);
  }
  assert.equal(lamps, 5);
  assert.equal(ow.entities.filter((e) => e.type === 'honeycap').length, 3);
});

test('the lake and the peak stay closed until you have the right item', () => {
  const ow = areas.overworld;
  const start = [ow.start.y * ow.w + ow.start.x];
  const warp = (to) => { const w = ow.entities.find((e) => e.type === 'warp' && e.to === to); return w.y * ow.w + w.x; };
  let s = newState({ sword: true, lantern: true });
  let { reach } = explore(ow, s, start);
  assert.ok(reach.has(warp('burrow')));
  assert.ok(!reach.has(warp('temple')), 'temple needs the leafarang for the drawbridge');
  assert.ok(!reach.has(warp('peak')));
  s = newState({ sword: true, lantern: true, boomerang: true });
  ({ reach } = explore(ow, s, start));
  assert.ok(reach.has(warp('temple')));
  assert.ok(!reach.has(warp('peak')), 'peak needs the vine seeds for the chasm');
});

test("Hazel's race can be won with time to spare", () => {
  const ow = areas.overworld;
  const hazel = ow.entities.find((e) => e.id === 'hazel');
  const flag = ow.entities.find((e) => e.type === 'flag');
  const grid = liveGrid(ow, new Set());
  const blockers = entityBlockers(ow, new Set());
  // Breadth-first distance in tiles from beside Hazel to the flag.
  const start = (hazel.y + 1) * ow.w + hazel.x;
  const dist = new Map([[start, 0]]);
  const q = [start];
  while (q.length) {
    const i = q.shift();
    const x = i % ow.w, y = Math.floor(i / ow.w);
    for (const [dx, dy] of D4) {
      const n = (y + dy) * ow.w + x + dx;
      if (!dist.has(n) && !isSolid(grid[n]) && !blockers.has(n)) { dist.set(n, dist.get(i) + 1); q.push(n); }
    }
  }
  const tiles = dist.get(flag.y * ow.w + flag.x);
  assert.ok(tiles > 20);
  const seconds = (tiles * TILE) / SPEED + 4 * ROOM_SLIDE;
  assert.ok(seconds * 1.5 < RACE_TIME, `${seconds.toFixed(1)} s of running for ${RACE_TIME} s`);
  assert.ok(seconds * 2.5 > RACE_TIME, 'but it is still a race');
});
