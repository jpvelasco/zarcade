// The chess rules engine. DOM-free, used by the page, the AI worker and the
// Node tests.
//
// Board: 0x88 mailbox (index = rank * 16 + file, rank 0 is White's back
// rank). Pieces are `color << 3 | type`. Moves are small integers:
//   from | to << 7 | promo << 14 | flag << 17
// Castling is stored as "king takes own rook" (to = the rook's square), which
// covers Chess960 where the king and rook may start anywhere on the back rank.
//
// Power Squares (an optional twist) live in the same position so the search,
// repetition and undo treat them like any other state:
//   SHIELD  uses your turn: one of your pieces can't be captured on the
//           opponent's next move.
//   SWAP    uses your turn: two of your pieces (not the king) trade places.
//   LEAP    your move: one piece (not king or knight) makes a knight's jump.
// Moving a piece onto a glowing power square collects that power (one use).
import { makeRng } from './rng.js';

export const WHITE = 0, BLACK = 1;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const NORMAL = 0, DOUBLE = 1, EP = 2, CASTLE_K = 3, CASTLE_Q = 4, LEAP = 5, SHIELD = 6, SWAP = 7;
export const POWER_SHIELD = 1, POWER_SWAP = 2, POWER_LEAP = 3;
export const POWER_NAMES = ['', 'shield', 'swap', 'leap'];
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const makePiece = (color, type) => (color << 3) | type;
export const pieceColor = (p) => p >> 3;
export const pieceType = (p) => p & 7;
export const fileOf = (s) => s & 7;
export const rankOf = (s) => s >> 4;
export const square = (file, rank) => rank * 16 + file;
export const onBoard = (s) => (s & 0x88) === 0;
export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export function parseSq(name) {
  if (typeof name !== 'string' || name.length !== 2) return -1;
  const f = name.charCodeAt(0) - 97, r = name.charCodeAt(1) - 49;
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 16 + f : -1;
}
// 0..63 index (a1 = 0, h8 = 63) <-> 0x88 square.
export const to64 = (s) => (s >> 4) * 8 + (s & 7);
export const from64 = (i) => (i >> 3) * 16 + (i & 7);

export const encode = (from, to, flag = NORMAL, promo = 0) => from | (to << 7) | (promo << 14) | (flag << 17);
export const mFrom = (m) => m & 127;
export const mTo = (m) => (m >> 7) & 127;
export const mPromo = (m) => (m >> 14) & 7;
export const mFlag = (m) => m >>> 17;

const N_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
const K_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];
const DIAG = [-17, -15, 15, 17];
const ORTHO = [-16, -1, 1, 16];
const PROMOS = [QUEEN, KNIGHT, ROOK, BISHOP];
const LETTER = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
const SAN_LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];

// ---------------------------------------------------------------- zobrist
// Two independent 32-bit keys make an effectively 64-bit hash.
const Z = (() => {
  const rng = makeRng(0x5eed);
  const r = () => (rng() * 4294967296) | 0;
  const table = (n) => { const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = r(); return a; };
  return {
    p1: table(16 * 128), p2: table(16 * 128),
    c1: table(16), c2: table(16),
    e1: table(128), e2: table(128),
    t1: r(), t2: r(),
    w1: table(4 * 128), w2: table(4 * 128), // power squares
    i1: table(2 * 4 * 8), i2: table(2 * 4 * 8), // power inventory counts
    s1: table(128), s2: table(128), // shielded square
  };
})();
const invKey = (color, type, count) => (color * 4 + type) * 8 + Math.min(7, count);

function newEntry() {
  return { m: 0, captured: 0, capSq: -1, c0: -1, c1: -1, c2: -1, c3: -1, ep: -1, half: 0, h1: 0, h2: 0, shield: -1, gotType: 0 };
}

export class Position {
  constructor() {
    this.board = new Int8Array(128);
    this.turn = WHITE;
    // Castling rook squares: [white king-side, white queen-side, black K, black Q]; -1 = no right.
    this.castleRook = [-1, -1, -1, -1];
    this.ep = -1;
    this.half = 0;
    this.full = 1;
    this.kings = [-1, -1];
    this.chess960 = false;
    this.powerSq = null; // Int8Array(128) of power types, when Power Squares is on
    this.inv = null; // [Int8Array(4), Int8Array(4)]
    this.shield = -1;
    this.h1 = 0;
    this.h2 = 0;
    this.stack = [];
    this.ply = 0;
    this.hist1 = [];
    this.hist2 = [];
  }

  static fromFen(fen = START_FEN, { chess960 = false, powers = null } = {}) {
    const pos = new Position();
    pos.loadFen(fen, chess960);
    if (powers) pos.enablePowers(powers);
    pos.resetHistory();
    return pos;
  }

  // powers: { squares: [[sqName, type], ...], inv?: [[s,w,l],[s,w,l]], shield? }
  enablePowers(powers) {
    this.powerSq = new Int8Array(128);
    this.inv = [new Int8Array(4), new Int8Array(4)];
    for (const [name, type] of powers.squares || []) {
      const s = typeof name === 'number' ? name : parseSq(name);
      if (s >= 0 && type >= 1 && type <= 3 && !this.board[s]) this.powerSq[s] = type;
    }
    if (powers.inv) for (let c = 0; c < 2; c++) for (let t = 1; t <= 3; t++) this.inv[c][t] = powers.inv[c]?.[t - 1] | 0;
    this.resetHistory();
  }

  resetHistory() {
    this.computeHash();
    this.stack.length = 0;
    this.ply = 0;
    this.hist1 = [this.h1];
    this.hist2 = [this.h2];
  }

  loadFen(fen, chess960 = false) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error(`Bad FEN: ${fen}`);
    const b = this.board;
    b.fill(0);
    this.kings = [-1, -1];
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error(`Bad FEN board: ${fen}`);
    for (let i = 0; i < 8; i++) {
      const rank = 7 - i;
      let file = 0;
      for (const ch of rows[i]) {
        if (ch >= '1' && ch <= '8') { file += +ch; continue; }
        const lower = ch.toLowerCase();
        const type = LETTER.indexOf(lower);
        if (type < 1 || file > 7) throw new Error(`Bad FEN piece: ${fen}`);
        const color = ch === lower ? BLACK : WHITE;
        const s = square(file, rank);
        b[s] = makePiece(color, type);
        if (type === KING) this.kings[color] = s;
        file++;
      }
      if (file !== 8) throw new Error(`Bad FEN rank: ${fen}`);
    }
    if (this.kings[0] < 0 || this.kings[1] < 0) throw new Error(`FEN needs both kings: ${fen}`);
    this.turn = parts[1] === 'b' ? BLACK : WHITE;
    this.castleRook = [-1, -1, -1, -1];
    let fileLetters = false;
    if (parts[2] !== '-') {
      for (const ch of parts[2]) {
        const color = ch === ch.toLowerCase() ? BLACK : WHITE;
        const base = color === WHITE ? 0 : 0x70;
        const k = this.kings[color];
        if (rankOf(k) !== rankOf(base)) continue;
        const up = ch.toUpperCase();
        const rook = makePiece(color, ROOK);
        let rs = -1, side = -1;
        if (up === 'K') { side = 0; for (let f = 7; f > fileOf(k); f--) if (b[base + f] === rook) { rs = base + f; break; } }
        else if (up === 'Q') { side = 1; for (let f = 0; f < fileOf(k); f++) if (b[base + f] === rook) { rs = base + f; break; } }
        else if (up >= 'A' && up <= 'H') {
          fileLetters = true;
          const f = up.charCodeAt(0) - 65;
          if (b[base + f] === rook) { rs = base + f; side = f > fileOf(k) ? 0 : 1; }
        }
        if (rs >= 0) this.castleRook[color * 2 + side] = rs;
      }
    }
    // Any castling setup other than e-file king and a/h rooks is Chess960.
    const standard = this.castleRook.every((rs, i) => rs < 0 || (fileOf(rs) === (i % 2 === 0 ? 7 : 0) && fileOf(this.kings[i >> 1]) === 4));
    this.chess960 = chess960 || fileLetters || !standard;
    this.ep = -1;
    const ep = parseSq(parts[3]);
    if (ep >= 0) {
      const pawnSq = ep + (this.turn === WHITE ? -16 : 16);
      if (this.board[pawnSq] === makePiece(this.turn ^ 1, PAWN) && this.epCapturable(pawnSq)) this.ep = ep;
    }
    this.half = parseInt(parts[4], 10) || 0;
    this.full = Math.max(1, parseInt(parts[5], 10) || 1);
    this.shield = -1;
    this.powerSq = null;
    this.inv = null;
  }

  // True when a pawn of the side to move stands beside `pawnSq`.
  epCapturable(pawnSq) {
    const mine = makePiece(this.turn, PAWN);
    for (const d of [-1, 1]) {
      const s = pawnSq + d;
      if (onBoard(s) && this.board[s] === mine) return true;
    }
    return false;
  }

  castleMask() {
    return (this.castleRook[0] >= 0 ? 1 : 0) | (this.castleRook[1] >= 0 ? 2 : 0) | (this.castleRook[2] >= 0 ? 4 : 0) | (this.castleRook[3] >= 0 ? 8 : 0);
  }

  computeHash() {
    let h1 = 0, h2 = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.board[s];
      if (p) { h1 ^= Z.p1[p * 128 + s]; h2 ^= Z.p2[p * 128 + s]; }
      if (this.powerSq && this.powerSq[s]) { h1 ^= Z.w1[this.powerSq[s] * 128 + s]; h2 ^= Z.w2[this.powerSq[s] * 128 + s]; }
    }
    const cm = this.castleMask();
    h1 ^= Z.c1[cm]; h2 ^= Z.c2[cm];
    if (this.ep >= 0) { h1 ^= Z.e1[this.ep]; h2 ^= Z.e2[this.ep]; }
    if (this.turn === BLACK) { h1 ^= Z.t1; h2 ^= Z.t2; }
    if (this.inv) {
      for (let c = 0; c < 2; c++) for (let t = 1; t <= 3; t++) { const k = invKey(c, t, this.inv[c][t]); h1 ^= Z.i1[k]; h2 ^= Z.i2[k]; }
    }
    if (this.shield >= 0) { h1 ^= Z.s1[this.shield]; h2 ^= Z.s2[this.shield]; }
    this.h1 = h1; this.h2 = h2;
  }

  clone() {
    const p = new Position();
    p.board.set(this.board);
    p.turn = this.turn;
    p.castleRook = this.castleRook.slice();
    p.ep = this.ep;
    p.half = this.half;
    p.full = this.full;
    p.kings = this.kings.slice();
    p.chess960 = this.chess960;
    if (this.powerSq) { p.powerSq = Int8Array.from(this.powerSq); p.inv = [Int8Array.from(this.inv[0]), Int8Array.from(this.inv[1])]; }
    p.shield = this.shield;
    p.h1 = this.h1;
    p.h2 = this.h2;
    // Keep repetition history so the clone sees the same draws.
    p.hist1 = this.hist1.slice();
    p.hist2 = this.hist2.slice();
    return p;
  }

  // ------------------------------------------------------------ attacks

  isAttacked(s, by) {
    const b = this.board;
    if (by === WHITE) {
      if (onBoard(s - 15) && b[s - 15] === 1) return true;
      if (onBoard(s - 17) && b[s - 17] === 1) return true;
    } else {
      if (onBoard(s + 15) && b[s + 15] === 9) return true;
      if (onBoard(s + 17) && b[s + 17] === 9) return true;
    }
    const kn = makePiece(by, KNIGHT), kg = makePiece(by, KING);
    for (let i = 0; i < 8; i++) { const t = s + N_OFF[i]; if (onBoard(t) && b[t] === kn) return true; }
    for (let i = 0; i < 8; i++) { const t = s + K_OFF[i]; if (onBoard(t) && b[t] === kg) return true; }
    const bi = makePiece(by, BISHOP), ro = makePiece(by, ROOK), qu = makePiece(by, QUEEN);
    for (let i = 0; i < 4; i++) {
      const d = DIAG[i];
      for (let t = s + d; onBoard(t); t += d) { const p = b[t]; if (p) { if (p === bi || p === qu) return true; break; } }
    }
    for (let i = 0; i < 4; i++) {
      const d = ORTHO[i];
      for (let t = s + d; onBoard(t); t += d) { const p = b[t]; if (p) { if (p === ro || p === qu) return true; break; } }
    }
    return false;
  }

  inCheck(color = this.turn) {
    return this.isAttacked(this.kings[color], color ^ 1);
  }

  // Squares of `by` pieces that attack `s` (ignoring pins), for teaching tools.
  attackersOf(s, by) {
    const out = [];
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const p = this.board[from];
      if (!p || (p >> 3) !== by) continue;
      if (this.pieceAttacks(from, s)) out.push(from);
    }
    return out;
  }

  // Does the piece on `from` attack square `to` (ignoring pins)?
  pieceAttacks(from, to) {
    const p = this.board[from], t = p & 7, c = p >> 3, b = this.board;
    const diff = to - from;
    if (t === PAWN) return c === WHITE ? diff === 15 || diff === 17 : diff === -15 || diff === -17;
    if (t === KNIGHT) return N_OFF.includes(diff);
    if (t === KING) return K_OFF.includes(diff);
    const dirs = t === BISHOP ? DIAG : t === ROOK ? ORTHO : K_OFF;
    for (const d of dirs) {
      for (let s = from + d; onBoard(s); s += d) {
        if (s === to) return true;
        if (b[s]) break;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ move generation

  // Pseudo-legal moves (may leave the king in check). `capsOnly` keeps
  // captures and queen promotions, for quiescence search.
  generate(out = [], capsOnly = false) {
    const b = this.board, us = this.turn, them = us ^ 1, shield = this.shield;
    const fwd = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6, lastRank = us === WHITE ? 7 : 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!p || (p >> 3) !== us) continue;
      const t = p & 7;
      if (t === PAWN) {
        const one = s + fwd;
        if (onBoard(one) && !b[one]) {
          if (rankOf(one) === lastRank) {
            if (capsOnly) out.push(encode(s, one, NORMAL, QUEEN));
            else for (const pr of PROMOS) out.push(encode(s, one, NORMAL, pr));
          } else if (!capsOnly) {
            out.push(encode(s, one));
            const two = one + fwd;
            if (rankOf(s) === startRank && !b[two]) out.push(encode(s, two, DOUBLE));
          }
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const c = s + d;
          if (!onBoard(c)) continue;
          const q = b[c];
          if (q && (q >> 3) === them && c !== shield) {
            if (rankOf(c) === lastRank) {
              if (capsOnly) out.push(encode(s, c, NORMAL, QUEEN));
              else for (const pr of PROMOS) out.push(encode(s, c, NORMAL, pr));
            } else out.push(encode(s, c));
          } else if (c === this.ep && c - fwd !== shield) out.push(encode(s, c, EP));
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? N_OFF : K_OFF;
        for (let i = 0; i < 8; i++) {
          const c = s + offs[i];
          if (!onBoard(c)) continue;
          const q = b[c];
          if (!q) { if (!capsOnly) out.push(encode(s, c)); }
          else if ((q >> 3) === them && c !== shield) out.push(encode(s, c));
        }
        if (t === KING && !capsOnly) this.genCastles(out, s);
      } else {
        const dirs = t === BISHOP ? DIAG : t === ROOK ? ORTHO : K_OFF;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i];
          for (let c = s + d; onBoard(c); c += d) {
            const q = b[c];
            if (!q) { if (!capsOnly) out.push(encode(s, c)); continue; }
            if ((q >> 3) === them && c !== shield) out.push(encode(s, c));
            break;
          }
        }
      }
    }
    if (this.inv && !capsOnly) this.genPowers(out);
    return out;
  }

  genCastles(out, k) {
    const us = this.turn, them = us ^ 1, b = this.board;
    const base = us === WHITE ? 0 : 0x70;
    for (let side = 0; side < 2; side++) {
      const rs = this.castleRook[us * 2 + side];
      if (rs < 0) continue;
      const kTo = base + (side === 0 ? 6 : 2), rTo = base + (side === 0 ? 5 : 3);
      const lo = Math.min(k, kTo, rs, rTo), hi = Math.max(k, kTo, rs, rTo);
      let ok = true;
      for (let s = lo; s <= hi; s++) if (s !== k && s !== rs && b[s]) { ok = false; break; }
      if (!ok) continue;
      // The king may not start in, pass through, or land on an attacked square.
      const step = kTo > k ? 1 : -1;
      for (let s = k; ; s += step) {
        if (this.isAttacked(s, them)) { ok = false; break; }
        if (s === kTo) break;
      }
      if (ok) out.push(encode(k, rs, side === 0 ? CASTLE_K : CASTLE_Q));
    }
  }

  genPowers(out) {
    const us = this.turn, them = us ^ 1, b = this.board, inv = this.inv[us];
    if (!inv[POWER_SHIELD] && !inv[POWER_SWAP] && !inv[POWER_LEAP]) return;
    const mine = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p && (p >> 3) === us && (p & 7) !== KING) mine.push(s);
    }
    const lastRank = us === WHITE ? 7 : 0, firstRank = us === WHITE ? 0 : 7;
    if (inv[POWER_SHIELD]) for (const s of mine) out.push(encode(s, s, SHIELD));
    if (inv[POWER_LEAP]) {
      for (const s of mine) {
        const t = b[s] & 7;
        if (t === KNIGHT) continue;
        for (let i = 0; i < 8; i++) {
          const c = s + N_OFF[i];
          if (!onBoard(c)) continue;
          const q = b[c];
          // A leap may not land on a king: kings are never captured.
          if (q && ((q >> 3) !== them || c === this.shield || (q & 7) === KING)) continue;
          if (t === PAWN) {
            const r = rankOf(c);
            if (r === firstRank) continue;
            if (r === lastRank) { for (const pr of PROMOS) out.push(encode(s, c, LEAP, pr)); continue; }
          }
          out.push(encode(s, c, LEAP));
        }
      }
    }
    if (inv[POWER_SWAP]) {
      for (let i = 0; i < mine.length; i++) {
        for (let j = i + 1; j < mine.length; j++) {
          const a = mine[i], c = mine[j];
          const ta = b[a] & 7, tc = b[c] & 7;
          if (ta === tc) continue;
          // A pawn may not be swapped onto the first or last rank.
          if (ta === PAWN && (rankOf(c) === 0 || rankOf(c) === 7)) continue;
          if (tc === PAWN && (rankOf(a) === 0 || rankOf(a) === 7)) continue;
          out.push(encode(a, c, SWAP));
        }
      }
    }
  }

  legalMoves() {
    const pseudo = this.generate([]);
    const out = [];
    for (const m of pseudo) {
      this.make(m);
      if (!this.isAttacked(this.kings[this.turn ^ 1], this.turn)) out.push(m);
      this.unmake();
    }
    return out;
  }

  // True when the side that just moved left its own king attacked.
  leftInCheck() {
    return this.isAttacked(this.kings[this.turn ^ 1], this.turn);
  }

  // ------------------------------------------------------------ make / unmake

  xorPiece(p, s) {
    this.h1 ^= Z.p1[p * 128 + s];
    this.h2 ^= Z.p2[p * 128 + s];
  }

  xorInv(color, type) {
    const k = invKey(color, type, this.inv[color][type]);
    this.h1 ^= Z.i1[k];
    this.h2 ^= Z.i2[k];
  }

  addInv(color, type, delta) {
    this.xorInv(color, type);
    this.inv[color][type] += delta;
    this.xorInv(color, type);
  }

  clearRookRight(s) {
    const cr = this.castleRook;
    for (let i = 0; i < 4; i++) if (cr[i] === s) cr[i] = -1;
  }

  make(m) {
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >>> 17;
    const b = this.board, us = this.turn, them = us ^ 1, cr = this.castleRook;
    let st = this.stack[this.ply];
    if (!st) st = this.stack[this.ply] = newEntry();
    st.m = m; st.c0 = cr[0]; st.c1 = cr[1]; st.c2 = cr[2]; st.c3 = cr[3];
    st.ep = this.ep; st.half = this.half; st.h1 = this.h1; st.h2 = this.h2; st.shield = this.shield;
    st.captured = 0; st.capSq = -1; st.gotType = 0;
    this.ply++;

    const cm = this.castleMask();
    this.h1 ^= Z.c1[cm]; this.h2 ^= Z.c2[cm];
    if (this.ep >= 0) { this.h1 ^= Z.e1[this.ep]; this.h2 ^= Z.e2[this.ep]; }
    if (this.shield >= 0) { this.h1 ^= Z.s1[this.shield]; this.h2 ^= Z.s2[this.shield]; }
    this.ep = -1;
    this.shield = -1;
    this.half++;

    if (flag === CASTLE_K || flag === CASTLE_Q) {
      const base = us === WHITE ? 0 : 0x70;
      const kTo = base + (flag === CASTLE_K ? 6 : 2), rTo = base + (flag === CASTLE_K ? 5 : 3);
      const king = b[from], rook = b[to];
      this.xorPiece(king, from); this.xorPiece(rook, to);
      b[from] = 0; b[to] = 0;
      b[kTo] = king; b[rTo] = rook;
      this.xorPiece(king, kTo); this.xorPiece(rook, rTo);
      this.kings[us] = kTo;
      cr[us * 2] = cr[us * 2 + 1] = -1;
    } else if (flag === SHIELD) {
      this.addInv(us, POWER_SHIELD, -1);
      this.shield = from;
    } else if (flag === SWAP) {
      this.addInv(us, POWER_SWAP, -1);
      const pa = b[from], pc = b[to];
      this.xorPiece(pa, from); this.xorPiece(pc, to);
      b[from] = pc; b[to] = pa;
      this.xorPiece(pc, from); this.xorPiece(pa, to);
      this.clearRookRight(from); this.clearRookRight(to);
    } else {
      const piece = b[from];
      const capSq = flag === EP ? to + (us === WHITE ? -16 : 16) : to;
      const cap = b[capSq];
      if (cap) {
        this.xorPiece(cap, capSq);
        b[capSq] = 0;
        st.captured = cap; st.capSq = capSq;
        this.half = 0;
        this.clearRookRight(capSq);
      }
      this.xorPiece(piece, from);
      b[from] = 0;
      const placed = promo ? makePiece(us, promo) : piece;
      b[to] = placed;
      this.xorPiece(placed, to);
      const t = piece & 7;
      if (t === PAWN) this.half = 0;
      if (t === KING) { this.kings[us] = to; cr[us * 2] = cr[us * 2 + 1] = -1; }
      this.clearRookRight(from);
      if (flag === DOUBLE) {
        const epSq = (from + to) >> 1;
        const enemy = makePiece(them, PAWN);
        if ((onBoard(to - 1) && b[to - 1] === enemy) || (onBoard(to + 1) && b[to + 1] === enemy)) this.ep = epSq;
      }
      if (flag === LEAP) this.addInv(us, POWER_LEAP, -1);
      if (this.powerSq && this.powerSq[to]) {
        const type = this.powerSq[to];
        st.gotType = type;
        this.h1 ^= Z.w1[type * 128 + to]; this.h2 ^= Z.w2[type * 128 + to];
        this.powerSq[to] = 0;
        this.addInv(us, type, 1);
      }
    }

    const cm2 = this.castleMask();
    this.h1 ^= Z.c1[cm2]; this.h2 ^= Z.c2[cm2];
    if (this.ep >= 0) { this.h1 ^= Z.e1[this.ep]; this.h2 ^= Z.e2[this.ep]; }
    if (this.shield >= 0) { this.h1 ^= Z.s1[this.shield]; this.h2 ^= Z.s2[this.shield]; }
    this.h1 ^= Z.t1; this.h2 ^= Z.t2;
    if (us === BLACK) this.full++;
    this.turn = them;
    this.hist1.push(this.h1);
    this.hist2.push(this.h2);
  }

  unmake() {
    const st = this.stack[--this.ply];
    const m = st.m;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >>> 17;
    const b = this.board;
    this.turn ^= 1;
    const us = this.turn;
    if (us === BLACK) this.full--;
    if (flag === CASTLE_K || flag === CASTLE_Q) {
      const base = us === WHITE ? 0 : 0x70;
      const kTo = base + (flag === CASTLE_K ? 6 : 2), rTo = base + (flag === CASTLE_K ? 5 : 3);
      const king = b[kTo], rook = b[rTo];
      b[kTo] = 0; b[rTo] = 0;
      b[from] = king; b[to] = rook;
      this.kings[us] = from;
    } else if (flag === SHIELD) {
      this.inv[us][POWER_SHIELD]++;
    } else if (flag === SWAP) {
      const pa = b[from];
      b[from] = b[to]; b[to] = pa;
      this.inv[us][POWER_SWAP]++;
    } else {
      const placed = b[to];
      b[to] = 0;
      b[from] = promo ? makePiece(us, PAWN) : placed;
      if (st.captured) b[st.capSq] = st.captured;
      if ((placed & 7) === KING) this.kings[us] = from;
      if (flag === LEAP) this.inv[us][POWER_LEAP]++;
      if (st.gotType) { this.powerSq[to] = st.gotType; this.inv[us][st.gotType]--; }
    }
    const cr = this.castleRook;
    cr[0] = st.c0; cr[1] = st.c1; cr[2] = st.c2; cr[3] = st.c3;
    this.ep = st.ep; this.half = st.half; this.h1 = st.h1; this.h2 = st.h2; this.shield = st.shield;
    this.hist1.pop();
    this.hist2.pop();
  }

  // Pass the turn (for null-move pruning in search).
  makeNull() {
    let st = this.stack[this.ply];
    if (!st) st = this.stack[this.ply] = newEntry();
    st.m = -1; st.ep = this.ep; st.h1 = this.h1; st.h2 = this.h2; st.shield = this.shield; st.half = this.half;
    this.ply++;
    if (this.ep >= 0) { this.h1 ^= Z.e1[this.ep]; this.h2 ^= Z.e2[this.ep]; }
    if (this.shield >= 0) { this.h1 ^= Z.s1[this.shield]; this.h2 ^= Z.s2[this.shield]; }
    this.ep = -1;
    this.shield = -1;
    this.h1 ^= Z.t1; this.h2 ^= Z.t2;
    this.turn ^= 1;
    this.hist1.push(this.h1);
    this.hist2.push(this.h2);
  }

  unmakeNull() {
    const st = this.stack[--this.ply];
    this.turn ^= 1;
    this.ep = st.ep; this.h1 = st.h1; this.h2 = st.h2; this.shield = st.shield; this.half = st.half;
    this.hist1.pop();
    this.hist2.pop();
  }

  // ------------------------------------------------------------ draws and results

  // How many times the current position has occurred (same side to move,
  // castling, en passant and power state).
  repetitionCount() {
    const n = this.hist1.length - 1;
    let count = 1;
    for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) {
      if (this.hist1[i] === this.h1 && this.hist2[i] === this.h2) count++;
    }
    return count;
  }

  // Search shortcut: any earlier occurrence counts as a draw.
  isRepeat() {
    const n = this.hist1.length - 1;
    for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) {
      if (this.hist1[i] === this.h1 && this.hist2[i] === this.h2) return true;
    }
    return false;
  }

  insufficientMaterial() {
    let minors = 0, knights = 0;
    const bishopColors = new Set();
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const t = this.board[s] & 7;
      if (!t || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors++;
      if (t === KNIGHT) knights++;
      else bishopColors.add((fileOf(s) + rankOf(s)) & 1);
    }
    if (minors <= 1) return true;
    return knights === 0 && bishopColors.size === 1;
  }

  // { over, result, reason, winner, check }
  status(legal = this.legalMoves()) {
    const check = this.inCheck();
    if (!legal.length) {
      if (check) return { over: true, reason: 'checkmate', winner: this.turn ^ 1, result: this.turn === WHITE ? '0-1' : '1-0', check };
      return { over: true, reason: 'stalemate', winner: -1, result: '1/2-1/2', check };
    }
    const draw = (reason) => ({ over: true, reason, winner: -1, result: '1/2-1/2', check });
    if (this.insufficientMaterial()) return draw('material');
    if (this.half >= 100) return draw('fifty');
    if (this.repetitionCount() >= 3) return draw('repetition');
    return { over: false, reason: null, winner: -1, result: '*', check };
  }

  // ------------------------------------------------------------ notation

  fen() {
    const b = this.board;
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = b[square(f, r)];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        const ch = LETTER[p & 7];
        row += (p >> 3) === WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let castle = '';
    for (let c = 0; c < 2; c++) {
      for (let side = 0; side < 2; side++) {
        const rs = this.castleRook[c * 2 + side];
        if (rs < 0) continue;
        let ch = side === 0 ? 'K' : 'Q';
        if (this.chess960 && !this.outermostRook(c, side, rs)) ch = 'ABCDEFGH'[fileOf(rs)];
        castle += c === WHITE ? ch : ch.toLowerCase();
      }
    }
    return `${rows.join('/')} ${this.turn === WHITE ? 'w' : 'b'} ${castle || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }

  outermostRook(color, side, rs) {
    const rook = makePiece(color, ROOK), k = this.kings[color], base = color === WHITE ? 0 : 0x70;
    if (side === 0) { for (let f = 7; f > fileOf(k); f--) if (this.board[base + f] === rook) return base + f === rs; }
    else { for (let f = 0; f < fileOf(k); f++) if (this.board[base + f] === rook) return base + f === rs; }
    return false;
  }

  // Where the king lands for a castling move.
  static castleKingTo(m) {
    const from = m & 127, flag = m >>> 17;
    return (from & 0x70) + (flag === CASTLE_K ? 6 : 2);
  }

  // Long algebraic for saves and the worker. Castling is king-to-rook so it
  // also works in Chess960. Powers: S:e4, W:b1c1, L:c1d3[q].
  uci(m) {
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >>> 17;
    const p = promo ? LETTER[promo] : '';
    if (flag === SHIELD) return `S:${sqName(from)}`;
    if (flag === SWAP) return `W:${sqName(from)}${sqName(to)}`;
    if (flag === LEAP) return `L:${sqName(from)}${sqName(to)}${p}`;
    return sqName(from) + sqName(to) + p;
  }

  moveFromUci(str, legal = this.legalMoves()) {
    for (const m of legal) {
      if (this.uci(m) === str) return m;
      const flag = m >>> 17;
      // Also accept the conventional e1g1 form for castling.
      if ((flag === CASTLE_K || flag === CASTLE_Q) && sqName(m & 127) + sqName(Position.castleKingTo(m)) === str && !this.chess960) return m;
    }
    return 0;
  }

  san(m, legal = this.legalMoves()) {
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >>> 17;
    const b = this.board;
    let s;
    if (flag === CASTLE_K) s = 'O-O';
    else if (flag === CASTLE_Q) s = 'O-O-O';
    else if (flag === SHIELD) s = `Shield ${SAN_LETTER[b[from] & 7]}${sqName(from)}`;
    else if (flag === SWAP) s = `Swap ${SAN_LETTER[b[from] & 7]}${sqName(from)}/${SAN_LETTER[b[to] & 7]}${sqName(to)}`;
    else {
      const t = b[from] & 7;
      const capture = !!b[to] || flag === EP;
      if (flag === LEAP) {
        s = `${SAN_LETTER[t]}${sqName(from)}~${capture ? 'x' : ''}${sqName(to)}`;
      } else if (t === PAWN) {
        s = (capture ? `${'abcdefgh'[fileOf(from)]}x` : '') + sqName(to);
      } else {
        let dis = '';
        const rivals = legal.filter((o) => o !== m && (o >>> 17) <= EP && ((o >> 7) & 127) === to && (b[o & 127] & 7) === t);
        if (rivals.length) {
          const sameFile = rivals.some((o) => fileOf(o & 127) === fileOf(from));
          const sameRank = rivals.some((o) => rankOf(o & 127) === rankOf(from));
          if (!sameFile) dis = 'abcdefgh'[fileOf(from)];
          else if (!sameRank) dis = String(rankOf(from) + 1);
          else dis = sqName(from);
        }
        s = SAN_LETTER[t] + dis + (capture ? 'x' : '') + sqName(to);
      }
      if (promo) s += `=${SAN_LETTER[promo]}`;
    }
    this.make(m);
    if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
    this.unmake();
    return s;
  }

  moveFromSan(text, legal = this.legalMoves()) {
    const clean = (x) => x.replace(/[+#!?]/g, '').replace(/0/g, 'O').trim();
    const want = clean(text);
    for (const m of legal) if (clean(this.san(m, legal)) === want) return m;
    return 0;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const moves = this.generate([]);
    let n = 0;
    for (const m of moves) {
      this.make(m);
      if (!this.leftInCheck()) n += depth === 1 ? 1 : this.perft(depth - 1);
      this.unmake();
    }
    return n;
  }

  pieceAt(s) {
    return this.board[s];
  }
}

export const PIECE_VALUE = [0, 1, 3, 3, 5, 9, 0];
export const PIECE_NAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
export const isCastle = (m) => { const f = m >>> 17; return f === CASTLE_K || f === CASTLE_Q; };
export const isPower = (m) => { const f = m >>> 17; return f === SHIELD || f === SWAP || f === LEAP; };
