// Crossword placement and validation. DOM-free and deterministic: the same
// words and seed always build the same board.
//
// A placement is { word, row, col, dir } with dir 'across' or 'down'. The
// rules are the usual crossword ones: words only touch where they cross, a
// crossing joins an across word to a down word on the same letter, and every
// run of two or more letters on the board is exactly one placed word.

export const DIRS = {
  across: [0, 1],
  down: [1, 0],
};

export function cellsOf({ word, row, col, dir }) {
  const [dr, dc] = DIRS[dir];
  const cells = [];
  for (let i = 0; i < word.length; i++) cells.push({ row: row + dr * i, col: col + dc * i, letter: word[i] });
  return cells;
}

const key = (row, col) => `${row},${col}`;

// A sparse working grid used while building.
class Sheet {
  constructor() {
    this.cells = new Map(); // key -> { letter, across: bool, down: bool }
    this.placements = [];
    this.minRow = 0; this.maxRow = -1; this.minCol = 0; this.maxCol = -1;
  }

  at(row, col) {
    return this.cells.get(key(row, col)) || null;
  }

  // Returns the number of crossings if `p` may be placed here, else -1.
  check(p) {
    const [dr, dc] = DIRS[p.dir];
    const other = p.dir === 'across' ? 'down' : 'across';
    const [pr, pc] = DIRS[other];
    const n = p.word.length;
    if (this.at(p.row - dr, p.col - dc) || this.at(p.row + dr * n, p.col + dc * n)) return -1;
    let crossings = 0;
    for (let i = 0; i < n; i++) {
      const r = p.row + dr * i, c = p.col + dc * i;
      const cell = this.at(r, c);
      if (cell) {
        if (cell.letter !== p.word[i] || cell[p.dir]) return -1;
        crossings++;
      } else if (this.at(r - pr, c - pc) || this.at(r + pr, c + pc)) {
        return -1;
      }
    }
    if (crossings === n) return -1;
    return crossings;
  }

  place(p) {
    for (const cell of cellsOf(p)) {
      const k = key(cell.row, cell.col);
      const existing = this.cells.get(k) || { letter: cell.letter, across: false, down: false };
      existing[p.dir] = true;
      this.cells.set(k, existing);
      this.minRow = Math.min(this.minRow, cell.row); this.maxRow = Math.max(this.maxRow, cell.row);
      this.minCol = Math.min(this.minCol, cell.col); this.maxCol = Math.max(this.maxCol, cell.col);
    }
    this.placements.push(p);
  }

  // Bounding box if `p` were added.
  sizeWith(p) {
    const [dr, dc] = DIRS[p.dir];
    const endRow = p.row + dr * (p.word.length - 1), endCol = p.col + dc * (p.word.length - 1);
    const rows = Math.max(this.maxRow, endRow) - Math.min(this.minRow, p.row) + 1;
    const cols = Math.max(this.maxCol, endCol) - Math.min(this.minCol, p.col) + 1;
    return { rows, cols };
  }

  // Every legal spot for `word` that crosses the board.
  options(word) {
    const out = [];
    for (const placed of this.placements) {
      const dir = placed.dir === 'across' ? 'down' : 'across';
      const [dr, dc] = DIRS[dir];
      for (const cell of cellsOf(placed)) {
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== cell.letter) continue;
          const p = { word, row: cell.row - dr * i, col: cell.col - dc * i, dir };
          const crossings = this.check(p);
          if (crossings > 0) out.push({ p, crossings });
        }
      }
    }
    return out;
  }
}

// Places as many of `words` as fit (in order), within maxRows × maxCols.
// The first word goes across. Returns a normalized board whose top-left is
// (0, 0), and the words that could not be placed.
export function buildCrossword(words, rng, { maxRows = 9, maxCols = 10, maxWords = Infinity } = {}) {
  const sheet = new Sheet();
  const skipped = [];
  for (const word of words) {
    if (sheet.placements.length >= maxWords) { skipped.push(word); continue; }
    if (!sheet.placements.length) {
      if (word.length > maxCols) { skipped.push(word); continue; }
      sheet.place({ word, row: 0, col: 0, dir: 'across' });
      continue;
    }
    let best = null;
    let bestScore = Infinity;
    for (const option of sheet.options(word)) {
      const { rows, cols } = sheet.sizeWith(option.p);
      if (rows > maxRows || cols > maxCols) continue;
      // Prefer compact, roughly balanced boards with more crossings; the
      // random nudge breaks ties differently per seed.
      const score = rows * cols + Math.abs(rows * 1.15 - cols) * 2 - option.crossings * 6 + rng.next() * 3;
      if (score < bestScore) { bestScore = score; best = option.p; }
    }
    if (best) sheet.place(best);
    else skipped.push(word);
  }
  return { ...normalize(sheet.placements), skipped };
}

// Shifts placements so the board starts at row 0, col 0.
export function normalize(placements) {
  let minRow = Infinity, minCol = Infinity, maxRow = -Infinity, maxCol = -Infinity;
  for (const p of placements) {
    for (const c of cellsOf(p)) {
      minRow = Math.min(minRow, c.row); minCol = Math.min(minCol, c.col);
      maxRow = Math.max(maxRow, c.row); maxCol = Math.max(maxCol, c.col);
    }
  }
  if (!placements.length) return { rows: 0, cols: 0, placements: [] };
  return {
    rows: maxRow - minRow + 1,
    cols: maxCol - minCol + 1,
    placements: placements.map((p) => ({ ...p, row: p.row - minRow, col: p.col - minCol })),
  };
}

// Letter grid (rows × cols, null for blank).
export function letterGrid({ rows, cols, placements }) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  for (const p of placements) for (const c of cellsOf(p)) grid[c.row][c.col] = c.letter;
  return grid;
}

// Returns a list of problems (empty when the board is a valid crossword).
export function validateCrossword(board) {
  const problems = [];
  const { rows, cols, placements } = board;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  const words = new Set();
  for (const p of placements) {
    if (words.has(p.word)) problems.push(`duplicate word ${p.word}`);
    words.add(p.word);
    for (const c of cellsOf(p)) {
      if (c.row < 0 || c.col < 0 || c.row >= rows || c.col >= cols) { problems.push(`${p.word} leaves the board`); break; }
      const have = grid[c.row][c.col];
      if (have && have !== c.letter) problems.push(`${p.word} clashes at ${c.row},${c.col}`);
      grid[c.row][c.col] = c.letter;
    }
  }
  if (problems.length) return problems;

  // Every maximal run of 2+ letters must be one placed word in that spot.
  const placedAt = new Set(placements.map((p) => `${p.dir}:${p.row},${p.col}:${p.word}`));
  const runs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) continue;
      if ((c === 0 || !grid[r][c - 1]) && c + 1 < cols && grid[r][c + 1]) {
        let word = ''; let k = c;
        while (k < cols && grid[r][k]) word += grid[r][k++];
        runs.push(`across:${r},${c}:${word}`);
      }
      if ((r === 0 || !grid[r - 1][c]) && r + 1 < rows && grid[r + 1][c]) {
        let word = ''; let k = r;
        while (k < rows && grid[k][c]) word += grid[k++][c];
        runs.push(`down:${r},${c}:${word}`);
      }
    }
  }
  for (const run of runs) if (!placedAt.has(run)) problems.push(`stray run ${run}`);
  if (runs.length !== placements.length) problems.push(`expected ${placements.length} runs, found ${runs.length}`);

  // Connected: flood fill from the first letter reaches every letter.
  const filled = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c]) filled.push([r, c]);
  if (filled.length) {
    const seen = new Set([key(...filled[0])]);
    const stack = [filled[0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || !grid[nr][nc]) continue;
        const k = key(nr, nc);
        if (!seen.has(k)) { seen.add(k); stack.push([nr, nc]); }
      }
    }
    if (seen.size !== filled.length) problems.push('board is not connected');
  }
  // No empty edge rows or columns.
  if (rows && !grid[0].some(Boolean)) problems.push('empty top row');
  if (cols && !grid.some((row) => row[0])) problems.push('empty left column');
  return problems;
}
