// The mine simulation: pod physics, drilling, hazards. DOM-free and
// deterministic for a given sequence of controls.
//
// Units are tiles and seconds. +y points down; row 0 is the meadow surface,
// negative rows are sky. The pod is a 0.8 x 0.8 box centred on (x, y).
import { T, LAYERS, PHYS, ORES } from './data.js';

const EPS = 1e-4;
const HW = PHYS.podW / 2, HH = PHYS.podH / 2;
const SKY_TOP = -14;

export const isOre = (c) => c >= T.ORE0 && c < T.ORE0 + ORES.length;
export const isRelic = (c) => c >= T.RELIC0 && c < T.RELIC0 + 24;

export class Mine {
  // world: generated world (tiles are used as-is; pass a copy to keep the
  // original). stats: pod stats from upgrades. pod: optional saved pod.
  constructor(world, stats, pod = null) {
    this.world = world;
    this.w = world.w;
    this.h = world.h;
    this.tiles = world.tiles;
    this.stats = stats;
    this.base = { x0: world.cfg.baseX0, x1: world.cfg.baseX1 };
    this.events = [];
    this.changed = [];
    this.boulders = [];
    this.time = 0;
    this.pod = {
      x: world.cfg.startX + 0.5, y: -HH - EPS, vx: 0, vy: 0, facing: 1,
      fuel: stats.tank, hull: stats.hull, cargo: [], relics: [], acorn: false, core: false,
      drill: null, grounded: true, flying: false, docked: true, stranded: null,
      depth: 0, maxDepth: 0, hitT: 0, blockT: 0, hotT: 0, landT: 0,
    };
    if (pod) Object.assign(this.pod, pod, { drill: null, flying: false, stranded: null });
    this.pod.fuel = Math.min(this.pod.fuel, stats.tank);
    this.pod.hull = Math.min(this.pod.hull, stats.hull);
  }

  // ------------------------------------------------------------ tiles

  tile(x, y) {
    if (x < 0 || x >= this.w || y >= this.h) return T.BEDROCK;
    if (y < 0) return y < SKY_TOP ? T.BEDROCK : T.EMPTY;
    return this.tiles[y * this.w + x];
  }

  solid(x, y) { return this.tile(x, y) !== T.EMPTY; }

  setTile(x, y, code) {
    const i = y * this.w + x;
    if (this.tiles[i] === code) return;
    this.tiles[i] = code;
    this.changed.push(i);
  }

  layerAt(y) { return LAYERS[this.world.layerOf[Math.max(0, Math.min(this.h - 1, y))]]; }

  // Hardness of a tile, or Infinity when no drill can dig it.
  hardness(code, y) {
    if (code === T.EMPTY) return 0;
    if (code === T.BEDROCK || code === T.PAD) return Infinity;
    if (code === T.COOLED) return 3;
    if (code === T.BRICK || code === T.CORE) return 6;
    return this.layerAt(y).hard;
  }

  // Can the pod dig (x, y) right now? { ok, reason, time }
  digInfo(x, y, stats = this.stats) {
    const code = this.tile(x, y);
    if (code === T.EMPTY) return { ok: false, reason: 'empty' };
    if (code === T.LAVA && !stats.fan) return { ok: false, reason: 'hot' };
    const hard = code === T.LAVA ? 3 : this.hardness(code, y);
    if (hard === Infinity) return { ok: false, reason: 'bedrock' };
    if (hard > stats.power) return { ok: false, reason: 'hard', hard };
    return { ok: true, hard, time: digTime(hard, stats.power) };
  }

  // ------------------------------------------------------------ collision

  overlaps(x, y, hw = HW, hh = HH) {
    const x0 = Math.floor(x - hw + EPS), x1 = Math.floor(x + hw - EPS);
    const y0 = Math.floor(y - hh + EPS), y1 = Math.floor(y + hh - EPS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solid(tx, ty)) return true;
    return false;
  }

  touching(code, x, y, pad = 0.06) {
    const x0 = Math.floor(x - HW - pad), x1 = Math.floor(x + HW + pad);
    const y0 = Math.floor(y - HH - pad), y1 = Math.floor(y + HH + pad);
    const out = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.tile(tx, ty) === code) out.push(tx, ty);
    return out;
  }

  atBase() {
    const p = this.pod;
    return p.y < 0 && p.grounded && p.x >= this.base.x0 && p.x <= this.base.x1 + 1;
  }

  // ------------------------------------------------------------ step

  // controls: { ax: -1..1, ay: -1..1 } (ay < 0 flies up, ay > 0 drills down)
  step(dt, ctl = { ax: 0, ay: 0 }) {
    const p = this.pod, s = this.stats;
    this.time += dt;
    p.hitT = Math.max(0, p.hitT - dt);
    p.blockT = Math.max(0, p.blockT - dt);
    p.hotT = Math.max(0, p.hotT - dt);
    p.landT = Math.max(0, p.landT - dt);
    const live = !p.stranded;
    const ax = live ? Math.max(-1, Math.min(1, ctl.ax || 0)) : 0;
    const ay = live ? Math.max(-1, Math.min(1, ctl.ay || 0)) : 0;
    const up = ay < -0.4, down = ay > 0.4;
    if (Math.abs(ax) > 0.3) p.facing = Math.sign(ax);
    let burn = 0;

    if (p.drill) {
      burn = PHYS.burnDrill;
      this.advanceDrill(dt);
    } else {
      if (live && p.grounded && down && Math.abs(ax) < 0.5) this.tryDig(Math.floor(p.x), Math.floor(p.y + HH + 0.02), 0, 1);
      else if (live && p.grounded && Math.abs(ax) > 0.5 && !up && this.overlaps(p.x + Math.sign(ax) * 0.04, p.y)) {
        const dir = Math.sign(ax);
        this.tryDig(Math.floor(p.x + dir * (HW + 0.04)), Math.floor(p.y), dir, 0);
      }
      if (!p.drill) {
        // Horizontal: ease toward the target speed.
        const speed = p.grounded ? PHYS.groundSpeed : PHYS.airSpeed;
        const accel = p.grounded ? PHYS.groundAccel : PHYS.airAccel;
        const target = ax * speed;
        const dv = target - p.vx;
        p.vx += Math.sign(dv) * Math.min(Math.abs(dv), accel * dt);
        // Vertical: gravity, propeller thrust.
        p.flying = up && p.fuel > 0;
        p.vy += PHYS.gravity * dt;
        if (p.flying) {
          p.vy -= (PHYS.gravity + s.flyAccel) * dt;
          if (p.vy < -s.fly) p.vy = -s.fly;
        }
        if (p.vy > PHYS.maxFall) p.vy = PHYS.maxFall;
        this.moveX(dt);
        this.moveY(dt, ax);
        if (p.flying) burn = s.flyBurn;
        else if (Math.abs(ax) > 0.1 && p.grounded) burn = PHYS.burnDrive;
      }
    }
    if (p.y > 0 && burn === 0) burn = PHYS.burnIdle;
    if (live) p.fuel = Math.max(0, p.fuel - burn * dt);

    this.hazards(dt);
    this.updateBoulders(dt);

    p.depth = Math.max(0, p.y + HH);
    if (p.depth > p.maxDepth) p.maxDepth = p.depth;

    // Docking at the base pad.
    if (this.atBase()) {
      if (!p.docked && !p.drill) { p.docked = true; this.events.push({ type: 'dock' }); }
    } else if (p.y > 0.2 || p.x > this.base.x1 + 1.6) {
      p.docked = false;
    }

    if (!p.stranded) {
      if (p.hull <= 0) this.strand('hull');
      else if (p.fuel <= 0 && !p.docked && !p.drill) this.strand('fuel');
    }
  }

  strand(reason) {
    const p = this.pod;
    p.stranded = reason;
    p.flying = false;
    this.events.push({ type: 'stranded', reason, x: p.x, y: p.y });
  }

  moveX(dt) {
    const p = this.pod;
    if (!p.vx) return;
    const ox = p.x, nx = p.x + p.vx * dt;
    if (!this.overlaps(nx, p.y)) { p.x = nx; return; }
    // Hovering beside a tunnel mouth: slide toward the row centre so the pod
    // slips in instead of catching on the corner.
    const col = p.vx > 0 ? Math.floor(nx + HW) : Math.floor(nx - HW);
    const row = Math.floor(p.y);
    if (!p.grounded && !this.solid(col, row)) {
      const cy = row + 0.5, d = cy - p.y;
      if (Math.abs(d) < 0.4) {
        const ny = p.y + Math.sign(d) * Math.min(Math.abs(d), 6 * dt);
        if (!this.overlaps(p.x, ny)) p.y = ny;
      }
    }
    p.x = p.vx > 0 ? col - HW - EPS : col + 1 + HW + EPS;
    if (this.overlaps(p.x, p.y)) p.x = ox; // safety: stay put
    p.vx = 0;
  }

  moveY(dt, ax = 0) {
    const p = this.pod;
    const oy = p.y;
    const ny = p.y + p.vy * dt;
    const wasGrounded = p.grounded;
    if (!this.overlaps(p.x, ny)) {
      p.y = ny;
      p.grounded = p.vy >= 0 && this.overlaps(p.x, p.y + 0.03);
      if (p.grounded && !wasGrounded) this.land(0);
      return;
    }
    const row = p.vy > 0 ? Math.floor(ny + HH) : Math.floor(ny - HH);
    // Corner help: when the column under the pod centre is open, nudge
    // sideways into it (falling into or flying up a one-tile shaft).
    const col = Math.floor(p.x);
    if (Math.abs(ax) < 0.3 && !this.solid(col, row)) {
      const d = col + 0.5 - p.x;
      const nx = p.x + Math.sign(d) * Math.min(Math.abs(d), 7 * dt);
      if (!this.overlaps(nx, p.y)) p.x = nx;
    }
    const impact = p.vy;
    if (p.vy > 0) {
      p.y = row - HH - EPS;
      p.grounded = true;
      p.vy = 0;
      this.land(impact);
    } else {
      p.y = row + 1 + HH + EPS;
      p.vy = 0;
    }
    if (this.overlaps(p.x, p.y)) p.y = oy;
  }

  land(impact) {
    const p = this.pod;
    const under = this.tile(Math.floor(p.x), Math.floor(p.y + HH + 0.05));
    if (under === T.BOUNCE && impact > 3 && !p.stranded) {
      p.vy = -Math.min(15, Math.max(9, impact * 0.95));
      p.grounded = false;
      this.events.push({ type: 'boing', x: p.x, y: p.y + HH });
      return;
    }
    if (impact > 6) { p.landT = 0.25; this.events.push({ type: 'thump', x: p.x, y: p.y + HH, impact }); }
  }

  // ------------------------------------------------------------ drilling

  tryDig(tx, ty, dx, dy) {
    const p = this.pod;
    const info = this.digInfo(tx, ty);
    if (!info.ok) {
      if (info.reason !== 'empty' && p.blockT <= 0) {
        p.blockT = 0.7;
        this.events.push({ type: 'blocked', reason: info.reason, x: tx, y: ty, hard: info.hard || 0 });
      }
      return false;
    }
    const x1 = tx + 0.5;
    const y1 = dy ? ty + 1 - HH - EPS : p.y;
    p.drill = { tx, ty, dx, dy, t: 0, dur: info.time, x0: p.x, y0: p.y, x1, y1, code: this.tile(tx, ty) };
    p.vx = 0;
    p.vy = 0;
    p.facing = dx || p.facing;
    this.events.push({ type: 'drillStart', x: tx, y: ty, hard: info.hard, dx, dy });
    return true;
  }

  advanceDrill(dt) {
    const p = this.pod, d = p.drill;
    d.t += dt;
    const k = Math.min(1, d.t / d.dur);
    // The pod eases into the tile as the drill chews through it.
    const e = k * k * (3 - 2 * k);
    p.x = d.x0 + (d.x1 - d.x0) * e;
    p.y = d.y0 + (d.y1 - d.y0) * e;
    if (this.tile(d.tx, d.ty) !== d.code) {
      // The tile changed under us (a boulder fell away): stop cleanly.
      p.drill = null;
      return;
    }
    if (k >= 1) this.finishDig();
  }

  finishDig() {
    const p = this.pod, d = p.drill, s = this.stats;
    p.drill = null;
    const code = d.code;
    this.setTile(d.tx, d.ty, T.EMPTY);
    p.x = d.x1;
    p.y = d.y1;
    p.grounded = this.overlaps(p.x, p.y + 0.03);
    const at = { x: d.tx, y: d.ty };
    this.events.push({ type: 'dug', ...at, code, layer: this.world.layerOf[Math.max(0, d.ty)] });
    if (isOre(code)) {
      const ore = code - T.ORE0;
      if (p.cargo.length < s.cargo) {
        p.cargo.push(ore);
        this.events.push({ type: 'gem', ...at, ore, value: ORES[ore].value });
      } else {
        this.events.push({ type: 'full', ...at, ore });
      }
    } else if (isRelic(code)) {
      p.relics.push(code - T.RELIC0);
      this.events.push({ type: 'relic', ...at, piece: code - T.RELIC0 });
    } else if (code === T.FUEL) {
      p.fuel = Math.min(s.tank, p.fuel + s.tank * 0.35);
      this.events.push({ type: 'fuel', ...at });
    } else if (code === T.GAS) {
      p.vy = -10;
      p.vx = (this.time * 7) % 2 < 1 ? -2.5 : 2.5;
      p.grounded = false;
      p.hull -= PHYS.gasDamage;
      p.hitT = 0.35;
      this.events.push({ type: 'gas', ...at });
    } else if (code === T.CORE) {
      p.core = true;
      this.events.push({ type: 'core', ...at });
    } else if (code === T.ACORN) {
      p.acorn = true;
      this.events.push({ type: 'acorn', ...at });
    } else if (code === T.LAVA) {
      this.events.push({ type: 'hiss', ...at });
    }
    this.wake(d.tx, d.ty);
  }

  // ------------------------------------------------------------ hazards

  hazards(dt) {
    const p = this.pod;
    const lava = this.touching(T.LAVA, p.x, p.y);
    if (!lava.length) return;
    if (this.stats.fan) {
      // The Frost Fan cools lava it touches into stone you can drill.
      for (let i = 0; i < lava.length; i += 2) {
        this.setTile(lava[i], lava[i + 1], T.COOLED);
        this.events.push({ type: 'cool', x: lava[i], y: lava[i + 1] });
      }
    } else if (!p.stranded) {
      p.hull -= PHYS.lavaSting * dt;
      if (p.hotT <= 0) {
        p.hotT = 0.6;
        p.hitT = 0.25;
        this.events.push({ type: 'hot', x: p.x, y: p.y });
      }
    }
  }

  // A tile just emptied at (x, y): a boulder resting on it starts to wobble.
  wake(x, y) {
    if (this.tile(x, y - 1) !== T.BOULDER) return;
    if (this.boulders.some((b) => b.x === x && Math.floor(b.y) === y - 1)) return;
    this.boulders.push({ x, y: y - 1, vy: 0, t: 0, state: 'wobble' });
    this.events.push({ type: 'wobble', x, y: y - 1 });
  }

  updateBoulders(dt) {
    const p = this.pod;
    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i];
      if (b.state === 'wobble') {
        b.t += dt;
        if (this.tile(b.x, b.y) !== T.BOULDER) { this.boulders.splice(i, 1); continue; }
        if (b.t < PHYS.wobble) continue;
        if (!this.solid(b.x, b.y + 1) || this.podIn(b.x, b.y + 1)) {
          b.state = 'fall';
          this.setTile(b.x, b.y, T.EMPTY);
          this.wake(b.x, b.y);
        } else {
          // Something filled the gap again: settle back down.
          this.boulders.splice(i, 1);
          continue;
        }
      }
      if (b.state !== 'fall') continue;
      b.vy = Math.min(b.vy + PHYS.gravity * dt, PHYS.maxFall);
      const ny = b.y + b.vy * dt;
      // Bonk: the boulder lands on the pod and crumbles.
      if (p.x + HW > b.x + 0.08 && p.x - HW < b.x + 0.92 && p.y + HH > ny + 0.1 && p.y - HH < ny + 0.92) {
        p.hull -= PHYS.boulderDamage;
        p.hitT = 0.5;
        if (p.vy < 0) p.vy = 0;
        this.events.push({ type: 'bonk', x: b.x + 0.5, y: ny + 0.5 });
        this.boulders.splice(i, 1);
        continue;
      }
      const by = Math.floor(ny + 1);
      if (this.solid(b.x, by)) {
        const row = by - 1;
        if (this.tile(b.x, row) === T.EMPTY) this.setTile(b.x, row, T.BOULDER);
        this.events.push({ type: 'thud', x: b.x + 0.5, y: row + 1 });
        this.boulders.splice(i, 1);
        continue;
      }
      b.y = ny;
    }
  }

  podIn(tx, ty) {
    const p = this.pod;
    return p.x + HW > tx && p.x - HW < tx + 1 && p.y + HH > ty && p.y - HH < ty + 1;
  }

  // ------------------------------------------------------------ helpers

  // Put the pod back on the base pad (after a tow).
  resetToBase() {
    const p = this.pod;
    p.x = (this.base.x0 + this.base.x1 + 1) / 2 + 2;
    p.y = -HH - EPS;
    p.vx = 0; p.vy = 0; p.drill = null; p.flying = false; p.stranded = null;
    p.grounded = true; p.docked = false; p.depth = 0;
  }
}

export function digTime(hard, power) {
  return 0.16 + 0.42 * (hard / power);
}

export const POD_HALF = { w: HW, h: HH };
