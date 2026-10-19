// Autoplayer: aims at bears (and what holds them up), simulates each shot on
// a clone of the game, and picks the one that pops the most bears. Used by
// the tests (every level is clearable), ?autopilot and the title demo.
import { SLING, GRAVITY, MAX_SPEED, BEANS, TICK } from './config.js';

// Launch velocity that passes through (tx, ty) at `speed`, low or high arc.
export function aimAt(tx, ty, speed, high = false) {
  const dx = tx - SLING.x;
  const dy = ty - SLING.y;
  const g = -GRAVITY;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0 || dx <= 0) return null;
  const tan = (v2 + (high ? 1 : -1) * Math.sqrt(disc)) / (g * dx);
  const a = Math.atan(tan);
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, angle: a };
}

function targetsOf(game) {
  const out = [];
  const bears = game.bodies.filter((b) => b.data && b.data.kind === 'bear');
  for (const b of bears) {
    out.push([b.x, b.y]);
    out.push([b.x - b.r * 1.6, b.y - b.r * 0.6]);
  }
  // The pieces bears stand on or hide behind.
  for (const b of bears) {
    let best = null;
    let bestD = 3.5;
    for (const p of game.bodies) {
      if (!p.data || p.data.kind !== 'piece') continue;
      const d = Math.hypot(p.x - (b.x - 0.8), p.y - b.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) out.push([best.x, best.y]);
  }
  return out;
}

export function candidates(game) {
  const type = game.bean;
  if (!type) return [];
  const power = BEANS[type].power;
  const speeds = [1, 0.86, 0.72].map((k) => k * MAX_SPEED);
  const shots = [];
  for (const [tx, ty] of targetsOf(game)) {
    for (const s of speeds) {
      for (const high of [false, true]) {
        const v = aimAt(tx, ty, s, high);
        if (!v) continue;
        const travel = (tx - SLING.x) / v.vx; // seconds until it reaches the target
        let at = null;
        if (power === 'split') at = travel * 0.7;
        else if (power === 'boost') at = travel * 0.35;
        else if (power === 'heavy') at = Math.max(0.1, travel - 0.35 / v.vx - 0.12);
        else if (power === 'hop') at = travel * 0.85;
        shots.push({ vx: v.vx, vy: v.vy, powerTick: at === null ? -1 : Math.max(1, Math.round(at / TICK)) });
        // A hop or a boost carries the bean off the arc it was aimed along,
        // so also try the plain fling, power unused, that a player would make.
        if (power === 'hop' || power === 'boost') shots.push({ vx: v.vx, vy: v.vy, powerTick: -1 });
      }
    }
  }
  // Drop near-duplicate shots.
  const seen = new Set();
  return shots.filter((s) => {
    const key = `${Math.round(s.vx * 2)},${Math.round(s.vy * 2)},${Math.round(s.powerTick / 3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Play one shot on a copy of the game until the turn ends.
export function simulateShot(game, shot, maxTicks = 900) {
  const g = game.clone();
  g.launch(shot.vx, shot.vy);
  for (let t = 0; t < maxTicks && g.state === 'flying'; t++) {
    if (t === shot.powerTick) g.usePower();
    g.update();
    g.events.length = 0;
  }
  return g;
}

function value(g) {
  return (g.bearsTotal - g.bearsLeft) * 1e6 + g.score + (g.state === 'won' ? 1e7 : 0);
}

// Search shots one at a time so the browser can spread the work over frames.
// `quick` stops at the first shot that wins instead of the highest-scoring
// one. It wins exactly the levels the full search wins, sooner, which is what
// the tests need to check many daily forts.
export function* searchShots(game, { quick = false } = {}) {
  let best = null;
  let bestVal = -Infinity;
  for (const shot of candidates(game)) {
    const g = simulateShot(game, shot);
    const v = value(g);
    if (v > bestVal) { bestVal = v; best = { shot, result: g }; }
    yield best;
    if (quick && g.state === 'won') break;
  }
  return best;
}

export function bestShot(game, opts) {
  let best = null;
  for (const b of searchShots(game, opts)) best = b;
  return best;
}

// Clear a level shot by shot. Returns the final game.
export function playLevel(game, opts) {
  let g = game;
  while (g.state === 'aim') {
    const best = bestShot(g, opts);
    if (!best) break;
    g = best.result;
  }
  return g;
}
