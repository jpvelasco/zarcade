// Drawing the manor. The room is baked once into an offscreen "plate" (walls,
// floor and every prop) in slices so no frame stalls; each hidden thing gets its
// own little patch canvas holding the thing with whatever covers it painted back
// over the top, so a found thing can simply stop being drawn and the room
// underneath is already correct. Per frame: one plate, a handful of patches, the
// ghosts, and the effects.
//
// No shadowBlur and no filters in the frame loop: every glow is a baked
// gradient.

import { drawProp, alpha, mixHex, shade } from './art.js';
import { drawItem, drawGhost, drawArch, drawSilhouette } from './sprites.js';
import { PROPS, coverRects } from './props.js';
import { propBox } from './scene.js';
import { ITEM } from './items.js';
import { ghostsOf } from './ghosts.js';
import { sceneBox } from './rooms.js';

const MAX_PARTICLES = 140;
const MAX_ZOOM = 2.7;

function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h))
    : Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
  return c;
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.dpr = 1;
    this.view = { w: 1, h: 1 };
    this.scene = null;
    this.diff = null;
    this.split = false;
    this.plate = null;
    this.platesDiff = null;
    this.patches = new Map();
    this.bake = null;
    this.camera = { cx: 0, cy: 0, zoom: 1 };
    this.cover = 1;
    this.particles = [];
    this.flyers = [];
    this.marks = [];
    this.puffs = [];
    this.lantern = null;
    this.reticle = null;
    this.ghostSpots = [];
    this.light = 0;
    this.progress = 0;
    this.time = 0;
    this.dust = [];
    this.glowCache = new Map();
    this.shake = 0;
  }

  // ------------------------------------------------------------- viewport

  // Spot the Difference shows two pictures at once, so the room has to be
  // built for one panel rather than the whole canvas: each picture must be
  // visible in full, with no panning needed to compare them.
  setSplit(on) { this.split = !!on; }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    this.view = { w, h };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const panel = this.panels()[0];
    return sceneBox(panel.w, panel.h);
  }

  box() {
    return this.scene?.box || this.diff?.box || { w: 1400, h: 1000 };
  }

  // In diff mode each picture gets half the screen.
  // The two pictures sit one above the other. Stacking rather than placing them
  // side by side keeps each panel wider than it is tall, which is the shape a
  // room is built for, and means neither picture ever needs panning.
  panels() {
    if (!this.split && !this.diff) return [{ x: 0, y: 0, w: this.view.w, h: this.view.h }];
    const h = (this.view.h - 6) / 2;
    return [{ x: 0, y: 0, w: this.view.w, h }, { x: 0, y: h + 6, w: this.view.w, h }];
  }

  recomputeCover() {
    const box = this.box();
    const p = this.panels()[0];
    this.cover = Math.max(p.w / box.w, p.h / box.h);
    this.clampCamera();
  }

  get scale() { return this.cover * this.camera.zoom; }

  clampCamera() {
    const box = this.box();
    const p = this.panels()[0];
    const s = this.scale;
    const halfW = p.w / (2 * s);
    const halfH = p.h / (2 * s);
    this.camera.cx = Math.min(Math.max(this.camera.cx, halfW), Math.max(halfW, box.w - halfW));
    this.camera.cy = Math.min(Math.max(this.camera.cy, halfH), Math.max(halfH, box.h - halfH));
  }

  resetCamera() {
    const box = this.box();
    this.camera.zoom = 1;
    this.camera.cx = box.w / 2;
    this.camera.cy = box.h / 2;
    this.recomputeCover();
  }

  setZoom(zoom, anchorX = null, anchorY = null) {
    const p = this.panels()[0];
    const ax = anchorX ?? p.x + p.w / 2;
    const ay = anchorY ?? p.y + p.h / 2;
    const before = this.worldAt(ax, ay);
    this.camera.zoom = Math.min(MAX_ZOOM, Math.max(1, zoom));
    this.recomputeCover();
    const after = this.worldAt(ax, ay);
    this.camera.cx += before.x - after.x;
    this.camera.cy += before.y - after.y;
    this.clampCamera();
  }

  zoomBy(factor, ax, ay) { this.setZoom(this.camera.zoom * factor, ax, ay); }

  panBy(dxScreen, dyScreen) {
    this.camera.cx -= dxScreen / this.scale;
    this.camera.cy -= dyScreen / this.scale;
    this.clampCamera();
  }

  // Which panel a screen point is in, and where that is in the room.
  panelAt(px, py) {
    const list = this.panels();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return { index: i, rect: p };
    }
    return { index: 0, rect: list[0] };
  }

  worldAt(px, py) {
    const { index, rect } = this.panelAt(px, py);
    const s = this.scale;
    const x = this.camera.cx + (px - (rect.x + rect.w / 2)) / s;
    const y = this.camera.cy + (py - (rect.y + rect.h / 2)) / s;
    return { x, y, panel: index };
  }

  screenAt(wx, wy, panelIndex = 0) {
    const rect = this.panels()[panelIndex] || this.panels()[0];
    const s = this.scale;
    return {
      x: rect.x + rect.w / 2 + (wx - this.camera.cx) * s,
      y: rect.y + rect.h / 2 + (wy - this.camera.cy) * s,
    };
  }

  // How forgiving a tap should be, in world units: about 15 screen pixels.
  tapTolerance() {
    return Math.max(10, 15 / this.scale);
  }

  // ------------------------------------------------------------- the bake

  bakeScale() {
    return Math.min(2, Math.max(0.75, this.cover * this.dpr * 1.2));
  }

  setScene(scene, { light = 0 } = {}) {
    this.scene = scene;
    this.diff = null;
    this.split = false;
    this.platesDiff = null;
    this.light = light;
    this.progress = 0;
    this.patches.clear();
    this.flyers.length = 0;
    this.particles.length = 0;
    this.marks.length = 0;
    this.puffs.length = 0;
    this.lantern = null;
    this.resetCamera();
    this.placeGhosts();
    this.makeDust();
    this.startBake();
  }

  setDiff(diff, { light = 0 } = {}) {
    this.diff = diff;
    this.scene = null;
    this.split = true;
    this.plate = null;
    this.light = light;
    this.progress = 0;
    this.patches.clear();
    this.flyers.length = 0;
    this.marks.length = 0;
    this.puffs.length = 0;
    this.lantern = null;
    this.resetCamera();
    this.ghostSpots = [];
    this.makeDust();
    this.startBake();
  }

  startBake() {
    const box = this.box();
    const s = this.bakeScale();
    const pw = Math.round(box.w * s);
    const ph = Math.round(box.h * s);
    const steps = [];

    if (this.scene) {
      const plate = makeCanvas(pw, ph);
      const c = plate.getContext('2d');
      c.scale(s, s);
      this.plate = { canvas: plate, scale: s };
      steps.push(() => drawArch(c, this.scene, this.light));
      const props = this.scene.props;
      for (let i = 0; i < props.length; i += 8) {
        const chunk = props.slice(i, i + 8);
        steps.push(() => { for (const p of chunk) drawProp(c, p, this.scene.palette); });
      }
      for (const t of this.scene.targets) steps.push(() => this.bakePatch(t));
    } else if (this.diff) {
      const left = makeCanvas(pw, ph);
      const right = makeCanvas(pw, ph);
      const lc = left.getContext('2d');
      const rc = right.getContext('2d');
      lc.scale(s, s);
      rc.scale(s, s);
      this.platesDiff = { left: { canvas: left, scale: s }, right: { canvas: right, scale: s } };
      const scene = { ...this.diff, props: this.diff.left };
      steps.push(() => { drawArch(lc, scene, this.light); drawArch(rc, scene, this.light); });
      const push = (list, ctx) => {
        const live = list.filter((p) => !p.gone);
        for (let i = 0; i < live.length; i += 8) {
          const chunk = live.slice(i, i + 8);
          steps.push(() => { for (const p of chunk) drawProp(ctx, p, this.diff.palette); });
        }
      };
      push(this.diff.left, lc);
      push(this.diff.right, rc);
    }
    this.bake = { steps, at: 0 };
  }

  // Up to `budget` milliseconds of baking, then back to the frame loop.
  stepBake(budget = 9) {
    if (!this.bake) return true;
    const t0 = performance.now();
    while (this.bake.at < this.bake.steps.length) {
      this.bake.steps[this.bake.at++]();
      if (performance.now() - t0 > budget) return false;
    }
    this.bake = null;
    return true;
  }

  get baking() { return !!this.bake; }

  bakeProgress() {
    if (!this.bake) return 1;
    return this.bake.steps.length ? this.bake.at / this.bake.steps.length : 1;
  }

  // One hidden thing, with everything that covers it painted back on top.
  bakePatch(target) {
    const s = this.bakeScale();
    const m = 6;
    const pw = Math.round((target.w + m * 2) * s);
    const ph = Math.round((target.h + m * 2) * s);
    const canvas = makeCanvas(pw, ph);
    const c = canvas.getContext('2d');
    c.scale(s, s);
    c.translate(m, m);
    if (this.scene.silhouette) drawSilhouette(c, target.id, target.w, target.h, '#15101d');
    else drawItem(c, target.id, target.w, target.h);
    // paint the coverers back over the thing
    c.save();
    c.translate(-target.x, -target.y);
    const box = { x: target.x - m, y: target.y - m, w: target.w + m * 2, h: target.h + m * 2 };
    for (const p of this.scene.props) {
      if (p.z <= target.z) continue;
      const pb = propBox(p);
      if (pb.x > box.x + box.w || pb.x + pb.w < box.x || pb.y > box.y + box.h || pb.y + pb.h < box.y) continue;
      if (!coverRects(PROPS[p.def], pb).some((r) => r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y)) continue;
      drawProp(c, p, this.scene.palette);
    }
    c.restore();
    this.patches.set(target, { canvas, scale: s, m });
  }

  // ------------------------------------------------------------- the cast

  placeGhosts() {
    const scene = this.scene;
    if (!scene) { this.ghostSpots = []; return; }
    const crew = ghostsOf(scene.room);
    const { w: W } = scene.box;
    this.ghostSpots = crew.map((g, i) => {
      const t = crew.length === 1 ? 0.5 : 0.26 + (i / (crew.length - 1)) * 0.48;
      return {
        ghost: g,
        x: W * t,
        y: scene.floorY * (0.42 + ((i * 7) % 3) * 0.06),
        size: Math.min(150, scene.box.h * 0.16),
        mood: 0.35,
        phase: i * 1.7,
        swirl: 0,
      };
    });
  }

  ghostSpot(id) {
    return this.ghostSpots.find((s) => s.ghost.id === id) || this.ghostSpots[0] || null;
  }

  makeDust() {
    this.dust.length = 0;
    if (this.reduced) return;
    const box = this.box();
    const n = 34;
    for (let i = 0; i < n; i++) {
      this.dust.push({
        x: Math.random() * box.w,
        y: Math.random() * box.h,
        r: 1 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 6,
        vy: -2 - Math.random() * 7,
        a: 0.1 + Math.random() * 0.22,
      });
    }
  }

  // ------------------------------------------------------------- effects

  setProgress(found, total) {
    this.progress = total ? found / total : 0;
  }

  // A found thing flies to its ghost.
  addFlyer(target, ghostId) {
    const spot = this.ghostSpot(ghostId);
    this.flyers.push({
      id: target.id,
      w: target.w,
      h: target.h,
      from: { x: target.cx, y: target.cy },
      to: spot ? { x: spot.x, y: spot.y + spot.size * 0.3 } : { x: target.cx, y: target.cy - 200 },
      arc: (Math.random() - 0.5) * 220,
      t: 0,
      dur: 0.95,
      spin: (Math.random() - 0.5) * 2.4,
      ghostId,
    });
    this.marks.push({ x: target.hit.x, y: target.hit.y, r: Math.max(26, target.hit.r * 1.4), t: 0, dur: 0.7 });
    this.sparkle(target.cx, target.cy, 16, '#ffe9a8');
  }

  addDiffMark(change) {
    this.marks.push({ x: change.cx, y: change.cy, r: Math.max(36, change.r), t: 0, dur: 1.1, keep: true, both: true });
    this.sparkle(change.cx, change.cy, 14, '#ffd477');
  }

  celebrate(ghostId) {
    const spot = this.ghostSpot(ghostId);
    if (!spot) return;
    spot.mood = 1;
    spot.swirl = 1;
    this.sparkle(spot.x, spot.y, 22, spot.ghost.glow);
  }

  addPuff(x, y) {
    this.puffs.push({ x, y, t: 0, dur: 0.75, r: 18 });
  }

  sparkle(x, y, n, col) {
    if (this.reduced) n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 190;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.5 + Math.random() * 0.5, age: 0, col, r: 2 + Math.random() * 3,
      });
    }
  }

  setLantern(area) {
    this.lantern = area ? { ...area, t: 0, dur: 4.2 } : null;
  }

  setReticle(pos) { this.reticle = pos; }

  nudge(amount = 1) { if (!this.reduced) this.shake = Math.min(1, this.shake + amount); }

  // ---------------------------------------------------------------- frame

  update(dt) {
    this.time += dt;
    for (const p of this.particles) {
      p.age += dt;
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const f of this.flyers) f.t += dt;
    const landed = this.flyers.filter((f) => f.t >= f.dur);
    this.flyers = this.flyers.filter((f) => f.t < f.dur);
    for (const f of landed) {
      this.celebrate(f.ghostId);
      if (this.onLanded) this.onLanded(f);
    }
    for (const m of this.marks) m.t += dt;
    this.marks = this.marks.filter((m) => m.keep || m.t < m.dur);
    for (const p of this.puffs) p.t += dt;
    this.puffs = this.puffs.filter((p) => p.t < p.dur);
    if (this.lantern) {
      this.lantern.t += dt;
      if (this.lantern.t > this.lantern.dur) this.lantern = null;
    }
    for (const s of this.ghostSpots) {
      if (s.swirl > 0) s.swirl = Math.max(0, s.swirl - dt * 0.9);
      s.mood += ((s.swirl > 0 ? 1 : 0.42 + this.progress * 0.5) - s.mood) * Math.min(1, dt * 3);
    }
    const box = this.box();
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y < -10) { d.y = box.h + 10; d.x = Math.random() * box.w; }
      if (d.x < -10) d.x = box.w + 10;
      if (d.x > box.w + 10) d.x = -10;
    }
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  // A cached soft radial glow, so no shadowBlur is ever needed.
  glow(col, size) {
    const key = `${col}|${size}`;
    let g = this.glowCache.get(key);
    if (g) return g;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size / 2);
    grad.addColorStop(0, alpha(col, 0.85));
    grad.addColorStop(0.45, alpha(col, 0.3));
    grad.addColorStop(1, alpha(col, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    this.glowCache.set(key, c);
    if (this.glowCache.size > 24) this.glowCache.delete(this.glowCache.keys().next().value);
    return c;
  }

  draw() {
    const c = this.ctx;
    const { w, h } = this.view;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#0d0a14';
    c.fillRect(0, 0, w, h);
    if (this.diff) this.drawDiff();
    else if (this.scene) this.drawScene();
  }

  // Set up the world transform for one panel and run `body`.
  inPanel(panelIndex, body) {
    const c = this.ctx;
    const rect = this.panels()[panelIndex];
    const s = this.scale;
    const shakeX = this.shake ? (Math.random() - 0.5) * 7 * this.shake : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * 7 * this.shake : 0;
    c.save();
    c.beginPath();
    c.rect(rect.x, rect.y, rect.w, rect.h);
    c.clip();
    c.translate(rect.x + rect.w / 2 + shakeX, rect.y + rect.h / 2 + shakeY);
    c.scale(s, s);
    c.translate(-this.camera.cx, -this.camera.cy);
    body(c, rect, s);
    c.restore();
  }

  drawScene() {
    const scene = this.scene;
    this.inPanel(0, (c) => {
      const plate = this.plate;
      if (plate) {
        c.imageSmoothingQuality = 'high';
        c.drawImage(plate.canvas, 0, 0, plate.canvas.width / plate.scale, plate.canvas.height / plate.scale);
      }
      // the things still hidden
      for (const t of scene.targets) {
        if (t.found) continue;
        const patch = this.patches.get(t);
        if (!patch) { drawItem(c, t.id, t.w, t.h); continue; }
        c.save();
        c.translate(t.x - patch.m, t.y - patch.m);
        c.drawImage(patch.canvas, 0, 0, patch.canvas.width / patch.scale, patch.canvas.height / patch.scale);
        c.restore();
      }
      this.drawWarmth(c);
      this.drawLantern(c);
      this.drawGhosts(c);
      this.drawFlyers(c);
      this.drawMarks(c);
      this.drawPuffs(c);
      this.drawDust(c);
      this.drawParticles(c);
      this.drawReticle(c);
    });
  }

  drawDiff() {
    const plates = this.platesDiff;
    for (let i = 0; i < 2; i++) {
      this.inPanel(i, (c) => {
        const plate = i === 0 ? plates?.left : plates?.right;
        if (plate) c.drawImage(plate.canvas, 0, 0, plate.canvas.width / plate.scale, plate.canvas.height / plate.scale);
        this.drawWarmth(c);
        this.drawLantern(c);
        this.drawMarks(c);
        this.drawPuffs(c);
        this.drawDust(c);
        this.drawParticles(c);
        this.drawReticle(c);
      });
    }
    // the dividing line between the two pictures
    const c = this.ctx;
    const [a] = this.panels();
    c.save();
    c.fillStyle = '#1b1526';
    c.fillRect(0, a.h, this.view.w, 6);
    c.restore();
  }

  // The room brightens as the list shrinks: a warm wash instead of a re-bake.
  drawWarmth(c) {
    const box = this.box();
    const amount = this.progress * 0.5 + this.light * 0.18;
    if (amount <= 0.01) return;
    const pal = (this.scene || this.diff).palette;
    const g = c.createRadialGradient(box.w * 0.5, box.h * 0.36, Math.min(box.w, box.h) * 0.1, box.w * 0.5, box.h * 0.4, Math.max(box.w, box.h) * 0.7);
    g.addColorStop(0, alpha(pal.glow, 0.17 * amount));
    g.addColorStop(1, alpha(pal.glow, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, box.w, box.h);
  }

  drawLantern(c) {
    const l = this.lantern;
    if (!l) return;
    const k = Math.min(1, l.t * 3) * (1 - Math.max(0, (l.t - (l.dur - 0.7)) / 0.7));
    const pulse = 1 + Math.sin(l.t * 4) * 0.05;
    const size = l.r * 2.6 * pulse;
    const g = this.glow('#ffe49a', 256);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.5 * k;
    c.drawImage(g, l.x - size / 2, l.y - size / 2, size, size);
    c.restore();
    c.save();
    c.globalAlpha = 0.55 * k;
    c.strokeStyle = '#ffe49a';
    c.lineWidth = 3 / this.scale * 2;
    c.setLineDash([14, 12]);
    c.lineDashOffset = -l.t * 26;
    c.beginPath();
    c.arc(l.x, l.y, l.r * pulse, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  drawGhosts(c) {
    for (const s of this.ghostSpots) {
      const bob = Math.sin(this.time * 1.5 + s.phase) * s.size * 0.06;
      const swirl = s.swirl > 0 ? (1 - s.swirl) : 0;
      c.save();
      c.translate(s.x, s.y + bob);
      if (s.swirl > 0) {
        c.rotate(Math.sin(swirl * Math.PI * 3) * 0.22 * s.swirl);
        const pop = 1 + Math.sin(swirl * Math.PI) * 0.12 * s.swirl;
        c.scale(pop, pop);
      }
      c.translate(-s.size / 2, -s.size * 0.6);
      drawGhost(c, s.ghost, s.size, s.size * 1.2, this.time + s.phase, s.mood);
      c.restore();
    }
  }

  drawFlyers(c) {
    for (const f of this.flyers) {
      const t = Math.min(1, f.t / f.dur);
      const e = t * t * (3 - 2 * t);
      const x = f.from.x + (f.to.x - f.from.x) * e;
      const y = f.from.y + (f.to.y - f.from.y) * e - Math.sin(e * Math.PI) * (120 + Math.abs(f.arc));
      const k = 1 - e * 0.55;
      c.save();
      c.translate(x, y);
      c.rotate(f.spin * e);
      c.globalAlpha = 1 - e * 0.25;
      const g = this.glow('#fff2c0', 128);
      c.globalAlpha = (1 - e) * 0.5;
      c.drawImage(g, -f.w * 0.9, -f.h * 0.9, f.w * 1.8, f.h * 1.8);
      c.globalAlpha = 1 - e * 0.2;
      c.translate(-f.w * k * 0.5, -f.h * k * 0.5);
      c.scale(k, k);
      drawItem(c, f.id, f.w, f.h);
      c.restore();
      if (!this.reduced && Math.random() < 0.5 && this.particles.length < MAX_PARTICLES) {
        this.particles.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: 20 + Math.random() * 40, life: 0.45, age: 0, col: '#ffe9a8', r: 1.6 + Math.random() * 1.8 });
      }
    }
  }

  drawMarks(c) {
    for (const m of this.marks) {
      const t = Math.min(1, m.t / m.dur);
      if (m.keep) {
        c.save();
        c.globalAlpha = 0.9;
        c.strokeStyle = '#7fe0a8';
        c.lineWidth = 5 / this.scale * 1.6;
        c.beginPath();
        c.arc(m.x, m.y, m.r * (1 + (1 - Math.min(1, m.t * 3)) * 0.4), 0, Math.PI * 2);
        c.stroke();
        c.restore();
        continue;
      }
      const e = 1 - t;
      c.save();
      c.globalAlpha = e * 0.9;
      c.strokeStyle = '#ffe9a8';
      c.lineWidth = 4 / this.scale * 1.6;
      c.beginPath();
      c.arc(m.x, m.y, m.r * (0.6 + t * 1.1), 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  }

  drawPuffs(c) {
    for (const p of this.puffs) {
      const t = Math.min(1, p.t / p.dur);
      const r = p.r * (1 + t * 3.4);
      const g = this.glow('#cfc8dd', 128);
      c.save();
      c.globalAlpha = (1 - t) * 0.5;
      c.drawImage(g, p.x - r, p.y - r, r * 2, r * 2);
      c.restore();
    }
  }

  drawDust(c) {
    if (!this.dust.length) return;
    c.save();
    c.fillStyle = '#fff6d8';
    for (const d of this.dust) {
      c.globalAlpha = d.a * (0.4 + this.progress * 0.5);
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  drawParticles(c) {
    if (!this.particles.length) return;
    c.save();
    for (const p of this.particles) {
      const k = 1 - p.age / p.life;
      c.globalAlpha = Math.max(0, k);
      c.fillStyle = p.col;
      c.beginPath();
      c.arc(p.x, p.y, p.r * k, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  drawReticle(c) {
    const r = this.reticle;
    if (!r) return;
    const size = 26 / this.scale * 1.4;
    c.save();
    c.strokeStyle = '#ffe9a8';
    c.lineWidth = 3 / this.scale * 1.4;
    c.globalAlpha = 0.9;
    c.beginPath();
    c.arc(r.x, r.y, size, 0, Math.PI * 2);
    c.stroke();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      c.beginPath();
      c.moveTo(r.x + dx * size * 1.3, r.y + dy * size * 1.3);
      c.lineTo(r.x + dx * size * 0.6, r.y + dy * size * 0.6);
      c.stroke();
    }
    c.restore();
  }

  // The little drawing used on the item list and the album.
  static iconCanvas(id, size, { silhouette = false, dpr = 1, fill = '#2b2336' } = {}) {
    const px = Math.round(size * dpr);
    const c = makeCanvas(px, px);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    // Keep the thing's own proportions inside a square icon.
    const item = ITEM[id] || { w: 1, h: 1 };
    const pad = size * 0.08;
    const avail = size - pad * 2;
    const k = Math.min(avail / item.w, avail / item.h);
    const w = item.w * k;
    const h = item.h * k;
    ctx.translate((size - w) / 2, (size - h) / 2);
    if (silhouette) drawSilhouette(ctx, id, w, h, fill);
    else drawItem(ctx, id, w, h);
    return c;
  }
}

export { mixHex, shade };
