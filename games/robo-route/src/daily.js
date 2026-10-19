// The daily circuit: a level generated from the local date. Generation is
// program-first: a random program (a loop, a procedure, a recursive walk or a
// colour-following walk) runs on a blank, endless board, and the board is
// built from where it went. Lamps go where it lit, batteries where it
// grabbed, so its program is always a solution. A bounded brute-force search
// then tightens the par.
import { Rng, hashString } from './rng.js';
import { DX, DY, parseLevel, program, programSize, runProgram, formatProgram, parseProgram } from './rules.js';
import { bruteForce } from './solver.js';

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Days between two YYYY-MM-DD keys (b - a).
export function dayGap(a, b) {
  const pa = Date.UTC(...a.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  const pb = Date.UTC(...b.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  return Math.round((pb - pa) / 86400000);
}

const MAX_W = 7;
const KINDS = ['loop', 'recursion', 'procedure', 'colours'];

function randomBody(rng, len, { jumps = true, grabs = true } = {}) {
  const body = [];
  let moves = 0;
  for (let i = 0; i < len; i++) {
    const r = rng.next();
    let op;
    if (r < 0.42) op = 'F';
    else if (r < 0.55 && jumps) op = 'J';
    else if (r < 0.67) op = 'L';
    else if (r < 0.8) op = 'R';
    else if (r < 0.92) op = '*';
    else op = grabs ? 'G' : '*';
    if (op === 'F' || op === 'J') moves++;
    if ((op === 'L' && body[body.length - 1] === 'R') || (op === 'R' && body[body.length - 1] === 'L')) op = 'F';
    body.push(op);
  }
  if (!moves) body[rng.int(body.length)] = 'F';
  if (!body.includes('*') && !body.includes('G')) body[body.length - 1] = '*';
  return body.join(' ');
}

// Simulate a program on an endless board, assigning heights as it goes.
// Returns the visited cells or null when the walk contradicts itself.
function carve(rng, prog, { maxSteps = 140, maxLamps = 7, colours = false }) {
  const cells = new Map();
  const key = (x, y) => `${x},${y}`;
  let x = 0;
  let y = 0;
  let d = 1;
  let h = 0;
  cells.set(key(0, 0), { h: 0, c: '', item: '' });
  let steps = 0;
  let lamps = 0;
  let ok = true;
  let stop = false;
  const stack = [{ list: prog.main, i: 0, left: 1 }];
  while (!stop && ok) {
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.list.length) break;
      if (top.left > 1) { top.left--; top.i = 0; break; }
      stack.pop();
    }
    if (!stack.length) break;
    const top = stack[stack.length - 1];
    const t = top.list[top.i++];
    const here = cells.get(key(x, y));
    if (t.c) {
      if (!colours) return null;
      if (here.c !== t.c) continue;
    }
    if (t.op === '@') { stack.push({ list: t.body, i: 0, left: t.n }); continue; }
    if (t.op === '1') {
      if (stack.length > 40) return null;
      stack.push({ list: prog.p1, i: 0, left: 1 });
      continue;
    }
    if (++steps > maxSteps) break;
    if (t.op === 'L') d = (d + 3) % 4;
    else if (t.op === 'R') d = (d + 1) % 4;
    else if (t.op === 'F' || t.op === 'J') {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const k = key(nx, ny);
      let next = cells.get(k);
      if (t.op === 'F') {
        if (!next) { next = { h, c: '', item: '' }; cells.set(k, next); }
        if (next.h !== h) ok = false;
      } else {
        if (!next) {
          const up = h < 3 && (h === 0 || rng.next() < 0.6);
          next = { h: up ? h + 1 : rng.int(h), c: '', item: '' };
          cells.set(k, next);
        }
        if (!(next.h === h + 1 || next.h < h)) ok = false;
      }
      x = nx; y = ny; h = next.h;
    } else if (t.op === '*') {
      if (here.item === 'B') return null;
      if (!here.item) { here.item = 'L'; lamps++; if (lamps >= maxLamps) stop = true; }
    } else if (t.op === 'G') {
      if (here.item === 'L') return null;
      if (!here.item) { here.item = 'B'; lamps++; if (lamps >= maxLamps) stop = true; }
    }
  }
  if (!ok) return null;
  return cells;
}

// A colour-following walk: a self-avoiding path whose turn cells are painted
// (red turns right, blue turns left), solved by 'F r:R b:L * 1'-style code.
function colourWalk(rng) {
  const cells = new Map();
  const key = (x, y) => `${x},${y}`;
  let x = 0;
  let y = 0;
  let d = 1;
  cells.set(key(0, 0), { h: 0, c: '', item: '' });
  const len = 10 + rng.int(10);
  const useBlue = rng.next() < 0.75;
  let lamps = 0;
  let last = null;
  for (let i = 0; i < len; i++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (cells.has(key(nx, ny)) || touches(cells, key, nx, ny, x, y)) return null;
    const cell = { h: 0, c: '', item: '' };
    cells.set(key(nx, ny), cell);
    x = nx; y = ny;
    last = cell;
    if (i > 0 && rng.next() < 0.3) {
      const right = !useBlue || rng.next() < 0.5;
      cell.c = right ? 'r' : 'b';
      d = right ? (d + 1) % 4 : (d + 3) % 4;
    } else if (rng.next() < 0.22) { cell.item = 'L'; lamps++; }
  }
  if (last.c) return null;
  last.item = 'L';
  return { cells, solution: { main: '1', p1: useBlue ? 'F r:R b:L * 1' : 'F r:R * 1' }, lamps: lamps + 1 };
}

// Paths that brush against themselves are confusing to read; keep a gap.
function touches(cells, key, nx, ny, px, py) {
  for (let i = 0; i < 4; i++) {
    const ax = nx + DX[i];
    const ay = ny + DY[i];
    if (ax === px && ay === py) continue;
    if (cells.has(key(ax, ay))) return true;
  }
  return false;
}

function toRows(cells) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const k of cells.keys()) {
    const [x, y] = k.split(',').map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w > MAX_W || h > MAX_W) return null;
  const rows = [];
  for (let y = minY; y <= maxY; y++) {
    const row = [];
    for (let x = minX; x <= maxX; x++) {
      const c = cells.get(`${x},${y}`);
      row.push(c ? `${c.h}${c.c}${c.item}` : '.');
    }
    rows.push(row.join(' '));
  }
  return { rows, ox: -minX, oy: -minY, w, h };
}

function candidate(rng, kind) {
  if (kind === 'colours') {
    const walk = colourWalk(rng);
    if (!walk) return null;
    return { cells: walk.cells, solution: walk.solution, ops: 'FLR*1^c' };
  }
  let solution;
  let ops;
  if (kind === 'loop') {
    const body = randomBody(rng, 2 + rng.int(3), { grabs: rng.next() < 0.4 });
    const n = 3 + rng.int(4);
    const pre = rng.next() < 0.3 ? 'F ' : '';
    solution = { main: `${pre}${n}(${body})`, p1: '' };
    ops = 'FLRJ*G@';
  } else if (kind === 'recursion') {
    const body = randomBody(rng, 2 + rng.int(3), { grabs: rng.next() < 0.3 });
    solution = { main: '1', p1: `${body} 1` };
    ops = 'FLRJ*G1^@';
  } else {
    const body = randomBody(rng, 3 + rng.int(2), { grabs: rng.next() < 0.4 });
    const turns = ['R', 'L', 'R R', 'L F', 'R F'];
    const mid = rng.pick(turns);
    const mid2 = rng.pick(turns);
    solution = { main: `1 ${mid} 1 ${mid2} 1`, p1: body };
    ops = 'FLRJ*G1@';
  }
  const prog = program(solution.main, solution.p1);
  const cells = carve(rng, prog, {});
  if (!cells) return null;
  return { cells, solution, ops };
}

// Build a level from a seed. Retries until a pleasant, valid board appears.
export function generate(seed, { id = 'daily', name = 'Daily Circuit', budget = 60000 } = {}) {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 400; attempt++) {
    const kind = KINDS[(seed + Math.floor(attempt / 80)) % KINDS.length];
    const c = candidate(rng, kind);
    if (!c) continue;
    let lamps = 0;
    let floor = 0;
    for (const cell of c.cells.values()) { floor++; if (cell.item) lamps++; }
    if (lamps < 2 || floor < 6) continue;
    const shape = toRows(c.cells);
    if (!shape) continue;
    const def = {
      id, name,
      map: shape.rows,
      start: [shape.ox, shape.oy, 'E'],
      ops: c.ops,
      limits: { main: 1, p1: 0 },
      par: 0,
      solution: { main: c.solution.main, p1: c.solution.p1 },
      seed,
      kind,
    };
    const main = parseProgram(def.solution.main);
    const p1 = parseProgram(def.solution.p1);
    def.limits = {
      main: Math.max(programSize({ main, p1: [] }) + 3, 5),
      p1: c.ops.includes('1') ? Math.max(programSize({ main: p1, p1: [] }) + 2, 4) : 0,
    };
    const prog = { main, p1 };
    const level = parseLevel(def);
    const result = runProgram(level, prog);
    if (!result.win || result.steps < 6) continue;
    const size = programSize(prog);
    // Tighten the par with a short search for anything smaller, and use the
    // smaller program as the reference when one turns up.
    const bf = bruteForce(level, { maxSize: Math.min(size - 1, 5), budget, maxCount: 7 });
    def.par = bf.size ?? size;
    if (def.par < 4) continue;
    def.solution = bf.size
      ? { main: formatProgram(bf.main), p1: formatProgram(bf.p1) }
      : { main: formatProgram(main), p1: formatProgram(p1) };
    return def;
  }
  throw new Error(`no daily level for seed ${seed}`);
}

export function dailySeed(key) {
  return hashString(`robo-route:${key}`);
}

export function dailyLevel(key) {
  return generate(dailySeed(key), { id: `daily-${key}`, name: 'Daily Circuit' });
}
