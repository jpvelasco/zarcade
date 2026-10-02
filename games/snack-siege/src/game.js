// The DOM-free Snack Siege simulation: a level's fort on the physics engine,
// the slingshot, bean powers, damage, scoring and turn flow.
import { Physics, setDensity, wake, CIRCLE } from './physics.js';
import {
  TICK, SUBSTEPS, GRAVITY, SLING, MAX_SPEED, KILL_Y, BEAN_BONUS, BEAR_SCORE, COMBO_WINDOW,
  DMG_SPEED, DMG_K, BEAR_FRAGILITY, BEAN_HIT, HEAVY_HIT, BEAN_ROLL, MATERIALS, BEARS, BEANS, POWERS,
} from './config.js';

const CAT_WORLD = 1;
const CAT_BEAN = 2;

export class Game {
  constructor(level) {
    this.level = level;
    this.phys = new Physics({ gravity: GRAVITY, dt: TICK / SUBSTEPS, iterations: 8 });
    this.queue = level.beans.slice();
    this.state = 'aim'; // aim | flying | won | lost
    this.score = 0;
    this.time = 0;
    this.turnTime = 0;
    this.shots = 0;
    this.events = [];
    this.active = []; // ids of beans from the current shot
    this.spent = []; // ids of beans from earlier shots
    this.powerUsed = false;
    this.honey = null; // { id, target, lx, ly, la, fuse }
    this.boostTime = 0;
    this.combo = 0;
    this.comboAt = -10;
    this.maxCombo = 0;
    this.lastPopAt = -10;
    this.pending = []; // delayed fizz explosions: { id, at }
    this.bearsTotal = level.bears.length;
    this.bearsLeft = level.bears.length;
    this.broken = 0;
    this.bonus = 0;
    this.stars = 0;
    this.thresholds = level.stars;
    this.bounds = { left: -12, right: level.width + 12 };
    this.build();
  }

  build() {
    const p = this.phys;
    for (const [x0, x1] of this.level.ground) {
      p.add({ shape: 'box', x: (x0 + x1) / 2, y: -2, w: x1 - x0, h: 4, isStatic: true, friction: 0.8, data: { kind: 'ground' } });
    }
    for (const t of this.level.terrain) {
      p.add({ shape: 'box', x: t.x, y: t.y, w: t.w, h: t.h, a: t.a || 0, isStatic: true, friction: t.ice ? 0.1 : 0.8, data: { kind: 'ground', ice: !!t.ice } });
    }
    for (const pc of this.level.pieces) {
      const mat = MATERIALS[pc.mat];
      const round = pc.shape === 'circle';
      p.add({
        shape: round ? 'circle' : 'box', x: pc.x, y: pc.y, w: pc.w, h: pc.h, r: pc.r, a: pc.a || 0,
        density: mat.density, friction: mat.friction, restitution: mat.restitution,
        sleeping: true, cat: CAT_WORLD,
        data: { kind: 'piece', mat: pc.mat, hp: mat.hp * (round ? 1 : areaScale(pc)), maxHp: mat.hp * (round ? 1 : areaScale(pc)) },
      });
    }
    for (const br of this.level.bears) {
      const spec = BEARS[br.size];
      p.add({
        shape: 'circle', x: br.x, y: br.y, r: spec.r, density: spec.density, friction: 0.7, restitution: 0.15,
        sleeping: true, cat: CAT_WORLD, angDamp: 1.6,
        data: { kind: 'bear', size: br.size, hp: spec.hp, maxHp: spec.hp, hurt: 0 },
      });
    }
  }

  get bean() { return this.queue[0] || null; }
  get bodies() { return this.phys.bodies; }

  emit(type, data) { this.events.push({ type, ...data }); }

  // Launch the next bean with a velocity (world units / s).
  launch(vx, vy) {
    if (this.state !== 'aim' || !this.queue.length) return false;
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vy *= MAX_SPEED / speed; }
    // Beans from earlier shots leave the stage.
    for (const id of this.spent.concat(this.active)) {
      const b = this.phys.byId(id);
      if (b) { this.emit('poof', { x: b.x, y: b.y, bean: b.data.bean }); this.phys.remove(b); }
    }
    this.spent = [];
    const type = this.queue.shift();
    const spec = BEANS[type];
    const b = this.phys.add({
      shape: 'circle', x: SLING.x, y: SLING.y, r: spec.r, vx, vy, density: spec.density,
      friction: spec.friction, restitution: spec.restitution, cat: CAT_BEAN, angDamp: 0.6,
      data: { kind: 'bean', bean: type, hits: 0 },
    });
    b.w = -speed * 0.15;
    this.active = [b.id];
    this.powerUsed = false;
    this.honey = null;
    this.state = 'flying';
    this.turnTime = 0;
    this.shots++;
    this.emit('launch', { bean: type, speed: Math.hypot(vx, vy) });
    return true;
  }

  // Use the flying bean's power. Returns true if something happened.
  usePower() {
    if (this.state !== 'flying' || this.powerUsed) return false;
    const main = this.phys.byId(this.active[0]);
    if (!main) return false;
    const type = main.data.bean;
    const power = BEANS[type].power;
    if (!power) return false;
    if (power === 'sticky') {
      this.powerUsed = true;
      this.burstHoney(main);
      return true;
    }
    if (main.data.hits > 0 && power !== 'hop') return false; // powers work in flight
    this.powerUsed = true;
    if (power === 'split') {
      const sp = POWERS.split;
      const speed = Math.hypot(main.vx, main.vy);
      const ang = Math.atan2(main.vy, main.vx);
      const ids = [];
      for (const k of [-1, 0, 1]) {
        const a = ang + k * sp.spread;
        const c = this.phys.add({
          shape: 'circle', x: main.x + Math.cos(a + Math.PI / 2) * k * 0.35, y: main.y + Math.sin(a + Math.PI / 2) * k * 0.35,
          r: sp.childR, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, density: BEANS.blue.density,
          friction: 0.6, restitution: 0.2, cat: CAT_BEAN, mask: CAT_WORLD, angDamp: 0.6,
          data: { kind: 'bean', bean: 'blue', mini: true, hits: 0 },
        });
        ids.push(c.id);
      }
      this.phys.remove(main);
      this.active = ids;
    } else if (power === 'hop') {
      main.vy = POWERS.hop.vy;
      main.vx *= 0.9;
      wake(main);
    } else if (power === 'heavy') {
      const h = POWERS.heavy;
      setDensity(main, h.density);
      main.vx *= h.keepVx;
      main.vy = Math.min(main.vy, h.vy);
      main.data.heavy = true;
      main.friction = 1;
      main.restitution = 0;
    } else if (power === 'boost') {
      const b = POWERS.boost;
      const speed = Math.hypot(main.vx, main.vy) || 1;
      main.vx = (main.vx / speed) * b.speed;
      main.vy = (main.vy / speed) * b.speed;
      main.gravityScale = b.gravityScale;
      this.boostTime = b.time;
      main.data.boost = true;
    }
    this.emit('power', { power, bean: type, x: main.x, y: main.y });
    return true;
  }

  burstHoney(b) {
    const s = POWERS.sticky;
    this.emit('burst', { x: b.x, y: b.y });
    this.phys.remove(b);
    this.active = this.active.filter((id) => id !== b.id);
    this.honey = null;
    this.blast(b.x, b.y, s.radius, s.strength, s.damage);
  }

  blast(x, y, radius, strength, damage) {
    const reached = this.phys.explode(x, y, radius, strength);
    for (const { body, f } of reached) {
      const d = body.data;
      if (!d || d.hp === undefined) continue;
      this.damage(body, damage * f * (d.kind === 'bear' ? BEAR_FRAGILITY : 1));
    }
  }

  // One 1/60 s tick.
  update() {
    if (this.state === 'won' || this.state === 'lost') return;
    const p = this.phys;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.followHoney();
      p.step();
      this.processHits();
    }
    this.time += TICK;
    this.turnTime += TICK;

    if (this.boostTime > 0) {
      this.boostTime -= TICK;
      if (this.boostTime <= 0) for (const id of this.active) { const b = p.byId(id); if (b) b.gravityScale = 1; }
    }
    if (this.honey) {
      this.honey.fuse -= TICK;
      const hb = p.byId(this.honey.id);
      if (!hb) this.honey = null;
      else if (this.honey.fuse <= 0) { this.powerUsed = true; this.burstHoney(hb); }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      if (this.time < e.at) continue;
      this.pending.splice(i, 1);
      const b = p.byId(e.id);
      if (b) this.destroy(b, 'explode');
    }
    this.cullOutside();
    this.settleBeans();
    if (this.state === 'flying') this.checkTurn();
  }

  // Rolling resistance for beans that have landed.
  settleBeans() {
    const k = Math.exp(-BEAN_ROLL.damp * TICK);
    const kFast = Math.exp(-BEAN_ROLL.dampFast * TICK);
    for (const list of [this.active, this.spent]) {
      for (const id of list) {
        const b = this.phys.byId(id);
        if (!b || b.sleeping || b.ghost || !b.data.hits || (b.data.boost && this.boostTime > 0)) continue;
        if (Math.abs(b.vy) > BEAN_ROLL.below) continue; // still bouncing or falling
        const f = b.vx * b.vx > BEAN_ROLL.below * BEAN_ROLL.below ? kFast : k;
        b.vx *= f;
        b.w *= f;
      }
    }
    // Bears and gumballs stop rolling once they are nearly still.
    for (const b of this.phys.bodies) {
      if (b.sleeping || b.removed || b.shape !== CIRCLE || !b.data || b.data.kind === 'bean') continue;
      if (b.vx * b.vx + b.vy * b.vy > BEAN_ROLL.bear * BEAN_ROLL.bear) continue;
      b.vx *= k;
      b.w *= k;
    }
  }

  followHoney() {
    const h = this.honey;
    if (!h || !h.target) return;
    const hb = this.phys.byId(h.id);
    const t = this.phys.byId(h.target);
    if (!hb) return;
    if (!t) {
      // What it stuck to is gone: drop.
      hb.ghost = false;
      h.target = null;
      return;
    }
    const c = Math.cos(t.a), s = Math.sin(t.a);
    hb.x = t.x + c * h.lx - s * h.ly;
    hb.y = t.y + s * h.lx + c * h.ly;
    hb.vx = t.vx; hb.vy = t.vy;
    hb.a = t.a + h.la;
  }

  processHits() {
    const hits = this.phys.hits;
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const a = h.a, b = h.b;
      for (const [me, other] of [[a, b], [b, a]]) {
        const d = me.data;
        if (d && d.kind === 'bean') {
          d.hits++;
          if (d.bean === 'honey' && !this.honey && !this.powerUsed && this.active.includes(me.id)) this.stick(me, other);
          if (d.hits === 1 && h.speed > 3) this.emit('bounce', { x: h.x, y: h.y, bean: d.bean, speed: h.speed });
        }
      }
      if (h.speed <= DMG_SPEED) {
        if (h.speed > 1.4) this.emitThud(h, 0.2);
        continue;
      }
      const base = (h.speed - DMG_SPEED) * h.mass * DMG_K;
      this.emitThud(h, base);
      for (const [me, other] of [[a, b], [b, a]]) {
        const d = me.data;
        if (!d || d.hp === undefined || me.removed) continue;
        let dmg = base;
        const od = other.data;
        if (od && od.kind === 'bean') dmg *= od.heavy ? HEAVY_HIT : BEAN_HIT;
        if (d.kind === 'bear') dmg *= BEAR_FRAGILITY;
        this.damage(me, dmg);
      }
    }
  }

  emitThud(h, strength) {
    const piece = [h.a, h.b].find((b) => b.data && b.data.kind === 'piece');
    const bear = [h.a, h.b].find((b) => b.data && b.data.kind === 'bear');
    this.emit('hit', { x: h.x, y: h.y, mat: piece ? piece.data.mat : bear ? 'bear' : 'ground', strength, speed: h.speed });
  }

  stick(bean, other) {
    const h = { id: bean.id, target: null, lx: 0, ly: 0, la: 0, fuse: POWERS.sticky.fuse };
    if (other && !other.isStatic) {
      const dx = bean.x - other.x, dy = bean.y - other.y;
      const c = Math.cos(other.a), s = Math.sin(other.a);
      h.target = other.id;
      h.lx = c * dx + s * dy;
      h.ly = -s * dx + c * dy;
      h.la = bean.a - other.a;
      bean.ghost = true;
    } else {
      bean.vx = 0; bean.vy = 0; bean.w = 0;
      bean.ghost = true;
      bean.gravityScale = 0;
    }
    bean.vx = other ? other.vx : 0;
    bean.vy = other ? other.vy : 0;
    this.honey = h;
    this.emit('stick', { x: bean.x, y: bean.y });
  }

  damage(body, amount) {
    const d = body.data;
    if (body.removed || amount <= 0) return;
    d.hp -= amount;
    if (d.kind === 'bear') d.hurt = 1;
    if (d.hp <= 0) this.destroy(body, 'smash');
  }

  destroy(body, how) {
    if (body.removed) return;
    const d = body.data;
    this.phys.remove(body);
    if (d.kind === 'piece') {
      const mat = MATERIALS[d.mat];
      this.broken++;
      const pts = this.addPoints(mat.score, body.x, body.y);
      this.emit('break', { mat: d.mat, x: body.x, y: body.y, a: body.a, w: body.hw * 2, h: body.hh * 2, r: body.r, round: body.shape === CIRCLE, points: pts, how });
      if (mat.explode) {
        const e = mat.explode;
        this.emit('explode', { x: body.x, y: body.y, radius: e.radius });
        // Chain into neighbouring crates a beat later, for a rolling boom.
        const reached = this.phys.explode(body.x, body.y, e.radius, e.strength);
        for (const { body: o, f } of reached) {
          const od = o.data;
          if (!od || od.hp === undefined) continue;
          const dmg = e.damage * f * (od.kind === 'bear' ? BEAR_FRAGILITY : 1);
          if (od.kind === 'piece' && MATERIALS[od.mat].explode && od.hp - dmg <= 0) {
            if (!this.pending.some((q) => q.id === o.id)) this.pending.push({ id: o.id, at: this.time + 0.12 });
            od.hp = Math.min(od.hp, 0.01);
          } else this.damage(o, dmg);
        }
      }
    } else if (d.kind === 'bear') {
      this.bearsLeft--;
      this.lastPopAt = this.time;
      const pts = this.addPoints(BEAR_SCORE, body.x, body.y);
      this.emit('pop', { x: body.x, y: body.y, size: d.size, r: body.r, points: pts, how, left: this.bearsLeft });
    }
  }

  addPoints(base, x, y) {
    if (this.time - this.comboAt < COMBO_WINDOW) this.combo++;
    else this.combo = 1;
    this.comboAt = this.time;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = 1 + Math.min(1, (this.combo - 1) * 0.1);
    const pts = Math.round((base * mult) / 10) * 10;
    this.score += pts;
    if (this.combo >= 3) this.emit('combo', { n: this.combo, x, y });
    return pts;
  }

  cullOutside() {
    const { left, right } = this.bounds;
    const bodies = this.phys.bodies;
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (b.isStatic || b.removed) continue;
      if (b.y > KILL_Y && b.x > left && b.x < right) continue;
      const d = b.data;
      if (d.kind === 'bean') {
        this.phys.remove(b);
        this.active = this.active.filter((id) => id !== b.id);
        if (this.honey && this.honey.id === b.id) this.honey = null;
      } else if (d.kind === 'piece' || d.kind === 'bear') {
        this.emit('fell', { x: b.x, y: Math.max(b.y, KILL_Y), kind: d.kind });
        this.destroy(b, 'fell');
      }
    }
  }

  checkTurn() {
    const p = this.phys;
    const t = this.turnTime;
    if (this.honey || this.pending.length) return;
    // Keep the flying bean's turn alive while it's still moving.
    let beanMoving = false;
    for (const id of this.active) {
      const b = p.byId(id);
      if (b && !b.sleeping && Math.hypot(b.vx, b.vy) > 0.6) beanMoving = true;
    }
    const done = this.bearsLeft === 0;
    const calm = t > 0.8 && !beanMoving && p.calm(0.35);
    const timeout = t > (done ? 4 : 11) || (done && this.time - this.lastPopAt > 2.2);
    if (!(calm || timeout)) return;
    this.endTurn();
  }

  endTurn() {
    this.spent.push(...this.active);
    this.active = [];
    if (this.bearsLeft === 0) return this.finish(true);
    if (!this.queue.length) return this.finish(false);
    this.state = 'aim';
    this.emit('turn', { bean: this.queue[0] });
  }

  finish(won) {
    if (won) {
      this.bonus = this.queue.length * BEAN_BONUS;
      this.score += this.bonus;
      this.state = 'won';
      this.stars = starsFor(this.score, this.thresholds);
      this.emit('won', { stars: this.stars, score: this.score, bonus: this.bonus, spare: this.queue.length });
    } else {
      this.state = 'lost';
      this.stars = 0;
      this.emit('lost', { score: this.score, bearsLeft: this.bearsLeft });
    }
  }

  // Deep copy for the autoplayer's look-ahead.
  clone() {
    const g = Object.create(Game.prototype);
    Object.assign(g, this);
    g.phys = this.phys.clone();
    g.queue = this.queue.slice();
    g.events = [];
    g.active = this.active.slice();
    g.spent = this.spent.slice();
    g.honey = this.honey ? { ...this.honey } : null;
    g.pending = this.pending.map((e) => ({ ...e }));
    g.bounds = { ...this.bounds };
    return g;
  }
}

// Bigger blocks are sturdier than slivers of the same stuff.
function areaScale(pc) {
  const area = pc.w * pc.h;
  return Math.max(0.6, Math.min(1.8, 0.55 + area * 0.55));
}

export function starsFor(score, thresholds) {
  if (score >= thresholds[1]) return 3;
  if (score >= thresholds[0]) return 2;
  return 1;
}

// Launch velocity from a pull vector (pouch offset, world units).
export function pullToVelocity(dx, dy, maxPull, maxSpeed = MAX_SPEED) {
  const len = Math.hypot(dx, dy);
  const k = Math.min(1, len / maxPull);
  if (len < 1e-6) return { vx: 0, vy: 0 };
  return { vx: (-dx / len) * k * maxSpeed, vy: (-dy / len) * k * maxSpeed };
}

// Points along the launch arc, before anything is hit.
export function trajectory(vx, vy, { steps = 40, dt = 0.05, x0 = SLING.x, y0 = SLING.y, floor = -1 } = {}) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i * dt;
    const x = x0 + vx * t;
    const y = y0 + vy * t + 0.5 * GRAVITY * t * t;
    if (y < floor) break;
    pts.push([x, y]);
  }
  return pts;
}
