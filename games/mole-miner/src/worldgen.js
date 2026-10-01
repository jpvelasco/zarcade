// Deterministic mine generation. Same seed and config, same mine, always.
import { makeRng } from './rng.js';
import { T, D, LAYERS, ORES, MUSEUM, MAIN_WORLD, layerIndexForRow } from './data.js';

// Rows of the main mine where each layer starts, plus the bottom.
const MAIN_TOPS = LAYERS.map((l) => l.top);

// Map a row of a (possibly squeezed) mine to the matching main-mine row, so
// ore tables written for the main mine work in the daily mine too.
export function mainRowFor(row, tops, h) {
  if (tops === MAIN_TOPS) return row;
  const li = layerIndexForRow(row, tops);
  const a0 = tops[li], a1 = li + 1 < tops.length ? tops[li + 1] : h - 1;
  const b0 = MAIN_TOPS[li], b1 = li + 1 < MAIN_TOPS.length ? MAIN_TOPS[li + 1] : MAIN_WORLD.h - 1;
  return Math.round(b0 + ((row - a0) / Math.max(1, a1 - a0)) * (b1 - b0));
}

export function oreWeights(mainRow) {
  return ORES.map((o) => {
    if (mainRow < o.rows[0] || mainRow > o.rows[1]) return 0;
    const span = mainRow < o.peak ? o.peak - o.rows[0] : o.rows[1] - o.peak;
    return Math.max(0.12, 1 - Math.abs(mainRow - o.peak) / Math.max(1, span));
  });
}

export function generateWorld(seed, cfg = MAIN_WORLD) {
  const rng = makeRng(`mole-miner:${seed}:${cfg.w}x${cfg.h}`);
  const { w, h } = cfg;
  const tops = cfg.layerTops || MAIN_TOPS;
  const tiles = new Uint8Array(w * h);
  const deco = new Uint8Array(w * h);
  const layerOf = new Uint8Array(h);
  for (let y = 0; y < h; y++) layerOf[y] = layerIndexForRow(y, tops);
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => x > 0 && x < w - 1 && y >= 0 && y < h - 1;
  const layerBottom = (li) => (li + 1 < tops.length ? tops[li + 1] - 1 : h - 2);

  // 1. Solid layer rock, bedrock frame, the base pad.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles[idx(x, y)] = (x === 0 || x === w - 1 || y === h - 1) ? T.BEDROCK : T.SOIL;
    }
  }
  for (let x = cfg.baseX0; x <= cfg.baseX1; x++) tiles[idx(x, 0)] = T.PAD;

  // 2. Caves: wandering blobs carved inside each layer, never in the top
  // three rows (those gate the layer) or the bottom two.
  const caveBlobs = [];
  tops.forEach((top, li) => {
    const L = LAYERS[li];
    if (!L.caves) return;
    const y0 = top + 3, y1 = layerBottom(li) - 2;
    if (y1 - y0 < 3) return;
    const area = (y1 - y0 + 1) * (w - 4);
    let carved = 0;
    const target = area * L.caves;
    let guard = 0;
    while (carved < target && guard++ < 200) {
      let x = rng.int(3, w - 4), y = rng.int(y0 + 1, y1 - 1);
      const steps = rng.int(4, li >= 3 ? 14 : 6);
      const r0 = li >= 3 ? 1.6 : 1.0;
      const blob = { x, y, cells: [] };
      for (let s = 0; s < steps; s++) {
        const r = r0 + rng() * (li >= 3 ? 1.3 : 0.6);
        for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
          for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
            if (xx < 2 || xx > w - 3 || yy < y0 || yy > y1) continue;
            if ((xx - x) ** 2 + ((yy - y) * 1.25) ** 2 > r * r) continue;
            const i = idx(xx, yy);
            if (tiles[i] === T.SOIL) { tiles[i] = T.EMPTY; carved++; blob.cells.push(i); }
          }
        }
        x = Math.max(3, Math.min(w - 4, x + (rng() * 2 - 1) * 2.2));
        y = Math.max(y0 + 1, Math.min(y1 - 1, y + (rng() * 2 - 1) * 1.2));
      }
      if (blob.cells.length) caveBlobs.push({ ...blob, li });
    }
  });

  // 3. Lava: a two-row crust at the top of Lava Lands, and pools in the
  // lower half of its caves.
  const lavaLi = LAYERS.findIndex((l) => l.id === 'lava');
  if (lavaLi < tops.length) {
    const top = tops[lavaLi];
    for (let y = top; y <= top + 1; y++) for (let x = 1; x < w - 1; x++) tiles[idx(x, y)] = T.LAVA;
    for (const b of caveBlobs) {
      if (b.li !== lavaLi) continue;
      for (const i of b.cells) if (Math.floor(i / w) >= b.y) tiles[i] = T.LAVA;
    }
  }

  // 4. Ruins: brick rooms with chests, and the core chamber at the bottom.
  const ruinsLi = LAYERS.findIndex((l) => l.id === 'ruins');
  const rooms = [];
  let core = null;
  if (ruinsLi < tops.length) {
    const top = tops[ruinsLi] + 3;
    const bottom = cfg.core ? h - 14 : h - 3;
    let guard = 0;
    while (rooms.length < 6 && guard++ < 80) {
      const rw = rng.int(6, 10), rh = rng.int(4, 6);
      const x0 = rng.int(2, w - 3 - rw), y0 = rng.int(top, bottom - rh);
      if (rooms.some((r) => x0 < r.x0 + r.w + 2 && x0 + rw + 2 > r.x0 && y0 < r.y0 + r.h + 2 && y0 + rh + 2 > r.y0)) continue;
      rooms.push({ x0, y0, w: rw, h: rh });
      for (let y = y0; y < y0 + rh; y++) {
        for (let x = x0; x < x0 + rw; x++) {
          const edge = y === y0 || y === y0 + rh - 1 || x === x0 || x === x0 + rw - 1;
          tiles[idx(x, y)] = edge ? T.BRICK : T.EMPTY;
        }
      }
      // Torches on the back wall and a pillar or two.
      deco[idx(x0 + 1, y0 + 1)] = D.TORCH;
      deco[idx(x0 + rw - 2, y0 + 1)] = D.TORCH;
    }
    if (cfg.core) {
      const cx = Math.floor(w / 2);
      const y0 = h - 11, y1 = h - 2; // ceiling row .. floor row
      for (let y = y0; y <= y1; y++) {
        for (let x = cx - 7; x <= cx + 7; x++) {
          const edge = y === y0 || y === y1 || x === cx - 7 || x === cx + 7;
          tiles[idx(x, y)] = edge ? T.BRICK : T.EMPTY;
        }
      }
      for (const px of [cx - 4, cx + 4]) for (let y = y0 + 1; y < y1; y++) deco[idx(px, y)] = D.PILLAR;
      deco[idx(cx - 6, y0 + 2)] = D.TORCH;
      deco[idx(cx + 6, y0 + 2)] = D.TORCH;
      core = { x: cx, y: y1 - 1 };
      tiles[idx(core.x, core.y)] = T.CORE;
    }
  }

  // 5. Decorations on cave floors and ceilings; bouncy caps in the grotto.
  for (let y = 1; y < h - 1; y++) {
    const L = LAYERS[layerOf[y]];
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y);
      if (tiles[i] !== T.EMPTY || deco[i]) continue;
      const below = tiles[idx(x, y + 1)], above = tiles[idx(x, y - 1)];
      if (L.id === 'crystal') {
        if (below === T.SOIL && rng.chance(0.45)) deco[i] = D.CRYSTAL_UP;
        else if (above === T.SOIL && rng.chance(0.35)) deco[i] = D.CRYSTAL_DOWN;
      } else if (L.id === 'mushroom') {
        if (below === T.SOIL) {
          if (rng.chance(0.12)) tiles[idx(x, y + 1)] = T.BOUNCE;
          else if (rng.chance(0.5)) deco[i] = D.SHROOM;
        } else if (above === T.SOIL && rng.chance(0.2)) deco[i] = D.ROOTS;
      } else if (L.id === 'meadow' || L.id === 'clay') {
        if (above === T.SOIL && rng.chance(0.3)) deco[i] = D.ROOTS;
      }
    }
  }

  // 6. Ores, gas pockets, boulders. Ores use the main-mine row tables.
  const pickOre = (row) => {
    const ws = oreWeights(mainRowFor(row, tops, h));
    let sum = 0;
    for (const v of ws) sum += v;
    if (!sum) return -1;
    let r = rng() * sum;
    for (let k = 0; k < ws.length; k++) { r -= ws[k]; if (r <= 0) return k; }
    return ws.length - 1;
  };
  for (let y = 1; y < h - 1; y++) {
    const L = LAYERS[layerOf[y]];
    for (let x = 1; x < w - 1; x++) {
      const i = idx(x, y);
      if (tiles[i] !== T.SOIL) continue;
      const roll = rng();
      if (roll < L.density) {
        const k = pickOre(y);
        if (k >= 0) tiles[i] = T.ORE0 + k;
      } else if (y > 12 && roll < L.density + L.gas) {
        tiles[i] = T.GAS;
      } else if (y > 8 && roll < L.density + L.gas + L.boulder) {
        const below = tiles[idx(x, y + 1)];
        if (below !== T.EMPTY && below !== T.LAVA) tiles[i] = T.BOULDER;
      }
    }
  }

  // 7. Fuel cans: a few per layer for long trips.
  const freeSoil = (y0, y1, x0 = 2, x1 = w - 3) => {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.int(x0, x1), y = rng.int(y0, y1);
      if (inside(x, y) && tiles[idx(x, y)] === T.SOIL) return { x, y };
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tiles[idx(x, y)] === T.SOIL) return { x, y };
    return null;
  };
  tops.forEach((top, li) => {
    if (li === 0) return;
    for (let k = 0; k < 3; k++) {
      const p = freeSoil(top + 2, layerBottom(li) - 1);
      if (p) tiles[idx(p.x, p.y)] = T.FUEL;
    }
  });

  // 8. Museum pieces: four per set, spread through the set's layers. Ruins
  // treasures sit in chests on room floors when there are rooms.
  const pieces = [];
  if (cfg.relics) {
    MUSEUM.forEach((set, si) => {
      const y0 = tops[set.layers[0]] + 3;
      const y1 = layerBottom(set.layers[set.layers.length - 1]) - 1;
      set.pieces.forEach((id, pi) => {
        const band0 = Math.floor(y0 + ((y1 - y0) * pi) / 4), band1 = Math.floor(y0 + ((y1 - y0) * (pi + 1)) / 4);
        let spot = null;
        if (set.id === 'ruins' && rooms[pi]) {
          const r = rooms[pi];
          spot = { x: r.x0 + 1 + rng.int(1, r.w - 4), y: r.y0 + r.h - 2 };
        } else {
          spot = freeSoil(band0, Math.max(band0, band1));
        }
        if (!spot) return;
        tiles[idx(spot.x, spot.y)] = T.RELIC0 + si * 4 + pi;
        pieces.push({ index: si * 4 + pi, x: spot.x, y: spot.y });
      });
    });
  }

  // 9. The daily mine hides a Golden Acorn deep down.
  let acorn = null;
  if (!cfg.relics) {
    const p = freeSoil(Math.floor(h * 0.55), h - 4);
    if (p) { tiles[idx(p.x, p.y)] = T.ACORN; acorn = p; }
  }

  return { seed, cfg, w, h, tops, tiles, deco, layerOf, core, rooms, pieces, acorn };
}
