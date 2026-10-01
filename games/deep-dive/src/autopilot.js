// A route-following pilot for ?autopilot, the title-screen demo and tests.
// It plans over the gating graph and steers with the same controls a player
// uses, so a test that completes the parts proves the real physics can.
import { UPGRADE_ORDER } from './areas.js';
import { CELL, density } from './map.js';
import { findPath, isClear, blockReason, reachAtStage } from './gating.js';

const REPLAN = 1.6;

export class Autopilot {
  constructor({ mode = 'parts', cruise = 1 } = {}) {
    this.mode = mode; // parts: parts then the heart | explore: also creatures, treasure, shells
    this.cruise = cruise;
    this.goal = null;
    this.path = null;
    this.idx = 0;
    this.timer = 0;
    this.sonarTimer = 2;
    this.stuck = 0;
    this.lastPos = null;
    this.skip = new Set();
  }

  pickGoal(world) {
    const map = world.map;
    const next = UPGRADE_ORDER.find((u) => !world.ups.has(u));
    const cellOf = (o) => ({ x: o.x, y: o.y });
    if (this.mode === 'explore') {
      const s = world.sub;
      if (this.stage !== world.ups.size) { this.stage = world.ups.size; this.skip.clear(); }
      const reach = reachAtStage(map, world.ups.size);
      let best = null, bestD = Infinity;
      const consider = (key, cell, kind, ref) => {
        if (this.skip.has(key)) return;
        const r = this.roomy(world, cell);
        if (!reach[r.y * map.cols + r.x]) return;
        const d = Math.hypot(cell.x * CELL - s.x, cell.y * CELL - s.y);
        if (d < bestD && d < 1400) { best = { key, cell, kind, ref }; bestD = d; }
      };
      for (const t of map.treasures) if (!world.treasures.has(t.id)) consider(t.id, cellOf(t), 'item');
      for (const sh of map.shells) if (!world.shells.has(sh.id)) consider(sh.id, cellOf(sh), 'item');
      for (const c of world.creatures) {
        if (world.scanned.has(c.sp.id) && !world.wanted.has(c.sp.id)) continue;
        consider(`c${c.id}`, { x: Math.floor(c.x / CELL), y: Math.floor(c.y / CELL) }, 'creature', c);
      }
      if (best) return best;
    }
    if (next) {
      const p = map.parts.find((q) => q.id === next);
      return { key: next, cell: cellOf(p), kind: 'item' };
    }
    if (!world.heart) return { key: 'heart', cell: cellOf(map.heart), kind: 'item' };
    return null;
  }

  // Nearest roomy cell to a target, so creatures by walls still get a route.
  roomy(world, cell) {
    const map = world.map;
    for (let r = 0; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cell.x + dx, y = cell.y + dy;
          if (isClear(map, x, y) && !blockReason(map, x, y, world.ups, world.opened)) return { x, y };
        }
      }
    }
    return cell;
  }

  plan(world) {
    const s = world.sub;
    const from = this.roomy(world, { x: Math.floor(s.x / CELL), y: Math.floor(s.y / CELL) });
    const to = this.roomy(world, this.goal.cell);
    this.path = findPath(world.map, world.ups, from, to, world.opened);
    this.idx = 0;
    if (!this.path) { this.skip.add(this.goal.key); this.goal = null; }
  }

  sightClear(map, x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(d / 10);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (density(map, x, y) > 0.32) return false;
      // Keep the hull clear too, not just the centre line.
      if (density(map, x, y - 14) > 0.45 || density(map, x, y + 14) > 0.45 || density(map, x - 14, y) > 0.45 || density(map, x + 14, y) > 0.45) return false;
    }
    return true;
  }

  controls(world, dt) {
    const s = world.sub;
    this.timer -= dt;
    this.sonarTimer -= dt;
    // Stuck detection: if barely moving for a while, replan from here.
    if (!this.lastPos) this.lastPos = { x: s.x, y: s.y, t: 0 };
    this.lastPos.t += dt;
    if (this.lastPos.t > 3) {
      const moved = Math.hypot(s.x - this.lastPos.x, s.y - this.lastPos.y);
      this.stuck = moved < 30 ? this.stuck + 1 : 0;
      this.lastPos = { x: s.x, y: s.y, t: 0 };
      if (this.stuck > 0) this.timer = 0;
      if (this.stuck > 3 && this.goal) { this.skip.add(this.goal.key); this.goal = null; this.stuck = 0; }
    }

    const fresh = this.pickGoal(world);
    if (!fresh) return { ax: 0, ay: 0, sonar: false };
    if (!this.goal || fresh.key !== this.goal.key) { this.goal = fresh; this.timer = 0; }
    else this.goal.cell = fresh.cell;
    if (this.timer <= 0 || !this.path) { this.timer = REPLAN; this.plan(world); }
    if (!this.path) return { ax: 0, ay: 0, sonar: false };

    const map = world.map;
    // Skip ahead along the path to the furthest node in clear sight.
    while (this.idx < this.path.length - 1) {
      const p = this.path[this.idx];
      if (Math.hypot(p.x * CELL + CELL / 2 - s.x, p.y * CELL + CELL / 2 - s.y) < 26) this.idx++;
      else break;
    }
    let aim = this.idx;
    for (let j = Math.min(this.path.length - 1, this.idx + 8); j > this.idx; j--) {
      const q = this.path[j];
      if (this.sightClear(map, s.x, s.y, q.x * CELL + CELL / 2, q.y * CELL + CELL / 2)) { aim = j; break; }
    }
    const node = this.path[aim];
    let tx = node.x * CELL + CELL / 2, ty = node.y * CELL + CELL / 2;
    const end = this.path[this.path.length - 1];
    const endD = Math.hypot(end.x * CELL + CELL / 2 - s.x, end.y * CELL + CELL / 2 - s.y);

    let gain = this.cruise;
    let sonar = false;
    if (this.goal.kind === 'creature') {
      const c = this.goal.ref;
      const d = Math.hypot(c.x - s.x, c.y - s.y);
      if (d < 120) { tx = s.x; ty = s.y; gain = 0; }
      else if (d < 330) gain = Math.min(gain, 0.32);
      if (c.sp.beh === 'hide' && !world.visible(c) && d < 400 && this.sonarTimer <= 0) { sonar = true; this.sonarTimer = 2; }
    } else if (endD < 140) {
      tx = this.goal.cell.x * CELL + CELL / 2;
      ty = this.goal.cell.y * CELL + CELL / 2;
      gain = Math.min(gain, 0.6);
    }
    if (this.sonarTimer <= 0) { sonar = true; this.sonarTimer = 5; }
    const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy) || 1;
    // Brake when the next turn is sharp, so the sub doesn't overshoot corners.
    const vx = s.vx, vy = s.vy;
    const along = (vx * dx + vy * dy) / d;
    let ax = (dx / d) * gain, ay = (dy / d) * gain;
    if (s.speed > 160 && along < s.speed * 0.6) { ax -= (vx / s.speed) * 0.5; ay -= (vy / s.speed) * 0.5; }
    return { ax, ay, sonar };
  }
}
