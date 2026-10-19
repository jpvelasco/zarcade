// Zoo layout: biome zones on a road grid, habitat plots, decoration spots,
// visitor view spots and the road graph. DOM-free.
import { BIOMES, PLOTS_PER_BIOME, DECO_SPOTS_PER_BIOME } from './data.js';

export const ZONE_W = 640;
export const ZONE_H = 520;
export const ROAD = 56;
export const COLS = 3;
export const ROWS = 2;
export const WORLD = { x0: -150, y0: -150, x1: COLS * ZONE_W + 150, y1: ROWS * ZONE_H + 230 };
export const GATE = { x: 960, y: ROWS * ZONE_H + 120 };

// Biome b sits in this grid cell. Unlock order spirals out from the gate.
export const ZONE_CELLS = [[1, 1], [2, 1], [2, 0], [1, 0], [0, 0], [0, 1]];

const PLOTS = [
  { x: 44, y: 44, w: 236, h: 196, side: 'top' },
  { x: 360, y: 44, w: 236, h: 196, side: 'top' },
  { x: 168, y: 284, w: 304, h: 192, side: 'bottom' },
];
const SPOTS = [[320, 150], [92, 410], [548, 410]];

export function zoneRect(b) {
  const [c, r] = ZONE_CELLS[b];
  return { x: c * ZONE_W, y: r * ZONE_H, w: ZONE_W, h: ZONE_H };
}

export function plotRect(i) {
  const b = Math.floor(i / PLOTS_PER_BIOME);
  const z = zoneRect(b);
  const p = PLOTS[i % PLOTS_PER_BIOME];
  return { x: z.x + p.x, y: z.y + p.y, w: p.w, h: p.h, side: p.side, biome: b };
}

export function decoSpot(s) {
  const b = Math.floor(s / DECO_SPOTS_PER_BIOME);
  const z = zoneRect(b);
  const [x, y] = SPOTS[s % DECO_SPOTS_PER_BIOME];
  return { x: z.x + x, y: z.y + y, biome: b };
}

// Where a visitor stands to watch habitat i: on the road beside it.
export function viewSpot(i) {
  const p = plotRect(i);
  const cx = Math.round(p.x + p.w / 2);
  const y = p.side === 'top' ? p.y - 44 : p.y + p.h + 44;
  return { x: cx, y, face: p.side === 'top' ? 1 : -1 };
}

// ------------------------------------------------------------------ roads

const key = (x, y) => `${x},${y}`;

function buildGraph() {
  const nodes = new Map();
  const add = (x, y) => {
    const k = key(x, y);
    if (!nodes.has(k)) nodes.set(k, { k, x, y, links: [] });
    return nodes.get(k);
  };
  const link = (a, b) => {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    a.links.push({ to: b.k, d });
    b.links.push({ to: a.k, d });
  };
  const xs = Array.from({ length: COLS + 1 }, (_, c) => c * ZONE_W);
  const ys = Array.from({ length: ROWS + 1 }, (_, r) => r * ZONE_H);
  const views = Array.from({ length: BIOMES.length * PLOTS_PER_BIOME }, (_, i) => viewSpot(i));
  for (const y of ys) {
    const stops = new Set(xs);
    for (const v of views) {
      // Each view spot projects onto the nearest horizontal road.
      if (Math.abs(nearestRoadY(v.y) - y) < 1) stops.add(v.x);
    }
    if (y === ROWS * ZONE_H) stops.add(GATE.x);
    const sorted = [...stops].sort((a, b) => a - b);
    for (let j = 1; j < sorted.length; j++) link(add(sorted[j - 1], y), add(sorted[j], y));
  }
  for (const x of xs) {
    for (let j = 1; j < ys.length; j++) link(add(x, ys[j - 1]), add(x, ys[j]));
  }
  link(add(GATE.x, ROWS * ZONE_H), add(GATE.x, GATE.y));
  return nodes;
}

export function nearestRoadY(y) {
  return Math.round(y / ZONE_H) * ZONE_H;
}

export const GRAPH = buildGraph();
export const GATE_NODE = key(GATE.x, GATE.y);
export const viewNode = (i) => { const v = viewSpot(i); return key(v.x, nearestRoadY(v.y)); };

const pathCache = new Map();
// Shortest list of node keys from a to b (inclusive), Dijkstra on ~50 nodes.
export function roadPath(a, b) {
  const ck = `${a}>${b}`;
  if (pathCache.has(ck)) return pathCache.get(ck);
  const dist = new Map([[a, 0]]);
  const prev = new Map();
  const open = new Set([a]);
  while (open.size) {
    let cur = null;
    for (const k of open) if (cur === null || dist.get(k) < dist.get(cur)) cur = k;
    open.delete(cur);
    if (cur === b) break;
    for (const l of GRAPH.get(cur).links) {
      const nd = dist.get(cur) + l.d;
      if (!dist.has(l.to) || nd < dist.get(l.to)) {
        dist.set(l.to, nd);
        prev.set(l.to, cur);
        open.add(l.to);
      }
    }
  }
  const path = [];
  if (!dist.has(b)) return null;
  for (let k = b; k !== undefined; k = prev.get(k)) path.unshift(k);
  pathCache.set(ck, path);
  return path;
}

export const nodePos = (k) => GRAPH.get(k);

// ------------------------------------------------------------------ hits

const inRect = (x, y, r, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

// What is under a world point: a deco spot, a habitat, a locked zone.
export function hitTest(x, y, unlocked, { spots = false } = {}) {
  if (spots) {
    for (let s = 0; s < BIOMES.length * DECO_SPOTS_PER_BIOME; s++) {
      const p = decoSpot(s);
      if (p.biome < unlocked && Math.hypot(x - p.x, y - p.y) < 44) return { kind: 'spot', spot: s };
    }
  }
  for (let b = 0; b < BIOMES.length; b++) {
    const z = zoneRect(b);
    if (!inRect(x, y, { x: z.x + 28, y: z.y + 28, w: z.w - 56, h: z.h - 56 })) continue;
    if (b >= unlocked) return { kind: 'lot', biome: b };
    for (let p = 0; p < PLOTS_PER_BIOME; p++) {
      const i = b * PLOTS_PER_BIOME + p;
      if (inRect(x, y, plotRect(i), 6)) return { kind: 'habitat', habitat: i };
    }
    for (let s = 0; s < DECO_SPOTS_PER_BIOME; s++) {
      const p = decoSpot(b * DECO_SPOTS_PER_BIOME + s);
      if (Math.hypot(x - p.x, y - p.y) < 40) return { kind: 'deco', spot: b * DECO_SPOTS_PER_BIOME + s };
    }
    return { kind: 'zone', biome: b };
  }
  return null;
}
