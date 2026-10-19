// The chess AI: piece-square evaluation and an alpha-beta search with
// iterative deepening, a transposition table, quiescence search, null-move
// pruning, late-move reductions, and MVV-LVA / killer / history ordering.
// DOM-free; the page runs it inside a Web Worker (ai-worker.js).
import {
  WHITE, PAWN, BISHOP, KING, EP, CASTLE_K, CASTLE_Q, SHIELD, SWAP,
  fileOf, rankOf,
} from './chess.js';
import { makeRng } from './rng.js';

export const MATE = 100000;
export const MATE_BOUND = MATE - 1000;
const INF = 1000000;
const VALUE = [0, 100, 320, 330, 500, 900, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];

// Piece-square tables from White's side, a8 first (the "simplified
// evaluation function" tables).
const PST = [
  null,
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
];
const KING_MG = [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20];
const KING_EG = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
const POWER_VALUE = [0, 35, 30, 60];

// Static evaluation in centipawns from the side to move's point of view.
export function evaluate(pos) {
  const b = pos.board;
  let score = 0, phase = 0;
  let wb = 0, bb = 0, wMat = 0, bMat = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (!p) continue;
    const t = p & 7, white = (p >> 3) === WHITE;
    const idx = white ? (7 - (s >> 4)) * 8 + (s & 7) : (s >> 4) * 8 + (s & 7);
    phase += PHASE[t];
    if (t === KING) continue;
    const v = VALUE[t] + PST[t][idx];
    if (white) { score += v; wMat += VALUE[t]; if (t === BISHOP) wb++; } else { score -= v; bMat += VALUE[t]; if (t === BISHOP) bb++; }
  }
  if (phase > 24) phase = 24;
  const wk = pos.kings[0], bk = pos.kings[1];
  const wi = (7 - (wk >> 4)) * 8 + (wk & 7), bi = (bk >> 4) * 8 + (bk & 7);
  score += ((KING_MG[wi] - KING_MG[bi]) * phase + (KING_EG[wi] - KING_EG[bi]) * (24 - phase)) / 24;
  if (wb >= 2) score += 30;
  if (bb >= 2) score -= 30;
  // Mop-up: when one side is well ahead in an endgame, drive the lone king
  // to the edge and bring our own king closer, so the bot actually mates.
  if (phase <= 8 && Math.abs(wMat - bMat) >= 300) {
    const loser = wMat > bMat ? bk : wk, winner = wMat > bMat ? wk : bk;
    const cf = Math.abs(fileOf(loser) * 2 - 7) + Math.abs(rankOf(loser) * 2 - 7);
    const dist = Math.abs(fileOf(loser) - fileOf(winner)) + Math.abs(rankOf(loser) - rankOf(winner));
    const bonus = cf * 8 + (14 - dist) * 6;
    score += wMat > bMat ? bonus : -bonus;
  }
  if (pos.inv) {
    for (let t = 1; t <= 3; t++) score += (pos.inv[0][t] - pos.inv[1][t]) * POWER_VALUE[t];
  }
  return pos.turn === WHITE ? Math.round(score) : -Math.round(score);
}

const now = () => (globalThis.performance ? performance.now() : Date.now());

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

export class Searcher {
  constructor() {
    this.ttKey = new Int32Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.history = new Int32Array(16 * 128);
    this.killers = new Int32Array(128 * 2);
    this.nodes = 0;
    this.stop = false;
  }

  clear() {
    this.ttFlag.fill(0);
    this.history.fill(0);
  }

  // Search for the best move. Returns { move, score, depth, nodes, ms, pv }.
  //   maxDepth  deepest iteration
  //   timeMs    soft budget: no new iteration starts after half of it, and
  //             the search aborts at the full budget
  //   nodeLimit hard node cap (deterministic budgets for tests)
  search(pos, { maxDepth = 64, timeMs = 1000, nodeLimit = Infinity } = {}) {
    const start = now();
    this.deadline = start + timeMs;
    this.nodeLimit = nodeLimit;
    this.nodes = 0;
    this.stop = false;
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;
    this.pos = pos;
    const legal = pos.legalMoves();
    let best = { move: legal[0] || 0, score: 0, depth: 0, pv: legal[0] ? [legal[0]] : [] };
    if (legal.length <= 1) return { ...best, nodes: 0, ms: 0, legal: legal.length };
    let prev = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      this.rootBest = 0;
      this.rootScore = -INF;
      // Aspiration window around the last score.
      let alpha = depth >= 4 ? prev - 50 : -INF, beta = depth >= 4 ? prev + 50 : INF;
      let score = this.negamax(depth, alpha, beta, 0, true);
      if (!this.stop && (score <= alpha || score >= beta)) score = this.negamax(depth, -INF, INF, 0, true);
      if (this.stop) {
        // A partial iteration still searched its first (best-ordered) move.
        if (this.rootBest && this.rootScore > -INF && depth > 1 && this.rootBest !== best.move && this.rootScore > best.score) {
          best = { move: this.rootBest, score: this.rootScore, depth: depth - 1, pv: [this.rootBest] };
        }
        break;
      }
      prev = score;
      best = { move: this.rootBest, score, depth, pv: this.pv(pos, depth) };
      if (Math.abs(score) >= MATE_BOUND && depth >= (MATE - Math.abs(score))) break;
      if (now() - start > timeMs * 0.5) break;
    }
    return { ...best, nodes: this.nodes, ms: Math.round(now() - start), legal: legal.length };
  }

  checkTime() {
    if ((this.nodes & 1023) === 0 && (now() > this.deadline || this.nodes > this.nodeLimit)) this.stop = true;
    else if (this.nodes > this.nodeLimit) this.stop = true;
  }

  pv(pos, depth) {
    const line = [];
    let n = 0;
    while (n < depth) {
      const i = pos.h1 & (TT_SIZE - 1);
      if (this.ttFlag[i] === 0 || this.ttKey[i] !== pos.h2) break;
      const m = this.ttMove[i];
      if (!m || !pos.legalMoves().includes(m)) break;
      line.push(m);
      pos.make(m);
      n++;
    }
    for (let i = 0; i < n; i++) pos.unmake();
    return line;
  }

  orderScores(moves, ttMove, ply) {
    const b = this.pos.board;
    const scores = new Int32Array(moves.length);
    const k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m === ttMove) { scores[i] = 10000000; continue; }
      const from = m & 127, to = (m >> 7) & 127, flag = m >>> 17, promo = (m >> 14) & 7;
      const victim = flag === EP ? PAWN : (flag === SHIELD || flag === SWAP || flag === CASTLE_K || flag === CASTLE_Q) ? 0 : b[to] & 7;
      if (victim) scores[i] = 1000000 + VALUE[victim] * 10 - VALUE[b[from] & 7] / 10;
      else if (promo) scores[i] = 900000 + VALUE[promo];
      else if (m === k1) scores[i] = 800000;
      else if (m === k2) scores[i] = 700000;
      else scores[i] = this.history[(b[from] & 15) * 128 + to] - (flag === SHIELD || flag === SWAP ? 5000 : 0);
    }
    return scores;
  }

  static pick(moves, scores, i) {
    let bi = i;
    for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[bi]) bi = j;
    if (bi !== i) {
      const m = moves[i]; moves[i] = moves[bi]; moves[bi] = m;
      const s = scores[i]; scores[i] = scores[bi]; scores[bi] = s;
    }
    return moves[i];
  }

  negamax(depth, alpha, beta, ply, root = false) {
    const pos = this.pos;
    if (!root) {
      this.nodes++;
      this.checkTime();
      if (this.stop) return 0;
      if (pos.half >= 100 || pos.isRepeat()) return 0;
      // Mate-distance pruning.
      const mAlpha = Math.max(alpha, -MATE + ply), mBeta = Math.min(beta, MATE - ply - 1);
      if (mAlpha >= mBeta) return mAlpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    if (ply >= 100) return evaluate(pos);

    const ti = pos.h1 & (TT_SIZE - 1);
    let ttMove = 0;
    if (this.ttFlag[ti] && this.ttKey[ti] === pos.h2) {
      ttMove = this.ttMove[ti];
      if (!root && this.ttDepth[ti] >= depth) {
        let s = this.ttScore[ti];
        if (s >= MATE_BOUND) s -= ply; else if (s <= -MATE_BOUND) s += ply;
        const f = this.ttFlag[ti];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    // Null move: if passing still beats beta, this line is too good to need a full search.
    if (!root && !inCheck && depth >= 3 && beta < MATE_BOUND && this.hasPieces(pos.turn) && evaluate(pos) >= beta) {
      pos.makeNull();
      const s = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1);
      pos.unmakeNull();
      if (this.stop) return 0;
      if (s >= beta) return beta;
    }

    const moves = pos.generate([]);
    const scores = this.orderScores(moves, ttMove, ply);
    const alpha0 = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = Searcher.pick(moves, scores, i);
      pos.make(m);
      if (pos.leftInCheck()) { pos.unmake(); continue; }
      legal++;
      const quiet = scores[i] < 700000;
      let s;
      if (legal === 1) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      else {
        // Late quiet moves get a reduced, null-window look first.
        const reduce = depth >= 3 && legal > 3 && quiet && !inCheck && !pos.inCheck() ? 1 + (legal > 10 ? 1 : 0) : 0;
        s = -this.negamax(depth - 1 - reduce, -alpha - 1, -alpha, ply + 1);
        if (s > alpha && (reduce || s < beta)) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      }
      pos.unmake();
      if (this.stop) return 0;
      if (s > best) {
        best = s;
        bestMove = m;
        if (root) { this.rootBest = m; this.rootScore = s; }
      }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (quiet) {
          if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
          const hi = (pos.board[m & 127] & 15) * 128 + ((m >> 7) & 127);
          this.history[hi] += depth * depth;
        }
        break;
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;

    let store = best;
    if (store >= MATE_BOUND) store += ply; else if (store <= -MATE_BOUND) store -= ply;
    this.ttKey[ti] = pos.h2;
    this.ttMove[ti] = bestMove;
    this.ttScore[ti] = store;
    this.ttDepth[ti] = depth;
    this.ttFlag[ti] = best >= beta ? TT_LOWER : best > alpha0 ? TT_EXACT : TT_UPPER;
    return best;
  }

  hasPieces(color) {
    const b = this.pos.board;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p && (p >> 3) === color) { const t = p & 7; if (t !== PAWN && t !== KING) return true; }
    }
    return false;
  }

  quiesce(alpha, beta, ply) {
    const pos = this.pos;
    this.nodes++;
    this.checkTime();
    if (this.stop) return 0;
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply >= 100) return stand;
    const moves = pos.generate([], true);
    const scores = this.orderScores(moves, 0, Math.min(ply, 127));
    for (let i = 0; i < moves.length; i++) {
      const m = Searcher.pick(moves, scores, i);
      pos.make(m);
      if (pos.leftInCheck()) { pos.unmake(); continue; }
      const s = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stop) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  // Full-window score for every root move at a fixed depth (used by the
  // gentler bots, which pick among them with some personality noise).
  scoreAll(pos, depth) {
    this.pos = pos;
    this.stop = false;
    this.deadline = Infinity;
    this.nodeLimit = Infinity;
    this.nodes = 0;
    const out = [];
    for (const m of pos.legalMoves()) {
      pos.make(m);
      const s = -this.negamax(depth - 1, -INF, INF, 1);
      pos.unmake();
      out.push({ move: m, score: s });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }
}

// ---------------------------------------------------------------- bots

// Search settings behind each bot personality (see bots.js for the faces).
export const LEVELS = [
  { id: 'pip', depth: 1, noise: 160, blunder: 0.3, minMs: 500 },
  { id: 'bella', depth: 2, noise: 70, blunder: 0.08, minMs: 600 },
  { id: 'captain', depth: 3, noise: 25, blunder: 0, minMs: 650 },
  { id: 'fox', maxDepth: 6, timeMs: 700, minMs: 600 },
  { id: 'owl', maxDepth: 40, timeMs: 1600, minMs: 500 },
];

// Choose a bot move. `seed` makes the personality noise repeatable.
export function chooseMove(searcher, pos, level, seed = 1, { timeScale = 1 } = {}) {
  const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];
  const t0 = now();
  if (cfg.depth) {
    const rng = makeRng(seed);
    const all = searcher.scoreAll(pos, cfg.depth);
    if (!all.length) return { move: 0, score: 0, depth: 0, nodes: 0, ms: 0 };
    let pick;
    if (all.length > 1 && rng() < cfg.blunder) {
      // On purpose: any move except the best one.
      pick = all[1 + Math.floor(rng() * (all.length - 1))];
    } else {
      let bestScore = -INF;
      for (const c of all) {
        // Never throw away a found mate; otherwise add personality noise.
        const noisy = c.score >= MATE_BOUND ? c.score : c.score + (rng() * 2 - 1) * cfg.noise;
        if (noisy > bestScore) { bestScore = noisy; pick = c; }
      }
    }
    return { move: pick.move, score: pick.score, depth: cfg.depth, nodes: searcher.nodes, ms: Math.round(now() - t0) };
  }
  return searcher.search(pos, { maxDepth: cfg.maxDepth, timeMs: cfg.timeMs * timeScale });
}

