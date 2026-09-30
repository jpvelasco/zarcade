import {
  BLOCK,
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

export const CONTRACT_COUNT = 5;
const PLAYER_RADIUS = 13;
const TRAFFIC_RADIUS = 11;
const PATROL_RADIUS = 20;

function directionTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
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

// A complete night shift. The simulation has no DOM access: rendering,
// controls, audio, persistence, and overlays all sit above this class.
export class World {
  constructor(seed = 9417, { stats = statsFor(), paint = '#3fe5ff' } = {}) {
    this.seed = seed | 0;
    this.random = rng(this.seed ^ 0x41c64e6d);
    this.stats = stats;
    this.paint = paint;
    this.events = [];
    this.time = 0;
    this.nightTime = 0;
    this.status = 'briefing'; // briefing | pickup | delivery | debrief | failed | shift-complete
    this.contractIndex = 0;
    this.contractsDone = 0;
    this.totalCredits = 0;
    this.cityHeat = 0;
    this.currentResult = null;
    this.failure = null;
    this.traffic = makeTraffic(this.seed);
    this.patrols = [];
    this.echoes = [];
    this.nextPatrolAt = 0;
    this.contractStart = { x: 0, y: 0 };
    this.player = makePlayer(this.contractStart, stats);
    this.contract = null;
    this.route = [];
    this.routeIndex = 0;
    this.prepareContract(0, this.contractStart);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  get active() {
    return this.status === 'pickup' || this.status === 'delivery';
  }

  get target() {
    if (this.status === 'pickup') return this.contract.pickup;
    if (this.status === 'delivery') return this.contract.delivery;
    return this.contract?.pickup || null;
  }

  get routeTarget() {
    return this.route[this.routeIndex] || this.target;
  }

  get activeEcho() {
    return this.echoes.find((echo) => echo.alive) || null;
  }

  prepareContract(index, from, { retry = false } = {}) {
    this.contractIndex = index;
    this.contractStart = nearestIntersection(from);
    this.contract = makeContract(this.seed, index, this.contractStart);
    const carryHeat = retry ? 0 : Math.min(30, this.cityHeat * 0.28);
    this.player = makePlayer(this.contractStart, this.stats, carryHeat);
    const firstTarget = this.contract.toPickup[0] || this.contract.pickup;
    this.player.angle = directionTo(this.player, firstTarget);
    this.route = this.contract.toPickup.slice();
    this.routeIndex = 0;
    this.patrols.length = 0;
    this.echoes.length = 0;
    this.nextPatrolAt = this.time + 0.65;
    this.currentResult = null;
    this.failure = null;
    this.status = 'briefing';
  }

  startContract() {
    if (this.status !== 'briefing') return false;
    this.status = 'pickup';
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
      this.status = 'shift-complete';
      this.emit('shift-complete', { total: this.totalCredits, contracts: this.contractsDone });
      return false;
    }
    this.prepareContract(this.contractIndex + 1, this.contract.delivery);
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
    this.stepTraffic(dt);
    this.stepEchoes(dt);
    this.stepPatrols(dt);
    this.checkTraffic();
    this.checkPatrols();
    this.advanceRoute();
    this.checkTarget();
    this.stepCargo(dt);
    this.coolHeat(dt);

    if (this.active && this.contract.timeRemaining <= 0) this.fail('The buyer closed the window.');
    if (this.active && this.player.integrity <= 0) this.fail(this.player.carrying ? 'The cargo did not survive the run.' : 'The Nighthawk is grounded.');
  }

  stepAbilities(input) {
    const player = this.player;
    const dashPressed = !!input.dash && !player.dashHeld;
    const pulsePressed = !!input.pulse && !player.pulseHeld;
    const echoPressed = !!input.echo && !player.echoHeld;
    player.dashHeld = !!input.dash;
    player.pulseHeld = !!input.pulse;
    player.echoHeld = !!input.echo;

    if (dashPressed && player.dashCooldown <= 0 && player.charge >= this.stats.dashCost) {
      player.charge -= this.stats.dashCost;
      player.dash = 0.28;
      player.dashCooldown = 0.42;
      player.style += 18;
      this.emit('dash');
    }

    if (pulsePressed && player.charge >= 28) {
      player.charge -= 28;
      player.pulse = 0.55;
      player.heat = Math.max(0, player.heat - 9);
      let jammed = 0;
      for (const patrol of this.patrols) {
        if (Math.hypot(player.x - patrol.x, player.y - patrol.y) <= this.stats.pulseRadius) {
          patrol.jammed = Math.max(patrol.jammed, 2.5);
          jammed++;
        }
      }
      player.style += jammed * 10;
      this.emit('pulse', { jammed });
    }

    if (echoPressed && player.echoCooldown <= 0 && player.charge >= 43) {
      if (this.spawnEcho()) {
        player.charge -= 43;
        player.echoCooldown = 4.2;
        player.style += 30;
        this.emit('echo');
      } else {
        this.emit('notice', { text: 'Build a little more trail first.' });
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
    const turn = clamp(input.turn || 0, -1, 1);

    player.dash = Math.max(0, player.dash - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.pulse = Math.max(0, player.pulse - dt);
    player.echoCooldown = Math.max(0, player.echoCooldown - dt);
    player.damageCooldown = Math.max(0, player.damageCooldown - dt);
    player.scanCooldown = Math.max(0, player.scanCooldown - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    if (player.comboTimer === 0) player.combo = 0;

    const headingTurn = 0.8 + clamp(player.speed / this.stats.cruise, 0, 1.5) * 2;
    player.angle = wrapAngle(player.angle + turn * headingTurn * dt);
    const forwardX = Math.cos(player.angle);
    const forwardY = Math.sin(player.angle);
    const rightX = -forwardY;
    const rightY = forwardX;

    let forward = dot(player.vx, player.vy, forwardX, forwardY);
    let sideways = dot(player.vx, player.vy, rightX, rightY);
    const braking = !!input.brake;
    const targetSpeed = player.dash > 0
      ? this.stats.dashSpeed
      : braking
        ? 82
        : this.stats.cruise;
    const acceleration = player.dash > 0 ? 2800 : braking ? 1000 : 690;
    forward = approach(forward, targetSpeed, acceleration * dt);

    const wet = this.contract.district.id === 'floodline';
    const grip = braking ? 0.82 : wet ? 3.3 : 5.3;
    sideways *= Math.exp(-grip * dt);
    player.vx = forwardX * forward + rightX * sideways;
    player.vy = forwardY * forward + rightY * sideways;
    player.speed = length(player.vx, player.vy);
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // The bike's stabilizers pull it toward the centre of the street it is
    // currently following. This preserves deliberate turns at intersections
    // while preventing an outer road edge from becoming a steering deadlock.
    const street = roadKind(player.x, player.y);
    if (street === 'vertical') {
      player.x = lerp(player.x, nearestStreet(player.x), dt * 4.3);
      player.vx = lerp(player.vx, 0, dt * 3.2);
    } else if (street === 'horizontal') {
      player.y = lerp(player.y, nearestStreet(player.y), dt * 4.3);
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
      player.vx *= 0.53;
      player.vy *= 0.53;
      // A slow correction against a curb should not drain the whole integrity
      // meter. Only a meaningful velocity into the building is an impact.
      if (player.damageCooldown <= 0 && intoWall > 52) {
        this.damage(Math.max(4, intoWall * 0.025), 'wall');
      }
    }

    player.speed = length(player.vx, player.vy);
    const velocityAngle = player.speed > 1 ? Math.atan2(player.vy, player.vx) : player.angle;
    player.slip = Math.abs(wrapAngle(velocityAngle - player.angle));
    player.drifting = player.speed > 128 && player.slip > 0.12;
    if (player.drifting) {
      const gain = player.slip * 30 * this.stats.driftGain * dt;
      player.charge = clamp(player.charge + gain, 0, player.maxCharge);
      player.style += gain * 0.7;
    } else {
      player.charge = clamp(player.charge + 1.8 * dt, 0, player.maxCharge);
    }

    player.trailClock += dt;
    if (player.trailClock >= 0.042) {
      player.trailClock = 0;
      player.trail.push({ x: player.x, y: player.y, age: 0, drifting: player.drifting || player.dash > 0 });
    }
    for (const point of player.trail) point.age += dt;
    while (player.trail.length && player.trail[0].age > 2.5) player.trail.shift();
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
    const districtBase = this.contract.district.patrols;
    // Heat should make a district feel tighter without turning one scanner
    // lock into an instant wall of police cars. Each district can gain one
    // additional patrol, while The Core remains the densest part of a shift.
    const extra = Math.min(1, Math.floor((this.player.heat + this.cityHeat) / 52));
    return Math.min(5, districtBase + extra);
  }

  spawnPatrol() {
    const player = this.player;
    const axis = this.random() < 0.5 ? 'x' : 'y';
    const range = 4 + Math.floor(this.random() * 3);
    const sign = this.random() < 0.5 ? -1 : 1;
    const offset = sign * range * BLOCK;
    const point = axis === 'x'
      ? { x: player.x + offset, y: Math.round(player.y / BLOCK) * BLOCK + (this.random() < 0.5 ? -18 : 18) }
      : { x: Math.round(player.x / BLOCK) * BLOCK + (this.random() < 0.5 ? -18 : 18), y: player.y + offset };
    const road = keepOnRoad(point, PATROL_RADIUS + 5);
    this.patrols.push({
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
    if (this.patrols.length < desired && this.time >= this.nextPatrolAt) {
      this.spawnPatrol();
      this.nextPatrolAt = this.time + Math.max(2.5, 5.5 - this.contractIndex * 0.55);
    }

    const echo = this.activeEcho;
    const player = this.player;
    for (const patrol of this.patrols) {
      patrol.jammed = Math.max(0, patrol.jammed - dt);
      patrol.hitCooldown = Math.max(0, patrol.hitCooldown - dt);
      const target = echo && !patrol.jammed ? echo : player;
      patrol.chasingEcho = target === echo;
      const targetDistance = Math.hypot(target.x - patrol.x, target.y - patrol.y);
      let desiredAngle = directionTo(patrol, target);
      // Security wants to keep the Nighthawk in a scan cone. At close range
      // it peels alongside rather than continually ramming the bike.
      const standoff = patrol.chasingEcho || patrol.jammed ? 0 : 118;
      const close = targetDistance < standoff;
      if (close) desiredAngle = wrapAngle(desiredAngle + (patrol.side || 1) * 0.82);
      const turn = clamp(wrapAngle(desiredAngle - patrol.angle) * 3.2, -3.3, 3.3);
      patrol.angle = wrapAngle(patrol.angle + turn * dt);
      let speed = patrol.jammed
        ? 90
        : 218 + this.contractIndex * 25 + Math.min(85, player.heat * 0.55);
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

      if (!patrol.jammed && !patrol.chasingEcho) {
        const dx = player.x - patrol.x;
        const dy = player.y - patrol.y;
        const range = Math.hypot(dx, dy);
        const facing = range > 1 ? (dx * Math.cos(patrol.angle) + dy * Math.sin(patrol.angle)) / range : 1;
        if (range < 310 && facing > 0.15 && player.pulse <= 0) {
          patrol.scan += dt * (1.05 - range / 560) * this.stats.scanResistance;
          player.scan = Math.max(player.scan, patrol.scan);
          if (patrol.scan >= 1) {
            patrol.scan = 0;
            this.scanHit();
          }
        } else {
          patrol.scan = Math.max(0, patrol.scan - dt * 1.2);
        }
      }
    }
    player.scan = Math.max(0, player.scan - dt * 0.65);
  }

  checkTraffic() {
    const player = this.player;
    for (const vehicle of this.traffic) {
      const position = trafficPosition(vehicle);
      const range = Math.hypot(player.x - position.x, player.y - position.y);
      const collision = PLAYER_RADIUS + TRAFFIC_RADIUS;
      if (range < collision) {
        if (player.dash <= 0 && vehicle.hitCooldown <= 0) {
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

  scanHit() {
    const player = this.player;
    // Several patrols may see the same bike at once. They share the same
    // security network, so one completed scan must finish before another can
    // inflict its consequence.
    if (player.scanCooldown > 0) return;
    player.scanCooldown = 1.25;
    this.addHeat(10);
    if (player.carrying && this.contract.type.scanDamage) {
      const harm = 4.5 * this.contract.type.scanDamage;
      player.integrity -= harm;
      this.emit('scan', { harm });
    } else {
      this.emit('scan', { harm: 0 });
    }
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

  advanceRoute() {
    const player = this.player;
    while (this.routeIndex < this.route.length &&
      distance(player, this.route[this.routeIndex]) < 27) {
      this.routeIndex++;
    }
  }

  checkTarget() {
    const target = this.target;
    if (!target || distance(this.player, target) > 52) return;

    if (this.status === 'pickup') {
      this.status = 'delivery';
      this.player.carrying = true;
      this.player.integrity = Math.min(100, this.player.integrity + 18);
      this.route = this.contract.toDelivery.slice();
      this.routeIndex = 0;
      this.emit('pickup', { contract: this.contract });
      return;
    }
    if (this.status === 'delivery') this.completeContract();
  }

  stepCargo(dt) {
    const player = this.player;
    if (!player.carrying || !this.contract.type.overcharge || player.charge < player.maxCharge * 0.86) return;
    const harm = (player.charge / player.maxCharge - 0.86) * 7 * dt;
    player.integrity -= harm;
    if (harm > 0.001) this.emit('overcharge', { harm });
  }

  completeContract() {
    const player = this.player;
    const heatTier = Math.floor(player.heat / 20);
    const heatMultiplier = 1 + heatTier * 0.12;
    const cleanMultiplier = player.integrity >= 86 ? 1.1 : 1;
    const timeBonus = Math.max(0, Math.round(this.contract.timeRemaining * 4));
    const styleBonus = Math.round(player.style);
    const earned = Math.round((this.contract.reward + timeBonus + styleBonus) * heatMultiplier * cleanMultiplier);

    this.contractsDone = this.contractIndex + 1;
    this.totalCredits += earned;
    this.cityHeat = clamp(this.cityHeat + 8 + player.heat * 0.48, 0, 100);
    this.currentResult = {
      contract: this.contract,
      earned,
      timeBonus,
      styleBonus,
      heatMultiplier,
      integrity: Math.max(0, Math.round(player.integrity)),
      shiftTotal: this.totalCredits,
      contractsDone: this.contractsDone,
      final: this.contractsDone >= CONTRACT_COUNT,
      recorded: false,
    };
    this.status = 'debrief';
    this.emit('delivered', this.currentResult);
  }

  fail(reason) {
    if (!this.active) return;
    this.failure = reason;
    this.status = 'failed';
    this.cityHeat = clamp(this.cityHeat + 12, 0, 100);
    this.emit('failed', { reason });
  }
}
