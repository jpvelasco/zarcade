// One race: grid and countdown, laps and checkpoints, places, item boxes and
// items, collisions, the tail-wind mercy turbo, rubber-banding, finishing
// and results. DOM-free and deterministic for a given seed and inputs.
import { CHECKPOINTS, KART_RADIUS, lapDelta, pointAt } from './track.js';
import { KART, collideBumpers, collideKarts, hitKart, makeKart, startBoost, stepKart, topSpeed } from './kart.js';
import { Driver, autopilot, classById } from './ai.js';
import { BOX_RESPAWN, COMET_TIME, ITEMS, JELLY, MUSHROOM, ROLL_TIME, SHIELD_TIME, STAR, packPosition, rollItem } from './items.js';
import { clamp, mulberry32 } from './math.js';
import { GhostRecorder } from './ghost.js';

export const STEP = 1 / 120;
export const COUNTDOWN = 3;
export const POINTS = [10, 8, 6, 4, 2, 1];
export const ROCKET_WINDOW = 0.45; // press drift this close before GO
const AFTER_PLAYER = 9; // seconds the others keep racing after you finish
const AFTER_RIVALS = 25; // seconds you get once every rival is home
const MAX_RACE = 480;
const MERCY = { gap: 0.22, leaderGap: 0.45, mul: 1.06, every: 5, boost: 0.6 };
const NEUTRAL = { steer: 0, gas: 0, brake: false, drift: false, item: false };

export class Race {
  // entrants: [{ racer, kart, player?: true, personality? }], in grid order.
  constructor({ track, entrants, mode = 'gp', classId = 'zippy', seed = 1, laps = null, items = true, rubber = true, aiSkill = null }) {
    this.track = track;
    this.mode = mode;
    this.cls = classById(classId);
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.laps = laps ?? track.laps;
    this.itemsOn = items;
    this.rubberOn = rubber;
    this.state = 'countdown';
    this.clock = -COUNTDOWN;
    this.time = 0;
    this.events = [];
    this.karts = entrants.map((e, i) => {
      const k = makeKart({ racer: e.racer, kart: e.kart, slot: track.grid6[i % track.grid6.length], index: i });
      Object.assign(k, {
        player: !!e.player,
        dist: lapDelta(track, 0, k.s), lastS: k.s, laps: 0, cp: 1, started: false, lapStart: 0,
        lapTimes: [], bestLap: Infinity, finished: false, finishTime: null, place: i + 1,
        item: null, itemUses: 0, rollT: 0, itemCd: 0, wrongT: 0, wrongWay: false,
        mercy: false, mercyT: MERCY.every, rocket: null, lat: k.lat ?? 0,
      });
      return k;
    });
    this.drivers = entrants.map((e, i) => (e.player ? null : new Driver(e.personality || e.racer.personality, { seed: this.seed * 31 + i * 7 + 1, skill: aiSkill ?? this.cls.skill, index: i })));
    this.playerIndex = entrants.findIndex((e) => e.player);
    this.player = this.playerIndex >= 0 ? this.karts[this.playerIndex] : null;
    this.boxes = items ? track.boxes.map((b, i) => ({ ...b, index: i, respawn: 0 })) : [];
    this.traps = [];
    this.jellies = [];
    this.order = [...this.karts];
    this.result = null;
    this.playerDoneAt = null;
    this.rivalsDoneAt = null;
    this.prevDrift = false;
    // The kart whose laps become ghosts: the player, or a lone time-trial kart.
    this.ghostKart = this.player ?? (mode === 'tt' ? this.karts[0] : null);
    this.ghost = this.ghostKart ? new GhostRecorder() : null;
    this.bestGhost = null; // { time, samples } of the best lap this race
    this.lastBeep = -COUNTDOWN - 1;
    // AI rocket starts are seeded: better drivers hit them more often.
    this.karts.forEach((k, i) => {
      if (!this.drivers[i]) return;
      k.rocket = this.rng() < 0.35 + 0.5 * (this.drivers[i].skill - 0.85) * 4;
    });
  }

  get L() { return this.track.length; }

  // ------------------------------------------------------------ step

  step(dt, pc = NEUTRAL) {
    pc = pc || NEUTRAL;
    if (this.state === 'done') return;
    if (this.state === 'countdown') return this.countdown(dt, pc);
    this.time += dt;
    this.clock += dt;
    const ev = this.events;
    const track = this.track;
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      let c;
      if (k.cometT > 0) c = autopilot(this, k);
      else if (k.finished && !this.drivers[i]) c = autopilot(this, k);
      else if (this.drivers[i]) c = this.drivers[i].controls(this, k, dt);
      else c = pc;
      k.speedMul = this.speedMulFor(k, i);
      k.itemCd = Math.max(0, k.itemCd - dt);
      stepKart(k, c, track, dt, ev);
      collideBumpers(k, track, ev);
      if (c.item && !k.finished) this.useItem(k);
      this.progress(k, dt);
      this.pads(k);
      this.mercy(k, dt);
      if (k.rollT > 0) {
        k.rollT -= dt;
        if (k.rollT <= 0) this.finishRoll(k);
      }
    }
    for (let a = 0; a < this.karts.length; a++) {
      for (let b = a + 1; b < this.karts.length; b++) collideKarts(this.karts[a], this.karts[b], ev);
    }
    this.itemBoxes(dt);
    this.updateTraps(dt);
    this.updateJellies(dt);
    this.places();
    const g = this.ghostKart;
    if (g && !g.finished && g.started) this.ghost.record(this.time - g.lapStart, g.x, g.y, g.h);
    this.checkEnd();
  }

  countdown(dt, pc) {
    this.clock += dt;
    const beat = Math.ceil(this.clock);
    if (beat !== this.lastBeep && beat <= 0 && beat > -COUNTDOWN) {
      this.lastBeep = beat;
      this.events.push({ type: 'count', n: -beat + 1 });
    }
    if (this.player) {
      const pressed = pc.drift && !this.prevDrift;
      this.prevDrift = !!pc.drift;
      if (pressed) this.player.rocket = this.clock > -ROCKET_WINDOW;
    }
    for (const k of this.karts) {
      // Drivers can wiggle the wheel on the grid, nothing more.
      k.steer = 0;
    }
    if (this.clock >= 0) {
      this.state = 'racing';
      this.time = this.clock;
      this.events.push({ type: 'go' });
      for (const k of this.karts) {
        if (k.rocket) {
          startBoost(k, 0.8, 1.3, 'rocket');
          this.events.push({ type: 'rocket', kart: k.index, x: k.x, y: k.y });
        }
      }
      if (this.mode === 'tt') {
        // Time trials start with a Triple Turbo, to use wherever you like.
        for (const k of this.karts) { k.item = 'triple'; k.itemUses = 3; }
      }
    }
  }

  // Class speed, a gentle rubber band for AI, and the tail wind.
  speedMulFor(k, i) {
    let mul = this.cls.speed;
    if (this.drivers[i] && this.rubberOn && this.player && !this.player.finished) {
      const gap = (this.player.dist - k.dist) / this.L; // > 0: AI is behind
      let r = clamp(gap * 0.14, -this.cls.ahead, this.cls.behind);
      // On the last lap leaders ease off less: wins are earned.
      if (r < 0 && k.laps >= this.laps - 1) r *= 0.5;
      mul *= 1 + r;
    }
    if (k.mercy) mul *= MERCY.mul;
    return mul;
  }

  // Continuous race distance; laps only count after every checkpoint.
  progress(k, dt) {
    const L = this.L;
    const ds = clamp(lapDelta(this.track, k.lastS, k.s), -40, 40);
    k.dist += ds;
    k.lastS = k.s;
    if (!k.started && k.dist >= 0) { k.started = true; k.lapStart = 0; }
    if (!k.started || k.finished) return;
    const base = k.laps * L;
    while (k.cp < CHECKPOINTS && k.dist >= base + this.track.checkpoints[k.cp]) {
      k.cp++;
      this.events.push({ type: 'checkpoint', kart: k.index, cp: k.cp - 1 });
    }
    if (k.cp >= CHECKPOINTS && k.dist >= base + L) {
      const over = ds > 0 ? (k.dist - (base + L)) / ds : 0;
      const at = this.time - dt * clamp(over, 0, 1);
      const lap = at - k.lapStart;
      k.lapTimes.push(lap);
      k.laps++;
      k.cp = 1;
      k.lapStart = at;
      if (k === this.ghostKart) {
        if (lap < k.bestLap) this.bestGhost = { time: lap, samples: this.ghost.samples.slice() };
        this.ghost.reset();
      }
      k.bestLap = Math.min(k.bestLap, lap);
      this.events.push({ type: 'lap', kart: k.index, lap: k.laps, time: lap, final: k.laps === this.laps - 1 });
      if (k.laps >= this.laps) this.finish(k, at);
    }
    // Wrong way: heading against the track for a moment.
    const m = this.track.main;
    const dot = Math.cos(k.h) * m.tx[k.hint] + Math.sin(k.h) * m.ty[k.hint];
    if (dot < -0.35 && Math.abs(k.v) > 20) k.wrongT += dt;
    else k.wrongT = Math.max(0, k.wrongT - dt * 3);
    const was = k.wrongWay;
    k.wrongWay = k.wrongT > 1.1;
    if (k.wrongWay && !was) this.events.push({ type: 'wrong-way', kart: k.index });
  }

  finish(k, at) {
    k.finished = true;
    k.finishTime = at;
    k.item = null;
    k.rollT = 0;
    this.places();
    this.events.push({ type: 'finish', kart: k.index, place: k.place, time: at });
    if (k.player) {
      this.playerDoneAt = this.time;
      // The result is fixed the moment you cross the line.
      this.result = this.freezeResult();
    }
  }

  checkEnd() {
    const all = this.karts.every((k) => k.finished);
    const rivals = this.karts.filter((k) => !k.player);
    if (this.player && !this.player.finished && rivals.length && rivals.every((k) => k.finished)) {
      this.rivalsDoneAt ??= this.time;
    }
    let done = all || this.time > MAX_RACE;
    if (this.playerDoneAt !== null && this.time - this.playerDoneAt > AFTER_PLAYER) done = true;
    if (this.rivalsDoneAt !== null && this.time - this.rivalsDoneAt > AFTER_RIVALS) done = true;
    if (!done) return;
    this.state = 'done';
    if (!this.result) this.result = this.freezeResult();
    this.events.push({ type: 'race-done' });
  }

  // Finishers by time, then everyone else by distance.
  freezeResult() {
    const done = this.karts.filter((k) => k.finished).sort((a, b) => a.finishTime - b.finishTime);
    const rest = this.karts.filter((k) => !k.finished).sort((a, b) => b.dist - a.dist);
    const order = [...done, ...rest].map((k) => k.index);
    const p = this.player;
    return {
      order,
      times: this.karts.map((k) => k.finishTime),
      playerPlace: p ? order.indexOf(p.index) + 1 : 0,
      playerTime: p?.finishTime ?? null,
      lapTimes: p ? [...p.lapTimes] : [],
      bestLap: p && Number.isFinite(p.bestLap) ? p.bestLap : null,
      ghost: this.bestGhost,
    };
  }

  places() {
    const ranked = [...this.karts].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTime - b.finishTime;
      return b.dist - a.dist;
    });
    ranked.forEach((k, i) => {
      if (k.place !== i + 1 && k.player && this.state === 'racing') this.events.push({ type: 'place', kart: k.index, from: k.place, to: i + 1 });
      k.place = i + 1;
    });
    this.order = ranked;
  }

  // ------------------------------------------------------------ helpers

  racerAhead(k) {
    if (k.place <= 1) return null;
    const o = this.order[k.place - 2];
    return o ? { kart: o, gap: o.dist - k.dist } : null;
  }

  nearestBehind(k) {
    let best = null;
    for (const o of this.karts) {
      if (o === k) continue;
      const gap = k.dist - o.dist;
      if (gap > 0 && (!best || gap < best.gap)) best = { kart: o, gap };
    }
    return best;
  }

  jellyChasing(k) {
    return this.jellies.some((j) => j.target === k.index && Math.hypot(j.x - k.x, j.y - k.y) < 420);
  }

  // ------------------------------------------------------------ track bits

  pads(k) {
    const pads = this.track.pads;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const dx = k.x - p.x, dy = k.y - p.y;
      const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
      const along = dx * ca + dy * sa, side = -dx * sa + dy * ca;
      if (Math.abs(along) < p.len / 2 + 4 && Math.abs(side) < p.w / 2 + 6) {
        if (k.lastPad === i && k.padT > 0) { k.padT = 0.3; continue; }
        k.lastPad = i;
        k.padT = 0.3;
        startBoost(k, 0.9, 1.32, 'pad');
        this.events.push({ type: 'pad', kart: k.index, x: p.x, y: p.y });
      }
    }
  }

  mercy(k, dt) {
    if (k.finished || this.karts.length < 2 || !this.itemsOn) { k.mercy = false; return; }
    const leader = this.order[0];
    const ahead = this.racerAhead(k);
    const L = this.L;
    const was = k.mercy;
    k.mercy = !!ahead && (ahead.gap > MERCY.gap * L || leader.dist - k.dist > MERCY.leaderGap * L);
    if (k.mercy && !was) this.events.push({ type: 'tailwind', kart: k.index });
    if (!k.mercy) { k.mercyT = MERCY.every; return; }
    k.mercyT -= dt;
    if (k.mercyT <= 0) {
      k.mercyT = MERCY.every;
      startBoost(k, MERCY.boost, 1.25, 'tailwind');
      this.events.push({ type: 'tailwind-boost', kart: k.index, x: k.x, y: k.y });
    }
  }

  itemBoxes(dt) {
    for (const b of this.boxes) {
      if (b.respawn > 0) { b.respawn -= dt; continue; }
      for (const k of this.karts) {
        if (k.finished || k.z > 22) continue;
        const r = b.r + KART_RADIUS + 3;
        if ((k.x - b.x) ** 2 + (k.y - b.y) ** 2 > r * r) continue;
        b.respawn = BOX_RESPAWN;
        this.events.push({ type: 'box', kart: k.index, x: b.x, y: b.y, box: b.index });
        if (!k.item && k.rollT <= 0) {
          k.rollT = ROLL_TIME;
          this.events.push({ type: 'roll', kart: k.index });
        }
        break;
      }
    }
  }

  finishRoll(k) {
    const leader = this.order[0];
    const t = packPosition(k.place, this.karts.length, Math.max(0, leader.dist - k.dist), this.L);
    let id = rollItem(t, this.rng());
    // Racing alone (or out in front with nobody to chase), a jelly has no
    // one to chase: give a mushroom instead.
    if (id === 'jelly' && this.karts.length < 2) id = 'mushroom';
    k.item = id;
    k.itemUses = ITEMS[id].uses;
    this.events.push({ type: 'item', kart: k.index, item: id });
  }

  useItem(k) {
    if (!k.item || k.rollT > 0 || k.itemCd > 0) return false;
    k.itemCd = 0.35;
    const id = k.item;
    const ev = this.events;
    const fx = Math.cos(k.h), fy = Math.sin(k.h);
    switch (id) {
      case 'shield':
        k.shieldT = SHIELD_TIME;
        ev.push({ type: 'shield', kart: k.index });
        break;
      case 'star': {
        const x = k.x - fx * 28, y = k.y - fy * 28;
        this.traps.push({ x, y, owner: k.index, safe: STAR.safe, life: STAR.life, spin: this.rng() * 6 });
        ev.push({ type: 'star-drop', kart: k.index, x, y });
        break;
      }
      case 'mushroom':
      case 'triple':
        startBoost(k, MUSHROOM.time, MUSHROOM.mul, 'mushroom');
        ev.push({ type: 'mushroom', kart: k.index, x: k.x, y: k.y });
        break;
      case 'jelly': {
        const ahead = this.racerAhead(k);
        this.jellies.push({
          x: k.x + fx * 22, y: k.y + fy * 22, s: k.s + 22, lat: k.lat ?? 0, owner: k.index,
          target: ahead ? ahead.kart.index : -1, life: ahead ? JELLY.life : 3, free: false, h: k.h, age: 0,
        });
        ev.push({ type: 'jelly-fire', kart: k.index, target: ahead ? ahead.kart.index : -1 });
        break;
      }
      case 'comet':
        k.cometT = COMET_TIME;
        k.drift = 0; k.driftT = 0; k.tier = 0;
        ev.push({ type: 'comet', kart: k.index });
        break;
      default:
        break;
    }
    k.itemUses--;
    if (k.itemUses <= 0) { k.item = null; k.itemUses = 0; }
    return true;
  }

  updateTraps(dt) {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.life -= dt;
      t.safe -= dt;
      t.spin += dt * 2;
      let gone = t.life <= 0;
      if (!gone) {
        for (const k of this.karts) {
          if (k.index === t.owner && t.safe > 0) continue;
          const r = STAR.radius + KART_RADIUS;
          if ((k.x - t.x) ** 2 + (k.y - t.y) ** 2 > r * r || k.z > 18) continue;
          hitKart(k, this.events, { strength: 0.8, by: t.owner, kind: 'star' });
          this.events.push({ type: 'star-hit', kart: k.index, by: t.owner, x: t.x, y: t.y });
          gone = true;
          break;
        }
      }
      if (gone) this.traps.splice(i, 1);
    }
  }

  updateJellies(dt) {
    const track = this.track;
    for (let i = this.jellies.length - 1; i >= 0; i--) {
      const j = this.jellies[i];
      j.life -= dt;
      j.age += dt;
      const target = j.target >= 0 ? this.karts[j.target] : null;
      const px = j.x, py = j.y;
      if (!j.free) {
        j.s += JELLY.speed * dt;
        if (target) {
          const ahead = lapDelta(track, j.s, target.s);
          j.lat += clamp((target.lat ?? 0) - j.lat, -220 * dt, 220 * dt);
          if (ahead < JELLY.homeRange && ahead > -80) j.free = true;
        } else {
          j.lat *= 1 - 2 * dt;
        }
        const p = pointAt(track, j.s, j.lat);
        j.x = p.x; j.y = p.y;
      } else if (target) {
        const dx = target.x - j.x, dy = target.y - j.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.max(JELLY.speed, Math.abs(target.v) + 60) * dt;
        j.x += (dx / d) * Math.min(sp, d);
        j.y += (dy / d) * Math.min(sp, d);
      }
      j.h = Math.atan2(j.y - py, j.x - px) || j.h;
      let gone = j.life <= 0;
      if (gone) this.events.push({ type: 'jelly-fizzle', x: j.x, y: j.y });
      for (const k of gone ? [] : this.karts) {
        if (k.index === j.owner && j.age < 0.6) continue;
        const r = JELLY.radius + KART_RADIUS;
        if ((k.x - j.x) ** 2 + (k.y - j.y) ** 2 > r * r) continue;
        hitKart(k, this.events, { strength: 1, by: j.owner, kind: 'jelly' });
        this.events.push({ type: 'jelly-hit', kart: k.index, by: j.owner, x: j.x, y: j.y });
        gone = true;
        break;
      }
      if (!gone) {
        for (let t = this.traps.length - 1; t >= 0; t--) {
          const s = this.traps[t];
          const r = JELLY.radius + STAR.radius;
          if ((s.x - j.x) ** 2 + (s.y - j.y) ** 2 > r * r) continue;
          this.traps.splice(t, 1);
          this.events.push({ type: 'pop', x: j.x, y: j.y });
          gone = true;
          break;
        }
      }
      if (gone) this.jellies.splice(i, 1);
    }
  }
}

// Points for a frozen result order (by entrant index).
export function pointsFor(order) {
  const pts = new Array(order.length).fill(0);
  order.forEach((idx, place) => { pts[idx] = POINTS[place] ?? 0; });
  return pts;
}

// Runs a whole race with no player input (tests, reference laps).
export function simulate(race, { maxTime = 400, controls = null } = {}) {
  let steps = 0;
  while (race.state !== 'done' && race.time < maxTime && steps < maxTime * 130) {
    race.step(STEP, controls ? controls(race) : null);
    race.events.length = 0;
    steps++;
  }
  return race;
}

export { KART, topSpeed };
