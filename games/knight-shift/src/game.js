// A game session: the position plus everything the screen needs (history,
// SAN, captured pieces, fog, power targets) and saves. DOM-free.
import {
  Position, START_FEN, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  CASTLE_K, CASTLE_Q, LEAP, SHIELD, SWAP, EP, POWER_SHIELD, POWER_SWAP, POWER_LEAP,
  onBoard, rankOf, mFrom, mTo, mFlag, mPromo, isPower,
} from './chess.js';
import { chess960Fen } from './chess960.js';
import { placePowers } from './powers.js';

export const MODES = ['classic', 'fog', 'powers', '960'];
const POWER_OF_FLAG = { [SHIELD]: POWER_SHIELD, [SWAP]: POWER_SWAP, [LEAP]: POWER_LEAP };

// The starting setup for a mode. `seed` picks the Chess960 layout and the
// power squares, and is stored in saves so a game replays exactly.
export function makeSetup(mode, seed = 1) {
  if (mode === '960') {
    const index = Math.abs(seed) % 960;
    return { mode, fen: chess960Fen(index), chess960: true, index };
  }
  if (mode === 'powers') return { mode, fen: START_FEN, powers: placePowers(seed), seed };
  return { mode, fen: START_FEN };
}

export function buildPosition(setup, uciMoves = []) {
  const pos = Position.fromFen(setup.fen || START_FEN, { chess960: !!setup.chess960, powers: setup.powers || null });
  for (const u of uciMoves) {
    const m = pos.moveFromUci(u);
    if (!m) throw new Error(`Illegal move in replay: ${u}`);
    pos.make(m);
  }
  return pos;
}

export class Game {
  constructor(setup, uciMoves = []) {
    this.setup = setup;
    this.pos = buildPosition(setup);
    this.history = []; // { move, uci, san, color, captured, power, collected }
    this.legal = this.pos.legalMoves();
    for (const u of uciMoves) {
      const m = this.pos.moveFromUci(u, this.legal);
      if (!m) throw new Error(`Illegal move in replay: ${u}`);
      this.play(m);
    }
  }

  get turn() { return this.pos.turn; }
  get fen() { return this.pos.fen(); }
  get startColor() { return buildPosition(this.setup).turn; }

  status() {
    return this.pos.status(this.legal);
  }

  // Play a legal move; returns the history record (with what the renderer
  // needs to animate it).
  play(m) {
    const pos = this.pos;
    const from = mFrom(m), to = mTo(m), flag = mFlag(m);
    const san = pos.san(m, this.legal);
    const uci = pos.uci(m);
    const color = pos.turn;
    const piece = pos.board[from];
    let captured = 0, capSq = -1;
    if (flag === EP) { capSq = to + (color === WHITE ? -16 : 16); captured = pos.board[capSq]; }
    else if (flag !== CASTLE_K && flag !== CASTLE_Q && flag !== SWAP && flag !== SHIELD && pos.board[to]) { capSq = to; captured = pos.board[to]; }
    const collected = pos.powerSq && flag !== SWAP && flag !== SHIELD && flag !== CASTLE_K && flag !== CASTLE_Q ? pos.powerSq[to] : 0;
    // Pieces that slide, for animation: [{ piece, from, to }].
    const slides = [];
    if (flag === CASTLE_K || flag === CASTLE_Q) {
      const base = color === WHITE ? 0 : 0x70;
      slides.push({ piece, from, to: base + (flag === CASTLE_K ? 6 : 2) });
      slides.push({ piece: pos.board[to], from: to, to: base + (flag === CASTLE_K ? 5 : 3) });
    } else if (flag === SWAP) {
      slides.push({ piece, from, to }, { piece: pos.board[to], from: to, to: from });
    } else if (flag !== SHIELD) {
      slides.push({ piece, from, to, jump: flag === LEAP || (piece & 7) === KNIGHT });
    }
    pos.make(m);
    this.legal = pos.legalMoves();
    const rec = {
      move: m, uci, san, color, piece, captured, capSq, slides, collected,
      power: POWER_OF_FLAG[flag] || 0, promo: mPromo(m), check: pos.inCheck(), flag,
    };
    this.history.push(rec);
    return rec;
  }

  undo() {
    if (!this.history.length) return null;
    const rec = this.history.pop();
    this.pos.unmake();
    this.legal = this.pos.legalMoves();
    return rec;
  }

  get lastMove() { return this.history[this.history.length - 1] || null; }

  uciMoves() { return this.history.map((h) => h.uci); }

  // Normal (non-power) legal moves from a square, keyed by the square the
  // player taps to make them. Castling answers to the king's landing square
  // and to the rook's square (needed in Chess960).
  movesFrom(sq) {
    const map = new Map();
    for (const m of this.legal) {
      if (mFrom(m) !== sq || isPower(m)) continue;
      const f = mFlag(m);
      if (f === CASTLE_K || f === CASTLE_Q) {
        const kTo = Position.castleKingTo(m);
        if (kTo !== sq) add(map, kTo, m);
        add(map, mTo(m), m);
      } else add(map, mTo(m), m);
    }
    return map;
  }

  powerCount(color, type) {
    return this.pos.inv ? this.pos.inv[color][type] : 0;
  }

  powerMoves(type) {
    const flag = type === POWER_SHIELD ? SHIELD : type === POWER_SWAP ? SWAP : LEAP;
    return this.legal.filter((m) => mFlag(m) === flag);
  }

  // Captured pieces, by the color that captured them.
  capturedBy(color) {
    return this.history.filter((h) => h.color === color && h.captured).map((h) => h.captured);
  }

  // Material balance in pawns from White's side (for the "+3" badge).
  materialBalance() {
    const VAL = [0, 1, 3, 3, 5, 9, 0];
    let sum = 0;
    const b = this.pos.board;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p) sum += (p >> 3) === WHITE ? VAL[p & 7] : -VAL[p & 7];
    }
    return sum;
  }

  toSave() {
    return { setup: this.setup, moves: this.uciMoves() };
  }

  static fromSave(data) {
    return new Game(data.setup, data.moves || []);
  }
}

function add(map, key, m) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(m);
}

// Fog of War: the squares `color` can see. Its own pieces' squares plus
// every square they could move to or attack (pawns see one or two squares
// ahead and both diagonals). Sliding pieces see up to and including the
// first piece in each direction.
const N_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
const K_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];
export function fogVisible(pos, color) {
  const vis = new Uint8Array(128);
  const b = pos.board;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (!p || (p >> 3) !== color) continue;
    vis[s] = 1;
    const t = p & 7;
    if (t === PAWN) {
      const fwd = color === WHITE ? 16 : -16;
      const one = s + fwd;
      if (onBoard(one)) {
        vis[one] = 1;
        const start = color === WHITE ? 1 : 6;
        if (rankOf(s) === start && !b[one] && onBoard(one + fwd)) vis[one + fwd] = 1;
        if (onBoard(one - 1)) vis[one - 1] = 1;
        if (onBoard(one + 1)) vis[one + 1] = 1;
      }
    } else if (t === KNIGHT || t === KING) {
      for (const d of t === KNIGHT ? N_OFF : K_OFF) if (onBoard(s + d)) vis[s + d] = 1;
    } else {
      const dirs = t === BISHOP ? [-17, -15, 15, 17] : t === ROOK ? [-16, -1, 1, 16] : K_OFF;
      for (const d of dirs) {
        for (let c = s + d; onBoard(c); c += d) {
          vis[c] = 1;
          if (b[c]) break;
        }
      }
    }
  }
  return vis;
}

export { WHITE, BLACK, QUEEN, KING };
