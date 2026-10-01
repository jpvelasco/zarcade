// Moving things on the map: animals wandering their habitats and visitors
// strolling the roads. DOM-free and seeded; the renderer only reads it.
import { ANIMALS, ANIMAL_INDEX, BIOMES, JOY } from './data.js';
import { plotRect, viewSpot, viewNode, roadPath, nodePos, GATE_NODE, GATE } from './map.js';
import { Rng } from './rng.js';

export const VISITOR_VARIANTS = 12;
export const MAX_VISITORS = 28;
const GOLDEN_GAP = [70, 120];

export function targetVisitors(rate) {
  if (rate <= 0) return 0;
  return Math.max(3, Math.min(MAX_VISITORS, Math.round(3 + Math.sqrt(rate) * 0.9)));
}

// Where an animal may stand inside habitat i (feet position).
export function roamBox(i) {
  const p = plotRect(i);
  return { x0: p.x + 34, x1: p.x + p.w - 34, y0: p.y + 62, y1: p.y + p.h - 22 };
}

export class Actors {
  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.animals = new Map(); // id -> actor
    this.visitors = [];
    this.bank = [];
    this.spawnClock = 0;
    this.goldenClock = this.rng.range(25, 45);
    this.events = [];
    this.nextId = 1;
  }

  // Match animal actors to the zoo's habitats.
  sync(zoo, { pop = true } = {}) {
    const s = zoo.state;
    const seen = new Set();
    s.habitats.forEach((h, i) => {
      for (const id of h.animals) {
        seen.add(id);
        let a = this.animals.get(id);
        if (!a || a.habitat !== i) {
          const box = roamBox(i);
          const def = ANIMALS[ANIMAL_INDEX[id]];
          a = {
            id, habitat: i, def, size: def.look.size,
            x: this.rng.range(box.x0, box.x1), y: this.rng.range(box.y0, box.y1),
            tx: 0, ty: 0, wait: this.rng.range(0.5, 3), moving: false,
            face: this.rng.next() < 0.5 ? -1 : 1, phase: this.rng.range(0, 6.28),
            petT: 0, petCool: 0, popT: pop ? 1 : 0, emoteT: 0,
            speed: 22 + 18 * (1.2 - Math.min(1.2, def.look.size)) + this.rng.range(0, 10),
            swim: BIOMES[Math.floor(i / 3)].id === 'ocean' || ['fish', 'octopus', 'seahorse'].includes(def.look.kind),
          };
          a.tx = a.x;
          a.ty = a.y;
          this.animals.set(id, a);
        }
      }
    });
    for (const id of [...this.animals.keys()]) if (!seen.has(id)) this.animals.delete(id);
  }

  update(dt, zoo, { reduced = false } = {}) {
    const s = zoo.state;
    this.events.length = 0;
    for (const a of this.animals.values()) this.updateAnimal(a, dt, reduced);
    // Coins waiting for the next viewer at each habitat (visual only).
    for (let i = 0; i < s.habitats.length; i++) {
      const r = zoo.habitatRate(i);
      this.bank[i] = Math.min((this.bank[i] || 0) + r * dt, r * 45);
    }
    this.spawnClock -= dt;
    const want = targetVisitors(zoo.rate);
    const watchable = s.habitats.map((h, i) => (h.animals.length ? i : -1)).filter((i) => i >= 0);
    if (this.spawnClock <= 0 && watchable.length && this.visitors.length < want) {
      this.spawnClock = this.rng.range(0.9, 1.8);
      this.spawn(watchable);
    }
    this.goldenClock -= dt;
    if (this.goldenClock <= 0 && watchable.length) {
      this.goldenClock = this.rng.range(...GOLDEN_GAP);
      if (!this.visitors.some((v) => v.golden)) this.spawn(watchable, { golden: true });
    }
    for (const v of this.visitors) this.updateVisitor(v, dt, zoo);
    this.visitors = this.visitors.filter((v) => !v.gone);
  }

  updateAnimal(a, dt, reduced) {
    a.phase += dt * (a.moving ? 9 : 2.2);
    if (a.petT > 0) a.petT = Math.max(0, a.petT - dt);
    if (a.petCool > 0) a.petCool = Math.max(0, a.petCool - dt);
    if (a.popT > 0) a.popT = Math.max(0, a.popT - dt * 1.6);
    if (a.emoteT > 0) a.emoteT = Math.max(0, a.emoteT - dt);
    if (a.petT > 0) return;
    if (a.moving) {
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      const step = a.speed * dt;
      if (d <= step) {
        a.x = a.tx;
        a.y = a.ty;
        a.moving = false;
        a.wait = this.rng.range(1.2, 4.5);
        if (!reduced && this.rng.next() < 0.25) a.emoteT = 0.9;
      } else {
        a.x += (dx / d) * step;
        a.y += (dy / d) * step;
        if (Math.abs(dx) > 2) a.face = dx < 0 ? -1 : 1;
      }
    } else {
      a.wait -= dt;
      if (a.wait <= 0) {
        const box = roamBox(a.habitat);
        a.tx = Math.max(box.x0, Math.min(box.x1, a.x + this.rng.range(-110, 110)));
        a.ty = Math.max(box.y0, Math.min(box.y1, a.y + this.rng.range(-60, 60)));
        a.moving = true;
      }
    }
  }

  // Pet the animal: returns true when it counts for Joy (off cooldown).
  pet(id) {
    const a = this.animals.get(id);
    if (!a) return false;
    a.petT = 0.75;
    a.moving = false;
    a.wait = 1.5;
    if (a.petCool > 0) return false;
    a.petCool = JOY.petCooldown;
    return true;
  }

  animalAt(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const a of this.animals.values()) {
      const r = 34 * a.size + 6;
      const cy = a.y - 26 * a.size;
      const d = Math.hypot(x - a.x, y - cy);
      if (d < r && d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  spawn(watchable, { golden = false } = {}) {
    const n = Math.min(watchable.length, 2 + this.rng.int(3));
    const plan = [];
    const pool = watchable.slice();
    for (let k = 0; k < n; k++) plan.push(pool.splice(this.rng.int(pool.length), 1)[0]);
    const nodes = [GATE_NODE];
    for (const i of plan) nodes.push(viewNode(i));
    nodes.push(GATE_NODE);
    const route = [];
    const stops = new Map();
    for (let k = 1; k < nodes.length; k++) {
      const seg = roadPath(nodes[k - 1], nodes[k]) || [];
      for (let j = route.length ? 1 : 0; j < seg.length; j++) route.push(seg[j]);
      if (k < nodes.length - 1) stops.set(route.length - 1, plan[k - 1]);
    }
    this.visitors.push({
      uid: this.nextId++,
      route, stops, idx: 0,
      x: GATE.x + this.rng.range(-10, 10), y: GATE.y,
      lane: this.rng.range(-14, 14),
      speed: this.rng.range(46, 66) * (golden ? 0.85 : 1),
      variant: this.rng.int(VISITOR_VARIANTS),
      balloon: golden ? -1 : (this.rng.next() < 0.3 ? this.rng.int(5) : null),
      golden,
      watchT: 0, watching: -1, face: 1, phase: this.rng.range(0, 6.28), gone: false, greeted: false,
    });
  }

  updateVisitor(v, dt, zoo) {
    v.phase += dt * 10;
    if (v.watchT > 0) {
      v.watchT -= dt;
      if (v.watchT <= 0) {
        const i = v.watching;
        const amount = this.bank[i] || 0;
        this.bank[i] = 0;
        this.events.push({ type: 'view', habitat: i, x: v.x, y: v.y - 30, amount });
        v.watching = -1;
      }
      return;
    }
    if (v.idx >= v.route.length - 1) {
      v.gone = true;
      zoo.welcomeVisitor();
      return;
    }
    const n = nodePos(v.route[v.idx + 1]);
    const vertical = Math.abs(n.x - nodePos(v.route[v.idx]).x) < 1;
    const tx = n.x + (vertical ? v.lane : 0);
    const ty = n.y + (vertical ? 0 : v.lane * 0.6);
    const dx = tx - v.x;
    const dy = ty - v.y;
    const d = Math.hypot(dx, dy);
    const step = v.speed * dt;
    if (d <= step) {
      v.x = tx;
      v.y = ty;
      v.idx++;
      const stop = v.stops.get(v.idx);
      if (stop !== undefined && zoo.state.habitats[stop].animals.length) {
        const spot = viewSpot(stop);
        v.watching = stop;
        v.watchT = this.rng.range(2.2, 3.8);
        v.y = spot.y + (spot.face > 0 ? 16 : -16) + this.rng.range(-4, 4);
        v.x += this.rng.range(-50, 50);
        v.face = this.rng.next() < 0.5 ? -1 : 1;
      }
    } else {
      v.x += (dx / d) * step;
      v.y += (dy / d) * step;
      if (Math.abs(dx) > 1) v.face = dx < 0 ? -1 : 1;
    }
  }

  goldenAt(x, y) {
    return this.visitors.find((v) => v.golden && !v.greeted && Math.hypot(x - v.x, y - (v.y - 40)) < 46) || null;
  }
}
