// The puzzle core, DOM-free. A case has n suspects, n places and n things.
// Each suspect was at exactly one place and had exactly one thing, so a
// "world" is two permutations: place[s] and thing[s].
//
// Clues (indices into the case's lists):
//   at s p · notAt s p · atEither s p q · whoAt p s r
//   has s k · notHas s k · hasEither s k j · whoHas k s r
//   link k p     whoever had k was at p
//   notLink k p  whoever had k was not at p

export const CLUE_TYPES = ['at', 'notAt', 'atEither', 'whoAt', 'has', 'notHas', 'hasEither', 'whoHas', 'link', 'notLink'];
export const NOT_TYPES = ['notAt', 'notHas', 'notLink'];
export const EITHER_TYPES = ['atEither', 'hasEither', 'whoAt', 'whoHas'];

// Does one clue hold in a world?
export function holds(c, place, thing) {
  switch (c.t) {
    case 'at': return place[c.s] === c.p;
    case 'notAt': return place[c.s] !== c.p;
    case 'atEither': return place[c.s] === c.p || place[c.s] === c.q;
    case 'whoAt': return place[c.s] === c.p || place[c.r] === c.p;
    case 'has': return thing[c.s] === c.k;
    case 'notHas': return thing[c.s] !== c.k;
    case 'hasEither': return thing[c.s] === c.k || thing[c.s] === c.j;
    case 'whoHas': return thing[c.s] === c.k || thing[c.r] === c.k;
    case 'link': {
      const s = thing.indexOf(c.k);
      return place[s] === c.p;
    }
    case 'notLink': {
      const s = thing.indexOf(c.k);
      return place[s] !== c.p;
    }
    default: throw new Error(`unknown clue type ${c.t}`);
  }
}

export function permutations(n) {
  const out = [];
  const a = [...Array(n).keys()];
  const rec = (i) => {
    if (i === n) { out.push(a.slice()); return; }
    for (let j = i; j < n; j++) {
      [a[i], a[j]] = [a[j], a[i]];
      rec(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
  };
  rec(0);
  return out;
}

const PLACE_ONLY = new Set(['at', 'notAt', 'atEither', 'whoAt']);
const THING_ONLY = new Set(['has', 'notHas', 'hasEither', 'whoHas']);

// Every world that fits all clues (stops early at `limit`). Brute force, so
// it is the ground truth the propagation solver is checked against.
export function solutions(n, clues, limit = Infinity) {
  const perms = permutations(n);
  const pc = clues.filter((c) => PLACE_ONLY.has(c.t));
  const tc = clues.filter((c) => THING_ONLY.has(c.t));
  const xc = clues.filter((c) => !PLACE_ONLY.has(c.t) && !THING_ONLY.has(c.t));
  const places = perms.filter((p) => pc.every((c) => holds(c, p, null)));
  const things = perms.filter((t) => tc.every((c) => holds(c, null, t)));
  const out = [];
  for (const p of places) {
    for (const t of things) {
      if (xc.every((c) => holds(c, p, t))) {
        out.push({ place: p, thing: t });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export function countSolutions(n, clues, limit = Infinity) {
  return solutions(n, clues, limit).length;
}

export function worldFits(clues, world) {
  return clues.every((c) => holds(c, world.place, world.thing));
}

// ------------------------------------------------------------------ solver
//
// A kid-level propagation solver over candidate sets. Each step applies one
// simple rule once and records the grid cells it settles, so the hint button
// can replay the reasoning in order. Cells: { s, cat: 'place'|'thing', v,
// mark: 'no'|'yes' }.

const bit = (v) => 1 << v;
const has = (mask, v) => (mask & bit(v)) !== 0;
const popcount = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
const only = (m) => (popcount(m) === 1 ? 31 - Math.clz32(m) : -1);

function newState(n) {
  const full = (1 << n) - 1;
  return { n, place: Array(n).fill(full), thing: Array(n).fill(full), broken: false };
}

// Narrow a candidate set; returns the settled cells (removed values become
// "no", and a set left with one value marks that value "yes").
function narrow(st, cat, s, keep) {
  const before = st[cat][s];
  const after = before & keep;
  if (after === before) return [];
  st[cat][s] = after;
  if (!after) { st.broken = true; return []; }
  const facts = [];
  for (let v = 0; v < st.n; v++) if (has(before, v) && !has(after, v)) facts.push({ s, cat, v, mark: 'no' });
  const v = only(after);
  if (v >= 0) facts.push({ s, cat, v, mark: 'yes' });
  return facts;
}

const clueCat = (c) => (PLACE_ONLY.has(c.t) ? 'place' : 'thing');

// Rules in the order a child would try them.
function* candidates(st, clues) {
  const { n } = st;
  // 1. Read a clue directly.
  for (let i = 0; i < clues.length; i++) {
    const c = clues[i];
    switch (c.t) {
      case 'at': yield { rule: 'clue', clue: i, apply: () => narrow(st, 'place', c.s, bit(c.p)) }; break;
      case 'notAt': yield { rule: 'clue', clue: i, apply: () => narrow(st, 'place', c.s, ~bit(c.p)) }; break;
      case 'atEither': yield { rule: 'clue', clue: i, apply: () => narrow(st, 'place', c.s, bit(c.p) | bit(c.q)) }; break;
      case 'has': yield { rule: 'clue', clue: i, apply: () => narrow(st, 'thing', c.s, bit(c.k)) }; break;
      case 'notHas': yield { rule: 'clue', clue: i, apply: () => narrow(st, 'thing', c.s, ~bit(c.k)) }; break;
      case 'hasEither': yield { rule: 'clue', clue: i, apply: () => narrow(st, 'thing', c.s, bit(c.k) | bit(c.j)) }; break;
      case 'whoAt':
      case 'whoHas': {
        const cat = clueCat(c);
        const v = c.t === 'whoAt' ? c.p : c.k;
        for (let s = 0; s < n; s++) {
          if (s === c.s || s === c.r) continue;
          yield { rule: 'clue', clue: i, apply: () => narrow(st, cat, s, ~bit(v)) };
        }
        break;
      }
      default: break;
    }
  }
  // 2. A settled cell rules out the rest of its column.
  for (const cat of ['place', 'thing']) {
    for (let s = 0; s < n; s++) {
      const v = only(st[cat][s]);
      if (v < 0) continue;
      for (let o = 0; o < n; o++) {
        if (o !== s && has(st[cat][o], v)) {
          yield { rule: 'taken', s, cat, v, apply: () => narrow(st, cat, o, ~bit(v)) };
        }
      }
    }
  }
  // 3. Only one suspect left who could fit a column.
  for (const cat of ['place', 'thing']) {
    for (let v = 0; v < n; v++) {
      const who = [];
      for (let s = 0; s < n; s++) if (has(st[cat][s], v)) who.push(s);
      if (who.length === 1 && popcount(st[cat][who[0]]) > 1) {
        yield { rule: 'onlyOne', s: who[0], cat, v, apply: () => narrow(st, cat, who[0], bit(v)) };
      }
    }
  }
  // 4. Either/or about two suspects: if one is ruled out, it's the other.
  for (let i = 0; i < clues.length; i++) {
    const c = clues[i];
    if (c.t !== 'whoAt' && c.t !== 'whoHas') continue;
    const cat = clueCat(c);
    const v = c.t === 'whoAt' ? c.p : c.k;
    if (!has(st[cat][c.s], v)) yield { rule: 'eitherOther', clue: i, s: c.r, out: c.s, cat, v, apply: () => narrow(st, cat, c.r, bit(v)) };
    if (!has(st[cat][c.r], v)) yield { rule: 'eitherOther', clue: i, s: c.s, out: c.r, cat, v, apply: () => narrow(st, cat, c.s, bit(v)) };
  }
  // 5. Links between a thing and a place.
  for (let i = 0; i < clues.length; i++) {
    const c = clues[i];
    if (c.t === 'link') {
      for (let s = 0; s < n; s++) {
        if (!has(st.place[s], c.p) && has(st.thing[s], c.k)) yield { rule: 'linkNoPlace', clue: i, s, apply: () => narrow(st, 'thing', s, ~bit(c.k)) };
        if (!has(st.thing[s], c.k) && has(st.place[s], c.p)) yield { rule: 'linkNoThing', clue: i, s, apply: () => narrow(st, 'place', s, ~bit(c.p)) };
      }
    } else if (c.t === 'notLink') {
      for (let s = 0; s < n; s++) {
        if (only(st.place[s]) === c.p && has(st.thing[s], c.k)) yield { rule: 'notLinkPlace', clue: i, s, apply: () => narrow(st, 'thing', s, ~bit(c.k)) };
        if (only(st.thing[s]) === c.k && has(st.place[s], c.p)) yield { rule: 'notLinkThing', clue: i, s, apply: () => narrow(st, 'place', s, ~bit(c.p)) };
      }
    }
  }
}

// Run the solver to a fixpoint. Returns the ordered steps, whether every
// cell is settled, and the final candidate sets.
export function deduce(n, clues, maxSteps = 500) {
  const st = newState(n);
  const steps = [];
  let progress = true;
  while (progress && !st.broken && steps.length < maxSteps) {
    progress = false;
    for (const cand of candidates(st, clues)) {
      const facts = cand.apply();
      if (facts.length || st.broken) {
        const { apply, ...info } = cand;
        steps.push({ ...info, facts });
        progress = true;
        break;
      }
    }
  }
  const solved = !st.broken && st.place.every((m) => popcount(m) === 1) && st.thing.every((m) => popcount(m) === 1);
  const world = solved ? { place: st.place.map(only), thing: st.thing.map(only) } : null;
  return { steps, solved, broken: st.broken, world, place: st.place, thing: st.thing };
}

// --------------------------------------------------------------- the grid
//
// The player's grid: grid.place[s][v] and grid.thing[s][v], each 0 (blank),
// 1 (✗) or 2 (✓).

export const BLANK = 0, NO = 1, YES = 2;

export function emptyGrid(n) {
  const rows = () => Array.from({ length: n }, () => Array(n).fill(BLANK));
  return { place: rows(), thing: rows() };
}

export function cycleCell(value) {
  return (value + 1) % 3;
}

// Cells the helpers fill after a change. Level 0: none. Level 1: a ✓ crosses
// out the rest of its row and column. Level 2: also, a row or column with one
// blank left and no ✓ gets that ✓. Returns the list of cells it changed.
export function autoFill(grid, n, level) {
  const changed = [];
  if (level <= 0) return changed;
  let again = true;
  while (again) {
    again = false;
    for (const cat of ['place', 'thing']) {
      const g = grid[cat];
      for (let s = 0; s < n; s++) {
        for (let v = 0; v < n; v++) {
          if (g[s][v] !== YES) continue;
          for (let o = 0; o < n; o++) {
            if (o !== v && g[s][o] === BLANK) { g[s][o] = NO; changed.push({ s, cat, v: o, mark: 'no' }); again = true; }
            if (o !== s && g[o][v] === BLANK) { g[o][v] = NO; changed.push({ s: o, cat, v, mark: 'no' }); again = true; }
          }
        }
      }
      if (level < 2) continue;
      for (let s = 0; s < n; s++) {
        const row = g[s];
        if (row.includes(YES)) continue;
        const blanks = row.map((x, v) => (x === BLANK ? v : -1)).filter((v) => v >= 0);
        if (blanks.length === 1) { row[blanks[0]] = YES; changed.push({ s, cat, v: blanks[0], mark: 'yes' }); again = true; }
      }
      for (let v = 0; v < n; v++) {
        const col = g.map((row) => row[v]);
        if (col.includes(YES)) continue;
        const blanks = col.map((x, s) => (x === BLANK ? s : -1)).filter((s) => s >= 0);
        if (blanks.length === 1) { g[blanks[0]][v] = YES; changed.push({ s: blanks[0], cat, v, mark: 'yes' }); again = true; }
      }
    }
  }
  return changed;
}

// Marks that disagree with the true answer.
export function wrongMarks(grid, n, world) {
  const out = [];
  for (const cat of ['place', 'thing']) {
    for (let s = 0; s < n; s++) {
      for (let v = 0; v < n; v++) {
        const truth = world[cat][s] === v;
        const x = grid[cat][s][v];
        if ((x === YES && !truth) || (x === NO && truth)) out.push({ s, cat, v });
      }
    }
  }
  return out;
}

export function gridComplete(grid, n, world) {
  for (const cat of ['place', 'thing']) {
    for (let s = 0; s < n; s++) if (grid[cat][s][world[cat][s]] !== YES) return false;
  }
  return true;
}

// The next helpful thing to tell the player, in priority order: a wrong
// mark, the next solver step (from the clues found so far) that the grid
// does not show yet, or "find more clues".
export function nextHint(grid, n, world, foundClues) {
  const wrong = wrongMarks(grid, n, world);
  if (wrong.length) return { kind: 'wrong', cell: wrong[0] };
  const result = deduce(n, foundClues);
  for (const step of result.steps) {
    const missing = step.facts.filter((f) => grid[f.cat][f.s][f.v] !== (f.mark === 'yes' ? YES : NO));
    if (missing.length) return { kind: 'step', step, missing };
  }
  if (gridComplete(grid, n, world)) return { kind: 'done' };
  return { kind: 'more' };
}

export function applyFacts(grid, facts) {
  for (const f of facts) grid[f.cat][f.s][f.v] = f.mark === 'yes' ? YES : NO;
}
