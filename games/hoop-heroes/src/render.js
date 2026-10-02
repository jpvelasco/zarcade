// Canvas renderer: a small perspective camera behind the shooter, the court,
// the hoop with a springy net, balls, props, Ace, particles and popups.
// Reads game state; never changes it. The net is the renderer's own
// cosmetic simulation.
import { BALL_R, RIM_R, BOARD, NET_DEPTH, TRAMP_Y, hoopState, blockerState } from './physics.js';
import { READY_GAP, RELEASE_Y } from './round.js';
import {
  makeCanvas, ballSprites, glowSprite, shadowSprite, flameSprite, heroSprite, HERO, blockerSprite,
  scenery, SCENE_W, SCENE_H, SCENE_HORIZON,
} from './sprites.js';
import { BALLS } from './cosmetics.js';

const NEAR = 0.25;
const CAM_BACK = 1.55;
const CAM_H = 2.35;
const LOOK_Y = 2.75;
const WALL_BACK = 6, WALL_SIDE = 40, WALL_FRONT = -30;
const BASELINE = 1.6;
const NET_COLS = 12, NET_ROWS = 5;
const MAX_PARTICLES = 180;
const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const RAINBOW = BALLS.find((b) => b.id === 'rainbow');

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.dpr = 1;
    this.W = 0; this.H = 0;
    this.f = 600; this.cx = 0; this.cy = 0;
    this.C = { x: 0, y: CAM_H, z: -6 };
    this.F = { x: 0, y: 0, z: 1 }; this.R = { x: 1, y: 0, z: 0 }; this.U = { x: 0, y: 1, z: 0 };
    this.yaw = 0;
    this.camS = null; // eased shooter spot
    this.camFrom = null; this.camTo = null; this.camT = 1;
    this.p = { x: 0, y: 0, s: 1, z: 1, ok: true };
    this.q = { x: 0, y: 0, s: 1, z: 1, ok: true };
    this.h = {};
    this.time = 0;
    this.shake = 0;
    this.particles = [];
    this.popups = [];
    this.flash = 0;
    this.fireBanner = 0;
    this.countText = '';
    this.shotAnim = 0; // follow-through timer
    this.bounceTramp = 0;
    this.blockerHit = 0;
    this.trails = new Map();
    this.shadow = shadowSprite();
    this.flame = flameSprite();
    this.sparkGlow = glowSprite('rgba(255,200,80,1)', 64, 0.35);
    this.goldGlow = glowSprite('rgba(255,236,140,0.9)', 128, 0.4);
    this.blockers = { bear: blockerSprite('bear'), panda: blockerSprite('panda') };
    this.net = null;
    this.setCourt({ id: 'park', scenery: 'park', sky: ['#5cc8ff', '#a8e6ff', '#e8fbff'], ground: '#5fbf4a', floor: '#3f4a5c', floor2: '#4a566b', paint: '#e2554a', line: '#fff', board: '#fff', boardEdge: '#e2554a', pole: '#2f6fd6', accent: '#ffcf3a' });
    this.setBall(BALLS[0]);
    this.setJersey({ body: '#ffcf3a', trim: '#2f6fd6', number: '#2f6fd6' });
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = innerWidth, H = innerHeight;
    this.dpr = dpr;
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    const portrait = H > W;
    this.f = portrait ? Math.min(W * 1.6, H * 0.95) : Math.min(W * 1.1, H * 1.02);
    this.cx = W / 2;
    this.cy = H * (portrait ? 0.42 : 0.37);
    this.skyGrad = null;
  }

  setCourt(court) {
    if (this.court?.id === court.id) return;
    this.court = court;
    this.scene = scenery(court);
    this.skyGrad = null;
  }

  setBall(skin) { this.skin = skin; this.ballArt = ballSprites(skin); this.moneyArt = ballSprites(RAINBOW); }
  setJersey(j) { if (this.jersey === j) return; this.jersey = j; this.hero = heroSprite(j); }

  // ------------------------------------------------------------ camera

  placeCamera(sx, sz, hx, hz) {
    const dx = hx - sx, dz = hz - sz, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const C = this.C;
    C.x = sx - ux * CAM_BACK; C.y = CAM_H; C.z = sz - uz * CAM_BACK;
    let fx = hx - C.x, fy = LOOK_Y - C.y, fz = hz - C.z;
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl; fy /= fl; fz /= fl;
    this.F.x = fx; this.F.y = fy; this.F.z = fz;
    // right = up × forward
    let rx = fz, rz = -fx;
    const rl = Math.hypot(rx, rz);
    rx /= rl; rz /= rl;
    this.R.x = rx; this.R.z = rz;
    // up' = forward × right
    this.U.x = fy * rz; this.U.y = fz * rx - fx * rz; this.U.z = -fy * rx;
    this.yaw = Math.atan2(fx, fz);
  }

  proj(x, y, z, out = this.p) {
    const C = this.C, F = this.F, R = this.R, U = this.U;
    const dx = x - C.x, dy = y - C.y, dz = z - C.z;
    const cz = dx * F.x + dy * F.y + dz * F.z;
    out.z = cz;
    if (cz < NEAR) { out.ok = false; return out; }
    const cx = dx * R.x + dz * R.z;
    const cy = dx * U.x + dy * U.y + dz * U.z;
    out.ok = true;
    out.s = this.f / cz;
    out.x = this.cx + cx * out.s;
    out.y = this.cy - cy * out.s;
    return out;
  }

  depth(x, y, z) {
    const C = this.C, F = this.F;
    return (x - C.x) * F.x + (y - C.y) * F.y + (z - C.z) * F.z;
  }

  // Screen position of a world point (for main's aim mapping).
  screenOf(pt) {
    const p = this.proj(pt.x, pt.y, pt.z, {});
    return { x: p.x, y: p.y, s: p.s, ok: p.ok };
  }

  // ------------------------------------------------------------ events

  handleEvents(events, round) {
    for (const e of events) {
      switch (e.type) {
        case 'shoot': this.shotAnim = 0.35; break;
        case 'score': {
          const h = round.hoopNow({});
          this.proj(h.x, h.y - 0.2, h.z, this.q);
          const label = e.money ? 'MONEY!' : e.bank ? 'BANK!' : e.swish ? 'SWISH!' : 'NICE!';
          const color = e.fire ? '#ff7a2f' : e.money ? '#ffd23f' : e.swish ? '#7cf0ff' : '#ffffff';
          this.popup(`+${e.points}`, this.q.x, this.q.y - 30, color, 1.3);
          this.popup(e.buzzer ? 'BUZZER BEATER!' : label, this.q.x, this.q.y + 10, color, 1);
          this.confetti(this.q.x, this.q.y + 20, e.swish ? 26 : 14, e.money);
          if (e.swish) this.flash = 0.25;
          this.kickNet(e.swish ? 1 : 0.6);
          break;
        }
        case 'rim': if (e.speed > 1.5 && !this.reduced) this.shake = Math.min(0.25, this.shake + e.speed * 0.025); break;
        case 'board': if (!this.reduced) this.shake = Math.min(0.2, this.shake + 0.06); break;
        case 'fire': this.fireBanner = 2.2; this.popupCenter('ON FIRE!', '#ff7a2f'); break;
        case 'fireout': this.popupCenter('Fire’s out', '#ffd0a8', 0.8); break;
        case 'tramp': this.bounceTramp = 0.35; break;
        case 'blocker': this.blockerHit = 0.4; this.popupBall(e.ball, 'BLOCKED!', '#ffb0b0'); break;
        case 'invalid': this.popupBall(e.ball, e.need === 'bank' ? 'Bank it!' : 'Use the trampoline!', '#ffe0a0'); break;
        case 'hurry': this.popupCenter('5 seconds!', '#ffe14d', 0.8); break;
        case 'go': this.popupCenter('GO!', '#7cff9b', 1.2); break;
        case 'buzzer': this.popupCenter('BUZZER!', '#ffffff', 1); break;
        default: break;
      }
    }
  }

  popup(text, x, y, color, size = 1) {
    if (this.popups.length > 10) this.popups.shift();
    this.popups.push({ text, x, y, color, size, t: 0, life: 1.1, center: false });
  }
  popupCenter(text, color, size = 1.4) {
    if (this.popups.length > 10) this.popups.shift();
    this.popups.push({ text, x: this.W / 2, y: this.H * 0.22, color, size, t: 0, life: 1.4, center: true });
  }
  popupBall(ball, text, color) {
    this.proj(ball.p.x, ball.p.y, ball.p.z, this.q);
    if (this.q.ok) this.popup(text, this.q.x, this.q.y - 20, color, 0.9);
  }

  confetti(x, y, n, gold = false) {
    if (this.reduced) n = Math.ceil(n / 3);
    const cols = gold ? ['#ffd23f', '#fff1a8', '#ffb03a'] : ['#ff4f6d', '#ffd23f', '#3fb6ff', '#4fd16b', '#b98bff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const a = Math.random() * TAU, sp = 120 + Math.random() * 260;
      this.particles.push({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 220, life: 1 + Math.random() * 0.6, t: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, color: cols[i % cols.length], size: 4 + Math.random() * 5 });
    }
  }

  spark(ball) {
    if (this.particles.length >= MAX_PARTICLES || this.reduced) return;
    this.particles.push({ kind: 'spark', wx: ball.p.x + (Math.random() - 0.5) * 0.1, wy: ball.p.y + (Math.random() - 0.5) * 0.1, wz: ball.p.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.6, vz: 0, life: 0.45, t: 0 });
  }

  kickNet(k) {
    const n = this.net;
    if (!n) return;
    for (let i = 0; i < NET_COLS; i++) for (let r = 2; r < NET_ROWS; r++) {
      const j = (r * NET_COLS + i) * 3;
      n.prev[j + 1] += 0.03 * k * (r / NET_ROWS);
    }
  }

  // ------------------------------------------------------------ net sim

  buildNet(h) {
    const N = NET_COLS * NET_ROWS;
    const pos = new Float32Array(N * 3), prev = new Float32Array(N * 3), rest = new Float32Array(N * 3);
    for (let r = 0; r < NET_ROWS; r++) {
      const rad = RIM_R * (1 - 0.4 * (r / (NET_ROWS - 1)));
      const y = -NET_DEPTH * (r / (NET_ROWS - 1));
      for (let i = 0; i < NET_COLS; i++) {
        const a = ((i + (r % 2) * 0.5) / NET_COLS) * TAU;
        const j = (r * NET_COLS + i) * 3;
        rest[j] = Math.cos(a) * rad; rest[j + 1] = y; rest[j + 2] = Math.sin(a) * rad;
        pos[j] = prev[j] = h.x + rest[j];
        pos[j + 1] = prev[j + 1] = h.y + rest[j + 1];
        pos[j + 2] = prev[j + 2] = h.z + rest[j + 2];
      }
    }
    this.net = { pos, prev, rest, vLen: NET_DEPTH / (NET_ROWS - 1) * 1.05 };
  }

  updateNet(dt, round) {
    const h = round.hoopNow(this.h);
    if (!this.net) this.buildNet(h);
    const { pos, prev, rest } = this.net;
    const steps = 2, sdt = Math.min(dt, 0.05) / steps;
    for (let s = 0; s < steps; s++) {
      for (let r = 0; r < NET_ROWS; r++) {
        for (let i = 0; i < NET_COLS; i++) {
          const j = (r * NET_COLS + i) * 3;
          if (r === 0) {
            pos[j] = prev[j] = h.x + rest[j]; pos[j + 1] = prev[j + 1] = h.y; pos[j + 2] = prev[j + 2] = h.z + rest[j + 2];
            continue;
          }
          for (let k = 0; k < 3; k++) {
            const v = (pos[j + k] - prev[j + k]) * 0.94;
            prev[j + k] = pos[j + k];
            // Spring back toward the rest shape (relative to the hoop).
            const target = (k === 0 ? h.x : k === 1 ? h.y : h.z) + rest[j + k];
            pos[j + k] += v + (target - pos[j + k]) * 0.12 + (k === 1 ? -2 * sdt * sdt : 0);
          }
        }
      }
      // Balls push the mesh.
      for (const b of round.balls) {
        if (b.dead) continue;
        const bx = b.p.x - h.x, bz = b.p.z - h.z;
        if (bx * bx + bz * bz > 0.5 || b.p.y > h.y + 0.2 || b.p.y < h.y - NET_DEPTH - 0.3) continue;
        const rr = BALL_R + 0.012;
        for (let n = NET_COLS; n < NET_COLS * NET_ROWS; n++) {
          const j = n * 3;
          const dx = pos[j] - b.p.x, dy = pos[j + 1] - b.p.y, dz = pos[j + 2] - b.p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) {
            const d = Math.sqrt(d2), k = (rr - d) / d;
            pos[j] += dx * k; pos[j + 1] += dy * k * 0.5 + (b.v.y < 0 ? -0.004 : 0); pos[j + 2] += dz * k;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ update

  update(dt, round) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.2);
    if (this.flash > 0) this.flash -= dt;
    if (this.fireBanner > 0) this.fireBanner -= dt;
    if (this.shotAnim > 0) this.shotAnim -= dt;
    if (this.bounceTramp > 0) this.bounceTramp -= dt;
    if (this.blockerHit > 0) this.blockerHit -= dt;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      if (p.kind === 'confetti') { p.vy += 520 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
      else { p.wx += p.vx * dt; p.wy += p.vy * dt; }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t >= p.life) this.popups.splice(i, 1);
    }
    if (!round) return;
    // Camera eases between spots.
    const s = round.shooterPos();
    if (!this.camS) { this.camS = { x: s.x, z: s.z }; this.camFrom = { ...this.camS }; this.camTo = { ...this.camS }; this.camT = 1; }
    if (Math.abs(this.camTo.x - s.x) > 1e-6 || Math.abs(this.camTo.z - s.z) > 1e-6) {
      this.camFrom = { x: this.camS.x, z: this.camS.z };
      this.camTo = { x: s.x, z: s.z };
      this.camT = 0;
    }
    if (this.camT < 1) {
      this.camT = Math.min(1, this.camT + dt / 0.8);
      const k = ease(this.camT);
      // Swing around the hoop on an arc rather than cutting across.
      const a0 = Math.atan2(this.camFrom.x, -this.camFrom.z), a1 = Math.atan2(this.camTo.x, -this.camTo.z);
      const d0 = Math.hypot(this.camFrom.x, this.camFrom.z), d1 = Math.hypot(this.camTo.x, this.camTo.z);
      const a = a0 + (a1 - a0) * k, d = d0 + (d1 - d0) * k;
      this.camS.x = Math.sin(a) * d; this.camS.z = -Math.cos(a) * d;
    }
    // Fire trails.
    for (const b of round.balls) if (b.fire && !b.dead && Math.random() < 0.7) this.spark(b);
    this.updateNet(dt, round);
  }

  resetCamera() { this.camS = null; this.net = null; }

  // ------------------------------------------------------------ draw

  draw(round, ui = {}) {
    const g = this.g, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!round) { g.fillStyle = '#111'; g.fillRect(0, 0, this.W, this.H); return; }
    const hx0 = round.hoop.x, hz0 = round.hoop.z;
    const cs = this.camS || round.shooterPos();
    this.placeCamera(cs.x, cs.z, hx0, hz0);
    if (this.shake > 0) {
      const k = this.shake * 0.06;
      this.C.x += (Math.random() - 0.5) * k; this.C.y += (Math.random() - 0.5) * k;
    }
    this.drawSky();
    this.drawCourt(round);
    this.drawProps(round, ui);
    this.drawHero(round, ui);
    this.drawParticles();
    this.drawOverlay(round, ui);
    if (this.flash > 0 && !this.reduced) {
      g.fillStyle = `rgba(255,255,255,${(this.flash * 0.5).toFixed(3)})`;
      g.fillRect(0, 0, this.W, this.H);
    }
  }

  drawSky() {
    const g = this.g, c = this.court;
    // Horizon: a far point straight ahead at camera height... on the ground.
    const fx = this.F.x, fz = this.F.z, fl = Math.hypot(fx, fz) || 1;
    this.proj(this.C.x + (fx / fl) * 400, 0, this.C.z + (fz / fl) * 400, this.q);
    const hy = this.q.ok ? this.q.y : this.H * 0.4;
    if (!this.skyGrad || this.skyFor !== Math.round(hy)) {
      const gr = g.createLinearGradient(0, hy - this.H * 0.6, 0, hy);
      gr.addColorStop(0, c.sky[0]); gr.addColorStop(0.6, c.sky[1]); gr.addColorStop(1, c.sky[2]);
      this.skyGrad = gr;
      this.skyFor = Math.round(hy);
    }
    g.fillStyle = this.skyGrad;
    g.fillRect(0, 0, this.W, hy + 2);
    // Distant scenery strip on the horizon, scrolled with the camera's yaw.
    const scale = Math.max(0.5, Math.min(1.4, this.f / 820));
    const sw = SCENE_W * scale, sh = SCENE_H * scale;
    let off = (-this.yaw * this.f * 0.6) % sw;
    if (off > 0) off -= sw;
    const top = hy - SCENE_HORIZON * scale + 2;
    g.fillStyle = c.far || c.ground;
    g.fillRect(0, hy, this.W, this.H);
    for (let x = off - sw; x < this.W; x += sw) if (x + sw > 0) g.drawImage(this.scene, x, top, sw, sh);
    this.horizon = hy;
  }

  // Fill a world polygon of [x, y, z] points, clipped at the near plane.
  poly3(pts, fill, alpha = 1) {
    const g = this.g;
    const C = this.C, F = this.F;
    const n = pts.length;
    let started = false;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const da = (a[0] - C.x) * F.x + (a[1] - C.y) * F.y + (a[2] - C.z) * F.z;
      const db = (b[0] - C.x) * F.x + (b[1] - C.y) * F.y + (b[2] - C.z) * F.z;
      if (da >= NEAR) {
        this.proj(a[0], a[1], a[2]);
        if (!started) { g.moveTo(this.p.x, this.p.y); started = true; } else g.lineTo(this.p.x, this.p.y);
      }
      if ((da >= NEAR) !== (db >= NEAR)) {
        const t = (NEAR + 0.001 - da) / (db - da);
        this.proj(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        if (!started) { g.moveTo(this.p.x, this.p.y); started = true; } else g.lineTo(this.p.x, this.p.y);
      }
    }
    if (!started) return;
    g.closePath();
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.fill();
    g.globalAlpha = 1;
  }

  // A world line segment, clipped at the near plane, width in metres.
  seg3(x0, y0, z0, x1, y1, z1, w) {
    const C = this.C, F = this.F;
    let da = (x0 - C.x) * F.x + (y0 - C.y) * F.y + (z0 - C.z) * F.z;
    let db = (x1 - C.x) * F.x + (y1 - C.y) * F.y + (z1 - C.z) * F.z;
    if (da < NEAR && db < NEAR) return;
    if (da < NEAR) { const t = (NEAR + 0.001 - da) / (db - da); x0 += (x1 - x0) * t; y0 += (y1 - y0) * t; z0 += (z1 - z0) * t; }
    else if (db < NEAR) { const t = (NEAR + 0.001 - db) / (da - db); x1 += (x0 - x1) * t; y1 += (y0 - y1) * t; z1 += (z0 - z1) * t; }
    this.proj(x0, y0, z0, this.p); this.proj(x1, y1, z1, this.q);
    const g = this.g;
    g.lineWidth = Math.max(1, w * (this.p.s + this.q.s) * 0.5);
    g.beginPath(); g.moveTo(this.p.x, this.p.y); g.lineTo(this.q.x, this.q.y); g.stroke();
  }

  // The wall round the court (fence, railing, parapet...), a U open toward
  // the camera side.
  drawWalls() {
    const st = WALL_STYLES[this.court.scenery] || WALL_STYLES.park;
    const g = this.g;
    const walls = [
      [-WALL_SIDE, WALL_BACK, WALL_SIDE, WALL_BACK],
      [-WALL_SIDE, WALL_FRONT, -WALL_SIDE, WALL_BACK],
      [WALL_SIDE, WALL_BACK, WALL_SIDE, WALL_FRONT],
    ];
    const H = st.h;
    for (const [x0, z0, x1, z1] of walls) {
      this.poly3([[x0, 0, z0], [x1, 0, z1], [x1, H, z1], [x0, H, z0]], st.fill, st.alpha);
      const len = Math.hypot(x1 - x0, z1 - z0);
      g.lineCap = 'butt';
      if (st.hatch) {
        g.strokeStyle = st.hatch;
        const n = Math.round(len / 0.45);
        for (let i = -6; i <= n; i++) {
          const a = i / n, b = (i + 6) / n;
          const ca = Math.max(0, Math.min(1, a)), cb = Math.max(0, Math.min(1, b));
          if (cb <= ca) continue;
          // Diagonals both ways across the full height.
          const ya = ((ca - a) / (b - a)) * H, yb = ((cb - a) / (b - a)) * H;
          this.seg3(x0 + (x1 - x0) * ca, ya, z0 + (z1 - z0) * ca, x0 + (x1 - x0) * cb, yb, z0 + (z1 - z0) * cb, 0.03);
          this.seg3(x0 + (x1 - x0) * ca, H - ya, z0 + (z1 - z0) * ca, x0 + (x1 - x0) * cb, H - yb, z0 + (z1 - z0) * cb, 0.03);
        }
      }
      if (st.lines) {
        // Rails in short pieces so their width follows depth.
        const n = Math.max(1, Math.round(len / 1.5));
        for (const [y, color, w] of st.lines) {
          g.strokeStyle = color;
          for (let i = 0; i < n; i++) {
            const a = i / n, b = (i + 1) / n;
            this.seg3(x0 + (x1 - x0) * a, y * H, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, y * H, z0 + (z1 - z0) * b, w);
          }
        }
      }
      if (st.posts) {
        g.strokeStyle = st.posts;
        const n = Math.max(1, Math.round(len / st.postStep));
        for (let i = 0; i <= n; i++) {
          const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
          this.seg3(x, 0, z, x, H + (st.postTop || 0), z, st.postW || 0.08);
        }
      }
    }
  }

  // Fill a floor polygon given as [x, z] pairs (y = 0), clipped at the near plane.
  floorPoly(pts, fill) {
    const g = this.g;
    const C = this.C, F = this.F;
    const n = pts.length;
    let started = false;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const da = (a[0] - C.x) * F.x + (0 - C.y) * F.y + (a[1] - C.z) * F.z;
      const db = (b[0] - C.x) * F.x + (0 - C.y) * F.y + (b[1] - C.z) * F.z;
      if (da >= NEAR) {
        this.proj(a[0], 0, a[1]);
        if (!started) { g.moveTo(this.p.x, this.p.y); started = true; } else g.lineTo(this.p.x, this.p.y);
      }
      if ((da >= NEAR) !== (db >= NEAR)) {
        const t = (NEAR + 0.001 - da) / (db - da);
        this.proj(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t);
        if (!started) { g.moveTo(this.p.x, this.p.y); started = true; } else g.lineTo(this.p.x, this.p.y);
      }
    }
    if (!started) return;
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  // Stroke a floor polyline in chunks so the width follows depth.
  floorLine(pts, color, width = 0.07) {
    const g = this.g;
    g.strokeStyle = color;
    g.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      this.proj(a[0], 0, a[1], this.p);
      this.proj(b[0], 0, b[1], this.q);
      if (!this.p.ok || !this.q.ok) continue;
      g.lineWidth = Math.max(1, width * (this.p.s + this.q.s) * 0.5);
      g.beginPath(); g.moveTo(this.p.x, this.p.y); g.lineTo(this.q.x, this.q.y); g.stroke();
    }
  }

  courtGeometry() {
    if (this.geom) return this.geom;
    const arc = (cx, cz, r, a0, a1, n = 24) => {
      const out = [];
      for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.sin(a) * r, cz - Math.cos(a) * r]); }
      return out;
    };
    // The arcade three-point arc: radius R3 round the rim, straight corner
    // lines down to the baseline.
    const R3 = 5.25;
    const cornerZ = BASELINE - 1.4;
    const xCorner = Math.sqrt(R3 * R3 - cornerZ * cornerZ);
    const a3 = Math.atan2(xCorner, -cornerZ);
    const three = [[-xCorner, BASELINE], ...arc(0, 0, R3, -a3, a3, 40), [xCorner, BASELINE]];
    this.geom = {
      ground: [[-WALL_SIDE, WALL_FRONT], [WALL_SIDE, WALL_FRONT], [WALL_SIDE, WALL_BACK], [-WALL_SIDE, WALL_BACK]],
      apron: [[-8.3, -12.5], [8.3, -12.5], [8.3, BASELINE + 1.2], [-8.3, BASELINE + 1.2]],
      court: [[-7.5, -11.6], [7.5, -11.6], [7.5, BASELINE], [-7.5, BASELINE]],
      three: three,
      key: [[-2.45, BASELINE], [-2.45, -4.2], [2.45, -4.2], [2.45, BASELINE]],
      ft: arc(0, -4.2, 1.8, -Math.PI / 2, Math.PI / 2, 20),
      outline: [[-7.5, BASELINE], [-7.5, -11.6], [7.5, -11.6], [7.5, BASELINE], [-7.5, BASELINE]],
      center: arc(0, -11.6, 1.8, -Math.PI / 2, Math.PI / 2, 16).map(([x, z]) => [x, -11.6 - (z + 11.6)]),
    };
    return this.geom;
  }

  drawCourt(round) {
    const c = this.court, geo = this.courtGeometry();
    this.floorPoly(geo.ground, c.ground);
    this.drawWalls();
    this.floorPoly(geo.apron, c.ground2 || c.ground);
    this.floorPoly(geo.court, c.floor);
    this.floorPoly(geo.three, c.floor2);
    this.floorPoly(geo.key, c.paint);
    const lc = c.line;
    this.floorLine(geo.outline, lc);
    this.floorLine(geo.three, lc);
    this.floorLine([geo.key[0], geo.key[1], geo.key[2], geo.key[3]], lc);
    this.floorLine(geo.ft, lc);
    this.floorLine(geo.center, lc);
    // Spot markers for the current shooter.
    for (let i = 0; i < round.rules.spots.length; i++) {
      const sp = round.rules.spots[i];
      const a = (sp.a * Math.PI) / 180;
      const x = hoopBaseX(round) + sp.d * Math.sin(a), z = round.hoop.z - sp.d * Math.cos(a);
      this.proj(x, 0, z, this.p);
      if (!this.p.ok) continue;
      const g = this.g;
      g.fillStyle = i === round.spotIndex ? c.accent : 'rgba(255,255,255,0.35)';
      g.beginPath(); g.ellipse(this.p.x, this.p.y, 0.32 * this.p.s, 0.32 * this.p.s * this.flatten(this.p.z), 0, 0, TAU); g.fill();
    }
  }

  flatten(depth) { return Math.max(0.12, Math.min(0.7, (CAM_H) / Math.max(0.5, depth))); }

  drawShadow(x, z, y, r) {
    this.proj(x, 0, z, this.p);
    if (!this.p.ok) return;
    const k = Math.max(0.25, 1 - y / 6);
    const w = r * 2.6 * this.p.s * k, h = w * this.flatten(this.p.z) * 1.1;
    this.g.globalAlpha = 0.25 + 0.55 * k;
    this.g.drawImage(this.shadow, this.p.x - w / 2, this.p.y - h / 2, w, h);
    this.g.globalAlpha = 1;
  }

  // Everything standing on the court, sorted far to near.
  drawProps(round, ui) {
    const props = round.props();
    const h = round.hoopNow(this.h);
    const items = this.items || (this.items = []);
    items.length = 0;
    // Floor shadows first.
    for (const b of round.balls) if (!b.dead || b.made) this.drawShadow(b.p.x, b.p.z, b.p.y, BALL_R);
    this.drawShadow(h.x, BASELINE + 0.7, 0, 0.5);
    if (props.tramp) this.drawTramp(props.tramp);
    const hd = this.depth(h.x, h.y, h.z);
    items.push({ kind: 'hoop', d: hd });
    if (props.blockers) for (const b of props.blockers) {
      const s = blockerState(b, round.time, {});
      items.push({ kind: 'blocker', d: this.depth(s.x, 1, s.z - s.hz), b, s });
    }
    for (const b of round.balls) {
      if (b.dead && !b.made) continue;
      if (this.ballInHoopGroup(b, h, hd)) continue;
      items.push({ kind: 'ball', d: this.depth(b.p.x, b.p.y, b.p.z), b });
    }
    items.sort((a, z) => z.d - a.d);
    let hoopDrawn = false, covered = false;
    for (const it of items) {
      if (it.kind === 'hoop') { this.drawHoop(round, h, hd, ui); hoopDrawn = true; }
      else if (it.kind === 'blocker') { this.drawBlocker(it.b, it.s); covered ||= hoopDrawn; }
      else this.drawBall(it.b);
    }
    // A bear standing in front of the hoop must not hide the target.
    if (covered) this.drawHoopGhost(h, hd);
  }

  drawHoopGhost(h, hd) {
    const g = this.g, c = this.court, bz = h.z + BOARD.offset;
    g.globalAlpha = 0.85;
    g.lineJoin = 'round';
    this.quadStroke(h.x - BOARD.halfW, h.y - BOARD.below, h.x + BOARD.halfW, h.y + BOARD.above, bz, c.boardEdge, 0.05);
    this.quadStroke(h.x - 0.3, h.y + 0.02, h.x + 0.3, h.y + 0.45, bz, c.boardEdge, 0.04);
    this.drawRim(h, hd, true);
    this.drawRim(h, hd, false);
    g.globalAlpha = 1;
  }

  ballInHoopGroup(b, h, hd) {
    const dx = b.p.x - h.x, dz = b.p.z - h.z;
    const inside = dx * dx + dz * dz < (RIM_R + BALL_R) * (RIM_R + BALL_R) && b.p.y < h.y + 0.3 && b.p.y > h.y - NET_DEPTH - 0.25;
    if (inside) return true;
    // Behind the rim centre but in front of the board.
    const d = this.depth(b.p.x, b.p.y, b.p.z);
    return d > hd && b.p.z < h.z + BOARD.offset + 0.2 && Math.abs(dx) < BOARD.halfW + 0.6 && b.p.y > h.y - 1.2;
  }

  drawHoop(round, h, hd, ui) {
    const g = this.g, c = this.court;
    const bz = h.z + BOARD.offset;
    // Pole and arm.
    const poleZ = BASELINE + 0.7;
    this.proj(h.x, 0, poleZ, this.p);
    this.proj(h.x, h.y + 0.55, poleZ, this.q);
    if (this.p.ok && this.q.ok) {
      g.strokeStyle = c.pole; g.lineCap = 'butt';
      g.lineWidth = 0.16 * this.p.s;
      g.beginPath(); g.moveTo(this.p.x, this.p.y); g.lineTo(this.q.x, this.q.y); g.stroke();
      g.fillStyle = c.accent;
      this.proj(h.x, 1.2, poleZ, this.p);
      this.proj(h.x, 0, poleZ, this.q);
      g.fillRect(this.p.x - 0.13 * this.p.s, this.p.y, 0.26 * this.p.s, this.q.y - this.p.y);
      this.proj(h.x, h.y + 0.55, poleZ, this.p);
      this.proj(h.x, h.y + 0.35, bz + BOARD.thick, this.q);
      g.lineWidth = 0.1 * this.p.s;
      g.strokeStyle = c.pole;
      g.beginPath(); g.moveTo(this.p.x, this.p.y); g.lineTo(this.q.x, this.q.y); g.stroke();
    }
    // Balls that sailed over/behind the board.
    for (const b of round.balls) if ((!b.dead || b.made) && b.p.z > bz + BOARD.thick) this.drawBall(b);
    // Board.
    const x0 = h.x - BOARD.halfW, x1 = h.x + BOARD.halfW, y0 = h.y - BOARD.below, y1 = h.y + BOARD.above;
    this.quad(x0, y0, x1, y1, bz, c.board, 0.88);
    g.lineJoin = 'round';
    this.quadStroke(x0, y0, x1, y1, bz, c.boardEdge, 0.06);
    this.quadStroke(h.x - 0.3, h.y + 0.02, h.x + 0.3, h.y + 0.45, bz, c.boardEdge, 0.045);
    if (ui.bankStar) {
      this.proj(ui.bankStar.x, ui.bankStar.y, bz, this.p);
      if (this.p.ok) {
        const r = 0.13 * this.p.s * (1 + 0.12 * Math.sin(this.time * 6));
        g.fillStyle = '#ffd23f'; g.strokeStyle = '#c27a00'; g.lineWidth = Math.max(1, r * 0.15);
        starPath(g, this.p.x, this.p.y, r); g.fill(); g.stroke();
      }
    }
    // Neck bracket.
    this.proj(h.x, h.y, h.z + RIM_R, this.p);
    this.proj(h.x, h.y + 0.02, bz, this.q);
    if (this.p.ok && this.q.ok) {
      g.strokeStyle = '#c9cfd8'; g.lineWidth = 0.05 * this.p.s;
      g.beginPath(); g.moveTo(this.p.x, this.p.y); g.lineTo(this.q.x, this.q.y); g.stroke();
    }
    this.drawRim(h, hd, true);
    this.drawNet(hd, true);
    // Balls inside the hoop / just behind the rim centre.
    for (const b of round.balls) {
      if ((b.dead && !b.made) || b.p.z > bz + BOARD.thick) continue;
      if (this.ballInHoopGroup(b, h, hd)) this.drawBall(b);
    }
    this.drawNet(hd, false);
    this.drawRim(h, hd, false);
  }

  quad(x0, y0, x1, y1, z, fill, alpha = 1) {
    const g = this.g;
    g.beginPath();
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let i = 0; i < 4; i++) {
      this.proj(pts[i][0], pts[i][1], z, this.p);
      if (!this.p.ok) return;
      if (i === 0) g.moveTo(this.p.x, this.p.y); else g.lineTo(this.p.x, this.p.y);
    }
    g.closePath();
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.fill();
    g.globalAlpha = 1;
  }

  quadStroke(x0, y0, x1, y1, z, color, w) {
    const g = this.g;
    g.beginPath();
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    let s = 0;
    for (let i = 0; i < 4; i++) {
      this.proj(pts[i][0], pts[i][1], z, this.p);
      if (!this.p.ok) return;
      s += this.p.s;
      if (i === 0) g.moveTo(this.p.x, this.p.y); else g.lineTo(this.p.x, this.p.y);
    }
    g.closePath();
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, (w * s) / 4);
    g.stroke();
  }

  drawRim(h, hd, back) {
    const g = this.g;
    const N = 28;
    g.strokeStyle = back ? '#c8401a' : '#ff5a1f';
    g.lineCap = 'round';
    let started = false, sAvg = 0, n = 0;
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const x = h.x + Math.cos(a) * RIM_R, z = h.z + Math.sin(a) * RIM_R;
      const isBack = this.depth(x, h.y, z) >= hd;
      if (isBack !== back) { started = false; continue; }
      this.proj(x, h.y, z, this.p);
      if (!this.p.ok) continue;
      sAvg += this.p.s; n++;
      if (!started) { g.moveTo(this.p.x, this.p.y); started = true; } else g.lineTo(this.p.x, this.p.y);
    }
    if (!n) return;
    g.lineWidth = Math.max(2, (0.045 * sAvg) / n);
    g.stroke();
    if (!back) {
      g.strokeStyle = 'rgba(255,220,180,0.7)';
      g.lineWidth = Math.max(1, (0.012 * sAvg) / n);
      g.stroke();
    }
  }

  drawNet(hd, back) {
    const n = this.net;
    if (!n) return;
    const g = this.g, pos = n.pos;
    g.strokeStyle = back ? 'rgba(225,230,240,0.7)' : 'rgba(255,255,255,0.95)';
    g.beginPath();
    let sAvg = 0, cnt = 0;
    const seg = (a, b) => {
      const ja = a * 3, jb = b * 3;
      const da = this.depth(pos[ja], pos[ja + 1], pos[ja + 2]), db = this.depth(pos[jb], pos[jb + 1], pos[jb + 2]);
      if (((da + db) / 2 >= hd) !== back) return;
      this.proj(pos[ja], pos[ja + 1], pos[ja + 2], this.p);
      this.proj(pos[jb], pos[jb + 1], pos[jb + 2], this.q);
      if (!this.p.ok || !this.q.ok) return;
      g.moveTo(this.p.x, this.p.y); g.lineTo(this.q.x, this.q.y);
      sAvg += this.p.s; cnt++;
    };
    for (let r = 0; r < NET_ROWS - 1; r++) {
      for (let i = 0; i < NET_COLS; i++) {
        const a = r * NET_COLS + i;
        const odd = r % 2;
        const b1 = (r + 1) * NET_COLS + ((i - 1 + odd + NET_COLS) % NET_COLS);
        const b2 = (r + 1) * NET_COLS + ((i + odd) % NET_COLS);
        seg(a, b1); seg(a, b2);
      }
    }
    for (let i = 0; i < NET_COLS; i++) seg((NET_ROWS - 1) * NET_COLS + i, (NET_ROWS - 1) * NET_COLS + ((i + 1) % NET_COLS));
    if (!cnt) return;
    g.lineWidth = Math.max(1, (0.014 * sAvg) / cnt);
    g.stroke();
  }

  drawBall(b, alpha = 1) {
    const g = this.g;
    this.proj(b.p.x, b.p.y, b.p.z, this.p);
    if (!this.p.ok) return;
    const r = BALL_R * this.p.s;
    const fade = b.made && b.dead ? 0 : b.made && b.floorHits > 0 ? 0.85 : 1;
    if (fade <= 0) return;
    this.ballAt(this.p.x, this.p.y, r, b.rot, b.money, b.fire, alpha * fade);
  }

  ballAt(x, y, r, rot, money, fire, alpha = 1) {
    const g = this.g;
    if (r < 0.5) return;
    g.globalAlpha = alpha;
    if (fire) {
      const fl = this.flame, k = r / fl.r;
      const wob = 1 + 0.08 * Math.sin(this.time * 30);
      g.drawImage(fl.canvas, x - fl.cx * k, y - fl.cy * k * wob, fl.canvas.width * k, fl.canvas.height * k * wob);
    } else if (money) {
      g.drawImage(this.goldGlow, x - r * 2, y - r * 2, r * 4, r * 4);
    }
    const art = money ? this.moneyArt : this.ballArt;
    const s = (r * art.size) / art.r / 2;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.drawImage(art.pattern, -s, -s, s * 2, s * 2);
    g.restore();
    g.drawImage(art.shade, x - s, y - s, s * 2, s * 2);
    g.globalAlpha = 1;
  }

  drawTramp(tr) {
    const g = this.g;
    const dip = this.bounceTramp > 0 ? Math.sin((this.bounceTramp / 0.35) * Math.PI) * 0.12 : 0;
    // Legs.
    g.strokeStyle = '#2a3150';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const x = tr.x + Math.cos(a) * tr.r * 0.95, z = tr.z + Math.sin(a) * tr.r * 0.95;
      this.proj(x, TRAMP_Y, z, this.p); this.proj(x, 0, z, this.q);
      if (!this.p.ok || !this.q.ok) continue;
      g.lineWidth = Math.max(1, 0.05 * this.p.s);
      g.beginPath(); g.moveTo(this.p.x, this.p.y); g.lineTo(this.q.x, this.q.y); g.stroke();
    }
    const ring = (rad, y, fill, stroke, w) => {
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * TAU;
        this.proj(tr.x + Math.cos(a) * rad, y, tr.z + Math.sin(a) * rad, this.p);
        if (!this.p.ok) return;
        if (i === 0) g.moveTo(this.p.x, this.p.y); else g.lineTo(this.p.x, this.p.y);
      }
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1, w * this.p.s); g.stroke(); }
    };
    ring(tr.r, TRAMP_Y, '#3fb6ff', '#ffd23f', 0.08);
    ring(tr.r * 0.78, TRAMP_Y - dip, '#1d2440', null, 0);
    ring(tr.r * 0.4, TRAMP_Y - dip, null, 'rgba(255,255,255,0.25)', 0.02);
  }

  drawBlocker(b, s) {
    const g = this.g;
    const spr = this.blockers[b.look] || this.blockers.bear;
    const fz = s.z - s.hz;
    this.proj(s.x, 0, fz, this.p);
    this.proj(s.x, b.h, fz, this.q);
    if (!this.p.ok || !this.q.ok) return;
    const wob = this.blockerHit > 0 && !this.reduced ? Math.sin(this.blockerHit * 40) * 0.06 : 0;
    const w = b.w * this.p.s * 1.15 * (1 + wob), hgt = this.p.y - this.q.y;
    g.globalAlpha = 0.6;
    g.drawImage(spr.canvas, this.p.x - w / 2, this.q.y - hgt * wob, w, hgt * (1 + wob));
    g.globalAlpha = 1;
  }

  // Ace from behind, anchored so his paws hold the ball at the release point.
  drawHero(round, ui) {
    if (ui.hideHero) return;
    const g = this.g;
    const rp = round.releasePoint();
    // Use the eased camera spot so Ace glides with the camera.
    const cs = this.camS || round.shooterPos();
    const dx = round.hoop.x - cs.x, dz = round.hoop.z - cs.z, d = Math.hypot(dx, dz) || 1;
    const hx = cs.x + (dx / d) * 0.25, hz = cs.z + (dz / d) * 0.25;
    this.proj(hx, RELEASE_Y, hz, this.q);
    if (!this.q.ok) return;
    const bx = this.q.x, by = this.q.y, br = BALL_R * this.q.s;
    void rp;
    const k = br / HERO.BALL_R;
    const follow = this.shotAnim > 0 ? this.shotAnim / 0.35 : 0;
    const held = round.held();
    const pop = held && round.cooldown > 0 ? 1 - round.cooldown / READY_GAP : 1;
    const hop = follow > 0 ? Math.sin(follow * Math.PI) * 10 * k : Math.sin(this.time * 2.2) * 1.5 * k;
    // Over-the-shoulder: Ace stands a little left of the ball and leans in,
    // so the court in front of him (trampolines, spots) stays visible.
    // On narrow portrait phones his body is drawn smaller than the ball in his
    // paws would suggest, kept on screen and standing on the bottom edge (he
    // reaches up for the ball), so he doesn't fill the view or hide the
    // trampoline.
    const narrow = this.H > this.W && this.W < 520;
    const kb = narrow ? k * 0.8 : k;
    const shift = (narrow ? 72 : this.W < 520 ? 100 : 120) * kb, lean = 0.18;
    const hcx = narrow ? Math.max(bx - shift, 100 * kb) : bx - shift;
    let stand = by + (HERO.H - HERO.HOLD_Y) * kb + 10 * kb;
    if (narrow) stand = Math.max(stand, this.H + 8);
    const baseY = stand - hop;
    const cl = Math.cos(lean), sl = Math.sin(lean);
    const toScreen = (lx, ly) => [hcx + (lx * cl - ly * sl) * kb, baseY + (lx * sl + ly * cl) * kb];
    const [shLx, shLy] = toScreen(-HERO.SHOULDER_X, HERO.SHOULDER_Y - HERO.H);
    const [shRx, shRy] = toScreen(HERO.SHOULDER_X, HERO.SHOULDER_Y - HERO.H);
    const reach = follow > 0 ? 1 + follow * 0.4 : 0.25 + pop * 0.75;
    const pawY = by - hop + (1 - reach) * 110 * k;
    const pawDX = (follow > 0 ? 16 : 34) * k;
    g.save();
    g.translate(hcx, baseY);
    g.rotate(lean);
    g.drawImage(this.hero, (-HERO.W / 2) * kb, -HERO.H * kb, HERO.W * kb, HERO.H * kb);
    g.restore();
    const shL = shLx, shR = shRx, shY = (shLy + shRy) / 2;
    void shY;
    g.lineCap = 'round';
    g.strokeStyle = '#e9b77a';
    g.lineWidth = 26 * kb;
    g.beginPath();
    g.moveTo(shL, shLy); g.quadraticCurveTo(shL - 10 * kb, (shLy + pawY) / 2, bx - pawDX - 4 * k, pawY + 14 * k);
    g.moveTo(shR, shRy); g.quadraticCurveTo(shR + 34 * kb, (shRy + pawY) / 2 + 10 * kb, bx + pawDX + 4 * k, pawY + 14 * k);
    g.stroke();
    // Wristbands in the jersey trim.
    g.strokeStyle = this.jersey.trim;
    g.lineWidth = 28 * k;
    g.beginPath();
    g.moveTo(bx - pawDX - 6 * k, pawY + 40 * k); g.lineTo(bx - pawDX - 5 * k, pawY + 30 * k);
    g.moveTo(bx + pawDX + 6 * k, pawY + 40 * k); g.lineTo(bx + pawDX + 5 * k, pawY + 30 * k);
    g.stroke();
    // The ball in hand (pops up from below when a new one arrives).
    if (held) {
      const s = 0.6 + 0.4 * pop;
      this.ballAt(bx, by - hop + (1 - pop) * 60 * k, br * s, Math.sin(this.time * 1.3) * 0.3, held.money, held.fire, ui.dimBall ? 0.55 : 1);
    }
    // Paws over the ball.
    g.fillStyle = '#e9b77a';
    for (const sx of [-1, 1]) {
      g.beginPath(); g.ellipse(bx + sx * (pawDX + 6 * k), pawY + 8 * k, 16 * k, 18 * k, 0, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(150,90,40,0.35)';
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(bx + sx * (pawDX + 6 * k), pawY + 14 * k, 8 * k, 5 * k, 0, 0, TAU); g.fill(); }
    this.heroBall = { x: bx, y: by, r: br };
  }

  drawParticles() {
    const g = this.g;
    for (const p of this.particles) {
      const a = 1 - p.t / p.life;
      if (p.kind === 'confetti') {
        g.globalAlpha = Math.min(1, a * 1.5);
        g.fillStyle = p.color;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
      } else {
        this.proj(p.wx, p.wy, p.wz, this.p);
        if (!this.p.ok) continue;
        const r = 0.09 * this.p.s * a + 2;
        g.globalAlpha = a;
        g.drawImage(this.sparkGlow, this.p.x - r, this.p.y - r, r * 2, r * 2);
      }
    }
    g.globalAlpha = 1;
  }

  drawOverlay(round, ui) {
    const g = this.g;
    // Flick trail.
    if (ui.trail && ui.trail.length > 1) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 1; i < ui.trail.length; i++) {
        const a = ui.trail[i - 1], b = ui.trail[i];
        g.strokeStyle = `rgba(255,255,255,${(0.15 + 0.6 * (i / ui.trail.length)).toFixed(2)})`;
        g.lineWidth = 4 + 10 * (i / ui.trail.length);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    // Timing meter for keyboard / gamepad.
    if (ui.meter && this.heroBall) {
      const { x, y, r } = this.heroBall;
      const mh = Math.max(110, r * 3.6), mw = Math.max(16, r * 0.45);
      const mx = x + r * 2.4, my = y - mh / 2;
      g.fillStyle = 'rgba(10,14,40,0.6)';
      roundRect(g, mx - 4, my - 4, mw + 8, mh + 8, 10); g.fill();
      const zone = ui.meter.zone;
      g.fillStyle = '#ff6b6b'; roundRect(g, mx, my, mw, mh, 6); g.fill();
      g.fillStyle = '#ffd23f'; g.fillRect(mx, my + mh * (0.5 - zone * 2.4), mw, mh * zone * 4.8);
      g.fillStyle = '#4fe08a'; g.fillRect(mx, my + mh * (0.5 - zone), mw, mh * zone * 2);
      const v = ui.meter.value; // 0 bottom … 1 top
      const ky = my + mh * (1 - v);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#1b1530'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(mx - 12, ky - 9); g.lineTo(mx - 1, ky); g.lineTo(mx - 12, ky + 9); g.closePath(); g.fill(); g.stroke();
      g.fillRect(mx - 2, ky - 2, mw + 4, 4);
      // Aim arrow.
      if (ui.meter.aimTo) {
        const t = ui.meter.aimTo;
        const ang = Math.atan2(t.x - x, -(t.y - y)) + ui.meter.nudge;
        const L = r * 2.2;
        const ax = x + Math.sin(ang) * (r * 1.3), ay = y - Math.cos(ang) * (r * 1.3);
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + Math.sin(ang) * L, ay - Math.cos(ang) * L); g.stroke();
        g.fillStyle = '#ffffff';
        const tx = ax + Math.sin(ang) * (L + 10), ty = ay - Math.cos(ang) * (L + 10);
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - Math.cos(ang) * 9 - Math.sin(ang) * 6, ty - Math.sin(ang) * 9 + Math.cos(ang) * 6); g.lineTo(tx + Math.cos(ang) * 9 - Math.sin(ang) * 6, ty + Math.sin(ang) * 9 + Math.cos(ang) * 6); g.closePath(); g.fill();
      }
    }
    // Popups.
    for (const p of this.popups) {
      const k = p.t / p.life;
      const rise = p.center ? 0 : k * 50;
      const pop = Math.min(1, p.t / 0.12);
      const size = Math.round((p.center ? 54 : 30) * p.size * (0.6 + 0.4 * pop) * Math.min(1.2, Math.max(0.7, this.W / 700)));
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = Math.max(4, size * 0.16); g.strokeStyle = 'rgba(20,10,40,0.85)'; g.lineJoin = 'round';
      g.strokeText(p.text, p.x, p.y - rise);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y - rise);
    }
    g.globalAlpha = 1;
    // Countdown.
    if (round.status === 'countdown' && !ui.attract) {
      const n = Math.ceil(round.count / 0.8);
      const frac = (round.count / 0.8) % 1;
      const size = Math.round(Math.min(this.W, this.H) * 0.22 * (0.8 + 0.4 * frac));
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = size * 0.12; g.strokeStyle = 'rgba(20,10,40,0.85)';
      g.strokeText(String(n), this.W / 2, this.H * 0.4);
      g.fillStyle = '#ffd23f';
      g.fillText(String(n), this.W / 2, this.H * 0.4);
    }
    if (ui.hint) {
      const size = Math.round(Math.max(16, Math.min(24, this.W / 26)));
      g.font = `800 ${size}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const y = this.H * 0.6;
      const w = g.measureText(ui.hint).width + 28;
      g.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 4);
      g.fillStyle = 'rgba(15,10,40,0.7)';
      roundRect(g, this.W / 2 - w / 2, y - size, w, size * 2, size); g.fill();
      g.fillStyle = '#ffffff';
      g.fillText(ui.hint, this.W / 2, y + 1);
      g.globalAlpha = 1;
    }
  }
}

function hoopBaseX(round) { return round.hoop.x; }

// Per-theme court walls: height (m), fill, chain-link hatch, rails and posts.
const WALL_STYLES = {
  park: { h: 2.6, fill: '#56616e', alpha: 0.16, hatch: 'rgba(225,232,240,0.5)', lines: [[1, '#9aa4b0', 0.07], [0.02, '#9aa4b0', 0.05]], posts: '#8a96a4', postStep: 3, postW: 0.08 },
  beach: { h: 1.0, fill: '#c98a4a', alpha: 0.0, lines: [[1, '#b0743a', 0.12], [0.55, '#c98a4a', 0.09]], posts: '#a86a32', postStep: 1.6, postW: 0.1, postTop: 0.05 },
  roof: { h: 1.15, fill: '#4a3f68', alpha: 1, lines: [[1, '#6b5f92', 0.14], [0.66, 'rgba(0,0,0,0.18)', 0.03], [0.33, 'rgba(0,0,0,0.18)', 0.03]], posts: null },
  space: { h: 1.25, fill: '#56607e', alpha: 1, lines: [[1, '#7a86aa', 0.12], [0.5, '#7cf0ff', 0.05]], posts: '#454e6c', postStep: 4, postW: 0.18 },
  neon: { h: 1.0, fill: '#0c0a24', alpha: 1, lines: [[1, '#ff3fd0', 0.07], [0.4, '#4ff3ff', 0.04]], posts: null },
  candy: { h: 1.2, fill: '#ffffff', alpha: 0, lines: [[1, '#ff6fb5', 0.12], [0.5, '#ffffff', 0.09]], posts: '#ff4f8b', postStep: 1.2, postW: 0.12, postTop: 0.15 },
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function starPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

export { hoopState };
