// Colour-aware nonogram line solver. DOM-free.
//
// A cell is a bitmask of what it could still be: bit 0 = empty, bit k+1 =
// colour k. A clue is a list of blocks { n, c } (length, colour index).
// Blocks of the same colour need at least one empty square between them;
// blocks of different colours may touch.
//
// solveLine keeps, for every cell, only the values that appear in at least
// one placement of the blocks that agrees with what is already known. Running
// it over all rows and columns until nothing changes is "line logic": if that
// fixes every cell, the puzzle has exactly one solution and it can be found
// without guessing.

export const EMPTY = 1;
export const colourBit = (c) => 1 << (c + 1);
export const fullMask = (colours) => (1 << (colours + 1)) - 1;

// Returns a new array of masks, or null when the line is impossible.
export function solveLine(clue, cells) {
  const L = cells.length;
  const k = clue.length;
  // ok[c][i]: cells i.. can hold colour c for how many squares in a row
  const runCache = new Map();
  const runOf = (c) => {
    let run = runCache.get(c);
    if (run) return run;
    run = new Int16Array(L + 1);
    const bit = colourBit(c);
    for (let i = L - 1; i >= 0; i--) run[i] = cells[i] & bit ? run[i + 1] + 1 : 0;
    runCache.set(c, run);
    return run;
  };
  const fits = (j, i) => i + clue[j].n <= L && runOf(clue[j].c)[i] >= clue[j].n;
  // g[(i*(k+1)+j)*2+s]: from cell i, with j blocks placed, can we finish?
  // s = 1 when block j-1 ended right at cell i-1.
  const W = k + 1;
  const g = new Uint8Array((L + 1) * W * 2);
  const at = (i, j, s) => (i * W + j) * 2 + s;
  g[at(L, k, 0)] = 1;
  g[at(L, k, 1)] = 1;
  for (let i = L - 1; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      for (let s = 0; s < 2; s++) {
        let v = 0;
        if (cells[i] & EMPTY && g[at(i + 1, j, 0)]) v = 1;
        else if (j < k && fits(j, i) && (s === 0 || j === 0 || clue[j - 1].c !== clue[j].c) && g[at(i + clue[j].n, j + 1, 1)]) v = 1;
        g[at(i, j, s)] = v;
      }
    }
  }
  if (!g[at(0, 0, 0)]) return null;
  const reach = new Uint8Array((L + 1) * W * 2);
  reach[at(0, 0, 0)] = 1;
  const out = new Array(L).fill(0);
  for (let i = 0; i < L; i++) {
    for (let j = 0; j <= k; j++) {
      for (let s = 0; s < 2; s++) {
        if (!reach[at(i, j, s)] || !g[at(i, j, s)]) continue;
        if (cells[i] & EMPTY && g[at(i + 1, j, 0)]) {
          out[i] |= EMPTY;
          reach[at(i + 1, j, 0)] = 1;
        }
        if (j < k && fits(j, i) && (s === 0 || j === 0 || clue[j - 1].c !== clue[j].c)) {
          const n = clue[j].n;
          if (g[at(i + n, j + 1, 1)]) {
            const bit = colourBit(clue[j].c);
            for (let t = i; t < i + n; t++) out[t] |= bit;
            reach[at(i + n, j + 1, 1)] = 1;
          }
        }
      }
    }
  }
  return out;
}

// Clue for one line of solution values (-1 empty, k colour).
export function lineClue(values) {
  const clue = [];
  let i = 0;
  while (i < values.length) {
    const v = values[i];
    if (v < 0) { i++; continue; }
    let n = 0;
    while (i < values.length && values[i] === v) { n++; i++; }
    clue.push({ n, c: v });
  }
  return clue;
}

// Clues for a solution grid (array of rows of values).
export function cluesOf(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const rows = grid.map((row) => lineClue(row));
  const cols = [];
  for (let x = 0; x < w; x++) cols.push(lineClue(Array.from({ length: h }, (_, y) => grid[y][x])));
  return { rows, cols };
}

// Line-solve a whole puzzle. `start` (optional) is a flat array of masks.
// Returns { masks, solved, contradiction, steps } where steps counts the line
// passes that made progress.
export function solve({ w, h, colours, rows, cols }, start = null) {
  const full = fullMask(colours);
  const masks = start ? start.slice() : new Array(w * h).fill(full);
  const rowDirty = new Uint8Array(h).fill(1);
  const colDirty = new Uint8Array(w).fill(1);
  let steps = 0;
  let any = true;
  while (any) {
    any = false;
    for (let y = 0; y < h; y++) {
      if (!rowDirty[y]) continue;
      rowDirty[y] = 0;
      const line = masks.slice(y * w, y * w + w);
      const res = solveLine(rows[y], line);
      if (!res) return { masks, solved: false, contradiction: true, steps };
      let changed = false;
      for (let x = 0; x < w; x++) {
        if (res[x] !== line[x]) {
          masks[y * w + x] = res[x];
          colDirty[x] = 1;
          changed = true;
        }
      }
      if (changed) { steps++; any = true; }
    }
    for (let x = 0; x < w; x++) {
      if (!colDirty[x]) continue;
      colDirty[x] = 0;
      const line = Array.from({ length: h }, (_, y) => masks[y * w + x]);
      const res = solveLine(cols[x], line);
      if (!res) return { masks, solved: false, contradiction: true, steps };
      let changed = false;
      for (let y = 0; y < h; y++) {
        if (res[y] !== line[y]) {
          masks[y * w + x] = res[y];
          rowDirty[y] = 1;
          changed = true;
        }
      }
      if (changed) { steps++; any = true; }
    }
  }
  const solved = masks.every((m) => m && (m & (m - 1)) === 0);
  return { masks, solved, contradiction: false, steps };
}

// Value of a single-bit mask: -1 for empty, k for colour k, null if unknown.
export function maskValue(m) {
  if (m === EMPTY) return -1;
  if (!m || m & (m - 1)) return null;
  return Math.log2(m) - 1;
}
