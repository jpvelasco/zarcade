// Robo Route rules: boards, programs and the step-by-step interpreter.
// DOM-free so Node tests, the solver and the daily generator share it.

export const DIRS = ['N', 'E', 'S', 'W'];
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const COLOURS = ['r', 'b'];
export const ACTIONS = ['F', 'L', 'R', 'J', '*', 'G'];
// Allowed-tile letters in level data: the actions, '1' (call P1), '@' (Repeat)
// '^' (P1 may call itself) and 'c' (colour brushes).
export const ALL_OPS = 'FLRJ*G1^@c';
export const MAX_STEPS = 500;
export const MAX_DEPTH = 64;
export const MAX_NEST = 2;
export const REPEAT_MIN = 2;
export const REPEAT_MAX = 9;
export const MAX_SIZE = 8;

// ------------------------------------------------------------------ boards

// A level definition holds rows of space-separated cell tokens: '.' is void,
// otherwise a height digit, then an optional colour (r/b), then an optional
// item (L lamp, B battery). Example: '1 1L 2rB . 0'.
export function parseLevel(def) {
  const rows = def.map.map((row) => row.trim().split(/\s+/));
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells = [];
  const lamps = [];
  const batteries = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tok = rows[y][x] || '.';
      const i = y * w + x;
      if (tok === '.') { cells.push(null); continue; }
      const m = /^([0-4])([rb]?)([LB]?)$/.exec(tok);
      if (!m) throw new Error(`bad cell "${tok}" in ${def.id}`);
      const cell = { h: Number(m[1]), c: m[2] || '', item: m[3] || '' };
      if (cell.item === 'L') lamps.push(i);
      if (cell.item === 'B') batteries.push(i);
      cells.push(cell);
    }
  }
  const [sx, sy, sd] = def.start;
  return {
    ...def,
    w, h, cells, lamps, batteries,
    start: { x: sx, y: sy, d: typeof sd === 'number' ? sd : DIRS.indexOf(sd) },
    limits: { main: def.limits?.main ?? 12, p1: def.limits?.p1 ?? 0 },
    ops: def.ops || 'FLR*',
  };
}

export function cellAt(level, x, y) {
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null;
  return level.cells[y * level.w + x];
}

// Back to the compact map rows (used by the editor and share codes).
export function levelRows(level) {
  const rows = [];
  for (let y = 0; y < level.h; y++) {
    const row = [];
    for (let x = 0; x < level.w; x++) {
      const c = level.cells[y * level.w + x];
      row.push(c ? `${c.h}${c.c}${c.item}` : '.');
    }
    rows.push(row.join(' '));
  }
  return rows;
}

// ---------------------------------------------------------------- programs

let uidCounter = 1;
export function nextUid() { return uidCounter++; }

export function tile(op, extra = {}) {
  const t = { op, uid: nextUid() };
  if (extra.c) t.c = extra.c;
  if (op === '@') {
    t.n = extra.n ?? 2;
    t.body = extra.body ?? [];
  }
  return t;
}

// Text form: actions F L R J * G, '1' calls P1, 'n(...)' repeats, and a
// 'r:' or 'b:' prefix paints a tile. Whitespace is optional.
export function parseProgram(text = '') {
  let i = 0;
  const src = String(text);
  function list(close) {
    const out = [];
    while (i < src.length) {
      const ch = src[i];
      if (ch === ' ' || ch === ',') { i++; continue; }
      if (ch === ')') {
        if (!close) throw new Error(`unexpected ) in "${src}"`);
        i++;
        return out;
      }
      out.push(item());
    }
    if (close) throw new Error(`missing ) in "${src}"`);
    return out;
  }
  function item() {
    let c = '';
    if ((src[i] === 'r' || src[i] === 'b') && src[i + 1] === ':') { c = src[i]; i += 2; }
    const ch = src[i];
    if (/[2-9]/.test(ch) && src[i + 1] === '(') {
      i += 2;
      return tile('@', { c, n: Number(ch), body: list(true) });
    }
    if ('FLRJ*G1'.includes(ch)) { i++; return tile(ch, { c }); }
    throw new Error(`bad token "${ch}" in "${src}"`);
  }
  return list(false);
}

export function formatProgram(list = []) {
  return list.map((t) => {
    const pre = t.c ? `${t.c}:` : '';
    if (t.op === '@') return `${pre}${t.n}(${formatProgram(t.body)})`;
    return pre + t.op;
  }).join(' ');
}

export function program(main = '', p1 = '') {
  return {
    main: typeof main === 'string' ? parseProgram(main) : main,
    p1: typeof p1 === 'string' ? parseProgram(p1) : p1,
  };
}

export function countTiles(list = []) {
  let n = 0;
  for (const t of list) n += 1 + (t.op === '@' ? countTiles(t.body) : 0);
  return n;
}

export function programSize(prog) {
  return countTiles(prog.main) + countTiles(prog.p1);
}

export function cloneList(list, fresh = false) {
  return list.map((t) => {
    const c = { ...t };
    if (fresh) c.uid = nextUid();
    if (t.op === '@') c.body = cloneList(t.body, fresh);
    return c;
  });
}

export function cloneProgram(prog, fresh = false) {
  return { main: cloneList(prog.main, fresh), p1: cloneList(prog.p1, fresh) };
}

export function walk(list, fn, depth = 0) {
  for (const t of list) {
    fn(t, depth);
    if (t.op === '@') walk(t.body, fn, depth + 1);
  }
}

export function nestDepth(list) {
  let d = 0;
  walk(list, (t, depth) => { if (t.op === '@') d = Math.max(d, depth + 1); });
  return d;
}

// Which ideas a program uses (for achievements and teaching checks).
export function features(prog) {
  const f = { repeat: false, call: false, recursion: false, colour: false, nested: false };
  walk(prog.main, (t) => {
    if (t.op === '@') f.repeat = true;
    if (t.op === '1') f.call = true;
    if (t.c) f.colour = true;
  });
  walk(prog.p1, (t) => {
    if (t.op === '@') f.repeat = true;
    if (t.op === '1') f.recursion = true;
    if (t.c) f.colour = true;
  });
  f.nested = nestDepth(prog.main) > 1 || nestDepth(prog.p1) > 1;
  if (!f.call) f.recursion = false;
  return f;
}

// Does a program respect a level's limits and allowed tiles?
export function fits(level, prog) {
  const problems = [];
  if (countTiles(prog.main) > level.limits.main) problems.push('main');
  if (countTiles(prog.p1) > level.limits.p1) problems.push('p1');
  const ops = level.ops;
  const check = (t) => {
    if (t.op === '@' ? !ops.includes('@') : !ops.includes(t.op)) problems.push(`op:${t.op}`);
    if (t.c && !ops.includes('c')) problems.push('colour');
  };
  walk(prog.main, check);
  walk(prog.p1, check);
  if (!ops.includes('^')) walk(prog.p1, (t) => { if (t.op === '1') problems.push('recursion'); });
  if (nestDepth(prog.main) > MAX_NEST || nestDepth(prog.p1) > MAX_NEST) problems.push('nest');
  return { ok: problems.length === 0, problems };
}

export function starsFor(tiles, par) {
  if (tiles <= par) return 3;
  if (tiles <= par + 2) return 2;
  return 1;
}

// ------------------------------------------------------------- interpreter

export function startState(level) {
  const c = cellAt(level, level.start.x, level.start.y);
  return {
    x: level.start.x,
    y: level.start.y,
    d: level.start.d,
    h: c ? c.h : 0,
    lit: level.lamps.map(() => false),
    got: level.batteries.map(() => false),
    litCount: 0,
    gotCount: 0,
  };
}

export function isSolved(level, s) {
  return s.litCount === level.lamps.length && s.gotCount === level.batteries.length;
}

// One action on a world state. Returns { kind, ok, reason?, index? } and
// mutates the state. Shared by the interpreter and the BFS solver.
export function act(level, s, op) {
  if (op === 'L') { s.d = (s.d + 3) % 4; return { kind: 'turn', ok: true, dir: -1 }; }
  if (op === 'R') { s.d = (s.d + 1) % 4; return { kind: 'turn', ok: true, dir: 1 }; }
  if (op === 'F' || op === 'J') {
    const nx = s.x + DX[s.d];
    const ny = s.y + DY[s.d];
    const cell = cellAt(level, nx, ny);
    if (!cell) return { kind: 'bonk', ok: false, reason: 'edge' };
    if (op === 'F') {
      if (cell.h === s.h) { s.x = nx; s.y = ny; return { kind: 'move', ok: true }; }
      return { kind: 'bonk', ok: false, reason: cell.h > s.h ? 'wall' : 'drop' };
    }
    if (cell.h === s.h) return { kind: 'hop', ok: true };
    if (cell.h === s.h + 1 || cell.h < s.h) {
      s.x = nx; s.y = ny; s.h = cell.h;
      return { kind: 'jump', ok: true };
    }
    return { kind: 'bonk', ok: false, reason: 'high' };
  }
  const here = s.y * level.w + s.x;
  if (op === '*') {
    const li = level.lamps.indexOf(here);
    if (li < 0) return { kind: 'fizzle', ok: true };
    if (s.lit[li]) return { kind: 'light', ok: true, index: li, again: true };
    s.lit[li] = true;
    s.litCount++;
    return { kind: 'light', ok: true, index: li };
  }
  if (op === 'G') {
    const bi = level.batteries.indexOf(here);
    if (bi < 0 || s.got[bi]) return { kind: 'nograb', ok: true };
    s.got[bi] = true;
    s.gotCount++;
    return { kind: 'grab', ok: true, index: bi };
  }
  throw new Error(`unknown op ${op}`);
}

function floorColour(level, s) {
  const c = cellAt(level, s.x, s.y);
  return c ? c.c : '';
}

// A stepper over one run. step() executes the next action tile (entering
// Repeat blocks and P1 calls silently) and returns an event:
//   { kind, uid, active, step, from, to, ok, win, reason, index }
// kind: move turn jump hop light fizzle grab nograb skip bonk end tired.
// After a terminal event (win, bonk, end, tired) `done` is true.
export function createRun(level, prog, { maxSteps = MAX_STEPS, maxDepth = MAX_DEPTH } = {}) {
  const s = startState(level);
  const stack = [{ list: prog.main, i: 0, left: 1, tile: null, iter: 1 }];
  let steps = 0;
  let ops = 0;
  let done = false;
  let result = null;
  const pos = () => ({ x: s.x, y: s.y, h: s.h, d: s.d });

  function active() {
    const out = [];
    for (const f of stack) if (f.tile) out.push({ uid: f.tile.uid, iter: f.iter, n: f.tile.op === '@' ? f.tile.n : 0 });
    return out;
  }

  function finish(ev, res) {
    done = true;
    result = res;
    return ev;
  }

  // Drop frames that have nothing left to run, so tail calls stay shallow.
  function trim() {
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.list.length) return;
      if (top.left > 1) { top.left--; top.iter++; top.i = 0; return; }
      stack.pop();
    }
  }

  function step() {
    if (done) return null;
    if (isSolved(level, s)) return finish({ kind: 'win', ok: true, win: true, step: steps, from: pos(), to: pos(), active: [] }, 'win');
    for (;;) {
      if (++ops > maxSteps * 20) return finish({ kind: 'tired', ok: false, reason: 'loop', step: steps, from: pos(), to: pos(), active: active() }, 'tired');
      trim();
      if (!stack.length) {
        return finish({ kind: 'end', ok: false, reason: 'unfinished', step: steps, from: pos(), to: pos(), active: [] }, 'end');
      }
      const top = stack[stack.length - 1];
      const t = top.list[top.i++];
      if (t.c && floorColour(level, s) !== t.c) {
        steps++;
        const ev = { kind: 'skip', ok: true, uid: t.uid, step: steps, from: pos(), to: pos(), active: active() };
        if (steps >= maxSteps) return finish({ ...ev, tired: true }, 'tired');
        return ev;
      }
      if (t.op === '@') {
        if (t.body.length) stack.push({ list: t.body, i: 0, left: t.n, tile: t, iter: 1 });
        continue;
      }
      if (t.op === '1') {
        trim();
        if (stack.length >= maxDepth) {
          return finish({ kind: 'tired', ok: false, reason: 'depth', uid: t.uid, step: steps, from: pos(), to: pos(), active: active() }, 'tired');
        }
        if (prog.p1.length) stack.push({ list: prog.p1, i: 0, left: 1, tile: t, iter: 1 });
        continue;
      }
      const from = pos();
      const r = act(level, s, t.op);
      steps++;
      const ev = { ...r, uid: t.uid, step: steps, from, to: pos(), active: active() };
      if (!r.ok) return finish(ev, 'bonk');
      if (isSolved(level, s)) { ev.win = true; return finish(ev, 'win'); }
      if (steps >= maxSteps) return finish({ ...ev, tired: true }, 'tired');
      return ev;
    }
  }

  return {
    state: s,
    step,
    get done() { return done; },
    get result() { return result; },
    get steps() { return steps; },
  };
}

// Run to the end. Returns { result, steps, events? }.
export function runProgram(level, prog, { keepEvents = false, maxSteps = MAX_STEPS } = {}) {
  const run = createRun(level, prog, { maxSteps });
  const events = keepEvents ? [] : null;
  while (!run.done) {
    const ev = run.step();
    if (events && ev) events.push(ev);
  }
  return { result: run.result, win: run.result === 'win', steps: run.steps, events, state: run.state };
}

// The state after replaying `count` steps (for edits made while paused).
// Returns the run positioned there, plus 'uid:kind' keys of the steps taken.
export function replay(level, prog, count) {
  const run = createRun(level, prog);
  const trace = [];
  let last = null;
  while (!run.done && run.steps < count) {
    last = run.step();
    if (last) trace.push(`${last.uid ?? 0}:${last.kind}`);
  }
  return { run, trace, last };
}

// Fast yes/no check used by the solver: same semantics as createRun, no events.
export function solves(level, prog, maxSteps = MAX_STEPS) {
  const s = startState(level);
  const stack = [{ list: prog.main, i: 0, left: 1 }];
  let steps = 0;
  let ops = 0;
  for (;;) {
    if (++ops > maxSteps * 20) return false;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.list.length) break;
      if (top.left > 1) { top.left--; top.i = 0; break; }
      stack.pop();
    }
    if (!stack.length) return false;
    const top = stack[stack.length - 1];
    const t = top.list[top.i++];
    if (t.c) {
      const c = cellAt(level, s.x, s.y);
      if ((c ? c.c : '') !== t.c) { if (++steps >= maxSteps) return false; continue; }
    }
    if (t.op === '@') { stack.push({ list: t.body, i: 0, left: t.n }); continue; }
    if (t.op === '1') {
      while (stack.length) {
        const f = stack[stack.length - 1];
        if (f.i < f.list.length || f.left > 1) break;
        stack.pop();
      }
      if (stack.length >= MAX_DEPTH) return false;
      if (prog.p1.length) stack.push({ list: prog.p1, i: 0, left: 1 });
      continue;
    }
    const r = act(level, s, t.op);
    if (!r.ok) return false;
    if (isSolved(level, s)) return true;
    if (++steps >= maxSteps) return false;
  }
}
