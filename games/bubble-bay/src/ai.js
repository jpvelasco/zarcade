// A greedy autoplayer: tries a fan of angles with the loaded and the next
// bubble, scores the board each would leave, and takes the best. It proves
// levels are fair in the tests and plays the attract mode (?autoplay).
import { traceShot, resolveShot, LOSE_ROW, NEIGHBORS, CX, rowOf, ring, MIN_ANGLE, MAX_ANGLE, SIZE } from './grid.js';
import { Game } from './game.js';

function nearCount(board, targets, radius) {
  let n = 0;
  const seen = new Set();
  for (const t of targets) {
    for (const i of ring(t, radius)) {
      if (i !== t && !seen.has(i) && board.cells[i]) { seen.add(i); n++; }
    }
  }
  return n;
}

function anchorCone(board) {
  let at = -1;
  for (let i = 0; i < SIZE; i++) if (board.cells[i]?.k === 'anchor') { at = i; break; }
  if (at < 0) return { at, cone: 0 };
  const ar = rowOf(at);
  let cone = 0;
  for (let i = 0; i < SIZE; i++) {
    const cell = board.cells[i];
    if (!cell || i === at) continue;
    const r = rowOf(i);
    if (r <= ar && Math.abs(CX[i] - CX[at]) <= (ar - r) * 1.2 + 2.5) cone++;
  }
  return { at, cone };
}

function otterCells(board) {
  const out = [];
  for (let i = 0; i < SIZE; i++) if (board.cells[i]?.k === 'otter') out.push(i);
  return out;
}

// Score the result of one shot (higher is better).
function evaluate(game, board, shot, trace, events) {
  const goal = game.level.goal.type;
  let score = 0;
  score += events.pops.length * 10 + events.drops.length * 14;
  score += events.freed.length * (goal === 'otters' ? 600 : 120);
  if (events.anchor) score += goal === 'anchor' ? 100000 : 200;
  if (goal === 'pop') score += events.cleared * 12;
  if (goal === 'anchor') score -= anchorCone(board).cone * 6;
  if (goal === 'otters') {
    const otters = otterCells(board);
    score -= nearCount(board, otters, 2) * 3;
  }
  // building toward a match is better than a lonely bubble
  if (events.pops.length === 0 && trace.land >= 0 && shot.kind === 'b') {
    let same = 0;
    for (const n of NEIGHBORS[trace.land]) {
      const cell = board.cells[n];
      if (cell && cell.k === 'b' && cell.c === shot.c) same++;
    }
    score += same ? same * 6 : -6;
  }
  // stay well clear of the line, counting a creep that is about to happen
  const lowest = board.lowestRow() + (game.creepIn <= 1 ? 1 : 0);
  if (board.lowestRow() >= LOSE_ROW && !board.isEmpty()) score -= 1e7;
  else if (lowest >= LOSE_ROW) score -= 5e5;
  score -= Math.max(0, lowest - (LOSE_ROW - 4)) * 60;
  return score;
}

// Every distinct outcome for a shot kind across a fan of angles.
export function fan(board, shot, steps = 96) {
  const out = [];
  const seen = new Set();
  for (let k = 0; k <= steps; k++) {
    const angle = MIN_ANGLE + ((MAX_ANGLE - MIN_ANGLE) * k) / steps;
    const trace = traceShot(board, angle, { pass: shot.kind === 'zap' });
    const key = shot.kind === 'zap' ? trace.touched.slice().sort((a, b) => a - b).join(',') : String(trace.land);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ angle, trace });
  }
  return out;
}

export function pickShot(game, { steps = 96 } = {}) {
  let best = null;
  const options = [{ shot: game.current, swap: false }];
  if (game.next && !game.current.booster && (game.next.kind !== game.current.kind || game.next.c !== game.current.c)) {
    options.push({ shot: game.next, swap: true });
  }
  for (const { shot, swap } of options) {
    for (const { angle, trace } of fan(game.board, shot, steps)) {
      const board = game.board.clone();
      const events = resolveShot(board, shot, trace);
      const score = evaluate(game, board, shot, trace, events) - (swap ? 0.5 : 0);
      if (!best || score > best.score) best = { angle, swap, score };
    }
  }
  return best;
}

// Plays a whole level one shot per step (a generator, so the browser can
// spread the work over idle frames). Returns how it went.
export function* playSteps(level, { seed = 1, allowContinue = false, steps = 96, maxShots = 400 } = {}) {
  const game = new Game(level, { seed });
  while (game.shots < maxShots) {
    if (game.phase === 'lost') {
      if (allowContinue && game.canContinue()) { game.useContinue(); continue; }
      break;
    }
    if (game.phase !== 'aim') break;
    const move = pickShot(game, { steps });
    if (move.swap) game.swap();
    game.fire(move.angle);
    yield game.shots;
  }
  return {
    won: game.phase === 'won',
    stars: game.stars(),
    leftover: game.phase === 'won' ? game.leftover : 0,
    shots: game.shots,
    score: game.score,
    continued: game.continued,
    reason: game.lostReason,
    game,
  };
}

export function finish(gen) {
  for (;;) {
    const { value, done } = gen.next();
    if (done) return value;
  }
}

export function autoplay(level, options) {
  return finish(playSteps(level, options));
}

// Fair supply: play the level with a bottomless bag a few times, then give
// a generous margin over the autoplayer's worst run. Stars ask for
// autoplayer-quality play for three, and a bit of care for two.
export const CALIBRATION_SEEDS = [11, 22, 33, 44, 55];

export function supplyFromShots(shots) {
  const sorted = shots.slice().sort((a, b) => a - b);
  const worst = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const supply = Math.max(15, Math.ceil(median * 1.6 + 6), worst + 4);
  const spare = supply - median;
  return { supply, stars: [0, Math.max(2, Math.round(spare * 0.4)), Math.max(4, Math.round(spare * 0.75))] };
}

export function* calibrateSteps(level, { seeds = CALIBRATION_SEEDS, steps = 96 } = {}) {
  const bottomless = { ...level, supply: 400 };
  const shots = [];
  for (const seed of seeds) {
    const result = yield* playSteps(bottomless, { seed, steps, allowContinue: true });
    shots.push(result.won ? result.shots : 90);
  }
  return supplyFromShots(shots);
}

export function calibrate(level, options) {
  return finish(calibrateSteps(level, options));
}
