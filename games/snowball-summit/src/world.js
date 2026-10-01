// One run down a slope: ball physics, growth, things, gates, bridges, the
// avalanche, stars. DOM-free and deterministic: the same level and the same
// controls each step always give the same run.
import { buildTerrain } from './terrain.js';
import { ITEM_BY_ID, PICK_RATIO, BUMP_RATIO } from './items.js';

export const STEP = 1 / 120;
const REF = 20; // reference diameter (cm) the physics constants are tuned at
// The Snow Cloud never falls further behind than this many ball widths, so
// it stays looming at the left edge of the screen.
export const CHASE_GAP = 6.5;
// Things knocked off the ball by a bump.
export const BUMP_DROP = 2;
const MILESTONES = [25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000];

// Size-scaled physics: a bigger ball falls harder and rolls faster, but less
// than in proportion, so it feels heavier and grander without crawling.
export function physicsFor(D) {
  const s = D / REF;
  const G = 980 * Math.sqrt(s);
  const vmax = 250 * Math.pow(s, 0.75);
  return { G, vmax, vnat: vmax * 0.72, jumpH: D * 1.3 + 10 * Math.sqrt(s) };
}

export class World {
  constructor(level, { avalanche = true } = {}) {
    this.level = level;
    this.terrain = level.terrain || buildTerrain(level);
    this.endless = !!level.extend;
    this.chunk = 0;
    if (this.endless) while (this.terrain.length < 4000 * level.u / 20) this.extend();
    const D = level.start;
    const x = D * 2.5;
    this.ball = {
      x, y: this.terrain.groundY(x) - D / 2, vx: 0, vy: 0, D, r: D / 2, rot: 0,
      grounded: true, coyote: 0, jumpBuf: 0, air: 0, onDeck: null, squash: 0,
    };
    this.ball.contact = this.terrain.support(x, D / 2, this.ball.y, () => true);
    this.ball.y = this.ball.contact.y;
    this.startD = D;
    this.minD = D * 0.85;
    this.time = 0;
    this.status = 'play'; // play | finished | caught
    this.events = [];
    this.stuck = [];
    this.tumbling = [];
    this.dropped = []; // things knocked off the ball, drawn while they tumble
    this.thingsLost = 0;
    this.collected = 0;
    this.byType = {};
    this.bumps = 0;
    this.jumps = 0;
    this.airTime = 0;
    this.bestAir = 0;
    this.gatesSmashed = 0;
    this.gateBlocks = 0;
    this.still = 0;
    this.assisting = false;
    this.assists = 0;
    this.bridgesCrossed = 0;
    this.bridgesBroken = 0;
    this.itemLo = 0;
    this.milestone = MILESTONES.findIndex((m) => m > D);
    this.finishTime = null;
    const av = avalanche && level.avalanche;
    this.avalanche = av ? { x: x - D * (CHASE_GAP + 3), v: 0, delay: av.delay ?? 1.5, factor: av.factor, gap: 99 } : null;
    this.maxX = x;
  }

  get distance() { return Math.max(0, this.ball.x - this.startX0()); }
  startX0() { return this.startD * 2.5; }

  extend() {
    this.level.extend(this.terrain, this.chunk++);
  }

  // controls: { push: 0..1, brake: 0..1, jump: bool (pressed this step) }
  step(dt, controls = {}) {
    if (this.status === 'caught') return;
    const done = this.status === 'finished';
    let push = done ? 0 : Math.max(0, Math.min(1, controls.push || 0));
    const brake = done ? 0.6 : Math.max(0, Math.min(1, controls.brake || 0));
    // Nobody gets stuck: a ball that sits still (in a gully, behind a rise)
    // without braking gets a friendly nudge from a Snow Pal.
    const bb = this.ball;
    if (!done && !this.assisting && bb.grounded && !brake && Math.abs(bb.vx) < physicsFor(bb.D).vnat * 0.12) this.still += dt; else this.still = 0;
    if (this.still > 2.5) {
      if (!this.assisting) { this.assisting = true; this.assistFrom = bb.x; this.assists++; this.events.push({ type: 'assist', x: bb.x, y: bb.y }); }
    }
    // Keep pushing until the ball is clear and heading downhill again.
    if (this.assisting && (brake || (bb.x > this.assistFrom + bb.D * 3 && this.terrain.slopeAt(bb.x) > 0.02 && bb.vx > physicsFor(bb.D).vnat * 0.4))) this.assisting = false;
    if (this.assisting) push = Math.max(push, 1);
    if (!done) this.time += dt;
    const b = this.ball;
    const T = this.terrain;
    if (this.endless && b.x > T.length - 30 * b.D - 3000) this.extend();
    const { G, vmax, vnat, jumpH } = physicsFor(b.D);

    // Jumping, with a little buffer and coyote time so taps feel fair.
    if (controls.jump && !done) b.jumpBuf = 0.15;
    b.jumpBuf -= dt;
    b.coyote = b.grounded ? 0.1 : b.coyote - dt;
    if (b.jumpBuf > 0 && b.coyote > 0) {
      const jv = Math.sqrt(2 * G * jumpH);
      b.vy = Math.min(-jv, b.vy - jv * 0.5);
      b.grounded = false;
      b.coyote = 0;
      b.jumpBuf = 0;
      b.air = 0;
      b.squash = 0.35;
      this.jumps++;
      this.events.push({ type: 'jump', x: b.x, y: b.y + b.r });
    }

    const snow = T.snowAt(b.x);
    if (b.grounded) {
      const c = b.contact;
      const tx = -c.ny, ty = c.nx; // tangent pointing downhill-right
      let vt = b.vx * tx + b.vy * ty;
      let a = G * ty * 0.78;
      const fric = (snow === 3 ? 0.008 : snow === 2 ? 0.05 : 0.03) * G;
      const cap = push > 0 ? vmax * (0.75 + 0.25 * push) : vnat;
      if (push > 0 && vt < cap) a += push * 0.6 * G;
      if (vt > cap) a -= (vt - cap) * 7;
      if (vt < -vnat) a += (-vnat - vt) * 2.2;
      vt += a * dt;
      // Friction and brakes slow the ball but never push it backwards.
      const slow = (fric + brake * (snow === 3 ? 0.45 : 1.1) * G) * dt;
      if (Math.abs(vt) <= slow) vt = 0; else vt -= Math.sign(vt) * slow;
      b.vx = tx * vt;
      b.vy = ty * vt;
    } else {
      b.vy += G * dt;
      b.vx += (push * 0.18 - brake * 0.18) * G * dt;
      if (b.vx > vmax * 1.3) b.vx -= (b.vx - vmax * 1.3) * 2 * dt;
      b.air += dt;
    }

    const px = b.x;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = 0; }

    this.gates(b);
    this.contact(b, G);
    this.bridges(b);

    const moved = b.x - px;
    b.rot += moved / b.r;
    if (b.squash > 0) b.squash = Math.max(0, b.squash - dt * 2.5);

    // Rolling over fresh snow grows the ball.
    if (b.grounded && !b.onDeck && moved > 0) {
      const fresh = T.consume(px, b.x);
      if (fresh > 0) this.grow(b, this.level.grow * fresh);
    } else if (b.grounded && moved < 0) T.consume(b.x, px);

    this.things(b, dt);
    this.updateTumbling(dt);
    this.maxX = Math.max(this.maxX, b.x);

    if (!done && b.x >= T.finishX) {
      this.status = 'finished';
      this.finishTime = this.time;
      this.events.push({ type: 'finish', x: b.x, y: b.y });
    }
    if (this.avalanche && !done) this.chase(dt, vnat);
  }

  grow(b, dD) {
    b.D = Math.max(this.minD, b.D + dD);
    b.r = b.D / 2;
    while (this.milestone >= 0 && this.milestone < MILESTONES.length && b.D >= MILESTONES[this.milestone]) {
      this.events.push({ type: 'milestone', size: MILESTONES[this.milestone], x: b.x, y: b.y });
      this.milestone++;
    }
  }

  contact(b, G) {
    const T = this.terrain;
    const c = T.support(b.x, b.r, b.y, (br) => b.D <= br.max);
    const gap = c.y - b.y;
    const snap = Math.max(0.5, b.D * 0.05);
    const wasGrounded = b.grounded;
    if (gap <= 0 || (wasGrounded && gap < snap && b.vy > -50)) {
      b.y = c.y;
      const vn = b.vx * c.nx + b.vy * c.ny;
      if (vn < 0) {
        b.vx -= vn * c.nx;
        b.vy -= vn * c.ny;
        if (!wasGrounded) {
          const impact = -vn;
          const { vmax } = physicsFor(b.D);
          if (impact > vmax * 0.35) {
            b.squash = Math.min(0.5, impact / vmax * 0.4);
            this.events.push({ type: 'land', x: b.x, y: b.y + b.r, power: Math.min(1, impact / (vmax * 1.5)) });
          }
          if (b.air > 0.55) {
            this.airTime += b.air;
            this.bestAir = Math.max(this.bestAir, b.air);
            this.events.push({ type: 'air', time: b.air, x: b.x, y: b.y });
          }
        }
      }
      b.grounded = true;
      b.contact = c;
      b.onDeck = c.bridge;
      b.air = 0;
    } else {
      b.grounded = false;
      b.onDeck = null;
    }
    void G;
  }

  gates(b) {
    for (const g of this.terrain.gates) {
      if (g.smashed || b.x + b.r * 0.9 < g.x || b.x - b.r > g.x + 10) continue;
      if (b.D >= g.min - 0.01) {
        g.smashed = true;
        this.gatesSmashed++;
        b.vx *= 0.85;
        this.events.push({ type: 'gate.smash', x: g.x, y: g.y, min: g.min });
      } else {
        // Too small: bounce back, and the Snow Pal shovels snow on.
        g.blocks++;
        this.gateBlocks++;
        const gap = g.min - b.D;
        const fill = g.blocks >= 3 ? gap : gap * (g.blocks === 1 ? 0.4 : 0.6);
        this.grow(b, fill + 0.001);
        b.x = g.x - b.r * 0.9 - 1;
        const { vnat } = physicsFor(b.D);
        b.vx = -Math.max(vnat * 0.35, Math.abs(b.vx) * 0.4);
        b.vy = Math.min(b.vy, -vnat * 0.2);
        b.grounded = false;
        // The Snow Pal also shoos the Snow Cloud back a little.
        if (this.avalanche) this.avalanche.hold = 0.9;
        this.events.push({ type: 'gate.block', x: g.x, y: g.y, min: g.min, size: b.D, blocks: g.blocks });
      }
    }
  }

  bridges(b) {
    for (const br of this.terrain.bridges) {
      if (b.x < br.x0 - b.r || b.x > br.x1 + b.r) continue;
      if (!br.broken && b.D > br.max && b.x > br.x0 + b.r * 0.2) {
        const deckY = br.y0 + (br.y1 - br.y0) * Math.min(1, Math.max(0, (b.x - br.x0) / (br.x1 - br.x0)));
        if (b.y + b.r >= deckY - b.r * 0.4) {
          br.broken = true;
          this.bridgesBroken++;
          this.events.push({ type: 'bridge.break', x: b.x, y: deckY, max: br.max });
        }
      }
      if (!br.broken && !br.crossed && b.x > br.x1 && b.D <= br.max) {
        br.crossed = true;
        this.bridgesCrossed++;
        this.events.push({ type: 'bridge.cross', x: br.x1, y: br.y1 });
      }
    }
  }

  things(b) {
    const items = this.terrain.items;
    while (this.itemLo < items.length && items[this.itemLo].x + items[this.itemLo].size * 2 < b.x - b.D * 3) this.itemLo++;
    for (let i = this.itemLo; i < items.length; i++) {
      const it = items[i];
      if (it.state !== 'idle') continue; // tumbling things move, so check before the sorted break
      const hw = it.size * it.w * 0.5;
      if (it.x - hw > b.x + b.r) break;
      // Closest point on the thing's box to the ball centre.
      const pickable = it.size <= b.D * PICK_RATIO;
      const shrink = pickable ? 0.8 : 0.7;
      const left = it.x - hw * shrink, right = it.x + hw * shrink;
      const top = it.y - it.size * (pickable ? 0.85 : 0.8), bottom = it.y;
      const cx = Math.max(left, Math.min(b.x, right));
      const cy = Math.max(top, Math.min(b.y, bottom));
      const dx = cx - b.x, dy = cy - b.y;
      if (dx * dx + dy * dy > b.r * b.r) continue;
      if (pickable) this.pick(b, it);
      else if (it.size <= b.D * BUMP_RATIO) this.bump(b, it);
    }
  }

  pick(b, it) {
    it.state = 'picked';
    const def = ITEM_BY_ID[it.type];
    const cy = it.y - it.size / 2;
    const ang = Math.atan2(cy - b.y, it.x - b.x) - b.rot;
    this.stuck.push({ type: it.type, ang, size: it.size, w: it.w, flip: it.flip, t: this.time, D: b.D });
    if (this.stuck.length > 60) this.stuck.shift();
    this.collected++;
    this.byType[it.type] = (this.byType[it.type] || 0) + 1;
    const before = b.D;
    const area = 0.32 * it.size * it.size * Math.min(1.6, it.w);
    this.grow(b, Math.sqrt(b.D * b.D + area) - b.D);
    this.events.push({ type: 'pick', item: it.type, size: it.size, x: it.x, y: cy, waves: !!def.waves, ratio: it.size / before, air: !!it.air });
  }

  bump(b, it) {
    it.state = 'tumble';
    it.t = 0;
    this.tumbling.push(it);
    const { vnat, G } = physicsFor(b.D);
    it.vx = Math.max(b.vx, vnat * 0.4) * 1.1 + vnat * 0.3;
    it.vy = -Math.sqrt(2 * G * Math.max(it.size, b.D)) * 0.9;
    it.spin = 4 + it.size / b.D;
    this.bumps++;
    // Bonk! A few of the newest things fall off the ball and tumble away.
    const drop = Math.min(BUMP_DROP, this.stuck.length);
    let area = 0;
    for (let k = 0; k < drop; k++) {
      const st = this.stuck.pop();
      area += 0.32 * st.size * st.size * Math.min(1.6, st.w);
      this.collected--;
      this.byType[st.type]--;
      if (!this.byType[st.type]) delete this.byType[st.type];
      const a = st.ang + b.rot;
      const fall = { id: -1, type: st.type, x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r + st.size / 2, size: st.size, w: st.w, state: 'tumble', t: 0, vx: -vnat * (0.2 + 0.2 * k), vy: -Math.sqrt(2 * G * b.D) * (0.5 + 0.2 * k), spin: 6, rot: 0, flip: false };
      this.tumbling.push(fall);
      this.dropped.push(fall);
    }
    this.thingsLost += drop;
    const before = b.D;
    const shrunk = Math.sqrt(Math.max(0, b.D * b.D - area)) * 0.96;
    this.grow(b, shrunk - b.D);
    const lost = before - b.D;
    b.vx *= 0.55;
    if (b.grounded) b.vy *= 0.55;
    b.squash = 0.45;
    this.events.push({ type: 'bump', item: it.type, x: it.x, y: it.y - it.size / 2, lost, drop });
  }

  updateTumbling(dt) {
    for (let i = this.tumbling.length - 1; i >= 0; i--) {
      const it = this.tumbling[i];
      it.t += dt;
      const G = physicsFor(Math.max(it.size, this.ball.D)).G;
      it.vy += G * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.spin * dt;
      if (it.t > 2.5) {
        it.state = 'gone';
        this.tumbling.splice(i, 1);
        const d = this.dropped.indexOf(it);
        if (d >= 0) this.dropped.splice(d, 1);
      }
    }
  }

  chase(dt, vnat) {
    const a = this.avalanche;
    const b = this.ball;
    if (a.delay > 0) { a.delay -= dt; a.x = Math.max(a.x, b.x - b.D * (CHASE_GAP + 3)); a.gap = (b.x - b.r - a.x) / b.D; return; }
    const grade = this.terrain.slopeAt(a.x);
    const factor = this.level.avalancheFactor ? this.level.avalancheFactor(b.x) : a.factor;
    a.t = (a.t || 0) + dt;
    if (a.hold > 0) { a.hold -= dt; a.gap = (b.x - b.r - a.x) / b.D; return; }
    const ramp = Math.min(1, 0.35 + a.t / 8);
    const v = factor * vnat * ramp * (grade < 0 ? 0.65 : 1);
    a.v = v;
    a.x += v * dt;
    a.x = Math.max(a.x, b.x - b.D * CHASE_GAP);
    a.gap = (b.x - b.r - a.x) / b.D;
    if (a.x >= b.x - b.r * 0.4) {
      this.status = 'caught';
      this.events.push({ type: 'caught', x: b.x, y: b.y });
    }
  }

  // Stars earned so far: size, things collected and time.
  starChecks() {
    const g = this.level.goals;
    if (!g) return [false, false, false];
    const t = this.finishTime ?? this.time;
    return [this.ball.D >= g.size, this.collected >= g.items, this.status === 'finished' && t <= g.time];
  }

  stars() { return this.status === 'finished' ? this.starChecks().filter(Boolean).length : 0; }

  // Fraction of the slope covered (0-1); endless reports distance instead.
  progress() {
    const T = this.terrain;
    if (!Number.isFinite(T.finishX)) return 0;
    return Math.max(0, Math.min(1, (this.ball.x - this.startX0()) / (T.finishX - this.startX0())));
  }
}
