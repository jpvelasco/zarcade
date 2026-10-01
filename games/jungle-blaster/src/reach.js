// Coarse reachability over a stage's tile grid, used by the level tests to
// prove every stage can be finished and every treasure can be reached.
// It is deliberately a little conservative compared with the real physics:
// jumps reach 3 tiles across and 3 up (the runner manages ~4 and 3.5).

import { TILE, isHazard, isLadder, isLedge, isSinking, isSolid } from './tiles.js';

export const JUMP_UP = 3;
export const JUMP_ACROSS = 3;
export const FALL_ACROSS = 4;

export function reachability(level) {
  const { cols, rows, grid } = level;
  const tile = (c, r) => (c < 0 || c >= cols ? '#' : r < 0 ? ' ' : r >= rows ? ' ' : grid[r][c]);
  const open = (c, r) => {
    const t = tile(c, r);
    return !isSolid(t) && !isHazard(t) && r < rows;
  };
  // Extra footholds from rafts, crocs and crumbling rocks.
  const footholds = new Set();
  const foot = (c, r) => footholds.add(`${c},${r}`);
  for (const croc of level.crocs) foot(Math.floor(croc.x / TILE), Math.floor(croc.y / TILE));
  for (const m of level.movers) {
    const r = Math.floor((m.y + 4) / TILE);
    const c0 = Math.floor((m.x - m.ax) / TILE);
    const c1 = Math.floor((m.x + m.w + m.ax - 1) / TILE);
    for (let c = c0; c <= c1; c += 1) foot(c, r);
  }
  const supportAt = (c, r) => {
    const t = tile(c, r);
    if (isSolid(t) || isLedge(t) || isSinking(t)) return true;
    if (isLadder(t) && !isLadder(tile(c, r - 1))) return true;
    return footholds.has(`${c},${r}`);
  };
  const stand = (c, r) => open(c, r) && open(c, r - 1) !== false && supportAt(c, r + 1);

  // Fall straight down from (c, r) until something holds us; null = lost.
  const fall = (c, r) => {
    for (let y = r; y < rows; y += 1) {
      if (!open(c, y)) return null;
      if (stand(c, y)) return [c, y];
      if (isLadder(tile(c, y))) return [c, y];
    }
    return null;
  };

  const start = level.start;
  const sc = Math.floor(start.x / TILE);
  const sr = Math.floor((start.y - 1) / TILE);
  const seen = new Set();
  const queue = [];
  const push = (c, r) => {
    const key = `${c},${r}`;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push([c, r]);
  };
  push(sc, sr);
  const vines = level.vines.map((v) => ({ c: Math.floor(v.ax / TILE), r: Math.floor(v.ay / TILE) }));

  const vineSeen = new Set();
  // Catch a vine: from it you can land anywhere it throws you, or swing on
  // to the next vine along.
  const catchVine = (i) => {
    if (vineSeen.has(i)) return;
    vineSeen.add(i);
    const v = vines[i];
    for (let dc = -8; dc <= 8; dc += 1) {
      for (let tr = v.r + 2; tr <= v.r + 9; tr += 1) if (stand(v.c + dc, tr)) push(v.c + dc, tr);
    }
    vines.forEach((w, j) => {
      if (j !== i && Math.abs(w.c - v.c) <= 9 && Math.abs(w.r - v.r) <= 2) catchVine(j);
    });
  };

  while (queue.length) {
    const [c, r] = queue.shift();
    const onLadder = isLadder(tile(c, r));
    if (onLadder) {
      for (const dr of [-1, 1]) {
        const t = tile(c, r + dr);
        if (isLadder(t)) push(c, r + dr);
        else if (dr < 0 && open(c, r - 1)) push(c, r - 1);
      }
      if (supportAt(c, r + 1) || isSolid(tile(c, r + 1))) {
        for (const dc of [-1, 1]) if (open(c + dc, r)) { const to = fall(c + dc, r); if (to) push(...to); }
      }
      continue;
    }
    if (!stand(c, r)) continue;
    // Walk and step off edges.
    for (const dc of [-1, 1]) {
      if (!open(c + dc, r)) continue;
      const to = fall(c + dc, r);
      if (to) push(...to);
    }
    // Down a ladder.
    if (isLadder(tile(c, r + 1))) push(c, r + 1);
    // Up a ladder we stand in front of.
    if (isLadder(tile(c, r))) push(c, r);
    // Jumps: headroom first, then any landing in range.
    let head = 0;
    while (head < JUMP_UP && open(c, r - head - 1)) head += 1;
    for (let dc = -FALL_ACROSS; dc <= FALL_ACROSS; dc += 1) {
      if (dc === 0) continue;
      for (let dr = -head; dr <= rows; dr += 1) {
        const tc = c + dc;
        const tr = r + dr;
        if (tr < 0 || tr >= rows) continue;
        if (Math.abs(dc) > (dr < 0 ? JUMP_ACROSS : FALL_ACROSS)) continue;
        if (!stand(tc, tr)) continue;
        // The arc's peak row must be clear across the way.
        const peak = Math.min(r, tr) - (dr < 0 ? 0 : 1);
        let clear = true;
        const step = Math.sign(dc);
        for (let x = c + step; x !== tc + step; x += step) {
          if (!open(x, Math.max(0, peak))) { clear = false; break; }
        }
        if (clear) push(tc, tr);
      }
    }
    // Vines: catch one in reach, let go anywhere it can throw you.
    vines.forEach((v, i) => {
      if (Math.abs(c - v.c) <= 5 && r >= v.r + 3 && r <= v.r + 7) catchVine(i);
    });
  }
  return {
    seen,
    has: (c, r) => seen.has(`${c},${r}`),
    /** Can something at tile (c, r) be touched from a reachable spot? */
    touchable(c, r) {
      for (let dc = -1; dc <= 1; dc += 1) {
        // Body height plus a full jump reaches about four tiles up.
        for (let dr = 0; dr <= JUMP_UP + 1; dr += 1) if (seen.has(`${c + dc},${r + dr}`)) return true;
      }
      return false;
    },
  };
}
