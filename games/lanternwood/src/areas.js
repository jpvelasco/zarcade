// Builds playable areas from the map data: one tile grid per area (the
// overworld is 4 × 4 screens, each dungeon a grid of rooms), plus the lookup
// tables for doors, gates and entities. Also `liveGrid`, which applies saved
// progress (opened doors, solved rooms, broken rocks) to a fresh copy.
import { ROOM_W, ROOM_H, code, tileDef } from './tiles.js';
import { OVERWORLD } from './data/overworld.js';
import { DUNGEONS } from './data/dungeons.js';

const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
export { DIRS };

export const roomKey = (rx, ry) => `${rx},${ry}`;

function emptyArea(def, kind) {
  const w = def.cols * ROOM_W, h = def.rows * ROOM_H;
  return {
    id: def.id, name: def.name, kind, def,
    cols: def.cols, rows: def.rows, w, h,
    base: new Uint8Array(w * h).fill(code('#')),
    rooms: new Map(),
    links: new Map(),
    tileLink: new Map(),
    gateRoom: new Map(),
    entities: [],
  };
}

function addEntities(area, rx, ry, list = []) {
  for (const e of list) {
    const x = rx * ROOM_W + e.x, y = ry * ROOM_H + e.y;
    const ent = { ...e, x, y, room: roomKey(rx, ry) };
    ent.uid = `${area.id}:${e.type}:${x},${y}`;
    area.entities.push(ent);
  }
}

function writeRows(area, ox, oy, rows) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) area.base[(oy + y) * area.w + ox + x] = code(row[x]);
  });
}

function indexGates(area) {
  for (let i = 0; i < area.base.length; i++) {
    if (!tileDef(area.base[i]).gate || area.gateRoom.has(i)) continue;
    const tx = i % area.w, ty = Math.floor(i / area.w);
    area.gateRoom.set(i, roomKey(Math.floor(tx / ROOM_W), Math.floor(ty / ROOM_H)));
  }
}

export function buildOverworld(def = OVERWORLD) {
  const area = emptyArea(def, 'overworld');
  for (const s of def.screens) {
    const [rx, ry] = s.at;
    writeRows(area, rx * ROOM_W, ry * ROOM_H, s.map);
    area.rooms.set(roomKey(rx, ry), {
      key: roomKey(rx, ry), rx, ry, name: s.name, region: s.region,
      cond: s.cond || null, dark: false, music: s.region,
    });
    addEntities(area, rx, ry, s.entities);
  }
  indexGates(area);
  area.start = { x: def.start.s[0] * ROOM_W + def.start.x, y: def.start.s[1] * ROOM_H + def.start.y };
  return area;
}

// Door tiles for one side of a room, in global tile coordinates.
function doorTiles(rx, ry, dir) {
  const ox = rx * ROOM_W, oy = ry * ROOM_H;
  if (dir === 'n') return [[ox + 9, oy], [ox + 10, oy]];
  if (dir === 's') return [[ox + 9, oy + ROOM_H - 1], [ox + 10, oy + ROOM_H - 1]];
  if (dir === 'w') return [[ox, oy + 5], [ox, oy + 6]];
  return [[ox + ROOM_W - 1, oy + 5], [ox + ROOM_W - 1, oy + 6]];
}

const LINK_CHAR = { open: '.', locked: 'L', boss: 'B', shut: 'S' };

export function buildDungeon(def) {
  const area = emptyArea(def, 'dungeon');
  for (const [key, room] of Object.entries(def.rooms)) {
    const [rx, ry] = key.split(',').map(Number);
    writeRows(area, rx * ROOM_W + 1, ry * ROOM_H + 1, room.map);
    area.rooms.set(key, {
      key, rx, ry, name: room.name, region: def.theme, cond: room.cond || null,
      dark: !!room.dark, mini: !!room.mini, music: room.cond === 'boss' ? 'boss' : def.music,
    });
    addEntities(area, rx, ry, room.entities);
  }
  for (const link of def.links) {
    const [ax, ay] = link.a.split(',').map(Number);
    const [dx, dy] = DIRS[link.dir];
    const b = roomKey(ax + dx, ay + dy);
    const id = `${def.id}:${link.a}:${link.dir}`;
    const tiles = [...doorTiles(ax, ay, link.dir), ...doorTiles(ax + dx, ay + dy, OPP[link.dir])]
      .map(([x, y]) => y * area.w + x);
    const ch = code(LINK_CHAR[link.type]);
    const entry = { id, type: link.type, a: link.a, b, dir: link.dir, tiles };
    area.links.set(id, entry);
    for (const t of tiles) {
      area.base[t] = ch;
      if (link.type === 'locked' || link.type === 'boss') area.tileLink.set(t, id);
      if (link.type === 'shut') area.gateRoom.set(t, link.cond || link.a);
    }
  }
  indexGates(area);
  const e = def.entry;
  const [erx, ery] = e.room.split(',').map(Number);
  area.start = { x: erx * ROOM_W + e.x, y: ery * ROOM_H + e.y };
  area.exit = def.exit;
  return area;
}

let cache = null;
/** Every area, built once: { overworld, burrow, temple, peak }. */
export function allAreas() {
  if (cache) return cache;
  cache = { overworld: buildOverworld() };
  for (const d of DUNGEONS) cache[d.id] = buildDungeon(d);
  return cache;
}

export const DUNGEON_DEFS = DUNGEONS;
export const dungeonDef = (id) => DUNGEONS.find((d) => d.id === id) || null;

// Flag names shared by the game, the save file and the solver.
export const F = {
  solved: (areaId, key) => `solved:${areaId}:${key}`,
  link: (id) => `open:${id}`,
  crack: (areaId, idx) => `crack:${areaId}:${idx}`,
  chest: (uid) => `chest:${uid}`,
  lamp: (idx) => `lamp:${idx}`,
  pickup: (uid) => `got:${uid}`,
};

/** A fresh copy of an area's tiles with saved progress applied. */
export function liveGrid(area, flags) {
  const g = area.base.slice();
  const has = (f) => flags.has(f);
  for (const link of area.links.values()) {
    if ((link.type === 'locked' || link.type === 'boss') && has(F.link(link.id))) {
      for (const t of link.tiles) g[t] = code('.');
    }
  }
  for (const [idx, key] of area.gateRoom) {
    if (has(F.solved(area.id, key))) g[idx] = code(tileDef(g[idx]).opened || '.');
  }
  for (let i = 0; i < g.length; i++) {
    if (tileDef(g[i]).crack && has(F.crack(area.id, i))) g[i] = code('.');
  }
  return g;
}

export function roomOfTile(area, tx, ty) {
  return roomKey(Math.floor(tx / ROOM_W), Math.floor(ty / ROOM_H));
}

// Where the player appears when arriving at an area by warp or by loading.
export function arrival(areaId, areas = allAreas()) {
  const area = areas[areaId];
  return { x: area.start.x, y: area.start.y };
}

// Where you come out in the overworld when leaving a dungeon.
export function dungeonExit(areaId) {
  const d = dungeonDef(areaId);
  return { area: 'overworld', x: d.exit.s[0] * ROOM_W + d.exit.x, y: d.exit.s[1] * ROOM_H + d.exit.y };
}
