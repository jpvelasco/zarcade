// One level in progress: moves, score, goals and the resolution pipeline.
//
// The view never changes the board itself. It calls `swap()` and then pumps
// `step()`, animating each returned step until `step()` returns null.
import {
  findMatches, findMoves, hasMoves, settle, collectEggs, shuffleBoard, swapAllowed,
  isJelly, isMatchable, jelly, STRIPE_H, STRIPE_V, BOMB, RAINBOW, COLOR_NAMES,
} from './board.js';
import { detonate, swapBlast } from './specials.js';
import { buildBoard, goalLabel } from './levels.js';
import { Rng, hashSeed } from './rng.js';

export const SCORE = {
  jelly: 60,
  sand: 120,
  coral: 150,
  ice: 120,
  egg: 2000,
  made: 150,
  leftoverMove: 100,
};

export const CONTINUE_MOVES = 5;

const neighbors = (board, i) => {
  const out = [];
  const c = board.col(i), r = board.row(i);
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!board.inside(c + dc, r + dr)) continue;
    const j = board.idx(c + dc, r + dr);
    if (board.playable(j)) out.push(j);
  }
  return out;
};

export class Game {
  constructor(level, { seed = 1 } = {}) {
    this.level = level;
    this.seed = seed;
    this.board = buildBoard(level, seed);
    this.rng = new Rng(hashSeed(level.id, seed, 0x51ed));
    this.moves = level.moves;
    this.score = 0;
    this.chain = 0;
    this.bestChain = 0;
    this.phase = 'input'; // input | resolving | finale | won | lost | outOfMoves
    this.collected = new Array(COLOR_NAMES.length).fill(0);
    this.counts = { sand: 0, coral: 0, ice: 0, eggs: 0, cleared: 0, specials: 0, combos: 0 };
    this.usedContinue = false;
    this.pendingShuffle = false;
    this.pending = null;
    this.resolveMode = 'check';
    this.origin = [];
    this.after = null;
    this.turn = 0;
  }

  // A detached copy, so the autoplayer and hints can try a move out.
  clone() {
    const copy = Object.create(Game.prototype);
    Object.assign(copy, this, {
      board: this.board.clone(),
      rng: this.rng.clone(),
      collected: this.collected.slice(),
      counts: { ...this.counts },
      pending: this.pending ? { ...this.pending, seeds: this.pending.seeds.slice(), transforms: this.pending.transforms.slice() } : null,
    });
    return copy;
  }

  // ------------------------------------------------------------ queries

  get remaining() {
    const left = { sand: 0, coral: 0, ice: 0, eggs: 0 };
    for (const i of this.board.playableIndices()) {
      left.sand += this.board.ground[i];
      const cell = this.board.at(i);
      if (!cell) continue;
      if (cell.kind === 'coral') left.coral += cell.hits;
      if (cell.kind === 'egg') left.eggs++;
      if (isJelly(cell)) left.ice += cell.ice;
    }
    return left;
  }

  goalStatus() {
    const left = this.remaining;
    return this.level.goals.map((goal) => {
      let have = 0;
      if (goal.type === 'score') have = Math.min(this.score, goal.need);
      else if (goal.type === 'collect') have = Math.min(this.collected[goal.color], goal.need);
      else have = goal.need - left[goal.type];
      return {
        ...goal,
        have: Math.max(0, Math.min(goal.need, have)),
        done: have >= goal.need,
        label: goalLabel(goal),
      };
    });
  }

  goalsMet() {
    return this.goalStatus().every((g) => g.done);
  }

  stars() {
    return this.level.stars.filter((t) => this.score >= t).length;
  }

  // The move a hint should point at: prefer ones that build a special.
  bestMove() {
    const moves = findMoves(this.board);
    if (!moves.length) return null;
    const rank = (m) => (m.kind === 'special' ? 5 : m.makes === RAINBOW ? 4 : m.makes === BOMB ? 3 : m.makes ? 2 : 1) * 100 + (m.size || 0);
    return moves.reduce((best, m) => (rank(m) > rank(best) ? m : best), moves[0]);
  }

  // ------------------------------------------------------------ input

  swap(a, b) {
    if (this.phase !== 'input') return { ok: false, reason: 'busy' };
    if (!swapAllowed(this.board, a, b)) return { ok: false, reason: 'blocked' };
    const cells = this.board.cells;
    [cells[a], cells[b]] = [cells[b], cells[a]];
    const blast = swapBlast(this.board, a, b, { rng: this.rng });
    const groups = blast ? [] : findMatches(this.board, b);
    if (!blast && !groups.length) {
      [cells[a], cells[b]] = [cells[b], cells[a]];
      return { ok: false, reason: 'nomatch' };
    }
    this.moves--;
    this.turn++;
    this.chain = 0;
    this.origin = [b, a];
    this.pending = blast;
    this.resolveMode = 'check';
    this.phase = 'resolving';
    if (blast && blast.transforms.length) this.counts.combos++;
    return { ok: true, blast, combo: blast ? blast.kind : null };
  }

  // Free continue: five more moves, once per level.
  useContinue() {
    if (this.phase !== 'outOfMoves' || this.usedContinue) return false;
    this.usedContinue = true;
    this.moves += CONTINUE_MOVES;
    this.phase = 'input';
    // The last move may have left a dead board; shuffle it like any turn.
    if (!hasMoves(this.board)) this.pendingShuffle = true;
    return true;
  }

  giveUp() {
    if (this.phase === 'outOfMoves') this.phase = 'lost';
  }

  doShuffle() {
    this.pendingShuffle = false;
    const changed = shuffleBoard(this.board, this.rng);
    return { type: 'shuffle', cells: changed };
  }

  // ------------------------------------------------------------ resolution

  step() {
    if (this.phase === 'finale') return this.finaleStep();
    if (this.phase !== 'resolving') return null;
    if (this.resolveMode === 'fall') {
      this.resolveMode = 'check';
      return this.fallStep();
    }
    const pending = this.pending;
    this.pending = null;
    let groups = [];
    const seeds = pending ? pending.seeds.slice() : [];
    if (!pending) {
      groups = findMatches(this.board, this.origin);
      if (!groups.length) {
        // Hatched eggs leave gaps behind, so keep dropping until it is full.
        if (this.hasEmpty()) {
          const fall = this.fallStep();
          if (fall.moves.length || fall.spawns.length || fall.eggs.length) return fall;
        }
        this.finishResolve();
        // Rolling straight into the reef party keeps the caller's loop simple.
        return this.phase === 'finale' ? this.finaleStep() : null;
      }
    }
    this.chain++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const transforms = pending ? pending.transforms : [];
    for (const t of transforms) {
      const cell = this.board.at(t.index);
      if (isJelly(cell)) cell.special = t.special;
    }
    const step = this.applyClear(groups, seeds, transforms);
    this.resolveMode = 'fall';
    return step;
  }

  applyClear(groups, seeds, transforms) {
    const board = this.board;
    const created = [];
    const groupCells = new Set();
    for (const g of groups) {
      for (const i of g.cells) groupCells.add(i);
      if (g.special) created.push({ index: g.at, special: g.special, color: g.color });
    }
    const createdAt = new Set(created.map((c) => c.index));
    // Specials caught in a match go off too.
    for (const i of groupCells) {
      const cell = board.at(i);
      if (isJelly(cell) && cell.special && !createdAt.has(i)) {
        seeds.push({ index: i, kind: cell.special, color: cell.color ?? undefined });
      }
    }
    const { hits, blasts } = seeds.length ? detonate(board, seeds, { rng: this.rng }) : { hits: [], blasts: [] };
    const targets = new Set([...groupCells, ...hits]);
    for (const i of createdAt) targets.delete(i);

    const cleared = [];
    const sand = [];
    const ice = [];
    const coralHit = [];
    const bumped = new Set();
    const mult = Math.min(5, 1 + 0.4 * (this.chain - 1));
    let gained = 0;

    const damageCoral = (i) => {
      const cell = board.at(i);
      if (!cell || cell.kind !== 'coral') return;
      cell.hits--;
      this.counts.coral++;
      gained += SCORE.coral * mult;
      coralHit.push({ index: i, id: cell.id, left: cell.hits });
      if (cell.hits <= 0) board.cells[i] = null;
    };
    const chipIce = (i) => {
      const cell = board.at(i);
      if (!isJelly(cell) || cell.ice <= 0) return;
      cell.ice--;
      this.counts.ice++;
      gained += SCORE.ice * mult;
      ice.push({ index: i, id: cell.id, left: cell.ice });
    };

    for (const i of targets) {
      const cell = board.at(i);
      if (!cell) continue;
      if (cell.kind === 'coral') { damageCoral(i); continue; }
      if (cell.kind === 'egg') continue;
      if (cell.ice > 0) { chipIce(i); continue; }
      cleared.push({ index: i, id: cell.id, color: cell.color, special: cell.special });
      if (cell.color !== null) this.collected[cell.color]++;
      this.counts.cleared++;
      gained += SCORE.jelly * mult;
      board.cells[i] = null;
      if (board.ground[i] > 0) {
        board.ground[i]--;
        this.counts.sand++;
        gained += SCORE.sand * mult;
        sand.push({ index: i, left: board.ground[i] });
      }
      // Clearing a jelly rattles the coral and ice right next to it.
      for (const j of neighbors(board, i)) {
        if (targets.has(j) || bumped.has(j)) continue;
        const other = board.at(j);
        if (!other) continue;
        if (other.kind === 'coral') { bumped.add(j); damageCoral(j); }
        else if (isJelly(other) && other.ice > 0) { bumped.add(j); chipIce(j); }
      }
    }
    for (const made of created) {
      board.cells[made.index] = jelly(made.color, made.special);
      this.counts.specials++;
      gained += SCORE.made * mult;
    }
    gained = Math.round(gained);
    this.score += gained;
    return {
      type: 'clear', chain: this.chain, mult, gained, score: this.score,
      groups, created, cleared, sand, ice, coral: coralHit, blasts, transforms,
    };
  }

  hasEmpty() {
    return this.board.playableIndices().some((i) => !this.board.at(i));
  }

  fallStep() {
    const { moves, spawns } = settle(this.board);
    const hatched = collectEggs(this.board);
    if (hatched.length) {
      this.counts.eggs += hatched.length;
      this.score += SCORE.egg * hatched.length;
    }
    return { type: 'fall', moves, spawns, eggs: hatched, score: this.score };
  }

  finishResolve() {
    this.chain = 0;
    this.pending = null;
    if (this.after === 'won') {
      this.after = null;
      this.phase = 'won';
      return null;
    }
    if (this.goalsMet()) {
      this.phase = this.moves > 0 ? 'finale' : 'won';
      return null;
    }
    if (this.moves <= 0) {
      this.phase = this.usedContinue ? 'lost' : 'outOfMoves';
      return null;
    }
    this.phase = 'input';
    if (!hasMoves(this.board)) this.pendingShuffle = true;
    return null;
  }

  // Reef party: leftover moves turn into specials, then everything goes off.
  finaleStep() {
    const board = this.board;
    if (this.moves > 0) {
      const spots = board.playableIndices().filter((i) => {
        const cell = board.at(i);
        return isMatchable(cell) && !cell.special;
      });
      if (!spots.length) { this.moves = 0; return this.finaleStep(); }
      const created = [];
      const take = Math.min(this.moves, 2);
      for (let k = 0; k < take && spots.length; k++) {
        const pick = spots.splice(this.rng.int(spots.length), 1)[0];
        const cell = board.at(pick);
        cell.special = this.rng.pick([STRIPE_H, STRIPE_V, BOMB, BOMB, RAINBOW]);
        if (cell.special === RAINBOW) cell.color = null;
        created.push({ index: pick, special: cell.special, color: cell.color });
        this.moves--;
        this.score += SCORE.leftoverMove;
      }
      this.counts.specials += created.length;
      return { type: 'party', created, score: this.score, movesLeft: this.moves };
    }
    const seeds = [];
    for (const i of board.playableIndices()) {
      const cell = board.at(i);
      if (isJelly(cell) && cell.special && cell.ice === 0) {
        seeds.push({ index: i, kind: cell.special, color: cell.color ?? undefined });
      }
    }
    if (!seeds.length) { this.phase = 'won'; return null; }
    this.chain = 0;
    this.pending = { kind: 'party', seeds, transforms: [] };
    this.phase = 'resolving';
    this.resolveMode = 'check';
    this.after = 'won';
    return this.step();
  }
}

export { STRIPE_H, STRIPE_V, BOMB, RAINBOW };
