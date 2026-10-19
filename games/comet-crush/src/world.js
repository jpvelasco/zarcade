// The Comet Crush simulation. DOM-free and deterministic for a given level
// and seed: the browser, the tests and the autopilot all drive it through
// step(dt, controls). Renderers read its state and the `events` list.
//
// controls = { targetX: number|null, axis: -1..1, launch: bool, fire: bool }
//   targetX  direct paddle target (mouse / touch); null for keyboard/gamepad
//   axis     keyboard / gamepad steering
//   launch   pressed this step: release a caught comet
//   fire     held: shoot the lasers faster
import { FIELD, GRID, PADDLE, BALL, TIMING, LASER, CAPSULE } from './config.js';
import { mulberry32, clamp, pickWeighted } from './math.js';
import { LEVELS, CONSTELLATIONS, MOVE, parseLevel } from './levels.js';
import { circleRect, reflect, keepVertical, paddleBounce, rotate, normalize } from './physics.js';
import { POWERUPS, TIMED, dropTable } from './powerups.js';
import { createBoss, updateBoss } from './boss.js';

const TOUGH_HP = { T: 2, U: 3 };
const POINTS = { normal: 50, tough: 100, explosive: 60, star: 200, moving: 80, part: 40 };
const NO_CONTROLS = { targetX: null, axis: 0, launch: false, fire: false };

export class World {
  constructor(levelIndex = 0, opts = {}) {
    this.levelIndex = clamp(levelIndex | 0, 0, LEVELS.length - 1);
    this.level = LEVELS[this.levelIndex];
    this.constellation = CONSTELLATIONS[this.level.c];
    this.rng = mulberry32(opts.seed ?? (this.levelIndex + 1) * 7919);
    this.lives = opts.lives ?? 3;
    this.score = opts.score ?? 0;
    this.time = 0;
    this.status = 'playing'; // playing | clearing | cleared | gameover
    this.statusTimer = 0;
    this.events = [];
    this.nextId = 1;

    this.paddle = { x: FIELD.w / 2, vx: 0, kv: 0, w: PADDLE.w, sleepy: 0, squash: 0 };
    this.balls = [];
    this.bricks = [];
    this.capsules = [];
    this.lasers = [];
    this.shots = [];
    this.tokens = [];
    this.pending = [];
    this.effects = Object.fromEntries(TIMED.map((k) => [k, 0]));
    this.shield = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.livesLost = 0;
    this.paddleHits = 0;
    this.bricksBroken = 0;
    this.starsCaught = 0;
    this.sinceHit = 0;
    this.sinceLaser = 0;
    this.ramp = 0;
    this.baseSpeed = 360 + this.level.c * 22 + this.level.n * 6;
    this.dropRate = opts.dropRate ?? 0.13;

    const { cells, portals } = parseLevel(this.level);
    for (const cell of cells) this.addGridBrick(cell);
    this.portals = portals.A && portals.B ? [cellCenter(portals.A), cellCenter(portals.B)] : [];
    this.boss = this.level.boss ? createBoss(this, this.level.boss) : null;
    this.serve();
  }

  emit(e) {
    this.events.push(e);
  }

  // ------------------------------------------------------------ bricks

  addBrick(o) {
    const b = {
      id: this.nextId++, x: o.x ?? 0, y: o.y ?? 0, w: o.w ?? GRID.bw, h: o.h ?? GRID.bh,
      kind: o.kind, hp: o.hp ?? 1, maxHp: o.hp ?? 1, color: o.color, alive: true, flash: 0,
      homeX: o.x ?? 0, skin: o.skin ?? null, part: o.part ?? null,
    };
    this.bricks.push(b);
    return b;
  }

  addGridBrick({ col, row, ch }) {
    const pal = this.constellation.palette;
    const base = { x: GRID.x + col * GRID.bw, y: GRID.y + row * GRID.bh };
    if (ch >= '1' && ch <= '6') return this.addBrick({ ...base, kind: 'normal', color: pal[ch - 1] });
    if (ch === 'T' || ch === 'U') return this.addBrick({ ...base, kind: 'tough', hp: TOUGH_HP[ch], color: pal[4] });
    if (ch === 'M') return this.addBrick({ ...base, kind: 'metal', hp: Infinity, color: '#aab4d4' });
    if (ch === 'X') return this.addBrick({ ...base, kind: 'explosive', color: '#ff5a36' });
    if (ch === 'S') return this.addBrick({ ...base, kind: 'star', color: '#ffe066' });
    if (ch === '~') return this.addBrick({ ...base, kind: 'moving', color: pal[1] });
    throw new Error(`Unknown brick "${ch}"`);
  }

  remaining() {
    let n = 0;
    for (const b of this.bricks) if (b.alive && b.kind !== 'metal' && !b.part) n++;
    return n;
  }

  ballOverlaps(rect) {
    return this.balls.some((b) => circleRect(b.x, b.y, b.r + 2, rect.x, rect.y, rect.w, rect.h));
  }

  multiplier() {
    return Math.min(5, 1 + Math.floor(this.combo / 5)) * (this.effects.disco > 0 ? 2 : 1);
  }

  addScore(points, x, y) {
    const p = points * this.multiplier();
    this.score += p;
    if (x !== undefined) this.emit({ type: 'score', points: p, x, y });
    return p;
  }

  hitBrick(b, dmg, cause) {
    if (!b.alive) return;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (b.kind === 'metal') {
      this.emit({ type: 'metal', x: cx, y: cy });
      return;
    }
    this.sinceHit = 0;
    b.hp -= dmg;
    b.flash = 1;
    if (b.hp > 0) {
      this.addScore(20);
      this.emit({ type: 'crack', x: cx, y: cy, color: b.color, hp: b.hp });
      return;
    }
    b.alive = false;
    this.bricksBroken++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = TIMING.comboWindow;
    this.ramp = Math.min(BALL.maxSpeedBoost, this.ramp + 1.2);
    const pts = this.addScore(b.part ? POINTS.part : POINTS[b.kind], cx, cy);
    this.emit({ type: 'brick', x: cx, y: cy, w: b.w, h: b.h, color: b.color, kind: b.kind, skin: b.skin, combo: this.combo, points: pts, cause });
    if (b.part) b.part.timer = b.part.regrow;
    if (b.kind === 'explosive') this.pending.push({ t: 0.09, x: cx, y: cy });
    if (b.kind === 'star') this.tokens.push({ x: cx, y: cy, vy: 120, t: 0 });
    if (this.capsules.length < 3 && this.rng() < this.dropRate) this.spawnCapsule(pickWeighted(this.rng, dropTable(this.lives)), cx, cy);
  }

  spawnCapsule(kind, x, y) {
    this.capsules.push({ kind, x: clamp(x, CAPSULE.w / 2, FIELD.w - CAPSULE.w / 2), y, t: 0 });
    this.emit({ type: 'drop', kind, x, y });
  }

  explode(p) {
    this.emit({ type: 'explode', x: p.x, y: p.y });
    for (const b of this.bricks) {
      if (!b.alive) continue;
      const dx = Math.abs(b.x + b.w / 2 - p.x), dy = Math.abs(b.y + b.h / 2 - p.y);
      if (dx <= GRID.bw * 1.25 && dy <= GRID.bh * 1.25) this.hitBrick(b, 2, 'blast');
    }
  }

  // ------------------------------------------------------------ boss

  damageBoss(amount, x, y) {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    this.sinceHit = 0;
    if (boss.invuln > 0) return;
    boss.invuln = 0.1;
    boss.hp = Math.max(0, boss.hp - amount);
    boss.flash = 1;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = TIMING.comboWindow;
    this.addScore(60 * amount, x, y);
    this.emit({ type: 'bossHit', x, y, hp: boss.hp, combo: this.combo });
    if (boss.hp <= 0) {
      boss.dead = true;
      for (const part of boss.parts) if (part.alive) { part.alive = false; this.emit({ type: 'brick', x: part.x + part.w / 2, y: part.y + part.h / 2, w: part.w, h: part.h, color: part.color, kind: part.kind, skin: part.skin, combo: this.combo }); }
      for (const part of boss.parts) part.part.regrow = 0;
      this.shots.length = 0;
      this.addScore(5000, boss.x, boss.y);
      this.emit({ type: 'bossDefeat', x: boss.x, y: boss.y, kind: boss.kind });
    }
  }

  spawnShot(kind, boss) {
    const p = this.paddle;
    if (kind === 'meteor') {
      const side = boss.shots % 2 ? 1 : -1;
      const x = boss.x + side * boss.w * 0.36, y = boss.y + boss.h * 0.3;
      const tx = p.x + (this.rng() - 0.5) * 120;
      const ty = PADDLE.y;
      const d = Math.hypot(tx - x, ty - y);
      this.shots.push({ kind, x, y, vx: ((tx - x) / d) * 175, vy: ((ty - y) / d) * 175, r: 11, t: 0 });
    } else {
      this.shots.push({ kind, x: boss.x, y: boss.y + boss.h / 2, vx: (this.rng() - 0.5) * 40, vy: 85, r: 13, t: this.rng() * 6 });
    }
    this.emit({ type: 'shoot', kind, x: boss.x, y: boss.y });
  }

  // ------------------------------------------------------------ balls

  makeBall(x, y, dx, dy) {
    return { id: this.nextId++, x, y, dx, dy, r: this.effects.big > 0 ? BALL.bigR : BALL.r, stuck: false, offset: 0, stuckTime: 0, serve: false, portalCd: 0, lost: false };
  }

  serve() {
    const b = this.makeBall(this.paddle.x, PADDLE.y - PADDLE.h / 2 - BALL.r, 0, -1);
    b.stuck = true;
    b.serve = true;
    b.offset = 0;
    this.balls = [b];
    this.sinceHit = 0;
  }

  release(ball) {
    const half = this.paddle.w / 2;
    let off = ball.offset / half;
    if (ball.serve && Math.abs(off) < 0.15) off = this.rng() < 0.5 ? -0.25 : 0.25;
    const d = paddleBounce(off * 0.85);
    ball.dx = d.dx;
    ball.dy = d.dy;
    ball.stuck = false;
    ball.serve = false;
    this.emit({ type: 'launch', x: ball.x, y: ball.y });
  }

  speed() {
    return (this.baseSpeed + this.ramp) * (this.effects.slow > 0 ? 0.62 : 1);
  }

  moveBall(ball, dt) {
    const dist = this.speed() * dt;
    const n = Math.max(1, Math.ceil(dist / (ball.r * 0.5)));
    const sub = dist / n;
    for (let i = 0; i < n && !ball.lost && !ball.stuck; i++) {
      ball.x += ball.dx * sub;
      ball.y += ball.dy * sub;
      this.collideWalls(ball);
      this.collideBricks(ball);
      if (this.boss && !this.boss.dead) this.collideBoss(ball);
      this.collidePaddle(ball);
      this.collidePortals(ball);
      this.collideShots(ball);
      if (ball.y - ball.r > FIELD.h) ball.lost = true;
    }
  }

  collideWalls(ball) {
    const r = ball.r;
    let hit = false;
    if (ball.x < r) { ball.x = r; if (ball.dx < 0) { ball.dx = -ball.dx; hit = true; } }
    if (ball.x > FIELD.w - r) { ball.x = FIELD.w - r; if (ball.dx > 0) { ball.dx = -ball.dx; hit = true; } }
    if (ball.y < FIELD.top + r) { ball.y = FIELD.top + r; if (ball.dy < 0) { ball.dy = -ball.dy; hit = true; } }
    if (this.shield > 0 && ball.dy > 0 && ball.y + r >= FIELD.h - 18) {
      ball.y = FIELD.h - 18 - r;
      ball.dy = -Math.abs(ball.dy);
      this.shield--;
      this.emit({ type: 'shield', x: ball.x, y: FIELD.h - 18, left: this.shield });
      hit = false;
    }
    if (hit) {
      keepVertical(ball);
      this.emit({ type: 'wall', x: ball.x, y: ball.y, duck: this.effects.duck > 0 });
      if (this.effects.duck > 0) this.addScore(10);
    }
  }

  collideBricks(ball) {
    const fire = this.effects.fire > 0;
    for (let pass = 0; pass < 3; pass++) {
      let best = null, bestHit = null;
      for (const b of this.bricks) {
        if (!b.alive) continue;
        if (ball.x + ball.r < b.x || ball.x - ball.r > b.x + b.w || ball.y + ball.r < b.y || ball.y - ball.r > b.y + b.h) continue;
        const hit = circleRect(ball.x, ball.y, ball.r, b.x, b.y, b.w, b.h);
        if (hit && (!bestHit || hit.depth > bestHit.depth)) { best = b; bestHit = hit; }
      }
      if (!best) return;
      if (fire && best.kind !== 'metal') {
        this.hitBrick(best, 99, 'fire');
        continue;
      }
      ball.x += bestHit.nx * bestHit.depth;
      ball.y += bestHit.ny * bestHit.depth;
      reflect(ball, bestHit.nx, bestHit.ny);
      keepVertical(ball);
      this.hitBrick(best, 1, 'ball');
    }
  }

  collideBoss(ball) {
    const bs = this.boss;
    const hit = circleRect(ball.x, ball.y, ball.r, bs.x - bs.w / 2, bs.y - bs.h / 2, bs.w, bs.h);
    if (!hit) return;
    ball.x += hit.nx * hit.depth;
    ball.y += hit.ny * hit.depth;
    reflect(ball, hit.nx, hit.ny);
    keepVertical(ball);
    this.damageBoss(this.effects.fire > 0 ? 5 : 3, ball.x - hit.nx * ball.r, ball.y - hit.ny * ball.r);
  }

  collidePaddle(ball) {
    const p = this.paddle;
    const top = PADDLE.y - PADDLE.h / 2;
    if (ball.dy <= 0) return;
    if (ball.y + ball.r < top || ball.y > PADDLE.y + 4) return;
    if (ball.x < p.x - p.w / 2 - ball.r * 0.7 || ball.x > p.x + p.w / 2 + ball.r * 0.7) return;
    ball.y = top - ball.r;
    const offset = (ball.x - p.x) / (p.w / 2 + ball.r * 0.5);
    const d = paddleBounce(offset, p.vx);
    ball.dx = d.dx;
    ball.dy = d.dy;
    p.squash = 1;
    this.paddleHits++;
    this.emit({ type: 'paddle', x: ball.x, y: top, offset, duck: this.effects.duck > 0 });
    if (this.effects.sticky > 0) {
      ball.stuck = true;
      ball.stuckTime = 0;
      ball.offset = clamp(ball.x - p.x, -p.w / 2, p.w / 2);
      this.emit({ type: 'catch', x: ball.x, y: top });
    }
  }

  collidePortals(ball) {
    if (ball.portalCd > 0 || this.portals.length < 2) return;
    for (let i = 0; i < 2; i++) {
      const a = this.portals[i], b = this.portals[1 - i];
      if (Math.hypot(ball.x - a.x, ball.y - a.y) < 14) {
        ball.x = b.x;
        ball.y = b.y;
        ball.portalCd = 0.6;
        this.emit({ type: 'portal', from: a, to: b });
        return;
      }
    }
  }

  collideShots(ball) {
    for (const s of this.shots) {
      if (s.dead) continue;
      if (Math.hypot(ball.x - s.x, ball.y - s.y) < ball.r + s.r) {
        s.dead = true;
        this.addScore(100, s.x, s.y);
        this.emit({ type: 'pop', kind: s.kind, x: s.x, y: s.y });
      }
    }
  }

  // ------------------------------------------------------------ power-ups

  applyPower(kind) {
    const def = POWERUPS[kind];
    if (!def) return;
    if (def.time) this.effects[kind] = def.time;
    if (kind === 'multi') {
      const live = this.balls.filter((b) => !b.lost);
      for (const b of live) if (b.stuck) this.release(b);
      for (const b of live) {
        for (const a of [-0.45, 0.45]) {
          if (this.balls.length >= BALL.maxBalls) break;
          const nb = this.makeBall(b.x, b.y, b.dx, b.dy);
          rotate(nb, a);
          keepVertical(nb);
          this.balls.push(nb);
        }
      }
    } else if (kind === 'shield') {
      this.shield = Math.min(3, this.shield + 2);
    } else if (kind === 'life') {
      this.lives = Math.min(9, this.lives + 1);
    } else if (kind === 'big') {
      for (const b of this.balls) b.r = BALL.bigR;
    }
    this.emit({ type: 'power', kind, name: def.name, x: this.paddle.x, y: PADDLE.y });
  }

  expire(kind) {
    this.emit({ type: 'expire', kind });
    if (kind === 'sticky') for (const b of this.balls) if (b.stuck && !b.serve) this.release(b);
    if (kind === 'big') for (const b of this.balls) b.r = BALL.r;
  }

  // ------------------------------------------------------------ step

  step(dt, controls = NO_CONTROLS) {
    if (this.status === 'cleared' || this.status === 'gameover') return;
    this.time += dt;
    const c = controls;

    if (this.status === 'clearing') {
      this.statusTimer -= dt;
      if (this.statusTimer <= 0) {
        this.status = 'cleared';
        this.emit({ type: 'cleared' });
      }
    }

    for (const k of TIMED) {
      if (this.effects[k] > 0) {
        this.effects[k] -= dt;
        if (this.effects[k] <= 0) { this.effects[k] = 0; this.expire(k); }
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    for (const b of this.bricks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 5);

    this.updatePaddle(dt, c);
    this.updateMovers();
    if (this.boss) updateBoss(this, this.boss, dt);

    // Caught comets ride on the ship until launched.
    const p = this.paddle;
    for (const b of this.balls) {
      if (!b.stuck) continue;
      b.offset = clamp(b.offset, -p.w / 2, p.w / 2);
      b.x = p.x + b.offset;
      b.y = PADDLE.y - PADDLE.h / 2 - b.r;
      b.stuckTime += dt;
      if (c.launch || (!b.serve && b.stuckTime > TIMING.stickyRelease)) this.release(b);
    }

    this.updateLasers(dt, c);

    let moving = false;
    for (const b of this.balls) {
      if (b.stuck || b.lost) continue;
      moving = true;
      b.portalCd -= dt;
      this.moveBall(b, dt);
    }
    if (moving && this.status === 'playing') {
      this.ramp = Math.min(BALL.maxSpeedBoost, this.ramp + dt * 1.4);
      this.sinceHit += dt;
      if (this.sinceHit > TIMING.restless) {
        this.sinceHit = 0;
        for (const b of this.balls) {
          if (b.stuck) continue;
          rotate(b, (this.rng() < 0.5 ? -1 : 1) * (0.25 + this.rng() * 0.2));
          keepVertical(b, 0.45);
        }
        this.emit({ type: 'restless' });
      }
    }

    this.updateFalling(dt);
    this.updateShots(dt);

    for (const e of this.pending) e.t -= dt;
    const ready = this.pending.filter((e) => e.t <= 0);
    if (ready.length) {
      this.pending = this.pending.filter((e) => e.t > 0);
      for (const e of ready) this.explode(e);
    }

    this.checkLost();
    this.checkClear();
  }

  updatePaddle(dt, c) {
    const p = this.paddle;
    p.sleepy = Math.max(0, p.sleepy - dt);
    p.squash = Math.max(0, p.squash - dt * 5);
    const targetW = (this.effects.wide > 0 ? PADDLE.wideW : PADDLE.w) * (p.sleepy > 0 ? PADDLE.sleepyScale : 1);
    p.w += (targetW - p.w) * Math.min(1, dt * 10);
    const slow = p.sleepy > 0 ? 0.55 : 1;
    const lo = p.w / 2, hi = FIELD.w - p.w / 2;
    if (c.targetX !== null && c.targetX !== undefined) {
      const max = PADDLE.followSpeed * slow * dt;
      const d = clamp(clamp(c.targetX, lo, hi) - p.x, -max, max);
      p.x += d;
      p.vx = d / dt;
      p.kv = 0; // keyboard momentum does not carry over from the mouse
    } else {
      const axis = clamp(c.axis || 0, -1, 1);
      const want = axis * PADDLE.maxSpeed * slow;
      const accel = PADDLE.accel * (axis === 0 || Math.sign(axis) !== Math.sign(p.kv) ? 1.6 : 1);
      p.kv += clamp(want - p.kv, -accel * dt, accel * dt);
      p.x += p.kv * dt;
      p.vx = p.kv;
    }
    if (p.x < lo) { p.x = lo; p.vx = p.kv = 0; }
    if (p.x > hi) { p.x = hi; p.vx = p.kv = 0; }
  }

  updateMovers() {
    const off = Math.sin(this.time * MOVE.speed) * MOVE.amp;
    for (const b of this.bricks) if (b.kind === 'moving') b.x = b.homeX + off;
  }

  updateLasers(dt, c) {
    if (this.effects.laser > 0) {
      this.sinceLaser += dt;
      if (this.sinceLaser >= (c.fire ? LASER.cooldown : LASER.autoCooldown)) {
        this.sinceLaser = 0;
        const p = this.paddle, y = PADDLE.y - PADDLE.h / 2 - LASER.h;
        for (const s of [-1, 1]) this.lasers.push({ x: p.x + s * (p.w / 2 - 10), y });
        this.emit({ type: 'laser', x: p.x, y });
      }
    }
    for (const l of this.lasers) {
      l.y -= LASER.speed * dt;
      if (l.y < FIELD.top) { l.dead = true; continue; }
      for (const b of this.bricks) {
        if (b.alive && l.x + 2 > b.x && l.x - 2 < b.x + b.w && l.y < b.y + b.h && l.y + LASER.h > b.y) {
          this.hitBrick(b, 1, 'laser');
          l.dead = true;
          break;
        }
      }
      const bs = this.boss;
      if (!l.dead && bs && !bs.dead && Math.abs(l.x - bs.x) < bs.w / 2 && l.y < bs.y + bs.h / 2 && l.y + LASER.h > bs.y - bs.h / 2) {
        l.dead = true;
        this.damageBoss(1, l.x, l.y);
      }
      if (!l.dead) {
        for (const s of this.shots) {
          if (!s.dead && Math.abs(l.x - s.x) < s.r && Math.abs(l.y - s.y) < s.r + 8) {
            s.dead = l.dead = true;
            this.addScore(100, s.x, s.y);
            this.emit({ type: 'pop', kind: s.kind, x: s.x, y: s.y });
            break;
          }
        }
      }
    }
    this.lasers = this.lasers.filter((l) => !l.dead);
  }

  onPaddle(x, y, hw, hh) {
    const p = this.paddle;
    return Math.abs(x - p.x) < p.w / 2 + hw && y + hh > PADDLE.y - PADDLE.h / 2 && y - hh < PADDLE.y + PADDLE.h / 2;
  }

  updateFalling(dt) {
    const p = this.paddle;
    const magnet = this.effects.magnet > 0;
    for (const cap of this.capsules) {
      cap.t += dt;
      cap.y += CAPSULE.speed * dt;
      if (magnet && cap.y > 300) cap.x += clamp(p.x - cap.x, -260 * dt, 260 * dt);
      if (this.onPaddle(cap.x, cap.y, CAPSULE.w / 2, CAPSULE.h / 2)) {
        cap.dead = true;
        this.addScore(100);
        this.applyPower(cap.kind);
      } else if (cap.y > FIELD.h + 20) cap.dead = true;
    }
    this.capsules = this.capsules.filter((cp) => !cp.dead);
    for (const s of this.tokens) {
      s.t += dt;
      s.vy = Math.min(220, s.vy + 60 * dt);
      s.y += s.vy * dt;
      s.x += Math.sin(s.t * 4) * 30 * dt;
      if (magnet && s.y > 300) s.x += clamp(p.x - s.x, -260 * dt, 260 * dt);
      if (this.onPaddle(s.x, s.y, 12, 12)) {
        s.dead = true;
        this.starsCaught++;
        this.addScore(1000, s.x, s.y);
        this.emit({ type: 'star', x: s.x, y: s.y });
      } else if (s.y > FIELD.h + 20) s.dead = true;
    }
    this.tokens = this.tokens.filter((s) => !s.dead);
  }

  updateShots(dt) {
    for (const s of this.shots) {
      if (s.dead) continue;
      s.t += dt;
      s.x += (s.vx + (s.kind === 'bubble' ? Math.sin(s.t * 3) * 30 : 0)) * dt;
      s.y += s.vy * dt;
      if (s.x < s.r || s.x > FIELD.w - s.r) s.vx = -s.vx;
      if (this.onPaddle(s.x, s.y, s.r * 0.8, s.r * 0.8)) {
        s.dead = true;
        this.paddle.sleepy = 3.5;
        this.emit({ type: 'bonk', kind: s.kind, x: s.x, y: s.y });
      } else if (s.y > FIELD.h + 20) s.dead = true;
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }

  checkLost() {
    const before = this.balls.length;
    this.balls = this.balls.filter((b) => !b.lost);
    if (this.balls.length === before) return;
    if (this.balls.length > 0 || this.status !== 'playing') {
      if (this.balls.length === 0) this.serve();
      return;
    }
    this.lives--;
    this.livesLost++;
    this.combo = 0;
    this.comboTimer = 0;
    this.ramp *= 0.4;
    for (const k of TIMED) this.effects[k] = 0;
    this.capsules.length = 0;
    this.lasers.length = 0;
    this.emit({ type: 'lost', lives: this.lives });
    if (this.lives <= 0) {
      this.status = 'gameover';
      this.emit({ type: 'gameover' });
    } else this.serve();
  }

  checkClear() {
    if (this.status !== 'playing') return;
    const done = this.boss ? this.boss.dead : this.remaining() === 0;
    if (!done) return;
    this.status = 'clearing';
    this.statusTimer = this.boss ? TIMING.bossClearDelay : TIMING.clearDelay;
    this.clearBonus = 1000 + (this.livesLost === 0 ? 1500 : 0);
    this.score += this.clearBonus;
    this.capsules.length = 0;
    this.shots.length = 0;
    this.emit({ type: 'clear' });
  }

  // 1 star for clearing, 2 for losing at most one comet, 3 for a flawless clear.
  rating() {
    return this.livesLost === 0 ? 3 : this.livesLost === 1 ? 2 : 1;
  }
}

function cellCenter({ col, row }) {
  return { x: GRID.x + col * GRID.bw + GRID.bw / 2, y: GRID.y + row * GRID.bh + GRID.bh / 2 };
}
