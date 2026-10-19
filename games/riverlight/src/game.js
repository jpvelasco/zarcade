// One garden in progress: rotations, moves, undo, reset, hints and stars.
// DOM-free so tests (and the autoplayer) can drive it directly.
import { simulate } from './flow.js';
import { buildGroups, signature } from './solver.js';

export function starTargets(par) {
  return { three: Math.ceil(par * 1.3) + 2, two: Math.ceil(par * 2) + 4 };
}

export function starsFor(moves, par) {
  const t = starTargets(par);
  return moves <= t.three ? 3 : moves <= t.two ? 2 : 1;
}

export class Game {
  constructor(level, saved = null) {
    this.level = level;
    this.puzzle = level.puzzle;
    this.topo = this.puzzle.topo;
    this.n = this.topo.n;
    const { groupOf, members, fixed } = buildGroups(this.puzzle);
    this.groupOf = groupOf;
    this.members = members;
    this.fixed = fixed;
    this.start = this.puzzle.rots.slice();
    this.rots = this.start.slice();
    this.moves = 0;
    this.history = [];
    this.hintsUsed = 0;
    if (saved && Array.isArray(saved.rots) && saved.rots.length === this.rots.length && this.consistent(saved.rots)) {
      this.rots = saved.rots.map((r) => ((r % this.n) + this.n) % this.n);
      this.moves = Math.max(0, saved.moves | 0);
    }
    // Hints follow the stream: tiles nearest the spring come first.
    const solved = simulate(this.puzzle, new Array(this.topo.count).fill(0));
    this.order = [];
    for (let i = 0; i < this.topo.count; i++) if (this.puzzle.tiles[i]) this.order.push(i);
    this.order.sort((a, b) => solved.depth[a] - solved.depth[b] || a - b);
    this.flow = simulate(this.puzzle, this.rots);
    this.wasSolved = this.flow.solved;
  }

  // Saved rotations must keep locked stones still and twins together.
  consistent(rots) {
    return this.members.every((list, g) => {
      if (this.fixed[g]) return list.every((i) => rots[i] === this.start[i]);
      return list.every((i) => rots[i] === rots[list[0]]);
    });
  }

  get solved() {
    return this.flow.solved;
  }

  canRotate(i) {
    const g = this.groupOf[i];
    return g >= 0 && !this.fixed[g];
  }

  partners(i) {
    const g = this.groupOf[i];
    return g >= 0 ? this.members[g] : [];
  }

  turn(g, dir) {
    for (const i of this.members[g]) this.rots[i] = (((this.rots[i] + dir) % this.n) + this.n) % this.n;
  }

  refresh() {
    const before = new Set(this.flow.flowers.filter((f) => f.ok).map((f) => f.i));
    this.flow = simulate(this.puzzle, this.rots);
    const bloomed = this.flow.flowers.filter((f) => f.ok && !before.has(f.i)).map((f) => f.i);
    const justSolved = this.flow.solved && !this.wasSolved;
    this.wasSolved = this.flow.solved;
    return { bloomed, justSolved };
  }

  // dir: +1 clockwise (tap), -1 anticlockwise. Returns null when the stone
  // cannot turn or the garden is already finished.
  rotate(i, dir = 1) {
    if (this.solved || !this.canRotate(i)) return null;
    const g = this.groupOf[i];
    this.turn(g, dir);
    this.moves++;
    this.history.push({ g, dir });
    return { tiles: this.members[g], dir, ...this.refresh() };
  }

  undo() {
    if (this.solved) return null;
    const last = this.history.pop();
    if (!last) return null;
    if (last.reset) {
      this.rots = last.rots.slice();
      this.moves = last.moves;
      return { tiles: [], dir: 0, reset: true, ...this.refresh() };
    }
    this.turn(last.g, -last.dir);
    this.moves = Math.max(0, this.moves - 1);
    return { tiles: this.members[last.g], dir: -last.dir, ...this.refresh() };
  }

  // Back to the starting scramble. Undo can bring the old board back.
  reset() {
    if (this.solved || (this.moves === 0 && this.rots.every((r, i) => r === this.start[i]))) return null;
    this.history.push({ reset: true, rots: this.rots.slice(), moves: this.moves });
    this.rots = this.start.slice();
    this.moves = 0;
    return { tiles: [], dir: 0, reset: true, ...this.refresh() };
  }

  groupCorrect(g) {
    const t = this.puzzle.tiles;
    return this.members[g].every((i) => signature(t[i], this.rots[i], this.n) === signature(t[i], 0, this.n));
  }

  // The next stone along the stream that is not yet facing the right way,
  // and the shorter way to turn it.
  hint() {
    if (this.solved) return null;
    for (const i of this.order) {
      const g = this.groupOf[i];
      if (g < 0 || this.fixed[g] || this.groupCorrect(g)) continue;
      const k = this.rots[i];
      const t = this.puzzle.tiles;
      let best = null;
      for (let target = 0; target < this.n; target++) {
        if (!this.members[g].every((m) => signature(t[m], target, this.n) === signature(t[m], 0, this.n))) continue;
        const up = (((target - k) % this.n) + this.n) % this.n;
        const down = this.n - up;
        const option = up <= down ? { dir: 1, steps: up } : { dir: -1, steps: down };
        if (!best || option.steps < best.steps) best = option;
      }
      return { i, ...best };
    }
    return null;
  }

  stars() {
    return starsFor(this.moves, this.puzzle.par);
  }

  serialize() {
    return { rots: this.rots.slice(), moves: this.moves };
  }
}

// Plays a garden to completion with hints, one tap per step.
export function autoplay(game, limit = 2000) {
  let steps = 0;
  while (!game.solved && steps < limit) {
    const h = game.hint();
    if (!h) break;
    game.rotate(h.i, h.dir);
    steps++;
  }
  return steps;
}
