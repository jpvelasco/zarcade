// Fewest-launch solver. A state is "where the comet rests, and which letters
// are already in the satchel" — the resting spot quantized to a grid, plus the
// letter bitmask. Each action costs exactly one launch, so breadth-first order
// yields the shortest line.
//
// A delivery only counts when the satchel is full, so the par this returns is
// the fewest launches that collect every letter *and* sink the star. That is
// the number the game shows as par, and the reason a lucky long shot is not
// automatically perfect.
//
// The beam and depth caps keep the search quick; a null result means
// "unsolvable within the window", which the level tests reject.
import { SOLVER } from './config.js';
import { stepShot, launchVector, allLetters, letterCount, STAR_OUT } from './sim.js';
import { clamp } from './math.js';

function quantize(x, y, cell) {
  return `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
}

const stateKey = (x, y, mask, cell) => `${quantize(x, y, cell)}:${mask}`;

// actions: {angle, power}[] tried from any position (order = priority).
const ACTIONS = (() => {
  const list = [];
  for (const p of SOLVER.powers) {
    for (let i = 0; i < SOLVER.angles; i++) {
      list.push({ angle: (i / SOLVER.angles) * Math.PI * 2 - Math.PI, power: p });
    }
  }
  // Strong shots first: they reach farther, so the frontier stays useful.
  list.sort((a, b) => b.power - a.power || a.angle - b.angle);
  return list;
})();

// Beam priority: letters still to fetch dominate, then grid cells to the next
// thing worth reaching (the nearest loose letter, or the star once the satchel
// is full). Only used to rank the frontier, never to prune a solution.
function h(x, y, mask, level, cell) {
  const letters = level.letters || [];
  let target = level.star;
  let left = 0;
  let bestD = Infinity;
  for (let i = 0; i < letters.length; i++) {
    if (mask & (1 << i)) continue;
    left++;
    const d = Math.hypot(x - letters[i].x, y - letters[i].y);
    if (d < bestD) {
      bestD = d;
      target = letters[i];
    }
  }
  const dx = Math.abs(x - target.x) / cell;
  const dy = Math.abs(y - target.y) / cell;
  return left * 6 + Math.ceil(Math.max(dx, dy) / 3);
}

// `opts.stats`, when given, is filled in with { nodes, capped }. `capped` means
// the search ran out of budget rather than running out of panel, so a null
// result there means "do not know", not "impossible" — the level tests insist on
// an uncapped search before they trust a null.
export function solve(level, spawn, opts = {}) {
  const {
    dt = SOLVER.dt,
    beam = SOLVER.beam,
    maxDepth = SOLVER.maxDepth,
    cell = SOLVER.cell,
    maxShot = SOLVER.maxShot,
    maxNodes = SOLVER.maxNodes,
    stats = null,
  } = opts;
  if (stats) {
    stats.nodes = 0;
    stats.capped = false;
  }
  const want = allLetters(level);
  let frontier = [{ x: spawn.x, y: spawn.y, mask: 0, depth: 0, path: [] }];
  const seen = new Set([stateKey(spawn.x, spawn.y, 0, cell)]);
  let nodes = 0;

  for (let depth = 0; depth <= maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const act of ACTIONS) {
        if (nodes >= maxNodes) {
          if (stats) stats.capped = true;
          return null;
        }
        nodes++;
        if (stats) stats.nodes = nodes;
        const v = launchVector(act.angle, act.power);
        const r = stepShot(level, node.x, node.y, v.vx, v.vy, dt, node.mask);
        const step = { ...act, x: node.x, y: node.y };
        if (r.outcome === STAR_OUT) {
          // Sinking the star with mail still loose ends the attempt short of
          // the goal, so that branch is simply dropped.
          if (r.letters === want) return { par: depth + 1, line: [...node.path, step] };
          continue;
        }
        if (r.t > maxShot) continue; // keeps wandering: dead end
        const key = stateKey(r.x, r.y, r.letters, cell);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ x: r.x, y: r.y, mask: r.letters, depth: node.depth + 1, path: [...node.path, step] });
      }
      // Beam prune this depth: keep the most promising nodes.
      if (next.length > beam) {
        next.sort((a, b) => h(a.x, a.y, a.mask, level, cell) - h(b.x, b.y, b.mask, level, cell) || letterCount(b.mask) - letterCount(a.mask) || b.x - a.x);
        next.length = beam;
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return null;
}

// Replays a solved line through the real simulation; used by tests and the
// attract ghost. Returns the per-shot trace, or null if the line fails to
// deliver a full satchel to the star.
export function replay(level, spawn, line) {
  let { x, y } = spawn;
  let mask = 0;
  const want = allLetters(level);
  const trace = [];
  for (const act of line) {
    const v = launchVector(act.angle, clamp(act.power, 0, 1));
    const r = stepShot(level, x, y, v.vx, v.vy, undefined, mask);
    trace.push({ from: { x, y }, act: { ...act, x, y }, to: r, star: r.outcome === STAR_OUT, letters: r.letters });
    if (r.outcome === STAR_OUT) return r.letters === want ? trace : null;
    x = r.x;
    y = r.y;
    mask = r.letters;
  }
  return null;
}
