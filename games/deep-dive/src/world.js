// The DOM-free simulation: Bubbles' physics, oxygen, sonar, scanning,
// creature behaviours, gates and pickups. Rendering only reads this.
import { AREAS, UPGRADE_ORDER, hasAll } from './areas.js';
import { CELL, SURFACE_Y, WATER, areaAt, density, depthMeters, gateRect, kindAt } from './map.js';
import { currentAt } from './gating.js';
import { SPECIES, placeCreatures } from './creatures.js';
import { mulberry32 } from './rng.js';

export const SUB_R = 16;
export const THRUST = 720;
export const DRAG = 2.6;
export const MAX_SPEED = 240;
export const TURBO_SPEED = 320;
export const CURRENT_FORCE = 900;
export const TURBO_CURRENT_THRUST = 1500;
export const OXYGEN_BASE = 100;
export const OXYGEN_DRAIN = 0.55; // per second, about three minutes a tank
export const SURFACE_REFILL = 30;
export const BUMP_SPEED = 80;
export const SONAR_R = 470;
export const SONAR_SPEED = 760;
export const SONAR_COOLDOWN = 1.3;
export const SCAN_R = 150;
export const SCAN_TIME = 1.1;
export const SHY_SPEED = 140;
export const SHY_R = 210;
export const REVEAL_R = 5; // cells around the sub, always
export const DOCK_R = 72;
export const PICKUP_R = 46;
export const ACTIVE_R = 1500; // creatures farther away rest

const HINT_GAP = 2.4;

function diskOffsets(r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) out.push([dx, dy]);
  return out;
}
const NEAR_DISK = diskOffsets(REVEAL_R);

export function oxygenMax(shellCount) {
  return OXYGEN_BASE + 25 * Math.floor(shellCount / 4);
}

export class World {
  // state: { upgrades, opened, scanned, treasures, shells, heart, lastDock, revealed }
  constructor(map, state = {}, { seed = 1 } = {}) {
    this.map = map;
    this.t = 0;
    this.events = [];
    this.rand = mulberry32(seed * 9301 + 49297);
    this.ups = new Set(state.upgrades || []);
    this.opened = new Set(state.opened || []);
    this.scanned = new Set(state.scanned || []);
    this.treasures = new Set(state.treasures || []);
    this.shells = new Set(state.shells || []);
    this.heart = !!state.heart;
    this.revealed = state.revealed instanceof Uint8Array && state.revealed.length === map.cols * map.rows ? state.revealed : new Uint8Array(map.cols * map.rows);
    this.revealedWater = 0;
    for (let i = 0; i < this.revealed.length; i++) if (this.revealed[i] && map.kind[i] === WATER) this.revealedWater++;
    this.wanted = new Set(); // species the daily dive still needs
    const dock = map.docks.find((d) => d.id === state.lastDock) || map.docks[0];
    this.lastDock = dock.id;
    this.sub = { x: 0, y: 0, vx: 0, vy: 0, face: 1, tilt: 0, thrust: 0, speed: 0 };
    this.placeAtDock(dock);
    this.oxygen = this.oxygenMax;
    this.status = 'play'; // play | out
    this.pings = [];
    this.sonarCool = 0;
    this.scan = { target: null, t: 0, cool: 0 };
    this.hintAt = {};
    this.bumpCool = 0;
    this.docked = dock.id;
    this.areaIndex = areaAt(map, Math.floor(this.sub.x / CELL), Math.floor(this.sub.y / CELL));
    this.visited = new Set(state.visited || [this.areaIndex]);
    this.revealTimer = 0;
    this.dive = this.freshDive();
    this.inCurrent = null;
    this.creatures = placeCreatures(map).map((c, i) => {
      const sp = SPECIES[c.species];
      return {
        ...c, id: i, sp, vx: 0, vy: 0, face: this.rand() < 0.5 ? -1 : 1, phase: this.rand() * Math.PI * 2,
        tx: c.x, ty: c.y, retarget: this.rand() * 3, revealUntil: 0, scared: 0,
        speed: Math.max(24, Math.min(95, 30 + sp.size * 0.5)), slot: i,
      };
    });
    this.groups = new Map();
    for (const c of this.creatures) {
      if (c.sp.beh !== 'school') continue;
      if (!this.groups.has(c.species)) this.groups.set(c.species, { x: c.homeX, y: c.homeY, tx: c.homeX, ty: c.homeY, homeX: c.homeX, homeY: c.homeY, retarget: 0, members: [] });
      const g = this.groups.get(c.species);
      c.slot = g.members.length;
      g.members.push(c);
    }
    this.revealAround(true);
  }

  get oxygenMax() { return oxygenMax(this.shells.size); }
  get depth() { return depthMeters(this.sub.y); }
  get area() { return AREAS[this.areaIndex]; }
  get completion() { return this.revealedWater / this.map.waterCells; }

  freshDive() { return { time: 0, scans: 0, treasures: 0, maxDepth: 0, shells: 0 }; }

  placeAtDock(dock) {
    this.sub.x = dock.x * CELL + CELL / 2;
    this.sub.y = Math.max(SURFACE_Y + 20, dock.y * CELL + CELL / 2 + 6);
    this.sub.vx = 0;
    this.sub.vy = 0;
    this.sub.face = 1;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  hint(reason) {
    if ((this.hintAt[reason] ?? -99) + HINT_GAP > this.t) return;
    this.hintAt[reason] = this.t;
    this.emit('hint', { reason });
  }

  // Back to the last dock after running out of air. Nothing is lost.
  returnToDock() {
    const dock = this.map.docks.find((d) => d.id === this.lastDock) || this.map.docks[0];
    this.placeAtDock(dock);
    this.oxygen = this.oxygenMax;
    this.status = 'play';
    this.docked = dock.id;
    this.pings.length = 0;
    this.scan.target = null;
    this.scan.t = 0;
    this.dive = this.freshDive();
    this.areaIndex = areaAt(this.map, Math.floor(this.sub.x / CELL), Math.floor(this.sub.y / CELL));
    this.emit('returned', { dock: dock.id });
  }

  cellBlockedForArea(cx, cy) {
    if (kindAt(this.map, cx, cy) !== WATER) return null;
    const a = this.map.area[cy * this.map.cols + cx];
    if (a < 0) return null;
    const needs = AREAS[a].needs;
    if (hasAll(this.ups, needs)) return null;
    return needs.find((n) => !this.ups.has(n));
  }

  // ---------------------------------------------------------------- step

  step(dt, controls = {}) {
    this.t += dt;
    if (this.status !== 'play') return;
    const s = this.sub;
    const map = this.map;
    this.dive.time += dt;

    // Steering: an axis (keys, stick) or a point to swim toward (mouse, touch).
    let ax = controls.ax || 0, ay = controls.ay || 0;
    if (controls.target) {
      const dx = controls.target.x - s.x, dy = controls.target.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 12) {
        const k = Math.min(1, (d - 12) / 140);
        ax = (dx / d) * k;
        ay = (dy / d) * k;
      }
    }
    const mag = Math.hypot(ax, ay);
    if (mag > 1) { ax /= mag; ay /= mag; }
    s.thrust = Math.min(1, mag);

    const cx = Math.floor(s.x / CELL), cy = Math.floor(s.y / CELL);
    const cur = currentAt(map, cx, cy);
    this.inCurrent = cur;
    const turbo = this.ups.has('turbo');
    const thrust = cur && turbo ? TURBO_CURRENT_THRUST : THRUST;
    s.vx += ax * thrust * dt;
    s.vy += ay * thrust * dt;
    if (cur) {
      s.vx += cur.dx * CURRENT_FORCE * dt;
      s.vy += cur.dy * CURRENT_FORCE * dt;
      if (!turbo) this.hint('turbo');
    }
    const drag = Math.exp(-DRAG * dt);
    s.vx *= drag;
    s.vy *= drag;
    const cap = turbo ? TURBO_SPEED : MAX_SPEED;
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > cap && !cur) { s.vx *= cap / sp; s.vy *= cap / sp; }
    if (Math.abs(ax) > 0.15) s.face = ax > 0 ? 1 : -1;
    s.tilt += ((Math.max(-1, Math.min(1, s.vy / 260)) * 0.35) - s.tilt) * Math.min(1, dt * 6);

    // Move in small substeps so fast frames never tunnel through walls.
    const px = s.x, py = s.y;
    const steps = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy) * dt) / 8));
    for (let i = 0; i < steps; i++) {
      s.x += (s.vx * dt) / steps;
      s.y += (s.vy * dt) / steps;
      this.collideTerrain();
      this.collideGates();
    }
    if (s.y < SURFACE_Y + 14) { s.y = SURFACE_Y + 14; if (s.vy < 0) s.vy *= 0.2; }
    s.speed = Math.hypot(s.vx, s.vy);

    // Areas Bubbles is not ready for push back gently, with a hint.
    const ncx = Math.floor(s.x / CELL), ncy = Math.floor(s.y / CELL);
    const why = this.cellBlockedForArea(ncx, ncy);
    if (why) {
      s.x = px; s.y = py;
      s.vx *= -0.4; s.vy *= -0.4;
      this.hint(why);
    }
    this.bumpCool -= dt;

    // Area changes (music, banners).
    const a = areaAt(map, Math.floor(s.x / CELL), Math.floor(s.y / CELL));
    if (a !== this.areaIndex) {
      this.areaIndex = a;
      const first = !this.visited.has(a);
      this.visited.add(a);
      this.emit('area', { area: a, first });
    }

    // Oxygen: slow drain, refill at the surface and at docks.
    const atSurface = s.y < SURFACE_Y + 44;
    if (atSurface) this.oxygen = Math.min(this.oxygenMax, this.oxygen + SURFACE_REFILL * dt);
    else this.oxygen -= OXYGEN_DRAIN * dt;
    let near = null;
    for (const d of map.docks) {
      const dx = d.x * CELL + CELL / 2 - s.x, dy = d.y * CELL + CELL / 2 - s.y;
      if (dx * dx + dy * dy < DOCK_R * DOCK_R) { near = d; break; }
    }
    if (near) {
      this.oxygen = this.oxygenMax;
      if (this.docked !== near.id) {
        this.docked = near.id;
        this.lastDock = near.id;
        this.emit('dock', { dock: near.id, dive: { ...this.dive } });
        this.dive = this.freshDive();
      }
    } else if (this.docked && !atSurface) {
      this.docked = null;
    }
    this.dive.maxDepth = Math.max(this.dive.maxDepth, this.depth);
    if (this.oxygen <= 0) {
      this.oxygen = 0;
      this.status = 'out';
      this.emit('oxygen.out', { dock: this.lastDock, dive: { ...this.dive } });
      return;
    }

    // Sonar pings grow outward, revealing the map and hidden creatures.
    this.sonarCool -= dt;
    if (controls.sonar && this.sonarCool <= 0) {
      this.sonarCool = SONAR_COOLDOWN;
      this.pings.push({ x: s.x, y: s.y, r: 0 });
      this.emit('sonar');
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      const r0 = p.r;
      p.r += SONAR_SPEED * dt;
      this.revealRing(p.x, p.y, r0, Math.min(p.r, SONAR_R));
      for (const c of this.creatures) {
        if (c.sp.beh !== 'hide') continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d >= r0 && d < p.r && d < SONAR_R) {
          if (c.revealUntil < this.t) this.emit('reveal', { species: c.species, x: c.x, y: c.y });
          c.revealUntil = this.t + 10;
        }
      }
      if (p.r > SONAR_R) this.pings.splice(i, 1);
    }
    this.revealTimer -= dt;
    if (this.revealTimer <= 0) { this.revealTimer = 0.15; this.revealAround(); }

    this.updateCreatures(dt);
    this.updateScan(dt);
    this.pickups();
  }

  collideTerrain() {
    const s = this.sub, map = this.map;
    for (let iter = 0; iter < 6; iter++) {
      let nx = 0, ny = 0, hits = 0;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const ox = Math.cos(ang), oy = Math.sin(ang);
        if (density(map, s.x + ox * SUB_R, s.y + oy * SUB_R) > 0.5) { nx -= ox; ny -= oy; hits++; }
      }
      if (!hits) return;
      const len = Math.hypot(nx, ny);
      if (len < 1e-6) { nx = -s.vx; ny = -s.vy; } // wedged: back out
      const l2 = Math.hypot(nx, ny) || 1;
      nx /= l2; ny /= l2;
      s.x += nx * 2;
      s.y += ny * 2;
      if (iter === 0) this.bounce(nx, ny);
    }
  }

  bounce(nx, ny) {
    const s = this.sub;
    const vn = s.vx * nx + s.vy * ny;
    if (vn >= 0) return;
    s.vx -= 1.35 * vn * nx;
    s.vy -= 1.35 * vn * ny;
    if (-vn > BUMP_SPEED && this.bumpCool <= 0) {
      this.bumpCool = 0.45;
      const cost = Math.min(5, 1 + (-vn) / 80);
      this.oxygen -= cost;
      this.emit('bump', { x: s.x - nx * SUB_R, y: s.y - ny * SUB_R, power: Math.min(1, -vn / 300), cost });
    }
  }

  collideGates() {
    const s = this.sub;
    for (const g of this.map.gates) {
      if (this.opened.has(g.id)) continue;
      const r = gateRect(g);
      const qx = Math.max(r.x, Math.min(s.x, r.x + r.w));
      const qy = Math.max(r.y, Math.min(s.y, r.y + r.h));
      let dx = s.x - qx, dy = s.y - qy;
      const d = Math.hypot(dx, dy);
      if (d >= SUB_R) continue;
      if (this.ups.has(g.needs)) {
        this.opened.add(g.id);
        this.emit('gate', { id: g.id, kind: g.kind, x: r.x + r.w / 2, y: r.y + r.h / 2 });
        continue;
      }
      if (d < 1e-6) { dx = s.x - (r.x + r.w / 2); dy = s.y - (r.y + r.h / 2); }
      const l = Math.hypot(dx, dy) || 1;
      const nx = dx / l, ny = dy / l;
      s.x = qx + nx * SUB_R;
      s.y = qy + ny * SUB_R;
      this.bounce(nx, ny);
      this.hint(g.needs);
    }
  }

  // ---------------------------------------------------------------- reveal

  revealCell(x, y) {
    if (x < 0 || y < 0 || x >= this.map.cols || y >= this.map.rows) return;
    const i = y * this.map.cols + x;
    if (this.revealed[i]) return;
    this.revealed[i] = 1;
    if (this.map.kind[i] === WATER) this.revealedWater++;
  }

  revealAround() {
    const cx = Math.floor(this.sub.x / CELL), cy = Math.floor(this.sub.y / CELL);
    for (const [dx, dy] of NEAR_DISK) this.revealCell(cx + dx, cy + dy);
  }

  revealRing(px, py, r0, r1) {
    if (r1 <= r0) return;
    const c0 = Math.floor((px - r1) / CELL), c1 = Math.floor((px + r1) / CELL);
    const d0 = Math.floor((py - r1) / CELL), d1 = Math.floor((py + r1) / CELL);
    const lo = Math.max(0, r0 - CELL) ** 2, hi = r1 * r1;
    for (let y = d0; y <= d1; y++) {
      for (let x = c0; x <= c1; x++) {
        const dx = x * CELL + CELL / 2 - px, dy = y * CELL + CELL / 2 - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= lo && d2 <= hi) this.revealCell(x, y);
      }
    }
  }

  // ---------------------------------------------------------------- creatures

  visible(c) {
    return c.sp.beh !== 'hide' || c.revealUntil > this.t;
  }

  freeAt(x, y) {
    return density(this.map, x, y) < 0.3;
  }

  updateCreatures(dt) {
    const s = this.sub;
    const t = this.t;
    for (const g of this.groups.values()) {
      if (Math.abs(g.x - s.x) > ACTIVE_R || Math.abs(g.y - s.y) > ACTIVE_R) continue;
      g.retarget -= dt;
      if (g.retarget <= 0 || Math.hypot(g.tx - g.x, g.ty - g.y) < 20) {
        g.retarget = 3 + this.rand() * 4;
        for (let k = 0; k < 6; k++) {
          const ang = this.rand() * Math.PI * 2, r = 40 + this.rand() * 170;
          const tx = g.homeX + Math.cos(ang) * r, ty = g.homeY + Math.sin(ang) * r * 0.6;
          if (this.freeAt(tx, ty)) { g.tx = tx; g.ty = ty; break; }
        }
      }
      const dx = g.tx - g.x, dy = g.ty - g.y, d = Math.hypot(dx, dy) || 1;
      g.x += (dx / d) * 55 * dt;
      g.y += (dy / d) * 55 * dt;
      // Scatter a little when Bubbles zooms through.
      const sd = Math.hypot(g.x - s.x, g.y - s.y);
      if (sd < 120 && s.speed > 150) { g.tx = g.x + (g.x - s.x) * 1.4; g.ty = g.y + (g.y - s.y) * 1.4; if (!this.freeAt(g.tx, g.ty)) { g.tx = g.homeX; g.ty = g.homeY; } }
    }

    for (const c of this.creatures) {
      if (Math.abs(c.x - s.x) > ACTIVE_R || Math.abs(c.y - s.y) > ACTIVE_R) continue;
      c.phase += dt * (1.5 + c.speed / 40);
      const beh = c.sp.beh;
      const dsub = Math.hypot(c.x - s.x, c.y - s.y);
      let speed = c.speed;
      if (c.scared > 0) c.scared -= dt;

      if (beh === 'still') {
        c.tx = c.homeX; c.ty = c.homeY;
        speed = 10;
      } else if (beh === 'school') {
        const g = this.groups.get(c.species);
        const n = g.members.length;
        const ang = (c.slot / n) * Math.PI * 2 + t * 0.35;
        const ring = 18 + (c.slot % 3) * 14;
        c.tx = g.x + Math.cos(ang) * ring;
        c.ty = g.y + Math.sin(ang) * ring * 0.55;
        speed = 85;
      } else if (beh === 'drift') {
        c.tx = c.homeX + Math.sin(t * 0.13 + c.id) * 70;
        c.ty = c.homeY + Math.sin(t * 0.5 + c.id * 2) * 50;
        speed = 22;
      } else if (beh === 'curious' && dsub < 520 && dsub > 0) {
        const ang = t * 0.7 + c.id;
        c.tx = s.x + Math.cos(ang) * 120;
        c.ty = s.y + Math.sin(ang) * 70;
        speed = Math.min(160, c.speed * 1.6);
        if (!this.freeAt(c.tx, c.ty)) { c.tx = s.x - s.face * 110; c.ty = s.y; }
      } else if (beh === 'shy' && dsub < SHY_R && s.speed > SHY_SPEED) {
        if (c.scared <= 0) this.emit('startle', { species: c.species, x: c.x, y: c.y });
        c.scared = 2.2;
        const l = dsub || 1;
        c.tx = c.x + ((c.x - s.x) / l) * 160;
        c.ty = c.y + ((c.y - s.y) / l) * 160;
        if (!this.freeAt(c.tx, c.ty)) { c.tx = c.homeX; c.ty = c.homeY; }
        speed = c.speed * 2.6;
      } else {
        // wander / hide / calm shy / far curious: drift between nearby spots.
        c.retarget -= dt;
        if (c.retarget <= 0 || Math.hypot(c.tx - c.x, c.ty - c.y) < 12) {
          c.retarget = 3 + this.rand() * 5;
          const range = beh === 'hide' ? 50 : beh === 'shy' ? 90 : 170;
          for (let k = 0; k < 6; k++) {
            const ang = this.rand() * Math.PI * 2, r = this.rand() * range;
            const tx = c.homeX + Math.cos(ang) * r, ty = c.homeY + Math.sin(ang) * r * 0.5;
            if (this.freeAt(tx, ty)) { c.tx = tx; c.ty = ty; break; }
          }
        }
        if (beh === 'hide') speed = 18;
        else if (beh === 'shy') speed = c.speed * 0.6;
      }

      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      const want = d > 2 ? Math.min(speed, d * 2.5) : 0;
      const wx = d > 0 ? (dx / d) * want : 0, wy = d > 0 ? (dy / d) * want : 0;
      const k = Math.min(1, dt * 3);
      c.vx += (wx - c.vx) * k;
      c.vy += (wy - c.vy) * k;
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
      if (beh === 'still' || this.freeAt(nx, ny)) { c.x = nx; c.y = ny; }
      else { c.vx *= -0.5; c.vy *= -0.5; c.retarget = 0; c.tx = c.homeX; c.ty = c.homeY; }
      if (Math.abs(c.vx) > 6) c.face = c.vx > 0 ? 1 : -1;
    }
  }

  // Scanning: hover near a visible, calm creature; a ring fills up.
  scanCandidate() {
    const s = this.sub;
    let best = null, bestD = SCAN_R;
    for (const c of this.creatures) {
      if (Math.abs(c.x - s.x) > SCAN_R + 120 || Math.abs(c.y - s.y) > SCAN_R + 120) continue;
      if (!this.visible(c) || c.scared > 0) continue;
      if (this.scanned.has(c.sp.id) && !this.wanted.has(c.sp.id)) continue;
      const d = Math.hypot(c.x - s.x, c.y - s.y) - c.sp.size * 0.35;
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  updateScan(dt) {
    const sc = this.scan;
    sc.cool -= dt;
    if (sc.cool > 0) return;
    const s = this.sub;
    let c = sc.target;
    if (c) {
      const d = Math.hypot(c.x - s.x, c.y - s.y) - c.sp.size * 0.35;
      if (d > SCAN_R + 30 || !this.visible(c) || c.scared > 0 || (this.scanned.has(c.sp.id) && !this.wanted.has(c.sp.id))) c = null;
    }
    if (!c) c = this.scanCandidate();
    if (c !== sc.target) { sc.target = c; sc.t = 0; }
    if (!c) return;
    sc.t += dt;
    if (sc.t >= SCAN_TIME) {
      const first = !this.scanned.has(c.sp.id);
      this.scanned.add(c.sp.id);
      const daily = this.wanted.delete(c.sp.id);
      this.dive.scans += first ? 1 : 0;
      this.emit('scan', { species: c.species, id: c.sp.id, first, daily, x: c.x, y: c.y });
      sc.target = null;
      sc.t = 0;
      sc.cool = 0.4;
    }
  }

  // ---------------------------------------------------------------- pickups

  pickups() {
    const s = this.sub, map = this.map;
    const near = (o, r) => {
      const dx = o.x * CELL + CELL / 2 - s.x, dy = o.y * CELL + CELL / 2 - s.y;
      return dx * dx + dy * dy < r * r;
    };
    for (const p of map.parts) {
      if (!this.ups.has(p.id) && near(p, PICKUP_R + 8)) {
        this.ups.add(p.id);
        this.emit('part', { id: p.id, index: UPGRADE_ORDER.indexOf(p.id), x: p.x * CELL + CELL / 2, y: p.y * CELL + CELL / 2 });
      }
    }
    for (const tr of map.treasures) {
      if (!this.treasures.has(tr.id) && near(tr, PICKUP_R)) {
        this.treasures.add(tr.id);
        this.dive.treasures++;
        this.emit('treasure', { id: tr.id, name: tr.name, x: tr.x * CELL + CELL / 2, y: tr.y * CELL + CELL / 2 });
      }
    }
    for (const sh of map.shells) {
      if (!this.shells.has(sh.id) && near(sh, PICKUP_R)) {
        const before = this.oxygenMax;
        this.shells.add(sh.id);
        this.dive.shells++;
        if (this.oxygenMax > before) this.oxygen = this.oxygenMax;
        this.emit('shell', { id: sh.id, tank: this.oxygenMax > before, x: sh.x * CELL + CELL / 2, y: sh.y * CELL + CELL / 2 });
      }
    }
    if (!this.heart && near(map.heart, PICKUP_R + 14)) {
      this.heart = true;
      this.emit('heart', { x: map.heart.x * CELL + CELL / 2, y: map.heart.y * CELL + CELL / 2 });
    }
  }

  // What the save keeps.
  snapshot() {
    return {
      upgrades: UPGRADE_ORDER.filter((u) => this.ups.has(u)),
      opened: [...this.opened],
      scanned: [...this.scanned],
      treasures: [...this.treasures],
      shells: [...this.shells],
      heart: this.heart,
      lastDock: this.lastDock,
      visited: [...this.visited],
      revealed: this.revealed,
    };
  }
}
