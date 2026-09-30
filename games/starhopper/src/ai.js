import { clamp } from './math.js';
import { LANE, HAZARDS, PLAYER } from './entities.js';

const LOOK_TIME = 2.2; // seconds ahead the pilot watches for trouble
const GRID_U = 13, GRID_W = 9;

// An autopilot that returns the same input a player gives:
// { x, y, fire, missile, boost, brake, rollLeft, rollRight }.
// Used for tests, par values, and the menu's attract mode.
export function aiInput(world, { dodgeBolts = true } = {}) {
  const p = world.player;
  const hazards = collectHazards(world, dodgeBolts);
  const goal = chooseGoal(world);

  let best = { u: p.u, w: p.w }, bestCost = Infinity;
  for (let i = 0; i < GRID_U; i++) {
    for (let j = 0; j < GRID_W; j++) {
      const u = -LANE.halfU + 2 + (i / (GRID_U - 1)) * (LANE.halfU * 2 - 4);
      const w = -LANE.halfW + 2 + (j / (GRID_W - 1)) * (LANE.halfW * 2 - 4);
      let cost = Math.hypot(u - p.u, w - p.w) * 0.03;
      if (goal) cost += Math.hypot(u - goal.u, w - goal.w) * 0.08 * goal.weight;
      for (const h of hazards) {
        // Where will the hazard be when we reach it, and how close to (u, w)?
        const d = Math.hypot(u - h.u - h.vu * h.t, w - h.w - h.vw * h.t);
        if (d < h.r + 3) cost += (h.danger * (1 - h.t / LOOK_TIME) + 5) * (1 - d / (h.r + 3));
      }
      if (cost < bestCost) { bestCost = cost; best = { u, w }; }
    }
  }

  // Final approach to the drive-thru: aim straight at the ring.
  const ring = world.journey.burger;
  if (!p.burgerDone && ring.s > p.s && ring.s < p.s + 160) best = { u: ring.u, w: ring.w };

  const input = {
    x: clamp((best.u - p.u) / 5, -1, 1),
    y: clamp((best.w - p.w) / 5, -1, 1),
    fire: !!p.lock || world.status === 'boss',
    missile: false, boost: false, brake: false, rollLeft: false, rollRight: false,
  };

  // Missiles for big targets or crowds.
  const big = world.enemies.some((e) => e.alive && (e.kind === 'bosspart' || e.kind === 'turret' || (e.kind === 'bosscore' && world.boss.phase === 'core')) && e.s > p.s + 40 && e.s < p.s + 300);
  const crowd = world.enemies.filter((e) => e.alive && world.targetable(e) && e.s > p.s + 40 && e.s < p.s + 250).length >= 4;
  input.missile = (big || crowd) && p.missiles > 0 && world.time % 2 < 0.05;

  // Roll away from a bolt that's about to hit.
  const threat = world.enemyBolts.find((b) => {
    const t = (b.s - p.s) / Math.max(1, p.speed - b.vs);
    return t > 0 && t < 0.25 && Math.hypot(b.u + b.vu * t - p.u, b.w + b.vw * t - p.w) < PLAYER.radius + 1;
  });
  if (dodgeBolts && threat && p.rollCooldown <= 0) {
    if (p.u > 0) input.rollLeft = true; else input.rollRight = true;
  }

  // Boost through empty space.
  input.boost = world.status === 'flying' && !hazards.some((h) => h.t < 2.5) && !world.enemies.some((e) => e.alive && world.targetable(e) && e.s > p.s && e.s < p.s + 400) && p.boost > 0.4;
  return input;
}

function chooseGoal(world) {
  const p = world.player;
  const b = world.journey.burger;
  if (!p.burgerDone && b.s > p.s && b.s < p.s + 700) return { u: b.u, w: b.w, weight: 6 };
  // Line up with the locked (or nearest) enemy.
  let target = p.lock;
  if (!target) {
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (!e.alive || !world.targetable(e) || e.s < p.s + 30 || e.s > p.s + 320) continue;
      const d = (e.s - p.s) * 0.2 + Math.hypot(e.u - p.u, e.w - p.w);
      if (d < bestD) { bestD = d; target = e; }
    }
  }
  if (target) return { u: target.u, w: target.w, weight: 1.2 };
  // Otherwise grab the nearest useful pickup.
  let pick = null, pd = Infinity;
  for (const k of world.pickups) {
    if (!k.alive || k.s < p.s + 15 || k.s > p.s + 260) continue;
    const d = k.s - p.s;
    if (d < pd) { pd = d; pick = k; }
  }
  if (pick) return { u: pick.u, w: pick.w, weight: pick.type === 'dust' ? 0.8 : 1.5 };
  return { u: 0, w: 0, weight: 0.2 };
}

function collectHazards(world, dodgeBolts) {
  const p = world.player;
  const out = [];
  const add = (o, r, danger, vs = 0) => {
    const closing = p.speed - vs;
    if (closing <= 1) return;
    const t = (o.s - p.s) / closing;
    if (t < -0.05 || t > LOOK_TIME) return;
    out.push({ u: o.u, w: o.w, vu: o.du ?? o.vu ?? 0, vw: o.dw ?? o.vw ?? 0, t: Math.max(0, t), r, danger });
  };
  if (world.status !== 'hyper') {
    for (const o of world.statics) {
      if (!o.alive || o.s < p.s - 4 || o.s > p.s + 260) continue;
      if (o.kind === 'asteroid') add(o, HAZARDS.asteroid[o.size].r + 1, 40);
      else if (o.kind === 'mine') add(o, HAZARDS.mine.trigger, 40);
      else if (o.kind === 'wreck') {
        // Treat a wreck as a chain of spheres along its length.
        const n = Math.ceil(o.size.s / 8);
        for (let i = 0; i < n; i++) add({ s: o.s - o.size.s / 2 + (i + 0.5) * (o.size.s / n), u: o.u, w: o.w }, Math.max(o.size.u, o.size.w) / 2 + 2, 60);
      }
    }
  }
  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (e.kind === 'drone' || e.kind === 'fighter' || (e.kind === 'ghost' && e.visible)) add(e, e.r + 1.5, 25, e.vs);
    else if (e.kind === 'cruiser') {
      for (let i = -3; i <= 3; i++) add({ s: e.s + i * 10, u: e.u, w: e.w }, Math.max(e.half.u, e.half.w) + 2.5, 60, e.vs);
    }
  }
  if (dodgeBolts) for (const b of world.enemyBolts) add(b, 2.2, 18, b.vs);
  return out;
}
