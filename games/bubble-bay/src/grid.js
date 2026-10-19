// The hex bubble grid, shot tracing, matching and dropping. DOM-free and
// deterministic: the browser and the Node tests run exactly this code.
//
// Units are bubble radii. Even rows hold W cells, odd rows W - 1, shifted half
// a bubble right, so the field is exactly 2W radii wide. Grid row 0 hangs from
// the ceiling; the ceiling creeps down `drop` rows over a level.

export const W = 10;
export const ROWS = 15;
export const ROW_H = Math.sqrt(3);
export const FIELD_W = W * 2;
export const LOSE_ROW = 13;
export const LAUNCH_Y = 1 + LOSE_ROW * ROW_H + 1.7;
export const FIELD_H = LAUNCH_Y + 1.6;
export const HIT_DIST = 1.7;
export const MIN_ANGLE = (10 * Math.PI) / 180;
export const MAX_ANGLE = Math.PI - MIN_ANGLE;
export const BLAST_RADIUS = 2;

export const COLOR_NAMES = ['coral', 'sun', 'kelp', 'sea', 'shell', 'berry'];
export const MAX_COLORS = COLOR_NAMES.length;

// Kinds of piece that can sit in a cell.
//   b        color bubble       { k: 'b', c }
//   rainbow  joins any color    { k: 'rainbow' }
//   stone    never matches      { k: 'stone' }
//   ice      frozen color       { k: 'ice', c, hp }
//   bomb     radius-2 blast     { k: 'bomb' }
//   zap      clears its row     { k: 'zap' }
//   otter    baby otter         { k: 'otter', o }
//   anchor   drop it to win     { k: 'anchor' }

export const SIZE = ROWS * W;
export const cols = (r) => (r & 1 ? W - 1 : W);
export const rowOf = (i) => (i / W) | 0;
export const colOf = (i) => i % W;
export const index = (r, c) => r * W + c;
export const valid = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < cols(r);

// Cell centers relative to the ceiling, and neighbor lists, precomputed.
export const CX = new Float64Array(SIZE);
export const CY = new Float64Array(SIZE);
export const VALID = new Uint8Array(SIZE);
export const NEIGHBORS = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < W; c++) {
    const i = index(r, c);
    VALID[i] = valid(r, c) ? 1 : 0;
    CX[i] = 1 + 2 * c + (r & 1);
    CY[i] = 1 + r * ROW_H;
    const list = [];
    if (VALID[i]) {
      const near = r & 1
        ? [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
        : [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
      for (const [nr, nc] of near) if (valid(nr, nc)) list.push(index(nr, nc));
    }
    NEIGHBORS.push(list);
  }
}

// Hex distance between two cells (offset rows -> cube coordinates).
export function hexDistance(a, b) {
  const cube = (i) => {
    const r = rowOf(i);
    const x = colOf(i) - (r - (r & 1)) / 2;
    return [x, r, -x - r];
  };
  const p = cube(a), q = cube(b);
  return Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
}

export class Board {
  constructor(cells = new Array(SIZE).fill(null), drop = 0) {
    this.cells = cells;
    this.drop = drop;
  }

  clone() {
    return new Board(this.cells.slice(), this.drop);
  }

  at(i) {
    return this.cells[i];
  }

  // Screen y of a cell (the ceiling sits at drop * ROW_H).
  y(i) {
    return CY[i] + this.drop * ROW_H;
  }

  get ceilingY() {
    return this.drop * ROW_H;
  }

  count(pred = () => true) {
    let n = 0;
    for (let i = 0; i < SIZE; i++) if (this.cells[i] && pred(this.cells[i], i)) n++;
    return n;
  }

  isEmpty() {
    return this.count() === 0;
  }

  // Colors still in play (color bubbles and ice), sorted.
  colorsPresent() {
    const seen = new Set();
    for (const cell of this.cells) {
      if (cell && (cell.k === 'b' || cell.k === 'ice')) seen.add(cell.c);
    }
    return [...seen].sort((a, b) => a - b);
  }

  // Lowest occupied screen row, or -1 when empty.
  lowestRow() {
    for (let i = SIZE - 1; i >= 0; i--) if (this.cells[i]) return rowOf(i) + this.drop;
    return -1;
  }

  pastLine() {
    return this.lowestRow() >= LOSE_ROW;
  }

  // Cells not reachable from the ceiling.
  floating() {
    const seen = new Uint8Array(SIZE);
    const stack = [];
    for (let c = 0; c < W; c++) if (this.cells[c]) { seen[c] = 1; stack.push(c); }
    while (stack.length) {
      const i = stack.pop();
      for (const n of NEIGHBORS[i]) {
        if (!seen[n] && this.cells[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    const out = [];
    for (let i = 0; i < SIZE; i++) if (this.cells[i] && !seen[i]) out.push(i);
    return out;
  }
}

// Cells whose center is near (x, y) in screen space: a small window around
// the row and column the point falls in.
function nearbyCells(board, x, y, out) {
  out.length = 0;
  const rr = Math.round((y - board.ceilingY - 1) / ROW_H);
  for (let r = rr - 1; r <= rr + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    const cc = Math.round((x - 1 - (r & 1)) / 2);
    for (let c = cc - 1; c <= cc + 1; c++) {
      if (valid(r, c)) out.push(index(r, c));
    }
  }
  return out;
}

const SCRATCH = [];

// Nearest free cell to (x, y) that touches the ceiling or `hit`.
function snapCell(board, x, y, hit) {
  const options = hit >= 0 ? NEIGHBORS[hit].slice() : [];
  nearbyCells(board, x, y, SCRATCH);
  for (const i of SCRATCH) if (!options.includes(i)) options.push(i);
  let best = -1;
  let bestD = Infinity;
  for (const i of options) {
    if (board.cells[i]) continue;
    const r = rowOf(i);
    if (r + board.drop > LOSE_ROW + 1) continue;
    // must attach to something: the ceiling or an occupied neighbor
    const attached = r === 0 || NEIGHBORS[i].some((n) => board.cells[n]);
    if (!attached) continue;
    const d = (CX[i] - x) ** 2 + (board.y(i) - y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function clampAngle(angle) {
  return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
}

// Walks a shot from the launcher. Returns the path (screen-space points at
// the launch, every bounce and the stop), the landing cell (-1 when the
// lightning shot ends at the ceiling) and, for pass-through shots, every
// cell the shot touched on the way.
export function traceShot(board, angle, { pass = false, step = 0.1, maxSteps = 4000 } = {}) {
  angle = clampAngle(angle);
  let x = W;
  let y = LAUNCH_Y;
  let dx = Math.cos(angle);
  const dy = -Math.sin(angle);
  const path = [{ x, y }];
  const touched = [];
  const ceiling = board.ceilingY + 1;
  for (let s = 0; s < maxSteps; s++) {
    x += dx * step;
    y += dy * step;
    if (x < 1) { x = 2 - x; dx = -dx; path.push({ x: 1, y, bounce: true }); }
    else if (x > FIELD_W - 1) { x = 2 * (FIELD_W - 1) - x; dx = -dx; path.push({ x: FIELD_W - 1, y, bounce: true }); }
    if (y <= ceiling) {
      y = ceiling;
      path.push({ x, y });
      if (pass) return { path, land: -1, touched, angle };
      return { path, land: snapCell(board, x, y, -1), touched, angle, hit: -1 };
    }
    nearbyCells(board, x, y, SCRATCH);
    let hit = -1;
    let hitD = HIT_DIST * HIT_DIST;
    for (const i of SCRATCH) {
      const cell = board.cells[i];
      if (!cell) continue;
      const d = (CX[i] - x) ** 2 + (board.y(i) - y) ** 2;
      if (pass) {
        if (d < 1.9 * 1.9 && cell.k !== 'anchor' && !touched.includes(i)) touched.push(i);
        continue;
      }
      if (d < hitD) { hitD = d; hit = i; }
    }
    if (hit >= 0) {
      path.push({ x, y });
      return { path, land: snapCell(board, x, y, hit), touched, angle, hit };
    }
  }
  path.push({ x, y });
  return { path, land: -1, touched, angle, hit: -1 };
}

// Same-color group from a start cell, flowing through rainbows.
export function colorGroup(board, start, color) {
  const out = [start];
  const seen = new Set(out);
  for (let k = 0; k < out.length; k++) {
    for (const n of NEIGHBORS[out[k]]) {
      if (seen.has(n)) continue;
      const cell = board.cells[n];
      if (cell && ((cell.k === 'b' && cell.c === color) || cell.k === 'rainbow')) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

// Cells within hex distance `radius` of a center.
export function ring(center, radius) {
  const out = [center];
  const dist = new Map([[center, 0]]);
  for (let k = 0; k < out.length; k++) {
    const d = dist.get(out[k]);
    if (d >= radius) continue;
    for (const n of NEIGHBORS[out[k]]) {
      if (!dist.has(n)) { dist.set(n, d + 1); out.push(n); }
    }
  }
  return out;
}

const COUNTS_AS_BUBBLE = new Set(['b', 'rainbow', 'stone', 'ice', 'bomb', 'zap']);

// Places and resolves one shot. `shot` is { kind: 'b'|'rainbow'|'bomb'|'zap', c }.
// `trace` comes from traceShot. Mutates the board and returns what happened,
// in order, for the renderer and the score:
//   placed   cell index the bubble stuck to (or -1)
//   pops     [{ i, cell, t }] removed by matching, blasts or zaps (t = cascade step)
//   cracks   [{ i, cell }] ice that took a first hit
//   blasts   [{ i, kind: 'bomb'|'zap', t }]
//   freed    [{ i, cell, how: 'pop'|'drop', t }] otters rescued
//   drops    [{ i, cell }] cells that fell
//   anchor   true when the anchor fell
//   cleared  bubbles cleared (pops + drops, excluding otters and the anchor)
export function resolveShot(board, shot, trace) {
  const result = { placed: -1, pops: [], cracks: [], blasts: [], freed: [], drops: [], anchor: false, cleared: 0, matched: 0 };
  const removed = new Set();
  const hitIce = new Set();
  const queue = []; // { i, t, why }

  const remove = (i, t, why) => {
    if (removed.has(i)) return;
    const cell = board.cells[i];
    if (!cell || cell.k === 'anchor') return;
    removed.add(i);
    queue.push({ i, t, why });
  };

  if (shot.kind === 'zap') {
    trace.touched.forEach((i, k) => remove(i, Math.floor(k / 2), 'zap'));
  } else if (trace.land >= 0) {
    const land = trace.land;
    if (shot.kind === 'bomb') {
      board.cells[land] = { k: 'bomb' };
      result.placed = land;
      remove(land, 0, 'trigger');
    } else if (shot.kind === 'rainbow') {
      board.cells[land] = { k: 'rainbow' };
      result.placed = land;
      const colors = new Set();
      for (const n of NEIGHBORS[land]) {
        const cell = board.cells[n];
        if (cell && cell.k === 'b') colors.add(cell.c);
      }
      if (colors.size) {
        remove(land, 0, 'match');
        for (const color of [...colors].sort((a, b) => a - b)) {
          const group = colorGroup(board, land, color);
          bfsOrder(group, land).forEach(([i, d]) => remove(i, d, 'match'));
        }
      }
    } else {
      board.cells[land] = { k: 'b', c: shot.c };
      result.placed = land;
      const group = colorGroup(board, land, shot.c);
      if (group.length >= 3) {
        result.matched = group.length;
        bfsOrder(group, land).forEach(([i, d]) => remove(i, d, 'match'));
      }
    }
  }

  // Process removals in order; each can set off more.
  for (let k = 0; k < queue.length; k++) {
    const { i, t, why } = queue[k];
    const cell = board.cells[i];
    if (cell.k === 'ice' && why === 'side') {
      // a side hit on ice: crack first, shatter on the second hit
      if (cell.hp > 1) {
        board.cells[i] = { ...cell, hp: cell.hp - 1 };
        removed.delete(i);
        result.cracks.push({ i, cell });
        continue;
      }
    }
    if (cell.k === 'otter') {
      result.freed.push({ i, cell, how: 'pop', t });
    } else {
      result.pops.push({ i, cell, t });
      if (COUNTS_AS_BUBBLE.has(cell.k)) result.cleared++;
    }
    if (cell.k === 'bomb') {
      result.blasts.push({ i, kind: 'bomb', t });
      for (const n of ring(i, BLAST_RADIUS)) if (n !== i && board.cells[n]) remove(n, t + 1, 'blast');
    } else if (cell.k === 'zap') {
      result.blasts.push({ i, kind: 'zap', t });
      const r = rowOf(i);
      for (let c = 0; c < cols(r); c++) {
        const n = index(r, c);
        if (n !== i && board.cells[n]) remove(n, t + 1 + Math.abs(c - colOf(i)) * 0.25, 'blast');
      }
    }
    // a match pop (or a lightning shot) touches its neighbors: thaw ice,
    // free otters, set off specials. Blasts only reach their own area.
    if (why === 'match' || why === 'zap') {
      for (const n of NEIGHBORS[i]) {
        const near = board.cells[n];
        if (!near || removed.has(n)) continue;
        if (near.k === 'otter' || near.k === 'bomb' || near.k === 'zap') remove(n, t + 1, 'side');
        else if (near.k === 'ice' && !hitIce.has(n)) {
          hitIce.add(n);
          removed.add(n);
          queue.push({ i: n, t: t + 1, why: 'side' });
        }
      }
    }
  }
  for (const { i } of result.pops) board.cells[i] = null;
  for (const { i } of result.freed) board.cells[i] = null;

  // Everything no longer hanging from the ceiling falls.
  for (const i of board.floating()) {
    const cell = board.cells[i];
    if (cell.k === 'otter') result.freed.push({ i, cell, how: 'drop', t: 0 });
    else {
      result.drops.push({ i, cell });
      if (cell.k === 'anchor') result.anchor = true;
      else if (COUNTS_AS_BUBBLE.has(cell.k)) result.cleared++;
    }
    board.cells[i] = null;
  }
  return result;
}

// Group cells ordered by breadth-first distance from `from`, within the group.
function bfsOrder(group, from) {
  const inGroup = new Set(group);
  const dist = new Map([[from, 0]]);
  const order = [from];
  for (let k = 0; k < order.length; k++) {
    for (const n of NEIGHBORS[order[k]]) {
      if (inGroup.has(n) && !dist.has(n)) { dist.set(n, dist.get(order[k]) + 1); order.push(n); }
    }
  }
  for (const i of group) if (!dist.has(i)) { dist.set(i, 1); order.push(i); }
  return order.map((i) => [i, dist.get(i)]);
}

// A friendly wave washes away every piece on the lowest screen rows.
export function washRows(board, fromScreenRow) {
  const result = { pops: [], freed: [], drops: [], anchor: false, cleared: 0 };
  for (let i = 0; i < SIZE; i++) {
    const cell = board.cells[i];
    if (!cell || rowOf(i) + board.drop < fromScreenRow) continue;
    if (cell.k === 'otter') result.freed.push({ i, cell, how: 'wave', t: 0 });
    else if (cell.k === 'anchor') { result.drops.push({ i, cell }); result.anchor = true; }
    else { result.pops.push({ i, cell, t: 0 }); result.cleared++; }
    board.cells[i] = null;
  }
  for (const i of board.floating()) {
    const cell = board.cells[i];
    if (cell.k === 'otter') result.freed.push({ i, cell, how: 'drop', t: 0 });
    else {
      result.drops.push({ i, cell });
      if (cell.k === 'anchor') result.anchor = true;
      else result.cleared++;
    }
    board.cells[i] = null;
  }
  return result;
}
