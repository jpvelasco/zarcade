// Autopilot: plays a run from the world state alone. It powers the title
// screen's attract run and ?autopilot, and the tests use it to prove tracks
// can be cleared. DOM-free.
import { PLAYER, OBSTACLES } from './config.js';
import { LANE_LIST } from './track.js';

const HORIZON_S = 1.7; // seconds of track it looks ahead

export class Autopilot {
  constructor() {
    this.cooldown = 0;
  }

  controls(world, dt = 1 / 60) {
    const out = { left: false, right: false, jump: false, roll: false };
    if (world.status !== 'running') return out;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = world.p;
    const v = Math.max(1, world.speed);
    const d = world.d;
    const horizon = v * HORIZON_S;
    const items = world.track.items;

    // Distance ahead to the first full block in each lane.
    const block = [Infinity, Infinity, Infinity];
    for (const it of items) {
      if (it.gone || it.bumped) continue;
      if (!OBSTACLES[it.kind].full) continue;
      const end = it.z + it.len;
      if (end < d - PLAYER.halfLen - 0.2) continue;
      const dz = Math.max(0, it.z - d - PLAYER.halfLen);
      if (dz > horizon) continue;
      if (dz < block[it.lane + 1]) block[it.lane + 1] = dz;
    }
    const flying = p.gliding > 0 || p.landing;
    if (flying) block.fill(Infinity);

    // Amber in each lane before its first block.
    const coins = [0, 0, 0];
    for (const c of world.track.coins) {
      if (c.taken) continue;
      const dz = c.z - d;
      if (dz < 0) continue;
      if (dz > horizon) break;
      const l = Math.round(c.lane);
      if (dz < block[l + 1]) coins[l + 1] += flying || c.y < 3 ? 1 : 0;
    }
    for (const pw of world.track.powers) {
      if (pw.taken) continue;
      const dz = pw.z - d;
      if (dz < 0 || dz > horizon) continue;
      if (dz < block[pw.lane + 1]) coins[pw.lane + 1] += 6;
    }

    // Logs and pterodactyls close ahead make a lane change risky too: we
    // might arrive mid-jump under a pterodactyl or beside a log.
    const soft = [Infinity, Infinity, Infinity];
    for (const it of items) {
      if (it.gone || it.bumped || OBSTACLES[it.kind].full) continue;
      if (it.z + it.len < d - PLAYER.halfLen - 0.2) continue;
      const dz = Math.max(0, it.z - d - PLAYER.halfLen);
      if (dz < soft[it.lane + 1]) soft[it.lane + 1] = dz;
    }

    // Can we get from the current lane to `l` without clipping a block on
    // the way? Each lane crossed must be clear for the time it takes.
    const here = p.lane;
    const reachable = (l) => {
      const step = l > here ? 1 : -1;
      for (let k = here + step, n = 1; step > 0 ? k <= l : k >= l; k += step, n++) {
        const need = v * (PLAYER.laneTime * n + 0.12) + 0.8;
        if (block[k + 1] < need) return false;
        // A log or pterodactyl only matters if we'd arrive beside it, or
        // mid-air (a jump carries us into a pterodactyl).
        if (!flying && soft[k + 1] < (p.air ? need : 1.2)) return false;
      }
      return true;
    };

    let best = here;
    let bestScore = -Infinity;
    for (const l of LANE_LIST) {
      if (l !== here && !reachable(l)) continue;
      const room = Math.min(block[l + 1], horizon);
      let score = room * 3 + coins[l + 1] * 2 - Math.abs(l - here) * 1.5;
      if (l === here) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = l;
      }
    }
    if (best !== here && p.laneT >= 0.7 && this.cooldown === 0) {
      if (best < here) out.left = true;
      else out.right = true;
      this.cooldown = 0.05;
    }
    if (flying) return out;

    // Jump logs and roll under pterodactyls in the lane(s) we overlap.
    let nextLog = Infinity;
    let nextPtero = Infinity;
    for (const it of items) {
      if (it.gone || it.bumped) continue;
      if (it.kind !== 'log' && it.kind !== 'ptero') continue;
      if (Math.abs(it.lane - p.x) >= PLAYER.laneReach + 0.15 && it.lane !== p.lane) continue;
      const end = it.z + it.len;
      if (end < d - PLAYER.halfLen) continue;
      const t = (it.z - d - PLAYER.halfLen) / v;
      if (t > 1) continue;
      if (it.kind === 'log') nextLog = Math.min(nextLog, t);
      else nextPtero = Math.min(nextPtero, t);
    }
    const overLog = p.air && nextLog < 0.35;
    if (nextPtero < 0.26 && p.rolling <= 0.1 && !overLog) out.roll = true;
    else if (nextLog < 0.17 && !p.air) out.jump = true;
    return out;
  }
}
