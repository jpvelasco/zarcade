// Branching page map: 6 rows of nodes across 4 lanes, then the boss.
// DOM-free and seeded.
import { int, next, weighted, derive } from './rng.js';

export const ROWS = 6;
export const COLS = 4;
export const BOSS_ROW = ROWS;

const LIMITED = new Set(['elite', 'shop', 'rest']);

function typeFor(rng, row) {
  if (row === 0) return 'battle';
  if (row === 3) return 'treasure';
  if (row === ROWS - 1) return 'rest';
  const entries = [['battle', 48], ['mystery', 22], ['shop', 11]];
  // The row before the boss is always a rest stop, so no rest just before it.
  if (row !== ROWS - 2) entries.push(['rest', 7]);
  if (row >= 2) entries.push(['elite', 13]);
  return weighted(rng, entries);
}

// Edges between rows never cross: a step from lane a to b is rejected when
// some existing step on the same row goes from b to a (or crosses over).
function crosses(edges, row, a, b) {
  for (const e of edges) {
    if (e.row !== row) continue;
    if ((e.a < a && e.b > b) || (e.a > a && e.b < b)) return true;
  }
  return false;
}

export function generateMap(seed, floor) {
  const rng = derive(seed, `map:${floor}`);
  const edges = [];
  const used = new Set();
  const key = (r, c) => `${r}-${c}`;
  const pathCount = 3 + int(rng, 2);
  const starts = [];
  for (let p = 0; p < pathCount; p++) {
    let c = p < 2 ? (p === 0 ? int(rng, 2) : 2 + int(rng, 2)) : int(rng, COLS);
    starts.push(c);
    used.add(key(0, c));
    for (let r = 0; r < ROWS - 1; r++) {
      const options = [c - 1, c, c + 1].filter((n) => n >= 0 && n < COLS && !crosses(edges, r, c, n));
      const n = options.length ? options[int(rng, options.length)] : c;
      if (!edges.some((e) => e.row === r && e.a === c && e.b === n)) edges.push({ row: r, a: c, b: n });
      c = n;
      used.add(key(r + 1, c));
    }
  }

  const nodes = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!used.has(key(r, c))) continue;
      nodes[key(r, c)] = {
        id: key(r, c), row: r, col: c, type: 'battle', next: [], prev: [],
        // Small hand-placed wobble for drawing.
        jx: Math.round((next(rng) - 0.5) * 30), jy: Math.round((next(rng) - 0.5) * 18),
      };
    }
  }
  for (const e of edges) {
    const from = nodes[key(e.row, e.a)];
    const to = nodes[key(e.row + 1, e.b)];
    if (!from.next.includes(to.id)) from.next.push(to.id);
    if (!to.prev.includes(from.id)) to.prev.push(from.id);
  }
  const boss = { id: 'boss', row: BOSS_ROW, col: 1.5, type: 'boss', next: [], prev: [], jx: 0, jy: 0 };
  for (const n of Object.values(nodes)) {
    if (n.row === ROWS - 1) {
      n.next.push('boss');
      boss.prev.push(n.id);
    }
  }
  nodes.boss = boss;

  // Assign room types row by row, keeping shops, rests and elites from
  // following one of their own kind.
  const ordered = Object.values(nodes).filter((n) => n.type !== 'boss').sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of ordered) {
    let t = typeFor(rng, n.row);
    for (let tries = 0; tries < 6 && LIMITED.has(t) && n.prev.some((p) => nodes[p].type === t); tries++) t = typeFor(rng, n.row);
    if (LIMITED.has(t) && n.prev.some((p) => nodes[p].type === t)) t = 'battle';
    n.type = t;
  }
  // Every page has at least one shop somewhere in rows 1, 2 or 4.
  if (!ordered.some((n) => n.type === 'shop')) {
    const spots = ordered.filter((n) => (n.row === 2 || n.row === 4 || n.row === 1) && n.type !== 'elite');
    if (spots.length) spots[int(rng, spots.length)].type = 'shop';
  }
  return { floor, nodes, starts: [...new Set(starts)].sort() };
}

// Nodes the hero may walk to next.
export function choices(map, at) {
  if (!at) return Object.values(map.nodes).filter((n) => n.row === 0).map((n) => n.id);
  return map.nodes[at].next.slice();
}

// Every node can reach the boss and every row-0 node starts a path.
export function validateMap(map) {
  const problems = [];
  const reach = new Set();
  const stack = choices(map, null);
  while (stack.length) {
    const id = stack.pop();
    if (reach.has(id)) continue;
    reach.add(id);
    stack.push(...map.nodes[id].next);
  }
  for (const id of Object.keys(map.nodes)) if (!reach.has(id)) problems.push(`unreachable ${id}`);
  for (const n of Object.values(map.nodes)) {
    if (n.type !== 'boss' && n.next.length === 0) problems.push(`dead end ${n.id}`);
  }
  return problems;
}
