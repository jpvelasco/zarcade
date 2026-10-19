// Solvers that keep the 3-star targets honest.
//   bfsMin      exact shortest plain sequence (breadth-first over world states)
//   bruteForce  smallest program of any shape, by enumerating programs in
//               size order (Repeat blocks and P1 included), within a budget.
import { act, startState, isSolved, solves, REPEAT_MIN } from './rules.js';

const EFFECTIVE = new Set(['move', 'turn', 'jump', 'light', 'grab']);

function stateKey(level, s) {
  let lit = 0;
  for (let i = 0; i < s.lit.length; i++) if (s.lit[i]) lit |= 1 << i;
  let got = 0;
  for (let i = 0; i < s.got.length; i++) if (s.got[i]) got |= 1 << i;
  return `${s.x},${s.y},${s.d},${lit},${got}`;
}

function copy(s) {
  return { ...s, lit: s.lit.slice(), got: s.got.slice() };
}

// Fewest action tiles that solve the level with no Repeat, P1 or colours.
export function bfsMin(level, { ops = level.ops, limit = 200000 } = {}) {
  const actions = ['F', 'L', 'R', 'J', '*', 'G'].filter((o) => ops.includes(o));
  const start = startState(level);
  if (isSolved(level, start)) return { length: 0, path: [] };
  const seen = new Map([[stateKey(level, start), null]]);
  let frontier = [{ s: start, path: [] }];
  while (frontier.length && seen.size < limit) {
    const next = [];
    for (const { s, path } of frontier) {
      for (const op of actions) {
        const n = copy(s);
        const r = act(level, n, op);
        if (!r.ok || !EFFECTIVE.has(r.kind) || r.again) continue;
        const key = stateKey(level, n);
        if (seen.has(key)) continue;
        seen.set(key, true);
        const p = path.concat(op);
        if (isSolved(level, n)) return { length: p.length, path: p };
        next.push({ s: n, path: p });
      }
    }
    frontier = next;
  }
  return null;
}

// ------------------------------------------------------------ enumeration

const TILE = {};
for (const op of 'FLRJ*G1') TILE[op] = { op };

// Every list of exactly `size` tiles over `alphabet` (action/call letters)
// with Repeat counts `counts`, calling cb(list). Returns false to stop.
// Pruned: no L next to R, no three equal turns in a row, Repeat bodies are
// never empty and nest at most `nest` deep.
function lists(size, alphabet, counts, nest, cb) {
  const out = [];
  function rec(left) {
    if (left === 0) return cb(out) !== false;
    for (const op of alphabet) {
      const prev = out[out.length - 1]?.op;
      const prev2 = out[out.length - 2]?.op;
      if ((op === 'L' && prev === 'R') || (op === 'R' && prev === 'L')) continue;
      if ((op === 'L' || op === 'R') && prev === op && prev2 === op) continue;
      out.push(TILE[op]);
      const go = rec(left - 1);
      out.pop();
      if (!go) return false;
    }
    if (nest > 0 && counts.length) {
      for (let body = 1; body <= left - 1; body++) {
        // Enumerate bodies, then the rest of the list after the block.
        const ok = lists(body, alphabet, counts, nest - 1, (b) => {
          const frozen = b.slice();
          for (const n of counts) {
            out.push({ op: '@', n, body: frozen });
            const go = rec(left - 1 - body);
            out.pop();
            if (!go) return false;
          }
          return true;
        });
        if (!ok) return false;
      }
    }
    return true;
  }
  return rec(size);
}

// Smallest program (by tile count) that solves the level using its allowed
// tiles, searching sizes up to maxSize. Colours are not enumerated. Returns
// { size, main, p1, tried } or { size: null, tried, exhausted } when the
// budget ran out first.
export function bruteForce(level, { maxSize = 5, budget = 3e6, maxCount = 6, nest = 2 } = {}) {
  const ops = level.ops;
  const base = ['F', 'L', 'R', 'J', '*', 'G'].filter((o) => ops.includes(o));
  const canCall = ops.includes('1') && level.limits.p1 > 0;
  const counts = ops.includes('@') ? range(REPEAT_MIN, maxCount) : [];
  let tried = 0;
  let found = null;
  let exhausted = false;
  const mainAlpha = canCall ? [...base, '1'] : base;
  for (let size = 1; size <= maxSize && !found && !exhausted; size++) {
    for (let p1Size = canCall ? size - 1 : 0; p1Size >= 0 && !found && !exhausted; p1Size--) {
      const mainSize = size - p1Size;
      if (mainSize > level.limits.main || p1Size > level.limits.p1) continue;
      const tryMain = (main, p1) => {
        if (++tried > budget) { exhausted = true; return false; }
        if (solves(level, { main, p1 })) { found = { size, main: main.slice(), p1: p1.slice() }; return false; }
        return true;
      };
      if (p1Size === 0) {
        lists(mainSize, base, counts, nest, (main) => tryMain(main, []));
      } else {
        lists(p1Size, ops.includes('^') ? mainAlpha : base, counts, nest, (p1) => {
          const frozen = p1.slice();
          return lists(mainSize, mainAlpha, counts, nest, (main) => {
            if (!main.some(hasCall)) return true;
            return tryMain(main, frozen);
          });
        });
      }
    }
  }
  if (found) return { ...found, tried };
  return { size: null, tried, exhausted };
}

function hasCall(t) {
  return t.op === '1' || (t.op === '@' && t.body.some(hasCall));
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
