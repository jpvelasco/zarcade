// One puzzle in progress: cells, strokes, undo/redo, auto-crossing, Helper
// checking and the win test. DOM-free.

export const UNKNOWN = -2;
export const CROSS = -1;

export class Board {
  // puzzle: from buildPuzzle. opts.mode: 'helper' | 'expert'.
  constructor(puzzle, { mode = 'helper', cells = null, time = 0, hints = 0 } = {}) {
    this.p = puzzle;
    this.w = puzzle.w;
    this.h = puzzle.h;
    this.mode = mode;
    this.cells = new Int8Array(this.w * this.h).fill(UNKNOWN);
    if (cells && cells.length === this.cells.length) this.cells.set(cells);
    this.time = time;
    this.hints = hints;
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;
    this.solved = this.isSolved();
    this.corrections = 0;
    // Lines whose clue is satisfied (for dimming and chimes).
    this.rowDone = new Uint8Array(this.h);
    this.colDone = new Uint8Array(this.w);
    this.refreshDone();
  }

  idx(x, y) { return y * this.w + x; }

  // ------------------------------------------------------------ strokes

  // Start painting at cell i. tool: 'fill' | 'cross'. colour: clue colour.
  beginStroke(i, tool, colour = 0) {
    if (this.solved) return null;
    this.cancelStroke();
    const src = this.cells[i];
    let target;
    if (tool === 'fill') target = src === colour ? UNKNOWN : colour;
    else target = src === CROSS ? UNKNOWN : CROSS;
    this.stroke = { start: i, src, target, tool, colour, axis: null, touched: new Map(), wrong: new Set() };
    this.paintSegment(i);
    return this.stroke;
  }

  // Extend the stroke towards cell i (locked to the first axis moved along).
  extendStroke(i) {
    const s = this.stroke;
    if (!s) return;
    const sx = s.start % this.w, sy = (s.start / this.w) | 0;
    const x = i % this.w, y = (i / this.w) | 0;
    if (!s.axis && (x !== sx || y !== sy)) s.axis = Math.abs(x - sx) >= Math.abs(y - sy) ? 'row' : 'col';
    const end = s.axis === 'row' ? this.idx(x, sy) : s.axis === 'col' ? this.idx(sx, y) : s.start;
    this.paintSegment(end);
  }

  paintSegment(end) {
    const s = this.stroke;
    const sx = s.start % this.w, sy = (s.start / this.w) | 0;
    const ex = end % this.w, ey = (end / this.w) | 0;
    const want = new Set();
    const n = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
    const dx = Math.sign(ex - sx), dy = Math.sign(ey - sy);
    for (let k = 0; k <= n; k++) want.add(this.idx(sx + dx * k, sy + dy * k));
    // Put back cells that left the segment.
    for (const [i, before] of s.touched) {
      if (!want.has(i)) {
        this.cells[i] = before;
        s.touched.delete(i);
        s.wrong.delete(i);
      }
    }
    for (const i of want) {
      if (s.touched.has(i)) continue;
      const before = this.cells[i];
      if (before !== s.src) continue;
      s.touched.set(i, before);
      this.cells[i] = s.target;
      if (this.mode === 'helper' && this.isWrong(i)) s.wrong.add(i);
    }
    s.end = end;
  }

  cancelStroke() {
    const s = this.stroke;
    if (!s) return;
    for (const [i, before] of s.touched) this.cells[i] = before;
    this.stroke = null;
  }

  // Finish the stroke. Returns { changed, corrected, lines, solved } for the
  // view: cells changed, Helper corrections, newly finished lines.
  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s || !s.touched.size) return { changed: [], corrected: [], lines: [], solved: false };
    const changes = [];
    const corrected = [];
    for (const [i, before] of s.touched) {
      let after = this.cells[i];
      if (s.wrong.has(i)) {
        // Helper mode: a fill that should be empty becomes a cross; a wrong
        // colour or a wrong cross is wiped.
        after = this.cells[i] = after === CROSS || this.p.solution[i] >= 0 ? UNKNOWN : CROSS;
        corrected.push(i);
      }
      if (after !== before) changes.push([i, before, after]);
    }
    this.corrections += corrected.length;
    const result = this.commit(changes, { auto: true });
    result.corrected = corrected;
    result.tool = s.tool;
    return result;
  }

  // Apply a list of [i, before, after] as one undo step, then auto-cross.
  commit(changes, { auto = true, hint = false } = {}) {
    for (const [i, , after] of changes) this.cells[i] = after;
    const before = { rows: this.rowDone.slice(), cols: this.colDone.slice() };
    if (auto) {
      const crossed = this.autoCross(changes.map((c) => c[0]));
      changes.push(...crossed);
    }
    this.refreshDone();
    const lines = [];
    for (let y = 0; y < this.h; y++) if (this.rowDone[y] && !before.rows[y]) lines.push({ axis: 'row', index: y });
    for (let x = 0; x < this.w; x++) if (this.colDone[x] && !before.cols[x]) lines.push({ axis: 'col', index: x });
    if (changes.length) {
      this.undoStack.push({ changes, hint });
      if (this.undoStack.length > 400) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.solved = this.isSolved();
    return { changed: changes.map((c) => c[0]), corrected: [], lines, solved: this.solved };
  }

  undo() {
    const a = this.undoStack.pop();
    if (!a || this.solved) return null;
    for (let k = a.changes.length - 1; k >= 0; k--) this.cells[a.changes[k][0]] = a.changes[k][1];
    this.redoStack.push(a);
    this.refreshDone();
    return a.changes.map((c) => c[0]);
  }

  redo() {
    const a = this.redoStack.pop();
    if (!a || this.solved) return null;
    for (const [i, , after] of a.changes) this.cells[i] = after;
    this.undoStack.push(a);
    this.refreshDone();
    this.solved = this.isSolved();
    return a.changes.map((c) => c[0]);
  }

  // ------------------------------------------------------------ lines

  line(axis, index) {
    const out = [];
    if (axis === 'row') for (let x = 0; x < this.w; x++) out.push(this.idx(x, index));
    else for (let y = 0; y < this.h; y++) out.push(this.idx(index, y));
    return out;
  }

  clue(axis, index) { return axis === 'row' ? this.p.rows[index] : this.p.cols[index]; }

  // The player's fills in a line exactly spell out its clue.
  lineMatches(axis, index) {
    const clue = this.clue(axis, index);
    const ids = this.line(axis, index);
    let b = 0;
    let k = 0;
    while (k < ids.length) {
      const v = this.cells[ids[k]];
      if (v < 0) { k++; continue; }
      let n = 0;
      while (k < ids.length && this.cells[ids[k]] === v) { n++; k++; }
      if (b >= clue.length || clue[b].n !== n || clue[b].c !== v) return false;
      b++;
    }
    return b === clue.length;
  }

  refreshDone() {
    for (let y = 0; y < this.h; y++) this.rowDone[y] = this.lineMatches('row', y) ? 1 : 0;
    for (let x = 0; x < this.w; x++) this.colDone[x] = this.lineMatches('col', x) ? 1 : 0;
  }

  // Cross the leftover squares of every line touched by `ids` that now
  // matches its clue. Returns the extra changes.
  autoCross(ids) {
    const rows = new Set();
    const cols = new Set();
    for (const i of ids) { rows.add((i / this.w) | 0); cols.add(i % this.w); }
    const out = [];
    const sweep = (axis, index) => {
      if (!this.lineMatches(axis, index)) return;
      for (const i of this.line(axis, index)) {
        if (this.cells[i] === UNKNOWN) {
          out.push([i, UNKNOWN, CROSS]);
          this.cells[i] = CROSS;
        }
      }
    };
    for (const y of rows) sweep('row', y);
    for (const x of cols) sweep('col', x);
    return out;
  }

  // Which clue blocks are already closed off from either end of the line.
  // Returns an array of booleans, one per block (all true when the line
  // matches its clue).
  doneBlocks(axis, index) {
    const clue = this.clue(axis, index);
    const done = new Array(clue.length).fill(false);
    if (!clue.length) return done;
    if (axis === 'row' ? this.rowDone[index] : this.colDone[index]) return done.fill(true);
    const ids = this.line(axis, index);
    const scan = (order, blocks) => {
      let b = 0;
      let k = 0;
      const L = order.length;
      while (k < L && b < blocks.length) {
        const v = this.cells[order[k]];
        if (v === UNKNOWN) return;
        if (v === CROSS) { k++; continue; }
        let n = 0;
        while (k < L && this.cells[order[k]] === v) { n++; k++; }
        // A run counts once something other than unknown closes it.
        if (k < L && this.cells[order[k]] === UNKNOWN) return;
        const blk = blocks[b];
        if (blk.n !== n || blk.c !== v) return;
        done[blk.at] = true;
        b++;
      }
    };
    const blocks = clue.map((c, at) => ({ ...c, at }));
    scan(ids, blocks);
    scan(ids.slice().reverse(), blocks.slice().reverse());
    return done;
  }

  // ------------------------------------------------------------ checks

  isWrong(i) {
    const v = this.cells[i];
    const s = this.p.solution[i];
    if (v === UNKNOWN) return false;
    if (v === CROSS) return s >= 0;
    return v !== s;
  }

  mistakes() {
    const out = [];
    for (let i = 0; i < this.cells.length; i++) if (this.isWrong(i)) out.push(i);
    return out;
  }

  isSolved() {
    const sol = this.p.solution;
    for (let i = 0; i < sol.length; i++) {
      const v = this.cells[i];
      if (sol[i] >= 0 ? v !== sol[i] : v >= 0) return false;
    }
    return true;
  }

  filledCount() {
    let n = 0;
    for (const v of this.cells) if (v >= 0) n++;
    return n;
  }

  // ------------------------------------------------------------ saving

  serialize() {
    let s = '';
    for (const v of this.cells) s += v === UNKNOWN ? '.' : v === CROSS ? 'x' : String.fromCharCode(97 + v);
    return s;
  }

  static parseCells(str, size) {
    if (typeof str !== 'string' || str.length !== size) return null;
    const out = new Int8Array(size);
    for (let i = 0; i < size; i++) {
      const ch = str[i];
      out[i] = ch === '.' ? UNKNOWN : ch === 'x' ? CROSS : ch.charCodeAt(0) - 97;
      if (out[i] > 20) return null;
    }
    return out;
  }
}
