// Daily Delivery: one generated puzzle per local date, verified by the
// solver. DOM-free and deterministic (same date, same puzzle).

import { makeRng } from './rng.js';
import { parseLevel, COLOR_LETTER } from './board.js';
import { solve } from './solver.js';

const W = 7;
const H = 5;
const SCENERY_BY_WORLD = ['tfk', 'tw', 'nhf', 'pk', 'hcl', 'lt'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];

function attempt(rng) {
  const world = rng.int(SCENERY_BY_WORLD.length);
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  const keep = new Set(); // cells that must stay grass
  const roll = rng.next();
  const mechanic = roll < 0.3 ? 'cross' : roll < 0.55 ? 'switch' : roll < 0.75 ? 'paint' : 'plain';
  const colors = rng.shuffle(COLORS);
  const level = { name: 'Daily Delivery', map: null, stock: { X: 0, W: 0 }, world };

  const trainCount = mechanic === 'switch' ? 2 : rng.chance(0.45) ? 3 : 2;
  const rows = rng.shuffle([0, 1, 2, 3, 4]);
  const depotRows = rows.slice(0, mechanic === 'switch' ? 1 : trainCount).sort((a, b) => a - b);
  const stationRows = rng.shuffle([0, 1, 2, 3, 4]).slice(0, trainCount).sort((a, b) => a - b);

  const trainColors = colors.slice(0, trainCount);
  let stationColors = rng.shuffle(trainColors);
  if (mechanic === 'plain') stationColors = trainColors.slice(); // no crossings needed by order
  if (mechanic === 'cross') {
    level.stock.X = trainCount === 3 ? 2 : 1;
    if (stationColors.every((c, i) => c === trainColors[i])) stationColors = trainColors.slice().reverse();
  }
  if (mechanic === 'switch') level.stock.W = 1;

  const depots = [];
  if (mechanic === 'switch') {
    const y = depotRows[0];
    grid[y][0] = `${COLOR_LETTER[trainColors[0]]}>`;
    level.queue = { [`0,${y}`]: trainColors.map((c) => COLOR_LETTER[c]).join('') };
    depots.push(y);
  } else {
    depotRows.forEach((y, k) => { grid[y][0] = `${COLOR_LETTER[trainColors[k]]}>`; depots.push(y); });
  }
  for (const y of depots) keep.add(`1,${y}`);
  stationRows.forEach((y, k) => {
    grid[y][W - 1] = `${COLOR_LETTER[stationColors[k]].toUpperCase()}-`;
    keep.add(`${W - 2},${y}`);
  });
  // Unused right-column and left-column cells become scenery or stay grass.
  if (mechanic === 'paint') {
    // One train must be repainted: its station takes a colour nobody has.
    const k = rng.int(trainCount);
    const fresh = colors[trainCount];
    const sk = stationColors.indexOf(trainColors[k]);
    stationColors[sk] = fresh;
    grid[stationRows[sk]][W - 1] = `${COLOR_LETTER[fresh].toUpperCase()}-`;
    const px = rng.range(2, W - 3), py = rng.range(0, H - 1);
    grid[py][px] = `${COLOR_LETTER[fresh].toUpperCase()}${rng.chance(0.5) ? '=' : '!'}`;
    keep.add(`${px - 1},${py}`); keep.add(`${px + 1},${py}`); keep.add(`${px},${py - 1}`); keep.add(`${px},${py + 1}`);
  }
  const deco = SCENERY_BY_WORLD[world];
  const density = 0.14 + rng.next() * 0.12;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== '.' || keep.has(`${x},${y}`)) continue;
      const edge = x === 0 || x === W - 1;
      if (rng.next() < (edge ? 0.5 : density)) grid[y][x] = deco[rng.int(deco.length)];
    }
  }
  level.map = grid.map((r) => r.join(' '));
  return level;
}

export function generateDaily(dateKey, { attempts = 60, nodeLimit = 20000 } = {}) {
  for (let n = 0; n < attempts; n++) {
    const rng = makeRng(`tiny-trains:${dateKey}:${n}`);
    const raw = attempt(rng);
    const board = parseLevel({ ...raw, id: 'daily' });
    if (board.errors.length) continue;
    const result = solve(board, { nodeLimit, maxCost: 24 });
    // Skip dull ones where every train just runs straight across.
    if (!result.solved || result.par < 6 || result.par <= board.trains.length * (W - 2) + 1) continue;
    return { ...raw, id: 'daily', date: dateKey, par: result.par, attempt: n, nodes: result.nodes };
  }
  // A safe fallback that is always solvable.
  const fallback = {
    id: 'daily', date: dateKey, name: 'Daily Delivery', world: 0, attempt: -1,
    map: ['t . . . . . f', 'r> . . . . . R-', '. . k . t . .', 'b> . . . . . B-', 'f . . . . . t'],
    stock: { X: 0, W: 0 },
  };
  fallback.par = solve(parseLevel(fallback)).par;
  return fallback;
}
