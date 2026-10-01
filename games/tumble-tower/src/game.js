// Tumble Tower rules: the crane, turns, goal holds, splashes and modes.
// DOM-free; the renderer and sound only read state and `events`.
import { World, Body, boxShape } from './physics.js';
import { ANIMAL_BY_ID, animalShape, extentBelow, ICE_FRICTION, FRICTION } from './animals.js';
import { drawSequence, levelSequence } from './levels.js';

export const STEP = 1 / 60;
export const HOLD_SECONDS = 3;
export const MARGIN = 1; // metres above the goal for the height star
export const FALL_Y = -3; // below this a block has splashed into the sea
export const ENDLESS_HEARTS = 3;
export const DROP_GAP = 0.55; // metres between the held animal and the tower top
const MOVE_SPEED = 6; // m/s for keys / sticks
const TURN = Math.PI / 4;
const CALM_SPEED = 0.18, CALM_SPIN = 0.25;
const STEADY_SPEED = 0.45, STEADY_SPIN = 0.6;

export const PLAYER_COLORS = ['#ff7a59', '#3fa9ff', '#5fd35a', '#b57aff'];

// mode: climb | daily | endless | pass | attract
// level: a LEVELS entry (climb), a daily level, or null for endless/pass.
export class Game {
  constructor({ mode = 'climb', level = null, seed = 1, players = 2, pool = null, firstTurn = 0 } = {}) {
    this.mode = mode;
    this.goalMode = mode === 'climb' || mode === 'daily';
    this.level = level || { goal: null, limit: Infinity, par: 0, width: 6, pool: pool || { hippo: 3, turtle: 2, giraffe: 2, panda: 1 }, wind: null, ice: 0, mover: null, seed };
    this.seed = this.level.seed ?? seed;
    this.goal = this.goalMode ? this.level.goal : null;
    this.limit = this.goalMode ? this.level.limit : Infinity;
    this.players = mode === 'pass' ? Math.max(2, Math.min(4, players)) : 1;
    this.turn = mode === 'pass' ? Math.max(0, Math.min(this.players - 1, firstTurn)) : 0;
    this.time = 0;
    this.events = [];
    this.phase = 'aim'; // aim | settling | won | lost
    this.used = 0;
    this.splashes = 0;
    this.hearts = mode === 'endless' || mode === 'attract' ? ENDLESS_HEARTS : 0;
    this.holdTime = 0;
    this.top = 0; // steady tower height now
    this.bestTop = 0;
    this.milestone = 0;
    this.dropTimer = 0;
    this.lastDropper = 0;
    this.splashedThisTurn = false;
    this.loser = -1;
    this.result = null;
    this.endTimer = 0;
    this.sway = 0;
    this.windNow = 0;
    this.blocks = [];
    this.calmTime = 0; // how long everything has been still

    // pieces: climb/daily use a fixed sequence; the others draw as they go
    this.sequence = this.goalMode ? (this.level.sequence || levelSequence(this.level)) : [];
    this.drawn = 0;

    const w = this.level.wind;
    this.world = new World({ allowSleep: !w });
    this.world.onForce = (b) => this.pushWind(b);
    const width = this.level.width;
    const mv = this.level.mover;
    this.platform = new Body(boxShape(width, 1, 0.04), { kind: mv ? 'kinematic' : 'static', x: 0, y: -0.5, friction: 0.9 });
    if (mv) {
      const omega = mv.speed * Math.PI * 2 / 3;
      this.platform.drive = (t) => ({ x: Math.sin(t * omega) * mv.amp, y: -0.5, angle: mv.rock ? Math.sin(t * omega * 1.3 + 0.7) * mv.rock : 0 });
    }
    this.world.add(this.platform);
    this.reach = width / 2 + 2.6; // how far the crane can travel from centre
    this.held = null;
    this.craneY = 0;
    this.spawn();
  }

  // ---------------------------------------------------------- pieces

  nextPiece() {
    if (this.goalMode) return this.sequence[this.drawn] || null;
    // Endless / pass / attract: draw a few at a time from a seeded stream.
    while (this.sequence.length <= this.drawn) {
      const n = this.sequence.length;
      const ice = this.mode === 'endless' && this.bestTop > 12 ? Math.min(0.2, (this.bestTop - 12) * 0.02) : 0;
      this.sequence.push(...drawSequence(this.level.pool, 4, this.seed + n * 31, { ice, startIndex: n }));
    }
    return this.sequence[this.drawn];
  }

  // The animal after the one on the crane (or the next to arrive).
  peekNext() {
    if (this.goalMode && this.drawn >= this.limit) return null;
    return this.nextPiece();
  }

  remaining() {
    if (!this.goalMode) return Infinity;
    return this.limit - this.used;
  }

  spawn() {
    if (this.goalMode && this.used >= this.limit) { this.held = null; return false; }
    const p = this.nextPiece();
    if (!p) { this.held = null; return false; }
    this.drawn++;
    const shape = animalShape(p.animal);
    const x = this.held ? this.held.x : 0;
    this.held = { animal: p.animal, ice: p.ice, x: Math.max(-this.reach, Math.min(this.reach, x)), angle: 0, targetAngle: 0, radius: shape.radius, wobble: 0 };
    this.craneY = Math.max(this.craneY, this.safeY());
    this.events.push({ type: 'spawn', animal: p.animal, ice: p.ice, turn: this.turn });
    return true;
  }

  // Lowest crane height where the held animal (at its current angle)
  // clears everything built, plus a small gap.
  safeY() {
    let top = 0;
    for (const b of this.blocks) if (b.y > FALL_Y + 1 && b.maxY > top) top = b.maxY;
    const h = this.held;
    return top + DROP_GAP + (h ? extentBelow(h.animal, h.angle) : 1);
  }

  canDrop() {
    return this.phase === 'aim' && !!this.held && this.holdTime === 0;
  }

  drop() {
    if (!this.canDrop()) return false;
    const h = this.held;
    const a = ANIMAL_BY_ID[h.animal];
    const y = Math.max(this.craneY, this.safeY());
    const body = new Body(animalShape(h.animal), {
      x: h.x, y, angle: h.angle, density: a.density,
      friction: h.ice ? ICE_FRICTION : FRICTION,
      restitution: animalShape(h.animal).type === 'circle' ? 0.12 : 0.04,
      angularDamping: animalShape(h.animal).type === 'circle' ? 0.6 : 0.1,
      user: { animal: h.animal, ice: h.ice, player: this.turn, n: this.used, born: this.time },
    });
    this.world.add(body);
    this.blocks.push(body);
    this.used++;
    this.held = null;
    this.phase = 'settling';
    this.dropTimer = 0;
    this.lastDropper = this.turn;
    this.splashedThisTurn = false;
    this.events.push({ type: 'drop', animal: h.animal, x: h.x, y, turn: this.turn });
    return true;
  }

  // ---------------------------------------------------------- step

  // Wind blows harder higher up.
  pushWind(b) {
    if (!b.user || this.windNow === 0) return;
    const hf = Math.min(2, 0.7 + 0.06 * Math.max(0, b.y));
    b.fx += this.windNow * hf * b.shape.area;
  }

  windAt(t, top) {
    const w = this.level.wind;
    let s = 0;
    if (w) {
      const gust = 1 - w.gust * 0.5 + w.gust * 0.5 * Math.sin(t * 1.1 + 0.4) * Math.sin(t * 0.37 + 1.3);
      s = w.strength * gust * (w.flip ? Math.sin(t * Math.PI * 2 / 16) * 1.25 : 1);
    }
    if ((this.mode === 'endless') && top > 20) {
      s += Math.min(1.6, (top - 20) * 0.06) * (0.7 + 0.3 * Math.sin(t * 0.8)) * (Math.sin(t * 0.11) > 0 ? 1 : -1);
    }
    return s;
  }

  calm() {
    for (const b of this.blocks) {
      if (!b.awake) continue;
      if (b.speed() > CALM_SPEED || Math.abs(b.w) > CALM_SPIN) {
        if (this.platform.kind !== 'kinematic' || b.touching === 0) return false;
        // on a moving raft, calm means moving with the raft
        const dvx = b.vx - this.platform.vx;
        if (Math.abs(dvx) > CALM_SPEED * 2 || Math.abs(b.vy) > CALM_SPEED * 2 || Math.abs(b.w - this.platform.w) > CALM_SPIN) return false;
      }
    }
    return true;
  }

  steadyTop() {
    let top = 0;
    const kin = this.platform.kind === 'kinematic';
    for (const b of this.blocks) {
      if (b.touching === 0) continue;
      const vx = kin ? b.vx - this.platform.vx : b.vx;
      if (Math.hypot(vx, b.vy) > STEADY_SPEED || Math.abs(b.w) > STEADY_SPIN) continue;
      if (b.maxY > top) top = b.maxY;
    }
    return top;
  }

  step(dt = STEP, controls = {}) {
    this.time += dt;
    if (this.phase === 'won' || this.phase === 'lost') {
      this.endTimer += dt;
      this.physics(dt);
      return;
    }
    this.handleControls(dt, controls);
    this.physics(dt);
    this.rules(dt);
  }

  handleControls(dt, c) {
    const h = this.held;
    if (!h) return;
    if (c.snap) { h.x = c.snap.x; h.angle = h.targetAngle = c.snap.angle; }
    if (c.rotate) {
      h.targetAngle += c.rotate * TURN;
      this.events.push({ type: 'rotate', dir: c.rotate });
    }
    if (c.targetX != null) h.x += (c.targetX - h.x) * Math.min(1, dt * 18);
    else if (c.axis) h.x += c.axis * MOVE_SPEED * dt;
    h.x = Math.max(-this.reach, Math.min(this.reach, h.x));
    const da = h.targetAngle - h.angle;
    h.angle += Math.abs(da) < 0.002 ? da : da * Math.min(1, dt * 16);
    if (c.drop) this.drop();
  }

  physics(dt) {
    this.windNow = this.windAt(this.time, this.top);
    // Changing wind keeps the tower awake (Endless only gets a breeze up high).
    const sleepy = this.windNow === 0;
    if (this.world.allowSleep && !sleepy) for (const b of this.blocks) b.wake();
    this.world.allowSleep = sleepy;
    this.world.step(dt);
    for (const e of this.world.events) {
      if (e.type === 'impact') {
        const b = e.a.user ? e.a : e.b;
        this.events.push({ type: 'impact', x: e.x, y: e.y, speed: e.speed, animal: b.user ? b.user.animal : null, body: b });
      }
    }
    this.world.events.length = 0;
    // splashes
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b.y > FALL_Y && Math.abs(b.x) < 40) continue;
      this.world.remove(b);
      this.blocks.splice(i, 1);
      this.splashes++;
      this.splashedThisTurn = true;
      this.events.push({ type: 'splash', x: b.x, animal: b.user.animal });
      if (this.hearts > 0) this.hearts--;
    }
    let sway = 0;
    const kin = this.platform.kind === 'kinematic';
    for (const b of this.blocks) {
      if (b.touching === 0) continue;
      const v = Math.hypot(kin ? b.vx - this.platform.vx : b.vx, b.vy) + Math.abs(b.w - this.platform.w) * 0.5;
      if (v > sway) sway = v;
    }
    this.sway = sway;
    this.top = this.steadyTop();
    this.calmTime = this.calm() ? this.calmTime + dt : 0;
  }

  rules(dt) {
    const target = this.safeY();
    // the crane rises at once and sinks gently
    this.craneY = target > this.craneY ? target : this.craneY + (target - this.craneY) * Math.min(1, dt * 3);
    if (this.top > this.bestTop) {
      this.bestTop = this.top;
      const m = Math.floor(this.bestTop / 5) * 5;
      if (m > this.milestone && !this.goalMode) { this.milestone = m; this.events.push({ type: 'milestone', height: m }); }
    }

    if (this.mode === 'endless' || this.mode === 'attract') {
      if (this.hearts <= 0) return this.finish('lost', { reason: 'splashes' });
    }
    // Pass & Play: whoever dropped last when an animal splashes loses (a late
    // slide after the turn passed still counts against the wobbly builder).
    if (this.mode === 'pass' && this.splashedThisTurn) {
      this.loser = this.lastDropper;
      return this.finish('lost', { reason: 'topple', loser: this.loser });
    }

    // goal hold
    if (this.goalMode) {
      if (this.top >= this.goal && (this.phase !== 'settling' || this.dropTimer > 0.4)) {
        if (this.holdTime === 0) this.events.push({ type: 'hold-start' });
        const before = Math.floor(this.holdTime);
        this.holdTime += dt;
        if (Math.floor(this.holdTime) > before && this.holdTime < HOLD_SECONDS) this.events.push({ type: 'hold-tick', left: HOLD_SECONDS - Math.floor(this.holdTime) });
        if (this.holdTime >= HOLD_SECONDS) return this.win();
      } else if (this.holdTime > 0) {
        this.holdTime = 0;
        this.events.push({ type: 'hold-break' });
      }
    }

    if (this.phase === 'settling') {
      this.dropTimer += dt;
      const calm = this.calmTime > 0.3;
      const maxWait = this.mode === 'pass' ? 6 : 2.5;
      const ready = (calm && this.dropTimer > 0.5) || this.dropTimer > maxWait;
      if (this.goalMode && this.used >= this.limit) {
        // last animal: wait for calm (or a long time), then judge
        if (this.holdTime === 0 && ((calm && this.dropTimer > 0.8) || this.dropTimer > 8)) return this.finish('lost', { reason: 'out' });
        return;
      }
      if (ready) {
        this.phase = 'aim';
        if (this.mode === 'pass') {
          this.turn = (this.turn + 1) % this.players;
          this.events.push({ type: 'turn', turn: this.turn });
        }
        this.spawn();
      }
    }
  }

  // A copy for look-ahead (the planner). Shares read-only level data.
  clone() {
    const g = Object.create(Game.prototype);
    Object.assign(g, this);
    g.world = this.world.clone();
    const map = g.world.map;
    g.platform = map.get(this.platform);
    g.blocks = this.blocks.map((b) => map.get(b));
    g.world.onForce = (b) => g.pushWind(b);
    g.held = this.held ? { ...this.held } : null;
    g.events = [];
    g.sequence = this.sequence.slice();
    g.result = null;
    return g;
  }

  win() {
    const stars = 1 + (this.top >= this.goal + MARGIN ? 1 : 0) + (this.used <= this.level.par ? 1 : 0);
    this.finish('won', { stars, height: this.top, used: this.used, margin: this.top >= this.goal + MARGIN, par: this.used <= this.level.par });
  }

  finish(phase, result) {
    this.phase = phase;
    this.held = null;
    this.holdTime = 0;
    this.endTimer = 0;
    this.result = { ...result, height: result.height ?? this.bestTop, used: this.used, splashes: this.splashes, time: this.time };
    this.events.push({ type: phase === 'won' ? 'win' : 'lose', result: this.result });
  }
}
