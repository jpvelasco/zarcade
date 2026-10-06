// Fewest-launch solver. State = settled position (quantized to a grid). Each
// action costs exactly one launch, so breadth-first order yields the shortest
// line. The beam and depth caps keep level generation snappy; a null result
// simply means "unsolvable within the window", which the level generator
// rejects.
import { SOLVER } from './config.js';
import { stepShot, launchVector, STAR_OUT } from './sim.js';
import { clamp } from './math.js';

function quantize(x, y, cell) {
  return `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
}

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

// Heuristic: grid cells still to cross, assuming a shot can cover at least a
// few cells. Never overestimates when beam order is respected.
function h(x, y, star, cell) {
  const dx = Math.abs(x - star.x) / cell;
  const dy = Math.abs(y - star.y) / cell;
  return Math.ceil(Math.max(dx, dy) / 3);
}

export function solve(level, spawn, opts = {}) {
  const {
    dt = SOLVER.dt,
    beam = SOLVER.beam,
    maxDepth = SOLVER.maxDepth,
    cell = SOLVER.cell,
    maxShot = SOLVER.maxShot,
    maxNodes = SOLVER.maxNodes,
  } = opts;
  const startKey = quantize(spawn.x, spawn.y, cell);
  let frontier = [{ x: spawn.x, y: spawn.y, depth: 0, path: [] }];
  const seen = new Set([startKey]);
  let nodes = 0;
  const star = level.star;

  for (let depth = 0; depth <= maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const act of ACTIONS) {
        if (nodes >= maxNodes) return null;
        nodes++;
        const v = launchVector(act.angle, act.power);
        const r = stepShot(level, node.x, node.y, v.vx, v.vy, dt);
        if (r.outcome === STAR_OUT) {
          return { par: depth + 1, line: [...node.path, { ...act, x: node.x, y: node.y }] };
        }
        if (r.t > maxShot) continue; // keeps wandering: dead end
        const key = quantize(r.x, r.y, cell);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({
          x: r.x,
          y: r.y,
          depth: node.depth + 1,
          path: [...node.path, { ...act, x: node.x, y: node.y }],
        });
      }
      // Beam prune this depth: keep the nodes closest to the star.
      if (next.length > beam) {
        next.sort((a, b) => h(a.x, a.y, star, cell) - h(b.x, b.y, star, cell) || b.x - a.x);
        next.length = beam;
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return null;
}

// Replays a solved line through the real simulation; used by tests and the
// attract ghost. Returns the per-shot trace, or null if a shot settles short
// of the star before the line runs out.
export function replay(level, spawn, line) {
  let { x, y } = spawn;
  const trace = [];
  for (const act of line) {
    const v = launchVector(act.angle, clamp(act.power, 0, 1));
    const r = stepShot(level, x, y, v.vx, v.vy);
    trace.push({ from: { x, y }, act: { ...act, x, y }, to: r, star: r.outcome === STAR_OUT });
    if (r.outcome === STAR_OUT) return trace;
    x = r.x;
    y = r.y;
  }
  return null;
}
