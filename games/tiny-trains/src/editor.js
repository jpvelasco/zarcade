// Track editing: placing, turning, removing and drawing track with a drag.
// DOM-free so the rules can be tested. The layout is a Map of grass cell
// index -> { t, v }.

import { openEdges, pieceJoining, turn, opposite, DX, DY, switchParts, VARIANTS } from './pieces.js';

export class Editor {
  constructor(board, { layout = null, unlimited = false } = {}) {
    this.board = board;
    this.unlimited = unlimited;
    this.layout = new Map(layout || []);
    this.undoStack = [];
    this.stroke = null;
  }

  canBuild(i) {
    const c = this.board.cells[i];
    return !!c && c.k === 'grass';
  }

  used(t) {
    let n = 0;
    for (const p of this.layout.values()) if (p.t === t) n++;
    return n;
  }

  // Pieces of type t still in stock (Infinity for straights and curves).
  left(t) {
    if (this.unlimited || t === 'S' || t === 'C') return Infinity;
    return (this.board.stock[t] || 0) - this.used(t);
  }

  get count() { return this.layout.size; }

  snapshot() { return new Map(this.layout); }

  push() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.layout = this.undoStack.pop();
    return true;
  }

  clear() {
    if (!this.layout.size) return false;
    this.push();
    this.layout.clear();
    return true;
  }

  // Does neighbour j offer track on the edge facing cell i (edge e of i)?
  offers(i, e, layout = this.layout) {
    const { board } = this;
    const x = (i % board.w) + DX[e], y = Math.floor(i / board.w) + DY[e];
    if (x < 0 || y < 0 || x >= board.w || y >= board.h) return false;
    const j = y * board.w + x;
    const back = opposite(e);
    const c = board.cells[j];
    if (c.k === 'depot') return c.dir === back;
    if (c.k === 'portal') return c.mouth === back;
    if (c.k === 'track' || c.k === 'station' || c.k === 'paint') return openEdges(c.t, c.v).includes(back);
    const p = layout.get(j);
    return !!p && openEdges(p.t, p.v).includes(back);
  }

  // The variant of type t that joins up with the most neighbouring track.
  bestVariant(i, t, prefer = 0) {
    let best = prefer, score = -1;
    for (let k = 0; k < (VARIANTS[t] || 1); k++) {
      const v = (prefer + k) % VARIANTS[t];
      let s = 0;
      for (const e of openEdges(t, v)) if (this.offers(i, e)) s++;
      if (s > score) { score = s; best = v; }
    }
    return best;
  }

  // Best straight or curve for a bare tap with the track tool.
  bestTrack(i) {
    let best = { t: 'S', v: 1 }, score = -1;
    for (const t of ['S', 'C']) {
      for (let v = 0; v < VARIANTS[t]; v++) {
        let s = 0;
        for (const e of openEdges(t, v)) if (this.offers(i, e)) s += 2;
        if (t === 'S') s += 0.5; // straights win ties
        if (s > score) { score = s; best = { t, v }; }
      }
    }
    return best;
  }

  // Tap with a tool: place a new piece, or turn the one already there.
  // Returns 'place', 'turn', 'swap' or null.
  tap(i, tool) {
    if (!this.canBuild(i)) return null;
    const here = this.layout.get(i);
    if (tool === 'erase') return this.remove(i) ? 'remove' : null;
    if (here && (tool === 'track' || tool === here.t)) {
      this.push();
      this.layout.set(i, { t: here.t, v: turn(here.t, here.v, 1) });
      return 'turn';
    }
    const piece = tool === 'track' ? this.bestTrack(i) : { t: tool, v: this.bestVariant(i, tool) };
    if (this.left(piece.t) <= 0 && !(here && here.t === piece.t)) return 'empty';
    this.push();
    this.layout.set(i, piece);
    return here ? 'swap' : 'place';
  }

  turnAt(i, dir = 1) {
    const here = this.layout.get(i);
    if (!here) return false;
    this.push();
    this.layout.set(i, { t: here.t, v: turn(here.t, here.v, dir) });
    return true;
  }

  remove(i) {
    if (!this.layout.has(i)) return false;
    this.push();
    this.layout.delete(i);
    return true;
  }

  // Drag-to-draw. beginStroke() remembers the layout; drawStroke(path)
  // re-lays the whole path from that memory each time the finger moves, so
  // the last cell can change its mind. endStroke() keeps one undo step.
  beginStroke() {
    this.stroke = { base: this.snapshot(), changed: false };
  }

  drawStroke(path, erase = false) {
    if (!this.stroke) this.beginStroke();
    const base = this.stroke.base;
    const out = new Map(base);
    const { board } = this;
    const edgeTo = (a, b) => {
      const dx = (b % board.w) - (a % board.w), dy = Math.floor(b / board.w) - Math.floor(a / board.w);
      if (dx === 1 && dy === 0) return 1;
      if (dx === -1 && dy === 0) return 3;
      if (dx === 0 && dy === 1) return 2;
      if (dx === 0 && dy === -1) return 0;
      return -1;
    };
    let xUsed = 0, wUsed = 0;
    for (const p of base.values()) { if (p.t === 'X') xUsed++; if (p.t === 'W') wUsed++; }
    const xStock = this.unlimited ? Infinity : board.stock.X || 0;
    const wStock = this.unlimited ? Infinity : board.stock.W || 0;
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      if (!this.canBuild(i)) continue;
      if (erase) { out.delete(i); continue; }
      let a = k > 0 ? edgeTo(i, path[k - 1]) : -1;
      let b = k < path.length - 1 ? edgeTo(i, path[k + 1]) : -1;
      if (a < 0 && b < 0) continue; // a single tap is handled by tap()
      // Open ends: join existing track if any, else carry straight on.
      const pick = (avoid) => {
        for (let e = 0; e < 4; e++) if (e !== avoid && this.offers(i, e, out)) return e;
        return opposite(avoid);
      };
      if (a < 0) a = pick(b);
      if (b < 0) b = pick(a);
      if (a === b) b = opposite(a);
      const want = pieceJoining(a, b);
      if (!want) continue;
      const old = base.get(i);
      let piece = want;
      if (old) {
        const oe = openEdges(old.t, old.v);
        const we = openEdges(want.t, want.v);
        const same = oe.length === we.length && oe.every((e) => we.includes(e));
        if (same) piece = old;
        else if (old.t === 'S' && want.t === 'S' && xUsed < xStock) { piece = { t: 'X', v: 0 }; xUsed++; }
        else if (old.t === 'X' && want.t === 'S') piece = old;
        else if (wUsed < wStock && (old.t === 'S' || old.t === 'C')) {
          const sw = switchFrom(oe, we);
          if (sw !== null) { piece = { t: 'W', v: sw }; wUsed++; }
        } else if (old.t === 'W') {
          const p = switchParts(old.v);
          if ([p.stem, p.straight, p.curve].includes(a) && [p.stem, p.straight, p.curve].includes(b)) piece = old;
        }
      }
      out.set(i, piece);
    }
    const changed = out.size !== base.size || [...out].some(([i, p]) => { const q = base.get(i); return !q || q.t !== p.t || q.v !== p.v; });
    this.stroke.changed = changed;
    this.layout = out;
    return changed;
  }

  endStroke() {
    if (this.stroke && this.stroke.changed) {
      this.undoStack.push(this.stroke.base);
      if (this.undoStack.length > 200) this.undoStack.shift();
    }
    const changed = !!(this.stroke && this.stroke.changed);
    this.stroke = null;
    return changed;
  }

  cancelStroke() {
    if (this.stroke) this.layout = this.stroke.base;
    this.stroke = null;
  }
}

// A switch joining existing edges oe with newly drawn edges we, if their
// union is a switch shape: the shared edge is the stem, the other two are
// its opposite and one side.
export function switchFrom(oe, we) {
  const shared = oe.filter((e) => we.includes(e));
  if (shared.length !== 1) return null;
  const all = [...new Set([...oe, ...we])];
  if (all.length !== 3) return null;
  const stem = shared[0];
  const others = all.filter((e) => e !== stem);
  if (!others.includes(opposite(stem))) return null;
  const side = others.find((e) => e !== opposite(stem));
  if (side === ((stem + 1) & 3)) return stem;
  if (side === ((stem + 3) & 3)) return stem + 4;
  return null;
}

// Cells crossed moving from a to b, stepping one row or column at a time.
export function cellsBetween(w, a, b) {
  const out = [];
  let x = a % w, y = Math.floor(a / w);
  const tx = b % w, ty = Math.floor(b / w);
  let guard = 64;
  while ((x !== tx || y !== ty) && guard--) {
    if (Math.abs(tx - x) >= Math.abs(ty - y)) x += Math.sign(tx - x);
    else y += Math.sign(ty - y);
    out.push(y * w + x);
  }
  return out;
}
