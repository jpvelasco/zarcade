// Look-ahead autoplayer. For each candidate drop (angle × offset from the
// island centre) it copies the game, drops the animal, simulates a moment
// and scores the result. `planner()` is a generator so the browser can
// test one candidate per frame; `planNow()` runs it to the end (tests).
import { animalShape, heightAt, widthAt } from './animals.js';

const SIM_STEPS = 100;
const LONG_STEPS = 330;
const LONG_LOOKS = 4;

export function candidates(game) {
  const h = game.held;
  if (!h) return [];
  const shape = animalShape(h.animal);
  const angles = shape.type === 'circle' ? [0] : [0, Math.PI / 2, Math.PI];
  const half = Math.min(game.reach - 0.3, game.level.width / 2 + 0.3);
  const out = [];
  // Search near the current tower first: the middle of the top layer.
  let cx = 0, wsum = 0;
  for (const b of game.blocks) {
    if (b.touching === 0) continue;
    const wgt = Math.exp((b.maxY - game.top) * 1.5);
    cx += (b.x - game.platform.x) * wgt; wsum += wgt;
  }
  cx = wsum > 0 ? cx / wsum : 0;
  const offsets = [];
  for (let d = 0; d <= 2.4; d += 0.3) {
    offsets.push(d);
    if (d > 0) offsets.push(-d);
  }
  for (const a of angles) {
    for (const d of offsets) {
      const dx = cx + d;
      if (Math.abs(dx) > half) continue;
      out.push({ angle: a, dx });
    }
  }
  return out;
}

// Candidates are tried with a small, human-sized wobble in the release so a
// block balanced on a point (an unstable equilibrium) shows its true colours.
export const JITTER = { dx: 0.05, angle: 0.025 };

export function evaluate(game, cand, steps = SIM_STEPS) {
  const g = game.clone();
  g.held.angle = cand.angle + JITTER.angle;
  g.held.targetAngle = g.held.angle;
  g.held.x = g.platform.x + cand.dx + JITTER.dx;
  const before = g.blocks.map((b) => ({ b, x: b.x, y: b.y }));
  const splashes = g.splashes;
  g.holdTime = 0;
  if (!g.drop()) return -Infinity;
  const body = g.blocks[g.blocks.length - 1];
  for (let i = 0; i < steps; i++) g.step(1 / 60, {});
  if (g.splashes > splashes) return -1000 + g.top - (g.splashes - splashes) * 10;
  let disp = 0;
  for (const p of before) disp += Math.hypot(p.b.x - p.x, p.b.y - p.y);
  const top = g.phase === 'won' ? Math.max(g.top, game.goal || 0) + 5 : g.steadyTop();
  const gain = top - game.top;
  let score = top;
  score -= disp * 2.5;
  score -= g.sway * 1.2;
  const pl = g.platform;
  const sp = Math.hypot(body.vx - pl.vx, body.vy - pl.vy) + Math.abs(body.w - pl.w) * 0.5;
  if (sp > 0.25) score -= 1.5 + sp * 2;
  score -= Math.abs(body.x - g.platform.x) * 0.12;
  // tall, narrow placements (a standing giraffe) are wobbly
  const hh = heightAt(body.user.animal, cand.angle), ww = widthAt(body.user.animal, cand.angle);
  if (hh > ww) score -= (hh - ww) * 1.2;
  if (gain > 2.2) score -= (gain - 2.2) * 0.6;
  // keep the new block's centre low relative to its own size
  score -= Math.max(0, body.y - (body.minY + body.maxY) / 2) * 0.2;
  // a flat top is something to build on; a point or a dome is not
  score += Math.min(1.6, topWidth(body)) * 0.35;
  // goal modes: once the line is reached, steadiness is all that matters
  if (game.goal != null && top >= game.goal + 1.2) score = game.goal + 1.2 - disp * 3 - g.sway * 2;
  return score;
}

// Two passes: a short look at every candidate, then a long look at the
// best few (catches towers that tip over a few seconds later).
export function topWidth(b) {
  if (!b.wv) return 0;
  let lo = Infinity, hi = -Infinity;
  for (const v of b.wv) if (v.y > b.maxY - 0.08) { lo = Math.min(lo, v.x); hi = Math.max(hi, v.x); }
  return hi - lo;
}

export function* planner(game) {
  const list = candidates(game);
  const scored = [];
  let best = null, bestScore = -Infinity;
  for (const c of list) {
    const s = evaluate(game, c);
    scored.push({ c, s });
    if (s > bestScore) { bestScore = s; best = c; }
    yield { best, bestScore, done: false };
  }
  scored.sort((a, b) => b.s - a.s);
  best = null; bestScore = -Infinity;
  for (const { c } of scored.slice(0, LONG_LOOKS)) {
    const s = evaluate(game, c, LONG_STEPS);
    if (s > bestScore) { bestScore = s; best = c; }
    yield { best, bestScore, done: false };
  }
  return { ...(best || { angle: 0, dx: 0 }), score: bestScore };
}

export function planNow(game) {
  const it = planner(game);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// Steers the crane to a plan, then drops. Works with any frame rate: the
// browser feeds it one candidate per frame (`budget`).
export class Autopilot {
  // instant: drop the moment a plan is ready, exactly where it was tested
  // (the solver tests use this so outcomes match the look-ahead).
  constructor({ budget = 1, pause = 0.25, instant = false } = {}) {
    this.instant = instant;
    this.budget = budget;
    this.pause = pause;
    this.it = null;
    this.plan = null;
    this.forHeld = null;
    this.wait = 0;
  }

  controls(game, dt = 1 / 60) {
    const h = game.held;
    if (!h || !game.canDrop()) { this.plan = null; this.it = null; this.forHeld = null; return {}; }
    if (this.instant && this.forHeld !== h) {
      // wait for calm before looking ahead, so the plan sees the real tower
      if (game.calmTime < 0.3 && (this.waited = (this.waited || 0) + dt) < 4) return {};
      this.waited = 0;
    }
    if (this.forHeld !== h) {
      this.forHeld = h;
      this.it = planner(game);
      this.plan = null;
      this.wait = this.pause;
    }
    if (!this.plan) {
      for (let i = 0; i < this.budget && this.it; i++) {
        const r = this.it.next();
        if (r.done) { this.plan = r.value; this.it = null; }
        else if (r.value.best) this.preview = r.value.best;
      }
      const p = this.preview;
      return p ? { targetX: game.platform.x + p.dx } : {};
    }
    const p = this.plan;
    if (this.instant) return { snap: { x: game.platform.x + p.dx + JITTER.dx, angle: p.angle + JITTER.angle }, drop: true };
    const tx = game.platform.x + p.dx;
    const c = { targetX: tx };
    const diff = p.angle - h.targetAngle;
    if (Math.abs(diff) > 0.01) c.rotate = diff > 0 ? 1 : -1;
    this.wait -= dt;
    if (!c.rotate && Math.abs(h.x - tx) < 0.03 && Math.abs(h.angle - p.angle) < 0.01 && this.wait <= 0) c.drop = true;
    return c;
  }
}
