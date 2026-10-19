// The hand-designed ocean. DOM-free: tests flood-fill it and the renderer
// bakes it. The map is a 32 px cell grid carved out of rock by a list of
// authored shapes; each shape tags the cells it carves with an area.
import { AREA_INDEX as A } from './areas.js';
import { hash2 } from './rng.js';

export const CELL = 32;
export const COLS = 150;
export const ROWS = 110;
export const SURFACE_ROW = 3;
export const SURFACE_Y = SURFACE_ROW * CELL;

export const WATER = 0, ROCK = 1, AIR = 2;

// [kind, area, ...] kinds: rect x y w h | ell cx cy rx ry | tun radius [[x,y]...]
// Rock is added back with area -1 ('fill-ell', 'fill-rect').
const SHAPES = [
  // Sunny Shallows: the open bay beside Home Dock.
  ['rect', A.shallows, 1, 3, 48, 19],
  ['ell', A.shallows, 10, 21, 7, 2],
  ['ell', A.shallows, 34, 21, 7, 2],
  ['fill-ell', 4, 22, 3, 2],
  ['fill-ell', 18, 21, 2, 1.6],
  ['fill-ell', 29, 13, 2.6, 1.6],
  ['rect', A.shallows, 42, 22, 5, 4], // drill nook (golden shell)

  // Kelp Forest and the open ocean above the wreck.
  ['rect', A.kelp, 49, 3, 52, 18],
  ['rect', A.kelp, 49, 18, 42, 10],
  ['rect', A.kelp, 101, 3, 46, 9],
  ['fill-ell', 62, 25, 2, 4],
  ['fill-ell', 76, 24, 2.5, 5],
  ['fill-ell', 115, 11, 4, 1.6],
  ['fill-ell', 98, 20, 3, 2],
  ['rect', A.kelp, 130, 12, 4, 4], // hatch nook (golden shell)

  // Shipwreck: decks joined by rusty hatches.
  ['rect', A.kelp, 91, 22, 1, 4],
  ['rect', A.wreck, 92, 22, 5, 4],
  ['rect', A.wreck, 97, 20, 12, 8],
  ['rect', A.wreck, 109, 22, 2, 4],
  ['rect', A.wreck, 111, 20, 14, 8],
  ['rect', A.wreck, 100, 28, 4, 4],
  ['rect', A.wreck, 96, 32, 32, 6],
  ['fill-rect', 110, 32, 2, 2],
  ['fill-rect', 117, 36, 2, 2],

  // Coral City: a big reef cavern under the shallows.
  ['rect', A.shallows, 22, 21, 4, 3],
  ['rect', A.coral, 22, 24, 4, 7],
  ['rect', A.coral, 4, 31, 54, 16],
  ['ell', A.coral, 30, 46, 20, 3],
  ['fill-ell', 14, 38, 2, 5],
  ['fill-ell', 46, 37, 3, 4],
  ['fill-ell', 30, 42, 4, 1.6],
  ['fill-ell', 38, 31, 3, 1.4],
  ['rect', A.coral, 10, 47, 4, 5], // current nook (golden shell)

  // Twilight Zone: dark caverns below the reef.
  ['rect', A.twilight, 40, 46, 4, 10],
  ['rect', A.twilight, 30, 56, 30, 8],
  ['tun', A.twilight, 2, [[30, 60], [18, 62], [12, 68]]],
  ['ell', A.twilight, 13, 68, 7, 4],
  ['tun', A.twilight, 2, [[59, 60], [75, 64], [90, 62]]],
  ['ell', A.twilight, 92, 64, 9, 6],
  ['fill-ell', 45, 61, 3, 1.5],
  ['fill-ell', 93, 63, 2.5, 2],
  ['rect', A.twilight, 70, 63, 4, 13],
  ['rect', A.trench, 70, 76, 4, 2],
  ['rect', A.trench, 92, 70, 4, 6], // deep nook (golden shell)

  // Glowing Trenches: three canyons hanging off a hub.
  ['rect', A.trench, 56, 78, 30, 6],
  ['tun', A.trench, 2, [[56, 81], [40, 84], [30, 90], [28, 100]]],
  ['ell', A.trench, 28, 102, 6, 3],
  ['rect', A.trench, 76, 84, 4, 20],
  ['ell', A.trench, 78, 103, 8, 2],
  ['tun', A.trench, 2, [[85, 81], [100, 86], [104, 93]]],
  ['rect', A.trench, 104, 92, 10, 4],

  // Volcanic Vent: a tall chamber of chimneys behind a strong current.
  ['rect', A.vent, 114, 92, 4, 4],
  ['rect', A.vent, 118, 62, 26, 40],
  ['fill-ell', 126, 85, 2, 8],
  ['fill-ell', 136, 75, 3, 6],
  ['fill-ell', 131, 101, 3, 2],
  ['fill-ell', 143, 70, 1.5, 4],
];

// Solid gates sit in carved water and open on contact with the right part.
export const GATES = [
  { id: 'hatch-wreck', kind: 'hatch', needs: 'grabber', x: 92, y: 22, w: 2, h: 4 },
  { id: 'hatch-hold', kind: 'hatch', needs: 'grabber', x: 109, y: 22, w: 2, h: 4 },
  { id: 'hatch-nook', kind: 'hatch', needs: 'grabber', x: 130, y: 12, w: 4, h: 1 },
  { id: 'coral-shaft', kind: 'coral', needs: 'drill', x: 22, y: 24, w: 4, h: 2 },
  { id: 'coral-nook', kind: 'coral', needs: 'drill', x: 42, y: 22, w: 5, h: 1 },
];

// Currents push harder than the normal motor. Each points back out the way
// you came, so a current can only ever push Bubbles to safety.
export const CURRENTS = [
  { id: 'vent-gate', x: 106, y: 92, w: 8, h: 4, dx: -1, dy: 0 },
  { id: 'coral-nook', x: 10, y: 47, w: 4, h: 3, dy: -1, dx: 0 },
];

export const DOCKS = [
  { id: 'home', name: 'Home Dock', x: 6, y: 3, area: A.shallows },
  { id: 'kelp', name: 'Kelp Buoy', x: 75, y: 3, area: A.kelp },
  { id: 'coral', name: 'Coral Dome', x: 30, y: 33, area: A.coral },
  { id: 'twilight', name: 'Lantern Station', x: 44, y: 58, area: A.twilight },
  { id: 'trench', name: 'Trench Station', x: 66, y: 80, area: A.trench },
  { id: 'vent', name: 'Vent Camp', x: 121, y: 97, area: A.vent },
];

export const PARTS = [
  { id: 'grabber', x: 86, y: 25 },
  { id: 'drill', x: 125, y: 35 },
  { id: 'lights', x: 55, y: 44 },
  { id: 'hull', x: 10, y: 70 },
  { id: 'turbo', x: 26, y: 103 },
];

export const HEART = { id: 'heart', name: 'Heart of the Sea', x: 138, y: 64 };

export const TREASURES = [
  { id: 't01', name: 'Message in a bottle', x: 12, y: 10 },
  { id: 't02', name: 'Old ship anchor', x: 30, y: 19 },
  { id: 't03', name: 'Pirate coin', x: 40, y: 7 },
  { id: 't04', name: 'Lost flip-flop', x: 10, y: 21 },
  { id: 't05', name: 'Rubber duck', x: 60, y: 12 },
  { id: 't06', name: 'Silver spoon', x: 80, y: 18 },
  { id: 't07', name: 'Glass float', x: 95, y: 15 },
  { id: 't08', name: 'Toy sailboat', x: 122, y: 6 },
  { id: 't09', name: 'Ship bell', x: 141, y: 9 },
  { id: 't10', name: 'Captain\'s hat', x: 101, y: 22 },
  { id: 't11', name: 'Treasure map', x: 115, y: 25 },
  { id: 't12', name: 'Brass compass', x: 106, y: 35 },
  { id: 't13', name: 'Jeweled goblet', x: 119, y: 34 },
  { id: 't14', name: 'Golden key', x: 98, y: 34 },
  { id: 't15', name: 'Pink pearl', x: 8, y: 33 },
  { id: 't16', name: 'Mermaid comb', x: 20, y: 44 },
  { id: 't17', name: 'Sea glass marble', x: 36, y: 36 },
  { id: 't18', name: 'Coral crown', x: 51, y: 33 },
  { id: 't19', name: 'Shell necklace', x: 56, y: 40 },
  { id: 't20', name: 'Glowing gem', x: 35, y: 62 },
  { id: 't21', name: 'Old lantern', x: 55, y: 58 },
  { id: 't22', name: 'Star stone', x: 16, y: 70 },
  { id: 't23', name: 'Lost telescope', x: 87, y: 61 },
  { id: 't24', name: 'Blue diamond', x: 98, y: 66 },
  { id: 't25', name: 'Crystal ball', x: 60, y: 82 },
  { id: 't26', name: 'Space rock', x: 30, y: 94 },
  { id: 't27', name: 'Ancient tablet', x: 78, y: 96 },
  { id: 't28', name: 'Robot toy', x: 99, y: 86 },
  { id: 't29', name: 'Silver crown', x: 31, y: 102 },
  { id: 't30', name: 'Lava glass', x: 121, y: 70 },
  { id: 't31', name: 'Fire opal', x: 140, y: 90 },
  { id: 't32', name: 'Dragon egg stone', x: 131, y: 82 },
];

export const SHELLS = [
  { id: 's01', x: 44, y: 24 }, // behind coral (drill)
  { id: 's02', x: 131, y: 14 }, // behind a hatch (grabber)
  { id: 's03', x: 122, y: 22 },
  { id: 's04', x: 11, y: 50 }, // up a current (turbo)
  { id: 's05', x: 93, y: 74 }, // deep nook (hull)
  { id: 's06', x: 3, y: 18 },
  { id: 's07', x: 51, y: 26 },
  { id: 's08', x: 5, y: 45 },
  { id: 's09', x: 8, y: 67 },
  { id: 's10', x: 78, y: 104 },
  { id: 's11', x: 142, y: 99 },
  { id: 's12', x: 130, y: 64 },
];

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x + 0.5 - (cx + 0.5)) / rx, dy = (y + 0.5 - (cy + 0.5)) / ry;
  return dx * dx + dy * dy <= 1;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len = vx * vx + vy * vy;
  let t = len ? ((px - ax) * vx + (py - ay) * vy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export function buildMap() {
  const n = COLS * ROWS;
  const kind = new Uint8Array(n).fill(ROCK);
  const area = new Int8Array(n).fill(-1);
  const idx = (x, y) => y * COLS + x;
  for (let y = 0; y < SURFACE_ROW; y++) for (let x = 0; x < COLS; x++) kind[idx(x, y)] = AIR;

  const paint = (test, a, fill) => {
    for (let y = SURFACE_ROW; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (!test(x, y)) continue;
        if (fill) { kind[idx(x, y)] = ROCK; area[idx(x, y)] = -1; } else { kind[idx(x, y)] = WATER; area[idx(x, y)] = a; }
      }
    }
  };
  for (const s of SHAPES) {
    const [type] = s;
    if (type === 'rect') { const [, a, x0, y0, w, h] = s; paint((x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h, a); }
    else if (type === 'ell') { const [, a, cx, cy, rx, ry] = s; paint((x, y) => inEllipse(x, y, cx, cy, rx, ry), a); }
    else if (type === 'tun') {
      const [, a, r, pts] = s;
      paint((x, y) => {
        for (let i = 0; i < pts.length - 1; i++) if (distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= r + 0.25) return true;
        return false;
      }, a);
    } else if (type === 'fill-ell') { const [, cx, cy, rx, ry] = s; paint((x, y) => inEllipse(x, y, cx, cy, rx, ry), -1, true); }
    else if (type === 'fill-rect') { const [, x0, y0, w, h] = s; paint((x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h, -1, true); }
  }

  // Rock and air take the area of the nearest water, for colors and music.
  const tint = new Int8Array(area);
  let frontier = [];
  for (let i = 0; i < n; i++) if (tint[i] >= 0) frontier.push(i);
  while (frontier.length) {
    const next = [];
    for (const i of frontier) {
      const x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = idx(nx, ny);
        if (tint[j] < 0) { tint[j] = tint[i]; next.push(j); }
      }
    }
    frontier = next;
  }

  const map = {
    cols: COLS, rows: ROWS, cell: CELL, kind, area, tint,
    gates: GATES, currents: CURRENTS, docks: DOCKS, parts: PARTS, heart: HEART,
    treasures: TREASURES, shells: SHELLS,
    width: COLS * CELL, height: ROWS * CELL,
  };
  map.corners = buildCorners(map);
  map.waterCells = 0;
  for (let i = 0; i < n; i++) if (kind[i] === WATER) map.waterCells++;
  return map;
}

export function kindAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return ROCK;
  return map.kind[y * map.cols + x];
}

export function areaAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return 0;
  return map.tint[y * map.cols + x];
}

// Corner densities for smooth terrain: each grid corner averages its four
// cells (rock = 1), and boundary corners wobble with seeded noise. Pure water
// and pure rock corners never change, so passages keep their shape.
function buildCorners(map) {
  const w = map.cols + 1, h = map.rows + 1;
  const d = new Float32Array(w * h);
  const solid = (x, y) => (kindAt(map, x, y) === ROCK ? 1 : 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = (solid(x - 1, y - 1) + solid(x, y - 1) + solid(x - 1, y) + solid(x, y)) / 4;
      if (y <= SURFACE_ROW) v = Math.min(v, y < SURFACE_ROW ? 0 : v);
      if (v > 0 && v < 1) v += (hash2(x, y, 77) - 0.5) * 0.44;
      d[y * w + x] = v;
    }
  }
  return d;
}

// Bilinear rock density at a world point: > 0.5 is solid.
export function density(map, wx, wy) {
  const gx = wx / CELL, gy = wy / CELL;
  if (gx < 0 || gy < 0 || gx >= map.cols || gy >= map.rows) return 1;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const w = map.cols + 1, c = map.corners;
  const a = c[y0 * w + x0], b = c[y0 * w + x0 + 1], e = c[(y0 + 1) * w + x0], f = c[(y0 + 1) * w + x0 + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
}

// Depth in meters for a world y. Piecewise so the numbers feel real-ish:
// shallows tens of meters, the trench floor about 6 km.
const DEPTH_TABLE = [[0, 0], [SURFACE_ROW, 0], [22, 20], [30, 40], [48, 150], [56, 220], [72, 950], [78, 1500], [106, 6000], [110, 6400]];
export function depthMeters(wy) {
  const row = wy / CELL;
  for (let i = 1; i < DEPTH_TABLE.length; i++) {
    const [r1, m1] = DEPTH_TABLE[i];
    const [r0, m0] = DEPTH_TABLE[i - 1];
    if (row <= r1) return Math.max(0, Math.round(m0 + ((row - r0) / (r1 - r0 || 1)) * (m1 - m0)));
  }
  return 6400;
}

export const cellCenter = (cx, cy) => ({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 });
export const gateRect = (g) => ({ x: g.x * CELL, y: g.y * CELL, w: g.w * CELL, h: g.h * CELL });
