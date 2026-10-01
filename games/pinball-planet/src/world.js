// The table simulation: balls, flippers, plunger, switches and devices.
// DOM-free. The renderer and sound read `world` and its `events`; they never
// change it. Call step() at the fixed STEP.
import { Flipper, makeBall, stepPhysics, crosses, STEP } from './physics.js';
import { buildColliders, FLIPPERS, PLUNGER, SERVE, HOLE, SENSORS, TABLE, BUMPERS, inShooterLane } from './table.js';
import { Rules } from './rules.js';
import { mulberry32 } from './rng.js';

export { STEP };

// Pull (0..1) to launch speed. The flat middle stretch is the skill-shot
// window: a medium pull crests the top arc gently and drops into the U-F-O
// lanes; a full pull sends the ball round the orbit.
export const PLUNGE = { pullTime: 0.85, curve: [[0, 1150], [0.32, 1625], [0.56, 1700], [1, 3850]] };
export function plungeSpeed(pull) {
  const p = Math.max(0, Math.min(1, pull));
  const c = PLUNGE.curve;
  for (let i = 1; i < c.length; i++) {
    if (p <= c[i][0]) {
      const t = (p - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
      return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t;
    }
  }
  return c[c.length - 1][1];
}

const BUMPER_KICK = 950;
const SLING_KICK = 650;
const TARGET_HIT = 110;
const NUDGE = { vx: 150, vy: -70, cooldown: 0.3 };
const SEARCH_AFTER = 5;
const HOLE_PULL = 2600;
const BETWEEN_BALLS = 3.4;
const SPIN_DECAY = 2.4;

export class World {
  constructor({ seed = 1, attract = false, balls } = {}) {
    this.seed = seed;
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.rules = new Rules({ seed, balls });
    this.rules.playing = false;
    this.colliders = buildColliders();
    this.targets = this.colliders.filter((c) => c.kind === 'target').sort((a, b) => a.id - b.id);
    this.plungerTip = this.colliders.find((c) => c.kind === 'plunger');
    this.flippers = FLIPPERS.map((f) => new Flipper(f));
    this.balls = [];
    this.nextBallId = 1;
    this.events = [];
    this.time = 0;
    this.state = attract ? 'attract' : 'idle'; // idle | attract | play | bonus | over
    this.plunger = { pull: 0, held: false, release: 0 };
    this.spinner = { angle: 0, vel: 0 };
    this.flash = { bumpers: BUMPERS.map(() => 0), slings: [0, 0], kickback: 0, kickbackX: 41, hole: 0 };
    this.cool = { bumpers: BUMPERS.map(() => 0), slings: [0, 0], nudge: 0 };
    this.ejects = []; // { t, ball }
    this.between = 0;
    this.lastBonus = null;
    this.prev = { left: false, right: false, plunge: false };
    this.gameTime = 0;
    this.hooks = {
      onHit: (b, c, speed, hit) => this.onHit(b, c, speed, hit),
      onFlipper: (b, f, speed) => { if (speed > 260) this.events.push({ type: 'flipHit', speed, x: b.x, y: b.y }); },
      onBallHit: (a, b, speed) => { if (speed > 200) this.events.push({ type: 'ballHit', speed, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); },
      afterMove: (b, h) => this.afterMove(b, h),
    };
    if (attract) this.serve({ auto: true });
  }

  get playing() { return this.state === 'play'; }

  startGame() {
    this.state = 'play';
    this.balls.length = 0;
    this.ejects.length = 0;
    this.rules.newGame();
    this.rules.startBall();
    this.resetTargets();
    this.gameTime = 0;
    this.flushRules();
    this.serve({});
    this.events.push({ type: 'gameStart' });
  }

  serve({ auto = false } = {}) {
    const b = makeBall(SERVE.x, SERVE.y);
    b.id = this.nextBallId++;
    b.auto = auto ? 0.55 + this.rng() * 0.3 : 0;
    b.still = 0; b.ax = b.x; b.ay = b.y;
    b.holeCool = 0;
    b.rampTop = false;
    this.balls.push(b);
    this.events.push({ type: 'serve', auto });
    return b;
  }

  // Balls still in play (on the table or held in the Black Hole).
  inPlay() { return this.balls.length; }

  shooterBall() {
    return this.balls.find((b) => !b.held && inShooterLane(b) && b.y > PLUNGER.restY - 60) || null;
  }

  resetTargets() {
    for (const t of this.targets) t.enabled = true;
  }

  // ------------------------------------------------------------ step

  step(dt, ctl = {}) {
    this.time += dt;
    const live = (this.state === 'play' && !this.rules.tilted) || this.state === 'attract';
    if (this.state === 'play') this.gameTime += dt;

    // Flippers, with lane change on each press.
    const [lf, rf] = this.flippers;
    const left = !!ctl.left && live, right = !!ctl.right && live;
    if (left && !this.prev.left) this.onFlipPress(-1, lf);
    if (right && !this.prev.right) this.onFlipPress(1, rf);
    if (!left && this.prev.left) this.events.push({ type: 'flipUp', side: 'left' });
    if (!right && this.prev.right) this.events.push({ type: 'flipUp', side: 'right' });
    lf.pressed = left; rf.pressed = right;
    lf.enabled = rf.enabled = live;
    this.prev.left = left; this.prev.right = right;

    // Plunger: hold to pull back, release to fire.
    const pl = this.plunger;
    const pulling = !!ctl.plunge && this.state !== 'over';
    if (pulling) {
      if (!pl.held) this.events.push({ type: 'plungerPull' });
      pl.held = true;
      // Touch swipes set the pull directly; keys and pads pull over time.
      pl.pull = ctl.pull != null ? ctl.pull : Math.min(1, pl.pull + dt / PLUNGE.pullTime);
    } else if (pl.held) {
      pl.held = false;
      this.launch(pl.pull);
      pl.release = pl.pull;
      pl.pull = 0;
    }
    if (pl.release > 0) pl.release = Math.max(0, pl.release - dt * 8);
    const tipY = PLUNGER.restY + PLUNGER.travel * (pl.held ? pl.pull : pl.release);
    this.plungerTip.ay = this.plungerTip.by = tipY;
    for (const b of this.balls) {
      if (b.auto > 0 && !b.held) {
        b.auto -= dt;
        if (b.auto <= 0) { b.auto = 0; this.launchBall(b, 2300 + this.rng() * 700, true); }
      }
    }

    // Nudge.
    if (this.cool.nudge > 0) this.cool.nudge -= dt;
    if (ctl.nudge && this.cool.nudge <= 0 && (this.state === 'play' || this.state === 'attract')) this.nudge(ctl.nudge);

    // Physics.
    for (const b of this.balls) {
      if (b.holeCool > 0) b.holeCool -= dt;
    }
    stepPhysics(this.balls, this.colliders, this.flippers, dt, this.hooks);

    this.updateDevices(dt);
    this.updateHole(dt);
    this.checkDrains();
    this.ballSearch(dt);

    if (this.state === 'play') this.rules.update(dt);
    if (this.state === 'bonus') {
      this.between -= dt;
      if (this.between <= 0) this.nextBall();
    }
    this.flushRules();
  }

  onFlipPress(dir, f) {
    this.events.push({ type: 'flip', side: f.side });
    if (this.state === 'play') this.rules.laneChange(dir, !!this.shooterBall());
  }

  launch(pull) {
    const b = this.shooterBall();
    if (!b) { this.events.push({ type: 'plungeEmpty' }); return; }
    if (b.y < PLUNGER.restY - b.r - 14) return; // already flying
    this.launchBall(b, plungeSpeed(pull), false, pull);
  }

  launchBall(b, speed, auto, pull = 1) {
    b.vy = -speed;
    b.vx = 0;
    b.auto = 0;
    this.events.push({ type: 'plunge', pull, auto });
    if (this.state === 'play') this.rules.onLaunch();
  }

  nudge(dir) {
    this.cool.nudge = NUDGE.cooldown;
    const result = this.state === 'play' ? this.rules.nudge() : 'ok';
    for (const b of this.balls) {
      if (b.held || inShooterLane(b)) continue;
      b.vx += dir * NUDGE.vx;
      b.vy += NUDGE.vy;
    }
    this.events.push({ type: 'nudge', dir, result });
  }

  // ------------------------------------------------------------ contacts

  onHit(b, c, speed, hit) {
    const live = !this.rules.tilted || this.state !== 'play';
    switch (c.kind) {
      case 'bumper': {
        if (!live || speed < 15 || this.cool.bumpers[c.id] > 0) break;
        const vn = b.vx * hit.nx + b.vy * hit.ny;
        const add = Math.max(BUMPER_KICK - vn, 300);
        b.vx += hit.nx * add; b.vy += hit.ny * add;
        this.cool.bumpers[c.id] = 0.06;
        this.flash.bumpers[c.id] = 1;
        this.events.push({ type: 'bumper', id: c.id, x: c.x, y: c.y });
        this.switchHit('bumper', c.x, c.y);
        break;
      }
      case 'sling': {
        const i = c.side === 'left' ? 0 : 1;
        // Only a hit on the face itself (not the corner posts) fires it.
        const { nx, ny } = c.kick;
        if (!live || speed < 80 || this.cool.slings[i] > 0 || nx * hit.nx + ny * hit.ny < 0.8) { this.impact(b, speed, 'rubber'); break; }
        b.vx += nx * SLING_KICK; b.vy += ny * SLING_KICK;
        this.cool.slings[i] = 0.12;
        this.flash.slings[i] = 1;
        this.events.push({ type: 'sling', side: c.side, x: b.x, y: b.y });
        this.switchHit('sling', b.x, b.y);
        break;
      }
      case 'target':
        if (speed >= TARGET_HIT) {
          c.enabled = false;
          this.events.push({ type: 'target', id: c.id, x: (c.ax + c.bx) / 2, y: c.ay });
          this.switchHit(`target${c.id}`, (c.ax + c.bx) / 2, c.ay);
        } else this.impact(b, speed, 'metal');
        break;
      case 'rubber': case 'post': this.impact(b, speed, 'rubber'); break;
      case 'ramp': this.impact(b, speed, 'plastic'); break;
      default: this.impact(b, speed, 'metal'); break;
    }
  }

  impact(b, speed, material) {
    if (speed > 280) this.events.push({ type: 'hit', material, speed, x: b.x, y: b.y });
  }

  switchHit(id, x, y) {
    if (this.state === 'play') this.rules.onSwitch(id, { x, y });
  }

  afterMove(b, h) {
    for (const s of SENSORS) {
      if (s.layer >= 0 && s.layer !== b.layer) continue;
      if (crosses(b.px, b.py, b.x, b.y, s.ax, s.ay, s.bx, s.by)) this.onSensor(s.id, b);
    }
    // The Black Hole's gravity well.
    if (b.layer === 0 && b.holeCool <= 0) {
      const dx = HOLE.x - b.x, dy = HOLE.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < HOLE.well && d > 0.01) {
        const a = HOLE_PULL * (1 - d / HOLE.well);
        b.vx += (dx / d) * a * h; b.vy += (dy / d) * a * h;
        if (d < 26) { const k = 1 - 3.2 * h; b.vx *= k; b.vy *= k; }
        if (d < HOLE.capture && Math.hypot(b.vx, b.vy) < 620) this.capture(b);
      }
    }
  }

  onSensor(id, b) {
    const up = b.y < b.py;
    switch (id) {
      case 'leftOrbit': case 'rightOrbit':
        this.events.push({ type: 'rollover', id, x: b.x, y: b.y });
        if (up) { this.events.push({ type: 'orbit', id }); this.switchHit(id, b.x, b.y); }
        break;
      case 'spinner': {
        const speed = Math.hypot(b.vx, b.vy);
        this.spinner.vel = Math.max(this.spinner.vel, speed / 50);
        this.events.push({ type: 'spinnerPass', speed });
        if (up && speed > 250) this.switchHit('spinner', b.x, b.y);
        break;
      }
      case 'kickback': case 'kickbackRight':
        // One kickback light guards both outlanes.
        if (!up && ((this.state === 'play' && this.rules.useKickback()) || this.state === 'attract')) {
          const right = id === 'kickbackRight';
          b.x = right ? 564 : 40; b.vx = right ? -25 : 25; b.vy = -2150;
          this.flash.kickback = 1;
          this.flash.kickbackX = right ? 563 : 41;
          this.events.push({ type: 'kickback', x: b.x, y: b.y });
        }
        break;
      case 'rampEntry':
        if (b.layer === 0 && up) {
          b.layer = 1; b.rampTop = false;
          this.events.push({ type: 'rampEnter' });
        } else if (b.layer === 1 && !up) {
          b.layer = 0;
          this.events.push({ type: 'rampFail' });
        }
        break;
      case 'rampTop':
        b.rampTop = true;
        break;
      case 'rampExit':
        if (b.layer === 1 && !up) {
          b.layer = 0;
          if (b.rampTop) {
            this.events.push({ type: 'ramp', x: b.x, y: b.y });
            this.switchHit('ramp', b.x, b.y);
          }
          b.rampTop = false;
        }
        break;
      default:
        this.events.push({ type: 'rollover', id, x: b.x, y: b.y });
        this.switchHit(id, b.x, b.y);
        break;
    }
  }

  // ------------------------------------------------------------ devices

  updateDevices(dt) {
    const sp = this.spinner;
    if (sp.vel > 0) {
      const before = Math.floor(sp.angle);
      sp.angle += sp.vel * dt;
      sp.vel *= Math.exp(-SPIN_DECAY * dt);
      if (sp.vel < 0.7) {
        // Coast to the next rest position, then stop.
        const restAt = Math.ceil(sp.angle * 2) / 2;
        if (restAt - sp.angle < 0.02) { sp.angle = restAt; sp.vel = 0; }
        else sp.vel = 0.7;
      }
      const revs = Math.floor(sp.angle) - before;
      for (let i = 0; i < revs; i++) {
        this.events.push({ type: 'spin' });
        if (this.state === 'play') this.rules.onSwitch('spin');
      }
      if (sp.angle > 1000) sp.angle -= 1000;
    }
    const decay = (v) => Math.max(0, v - dt * 5);
    const f = this.flash;
    for (let i = 0; i < f.bumpers.length; i++) { f.bumpers[i] = decay(f.bumpers[i]); this.cool.bumpers[i] -= dt; }
    for (let i = 0; i < 2; i++) { f.slings[i] = decay(f.slings[i]); this.cool.slings[i] -= dt; }
    f.kickback = decay(f.kickback);
    f.hole = Math.max(0, f.hole - dt * 1.5);
  }

  capture(b) {
    b.held = { kind: 'hole', t: 1.3 };
    b.x = HOLE.x; b.y = HOLE.y; b.vx = 0; b.vy = 0;
    this.flash.hole = 1;
    this.events.push({ type: 'holeIn', x: HOLE.x, y: HOLE.y });
    const decision = this.state === 'play' ? this.rules.onHole({ x: HOLE.x, y: HOLE.y }) : 'eject';
    if (decision === 'lock') {
      this.balls.splice(this.balls.indexOf(b), 1);
      this.events.push({ type: 'lock' });
      this.serve({ auto: true });
    } else if (decision === 'multiball') {
      b.held.t = 1.6;
      this.events.push({ type: 'multiball' });
      // The two locked balls come back out of the Black Hole too.
      for (let i = 0; i < 2; i++) {
        const extra = makeBall(HOLE.x, HOLE.y);
        extra.id = this.nextBallId++;
        extra.held = { kind: 'hole', t: 2.3 + i * 0.7 };
        extra.still = 0; extra.ax = extra.x; extra.ay = extra.y; extra.holeCool = 0; extra.rampTop = false; extra.auto = 0;
        this.balls.push(extra);
      }
    }
  }

  updateHole(dt) {
    for (const b of this.balls) {
      if (!b.held) continue;
      b.held.t -= dt;
      if (b.held.t > 0) continue;
      b.held = null;
      const a = Math.PI * 0.68 + (this.rng() - 0.5) * 0.3; // down and to the left
      const s = 660 + this.rng() * 80;
      b.x = HOLE.x + Math.cos(a) * 14; b.y = HOLE.y + Math.sin(a) * 14;
      b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s;
      b.holeCool = 0.8;
      b.layer = 0;
      this.events.push({ type: 'holeOut', x: HOLE.x, y: HOLE.y });
    }
  }

  checkDrains() {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.held || b.y < TABLE.h + b.r + 6) continue;
      this.balls.splice(i, 1);
      this.events.push({ type: 'drain', x: b.x });
      if (this.state === 'attract') { if (!this.balls.length) this.serve({ auto: true }); continue; }
      if (this.state !== 'play') continue;
      const decision = this.rules.onDrain(this.balls.length);
      if (decision === 'save') {
        this.events.push({ type: 'ballSave' });
        this.serve({ auto: true });
      } else if (decision === 'endBall') {
        this.state = 'bonus';
        const ball = this.rules.ball;
        this.lastBonus = this.rules.endBall();
        this.lastBonus.ball = ball;
        this.between = this.lastBonus.tilted ? 2.2 : BETWEEN_BALLS;
        this.events.push({ type: 'endBall', ball, bonus: this.lastBonus });
      }
    }
  }

  nextBall() {
    const next = this.lastBonus?.next;
    if (next === 'gameOver') {
      this.state = 'over';
      this.events.push({ type: 'gameOver', score: this.rules.score });
      return;
    }
    this.state = 'play';
    this.rules.startBall();
    this.resetTargets();
    if (next === 'shootAgain') this.rules.callout('shootAgain', 'SHOOT AGAIN', 'SAME PLAYER');
    this.serve({});
  }

  // A ball that hasn't moved for a while gets a gentle kick, like a real
  // machine's ball search.
  ballSearch(dt) {
    for (const b of this.balls) {
      if (b.held || inShooterLane(b)) { b.still = 0; continue; }
      if (Math.hypot(b.x - b.ax, b.y - b.ay) > 8) { b.ax = b.x; b.ay = b.y; b.still = 0; continue; }
      const cradled = b.y > 880 && this.flippers.some((f) => f.pressed);
      b.still = cradled ? 0 : b.still + dt;
      if (b.still > SEARCH_AFTER) {
        b.still = 0;
        b.vx = (this.rng() - 0.5) * 500;
        b.vy = -650;
        this.events.push({ type: 'search', x: b.x, y: b.y });
      }
    }
  }

  flushRules() {
    const ev = this.rules.events;
    if (!ev.length) return;
    for (const e of ev) {
      if (e.type === 'resetTargets') this.resetTargets();
      this.events.push(e);
    }
    ev.length = 0;
  }
}
