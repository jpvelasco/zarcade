// Canvas renderer: camera, the baked ground, dynamic signs, y-sorted
// animals, visitors and decorations, and capped particles. It reads the zoo
// and actors and never changes them.
import { BIOMES, PLOTS_PER_BIOME, DECO_SPOTS_PER_BIOME, RARITY } from './data.js';
import { WORLD, zoneRect, plotRect, decoSpot, ROAD } from './map.js';
import { Ground } from './scenery.js';
import { SpriteBank, PAD_TOP, heart, star } from './sprites.js';
import { fmt } from './economy.js';

const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MAX_PARTICLES = 160;

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.sprites = new SpriteBank();
    const mobile = Math.min(screen.width, screen.height) < 600;
    this.ground = new Ground({ scale: mobile ? 1.25 : 1.6 });
    this.cam = { x: 960, y: 780, z: 1 };
    this.target = { x: 960, y: 780, z: 1 };
    this.particles = [];
    this.drawables = [];
    this.time = 0;
    this.selected = -1;
    this.hover = null;
    this.placing = null; // deco id while placing
    this.spotSel = -1;
    this.shake = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.minZ = Math.max(0.28, Math.min(this.W / (WORLD.x1 - WORLD.x0), this.H / (WORLD.y1 - WORLD.y0)));
    this.maxZ = 1.9;
    this.clampTarget();
  }

  // A zoom that shows one zone comfortably.
  zoneZoom() {
    return Math.max(this.minZ, Math.min(1.25, this.W / 720, (this.H - 210) / 560));
  }

  focusZone(b, { instant = false } = {}) {
    const z = zoneRect(b);
    this.target.x = z.x + z.w / 2;
    this.target.y = z.y + z.h / 2 + 20;
    this.target.z = this.zoneZoom();
    this.clampTarget();
    if (instant || this.reduced) Object.assign(this.cam, this.target);
  }

  focusPoint(x, y, z = null, instant = false) {
    this.target.x = x;
    this.target.y = y;
    if (z) this.target.z = z;
    this.clampTarget();
    if (instant || this.reduced) Object.assign(this.cam, this.target);
  }

  pan(dxScreen, dyScreen) {
    this.target.x -= dxScreen / this.cam.z;
    this.target.y -= dyScreen / this.cam.z;
    this.cam.x = this.target.x;
    this.cam.y = this.target.y;
    this.clampTarget();
    this.cam.x = this.target.x;
    this.cam.y = this.target.y;
  }

  zoomAt(factor, sx = this.W / 2, sy = this.H / 2) {
    const before = this.toWorld(sx, sy);
    this.target.z = Math.max(this.minZ, Math.min(this.maxZ, this.target.z * factor));
    this.cam.z = this.target.z;
    const after = this.toWorld(sx, sy);
    this.target.x += before.x - after.x;
    this.target.y += before.y - after.y;
    this.clampTarget();
    this.cam.x = this.target.x;
    this.cam.y = this.target.y;
  }

  clampTarget() {
    const t = this.target;
    t.z = Math.max(this.minZ, Math.min(this.maxZ, t.z));
    const hw = this.W / 2 / t.z;
    const hh = this.H / 2 / t.z;
    const x0 = WORLD.x0 + hw;
    const x1 = WORLD.x1 - hw;
    const y0 = WORLD.y0 + hh;
    const y1 = WORLD.y1 - hh;
    t.x = x0 > x1 ? (WORLD.x0 + WORLD.x1) / 2 : Math.max(x0, Math.min(x1, t.x));
    t.y = y0 > y1 ? (WORLD.y0 + WORLD.y1) / 2 : Math.max(y0, Math.min(y1, t.y));
  }

  toWorld(sx, sy) {
    return { x: (sx - this.W / 2) / this.cam.z + this.cam.x, y: (sy - this.H / 2) / this.cam.z + this.cam.y };
  }
  toScreen(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.z + this.W / 2, y: (wy - this.cam.y) * this.cam.z + this.H / 2 };
  }

  // ---------------------------------------------------------------- effects

  add(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  coinPop(x, y, amount) {
    if (amount < 0.5) return;
    this.add({ kind: 'coin', x, y, vy: -26, life: 1.4, max: 1.4, text: `+${fmt(amount)}` });
  }

  hearts(x, y, n = 4) {
    const count = this.reduced ? 1 : n;
    for (let k = 0; k < count; k++) {
      this.add({ kind: 'heart', x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30, life: 1.1, max: 1.1, r: 5 + Math.random() * 4 });
    }
  }

  sparkle(x, y, n = 10, color = '#ffd23f') {
    const count = this.reduced ? Math.ceil(n / 4) : n;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const sp = 40 + Math.random() * 110;
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.9, max: 0.9, r: 3 + Math.random() * 4, color });
    }
  }

  confetti(x, y, n = 40) {
    const count = this.reduced ? 8 : n;
    const cols = ['#ff6b9a', '#ffd23f', '#4fb6ff', '#7ad86a', '#b07aff', '#ff8a3d'];
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 150 + Math.random() * 220;
      this.add({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.8, max: 1.8, r: 4 + Math.random() * 3, color: cols[k % cols.length], spin: Math.random() * 6 });
    }
  }

  text(x, y, text, color = '#ffffff') {
    this.add({ kind: 'text', x, y, vy: -18, life: 1.6, max: 1.6, text, color });
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    this.time += dt;
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 9);
    this.cam.x += (this.target.x - this.cam.x) * k;
    this.cam.y += (this.target.y - this.cam.y) * k;
    this.cam.z += (this.target.z - this.cam.z) * k;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.kind === 'coin' || p.kind === 'text') p.y += p.vy * dt;
      else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.kind === 'heart' ? -10 : 260) * dt;
        if (p.kind === 'confetti') p.vx *= 0.98;
      }
    }
    if (this.particles.length && this.particles.some((p) => p.life <= 0)) this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ---------------------------------------------------------------- draw

  draw(zoo, actors, opts = {}) {
    const ctx = this.ctx;
    const { W, H, dpr, cam } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#7cc26a';
    ctx.fillRect(0, 0, W, H);
    // ground blit: visible world rect -> ground canvas pixels
    const g = this.ground;
    const v = this.toWorld(0, 0);
    const vw = W / cam.z;
    const vh = H / cam.z;
    const sx = (v.x - WORLD.x0) * g.scale;
    const sy = (v.y - WORLD.y0) * g.scale;
    const sw = vw * g.scale;
    const sh = vh * g.scale;
    // drawImage needs the source rect inside the canvas
    const cx0 = Math.max(0, sx);
    const cy0 = Math.max(0, sy);
    const cx1 = Math.min(g.canvas.width, sx + sw);
    const cy1 = Math.min(g.canvas.height, sy + sh);
    if (cx1 > cx0 && cy1 > cy0) {
      ctx.drawImage(g.canvas, cx0, cy0, cx1 - cx0, cy1 - cy0,
        (cx0 - sx) / g.scale * cam.z, (cy0 - sy) / g.scale * cam.z, (cx1 - cx0) / g.scale * cam.z, (cy1 - cy0) / g.scale * cam.z);
    }
    // world space from here
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 - cam.x * cam.z), dpr * (H / 2 - cam.y * cam.z));
    const view = { x0: v.x - 80, y0: v.y - 120, x1: v.x + vw + 80, y1: v.y + vh + 120 };
    this.drawWater(zoo, view);
    this.drawSigns(zoo, view, opts);
    this.drawSpots(zoo, view);
    this.drawActors(zoo, actors, view);
    this.drawSelection(zoo);
    this.drawParticles();
  }

  inView(view, x, y, pad = 0) {
    return x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
  }

  // Moving glints on the ocean pools.
  drawWater(zoo, view) {
    if (this.reduced) return;
    const ctx = this.ctx;
    const b = BIOMES.findIndex((x) => x.id === 'ocean');
    if (!zoo.isUnlocked(b)) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (let p = 0; p < PLOTS_PER_BIOME; p++) {
      const i = b * PLOTS_PER_BIOME + p;
      if (!zoo.habitat(i).level) continue;
      const r = plotRect(i);
      if (!this.inView(view, r.x + r.w / 2, r.y + r.h / 2, 200)) continue;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const t = this.time * 0.6 + k * 1.7 + i;
        const x = r.x + 40 + ((k * 53 + Math.sin(t) * 20) % (r.w - 80));
        const y = r.y + 50 + ((k * 37) % (r.h - 80)) + Math.cos(t * 1.3) * 4;
        ctx.moveTo(x - 8, y);
        ctx.quadraticCurveTo(x, y - 4, x + 8, y);
      }
      ctx.stroke();
    }
  }

  drawSigns(zoo, view, { hideSigns = false } = {}) {
    if (hideSigns) return;
    const ctx = this.ctx;
    const t = this.time;
    for (let b = 0; b < BIOMES.length; b++) {
      const z = zoneRect(b);
      if (!this.inView(view, z.x + z.w / 2, z.y + z.h / 2, z.w)) continue;
      if (!zoo.isUnlocked(b)) {
        this.lockSign(zoo, b, z);
        continue;
      }
      const waiting = zoo.waitingIn(b).length;
      let waitShown = false;
      for (let p = 0; p < PLOTS_PER_BIOME; p++) {
        const i = b * PLOTS_PER_BIOME + p;
        const r = plotRect(i);
        const h = zoo.habitat(i);
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        if (!h.level) {
          const cost = zoo.buildCost(i);
          const can = zoo.coins >= cost;
          const bob = can && !this.reduced ? Math.sin(t * 3 + i) * 3 : 0;
          this.plate(cx, cy + bob, `Build · ${fmt(cost)}`, can ? '#5ac85a' : '#9a8ca8', '🏗️');
          if (waiting && !waitShown) {
            waitShown = true;
            this.bubble(cx, cy - 46 + bob, `${waiting} waiting for a home!`);
          }
        } else if (h.joy > 1) {
          // Joy meter under the sign
          const sy = r.side === 'top' ? r.y - 34 : r.y + r.h + 34;
          ctx.fillStyle = 'rgba(60,30,60,0.35)';
          ctx.beginPath();
          ctx.roundRect(cx - 30, sy - 4, 60, 8, 4);
          ctx.fill();
          ctx.fillStyle = '#ff6b9a';
          ctx.beginPath();
          ctx.roundRect(cx - 30, sy - 4, 60 * (h.joy / 100), 8, 4);
          ctx.fill();
          heart(ctx, cx - 36, sy, 6, '#ff6b9a');
        }
      }
      if (waiting && !waitShown) {
        // every plot is built and full: point at the fullest habitat to upgrade
        const i = b * PLOTS_PER_BIOME;
        const r = plotRect(i);
        this.bubble(r.x + r.w / 2, r.y + r.h / 2 - 20, `${waiting} waiting · upgrade for room`);
      }
    }
  }

  lockSign(zoo, b, z) {
    const ctx = this.ctx;
    const next = b === zoo.nextBiome();
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    const cost = BIOMES[b].unlock;
    const can = next && zoo.coins >= cost;
    const bob = can && !this.reduced ? Math.sin(this.time * 2.5) * 4 : 0;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.fillStyle = 'rgba(60,40,30,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 70, 120, 16, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-8, 10, 16, 62, 4);
    ctx.fillStyle = '#a8784a';
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-150, -66, 300, 104, 22);
    ctx.fillStyle = next ? '#fff6e4' : 'rgba(255,246,228,0.85)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = can ? '#5ac85a' : '#a8784a';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6a4030';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText(BIOMES[b].name, 0, -30);
    ctx.font = `800 22px ${FONT}`;
    if (next) {
      ctx.fillStyle = can ? '#2f8a3a' : '#8a6a5a';
      ctx.fillText(can ? `Tap to open · ${fmt(cost)} coins` : `🔒 Opens for ${fmt(cost)} coins`, 0, 12);
    } else {
      ctx.fillStyle = '#9a8a8a';
      ctx.fillText(`🔒 Open the ${BIOMES[b - 1].short} first`, 0, 12);
    }
    ctx.restore();
  }

  plate(x, y, text, color, icon) {
    const ctx = this.ctx;
    ctx.font = `900 19px ${FONT}`;
    const w = ctx.measureText(text).width + 56;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 22, w, 44, 22);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${icon} ${text}`, x, y + 1);
  }

  bubble(x, y, text) {
    const ctx = this.ctx;
    ctx.font = `800 15px ${FONT}`;
    const w = ctx.measureText(text).width + 26;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 16, w, 32, 14);
    ctx.moveTo(x - 8, y + 15);
    ctx.lineTo(x, y + 26);
    ctx.lineTo(x + 8, y + 15);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ff8a3d';
    ctx.stroke();
    ctx.fillStyle = '#c85a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  drawSpots(zoo, view) {
    if (!this.placing) return;
    const ctx = this.ctx;
    const pulse = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 5);
    for (let s = 0; s < BIOMES.length * DECO_SPOTS_PER_BIOME; s++) {
      if (!zoo.spotOpen(s)) continue;
      const p = decoSpot(s);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 40, 22, 0, 0, TAU);
      ctx.fillStyle = `rgba(255,236,120,${0.25 + pulse * 0.3})`;
      ctx.fill();
      ctx.lineWidth = s === this.spotSel ? 6 : 3;
      ctx.strokeStyle = s === this.spotSel ? '#ff6b9a' : '#ffd23f';
      ctx.stroke();
    }
  }

  drawActors(zoo, actors, view) {
    const ctx = this.ctx;
    const list = this.drawables;
    list.length = 0;
    for (const [spot, id] of Object.entries(zoo.state.decos.placed)) {
      const p = decoSpot(+spot);
      if (this.inView(view, p.x, p.y, 60)) list.push({ y: p.y + 10, deco: id, x: p.x });
    }
    for (const a of actors.animals.values()) if (this.inView(view, a.x, a.y, 60)) list.push(a);
    for (const v of actors.visitors) if (this.inView(view, v.x, v.y, 40)) list.push(v);
    list.sort((a, b) => a.y - b.y);
    for (const d of list) {
      if (d.deco) this.drawDeco(d);
      else if (d.def) this.drawAnimal(d, zoo);
      else this.drawVisitor(d);
    }
  }

  drawDeco(d) {
    const img = this.sprites.deco(d.deco);
    const w = 92;
    const h = w * 1.1;
    const ctx = this.ctx;
    ctx.drawImage(img, d.x - w / 2, d.y + 10 - h + 4, w, h);
    if (!this.reduced && (d.deco === 'fountain' || d.deco === 'statue' || d.deco === 'arch') && Math.random() < 0.04) {
      this.add({ kind: 'spark', x: d.x + (Math.random() - 0.5) * 50, y: d.y - 40 - Math.random() * 30, vx: 0, vy: -20, life: 0.7, max: 0.7, r: 3, color: d.deco === 'fountain' ? '#bff0ff' : '#ffe27a' });
    }
  }

  drawAnimal(a, zoo) {
    const ctx = this.ctx;
    const img = this.sprites.animals.get(a.id) || this.sprites.animal(a.id);
    const w = 84 * a.size;
    const h = w * 1.1;
    const reduced = this.reduced;
    let lift = 0;
    let sx = 1;
    let sy = 1;
    let rot = 0;
    if (a.swim && !reduced) lift = 4 + Math.sin(a.phase) * 3;
    if (a.moving && !reduced) {
      if (a.swim) rot = Math.sin(a.phase * 0.5) * 0.06;
      else {
        lift = Math.abs(Math.sin(a.phase)) * 7;
        sy = 1 - 0.05 * Math.cos(a.phase * 2);
        sx = 2 - sy;
      }
    } else if (!reduced) {
      sy = 1 + 0.025 * Math.sin(a.phase);
      sx = 2 - sy;
    }
    if (a.emoteT > 0 && !reduced) lift += Math.sin((1 - a.emoteT / 0.9) * Math.PI) * 12;
    if (a.petT > 0) {
      const t = 1 - a.petT / 0.75;
      lift += Math.sin(t * Math.PI) * (reduced ? 4 : 18);
      const sq = Math.sin(t * Math.PI * 2) * (reduced ? 0.02 : 0.1);
      sy *= 1 + sq;
      sx *= 1 - sq;
    }
    let pop = 1;
    if (a.popT > 0) {
      const t = 1 - a.popT;
      pop = reduced ? 1 : Math.min(1.12, t * 1.6) - Math.max(0, t - 0.7) * 0.4;
    }
    // shadow
    ctx.fillStyle = a.swim ? 'rgba(20,70,120,0.25)' : 'rgba(40,50,30,0.22)';
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, w * 0.34 * (1 - lift / 60), w * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(a.x, a.y - lift);
    ctx.rotate(rot);
    ctx.scale(sx * pop * a.face, sy * pop);
    // the painter's feet sit at (96 + PAD_TOP) of a 110-unit tall box
    ctx.drawImage(img, -w / 2, -h * ((96 + PAD_TOP) / 110), w, h);
    ctx.restore();
    if (a.petT > 0.6 && !a.heartsShown) {
      a.heartsShown = true;
    } else if (a.petT === 0) a.heartsShown = false;
  }

  drawVisitor(v) {
    const ctx = this.ctx;
    const moving = v.watchT <= 0;
    const frame = moving && Math.sin(v.phase) > 0 ? 1 : 0;
    const img = this.sprites.visitor(v.variant, frame);
    const w = 30;
    const h = 48;
    const bob = moving && !this.reduced ? Math.abs(Math.sin(v.phase)) * 1.6 : 0;
    ctx.fillStyle = 'rgba(40,50,30,0.2)';
    ctx.beginPath();
    ctx.ellipse(v.x, v.y, 10, 3.5, 0, 0, TAU);
    ctx.fill();
    if (v.balloon !== null) {
      const sway = this.reduced ? 0 : Math.sin(this.time * 2 + v.uid) * 3;
      const bx = v.x + 9 * v.face + sway;
      const by = v.y - 72 - bob;
      ctx.strokeStyle = 'rgba(80,70,90,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(v.x + 8 * v.face, v.y - 22);
      ctx.lineTo(bx, by + 12);
      ctx.stroke();
      const bi = this.sprites.balloon(v.balloon);
      const bw = v.golden ? 26 : 18;
      ctx.drawImage(bi, bx - bw / 2, by - bw * 0.6, bw, bw * 1.42);
      if (v.golden && !v.greeted && !this.reduced && Math.random() < 0.15) {
        this.add({ kind: 'spark', x: bx + (Math.random() - 0.5) * 20, y: by, vx: 0, vy: -10, life: 0.6, max: 0.6, r: 3, color: '#ffe27a' });
      }
    }
    ctx.save();
    ctx.translate(v.x, v.y - bob);
    ctx.scale(v.face, 1);
    ctx.drawImage(img, -w / 2, -h + 2, w, h);
    ctx.restore();
  }

  drawSelection(zoo) {
    const ctx = this.ctx;
    const t = this.time;
    const outline = (i, color, width, dash) => {
      const r = plotRect(i);
      ctx.save();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      if (dash) {
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = this.reduced ? 0 : -t * 30;
      }
      ctx.beginPath();
      ctx.roundRect(r.x - 10, r.y - 16, r.w + 20, r.h + 26, 22);
      ctx.stroke();
      ctx.restore();
    };
    if (this.hover && this.hover.kind === 'habitat' && this.hover.habitat !== this.selected) outline(this.hover.habitat, 'rgba(255,255,255,0.7)', 4, false);
    if (this.selected >= 0) outline(this.selected, '#ffffff', 6, true);
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.max * 1.6));
      ctx.globalAlpha = a;
      if (p.kind === 'coin') {
        ctx.font = `900 20px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(p.text).width;
        const x = p.x - (w + 22) / 2;
        ctx.beginPath();
        ctx.arc(x + 9, p.y, 9, 0, TAU);
        ctx.fillStyle = '#ffc83a';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#b8741a';
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#7a4a1a';
        ctx.strokeText(p.text, x + 22, p.y);
        ctx.fillStyle = '#ffe27a';
        ctx.fillText(p.text, x + 22, p.y);
      } else if (p.kind === 'text') {
        ctx.font = `900 24px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(60,30,60,0.8)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'heart') heart(ctx, p.x, p.y, p.r, '#ff6b9a');
      else if (p.kind === 'spark') star(ctx, p.x, p.y, p.r, p.color);
      else if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin * p.life * 3);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}

export { RARITY, ROAD };
