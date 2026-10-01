// Deterministic street furniture for the renderer: building shapes, rooftop
// details, lamps, lantern strings and puddles. Everything comes from the
// block's seed, so a Shift Code always rebuilds the same skyline. Pure data,
// no DOM, so Node tests can check it.
import { BLOCK, ROAD_HALF, blockAt } from './city.js';
import { hash2, rng } from './math.js';

export const LOT = BLOCK - ROAD_HALF * 2; // a city block's lot, in world units
export const FESTIVAL = ['#ff6b9a', '#ffc857', '#6df0bd', '#7fd1ff', '#c99bff', '#ff9e5c'];
export const SIGN_COLORS = ['#ff5fb7', '#3fe5ff', '#ffc857', '#6df0bd', '#c775ff'];
const ROOFS = ['garden', 'solar', 'tanks', 'vents', 'court'];
const ROOF_SHIFTS = [0, 0, -40, 150, 175, 110];

function roofFeatures(kind, w, h, random) {
  const features = [];
  if (kind === 'garden') {
    const beds = 2 + Math.floor(random() * 2);
    for (let i = 0; i < beds; i++) {
      const bw = w * (0.22 + random() * 0.2);
      const bh = h * (0.18 + random() * 0.18);
      features.push({ type: 'bed', x: 6 + random() * (w - bw - 12), y: 6 + random() * (h - bh - 12), w: bw, h: bh });
    }
    const trees = 3 + Math.floor(random() * 4);
    for (let i = 0; i < trees; i++) {
      features.push({ type: 'tree', x: 8 + random() * (w - 16), y: 8 + random() * (h - 16), r: 4 + random() * 4 });
    }
    features.push({ type: 'fairy', x1: 6, y1: 6 + random() * 6, x2: w - 6, y2: h - 6 - random() * 6 });
  } else if (kind === 'solar') {
    const columns = Math.max(2, Math.floor((w - 12) / 18));
    const rows = Math.max(1, Math.floor((h - 12) / 14));
    const pw = (w - 12) / columns;
    const ph = (h - 12) / rows;
    for (let cx = 0; cx < columns; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (random() < 0.12) continue;
        features.push({ type: 'panel', x: 6 + cx * pw + 1.5, y: 6 + cy * ph + 1.5, w: pw - 3, h: ph - 3 });
      }
    }
  } else if (kind === 'tanks') {
    const tanks = 1 + Math.floor(random() * 2);
    for (let i = 0; i < tanks; i++) {
      const r = Math.min(w, h) * (0.14 + random() * 0.08);
      features.push({ type: 'tank', x: r + 6 + random() * Math.max(1, w - r * 2 - 12), y: r + 6 + random() * Math.max(1, h - r * 2 - 12), r });
    }
    for (let i = 0; i < 2; i++) features.push({ type: 'vent', x: 6 + random() * (w - 20), y: 6 + random() * (h - 14), w: 10 + random() * 6, h: 7 + random() * 4 });
  } else if (kind === 'vents') {
    const count = 3 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) features.push({ type: 'vent', x: 6 + random() * (w - 22), y: 6 + random() * (h - 16), w: 10 + random() * 10, h: 7 + random() * 6 });
    features.push({ type: 'antenna', x: 8 + random() * (w - 16), y: 8 + random() * (h - 16) });
    if (w > 70 && h > 50 && random() < 0.5) features.push({ type: 'pad', x: w / 2, y: h / 2, r: Math.min(w, h) * 0.24 });
  } else {
    const iw = w * 0.42;
    const ih = h * 0.42;
    features.push({ type: random() < 0.5 ? 'pool' : 'yard', x: (w - iw) / 2, y: (h - ih) / 2, w: iw, h: ih });
    features.push({ type: 'tree', x: w / 2, y: h / 2, r: 5 });
  }
  return features;
}

function makeBuilding(x, y, w, h, block, kind, random) {
  const facade = Math.round(12 + block.height * 20 + random() * 6);
  const roofH = Math.max(18, h - facade);
  const columns = Math.max(2, Math.floor((w - 8) / 13));
  const rows = Math.max(1, Math.floor((h - roofH - 6) / 11));
  const windows = [];
  for (let wx = 0; wx < columns; wx++) {
    for (let wy = 0; wy < rows; wy++) {
      const chance = random();
      windows.push({ x: wx, y: wy, on: chance > 0.24, dim: chance > 0.9, warm: random() > 0.45 });
    }
  }
  return {
    x, y, w, h,
    roofH,
    facade: h - roofH,
    // Mostly the block's cool hue, with warm terracotta, teal and plum roofs
    // mixed in so a lit street looks like a festival, not a single colour.
    hue: block.hue + ROOF_SHIFTS[Math.floor(random() * ROOF_SHIFTS.length)] + Math.floor(random() * 16) - 8,
    roof: kind,
    features: roofFeatures(kind, w, roofH, random),
    columns,
    rows,
    windows,
  };
}

// Layout of one block's lot in lot-local coordinates (0..LOT).
export function blockScenery(column, row, seed) {
  const block = blockAt(column * BLOCK + ROAD_HALF, row * BLOCK + ROAD_HALF, seed);
  const random = rng(block.seed ^ 0x2f6b9e1d);
  const inset = block.inset;
  const size = LOT - inset * 2;
  const buildings = [];
  const kind = ROOFS[block.roof % ROOFS.length];
  if (random() < 0.38) {
    const split = Math.round(size * (0.4 + random() * 0.2));
    const second = ROOFS[(block.roof + 1 + Math.floor(random() * 3)) % ROOFS.length];
    buildings.push(makeBuilding(inset, inset, split - 4, size, block, kind, random));
    buildings.push(makeBuilding(inset + split + 4, inset + Math.round(random() * 14), size - split - 4, size - Math.round(random() * 14), block, second, random));
  } else {
    buildings.push(makeBuilding(inset, inset, size, size, block, kind, random));
  }
  let sign = null;
  if (block.sign) {
    const host = buildings[0];
    const side = (block.seed >>> 12) & 1;
    sign = {
      x: side ? host.x + host.w - 6 : host.x + 6,
      y: host.y + host.roofH + host.facade / 2,
      h: Math.min(40, host.facade + 14),
      color: SIGN_COLORS[(block.seed >>> 3) % SIGN_COLORS.length],
    };
  }
  // Lamps sit on the sidewalk at two of the four lot corners.
  const corners = [[7, 7], [LOT - 7, 7], [7, LOT - 7], [LOT - 7, LOT - 7]];
  const skip = block.seed % 4;
  const lamps = corners.filter((_, index) => index !== skip && index !== (skip + 2) % 4)
    .map(([x, y]) => ({ x, y }));
  const trees = [];
  if (inset >= 21) {
    const count = 2 + (block.seed >>> 20) % 2;
    for (let i = 0; i < count; i++) trees.push({ x: inset + ((i + 0.5) / count) * size, y: LOT - inset / 2, r: Math.min(7, inset * 0.32) });
  }
  return {
    column,
    row,
    hue: block.hue,
    height: block.height,
    inset,
    buildings,
    sign,
    lamps,
    trees,
  };
}

function lanternsAlong(x1, y1, x2, y2, count, sag, random, colorSeed) {
  const lanterns = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    const bulge = Math.sin(t * Math.PI) * sag;
    lanterns.push({
      x: x1 + (x2 - x1) * t + bulge * 0.35,
      y: y1 + (y2 - y1) * t + bulge,
      color: FESTIVAL[(colorSeed + i) % FESTIVAL.length],
      index: i,
      size: 5 + random() * 2,
    });
  }
  return lanterns;
}

// Decorations on the street segment leaving intersection (column, row)
// along `axis` ('x' heads east, 'y' heads south). `blocks` lists the lots
// either side; the renderer lights the decorations when one of them is lit.
export function segmentDecor(column, row, axis, seed) {
  const value = hash2(column * 2 + (axis === 'x' ? 0 : 1), row, seed ^ 0x6c8e9cf5);
  const random = rng(value);
  const x0 = column * BLOCK;
  const y0 = row * BLOCK;
  const along = BLOCK / 2 + (random() - 0.5) * 70;
  const blocks = axis === 'x' ? [[column, row - 1], [column, row]] : [[column - 1, row], [column, row]];
  let string = null;
  if (random() < 0.72) {
    const reach = ROAD_HALF + 5;
    const [x1, y1, x2, y2] = axis === 'x'
      ? [x0 + along, y0 - reach, x0 + along, y0 + reach]
      : [x0 - reach, y0 + along, x0 + reach, y0 + along];
    string = { x1, y1, x2, y2, lanterns: lanternsAlong(x1, y1, x2, y2, 3, 7, random, value % FESTIVAL.length) };
  }
  const puddles = [];
  const count = Math.floor(random() * 2.6);
  for (let i = 0; i < count; i++) {
    const t = ROAD_HALF + 22 + random() * (BLOCK - ROAD_HALF * 2 - 44);
    const side = (random() < 0.5 ? -1 : 1) * (8 + random() * 30);
    const rx = 14 + random() * 18;
    const ry = 6 + random() * 6;
    puddles.push(axis === 'x'
      ? { x: x0 + t, y: y0 + side, rx, ry }
      : { x: x0 + side, y: y0 + t, rx: ry, ry: rx });
  }
  return { blocks, string, puddles };
}

// Some intersections get a diagonal string of lanterns over the crossing.
export function crossingDecor(column, row, seed) {
  const value = hash2(column, row, seed ^ 0x1b873593);
  if (value % 100 >= 36) return null;
  const random = rng(value);
  const x = column * BLOCK;
  const y = row * BLOCK;
  const reach = ROAD_HALF + 4;
  const flip = (value >>> 8) & 1 ? 1 : -1;
  const x1 = x - reach;
  const y1 = y - reach * flip;
  const x2 = x + reach;
  const y2 = y + reach * flip;
  return {
    blocks: [[column - 1, row - 1], [column, row - 1], [column - 1, row], [column, row]],
    string: { x1, y1, x2, y2, lanterns: lanternsAlong(x1, y1, x2, y2, 4, 9, random, value % FESTIVAL.length) },
  };
}
