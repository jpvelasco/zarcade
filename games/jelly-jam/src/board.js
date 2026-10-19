// The jelly board: cells, matching, gravity and shuffling.
// Everything here is DOM-free so Node tests can drive a whole game.
import { Rng } from './rng.js';

export const COLOR_COUNT = 6;
export const COLOR_NAMES = ['Strawberry', 'Kiwi', 'Bubblegum', 'Mango', 'Blueberry', 'Grape'];

export const STRIPE_H = 'stripeH';
export const STRIPE_V = 'stripeV';
export const BOMB = 'bomb';
export const RAINBOW = 'rainbow';

let idCounter = 0;

export function jelly(color, special = null, ice = 0) {
  return { id: ++idCounter, kind: 'jelly', color, special, ice, born: 0 };
}

export function coral(hits = 1) {
  return { id: ++idCounter, kind: 'coral', color: null, special: null, ice: 0, hits, max: hits };
}

export function egg() {
  return { id: ++idCounter, kind: 'egg', color: null, special: null, ice: 0 };
}

export const isJelly = (cell) => !!cell && cell.kind === 'jelly';
// Ice-locked jellies and coral never move; eggs and free jellies fall.
export const isMovable = (cell) => !!cell && cell.kind !== 'coral' && !(cell.kind === 'jelly' && cell.ice > 0);
// Only free, colored jellies take part in matches. Rainbow pearls have no color.
export const isMatchable = (cell) => isJelly(cell) && cell.ice === 0 && cell.color !== null;
export const isSwappable = (cell) => isJelly(cell) && cell.ice === 0;

export class Board {
  constructor({ w = 8, h = 8, mask = null, ground = null, colors = COLOR_COUNT, rng = new Rng(1) } = {}) {
    this.w = w;
    this.h = h;
    this.colors = colors;
    this.rng = rng;
    this.mask = mask ? mask.slice() : new Array(w * h).fill(true);
    this.ground = ground ? ground.slice() : new Array(w * h).fill(0);
    this.cells = new Array(w * h).fill(null);
    this.spawners = new Set();
    this.exits = new Set();
    for (let c = 0; c < w; c++) {
      for (let r = 0; r < h; r++) {
        if (this.playable(this.idx(c, r))) { this.spawners.add(this.idx(c, r)); break; }
      }
      for (let r = h - 1; r >= 0; r--) {
        if (this.playable(this.idx(c, r))) { this.exits.add(this.idx(c, r)); break; }
      }
    }
  }

  idx(c, r) { return r * this.w + c; }
  col(i) { return i % this.w; }
  row(i) { return Math.floor(i / this.w); }
  inside(c, r) { return c >= 0 && c < this.w && r >= 0 && r < this.h; }
  playable(i) { return i >= 0 && i < this.mask.length && this.mask[i]; }
  at(i) { return this.cells[i] ?? null; }

  playableIndices() {
    const out = [];
    for (let i = 0; i < this.mask.length; i++) if (this.mask[i]) out.push(i);
    return out;
  }

  newJelly() {
    return jelly(this.rng.int(this.colors));
  }

  // A color for (c, r) that cannot finish a run of three with what is already
  // placed above and to the left. Used when dealing a fresh board.
  safeColor(c, r) {
    const bad = new Set();
    const colorAt = (cc, rr) => {
      if (!this.inside(cc, rr)) return -1;
      const cell = this.at(this.idx(cc, rr));
      return isMatchable(cell) ? cell.color : -1;
    };
    if (colorAt(c - 1, r) >= 0 && colorAt(c - 1, r) === colorAt(c - 2, r)) bad.add(colorAt(c - 1, r));
    if (colorAt(c, r - 1) >= 0 && colorAt(c, r - 1) === colorAt(c, r - 2)) bad.add(colorAt(c, r - 1));
    const pool = [];
    for (let k = 0; k < this.colors; k++) if (!bad.has(k)) pool.push(k);
    return this.rng.pick(pool.length ? pool : [this.rng.int(this.colors)]);
  }

  fillEmpty() {
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const i = this.idx(c, r);
        if (this.playable(i) && !this.at(i)) this.cells[i] = jelly(this.safeColor(c, r));
      }
    }
  }

  clone() {
    const b = new Board({ w: this.w, h: this.h, mask: this.mask, ground: this.ground, colors: this.colors, rng: this.rng.clone() });
    b.cells = this.cells.map((cell) => (cell ? { ...cell } : null));
    return b;
  }
}

// ---------------------------------------------------------------- matching

// Every horizontal and vertical run of three or more same-colored jellies.
export function findRuns(board) {
  const runs = [];
  const scan = (dir, outer, inner, toIdx) => {
    for (let a = 0; a < outer; a++) {
      let start = 0;
      while (start < inner) {
        const first = board.at(toIdx(a, start));
        if (!isMatchable(first)) { start++; continue; }
        let end = start + 1;
        while (end < inner) {
          const next = board.at(toIdx(a, end));
          if (!isMatchable(next) || next.color !== first.color) break;
          end++;
        }
        if (end - start >= 3) {
          const cells = [];
          for (let k = start; k < end; k++) cells.push(toIdx(a, k));
          runs.push({ dir, color: first.color, cells });
        }
        start = end;
      }
    }
  };
  scan('h', board.h, board.w, (r, c) => board.idx(c, r));
  scan('v', board.w, board.h, (c, r) => board.idx(c, r));
  return runs;
}

// Merges crossing runs of the same color into one group and works out what
// special (if any) the group creates.
export function findMatches(board, origin = -1) {
  const runs = findRuns(board);
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map();
  runs.forEach((run, i) => {
    for (const cell of run.cells) {
      if (owner.has(cell)) parent[find(i)] = find(owner.get(cell));
      else owner.set(cell, i);
    }
  });
  const byRoot = new Map();
  runs.forEach((run, i) => {
    const root = find(i);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(run);
  });
  const groups = [];
  for (const group of byRoot.values()) {
    const cells = [...new Set(group.flatMap((r) => r.cells))].sort((a, b) => a - b);
    const longest = group.reduce((best, r) => (r.cells.length > best.cells.length ? r : best), group[0]);
    const hasH = group.some((r) => r.dir === 'h');
    const hasV = group.some((r) => r.dir === 'v');
    let shape = 'line3';
    let special = null;
    if (longest.cells.length >= 5) { shape = 'line5'; special = RAINBOW; }
    else if (hasH && hasV) { shape = 'cross'; special = BOMB; }
    else if (longest.cells.length === 4) { shape = 'line4'; special = longest.dir === 'h' ? STRIPE_H : STRIPE_V; }
    groups.push({ color: group[0].color, cells, shape, special, at: specialSpot(group, cells, origin) });
  }
  return groups;
}

function specialSpot(runs, cells, origin) {
  // The special lands where the player's own jellies ended up, if it can.
  for (const spot of Array.isArray(origin) ? origin : [origin]) {
    if (cells.includes(spot)) return spot;
  }
  const hs = runs.filter((r) => r.dir === 'h');
  const vs = runs.filter((r) => r.dir === 'v');
  for (const hr of hs) {
    for (const vr of vs) {
      const shared = hr.cells.find((c) => vr.cells.includes(c));
      if (shared !== undefined) return shared;
    }
  }
  const longest = runs.reduce((best, r) => (r.cells.length > best.cells.length ? r : best), runs[0]);
  return longest.cells[Math.floor(longest.cells.length / 2)];
}

// ---------------------------------------------------------------- moves

export function wouldMatch(board, a, b) {
  const copy = board.cells;
  [copy[a], copy[b]] = [copy[b], copy[a]];
  const groups = findMatches(board);
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return groups;
}

export function swapAllowed(board, a, b) {
  if (!board.playable(a) || !board.playable(b)) return false;
  if (Math.abs(board.col(a) - board.col(b)) + Math.abs(board.row(a) - board.row(b)) !== 1) return false;
  return isSwappable(board.at(a)) && isSwappable(board.at(b));
}

// Every legal swap. Swapping a special always counts: it fires on its own.
export function findMoves(board) {
  const moves = [];
  for (let r = 0; r < board.h; r++) {
    for (let c = 0; c < board.w; c++) {
      const a = board.idx(c, r);
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        if (!board.inside(c + dc, r + dr)) continue;
        const b = board.idx(c + dc, r + dr);
        if (!swapAllowed(board, a, b)) continue;
        const ca = board.at(a), cb = board.at(b);
        if (ca.special || cb.special) { moves.push({ a, b, kind: 'special' }); continue; }
        const groups = wouldMatch(board, a, b);
        if (groups.length) {
          const size = groups.reduce((n, g) => n + g.cells.length, 0);
          moves.push({ a, b, kind: 'match', size, makes: groups.find((g) => g.special)?.special ?? null });
        }
      }
    }
  }
  return moves;
}

export function hasMoves(board) {
  return findMoves(board).length > 0;
}

// Re-deals the colors of the free jellies until the board has a move and no
// match sitting on it. Returns the list of jellies that changed color.
export function shuffleBoard(board, rng = board.rng) {
  const spots = board.playableIndices().filter((i) => isMatchable(board.at(i)) && !board.at(i).special);
  const before = spots.map((i) => board.at(i).color);
  for (let attempt = 0; attempt < 200; attempt++) {
    // A stubborn mix gets fresh colors before it is shuffled, so the board
    // left behind is always one that was checked.
    if (attempt > 61) spots.forEach((i) => { board.at(i).color = rng.int(board.colors); });
    const colors = spots.map((i) => board.at(i).color);
    rng.shuffle(colors);
    spots.forEach((i, k) => { board.at(i).color = colors[k]; });
    if (!findMatches(board).length && hasMoves(board)) break;
  }
  return spots.filter((i, k) => board.at(i).color !== before[k]);
}

// ---------------------------------------------------------------- gravity

function diagonalSource(board, c, r) {
  for (const dc of [-1, 1]) {
    if (!board.inside(c + dc, r - 1)) continue;
    const j = board.idx(c + dc, r - 1);
    if (!board.playable(j) || !isMovable(board.at(j))) continue;
    const below = board.idx(c + dc, r);
    // Only slide sideways when the cell cannot simply drop straight down.
    if (board.playable(below) && !board.at(below)) continue;
    return j;
  }
  return -1;
}

// Drops everything as far as it goes and refills from the top. Reports where
// each cell started so the view can animate the whole fall in one motion.
export function settle(board, { spawn = true } = {}) {
  const origin = new Map();
  for (let i = 0; i < board.cells.length; i++) if (board.cells[i]) origin.set(board.cells[i], i);
  const spawnOrder = new Map();
  const perColumn = new Array(board.w).fill(0);
  const limit = board.w * board.h * 4;
  for (let pass = 0; pass < limit; pass++) {
    let moved = false;
    for (let r = board.h - 1; r >= 0; r--) {
      for (let c = 0; c < board.w; c++) {
        const i = board.idx(c, r);
        if (!board.playable(i) || board.at(i)) continue;
        const above = board.inside(c, r - 1) ? board.idx(c, r - 1) : -1;
        if (above >= 0 && board.playable(above)) {
          const cell = board.at(above);
          if (isMovable(cell)) {
            board.cells[i] = cell;
            board.cells[above] = null;
            moved = true;
            continue;
          }
          if (!cell) continue; // still empty, it will be filled first
        } else if (spawn && board.spawners.has(i)) {
          const fresh = board.newJelly();
          board.cells[i] = fresh;
          spawnOrder.set(fresh, ++perColumn[c]);
          moved = true;
          continue;
        }
        const d = diagonalSource(board, c, r);
        if (d >= 0) {
          board.cells[i] = board.cells[d];
          board.cells[d] = null;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  const moves = [];
  const spawns = [];
  for (let i = 0; i < board.cells.length; i++) {
    const cell = board.cells[i];
    if (!cell) continue;
    if (origin.has(cell)) {
      const from = origin.get(cell);
      if (from !== i) moves.push({ id: cell.id, from, to: i });
    } else {
      spawns.push({ id: cell.id, to: i, above: spawnOrder.get(cell) ?? 1, cell });
    }
  }
  return { moves, spawns };
}

// Eggs that reached the bottom of their column hatch out of the board.
export function collectEggs(board) {
  const hatched = [];
  for (const i of board.exits) {
    const cell = board.at(i);
    if (cell && cell.kind === 'egg') {
      hatched.push({ index: i, id: cell.id });
      board.cells[i] = null;
    }
  }
  return hatched;
}
