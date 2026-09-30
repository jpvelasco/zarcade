// The Pip's Peak simulation. No DOM, no canvas, no audio: the browser layer
// reads this and draws it, and the Node tests drive it directly.

import { PHYS, bounceOffEnemy, createPlayer, stepPlayer } from './physics.js';
import { abilitiesFor } from './levels.js';
import {
  ACORN, BEE, BEETLE, CHECKPOINT, CRUMBLE, DOOR, GOAL, MUSHROOM, SEED, START,
  SWITCH, TILE, isHazard,
} from './tiles.js';

export const PETALS = 3;
const CRUMBLE_SHAKE = 0.32;   // grace after you land before it lets go
const CRUMBLE_RETURN = 3.4;   // how long until it grows back
const HURT_INVULN = 1.1;
const SEED_SIZE = 9;

const BEETLE_SIZE = { w: 14, h: 11 };
const BEE_SIZE = { w: 14, h: 12 };

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function tileBox(col, row, size) {
  return { x: col * TILE + (TILE - size) / 2, y: row * TILE + (TILE - size) / 2, w: size, h: size };
}

export class World {
  constructor(level) {
    this.level = level;
    this.abilities = abilitiesFor(level);
    this.height = level.tiles.length;
    this.width = level.tiles[0].length;
    this.pixelWidth = this.width * TILE;
    this.pixelHeight = this.height * TILE;
    this.grid = level.tiles.map((row) => row.split(''));

    this.seeds = [];
    this.acorns = [];
    this.checkpoints = [];
    this.switches = [];
    this.enemySpawns = [];
    this.crumbles = new Map();
    this.spawn = { col: 1, row: 1 };
    this.goal = null;

    for (let row = 0; row < this.height; row += 1) {
      for (let col = 0; col < this.width; col += 1) {
        const ch = this.grid[row][col];
        if (ch === START) this.spawn = { col, row };
        else if (ch === GOAL) this.goal = { col, row, box: tileBox(col, row, 14) };
        else if (ch === SEED) this.seeds.push({ col, row, box: tileBox(col, row, SEED_SIZE), taken: false });
        else if (ch === ACORN) this.acorns.push({ col, row, box: tileBox(col, row, 12), taken: false });
        else if (ch === CHECKPOINT) this.checkpoints.push({ col, row, box: tileBox(col, row, 16), bloomed: false });
        else if (ch === SWITCH) this.switches.push({ col, row, box: tileBox(col, row, 14), pressed: false });
        else if (ch === BEETLE || ch === BEE) this.enemySpawns.push({ kind: ch, col, row });
        else if (ch === CRUMBLE) this.crumbles.set(`${row},${col}`, { row, col, state: 'idle', t: 0 });
      }
    }

    this.movers = (level.movers || []).map((m, index) => {
      const w = (m.w || 2) * TILE;
      const h = m.kind === 'stone' ? TILE : 8;
      return {
        index,
        spec: m,
        kind: m.kind || 'leaf',
        solid: m.kind === 'stone',
        tile: m.kind === 'stone' ? '#' : '-',
        x: m.x * TILE,
        y: m.y * TILE,
        w,
        h,
        dx: 0,
        dy: 0,
      };
    });
    this.winds = (level.winds || []).map((w) => ({
      x: w.x * TILE, y: w.y * TILE, w: w.w * TILE, h: w.h * TILE, ax: w.ax || 0, ay: w.ay || 0,
    }));

    this.seedTotal = this.seeds.length;
    this.acornTotal = this.acorns.length;
    this.events = [];
    this.reset();
  }

  /** Start (or restart) the level from the top. */
  reset() {
    this.status = 'play';
    this.time = 0;
    this.clock = 0;
    this.petals = PETALS;
    this.seedsTaken = 0;
    this.acornsTaken = 0;
    this.invuln = 0;
    this.gatesOpen = false;
    this.respawn = { ...this.spawn };
    for (const seed of this.seeds) seed.taken = false;
    for (const acorn of this.acorns) acorn.taken = false;
    for (const flower of this.checkpoints) flower.bloomed = false;
    for (const latch of this.switches) latch.pressed = false;
    this.player = createPlayer(this.spawn.col * TILE + TILE / 2, this.spawn.row * TILE + TILE);
    this.resetVolatile();
  }

  /** Everything that comes back when Pip respawns: enemies, blocks, movers. */
  resetVolatile() {
    for (const block of this.crumbles.values()) {
      block.state = 'idle';
      block.t = 0;
    }
    this.enemies = this.enemySpawns.map((spawn, index) => {
      const size = spawn.kind === BEETLE ? BEETLE_SIZE : BEE_SIZE;
      return {
        index,
        kind: spawn.kind,
        x: spawn.col * TILE + (TILE - size.w) / 2,
        y: spawn.row * TILE + TILE - size.h,
        w: size.w,
        h: size.h,
        homeY: spawn.row * TILE + TILE - size.h,
        dir: index % 2 === 0 ? 1 : -1,
        bob: index * 0.7,
        alive: true,
        squish: 0,
      };
    });
    this.clock = 0;
    for (const mover of this.movers) this.moveMover(mover, 0);
  }

  /** Put Pip back at the last bloomed flower. */
  respawnPlayer() {
    this.player = createPlayer(this.respawn.col * TILE + TILE / 2, this.respawn.row * TILE + TILE);
    this.invuln = HURT_INVULN;
    this.resetVolatile();
  }

  tileAt(col, row) {
    if (col < 0 || col >= this.width || row < 0) return '#';
    if (row >= this.height) return ' ';
    const ch = this.grid[row][col];
    if (ch === DOOR && this.gatesOpen) return ' ';
    if (ch === CRUMBLE) {
      const block = this.crumbles.get(`${row},${col}`);
      if (block && block.state === 'gone') return ' ';
    }
    return ch;
  }

  get terrain() {
    return { tileAt: (col, row) => this.tileAt(col, row) };
  }

  moveMover(mover, time) {
    const m = mover.spec;
    const phase = m.phase || 0;
    const t = (1 - Math.cos((time * (m.speed || 0.25) + phase) * Math.PI * 2)) / 2;
    const nx = (m.x + (m.dx || 0) * t) * TILE;
    const ny = (m.y + (m.dy || 0) * t) * TILE;
    mover.dx = nx - mover.x;
    mover.dy = ny - mover.y;
    mover.x = nx;
    mover.y = ny;
  }

  emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  windAt(box) {
    let ax = 0;
    let ay = 0;
    const probe = { x: box.x, y: box.y, w: box.w, h: box.h };
    for (const wind of this.winds) {
      if (rectsOverlap(probe, wind)) {
        ax += wind.ax;
        ay += wind.ay;
      }
    }
    return { ax, ay };
  }

  /** One fixed simulation step. `input` is `{left,right,down,jump,jumpPressed}`. */
  step(dt, input = {}) {
    if (this.status !== 'play') return;
    this.time += dt;
    this.clock += dt;
    this.invuln = Math.max(0, this.invuln - dt);

    for (const mover of this.movers) this.moveMover(mover, this.clock);
    const p = this.player;
    if (p.carrier) {
      p.rideDx += p.carrier.dx;
      p.rideDy += p.carrier.dy;
    }

    this.stepCrumbles(dt);

    const wind = this.windAt(p);
    const result = stepPlayer(p, input, this.terrain, dt, {
      abilities: this.abilities,
      rects: this.movers,
      windAx: wind.ax,
      windAy: wind.ay,
    });
    if (result.jumped) this.emit(result.jumped === 'ground' ? 'jump' : result.jumped === 'double' ? 'double' : 'wallJump', { x: p.x, y: p.y });
    if (result.landed) this.emit('land', { x: p.x, y: p.y + p.h, hard: p.airTime > 0.4 });
    if (result.bounced) this.emit('spring', { x: p.x + p.w / 2, y: p.y + p.h });
    if (result.startedWallSlide) this.emit('slide', { x: p.x, y: p.y });

    // Landing on a crumbling block starts its countdown.
    if (p.onGround && p.groundTile === CRUMBLE) {
      const row = Math.floor((p.y + p.h + 1) / TILE);
      for (let col = Math.floor(p.x / TILE); col <= Math.floor((p.x + p.w - 1) / TILE); col += 1) {
        const block = this.crumbles.get(`${row},${col}`);
        if (block && block.state === 'idle') {
          block.state = 'shaking';
          block.t = 0;
          this.emit('crumble', { x: col * TILE + TILE / 2, y: row * TILE });
        }
      }
    }

    this.stepEnemies(dt);
    this.collect();
    this.checkHazards();
  }

  stepCrumbles(dt) {
    for (const block of this.crumbles.values()) {
      if (block.state === 'shaking') {
        block.t += dt;
        if (block.t >= CRUMBLE_SHAKE) {
          block.state = 'gone';
          block.t = 0;
          this.emit('break', { x: block.col * TILE + TILE / 2, y: block.row * TILE + TILE / 2 });
        }
      } else if (block.state === 'gone') {
        block.t += dt;
        if (block.t >= CRUMBLE_RETURN) {
          const box = { x: block.col * TILE, y: block.row * TILE, w: TILE, h: TILE };
          if (rectsOverlap(this.player, box)) continue; // never grow back inside Pip
          block.state = 'idle';
          block.t = 0;
        }
      }
    }
  }

  solidForEnemy(col, row) {
    const ch = this.tileAt(col, row);
    return ch === '#' || ch === 'I' || ch === MUSHROOM || ch === CRUMBLE || (ch === DOOR && !this.gatesOpen) || ch === '-';
  }

  stepEnemies(dt) {
    const p = this.player;
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        enemy.squish = Math.min(1, enemy.squish + dt * 5);
        continue;
      }
      if (enemy.kind === BEETLE) {
        const speed = 34;
        enemy.x += enemy.dir * speed * dt;
        const foot = Math.floor((enemy.y + enemy.h + 2) / TILE);
        const ahead = Math.floor((enemy.dir > 0 ? enemy.x + enemy.w + 1 : enemy.x - 1) / TILE);
        const mid = Math.floor((enemy.y + enemy.h / 2) / TILE);
        if (this.solidForEnemy(ahead, mid) || !this.solidForEnemy(ahead, foot)) {
          enemy.dir *= -1;
          enemy.x += enemy.dir * 2;
        }
      } else {
        const speed = 46;
        enemy.bob += dt * 2.4;
        enemy.x += enemy.dir * speed * dt;
        enemy.y = enemy.homeY + Math.sin(enemy.bob) * 10;
        const ahead = Math.floor((enemy.dir > 0 ? enemy.x + enemy.w + 1 : enemy.x - 1) / TILE);
        const mid = Math.floor((enemy.y + enemy.h / 2) / TILE);
        if (this.solidForEnemy(ahead, mid) || ahead < 0 || ahead >= this.width) {
          enemy.dir *= -1;
          enemy.x += enemy.dir * 2;
        }
      }

      if (!rectsOverlap(p, enemy)) continue;
      const stomping = p.vy > 20 && p.y + p.h - p.vy * dt <= enemy.y + enemy.h * 0.6;
      if (stomping) {
        enemy.alive = false;
        enemy.squish = 0;
        bounceOffEnemy(p, p.jumpHeld, this.abilities);
        this.emit('stomp', { x: enemy.x + enemy.w / 2, y: enemy.y });
      } else {
        this.hurt('enemy', { x: enemy.x + enemy.w / 2, y: enemy.y });
      }
    }
  }

  collect() {
    const p = this.player;
    for (const seed of this.seeds) {
      if (seed.taken || !rectsOverlap(p, seed.box)) continue;
      seed.taken = true;
      this.seedsTaken += 1;
      this.emit('seed', { x: seed.box.x + seed.box.w / 2, y: seed.box.y, count: this.seedsTaken });
    }
    for (const acorn of this.acorns) {
      if (acorn.taken || !rectsOverlap(p, acorn.box)) continue;
      acorn.taken = true;
      this.acornsTaken += 1;
      this.emit('acorn', { x: acorn.box.x + acorn.box.w / 2, y: acorn.box.y });
    }
    for (const flower of this.checkpoints) {
      if (flower.bloomed || !rectsOverlap(p, flower.box)) continue;
      flower.bloomed = true;
      this.respawn = { col: flower.col, row: flower.row };
      this.petals = PETALS;
      this.emit('checkpoint', { x: flower.box.x + flower.box.w / 2, y: flower.box.y });
    }
    for (const latch of this.switches) {
      if (latch.pressed || !rectsOverlap(p, latch.box)) continue;
      latch.pressed = true;
      this.emit('switch', { x: latch.box.x + latch.box.w / 2, y: latch.box.y });
      if (this.switches.every((other) => other.pressed)) {
        this.gatesOpen = true;
        this.emit('gate', {});
      }
    }
    if (this.goal && rectsOverlap(p, this.goal.box)) {
      this.status = 'complete';
      this.emit('goal', { x: this.goal.box.x, y: this.goal.box.y });
    }
  }

  checkHazards() {
    const p = this.player;
    if (p.y > this.pixelHeight + 8) {
      this.hurt('fall', { x: p.x + p.w / 2, y: this.pixelHeight });
      return;
    }
    const c0 = Math.floor((p.x + 2) / TILE);
    const c1 = Math.floor((p.x + p.w - 3) / TILE);
    const r0 = Math.floor((p.y + 3) / TILE);
    const r1 = Math.floor((p.y + p.h - 2) / TILE);
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        if (isHazard(this.tileAt(col, row))) {
          this.hurt(this.tileAt(col, row) === '~' ? 'water' : 'thorns', { x: p.x + p.w / 2, y: p.y + p.h });
          return;
        }
      }
    }
  }

  hurt(cause, at) {
    if (this.status !== 'play') return;
    if (this.invuln > 0 && cause !== 'fall' && cause !== 'water') return;
    this.petals -= 1;
    const wilted = this.petals <= 0;
    if (wilted) this.petals = PETALS;
    this.emit(wilted ? 'wilt' : 'hurt', { ...at, cause });
    this.respawnPlayer();
  }

  /** Stars: one for the summit, one for every seed, one for all three acorns. */
  result() {
    let stars = 1;
    if (this.seedsTaken >= this.seedTotal) stars += 1;
    if (this.acornsTaken >= this.acornTotal) stars += 1;
    return {
      levelId: this.level.id,
      time: this.time,
      seeds: this.seedsTaken,
      seedTotal: this.seedTotal,
      acorns: this.acornsTaken,
      acornTotal: this.acornTotal,
      stars,
    };
  }
}

export { PHYS, TILE };
