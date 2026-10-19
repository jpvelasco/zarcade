// A DOM-free TriPeaks solver. Depth-first search over (cleared mask, cards
// drawn, waste rank) with a memo of positions already explored. Plays are
// tried before draws, so lines keep long streaks. The search stops after a
// fixed number of nodes, so a result never depends on how fast the machine is.
//
// Used by deals.js (pick winnable deals), the hint button, the ?autoplay
// mode and the title-screen attract mode, and by the tests.
import { rankOf } from './cards.js';

export const HINT_BUDGET = 40000;

// A move is a slot index (play that card) or DRAW.
export const DRAW = -1;

export function solve(pos, { budget = HINT_BUDGET } = {}) {
  const { layout, cards, stock } = pos;
  const n = layout.count;
  const full = (1 << n) - 1;
  const cover = layout.coverMask;
  const ranks = cards.map(rankOf);
  const stockRanks = stock.map(rankOf);
  const total = stock.length;
  // Try cards that unlock more of the layout first: lower rows (later slots)
  // sit on top and cover the most.
  const order = [];
  for (let i = n - 1; i >= 0; i--) order.push(i);

  const seen = new Set();
  const path = [];
  let nodes = 0;
  let capped = false;
  let bestCleared = -1;
  let bestLine = [];

  function dfs(mask, drawn, top, cleared) {
    if (mask === full) return true;
    if (nodes >= budget) {
      capped = true;
      return false;
    }
    nodes++;
    const key = (mask * 64 + drawn) * 16 + top;
    if (seen.has(key)) return false;
    seen.add(key);
    if (cleared > bestCleared) {
      bestCleared = cleared;
      bestLine = path.slice();
    }
    for (let k = 0; k < n; k++) {
      const i = order[k];
      const bit = 1 << i;
      if (mask & bit) continue;
      if ((mask & cover[i]) !== cover[i]) continue;
      const d = (ranks[i] - top + 13) % 13;
      if (d !== 1 && d !== 12) continue;
      path.push(i);
      if (dfs(mask | bit, drawn, ranks[i], cleared + 1)) return true;
      path.pop();
      if (capped) return false;
    }
    if (drawn < total) {
      path.push(DRAW);
      if (dfs(mask, drawn + 1, stockRanks[drawn], cleared)) return true;
      path.pop();
    }
    return false;
  }

  let startCleared = 0;
  for (let m = pos.mask; m; m &= m - 1) startCleared++;
  const won = dfs(pos.mask, pos.drawn, pos.top, startCleared);
  return {
    result: won ? 'win' : capped ? 'unknown' : 'lose',
    line: won ? path.slice() : null,
    best: { cleared: Math.max(bestCleared, startCleared), line: bestLine },
    nodes,
  };
}

// The longest run of plays without a draw in a line of moves.
export function lineStreak(line, start = 0) {
  let run = start;
  let best = start;
  for (const m of line || []) {
    run = m === DRAW ? 0 : run + 1;
    if (run > best) best = run;
  }
  return best;
}

// What the hint button suggests from a round's position:
//   kind 'win'   — first move of a winning line;
//   kind 'best'  — no win found in budget: first move of the line that clears most;
//   kind 'lost'  — proven no way to clear from here (suggest undo);
//   kind 'none'  — nothing to do at all.
export function hintFor(round, { budget = HINT_BUDGET } = {}) {
  if (round.status !== 'play') return { kind: 'none', move: null };
  const res = solve(round.position(), { budget });
  if (res.result === 'win') return { kind: 'win', move: res.line[0], line: res.line, nodes: res.nodes };
  const fallback = res.best.line.length ? res.best.line[0] : round.playable()[0] ?? (round.canDraw() ? DRAW : null);
  return { kind: res.result === 'lose' ? 'lost' : 'best', move: fallback, line: res.best.line, nodes: res.nodes };
}
