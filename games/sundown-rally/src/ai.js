import { clamp, lerp, wrapAngle } from './math.js';
import { OBSTACLES } from './entities.js';

const LOOK_HAZARDS = 55;  // meters ahead the driver watches for hazards
const CAR_HALF = 2.5;     // half width of the jeep plus a safety margin

// A driver that produces the same input as a player: { throttle, brake,
// steer, nitro, fire }. Used for autopilot, par-time calibration, and later
// for rival jeeps.
export function aiInput(world, racer, skill = 1) {
  const t = world.track, v = racer.vehicle;

  // Stuck against something: back up and turn away for a moment.
  racer.aiStuck = Math.abs(v.speed) < 1.5 ? (racer.aiStuck || 0) + 1 / 60 : 0;
  if (racer.aiStuck > 0.8) racer.aiReverse = 1;
  // Just bounced off something: back off briefly rather than grind into it.
  if (racer.hitCooldown > 0.9 && v.speed < 16 && !(racer.aiReverse > 0)) racer.aiReverse = 0.5;
  if (racer.aiReverse > 0) {
    racer.aiReverse -= 1 / 60;
    return { throttle: 0, brake: 1, steer: racer.lateral > 0 ? -1 : 1, nitro: false, fire: false };
  }

  const lane = chooseLane(world, racer);
  racer.aiLane = lerp(racer.aiLane, lane, 0.25);

  const look = 8 + Math.max(0, v.speed) * 0.45;
  const target = t.pointAt(racer.along + look, racer.aiLane);
  const desired = Math.atan2(target.x - v.x, target.z - v.z);
  const diff = wrapAngle(desired - v.heading);
  // Pursue the look-ahead point, plus a direct pull toward the chosen lane.
  // (+steer turns toward decreasing heading, which moves toward -lateral.)
  const steer = clamp(-diff * 2.6 + (racer.lateral - racer.aiLane) * 0.12, -1, 1);

  // Slow down for bends: measure how much the road turns ahead.
  const bend = bendAhead(t, racer.along, 25 + Math.max(0, v.speed) * 1.4);
  const top = v.stats.maxSpeed * skill;
  const targetSpeed = lerp(top, 15, clamp((bend - 0.25) / 1.1, 0, 1));
  const wrongWay = Math.abs(diff) > 1.6;

  return {
    throttle: wrongWay || v.speed < targetSpeed ? 1 : 0,
    brake: !wrongWay && v.speed > targetSpeed + 3 ? 0.7 : 0,
    steer,
    nitro: bend < 0.3 && v.nitro > 0.25 && Math.abs(diff) < 0.2,
    fire: racer.weapon === 'rockets' && hasBigTarget(world, racer),
  };
}

function bendAhead(track, from, span) {
  const a = track.pointAt(from).heading;
  let max = 0;
  for (let d = 10; d <= span; d += 10) {
    const h = track.pointAt(from + d).heading;
    max = Math.max(max, Math.abs(wrapAngle(h - a)));
  }
  return max;
}

// Picks a sideways offset that avoids obstacles and nasty zombies ahead,
// preferring to stay near the current line and to grab pickups.
function chooseLane(world, racer) {
  const t = world.track;
  const half = t.half - 1.2;
  const blocks = [];
  const wants = [];
  const from = racer.along, to = racer.along + LOOK_HAZARDS;

  const project = (e) => {
    const near = t.nearestLocal(e.x, e.z, Math.floor(e.along / 2) || racer.hint, 30);
    return near;
  };
  for (const o of world.obstaclesNear(racer.vehicle.x, racer.vehicle.z).concat(obstaclesAhead(world, racer))) {
    if (!o.alive || OBSTACLES[o.type].harmless) continue;
    if (o.along < from - 2 || o.along > to) continue;
    const p = o.roll ? t.nearestLocal(o.x, o.z, Math.floor(o.along / 2), 10) : { lateral: o.lateral };
    blocks.push({ lateral: p.lateral, r: o.r + CAR_HALF + (o.roll ? 3 : 0), dist: o.along - from });
  }
  for (const z of world.zombies) {
    if (!z.alive || z.along < from - 2 || z.along > to) continue;
    if (z.type !== 'bloater' && z.type !== 'brute') continue;
    if (racer.shield > 0) continue;
    const p = project(z);
    blocks.push({ lateral: p.lateral, r: z.r + CAR_HALF + 1, dist: p.along - from });
  }
  for (const p of world.pickups) {
    if (!p.alive || p.air) continue;
    const near = project(p);
    if (near.along < from + 5 || near.along > to) continue;
    wants.push({ lateral: near.lateral, dist: near.along - from, value: p.type === 'coin' ? 1 : 3 });
  }

  let best = racer.aiLane, bestCost = Infinity;
  for (let lane = -half; lane <= half + 0.01; lane += 0.75) {
    let cost = Math.abs(lane - racer.aiLane) * 0.4 + Math.abs(lane) * 0.05;
    for (const b of blocks) {
      if (Math.abs(lane - b.lateral) < b.r) cost += 100 / (1 + b.dist * 0.05);
    }
    for (const w of wants) {
      if (Math.abs(lane - w.lateral) < 1.8) cost -= w.value / (1 + w.dist * 0.05);
    }
    if (cost < bestCost) { bestCost = cost; best = lane; }
  }
  return best;
}

function obstaclesAhead(world, racer) {
  const out = [];
  for (let d = 16; d <= LOOK_HAZARDS; d += 16) {
    const p = world.track.pointAt(racer.along + d);
    out.push(...world.obstaclesNear(p.x, p.z));
  }
  return out;
}

function hasBigTarget(world, racer) {
  const v = racer.vehicle;
  return world.zombies.some((z) => z.alive && z.active && (z.type === 'brute' || z.type === 'bloater') &&
    z.along > racer.along + 10 && z.along < racer.along + 70 && Math.hypot(z.x - v.x, z.z - v.z) < 70);
}
