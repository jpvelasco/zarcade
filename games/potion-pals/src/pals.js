// The pals pottering about the treehouse. A tiny state machine per pal, kept
// DOM-free: it is handed the room floor rectangles and nothing else, so tests
// can check pals stay indoors and that the same seed always looks the same.
import { Rng, hashString, mix } from './rng.js';

export const STATES = ['idle', 'walk', 'play', 'nap'];
export const ARRIVE_MS = 1.3;

function pick(rng, pairs) {
  let r = rng.next();
  for (const [name, weight] of pairs) {
    r -= weight;
    if (r <= 0) return name;
  }
  return pairs[pairs.length - 1][0];
}

export class PalSim {
  constructor(seed = 1) {
    this.rng = new Rng(mix(seed >>> 0, 0x5bd1));
    this.seed = seed >>> 0;
    this.actors = [];
    this.byId = new Map();
  }

  // owned: [{ id, room }] in arrival order. Adds newcomers, drops strangers,
  // and keeps everyone else exactly where they were.
  sync(owned, rooms, { walkIn = false, from = null } = {}) {
    const want = new Map(owned.map((o) => [o.id, o.room]));
    for (let i = this.actors.length - 1; i >= 0; i--) {
      if (!want.has(this.actors[i].id)) {
        this.byId.delete(this.actors[i].id);
        this.actors.splice(i, 1);
      }
    }
    for (const { id, room } of owned) {
      const existing = this.byId.get(id);
      if (existing) {
        if (existing.room !== room) {
          existing.room = room;
          this.place(existing, rooms);
        }
        continue;
      }
      const actor = this.make(id, room, rooms);
      if (walkIn && from) {
        actor.state = 'arrive';
        actor.t = 0;
        actor.dur = ARRIVE_MS;
        actor.fromX = from.x;
        actor.fromY = from.y;
        actor.x = from.x;
        actor.y = from.y;
      }
      this.actors.push(actor);
      this.byId.set(id, actor);
    }
    this.actors.sort((a, b) => a.room - b.room || a.y - b.y);
    return this.actors;
  }

  make(id, room, rooms) {
    // A stable per-pal seed keeps size, speed and rhythm the same every load.
    const r = new Rng(mix(hashString(id), this.seed));
    const actor = {
      id,
      room,
      x: 0,
      y: 0,
      tx: 0,
      face: r.next() < 0.5 ? -1 : 1,
      size: 0.86 + r.next() * 0.3,
      speed: 0.7 + r.next() * 0.7,
      phase: r.next() * Math.PI * 2,
      state: 'idle',
      t: 0,
      dur: 0.6 + r.next() * 1.8,
      hop: 0,
      blink: 0,
      blinkIn: 1 + r.next() * 3,
      rng: r,
      fromX: 0,
      fromY: 0,
      arrived: true,
    };
    this.place(actor, rooms);
    return actor;
  }

  place(actor, rooms) {
    const f = floorOf(rooms, actor.room);
    actor.x = f.x + actor.rng.next() * f.w;
    actor.y = f.y + f.h * (0.4 + actor.rng.next() * 0.5);
    actor.tx = actor.x;
  }

  update(dt, rooms, { reduced = false } = {}) {
    const step = Math.min(0.05, dt);
    for (const a of this.actors) {
      const f = floorOf(rooms, a.room);
      a.t += step;
      a.hop = Math.max(0, a.hop - step * 2.2);
      a.blinkIn -= step;
      if (a.blinkIn <= 0) { a.blink = 0.12; a.blinkIn = 1.8 + a.rng.next() * 3.4; }
      a.blink = Math.max(0, a.blink - step);
      if (!reduced) a.phase += step * (a.state === 'play' ? 7 : a.state === 'nap' ? 1.1 : 2.4);

      if (a.state === 'arrive') {
        const k = Math.min(1, a.t / a.dur);
        const tx = f.x + f.w * 0.5;
        const ty = f.y + f.h * 0.6;
        a.x = a.fromX + (tx - a.fromX) * k;
        a.y = a.fromY + (ty - a.fromY) * k - Math.sin(k * Math.PI) * 60;
        a.face = tx >= a.fromX ? 1 : -1;
        if (k >= 1) { a.arrived = true; this.next(a, f); }
        continue;
      }

      if (a.state === 'walk') {
        const speed = Math.max(14, f.w * 0.2) * a.speed;
        const dx = a.tx - a.x;
        const move = Math.sign(dx) * Math.min(Math.abs(dx), speed * step);
        a.x += move;
        a.face = dx === 0 ? a.face : dx > 0 ? 1 : -1;
        if (Math.abs(dx) < 2 || a.t > a.dur) this.next(a, f);
      } else if (a.t > a.dur) {
        this.next(a, f);
      }
      // Rooms can change size when the window does; nudge everyone back in.
      a.x = Math.max(f.x, Math.min(f.x + f.w, a.x));
      a.y = Math.max(f.y, Math.min(f.y + f.h, a.y));
    }
    this.actors.sort((a, b) => a.room - b.room || a.y - b.y);
  }

  next(a, f) {
    a.t = 0;
    const was = a.state;
    const state = was === 'walk'
      ? pick(a.rng, [['idle', 0.45], ['play', 0.3], ['walk', 0.15], ['nap', 0.1]])
      : was === 'idle'
        ? pick(a.rng, [['walk', 0.55], ['play', 0.26], ['nap', 0.19]])
        : 'idle';
    a.state = state;
    if (state === 'walk') {
      a.tx = f.x + a.rng.next() * f.w;
      a.dur = 6;
    } else if (state === 'play') {
      a.dur = 1.6 + a.rng.next() * 2.2;
    } else if (state === 'nap') {
      a.dur = 6 + a.rng.next() * 9;
    } else {
      a.dur = 0.8 + a.rng.next() * 2.2;
    }
  }

  // Say hello: a hop, and whatever the pal was doing is interrupted.
  poke(id) {
    const a = this.byId.get(id);
    if (!a) return null;
    a.hop = 1;
    if (a.state === 'nap') { a.state = 'idle'; a.t = 0; a.dur = 1.4; }
    return a;
  }

  // The topmost pal under a point, or null.
  at(x, y) {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      const r = 26 * a.size;
      if (Math.abs(x - a.x) <= r && y >= a.y - r * 2 && y <= a.y + r * 0.6) return a;
    }
    return null;
  }

  get(id) { return this.byId.get(id) || null; }
}

export function floorOf(rooms, room) {
  const r = rooms[Math.min(rooms.length - 1, Math.max(0, room))];
  return r.floor;
}

// How high a pal sits above its feet right now, in pixels. The renderer adds
// this; the sim keeps `y` as the feet line so sorting stays simple.
export function liftOf(a, reduced = false) {
  if (reduced) return a.state === 'play' ? 2 : 0;
  const hop = Math.sin(Math.min(1, a.hop) * Math.PI) * 16;
  if (a.state === 'play') return hop + Math.abs(Math.sin(a.phase)) * 14;
  if (a.state === 'nap') return hop;
  return hop + (Math.sin(a.phase) * 0.5 + 0.5) * 3;
}
