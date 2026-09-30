import {
  BLOCK,
  centered,
  keepOnRoad,
  makeTraffic,
  nearestIntersection,
  nearestStreet,
  roadKind,
  routeBetween,
  trafficPosition,
} from './city.js';
import { makeContract } from './contracts.js';
import {
  approach,
  clamp,
  distance,
  dot,
  length,
  lerp,
  rng,
  wrapAngle,
} from './math.js';
import { statsFor } from './progress.js';
import { CHAPTERS, HALO_SCAN_LINES, JOBS_PER_CHAPTER } from './story.js';

export const CONTRACT_COUNT = JOBS_PER_CHAPTER;
const PLAYER_RADIUS = 13;
const TRAFFIC_RADIUS = 11;
const PATROL_RADIUS = 20;
const STOP_RADIUS = 52;
const RUNNER_RADIUS = 40;
const SPARK_RADIUS = 30;
export const SCAN_RANGE = 320;
export const SCAN_CONE = 0.62; // cosine of the scanner cone's half-angle
// Light spreads this far (in blocks) from every drop-off.
export const LIGHT_RADIUS = 2.2;

function directionTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function blockKey(column, row) {
  return `${column},${row}`;
}

// Screen-space steering for a street grid. The player holds the direction
// they want to go; this turns that wish into a direction the bike can take
// right now. Between intersections the bike keeps to its street, so a held
// turn waits for the next corner instead of steering into a wall.
export function assistDirection(position, velocity, heading, input) {
  const magnitude = Math.hypot(input.x, input.y);
  if (magnitude < 0.2) return null;
  const ix = input.x / magnitude;
  const iy = input.y / magnitude;
  const kind = roadKind(position.x, position.y);
  const travelX = Math.abs(velocity.x) > 20 ? Math.sign(velocity.x) : Math.sign(Math.round(Math.cos(heading) * 10));
  const travelY = Math.abs(velocity.y) > 20 ? Math.sign(velocity.y) : Math.sign(Math.round(Math.sin(heading) * 10));

  if (kind === 'vertical') {
    if (Math.abs(iy) >= 0.38) return { x: 0, y: Math.sign(iy) };
    const toward = Math.abs(velocity.y) > 20 ? travelY : Math.sign(nearestStreet(position.y) - position.y) || travelY || 1;
    return { x: 0, y: toward };
  }
  if (kind === 'horizontal') {
    if (Math.abs(ix) >= 0.38) return { x: Math.sign(ix), y: 0 };
    const toward = Math.abs(velocity.x) > 20 ? travelX : Math.sign(nearestStreet(position.x) - position.x) || travelX || 1;
    return { x: toward, y: 0 };
  }
  if (kind === 'intersection') {
    const movingVertically = Math.abs(velocity.y) > Math.abs(velocity.x);
    // A diagonal hold means "take the next turn", so ties go to the axis the
    // bike is not already travelling along.
    const wantsX = Math.abs(ix) > Math.abs(iy) + 0.01 ||
      (Math.abs(Math.abs(ix) - Math.abs(iy)) <= 0.01 && movingVertically);
    const offsetX = centered(position.x);
    const offsetY = centered(position.y);
    if (wantsX) {
      // Carry on to the middle of the crossing before turning, so the bike
      // leaves on the new street's centre line.
      const approaching = movingVertically && Math.abs(offsetY) > 16 && Math.sign(offsetY) !== Math.sign(velocity.y);
      return approaching ? { x: 0, y: Math.sign(velocity.y) } : { x: Math.sign(ix), y: 0 };
    }
    const approaching = !movingVertically && Math.abs(offsetX) > 16 && Math.sign(offsetX) !== Math.sign(velocity.x);
    return approaching ? { x: Math.sign(velocity.x), y: 0 } : { x: 0, y: Math.sign(iy) };
  }
  return { x: ix, y: iy };
}

function makePlayer(position, stats, heat = 0) {
  return {
    x: position.x,
    y: position.y,
    angle: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    charge: 46,
    maxCharge: stats.maxCharge,
    integrity: 100,
    flux: stats.flux,
    heat,
    scan: 0,
    scanCooldown: 0,
    dash: 0,
    dashCooldown: 0,
    pulse: 0,
    echoCooldown: 0,
    damageCooldown: 0,
    dashHeld: false,
    pulseHeld: false,
    echoHeld: false,
    carrying: false,
    drifting: false,
    slip: 0,
    style: 0,
    combo: 0,
    comboTimer: 0,
    trail: [],
    trailClock: 0,
  };
}

// One chapter of the story: three jobs in one district. The simulation has
// no DOM access: rendering, controls, audio, persistence and overlays all sit
// above this class and only read it.
export class World {
  constructor(seed = 9417, { chapter = 0, job = 0, stats = statsFor(), paint = '#3fe5ff' } = {}) {
    this.seed = seed | 0;
    this.chapter = clamp(chapter | 0, 0, CHAPTERS.length - 1);
    this.chapterDef = CHAPTERS[this.chapter];
    this.random = rng(this.seed ^ 0x41c64e6d ^ Math.imul(this.chapter + 1, 0x2545f491));
    this.stats = stats;
    this.paint = paint;
    this.events = [];
    this.time = 0;
    this.nightTime = 0;
    this.status = 'briefing'; // briefing | pickup | delivery | debrief | failed | chapter-complete
    this.contractIndex = 0;
    this.contractsDone = 0;
    this.totalCredits = 0;
    this.cityHeat = 0;
    this.currentResult = null;
    this.results = [];
    this.failure = null;
    this.traffic = makeTraffic(this.seed ^ Math.imul(this.chapter + 1, 0x632be5ab));
    this.patrols = [];
    this.echoes = [];
    this.lit = new Map(); // block key -> world time it lit up
    this.lightWaves = [];
    this.nextPatrolAt = 0;
    this.contractStart = { x: 0, y: 0 };
    this.player = makePlayer(this.contractStart, stats);
    this.contract = null;
    this.route = [];
    this.routeIndex = 0;
    this.prepareContract(clamp(job | 0, 0, CONTRACT_COUNT - 1), this.contractStart);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  get active() {
    return this.status === 'pickup' || this.status === 'delivery';
  }

  get leg() {
    return this.contract.legs[Math.min(this.legIndex, this.contract.legs.length - 1)];
  }

  get finalLeg() {
    return this.legIndex >= this.contract.legs.length - 1;
  }

  // The closest unfinished stop on the current leg.
  get target() {
    if (!this.contract) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const stop of this.leg) {
      if (stop.done) continue;
      const d = Math.abs(stop.x - this.player.x) + Math.abs(stop.y - this.player.y);
      if (d < bestDistance) {
        best = stop;
        bestDistance = d;
      }
    }
    return best;
  }

  get routeTarget() {
    return this.route[this.routeIndex] || this.target;
  }

  get activeEcho() {
    return this.echoes.find((echo) => echo.alive) || null;
  }

  get stopsLeft() {
    return this.leg.filter((stop) => !stop.done).length;
  }

  get sparksTaken() {
    return this.contract.sparks.filter((spark) => spark.taken).length;
  }

  prepareContract(index, from, { retry = false } = {}) {
    this.contractIndex = index;
    this.contractStart = nearestIntersection(from);
    this.contract = makeContract(this.seed, this.chapter, index, this.contractStart);
    const carryHeat = retry ? 0 : Math.min(30, this.cityHeat * 0.28);
    this.player = makePlayer(this.contractStart, this.stats, carryHeat);
    this.legIndex = 0;
    this.scans = 0;
    this.radioSent = new Set();
    this.runner = this.contract.runner
      ? { ...this.contract.runner, from: null, to: null, caught: false, speed: 0, angle: 0, panic: 0 }
      : null;
    this.patrols.length = 0;
    for (const post of this.contract.sentries) {
      this.patrols.push({
        mode: 'sentry',
        post: { x: post.x, y: post.y },
        base: post.base,
        sweep: post.sweep,
        phase: post.phase,
        alert: 0,
        x: post.x,
        y: post.y,
        vx: 0,
        vy: 0,
        angle: post.base,
        scan: 0,
        jammed: 0,
        radius: PATROL_RADIUS,
        flash: post.phase,
        side: 1,
        chasingEcho: false,
        hitCooldown: 0,
      });
    }
    this.echoes.length = 0;
    this.nextPatrolAt = this.time + 1.2;
    this.currentResult = null;
    this.failure = null;
    this.status = 'briefing';
    this.planRoute();
    const first = this.routeTarget;
    if (first) this.player.angle = directionTo(this.player, first);
  }

  planRoute() {
    const target = this.target;
    this.routeFor = target;
    this.routeCell = target ? `${nearestStreet(target.x)},${nearestStreet(target.y)}` : '';
    this.route = target ? routeBetween(this.player, target, this.contract.seed) : [];
    this.routeIndex = 0;
  }

  startContract() {
    if (this.status !== 'briefing') return false;
    this.status = 'pickup';
    this.contract.timeRemaining = this.contract.timeLimit;
    this.emit('dispatch', { contract: this.contract });
    return true;
  }

  retryContract() {
    if (this.status !== 'failed') return false;
    this.prepareContract(this.contractIndex, this.contractStart, { retry: true });
    return true;
  }

  restartContract() {
    this.prepareContract(this.contractIndex, this.contractStart, { retry: true });
    return true;
  }

  nextContract() {
    if (this.status !== 'debrief') return false;
    if (this.contractIndex + 1 >= CONTRACT_COUNT) {
      this.status = 'chapter-complete';
      this.emit('chapter-complete', { total: this.totalCredits, chapter: this.chapter, results: this.results });
      return false;
    }
    const last = this.contract.legs.at(-1)[0];
    this.prepareContract(this.contractIndex + 1, last);
    return true;
  }

  setStats(stats) {
    this.stats = stats;
    const player = this.player;
    player.maxCharge = stats.maxCharge;
    player.charge = Math.min(player.charge, stats.maxCharge);
    player.flux = Math.max(player.flux, stats.flux);
  }

  step(delta, input = {}) {
    if (!this.active) return;
    const dt = clamp(delta, 0, 0.05);
    if (dt <= 0) return;

    this.time += dt;
    this.nightTime += dt;
    this.contract.timeRemaining = (this.contract.timeRemaining ?? this.contract.timeLimit) - dt;

    this.stepAbilities(input);
    this.stepPlayer(dt, input);
    this.stepRunner(dt);
    this.stepTraffic(dt);
    this.stepEchoes(dt);
    this.stepPatrols(dt);
    this.checkTraffic();
    this.checkPatrols();
    this.checkSparks();
    this.checkTargets();
    if (!this.active) return;
    this.refreshRoute();
    this.advanceRoute();
    this.coolHeat(dt);

    if (this.active && this.contract.timeRemaining <= 0) this.fail('The window closed. Mara says: no worries, run it again!');
    if (this.active && this.player.integrity <= 0) {
      this.fail(this.player.carrying ? 'The cargo got too bumped around.' : 'The Nighthawk needs a tune-up.');
    }
  }

  stepAbilities(input) {
    const player = this.player;
    const dashPressed = !!input.dash && !player.dashHeld;
    const pulsePressed = !!input.pulse && !player.pulseHeld;
    const echoPressed = !!input.echo && !player.echoHeld;
    player.dashHeld = !!input.dash;
    player.pulseHeld = !!input.pulse;
    player.echoHeld = !!input.echo;

    if (dashPressed && player.dashCooldown <= 0) {
      if (player.charge >= this.stats.dashCost) {
        player.charge -= this.stats.dashCost;
        player.dash = 0.32;
        player.dashCooldown = 0.42;
        player.style += 12;
        this.emit('dash');
      } else {
        this.emit('notice', { text: 'Not enough charge. Grab sparks!' });
      }
    }

    if (pulsePressed) {
      if (player.charge >= 28) {
        player.charge -= 28;
        player.pulse = 0.55;
        player.heat = Math.max(0, player.heat - 9);
        let jammed = 0;
        for (const patrol of this.patrols) {
          if (Math.hypot(player.x - patrol.x, player.y - patrol.y) <= this.stats.pulseRadius) {
            patrol.jammed = Math.max(patrol.jammed, 3);
            patrol.scan = 0;
            jammed++;
          }
        }
        player.style += jammed * 10;
        this.emit('pulse', { jammed });
      } else {
        this.emit('notice', { text: 'Pulse needs 28 charge.' });
      }
    }

    if (echoPressed && player.echoCooldown <= 0) {
      if (player.charge < 43) {
        this.emit('notice', { text: 'Echo needs 43 charge.' });
      } else if (this.spawnEcho()) {
        player.charge -= 43;
        player.echoCooldown = 4.2;
        player.style += 30;
        this.emit('echo');
      } else {
        this.emit('notice', { text: 'Ride a little first so the Echo has a trail.' });
      }
    }
  }

  spawnEcho() {
    const player = this.player;
    const points = player.trail
      .filter((point) => point.age > 0.2 && point.age < 2.1)
      .map((point) => ({ x: point.x, y: point.y }));
    if (points.length < 7) return false;
    this.echoes.unshift({
      points,
      duration: this.stats.echoDuration,
      time: 0,
      x: points[0].x,
      y: points[0].y,
      alive: true,
    });
    this.echoes.length = Math.min(2, this.echoes.length);
    return true;
  }

  stepPlayer(dt, input) {
    const player = this.player;
    player.dash = Math.max(0, player.dash - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.pulse = Math.max(0, player.pulse - dt);
    player.echoCooldown = Math.max(0, player.echoCooldown - dt);
    player.damageCooldown = Math.max(0, player.damageCooldown - dt);
    player.scanCooldown = Math.max(0, player.scanCooldown - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    if (player.comboTimer === 0) player.combo = 0;

    const wish = { x: clamp(input.moveX || 0, -1, 1), y: clamp(input.moveY || 0, -1, 1) };
    const magnitude = Math.min(1, Math.hypot(wish.x, wish.y));
    const direction = assistDirection(player, { x: player.vx, y: player.vy }, player.angle, wish);
    const drifting = !!input.drift;

    if (direction) {
      const desired = Math.atan2(direction.y, direction.x);
      const turnRate = drifting ? 7 : 13;
      const difference = wrapAngle(desired - player.angle);
      player.angle = wrapAngle(player.angle + clamp(difference, -turnRate * dt, turnRate * dt));
    }

    const forwardX = Math.cos(player.angle);
    const forwardY = Math.sin(player.angle);
    const rightX = -forwardY;
    const rightY = forwardX;
    let forward = dot(player.vx, player.vy, forwardX, forwardY);
    let sideways = dot(player.vx, player.vy, rightX, rightY);

    const targetSpeed = player.dash > 0
      ? this.stats.dashSpeed
      : direction ? this.stats.cruise * Math.max(0.45, magnitude) : 0;
    const acceleration = player.dash > 0 ? 2800 : direction ? 900 : 620;
    forward = approach(forward, targetSpeed, acceleration * dt);

    const grip = (drifting ? 1.6 : 7.5) * this.contract.district.grip;
    sideways *= Math.exp(-grip * dt);
    player.vx = forwardX * forward + rightX * sideways;
    player.vy = forwardY * forward + rightY * sideways;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Stabilizers hold the bike on the centre line of the street it follows.
    // Traffic keeps to the curb lanes, so the centre is the safe line.
    const street = roadKind(player.x, player.y);
    const alongX = Math.abs(player.vx) >= Math.abs(player.vy);
    if (street === 'vertical' || (street === 'intersection' && !alongX && direction)) {
      player.x = lerp(player.x, nearestStreet(player.x), dt * (street === 'intersection' ? 9 : 4.3));
      player.vx = lerp(player.vx, 0, dt * 3.2);
    } else if (street === 'horizontal' || (street === 'intersection' && alongX && direction)) {
      player.y = lerp(player.y, nearestStreet(player.y), dt * (street === 'intersection' ? 9 : 4.3));
      player.vy = lerp(player.vy, 0, dt * 3.2);
    }

    const road = keepOnRoad(player, PLAYER_RADIUS + 5);
    if (road.hit) {
      player.x = road.x;
      player.y = road.y;
      const intoWall = dot(player.vx, player.vy, road.normal.x, road.normal.y);
      if (intoWall > 0) {
        player.vx -= road.normal.x * intoWall * 1.35;
        player.vy -= road.normal.y * intoWall * 1.35;
      }
      player.vx *= 0.7;
      player.vy *= 0.7;
      // A slow correction against a curb should not drain the whole integrity
      // meter. Only a meaningful velocity into the building is an impact.
      if (player.damageCooldown <= 0 && intoWall > 150) {
        this.damage(Math.max(3, intoWall * 0.02), 'wall');
      }
    }

    player.speed = length(player.vx, player.vy);
    const velocityAngle = player.speed > 1 ? Math.atan2(player.vy, player.vx) : player.angle;
    player.slip = Math.abs(wrapAngle(velocityAngle - player.angle));
    player.drifting = player.speed > 128 && player.slip > 0.14;
    if (player.drifting) {
      const gain = Math.min(player.slip, 1.2) * 34 * this.stats.driftGain * dt;
      player.charge = clamp(player.charge + gain, 0, player.maxCharge);
      player.style += gain * 0.7;
    } else {
      player.charge = clamp(player.charge + 2.2 * dt, 0, player.maxCharge);
    }

    player.trailClock += dt;
    if (player.trailClock >= 0.042) {
      player.trailClock = 0;
      if (player.speed > 20) player.trail.push({ x: player.x, y: player.y, age: 0, drifting: player.drifting || player.dash > 0 });
    }
    for (const point of player.trail) point.age += dt;
    while (player.trail.length && player.trail[0].age > 2.5) player.trail.shift();
  }

  // A runaway (robot, cat, firework) hops between intersections, picking the
  // street that takes it farthest from the bike without straying from home.
  stepRunner(dt) {
    const runner = this.runner;
    if (!runner) return;
    const player = this.player;
    if (runner.caught) {
      runner.x = lerp(runner.x, player.x - Math.cos(player.angle) * 22, Math.min(1, dt * 12));
      runner.y = lerp(runner.y, player.y - Math.sin(player.angle) * 22, Math.min(1, dt * 12));
      runner.angle = player.angle;
      return;
    }
    const gap = distance(runner, player);
    runner.panic = gap < 230 ? 1 : Math.max(0, runner.panic - dt);
    const cruise = this.stats.cruise;
    runner.speed = gap > 760 ? cruise * 0.32 : runner.panic ? cruise * 0.8 : cruise * 0.6;
    let budget = runner.speed * dt;
    for (let guard = 0; guard < 4 && budget > 0; guard++) {
      if (!runner.to) this.chooseRunnerStep(runner);
      const d = distance(runner, runner.to);
      if (d <= budget) {
        runner.from = { x: runner.to.x, y: runner.to.y };
        runner.x = runner.to.x;
        runner.y = runner.to.y;
        runner.to = null;
        budget -= d;
      } else {
        runner.angle = directionTo(runner, runner.to);
        runner.x += Math.cos(runner.angle) * budget;
        runner.y += Math.sin(runner.angle) * budget;
        budget = 0;
      }
    }
    const stop = this.contract.legs[0].find((s) => s.kind === 'runner');
    if (stop) {
      stop.x = runner.x;
      stop.y = runner.y;
    }
  }

  chooseRunnerStep(runner) {
    const at = nearestIntersection(runner);
    const player = this.player;
    let best = null;
    let bestScore = -Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: at.x + dx * BLOCK, y: at.y + dy * BLOCK };
      const blocksFromHome = (Math.abs(next.x - runner.home.x) + Math.abs(next.y - runner.home.y)) / BLOCK;
      let score = Math.hypot(next.x - player.x, next.y - player.y);
      score -= Math.max(0, blocksFromHome - 3) * BLOCK * 1.6;
      if (runner.from && next.x === runner.from.x && next.y === runner.from.y) score -= BLOCK * 0.7;
      score += this.random() * BLOCK * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = next;
      }
    }
    runner.from = at;
    runner.to = best;
  }

  stepTraffic(dt) {
    const player = this.player;
    for (const vehicle of this.traffic) {
      vehicle.pos += vehicle.dir * vehicle.speed * dt;
      const focal = vehicle.axis === 'x' ? player.x : player.y;
      if (vehicle.pos < focal - BLOCK * 11) vehicle.pos += BLOCK * 22;
      if (vehicle.pos > focal + BLOCK * 11) vehicle.pos -= BLOCK * 22;
      vehicle.nearCooldown = Math.max(0, (vehicle.nearCooldown || 0) - dt);
      vehicle.hitCooldown = Math.max(0, (vehicle.hitCooldown || 0) - dt);
    }
  }

  stepEchoes(dt) {
    for (const echo of this.echoes) {
      if (!echo.alive) continue;
      echo.time += dt;
      const t = clamp(echo.time / echo.duration, 0, 1) * (echo.points.length - 1);
      const index = Math.floor(t);
      const next = echo.points[Math.min(echo.points.length - 1, index + 1)];
      const current = echo.points[index];
      echo.x = lerp(current.x, next.x, t - index);
      echo.y = lerp(current.y, next.y, t - index);
      if (echo.time >= echo.duration) echo.alive = false;
    }
    this.echoes = this.echoes.filter((echo) => echo.alive);
  }

  desiredPatrols() {
    const base = this.contract.patrols;
    if (base <= 0) return 0;
    // Heat makes a district feel tighter without turning one scanner lock
    // into an instant wall of drones: at most one extra patrol.
    const extra = Math.min(1, Math.floor((this.player.heat + this.cityHeat) / 52));
    return Math.min(5, base + extra);
  }

  spawnPatrol() {
    const player = this.player;
    const axis = this.random() < 0.5 ? 'x' : 'y';
    const range = 3 + Math.floor(this.random() * 3);
    const sign = this.random() < 0.5 ? -1 : 1;
    const offset = sign * range * BLOCK;
    const point = axis === 'x'
      ? { x: player.x + offset, y: Math.round(player.y / BLOCK) * BLOCK + (this.random() < 0.5 ? -18 : 18) }
      : { x: Math.round(player.x / BLOCK) * BLOCK + (this.random() < 0.5 ? -18 : 18), y: player.y + offset };
    const road = keepOnRoad(point, PATROL_RADIUS + 5);
    this.patrols.push({
      mode: 'hunter',
      x: road.x,
      y: road.y,
      vx: 0,
      vy: 0,
      angle: directionTo(road, player),
      scan: 0,
      jammed: 0,
      radius: PATROL_RADIUS,
      flash: this.random() * 2,
      side: this.random() < 0.5 ? -1 : 1,
      chasingEcho: false,
      hitCooldown: 0,
    });
    this.emit('patrol');
  }

  stepPatrols(dt) {
    const desired = this.desiredPatrols();
    const hunters = this.patrols.filter((patrol) => patrol.mode !== 'sentry').length;
    if (hunters < desired && this.time >= this.nextPatrolAt) {
      this.spawnPatrol();
      this.nextPatrolAt = this.time + Math.max(2.5, 6 - this.chapter * 0.6);
    }

    const echo = this.activeEcho;
    const player = this.player;
    for (const patrol of this.patrols) {
      patrol.jammed = Math.max(0, patrol.jammed - dt);
      patrol.hitCooldown = Math.max(0, patrol.hitCooldown - dt);
      if (patrol.mode === 'sentry' && this.stepSentry(patrol, dt, echo)) {
        this.scanFrom(patrol, dt);
        continue;
      }
      const target = echo && !patrol.jammed ? echo : player;
      patrol.chasingEcho = target === echo;
      const targetDistance = Math.hypot(target.x - patrol.x, target.y - patrol.y);
      let desiredAngle = directionTo(patrol, target);
      // Drones want the bike in a scan cone. At close range they peel
      // alongside rather than continually ramming it.
      const standoff = patrol.chasingEcho || patrol.jammed ? 0 : 118;
      const close = targetDistance < standoff;
      if (close) desiredAngle = wrapAngle(desiredAngle + (patrol.side || 1) * 0.82);
      const turn = clamp(wrapAngle(desiredAngle - patrol.angle) * 3.2, -3.3, 3.3);
      patrol.angle = wrapAngle(patrol.angle + turn * dt);
      let speed = patrol.jammed
        ? 80
        : 190 + this.chapter * 18 + Math.min(70, player.heat * 0.5);
      if (close) speed = Math.min(speed, 130);
      patrol.vx = lerp(patrol.vx, Math.cos(patrol.angle) * speed, dt * 2.7);
      patrol.vy = lerp(patrol.vy, Math.sin(patrol.angle) * speed, dt * 2.7);
      patrol.x += patrol.vx * dt;
      patrol.y += patrol.vy * dt;
      const road = keepOnRoad(patrol, PATROL_RADIUS + 5);
      if (road.hit) {
        patrol.x = road.x;
        patrol.y = road.y;
        patrol.vx *= 0.45;
        patrol.vy *= 0.45;
      }

      this.scanFrom(patrol, dt);
    }
    player.scan = Math.max(0, player.scan - dt * 0.65);
  }

  // Sentries hover over their post and sweep a scanner cone. One that spots
  // the bike gives chase for a few seconds, then drifts home. Returns false
  // while it is chasing, so the regular drone steering takes over.
  stepSentry(patrol, dt, echo) {
    if (patrol.alert > 0 && !patrol.jammed) {
      patrol.alert = Math.max(0, patrol.alert - dt);
      return false;
    }
    const home = Math.hypot(patrol.post.x - patrol.x, patrol.post.y - patrol.y);
    if (home > 6) {
      const angle = directionTo(patrol, patrol.post);
      patrol.vx = lerp(patrol.vx, Math.cos(angle) * 150, dt * 3);
      patrol.vy = lerp(patrol.vy, Math.sin(angle) * 150, dt * 3);
      patrol.x += patrol.vx * dt;
      patrol.y += patrol.vy * dt;
      patrol.angle = wrapAngle(patrol.angle + clamp(wrapAngle(angle - patrol.angle), -4 * dt, 4 * dt));
    } else {
      patrol.vx = 0;
      patrol.vy = 0;
      const sweep = patrol.base + Math.sin(this.time * patrol.sweep + patrol.phase) * 1.35;
      patrol.angle = wrapAngle(patrol.angle + clamp(wrapAngle(sweep - patrol.angle), -3 * dt, 3 * dt));
    }
    patrol.chasingEcho = false;
    if (echo && !patrol.jammed && Math.hypot(echo.x - patrol.x, echo.y - patrol.y) < 300) patrol.alert = 2;
    return true;
  }

  scanFrom(patrol, dt) {
    const player = this.player;
    if (patrol.jammed || patrol.chasingEcho) return;
    const dx = player.x - patrol.x;
    const dy = player.y - patrol.y;
    const range = Math.hypot(dx, dy);
    const facing = range > 1 ? (dx * Math.cos(patrol.angle) + dy * Math.sin(patrol.angle)) / range : 1;
    if (range < SCAN_RANGE && facing > SCAN_CONE && player.pulse <= 0 && player.dash <= 0) {
      patrol.scan += dt * (1.4 - range / 480) * this.stats.scanResistance;
      player.scan = Math.max(player.scan, patrol.scan);
      if (patrol.mode === 'sentry' && patrol.scan > 0.3 && !patrol.alert) {
        patrol.alert = 3;
        this.emit('alert');
      }
      if (patrol.scan >= 1) {
        patrol.scan = 0;
        this.scanHit();
      }
    } else {
      patrol.scan = Math.max(0, patrol.scan - dt * 1.2);
    }
  }

  checkTraffic() {
    const player = this.player;
    for (const vehicle of this.traffic) {
      const position = trafficPosition(vehicle);
      const range = Math.hypot(player.x - position.x, player.y - position.y);
      const collision = PLAYER_RADIUS + TRAFFIC_RADIUS;
      if (range < collision) {
        if (player.dash > 0) continue;
        if (vehicle.hitCooldown <= 0) {
          vehicle.hitCooldown = 1.1;
          this.damage(Math.max(6, player.speed * 0.03), 'traffic');
        }
        const awayX = range > 0.01 ? (player.x - position.x) / range : (vehicle.axis === 'x' ? 0 : 1);
        const awayY = range > 0.01 ? (player.y - position.y) / range : (vehicle.axis === 'x' ? 1 : 0);
        player.vx += awayX * 74;
        player.vy += awayY * 74;
        player.vx *= 0.73;
        player.vy *= 0.73;
      } else if (range < collision + 29 && vehicle.nearCooldown <= 0 && player.speed > 180) {
        vehicle.nearCooldown = 1.3;
        const gain = 7 + Math.min(8, player.speed / 70);
        player.charge = clamp(player.charge + gain, 0, player.maxCharge);
        player.style += 14;
        player.combo++;
        player.comboTimer = 3;
        this.emit('near-miss', { combo: player.combo });
      }
    }
  }

  checkPatrols() {
    const player = this.player;
    for (const patrol of this.patrols) {
      if (Math.hypot(player.x - patrol.x, player.y - patrol.y) < PLAYER_RADIUS + PATROL_RADIUS) {
        if (patrol.hitCooldown <= 0 && player.dash <= 0) {
          patrol.hitCooldown = 1.4;
          patrol.jammed = Math.max(patrol.jammed, 1.1);
          patrol.vx *= -0.45;
          patrol.vy *= -0.45;
          this.damage(5, 'patrol');
          this.addHeat(12);
        }
      }
    }
  }

  checkSparks() {
    const player = this.player;
    for (const spark of this.contract.sparks) {
      if (spark.taken) continue;
      if (Math.abs(spark.x - player.x) > SPARK_RADIUS || Math.abs(spark.y - player.y) > SPARK_RADIUS) continue;
      if (Math.hypot(spark.x - player.x, spark.y - player.y) > SPARK_RADIUS) continue;
      spark.taken = true;
      player.charge = clamp(player.charge + 5, 0, player.maxCharge);
      player.style += 4;
      // Every spark wakes up the building beside it: the ride lights the city.
      const column = Math.floor(spark.x / BLOCK);
      const row = Math.floor(spark.y / BLOCK);
      this.light(column, row);
      if (spark.x % BLOCK === 0) this.light(column - 1, row);
      else this.light(column, row - 1);
      this.emit('spark', { x: spark.x, y: spark.y, taken: this.sparksTaken, total: this.contract.sparks.length });
    }
  }

  light(column, row) {
    const key = blockKey(column, row);
    if (!this.lit.has(key)) this.lit.set(key, this.time);
  }

  lightUp(point, radius = LIGHT_RADIUS) {
    const reach = Math.ceil(radius);
    const column = Math.floor(point.x / BLOCK);
    const row = Math.floor(point.y / BLOCK);
    for (let c = column - reach; c <= column + reach; c++) {
      for (let r = row - reach; r <= row + reach; r++) {
        const cx = (c + 0.5) * BLOCK;
        const cy = (r + 0.5) * BLOCK;
        const d = Math.hypot(cx - point.x, cy - point.y) / BLOCK;
        if (d <= radius) {
          const key = blockKey(c, r);
          // Blocks farther from the drop light a moment later, as a wave.
          if (!this.lit.has(key)) this.lit.set(key, this.time + d * 0.22);
        }
      }
    }
    this.lightWaves.push({ x: point.x, y: point.y, time: this.time, radius: radius * BLOCK });
    if (this.lightWaves.length > 8) this.lightWaves.shift();
  }

  radio(moment) {
    if (this.radioSent.has(moment)) return;
    const line = this.contract.def.radio?.[moment];
    this.radioSent.add(moment);
    if (line) this.emit('radio', { speaker: line[0], text: line[1] });
  }

  checkTargets() {
    const player = this.player;
    for (const stop of this.leg) {
      if (stop.done) continue;
      const reach = stop.kind === 'runner' ? RUNNER_RADIUS + (player.dash > 0 ? 14 : 0) : STOP_RADIUS;
      if (distance(player, stop) > reach) continue;
      stop.done = true;
      if (stop.kind === 'runner') {
        this.runner.caught = true;
        this.emit('caught', { name: stop.name });
      } else if (stop.kind === 'drop') {
        this.lightUp(stop);
      } else {
        this.light(Math.floor(stop.x / BLOCK), Math.floor(stop.y / BLOCK));
      }
      this.emit('stop', { stop, left: this.stopsLeft, leg: this.legIndex });

      const total = this.leg.length;
      const done = total - this.stopsLeft;
      if (total >= 3 && done === Math.floor(total / 2)) this.radio('halfway');
    }

    if (this.stopsLeft > 0) return;
    if (this.finalLeg) {
      this.completeContract();
      return;
    }
    this.legIndex++;
    player.carrying = true;
    player.integrity = Math.min(100, player.integrity + 18);
    this.planRoute();
    this.emit('pickup', { contract: this.contract });
    this.radio('pickup');
    this.status = this.finalLeg ? 'delivery' : 'pickup';
  }

  // Keep the guide route pointed at the closest stop, and follow a runner as
  // it hops between intersections.
  refreshRoute() {
    const target = this.target;
    if (!target) return;
    const cell = `${nearestStreet(target.x)},${nearestStreet(target.y)}`;
    if (target !== this.routeFor || cell !== this.routeCell) this.planRoute();
  }

  advanceRoute() {
    const player = this.player;
    while (this.routeIndex < this.route.length &&
      distance(player, this.route[this.routeIndex]) < 30) {
      this.routeIndex++;
    }
  }

  scanHit() {
    const player = this.player;
    // Several drones may see the same bike at once. They share one network,
    // so one completed scan must finish before another counts.
    if (player.scanCooldown > 0) return;
    player.scanCooldown = 1.5;
    this.scans++;
    this.addHeat(10);
    const limit = this.contract.type.scanLimit;
    const line = HALO_SCAN_LINES[(this.scans - 1) % HALO_SCAN_LINES.length];
    this.emit('scan', { count: this.scans, limit, line });
    if (limit && this.scans >= limit) this.fail('HALO scanned you three times and confiscated the cargo. Try sneakier routes!');
  }

  damage(amount, source) {
    const player = this.player;
    if (player.damageCooldown > 0 || player.dash > 0) return false;
    player.damageCooldown = source === 'patrol' ? 0.9 : 0.48;
    if (player.flux > 0) {
      player.flux--;
      this.emit('flux');
      return true;
    }
    const multiplier = player.carrying ? this.contract.type.damage : 0.68;
    const harm = amount * multiplier;
    player.integrity -= harm;
    this.addHeat(source === 'wall' ? 2 : 7);
    this.emit('impact', { source, harm });
    return true;
  }

  addHeat(amount) {
    this.player.heat = clamp(this.player.heat + amount, 0, 100);
  }

  coolHeat(dt) {
    const player = this.player;
    const watched = this.patrols.some((patrol) =>
      !patrol.jammed && !patrol.chasingEcho && Math.hypot(player.x - patrol.x, player.y - patrol.y) < 340);
    player.heat = Math.max(0, player.heat - this.stats.coolRate * dt * (watched ? 0.22 : 1));
  }

  completeContract() {
    const player = this.player;
    const contract = this.contract;
    const sparksTotal = contract.sparks.length;
    const sparks = this.sparksTaken;
    const sparkGoal = Math.ceil(sparksTotal * 0.7);
    const integrity = Math.max(0, Math.round(player.integrity));
    const timeBonus = Math.max(0, Math.round(contract.timeRemaining * 3));
    const sparkBonus = sparks * 4;
    const styleBonus = Math.round(player.style);
    const earned = contract.reward + timeBonus + sparkBonus + styleBonus;
    const stars = 1 + (sparks >= sparkGoal ? 1 : 0) + (integrity >= 70 ? 1 : 0);
    const last = contract.legs.at(-1)[0];
    this.lightUp(last, LIGHT_RADIUS + 0.8);

    this.contractsDone = this.contractIndex + 1;
    this.totalCredits += earned;
    this.cityHeat = clamp(this.cityHeat + 6 + player.heat * 0.4, 0, 100);
    this.currentResult = {
      contract,
      chapter: this.chapter,
      job: this.contractIndex,
      earned,
      timeBonus,
      sparkBonus,
      styleBonus,
      sparks,
      sparksTotal,
      sparkGoal,
      integrity,
      stars,
      shiftTotal: this.totalCredits,
      contractsDone: this.contractsDone,
      final: this.contractsDone >= CONTRACT_COUNT,
      recorded: false,
    };
    this.results[this.contractIndex] = this.currentResult;
    this.status = 'debrief';
    this.emit('delivered', this.currentResult);
    this.radio('done');
  }

  fail(reason) {
    if (!this.active) return;
    this.failure = reason;
    this.status = 'failed';
    this.cityHeat = clamp(this.cityHeat + 10, 0, 100);
    this.emit('failed', { reason });
  }
}
