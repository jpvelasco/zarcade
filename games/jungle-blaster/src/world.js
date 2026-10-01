// The simulation: one stage, one or two runners, enemies, bullets, pickups,
// the boss and the camera. DOM-free; the browser and the tests both drive it
// with `step(dt, inputs)` and read `events` for sound and sparkle.

import { buildStage, TREASURES, TREASURE_VALUE } from './levels.js';
import { PHYS, aimFrom, clonePlayer, createPlayer, createVine, hurtbox, overlaps, stepPlayer, stepVine } from './physics.js';
import { TILE, isLedge, isSolid, isSinking } from './tiles.js';
import { BOMB_MAX, WEAPONS, bulletBox, canHit, coolGun, fire, markHit, moveBullet } from './weapons.js';
import { createEnemy, isActiveBody, updateEnemy } from './enemies.js';
import { bossBox, bossVulnerable, createBoss, damageBoss, updateBoss } from './bosses.js';
import { makeRng } from './rng.js';

export const VIEW_W = 320;
export const VIEW_H = 180;
export const EXTRA_LIFE_EVERY = 30000;

export const MODES = Object.freeze({
  adventure: { label: 'Adventure', hearts: 3, lives: 5, continues: Infinity, bossScale: 0.85, keepWeapon: true },
  arcade: { label: 'Arcade', hearts: 1, lives: 3, continues: 3, bossScale: 1, keepWeapon: false },
});

const CROC_CYCLE = 3.2;
const CROC_WARN = 1.9;
const CROC_OPEN = 2.3;
const INVULN_HIT = 1.6;
const INVULN_RESPAWN = 2.2;
const MAX_SHOTS = 90;

/** A whole game's worth of score, lives and continues, carried across stages. */
export function createRun({ mode = 'adventure', players = 1 } = {}) {
  const rules = MODES[mode] || MODES.adventure;
  return {
    mode: MODES[mode] ? mode : 'adventure',
    players: players === 2 ? 2 : 1,
    score: 0,
    lives: [rules.lives, rules.lives].slice(0, players === 2 ? 2 : 1),
    guns: ['normal', 'normal'],
    bombs: [1, 1],
    continuesLeft: rules.continues,
    nextLife: EXTRA_LIFE_EVERY,
    treasures: 0,
    stagesCleared: 0,
  };
}

export function crocPhase(croc, t) {
  const k = (((t + croc.phase) % CROC_CYCLE) + CROC_CYCLE) % CROC_CYCLE;
  return k < CROC_WARN ? 'closed' : k < CROC_OPEN ? 'warn' : 'open';
}

export function moverOffset(m, t) {
  if (!m.ax && !m.ay) return { x: 0, y: 0 };
  const s = Math.sin((t / m.period) * Math.PI * 2 + m.phase);
  return { x: m.ax * s, y: m.ay * s };
}

export class World {
  constructor(stageIndex, { run = null, seed = 1, mode, players } = {}) {
    this.run = run || createRun({ mode, players });
    this.rules = MODES[this.run.mode];
    this.level = buildStage(stageIndex);
    this.stageIndex = stageIndex;
    this.grid = this.level.grid;
    this.cols = this.level.cols;
    this.rows = this.level.rows;
    this.width = this.level.width;
    this.height = this.level.height;
    this.rng = makeRng(seed * 7919 + stageIndex * 104729 + 17);
    this.t = 0;
    this.status = 'play';     // play | clear | over
    this.events = [];
    this.nextId = 1;
    this.bullets = [];
    this.shots = [];
    this.enemies = [];
    this.markers = [];
    this.boss = null;
    this.clearTimer = 0;
    this.checkpoint = -1;
    this.stats = { time: 0, kills: 0, treasures: 0, treasureTotal: this.level.treasureTotal, hits: 0, deaths: 0, bombs: 0 };
    this.camera = { x: 0, y: 0 };
    this.arena = this.level.arena ? { ...this.level.arena, top: this.level.arena.floor - 120, active: false } : null;
    this.vines = this.level.vines.map((v) => createVine(v.ax, v.ay, v.len, v.phase));
    this.movers = this.level.movers.map((m) => ({ ...m, ox: 0, oy: 0, dx: 0, dy: 0, crumble: 0, fall: 0, gone: 0 }));
    this.crocs = this.level.crocs.map((c) => ({ ...c, state: 'closed' }));
    this.rollers = this.level.rollers.map((r) => ({ ...r, timer: 0.6 }));
    this.spawns = this.level.enemies.map((e) => ({ ...e, state: 'dormant', enemy: null }));
    this.items = this.level.items.map((item, i) => ({
      ...item,
      id: i,
      state: TREASURES.has(item.kind) ? 'treasure' : 'pod',
      vy: 0,
      baseY: item.y,
    }));
    this.players = [];
    const start = this.level.start;
    for (let i = 0; i < this.run.players; i += 1) {
      const p = createPlayer(start.x - i * 18, start.y, i);
      this.decorate(p, i);
      this.players.push(p);
    }
    this.surfaceCache = { t: -1, env: null };
    this.updateCamera(1, true);
  }

  decorate(p, i) {
    p.hearts = this.rules.hearts;
    p.invuln = 1.2;
    p.state = this.run.lives[i] > 0 ? 'alive' : 'out';
    p.gun = { id: this.run.guns[i] || 'normal', cooldown: 0 };
    p.bombs = this.run.bombs[i] ?? 1;
    p.respawn = 0;
    p.shootAnim = 0;
    p.hurtTimer = 0;
  }

  // ------------------------------------------------------------- terrain

  tileAt(c, r) {
    if (c < 0 || c >= this.cols) return '#';
    if (r < 0 || r >= this.rows) return ' ';
    return this.grid[r][c];
  }

  solidAt(x, y) {
    return isSolid(this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)));
  }

  /** Surface y an enemy's foot at (x, y) lands on, or null. */
  standAt(x, y, prevBottom) {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    const tile = this.tileAt(c, r);
    const top = r * TILE;
    if (isSolid(tile)) return top;
    if ((isLedge(tile) || isSinking(tile) || tile === 'H') && prevBottom <= top + 1) return top;
    return null;
  }

  /** Platforms and danger zones at time t (time-driven, so the pilot can look ahead). */
  surfacesAt(t) {
    const rects = [];
    const hazards = [];
    for (const m of this.movers) {
      if (m.gone > 0) continue;
      if (m.kind === 'crumble') {
        rects.push({ x: m.x, y: m.y + m.fall, w: m.w, h: m.h, dx: 0, dy: m.dy, mover: m });
        continue;
      }
      const now = moverOffset(m, t);
      const before = moverOffset(m, t - 1 / 60);
      rects.push({ x: m.x + now.x, y: m.y + now.y, w: m.w, h: m.h, dx: now.x - before.x, dy: now.y - before.y, mover: m });
    }
    for (const c of this.crocs) {
      const phase = crocPhase(c, t);
      // The croc faces left: its back half is always safe to stand on, the
      // snout only while the jaws are shut.
      if (phase === 'open') {
        rects.push({ x: c.x - 1, y: c.y - 3, w: 14, h: 6, dx: 0, dy: 0 });
        hazards.push({ x: c.x - 15, y: c.y - 14, w: 13, h: 14, kind: 'bite' });
      } else {
        rects.push({ x: c.x - 13, y: c.y - 3, w: 26, h: 6, dx: 0, dy: 0 });
      }
    }
    return { rects, hazards };
  }

  bounds() {
    if (this.arena && this.arena.active) return { minX: this.arena.x0, maxX: this.arena.x1 };
    if (this.livePlayers().length > 1) return { minX: Math.max(0, this.camera.x), maxX: Math.min(this.width, this.camera.x + VIEW_W) };
    return { minX: 0, maxX: this.width };
  }

  /** The physics environment at time t; `vines` may be a look-ahead copy. */
  physicsEnv(t, vines = this.vines) {
    const { rects, hazards } = this.surfacesAt(t);
    const { minX, maxX } = this.bounds();
    return { tileAt: (c, r) => this.tileAt(c, r), rects, hazards, vines, minX, maxX, bottom: this.height + 24 };
  }

  // ----------------------------------------------------------- helpers

  livePlayers() {
    return this.players.filter((p) => p.state === 'alive');
  }

  nearestPlayer(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      const d = Math.abs(p.x + p.w / 2 - x) + Math.abs(p.y + p.h / 2 - y) * 0.7;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  enemyShot(x, y, vx, vy, opts = {}) {
    if (this.shots.length >= MAX_SHOTS) return null;
    const shot = {
      kind: opts.kind || 'shot',
      x, y, vx, vy,
      r: opts.r || 3,
      w: opts.w || 0,
      h: opts.h || 0,
      gravity: opts.gravity || 0,
      life: opts.life || 4,
      hp: opts.hp || 0,
      absolute: !!opts.absolute,
      style: opts.style || '',
      age: 0,
      dead: false,
      rolling: false,
      uid: -(this.nextId++),
    };
    this.shots.push(shot);
    if (shot.kind === 'shot' || shot.kind === 'fire') this.events.push({ type: 'enemyShot', x, y });
    return shot;
  }

  marker(x, y, w, h, life, kind) {
    this.markers.push({ x, y, w, h, life, max: life, kind });
  }

  spawnEnemy(kind, x, y) {
    const e = createEnemy(kind, x, y + 5, this.nextId++);
    this.enemies.push(e);
    this.events.push({ type: 'summon', x, y });
    return e;
  }

  addScore(points) {
    this.run.score += points;
    while (this.run.score >= this.run.nextLife) {
      this.run.nextLife += EXTRA_LIFE_EVERY;
      for (let i = 0; i < this.run.lives.length; i += 1) this.run.lives[i] += 1;
      this.events.push({ type: 'oneUp' });
    }
  }

  // ---------------------------------------------------------------- step

  step(dt, inputs = []) {
    this.t += dt;
    if (this.status === 'over') return;
    if (this.status === 'play') this.stats.time += dt;

    for (const v of this.vines) if (v.holder < 0) stepVine(v, dt);
    this.updateMovers(dt);
    const env = this.physicsEnv(this.t);
    this.env = env;
    for (const c of this.crocs) {
      const phase = crocPhase(c, this.t);
      if (phase !== c.state && phase === 'open') this.events.push({ type: 'snap', x: c.x, y: c.y });
      c.state = phase;
    }

    for (const p of this.players) this.updatePlayer(p, inputs[p.id] || {}, env, dt);

    this.updateCheckpoints();
    this.updateCamera(dt);
    this.updateSpawns(dt);
    for (const e of this.enemies) updateEnemy(e, this, dt);
    this.updateArena(dt);
    this.updateBullets(dt);
    this.updateShots(dt);
    this.updateContacts();
    this.updateItems(dt);
    for (const m of this.markers) m.life -= dt;
    this.markers = this.markers.filter((m) => m.life > 0);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.shots = this.shots.filter((s) => !s.dead);

    if (this.status === 'play' && this.boss && this.boss.dead) {
      this.clearTimer += dt;
      if (this.clearTimer > 1.4) {
        this.status = 'clear';
        this.run.stagesCleared = Math.max(this.run.stagesCleared, this.stageIndex + 1);
        this.events.push({ type: 'stageClear' });
      }
    }
    if (this.status === 'play' && this.players.every((p) => p.state === 'out')) {
      this.status = 'over';
      this.events.push({ type: 'gameOver' });
    }
  }

  updateMovers(dt) {
    for (const m of this.movers) {
      if (m.kind !== 'crumble') continue;
      m.dy = 0;
      if (m.gone > 0) {
        m.gone -= dt;
        if (m.gone <= 0) { m.fall = 0; m.crumble = 0; m.falling = false; this.events.push({ type: 'rebuild', x: m.x + 8, y: m.y }); }
        continue;
      }
      const stood = this.players.some((p) => p.state === 'alive' && p.onGround && p.carrier >= 0 && this.env && this.env.rects[p.carrier] && this.env.rects[p.carrier].mover === m);
      if (stood && !m.falling) {
        m.crumble += dt;
        if (m.crumble > 0.45) { m.falling = true; this.events.push({ type: 'crumble', x: m.x + 8, y: m.y }); }
      }
      if (m.falling) {
        m.dy = 140 * dt;
        m.fall += m.dy;
        if (m.fall > 60) { m.gone = 2.6; m.falling = false; }
      }
    }
  }

  updatePlayer(p, input, env, dt) {
    if (p.state === 'out') return;
    if (p.state === 'dead') {
      p.respawn -= dt;
      if (p.respawn <= 0) {
        if (this.run.lives[p.id] > 0) this.revive(p, p.safe.x, p.safe.y);
        else {
          p.state = 'out';
          this.events.push({ type: 'playerOut', player: p.id });
        }
      }
      return;
    }
    if (this.status !== 'play') input = {};
    p.invuln = Math.max(0, p.invuln - dt);
    p.shootAnim = Math.max(0, p.shootAnim - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    const out = stepPlayer(p, input, env, dt);
    if (out.jumped) this.events.push({ type: 'jump', x: p.x + p.w / 2, y: p.y + p.h, player: p.id });
    if (out.landed) this.events.push({ type: 'land', x: p.x + p.w / 2, y: p.y + p.h, player: p.id });
    if (out.grabbed) this.events.push({ type: 'vine', x: p.x + p.w / 2, y: p.y, player: p.id });
    if (out.released) this.events.push({ type: 'swing', x: p.x + p.w / 2, y: p.y, player: p.id });
    const aim = aimFrom(p, input);
    p.aimX = aim.x;
    p.aimY = aim.y;
    coolGun(p.gun, dt);
    if (input.shoot && p.mode !== 'stun') {
      const live = this.bullets.filter((b) => b.owner === p.id).length;
      const shots = fire(p.gun, p, aim.x, aim.y, live);
      if (shots.length) {
        this.bullets.push(...shots);
        p.shootAnim = 0.12;
        this.events.push({ type: 'shoot', gun: p.gun.id, x: shots[0].x, y: shots[0].y, player: p.id });
      }
    }
    if (input.bombPressed) this.bomb(p);
    if (p.hazard) this.hurtPlayer(p, p.hazard);
  }

  revive(p, x, y) {
    p.state = 'alive';
    p.hearts = this.rules.hearts;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.mode = 'run';
    p.vine = -1;
    p.sink = 0;
    p.onSand = false;
    p.invuln = INVULN_RESPAWN;
    this.events.push({ type: 'respawn', x: x + p.w / 2, y: y + p.h, player: p.id });
  }

  releaseVine(p) {
    if (p.mode === 'vine' && this.vines[p.vine]) this.vines[p.vine].holder = -1;
    p.vine = -1;
    if (p.mode === 'vine' || p.mode === 'ladder') p.mode = 'run';
  }

  /** Something hurt a runner. Terrain (pits, water, lava) puts you back on safe ground. */
  hurtPlayer(p, cause) {
    if (p.state !== 'alive') return;
    const terrain = cause === 'pit' || cause === 'water' || cause === 'lava' || cause === 'sand' || cause === 'spikes';
    if (p.invuln > 0 && !terrain) return;
    if (p.invuln > 0 && terrain) {
      // Still blinking: just lift them back out without another penalty.
      this.releaseVine(p);
      p.x = p.safe.x; p.y = p.safe.y; p.vx = 0; p.vy = 0; p.sink = 0; p.onSand = false;
      return;
    }
    this.stats.hits += 1;
    p.hearts -= 1;
    this.releaseVine(p);
    this.events.push({ type: terrain ? 'splash' : 'hurt', cause, x: p.x + p.w / 2, y: p.y + p.h / 2, player: p.id });
    if (p.hearts <= 0) {
      this.killPlayer(p, cause);
      return;
    }
    p.invuln = INVULN_HIT;
    p.hurtTimer = 0.3;
    if (terrain) {
      p.x = p.safe.x; p.y = p.safe.y; p.vx = 0; p.vy = 0; p.sink = 0; p.onSand = false;
    } else {
      p.vx = -p.facing * 110;
      p.vy = -170;
      p.onGround = false;
      p.mode = 'run';
    }
  }

  killPlayer(p, cause) {
    this.stats.deaths += 1;
    this.run.lives[p.id] = Math.max(0, this.run.lives[p.id] - 1);
    p.state = 'dead';
    p.respawn = 1.5;
    p.deathX = p.x;
    p.deathY = p.y;
    p.deathCause = cause;
    p.vx = -p.facing * 60;
    if (!this.rules.keepWeapon) p.gun.id = 'normal';
    this.syncRun();
    this.events.push({ type: 'death', x: p.x + p.w / 2, y: p.y + p.h / 2, player: p.id, cause });
  }

  syncRun() {
    for (const p of this.players) {
      this.run.guns[p.id] = p.gun.id;
      this.run.bombs[p.id] = p.bombs;
    }
  }

  bomb(p) {
    if (p.bombs <= 0) return false;
    p.bombs -= 1;
    this.stats.bombs += 1;
    const x0 = this.camera.x;
    const x1 = this.camera.x + VIEW_W;
    for (const s of this.shots) if (s.x > x0 - 20 && s.x < x1 + 20) s.dead = true;
    for (const e of this.enemies) {
      if (e.dead || !e.shootable || e.x + e.w < x0 || e.x > x1) continue;
      if (e.hidden && e.kind !== 'turret') continue;
      e.hidden = false;
      this.damageEnemy(e, 8);
    }
    if (this.boss && bossVulnerable(this.boss)) this.hitBoss(6);
    this.syncRun();
    this.events.push({ type: 'bomb', x: p.x + p.w / 2, y: p.y + p.h / 2, player: p.id });
    return true;
  }

  // ---------------------------------------------------- checkpoints/camera

  updateCheckpoints() {
    const lead = Math.max(...this.livePlayers().map((p) => p.x), -Infinity);
    this.level.checkpoints.forEach((cp, i) => {
      if (i <= this.checkpoint || lead < cp.x - 8) return;
      this.checkpoint = i;
      for (const p of this.players) {
        if (p.state === 'alive' && this.run.mode === 'adventure') p.hearts = this.rules.hearts;
        if (p.state === 'dead' || p.state === 'out') continue;
      }
      this.events.push({ type: 'checkpoint', x: cp.x, y: cp.y });
    });
  }

  updateCamera(dt, snap = false) {
    const live = this.livePlayers();
    const cam = this.camera;
    let tx = cam.x;
    let ty = cam.y;
    if (live.length) {
      const cx = live.reduce((sum, p) => sum + p.x + p.w / 2, 0) / live.length;
      // Follow the ground the runners stand on, not every jump.
      for (const p of live) {
        const now = p.y + p.h;
        if (p.onGround || p.mode === 'ladder' || p.camFeet === undefined || now > p.camFeet + 36) p.camFeet = now;
      }
      const feet = live.reduce((sum, p) => sum + p.camFeet, 0) / live.length;
      const lead = live.length === 1 ? live[0].facing * 18 : 0;
      tx = cx + lead - VIEW_W * 0.42;
      ty = feet - 120;
      if (live.length > 1) {
        // Never scroll a lagging partner off the left edge: the leader waits.
        const minX = Math.min(...live.map((p) => p.x));
        const maxX = Math.max(...live.map((p) => p.x + p.w));
        tx = Math.max(Math.min(tx, minX - 8), maxX + 8 - VIEW_W);
      }
    }
    if (this.arena && this.arena.active) tx = this.arena.x0;
    tx = Math.max(0, Math.min(this.width - VIEW_W, tx));
    ty = Math.max(0, Math.min(this.height - VIEW_H, ty));
    if (snap) {
      cam.x = tx;
      cam.y = ty;
    } else {
      cam.x += (tx - cam.x) * Math.min(1, dt * 5);
      cam.y += (ty - cam.y) * Math.min(1, dt * 4);
    }
  }

  // ------------------------------------------------------------ enemies

  updateSpawns(dt) {
    const cam = this.camera;
    for (const s of this.spawns) {
      if (s.state === 'dormant') {
        if (s.x > cam.x - 24 && s.x < cam.x + VIEW_W + 28 && !(this.arena && this.arena.active)) {
          s.enemy = createEnemy(s.kind, s.x, s.y, this.nextId++, { spawn: s });
          s.state = 'alive';
          this.enemies.push(s.enemy);
        }
      } else if (s.state === 'alive') {
        const e = s.enemy;
        if (e.dead) { s.state = e.killed ? 'dead' : 'dormant'; s.enemy = null; continue; }
        const cx = e.x + e.w / 2;
        if (cx < cam.x - 200 || cx > cam.x + VIEW_W + 200 || e.y > this.height + 40) {
          e.dead = true;
          s.state = 'dormant';
          s.enemy = null;
        }
      }
    }
    for (const r of this.rollers) {
      const lead = this.livePlayers().some((p) => p.x < r.x - 24 && p.x > r.x - 300);
      if (!lead || r.x > cam.x + VIEW_W + 60 || (this.arena && this.arena.active)) continue;
      r.timer -= dt;
      if (r.timer <= 0) {
        r.timer = 3.4;
        this.enemies.push(createEnemy('log', Math.min(r.x, cam.x + VIEW_W + 10), r.y, this.nextId++));
      }
    }
  }

  damageEnemy(e, amount) {
    if (e.dead) return;
    e.hp -= amount;
    e.flash = 0.08;
    if (e.hp <= 0) {
      e.dead = true;
      e.killed = true;
      this.stats.kills += 1;
      this.addScore(e.score);
      if (e.spawn) e.spawn.state = 'dead';
      this.events.push({ type: 'explode', x: e.x + e.w / 2, y: e.y + e.h / 2, size: e.kind === 'turret' ? 2 : 1, kind: e.kind, score: e.score });
    } else {
      this.events.push({ type: 'hit', x: e.x + e.w / 2, y: e.y + e.h / 2 });
    }
  }

  hitBoss(amount) {
    const boss = this.boss;
    if (!damageBoss(boss, amount, this)) return;
    if (boss.dying > 0) this.addScore(10000 * (this.stageIndex + 1));
  }

  updateArena(dt) {
    const arena = this.arena;
    if (!arena) return;
    if (!arena.active) {
      if (this.livePlayers().some((p) => p.x > arena.x0 + 40)) {
        arena.active = true;
        for (const e of this.enemies) if (e.spawn) { e.dead = true; e.spawn.state = 'dead'; }
        for (const p of this.players) {
          if (p.state === 'alive' && p.x < arena.x0) { this.releaseVine(p); p.x = arena.x0 + 8; }
          if (p.safe.x < arena.x0) { p.safe.x = arena.x0 + 16; p.safe.y = arena.floor - PHYS.height; }
        }
        const scale = this.rules.bossScale * (this.run.players === 2 ? 1.5 : 1);
        this.boss = createBoss(this.level.boss, arena, { hpScale: scale });
        this.events.push({ type: 'bossIntro', boss: this.boss.type, name: this.boss.name });
      }
      return;
    }
    if (this.boss) updateBoss(this.boss, this, dt);
  }

  // ------------------------------------------------------------ bullets

  updateBullets(dt) {
    const cam = this.camera;
    const boss = this.boss;
    for (const b of this.bullets) {
      moveBullet(b, dt);
      if (b.dead) continue;
      if (b.x < cam.x - 16 || b.x > cam.x + VIEW_W + 16 || b.y < cam.y - 24 || b.y > cam.y + VIEW_H + 24) { b.dead = true; continue; }
      if (this.solidAt(b.x, b.y)) {
        b.dead = true;
        this.events.push({ type: 'spark', x: b.x, y: b.y });
        continue;
      }
      const box = bulletBox(b);
      for (const e of this.enemies) {
        if (!e.shootable || !isActiveBody(e) || !canHit(b, e.id)) continue;
        if (!overlaps(box, e)) continue;
        markHit(b, e.id);
        this.damageEnemy(e, b.damage);
        if (b.dead) break;
      }
      if (b.dead) continue;
      if (boss && bossVulnerable(boss) && canHit(b, -1) && overlaps(box, bossBox(boss))) {
        markHit(b, -1);
        this.hitBoss(b.damage);
        this.events.push({ type: 'bossHit', x: b.x, y: b.y });
        if (b.dead) continue;
      }
      for (const s of this.shots) {
        if (s.hp <= 0 || s.dead || !canHit(b, s.uid)) continue;
        if (!overlaps(box, shotBox(s))) continue;
        markHit(b, s.uid);
        s.hp -= b.damage;
        if (s.hp <= 0) {
          s.dead = true;
          this.addScore(50);
          this.events.push({ type: 'explode', x: s.x, y: s.y, size: 1 });
        }
        if (b.dead) break;
      }
      if (b.dead) continue;
      for (const item of this.items) {
        if (item.state !== 'pod') continue;
        if (overlaps(box, { x: item.x - 7, y: item.y - 6, w: 14, h: 12 })) {
          item.state = 'drop';
          item.vy = -80;
          b.dead = !b.pierce;
          this.events.push({ type: 'podOpen', x: item.x, y: item.y, kind: item.kind });
          break;
        }
      }
    }
  }

  updateShots(dt) {
    const cam = this.camera;
    const arena = this.arena && this.arena.active ? this.arena : null;
    for (const s of this.shots) {
      s.age += dt;
      if (s.age >= s.life) { s.dead = true; continue; }
      if (s.gravity && !s.rolling) s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.absolute) continue;
      if (s.kind === 'barrel') {
        const floorY = this.standAt(s.x, s.y + s.r, s.y + s.r - s.vy * dt - 1);
        if (floorY !== null && s.vy > 0) {
          s.y = floorY - s.r;
          if (s.vy > 80) s.vy = -s.vy * 0.35;
          else { s.vy = 0; s.rolling = true; }
        }
        if (s.rolling && this.standAt(s.x, s.y + s.r + 2, s.y + s.r) === null) s.rolling = false;
        if (arena && (s.x < arena.x0 + 4 || s.x > arena.x1 - 4)) s.dead = true;
      } else if (s.kind === 'wave' || s.kind === 'torpedo') {
        if (arena && (s.x < arena.x0 || s.x > arena.x1)) s.dead = true;
      } else if (this.solidAt(s.x, s.y)) {
        s.dead = true;
        if (s.kind !== 'shot') this.events.push({ type: s.kind === 'rock' ? 'rubble' : 'burst', x: s.x, y: s.y });
      }
      if (s.x < cam.x - 60 || s.x > cam.x + VIEW_W + 60 || s.y > this.height + 20 || s.y < -60) s.dead = true;
    }
  }

  updateContacts() {
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      const box = hurtbox(p);
      for (const s of this.shots) {
        if (s.dead || !overlaps(box, shotHurtBox(s))) continue;
        if (p.invuln > 0) continue;
        if (s.kind === 'shot' || s.kind === 'fire' || s.kind === 'rock' || s.kind === 'shell' || s.kind === 'torpedo') s.dead = true;
        this.hurtPlayer(p, 'shot');
      }
      for (const e of this.enemies) {
        if (!isActiveBody(e) || !overlaps(box, { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 2 })) continue;
        if (e.harmless) {
          if (p.mode !== 'stun' && p.onGround && p.invuln <= 0) {
            this.releaseVine(p);
            p.mode = 'stun';
            p.stun = PHYS.stunTime;
            p.vx = -50;
            p.invuln = 0.7;
            this.events.push({ type: 'trip', x: p.x + p.w / 2, y: p.y + p.h, player: p.id });
          }
          continue;
        }
        this.hurtPlayer(p, 'enemy');
      }
      const boss = this.boss;
      if (boss && bossVulnerable(boss) && overlaps(box, bossBox(boss))) this.hurtPlayer(p, 'boss');
    }
  }

  updateItems(dt) {
    for (const item of this.items) {
      if (item.state === 'taken') continue;
      if (item.state === 'pod') item.y = item.baseY + Math.sin(this.t * 3 + item.id) * 2;
      if (item.state === 'drop') {
        item.vy = Math.min(220, item.vy + 600 * dt);
        const next = item.y + item.vy * dt;
        const floor = this.standAt(item.x, next + 6, item.y + 5);
        if (floor !== null && item.vy > 0) { item.y = floor - 6; item.vy = 0; }
        else item.y = next;
        if (item.y > this.height) item.state = 'taken';
      }
      const box = { x: item.x - 8, y: item.y - 8, w: 16, h: 16 };
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        if (!overlaps(box, { x: p.x - 2, y: p.y - 2, w: p.w + 4, h: p.h + 4 })) continue;
        this.collect(p, item);
        break;
      }
    }
  }

  collect(p, item) {
    item.state = 'taken';
    const kind = item.kind;
    if (TREASURES.has(kind)) {
      this.stats.treasures += 1;
      this.run.treasures += 1;
      this.addScore(TREASURE_VALUE[kind]);
      this.events.push({ type: 'treasure', kind, x: item.x, y: item.y, score: TREASURE_VALUE[kind] });
      return;
    }
    if (WEAPONS[kind]) {
      p.gun.id = kind;
      this.addScore(500);
    } else if (kind === 'bomb') {
      p.bombs = Math.min(BOMB_MAX, p.bombs + 1);
      this.addScore(300);
    } else if (kind === 'heart') {
      if (this.run.mode === 'adventure' && p.hearts < this.rules.hearts) p.hearts = this.rules.hearts;
      else { this.run.lives[p.id] += 1; this.events.push({ type: 'oneUp' }); }
    }
    this.syncRun();
    this.events.push({ type: 'powerup', kind, x: item.x, y: item.y, player: p.id });
  }

  // ------------------------------------------------------------- results

  /** After a game over: spend a continue and pick up from the last checkpoint. */
  continueGame() {
    if (this.status !== 'over') return false;
    if (this.run.continuesLeft <= 0) return false;
    this.run.continuesLeft -= 1;
    if (this.run.mode === 'arcade') this.run.score = 0;
    this.run.nextLife = Math.max(EXTRA_LIFE_EVERY, Math.ceil((this.run.score + 1) / EXTRA_LIFE_EVERY) * EXTRA_LIFE_EVERY);
    const spot = this.respawnPoint();
    this.players.forEach((p, i) => {
      this.run.lives[i] = this.rules.lives;
      p.state = 'alive';
      this.revive(p, spot.x - i * 18 - p.w / 2, spot.y - p.h);
      p.safe = { x: p.x, y: p.y };
    });
    this.shots.length = 0;
    this.status = 'play';
    this.events.push({ type: 'continue' });
    return true;
  }

  respawnPoint() {
    if (this.arena && this.arena.active) return { x: this.arena.x0 + 40, y: this.arena.floor };
    const cp = this.level.checkpoints[this.checkpoint];
    return cp ? { x: cp.x, y: cp.y } : { ...this.level.start };
  }

  result() {
    const timeBonus = Math.max(0, Math.round((240 - this.stats.time) * 20 / 10) * 10);
    const treasureBonus = this.stats.treasures * 1000;
    const flawless = this.stats.hits === 0 ? 5000 : 0;
    return {
      stage: this.stageIndex,
      time: this.stats.time,
      kills: this.stats.kills,
      treasures: this.stats.treasures,
      treasureTotal: this.stats.treasureTotal,
      hits: this.stats.hits,
      deaths: this.stats.deaths,
      timeBonus,
      treasureBonus,
      flawless,
      bonus: timeBonus + treasureBonus + flawless,
    };
  }

  /** Bank the stage-clear bonus into the run (call once). */
  bankClear() {
    const res = this.result();
    this.addScore(res.bonus);
    this.syncRun();
    return res;
  }

  /** Copies of the player and vines for the autopilot's look-ahead. */
  lookahead(p) {
    return { player: clonePlayer(p), vines: this.vines.map((v) => ({ ...v })) };
  }
}

export function shotBox(s) {
  if (s.absolute) return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.w) return { x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h };
  return { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
}

/** Enemy shots hurt with a slightly smaller box than they look: near misses feel good. */
export function shotHurtBox(s) {
  const box = shotBox(s);
  const inset = s.absolute ? 1 : Math.min(2, box.w * 0.2);
  return { x: box.x + inset, y: box.y + inset, w: Math.max(1, box.w - inset * 2), h: Math.max(1, box.h - inset * 2) };
}
