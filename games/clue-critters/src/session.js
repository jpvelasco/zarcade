// One case being played: what has been searched, heard and marked, plus
// hints and accusations. DOM-free so tests (and the autoplayer) can drive it.
import { DIFFICULTY, gridClues, namesFor, stepLines } from './cases.js';
import { emptyGrid, cycleCell, autoFill, nextHint, applyFacts, deduce, gridComplete, wrongMarks, BLANK, NO, YES } from './logic.js';

export class Session {
  constructor(kase, saved = null) {
    this.kase = kase;
    const n = kase.n;
    this.found = new Set();
    this.searched = Array.from({ length: n }, () => new Set());
    this.talked = new Set();
    this.visited = new Set([0]);
    this.grid = emptyGrid(n);
    this.wrong = 0;
    this.hints = 0;
    this.helper = DIFFICULTY[kase.difficulty].helper;
    if (saved && saved.id === kase.id) this.restore(saved);
  }

  get n() { return this.kase.n; }

  // Scene clues hiding at a place, by spot.
  clueAt(place, spot) {
    return this.kase.clues.findIndex((c) => c.src.kind === 'scene' && c.src.place === place && c.src.spot === spot);
  }

  suspectAt(place) {
    return this.kase.standing.indexOf(place);
  }

  sceneClues(place) {
    return this.kase.clues.map((c, i) => i).filter((i) => {
      const c = this.kase.clues[i];
      return c.src.kind === 'scene' && c.src.place === place;
    });
  }

  remainingAt(place) {
    const scene = this.sceneClues(place).filter((i) => !this.found.has(i)).length;
    const s = this.suspectAt(place);
    const talk = s >= 0 && !this.talked.has(s) ? this.talkClues(s).length : 0;
    return scene + talk;
  }

  talkClues(s) {
    return this.kase.clues.map((c, i) => i).filter((i) => {
      const c = this.kase.clues[i];
      return c.src.kind === 'talk' && c.src.who === s;
    });
  }

  get total() { return this.kase.clues.length; }
  get foundCount() { return this.found.size; }
  get allFound() { return this.found.size === this.kase.clues.length; }

  visit(place) { this.visited.add(place); }

  // Search a prop. Returns the clue found (new or old) or a little joke.
  search(place, spot) {
    const first = !this.searched[place].has(spot);
    this.searched[place].add(spot);
    const idx = this.clueAt(place, spot);
    if (idx >= 0) {
      const isNew = !this.found.has(idx);
      this.found.add(idx);
      return { kind: 'clue', clue: idx, isNew };
    }
    return { kind: 'joke', text: this.kase.jokes[place][spot], first };
  }

  talk(s) {
    const clues = this.talkClues(s);
    const fresh = clues.filter((i) => !this.found.has(i));
    for (const i of clues) this.found.add(i);
    this.talked.add(s);
    return { flavor: this.kase.flavor[s], clues, fresh };
  }

  foundGridClues() {
    const k = this.kase;
    return gridClues(k, this.found);
  }

  // Tap a cell: cycle it, then let the helpers fill around a ✓.
  cycle(cat, s, v) {
    const value = cycleCell(this.grid[cat][s][v]);
    return this.set(cat, s, v, value);
  }

  set(cat, s, v, value) {
    this.grid[cat][s][v] = value;
    const auto = value === YES ? autoFill(this.grid, this.n, this.helper) : [];
    return { value, auto };
  }

  clearGrid() { this.grid = emptyGrid(this.n); }

  get gridDone() { return gridComplete(this.grid, this.n, this.kase.solution); }

  // The next hint, already applied to the grid. Grid hints count against
  // stars; pointing at an unfound clue is free.
  hint() {
    const k = this.kase;
    const N = namesFor(k);
    const clues = this.foundGridClues();
    const h = nextHint(this.grid, this.n, k.solution, clues);
    if (h.kind === 'wrong') {
      // Rub out every mark that does not fit (a wrong ✓ can bring wrong ✗s
      // with it), but name the first one.
      const { s, cat, v } = h.cell;
      const cells = wrongMarks(this.grid, this.n, k.solution);
      for (const c of cells) this.grid[c.cat][c.s][c.v] = BLANK;
      this.hints++;
      const V = cat === 'place' ? `the ${N.where[v]}` : `the ${N.what[v]}`;
      const rubbed = cells.length > 1 ? `Pip rubbed out ${cells.length} boxes.` : 'Pip rubbed that box out.';
      return { kind: 'wrong', cells, lines: [`Hmm! Look at ${N.who[s]} and ${V} again.`, rubbed], counted: true };
    }
    if (h.kind === 'step') {
      applyFacts(this.grid, h.missing);
      this.hints++;
      // Re-run the helpers so a hinted ✓ still crosses out its row.
      autoFill(this.grid, this.n, this.helper);
      return { kind: 'step', cells: h.missing, lines: stepLines(k, h.step, clues), counted: true };
    }
    if (h.kind === 'done') return { kind: 'done', cells: [], lines: ['Your grid is all filled in!', 'Tap “Solve it!” to catch the culprit.'], counted: false };
    return this.findHint() || { kind: 'done', cells: [], lines: ['You have every clue!', 'Read them again, one at a time.'], counted: false };
  }

  // A free nudge toward a clue not found yet (the crime clue first), or null.
  findHint() {
    const k = this.kase;
    const N = namesFor(k);
    let idx = k.clues.findIndex((c, i) => !this.found.has(i) && c.t === 'crime');
    if (idx < 0) idx = k.clues.findIndex((c, i) => !this.found.has(i));
    if (idx < 0) return null;
    const c = k.clues[idx];
    if (c.src.kind === 'scene') {
      return { kind: 'more', target: { place: c.src.place, spot: c.src.spot }, cells: [], lines: [`Look around the ${N.where[c.src.place]}!`, 'Something is hiding there.'], counted: false };
    }
    const place = k.standing[c.src.who];
    return { kind: 'more', target: { place, suspect: c.src.who }, cells: [], lines: [`Talk to ${N.who[c.src.who]}!`, `${N.who[c.src.who]} is at the ${N.where[place]}.`], counted: false };
  }

  // Accuse someone. Wrong guesses only cost a star, never the case.
  accuse(who, where, what) {
    const k = this.kase;
    const right = {
      who: who === k.culprit,
      where: where === k.solution.place[k.culprit],
      what: what === k.solution.thing[k.culprit],
    };
    const ok = right.who && right.where && right.what;
    if (!ok) this.wrong++;
    return { ok, right };
  }

  toJSON() {
    return {
      id: this.kase.id,
      found: [...this.found],
      searched: this.searched.map((s) => [...s]),
      talked: [...this.talked],
      visited: [...this.visited],
      grid: this.grid,
      wrong: this.wrong,
      hints: this.hints,
    };
  }

  restore(saved) {
    const n = this.n;
    const okIdx = (i, max) => Number.isInteger(i) && i >= 0 && i < max;
    for (const i of saved.found || []) if (okIdx(i, this.kase.clues.length)) this.found.add(i);
    (saved.searched || []).forEach((list, p) => { if (p < n) for (const s of list) if (okIdx(s, 6)) this.searched[p].add(s); });
    for (const s of saved.talked || []) if (okIdx(s, n)) this.talked.add(s);
    for (const p of saved.visited || []) if (okIdx(p, n)) this.visited.add(p);
    const g = saved.grid;
    const valid = (rows) => Array.isArray(rows) && rows.length === n && rows.every((r) => Array.isArray(r) && r.length === n && r.every((x) => x === BLANK || x === NO || x === YES));
    if (g && valid(g.place) && valid(g.thing)) this.grid = { place: g.place.map((r) => r.slice()), thing: g.thing.map((r) => r.slice()) };
    this.wrong = Math.max(0, saved.wrong | 0);
    this.hints = Math.max(0, saved.hints | 0);
  }
}

// The autoplayer: search everything, hear everyone, reason it out with the
// solver and accuse. Returns a plan of actions so the browser can replay it
// slowly as a demo; `run` applies it at once.
export function autoPlan(session) {
  const k = session.kase;
  const plan = [];
  for (let p = 0; p < k.n; p++) {
    plan.push({ do: 'visit', place: p });
    for (let spot = 0; spot < 6; spot++) plan.push({ do: 'search', place: p, spot });
    const s = session.suspectAt(p);
    if (s >= 0) plan.push({ do: 'talk', s });
  }
  plan.push({ do: 'reason' });
  plan.push({ do: 'accuse' });
  return plan;
}

export function autoStep(session, action) {
  const k = session.kase;
  switch (action.do) {
    case 'visit': session.visit(action.place); return null;
    case 'search': return session.search(action.place, action.spot);
    case 'talk': return session.talk(action.s);
    case 'reason': {
      const r = deduce(k.n, session.foundGridClues());
      applyFacts(session.grid, r.steps.flatMap((s) => s.facts));
      return r;
    }
    case 'accuse': {
      const r = deduce(k.n, session.foundGridClues());
      if (!r.solved) return { ok: false };
      const crime = k.clues.find((c) => c.t === 'crime');
      const who = r.world[crime.kind].indexOf(crime.idx);
      return session.accuse(who, r.world.place[who], r.world.thing[who]);
    }
    default: return null;
  }
}

export function autoRun(session) {
  let last = null;
  for (const a of autoPlan(session)) last = autoStep(session, a);
  return last;
}
