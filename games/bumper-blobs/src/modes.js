// Scoring rules for the three modes. Each rule set works on a World:
//   init(w)          set up mode state
//   step(w, dt)      score for one fixed step
//   onOut(w, blob)   a blob finished falling off
//   finished(w)      null, or { winner, ranking } when the round is over
// DOM-free.
import { KOTH, COINS, ROUND, DEFAULT_TARGET } from './config.js';
import { randomFloorPoint, zoneSpots, safeAt } from './arenas.js';

// Order blobs best-first by score, then fewer falls, more ring-outs, then
// player order, so every ranking is total and deterministic.
export function rankByScore(blobs) {
  return blobs.slice().sort((a, b) => b.score - a.score || a.stats.falls - b.stats.falls || b.stats.ringouts - a.stats.ringouts || a.i - b.i).map((b) => b.i);
}

// Last Blob Standing: survivors first, then the reverse order of falling.
export function lbsRanking(w) {
  const alive = w.blobs.filter((b) => !b.out && !b.falling).map((b) => b.i);
  const falling = w.blobs.filter((b) => b.falling).map((b) => b.i);
  return [...alive, ...falling, ...w.outOrder.slice().reverse()];
}

// The leader once the clock runs out, or -1 while scores are tied at the top.
function clearLeader(blobs) {
  let best = -Infinity, who = -1, tied = false;
  for (const b of blobs) {
    const s = Math.floor(b.score);
    if (s > best) { best = s; who = b.i; tied = false; } else if (s === best) tied = true;
  }
  return tied ? -1 : who;
}

function timedFinish(w) {
  const reached = w.blobs.filter((b) => Math.floor(b.score) >= w.target);
  if (reached.length) {
    const ranking = rankByScore(w.blobs);
    return { winner: ranking[0], ranking, reason: 'target' };
  }
  if (w.t < w.timeLimit) return null;
  if (!w.overtime) { w.overtime = true; w.emit('overtime', {}); }
  const leader = clearLeader(w.blobs);
  if (leader >= 0 || w.t >= w.timeLimit + ROUND.overtime) {
    const ranking = rankByScore(w.blobs);
    return { winner: ranking[0], ranking, reason: 'time' };
  }
  return null;
}

const lbs = {
  respawns: false,
  suddenDeath: true,
  defaultTarget: DEFAULT_TARGET.lbs,
  init() {},
  step() {},
  onOut(w, b) { b.place = w.blobs.length - w.outOrder.length + 1; },
  finished(w) {
    const standing = w.blobs.filter((b) => !b.out && !b.falling);
    const falling = w.blobs.some((b) => b.falling);
    if (standing.length > 1 || falling) return null;
    const ranking = lbsRanking(w);
    return { winner: standing.length === 1 ? standing[0].i : -1, ranking, reason: standing.length ? 'last' : 'draw' };
  },
};

const koth = {
  respawns: true,
  suddenDeath: false,
  defaultTarget: DEFAULT_TARGET.koth,
  init(w) {
    w.zoneSpots = zoneSpots(w.arena);
    w.zone = { x: w.zoneSpots[0].x, y: w.zoneSpots[0].y, r: KOTH.zoneRadius, timer: KOTH.moveEvery, owner: -1, contested: false, spot: 0 };
  },
  step(w, dt) {
    const z = w.zone;
    z.timer -= dt;
    if (z.timer <= 0 || !safeAt(w.arena, z.x, z.y, z.r * 0.5)) moveZone(w);
    let who = -1, count = 0;
    for (const b of w.blobs) {
      if (b.out || b.falling) continue;
      const dx = b.x - z.x, dy = b.y - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) { count++; who = b.i; }
    }
    z.contested = count > 1;
    const owner = count === 1 ? who : -1;
    if (owner >= 0) {
      const b = w.blobs[owner];
      const before = Math.floor(b.score);
      b.score += dt;
      if (Math.floor(b.score) > before) w.emit('point', { i: owner, score: Math.floor(b.score) });
    }
    if (owner !== z.owner && owner >= 0) w.emit('zoneTake', { i: owner });
    z.owner = owner;
  },
  onOut() {},
  finished: timedFinish,
};

// Pick the next zone spot that is still on solid ground.
export function moveZone(w) {
  const z = w.zone;
  const spots = w.zoneSpots;
  const order = [];
  for (let k = 1; k <= spots.length; k++) order.push((z.spot + k) % spots.length);
  // Hop to a random other spot, keeping only those with ground under them.
  const ok = order.filter((s) => s !== z.spot && safeAt(w.arena, spots[s].x, spots[s].y, z.r * 0.6));
  let next = ok.length ? ok[w.rng.int(ok.length)] : -1;
  if (next < 0) {
    const p = randomFloorPoint(w.arena, w.rng, z.r * 0.6);
    z.x = p.x; z.y = p.y;
  } else {
    z.spot = next;
    z.x = spots[next].x; z.y = spots[next].y;
  }
  z.timer = KOTH.moveEvery;
  w.emit('zoneMove', { x: z.x, y: z.y });
}

const coins = {
  respawns: true,
  suddenDeath: false,
  defaultTarget: DEFAULT_TARGET.coins,
  init(w) { w.nextCoin = 0.5; },
  step(w, dt) {
    w.nextCoin -= dt;
    if (w.nextCoin <= 0) {
      w.nextCoin = COINS.every;
      if (w.coins.length < COINS.max) spawnCoin(w, w.rng.next() < COINS.bigChance ? 3 : 1);
    }
    for (let k = w.coins.length - 1; k >= 0; k--) {
      const c = w.coins[k];
      c.t += dt;
      if (c.t < 0.35) continue; // still bouncing in
      for (const b of w.blobs) {
        if (b.out || b.falling || b.z > 30) continue;
        const r = b.radius + 16;
        if ((b.x - c.x) ** 2 + (b.y - c.y) ** 2 > r * r) continue;
        b.score += c.value;
        b.stats.coins += c.value;
        w.coins.splice(k, 1);
        w.emit('coin', { i: b.i, value: c.value, x: c.x, y: c.y, score: b.score });
        break;
      }
    }
    // Coins on ground that vanished (cracked tiles, lava) are lost.
    for (let k = w.coins.length - 1; k >= 0; k--) {
      const c = w.coins[k];
      if (!safeAt(w.arena, c.x, c.y, 0)) w.coins.splice(k, 1);
    }
  },
  onOut(w, b) {
    const lost = Math.min(Math.floor(b.score), COINS.lose);
    if (!lost) return;
    b.score -= lost;
    for (let k = 0; k < lost; k++) spawnCoin(w, 1);
    w.emit('spill', { i: b.i, lost });
  },
  finished: timedFinish,
};

function spawnCoin(w, value) {
  const p = randomFloorPoint(w.arena, w.rng, 45);
  w.coins.push({ x: p.x, y: p.y, value, t: 0, spin: w.rng.next() * 6 });
}

export const MODE_RULES = { lbs, koth, coins };
