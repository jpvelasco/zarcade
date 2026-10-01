// One shooter's round: clock, spots, racks, scoring, on-fire streaks and
// trick-shot rules. DOM-free and deterministic. The player and a rival each
// get their own Round with the same rules.
import { STEP, RIM_Y, makeBall, stepBall, launchVelocity, hoopState } from './physics.js';
import { ELEV } from './shots.js';

export const COUNTDOWN = 2.4;
export const READY_GAP = 0.5;
export const SPOT_MOVE = 0.85;
export const RELEASE_Y = 2.1;
export const FIRE_RUN = 3;

const DEG = Math.PI / 180;

// Shooter floor position for a spot { d, a } (distance, degrees right of
// straight-on) around a hoop at (hx, hz).
export function spotPosition(spot, hx = 0, hz = 0) {
  const a = spot.a * DEG;
  return { x: hx + spot.d * Math.sin(a), z: hz - spot.d * Math.cos(a) };
}

export class Round {
  // rules: see modes.js. opts.countdown=false starts immediately.
  constructor(rules, { countdown = true } = {}) {
    this.rules = rules;
    this.hoop = { x: 0, y: RIM_Y, z: 0, motion: rules.motion || null };
    this.status = countdown ? 'countdown' : 'play';
    this.count = countdown ? COUNTDOWN : 0;
    this.time = 0; // seconds of play (drives moving hoops)
    this.timeLeft = rules.time || 0;
    this.ballsLeft = rules.balls || Infinity;
    this.balls = [];
    this.events = [];
    this.cooldown = 0;
    this.moving = 0; // > 0 while walking to a new spot
    this.spotIndex = 0;
    this.makesHere = 0;
    this.rack = 0;
    this.rackBall = 0;
    this.fire = false;
    this.swishRun = 0;
    this.nextId = 1;
    this.score = 0;
    this.stats = { shots: 0, makes: 0, swishes: 0, banks: 0, money: 0, fires: 0, bestRun: 0, buzzer: 0, valid: 0, tramps: 0, points: 0 };
    this._h = {};
    if (rules.racks) this.spotIndex = rules.racks[0].spot;
  }

  get spot() { return this.rules.spots[this.spotIndex]; }

  shooterPos() { return spotPosition(this.spot, this.hoop.x, this.hoop.z); }

  releasePoint() {
    const s = this.shooterPos();
    const dx = this.hoop.x - s.x, dz = this.hoop.z - s.z, d = Math.hypot(dx, dz) || 1;
    return { x: s.x + (dx / d) * 0.25, y: RELEASE_Y, z: s.z + (dz / d) * 0.25 };
  }

  hoopNow(out = this._h) { return hoopState(this.hoop, this.time, out); }

  // Trick-level props, placed along the shooter→hoop line.
  props() {
    const tr = this.rules.trick;
    if (!tr) return { blockers: null, tramp: null };
    if (this._propsFor === this.spotIndex) return this._props;
    const s = this.shooterPos();
    const at = (f) => ({ x: s.x + (this.hoop.x - s.x) * f, z: s.z + (this.hoop.z - s.z) * f });
    const blockers = (tr.blockers || []).map((b) => {
      const p = at(b.at);
      return { x: p.x, z: p.z, y: b.h / 2, hx: b.w / 2, hy: b.h / 2, hz: 0.22, sway: b.sway || null, h: b.h, w: b.w, look: b.look || 'bear' };
    });
    const tramp = tr.tramp ? { ...at(tr.tramp.at), r: tr.tramp.r } : null;
    this._propsFor = this.spotIndex;
    this._props = { blockers: blockers.length ? blockers : null, tramp };
    return this._props;
  }

  shotKind() {
    const need = this.rules.trick?.need;
    return need === 'bank' ? 'bank' : need === 'tramp' ? 'tramp' : 'normal';
  }

  shotSetup() {
    const { blockers, tramp } = this.props();
    const kind = this.shotKind();
    return {
      p0: this.releasePoint(),
      g: this.rules.g,
      hoop: this.hoop,
      time: this.time,
      blockers, tramp, kind,
      elev: this.rules.elev ?? (kind === 'bank' ? ELEV.bank : ELEV.normal),
    };
  }

  // Is the next ball a money ball?
  nextMoney() {
    const rk = this.rules.racks?.[this.rack];
    return !!rk && rk.money.includes(this.rackBall);
  }

  canShoot() {
    return this.status === 'play' && this.cooldown <= 0 && this.moving <= 0 && this.ballsLeft > 0;
  }

  // What's in the shooter's hands (for drawing), or null.
  held() {
    if (this.status === 'done' || this.ballsLeft <= 0 || this.status === 'buzzer') return null;
    return { money: this.nextMoney(), fire: this.fire, ready: this.canShoot() };
  }

  liveBalls() {
    let n = 0;
    for (const b of this.balls) if (!b.dead) n++;
    return n;
  }

  shoot(launch) {
    if (!this.canShoot()) return null;
    const ball = makeBall(this.releasePoint(), launchVelocity(launch.yaw, launch.elev, launch.speed), {
      id: this.nextId++,
      money: this.nextMoney(),
      fire: this.fire,
      resolved: false,
      yaw: launch.yaw,
    });
    this.balls.push(ball);
    this.stats.shots++;
    this.ballsLeft--;
    this.cooldown = READY_GAP;
    this.events.push({ type: 'shoot', ball });
    if (this.rules.racks) {
      this.rackBall++;
      if (this.rackBall >= this.rules.racks[this.rack].balls && this.rack + 1 < this.rules.racks.length) {
        this.rack++;
        this.rackBall = 0;
        this.moveTo(this.rules.racks[this.rack].spot);
        this.events.push({ type: 'rack', rack: this.rack });
      }
    }
    return ball;
  }

  moveTo(index) {
    if (index === this.spotIndex) return;
    this.spotIndex = index;
    this.moving = SPOT_MOVE;
    this.makesHere = 0;
    this.events.push({ type: 'spot', spot: index });
  }

  points(ball, swish, bank) {
    const fire = ball.fire ? 2 : 1;
    if (this.rules.trick) return 1;
    if (this.rules.racks) return (ball.money ? 2 : 1) * fire;
    return (2 + (swish ? 1 : 0) + (bank ? 1 : 0)) * fire;
  }

  valid(ball) {
    const need = this.rules.trick?.need;
    if (need === 'bank') return ball.boardBeforeMake;
    if (need === 'tramp') return ball.tramp;
    return true;
  }

  onMake(ball) {
    ball.resolved = true;
    const swish = !ball.rimBeforeMake && !ball.boardBeforeMake;
    const bank = ball.boardBeforeMake;
    const st = this.stats;
    if (!this.valid(ball)) {
      this.events.push({ type: 'invalid', ball, need: this.rules.trick.need });
      this.onMiss(ball, true);
      return;
    }
    const pts = this.points(ball, swish, bank);
    this.score += pts;
    st.points += pts;
    st.makes++;
    st.valid++;
    if (swish) st.swishes++;
    if (bank) st.banks++;
    if (ball.tramp) st.tramps++;
    if (ball.money) st.money++;
    const buzzer = this.status === 'buzzer';
    if (buzzer) st.buzzer++;
    if (swish) {
      this.swishRun++;
      st.bestRun = Math.max(st.bestRun, this.swishRun);
    } else this.swishRun = 0;
    this.events.push({ type: 'score', ball, points: pts, swish, bank, money: ball.money, fire: ball.fire, buzzer, run: this.swishRun });
    if (!this.fire && this.swishRun >= FIRE_RUN) {
      this.fire = true;
      st.fires++;
      this.events.push({ type: 'fire' });
    }
    if (this.rules.spotEvery && !this.rules.racks) {
      this.makesHere++;
      if (this.makesHere >= this.rules.spotEvery) this.moveTo((this.spotIndex + 1) % this.rules.spots.length);
    }
  }

  onMiss(ball, invalid = false) {
    ball.resolved = true;
    this.swishRun = 0;
    if (!invalid) this.events.push({ type: 'miss', ball });
    if (this.fire) {
      this.fire = false;
      this.events.push({ type: 'fireout' });
    }
  }

  step(dt) {
    if (this.status === 'done') return;
    if (this.status === 'countdown') {
      this.count -= dt;
      if (this.count <= 0) {
        this.status = 'play';
        this.events.push({ type: 'go' });
      }
      return;
    }
    this.time += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.moving > 0) this.moving -= dt;
    if (this.status === 'play' && this.rules.time) {
      const before = this.timeLeft;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (before > 5 && this.timeLeft <= 5) this.events.push({ type: 'hurry' });
      if (this.timeLeft <= 0) {
        this.status = 'buzzer';
        this.events.push({ type: 'buzzer' });
      }
    }
    if (this.status === 'play' && this.ballsLeft <= 0) this.status = 'buzzer';

    const { blockers, tramp } = this.props();
    const env = { g: this.rules.g, hoop: this.hoop, time: this.time - dt, blockers, tramp, rim: true };
    const evs = [];
    for (const ball of this.balls) {
      if (ball.dead) continue;
      evs.length = 0;
      stepBall(ball, env, dt, evs);
      for (const e of evs) {
        if (e.type === 'make') { if (!ball.resolved) this.onMake(ball); }
        else this.events.push(e);
      }
      if (!ball.resolved && !ball.made && (ball.floorHits > 0 || ball.dead)) this.onMiss(ball);
    }
    // Forget long-finished balls so arrays stay small.
    if (this.balls.length > 12) this.balls = this.balls.filter((b) => !b.dead);

    if (this.status === 'buzzer' && this.balls.every((b) => b.dead || b.resolved)) {
      this.status = 'done';
      this.events.push({ type: 'end', score: this.score });
    }
  }

  // Advance by `seconds` in fixed steps (tests and fast-forward).
  run(seconds, each) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n && this.status !== 'done'; i++) {
      each?.(this);
      this.step(STEP);
    }
  }
}
