// The valley map: the farm on the west, the little town on the east, one
// road between them. Static layout only; crops, soil and placed objects live
// in the world state. DOM-free.
import { rngFor } from './rng.js';

export const W = 60;
export const H = 40;
export const G = { GRASS: 0, PATH: 1, COBBLE: 2, WATER: 3, TREE: 4, SAND: 5, FLOWERS: 6, FLOOR: 7, BUSH: 8, FENCE: 9, BUILDING: 10 };
const SOLID_GROUND = new Set([G.WATER, G.TREE, G.BUSH, G.FENCE, G.BUILDING]);

export const idx = (x, y) => y * W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

// Farm zones (inclusive tile rects).
export const FIELD_A = { x0: 12, y0: 9, x1: 23, y1: 16 };
export const FIELD_B = { x0: 12, y0: 9, x1: 31, y1: 17 };
export const GREENHOUSE = { x0: 3, y0: 10, x1: 8, y1: 16, door: [6, 16], plots: { x0: 4, y0: 11, x1: 7, y1: 15 } };
export const PEN = { x0: 2, y0: 23, x1: 17, y1: 36 };
export const PEN_ROAM = { x0: 3, y0: 28, x1: 16, y1: 35 };
export const FARM = { x0: 2, y0: 2, x1: 32, y1: 37 };
export const TOWN = { x0: 34, y0: 2, x1: 57, y1: 37 };
export const PLAYER_START = [6, 7];

const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
export { inRect };

// Buildings: drawn as one sprite each, solid footprint, optional door.
export const BUILDINGS = [
  { id: 'house', kind: 'house', x: 4, y: 3, w: 5, h: 4, door: [6, 6] },
  { id: 'coop', kind: 'coop', x: 3, y: 24, w: 4, h: 3, door: [4, 26] },
  { id: 'barn', kind: 'barn', x: 11, y: 24, w: 6, h: 4, door: [13, 27] },
  { id: 'shop', kind: 'shop', x: 41, y: 7, w: 7, h: 5, door: [44, 11] },
  { id: 'bakery', kind: 'bakery', x: 50, y: 7, w: 6, h: 5, door: [52, 11], home: 'home:clem' },
  { id: 'workshop', kind: 'workshop', x: 35, y: 12, w: 5, h: 4, door: [37, 15] },
  { id: 'home:mabel', kind: 'cottage', x: 35, y: 3, w: 4, h: 4, door: [36, 6], tint: '#ffb4a2' },
  { id: 'home:bram', kind: 'cottage', x: 35, y: 24, w: 4, h: 4, door: [36, 27], tint: '#a3c4f3' },
  { id: 'home:juniper', kind: 'cottage', x: 36, y: 31, w: 4, h: 4, door: [37, 34], tint: '#ffd6a5' },
  { id: 'home:rowan', kind: 'cottage', x: 53, y: 27, w: 4, h: 4, door: [54, 30], tint: '#b9fbc0' },
  { id: 'home:sol', kind: 'cottage', x: 53, y: 33, w: 4, h: 4, door: [54, 36], tint: '#cdb4db' },
];
export const BIN = [9, 6];
export const WELL = [13, 7];
export const TROUGH = [[8, 25], [9, 25]];
export const SHOP_COUNTER = [[43, 13], [44, 13], [45, 13]];
export const SHOP_PORCH = [44, 12];
export const BOARD = [[49, 13], [50, 13]];
export const STALL = [[46, 17], [47, 17], [48, 17]];
export const TOWN_POND = { cx: 47.5, cy: 31, rx: 4.2, ry: 3.4 };
export const FARM_POND = { cx: 24.5, cy: 29.5, rx: 3.8, ry: 3.2 };
export const LANTERNS = [[52, 31], [51, 34], [47, 36], [43, 34], [42, 31], [43, 28], [47, 26], [51, 28]];

// Named places for villager schedules; each villager takes its own slot.
export const SPOTS = {
  shop: [[44, 12]],
  plaza: [[44, 19], [47, 21], [50, 19], [43, 22], [51, 22], [47, 23]],
  workshop: [[37, 17]],
  meadow: [[28, 5]],
  townpond: [[45, 27], [49, 27], [41, 30], [52, 29], [44, 36], [50, 36]],
  bakery: [[52, 12]],
  farmgate: [[30, 19]],
};

export function buildMap(seed = 1) {
  const ground = new Uint8Array(W * H);
  const water = new Array(W * H).fill(null); // 'pond' | 'town'
  const interact = new Map(); // idx -> { kind, ...}
  const set = (x, y, g) => { if (inBounds(x, y)) ground[idx(x, y)] = g; };
  const rect = (x0, y0, x1, y1, g) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, g); };
  const rand = rngFor(seed, 'map');

  // Border woods, with a gap where the road would lead out of the valley.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, G.TREE);
  }
  // A belt of trees and bushes between farm and town, open at the road.
  for (let y = 2; y < H - 2; y++) {
    if (y >= 18 && y <= 21) continue;
    set(33, y, (y % 3 === 0) ? G.TREE : G.BUSH);
  }

  // Roads.
  rect(6, 7, 6, 8, G.PATH);
  rect(6, 8, 11, 8, G.PATH);
  rect(10, 8, 11, 20, G.PATH);
  rect(10, 19, 40, 20, G.PATH);
  rect(9, 21, 11, 22, G.PATH); // down to the pen gate
  rect(40, 13, 53, 24, G.COBBLE);
  rect(44, 12, 44, 12, G.COBBLE);
  rect(36, 16, 39, 18, G.PATH);
  rect(36, 7, 37, 11, G.PATH);
  rect(46, 24, 48, 26, G.PATH);
  rect(39, 24, 39, 30, G.PATH);
  rect(51, 12, 53, 12, G.COBBLE);

  // Flower meadow (critters love it).
  rect(24, 2, 31, 6, G.FLOWERS);
  rect(50, 2, 56, 4, G.FLOWERS);
  rect(34, 19, 35, 19, G.PATH);

  // Ponds.
  const pond = (p, name) => {
    for (let y = Math.floor(p.cy - p.ry - 1); y <= Math.ceil(p.cy + p.ry + 1); y++) {
      for (let x = Math.floor(p.cx - p.rx - 1); x <= Math.ceil(p.cx + p.rx + 1); x++) {
        const d = ((x + 0.5 - p.cx) / p.rx) ** 2 + ((y + 0.5 - p.cy) / p.ry) ** 2;
        if (d <= 1) { set(x, y, G.WATER); water[idx(x, y)] = name; }
        else if (d <= 1.55 && ground[idx(x, y)] === G.GRASS) set(x, y, G.SAND);
      }
    }
  };
  pond(FARM_POND, 'pond');
  pond(TOWN_POND, 'town');

  // Animal pen fence with a gate at the top.
  for (let x = PEN.x0; x <= PEN.x1; x++) {
    if (x !== 10 && x !== 11) set(x, PEN.y0, G.FENCE);
    set(x, PEN.y1, G.FENCE);
  }
  for (let y = PEN.y0; y <= PEN.y1; y++) { set(PEN.x0, y, G.FENCE); set(PEN.x1, y, G.FENCE); }
  // Inside the pen the gate leads to grass.

  // Greenhouse frame (walls are solid; the door opens once restored).
  const gh = GREENHOUSE;
  for (let x = gh.x0; x <= gh.x1; x++) { set(x, gh.y0, G.BUILDING); set(x, gh.y1, G.BUILDING); }
  for (let y = gh.y0; y <= gh.y1; y++) { set(gh.x0, y, G.BUILDING); set(gh.x1, y, G.BUILDING); }
  rect(gh.plots.x0, gh.plots.y0, gh.plots.x1, gh.plots.y1, G.FLOOR);
  interact.set(idx(...gh.door), { kind: 'greenhouse' });

  for (const b of BUILDINGS) {
    rect(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, G.BUILDING);
    if (b.door) interact.set(idx(...b.door), { kind: 'door', building: b.id });
  }
  const solidAt = (list, kind, extra = {}) => list.forEach(([x, y], i) => { set(x, y, G.BUILDING); interact.set(idx(x, y), { kind, i, ...extra }); });
  solidAt([BIN], 'bin');
  solidAt([WELL], 'well');
  solidAt(TROUGH, 'trough');
  solidAt(SHOP_COUNTER, 'shop');
  solidAt(BOARD, 'board');
  solidAt(STALL, 'stall');
  solidAt(LANTERNS, 'lantern');

  // Scattered trees and bushes on open grass (never on roads or zones).
  const keepClear = (x, y) => inRect(FIELD_B, x, y) || inRect({ x0: 2, y0: 2, x1: 15, y1: 9 }, x, y) || inRect(PEN, x, y)
    || inRect({ x0: 2, y0: 9, x1: 9, y1: 17 }, x, y) || inRect({ x0: 39, y0: 6, x1: 57, y1: 26 }, x, y);
  const near = (x, y, r) => BUILDINGS.some((b) => x >= b.x - r && x < b.x + b.w + r && y >= b.y - r && y < b.y + b.h + r)
    || LANTERNS.some(([lx, ly]) => Math.abs(lx - x) <= r && Math.abs(ly - y) <= r);
  const decorSpots = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (ground[idx(x, y)] !== G.GRASS || keepClear(x, y) || near(x, y, 2)) continue;
    decorSpots.push([x, y]);
  }
  for (const [x, y] of decorSpots) {
    const r = rand();
    if (r < 0.045 && clearAround(ground, x, y)) set(x, y, G.TREE);
    else if (r < 0.065 && clearAround(ground, x, y)) set(x, y, G.BUSH);
  }

  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) solid[i] = SOLID_GROUND.has(ground[i]) ? 1 : 0;
  return { ground, solid, water, interact, seed };
}

// Trees need a ring of walkable grass so roads and doors never get blocked.
function clearAround(ground, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const g = ground[idx(x + dx, y + dy)];
    if (g !== G.GRASS && g !== G.FLOWERS) return false;
  }
  return true;
}

// Breadth-first path over walkable tiles. Returns [[x,y], ...] excluding the
// start, or null. `goal(x, y)` lets callers path to "next to" a target.
export function findPath(passable, from, goal, maxNodes = W * H) {
  const [sx, sy] = from;
  if (goal(sx, sy)) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const start = idx(sx, sy);
  prev[start] = start;
  const queue = [start];
  let head = 0;
  while (head < queue.length && head < maxNodes) {
    const cur = queue[head++];
    const cx = cur % W, cy = (cur - cx) / W;
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (prev[ni] !== -1) continue;
      if (goal(nx, ny)) {
        prev[ni] = cur;
        const path = [];
        let p = ni;
        while (p !== start) { path.push([p % W, Math.floor(p / W)]); p = prev[p]; }
        return path.reverse();
      }
      if (!passable(nx, ny)) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return null;
}
export const DIRS4 = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export function spotFor(name, slot = 0) {
  if (name.startsWith('home:')) {
    const b = homeOf(name.slice(5));
    return [b.door[0], b.door[1] + 1];
  }
  const list = SPOTS[name];
  return list[slot % list.length];
}

export const homeOf = (villagerId) => BUILDINGS.find((b) => b.id === `home:${villagerId}` || b.home === `home:${villagerId}`);
