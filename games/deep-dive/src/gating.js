// The gating graph: which cells Bubbles can swim through with a set of
// upgrades. Tests flood-fill this to prove the intended order works and that
// nothing soft-locks; the autopilot plans routes over it.
import { AREAS, UPGRADE_ORDER, hasAll } from './areas.js';
import { WATER, ROCK, kindAt } from './map.js';

// Area stage: how many parts (in order) open each area.
export const AREA_STAGE = [0, 0, 1, 2, 3, 4, 5];

export function gateAt(map, x, y) {
  for (const g of map.gates) if (x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h) return g;
  return null;
}

export function currentAt(map, x, y) {
  for (const c of map.currents) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c;
  return null;
}

// Why a water cell is closed to Bubbles right now, or null when open.
export function blockReason(map, x, y, ups, opened = null) {
  if (kindAt(map, x, y) !== WATER) return 'rock';
  const a = map.area[y * map.cols + x];
  if (a >= 0 && !hasAll(ups, AREAS[a].needs)) return AREAS[a].needs.find((n) => !ups.has(n));
  const g = gateAt(map, x, y);
  if (g && !(opened && opened.has(g.id)) && !ups.has(g.needs)) return g.needs;
  if (currentAt(map, x, y) && !ups.has('turbo')) return 'turbo';
  return null;
}

// A cell roomy enough for the sub: water with no rock beside it.
export function isClear(map, x, y) {
  if (kindAt(map, x, y) !== WATER) return false;
  return kindAt(map, x + 1, y) !== ROCK && kindAt(map, x - 1, y) !== ROCK && kindAt(map, x, y + 1) !== ROCK && kindAt(map, x, y - 1) !== ROCK;
}

// Flood fill from a cell. `clear` limits travel to roomy cells (what the sub
// can really use); `diagonal` lets the fill squeeze through corners, the
// strictest check that a gate really seals an area.
export function reach(map, ups, start, { clear = true, diagonal = false } = {}) {
  const seen = new Uint8Array(map.cols * map.rows);
  const ok = (x, y) => !blockReason(map, x, y, ups) && (!clear || isClear(map, x, y));
  if (!ok(start.x, start.y)) return seen;
  const dirs = diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const stack = [start.y * map.cols + start.x];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % map.cols, y = (i / map.cols) | 0;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const j = ny * map.cols + nx;
      if (seen[j] || !ok(nx, ny)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

export const homeCell = (map) => ({ x: map.docks[0].x, y: map.docks[0].y });

// Reachable cells after collecting the first `stage` parts, cached per map.
const cache = new WeakMap();
export function reachAtStage(map, stage) {
  let list = cache.get(map);
  if (!list) { list = []; cache.set(map, list); }
  if (!list[stage]) list[stage] = reach(map, new Set(UPGRADE_ORDER.slice(0, stage)), homeCell(map));
  return list[stage];
}

// Breadth-first path between cells (inclusive), or null. Used by the autopilot.
export function findPath(map, ups, from, to, opened = null) {
  const n = map.cols * map.rows;
  const prev = new Int32Array(n).fill(-1);
  const startI = from.y * map.cols + from.x, goalI = to.y * map.cols + to.x;
  const ok = (x, y) => !blockReason(map, x, y, ups, opened) && isClear(map, x, y);
  prev[startI] = startI;
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  queue[tail++] = startI;
  while (head < tail) {
    const i = queue[head++];
    if (i === goalI) break;
    const x = i % map.cols, y = (i / map.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const j = ny * map.cols + nx;
      if (prev[j] !== -1 || !ok(nx, ny)) continue;
      prev[j] = i;
      queue[tail++] = j;
    }
  }
  if (prev[goalI] === -1) return null;
  const path = [];
  for (let i = goalI; ; i = prev[i]) {
    path.push({ x: i % map.cols, y: (i / map.cols) | 0 });
    if (i === startI) break;
  }
  return path.reverse();
}
