// All the drawing. Reads world state, never changes it.
//
// The scene is drawn in world metres through one canvas transform; the sky and
// the far hills are drawn in screen space first so parallax is a cheap offset.

import {
  bakeCloud, bakeColumn, bakeDrop, bakeHazard, bakeHills, bakeLetter, bakeMailbox,
  bakePlane, bakeRainCloud, bakeRing, bakeSky, bakeSun, bakeTuft, bakeVent, draw, SCENERY,
} from './sprites.js';
import { CRUISE } from './endless.js';
import { GREEN_AFTER, PAD_BEFORE } from './world.js';
import { hash01 } from './rng.js';
import { sourceBounds } from './wind.js';

export const VIEW_W = 76;            // metres across the screen at zoom 1
const MAX_PARTICLES = 190;
const TRAIL = 46;
const SOAK_STEPS = 4;
const TAU = Math.PI * 2;
// The paper is drawn larger than it collides: a generous, readable hero.
const PLANE_SCALE = 1.5;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.camera = { x: 0, y: 0, zoom: 1, ready: false, shake: 0 };
    this.particles = [];
    this.trail = [];
    this.time = 0;
    this.peek = false;
    this.scene = null;
    this.region = null;
    this.flash = 0;
    this.sprites = {};
    this.planes = [];
    this.dropCache = new Map();
    this.hazardCache = new Map();
    this.letter = null;
    this.flyers = [];        // letters flying to a window
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.2);
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.pxW = width;
    this.pxH = height;
  }

  setReduced(on) {
    this.reduced = on;
  }

  /** Bake everything this region and this plane need. Called when a run starts. */
  setScene(scene, region, fold, paper) {
    this.scene = scene;
    this.region = region;
    this.camera.ready = false;
    this.camera.shake = 0;
    this.camera.zoom = 1;
    this.particles.length = 0;
    this.trail.length = 0;
    this.flyers.length = 0;
    this.dropCache.clear();
    this.hazardCache.clear();
    const key = `${fold.id}:${paper.id}`;
    if (this.planeKey !== key) {
      this.planeKey = key;
      this.planes = [];
      for (let i = 0; i < SOAK_STEPS; i += 1) {
        this.planes.push(bakePlane(fold, paper, { soak: i / (SOAK_STEPS - 1) }));
      }
    }
    if (this.skyKey !== region.id) {
      this.skyKey = region.id;
      this.sprites.sky = bakeSky(region.sky);
      this.sprites.sun = bakeSun(region.accent);
      const snow = region.id === 'peaks' ? '#f4faff' : null;
      const peaky = region.id === 'peaks';
      this.sprites.far = bakeHills(fadeToSky(region.land[1], region.sky[0], 0.68), 11, { width: 1200, height: 230, jag: peaky ? 1.1 : 0.7, snow });
      this.sprites.near = bakeHills(fadeToSky(region.land[1], region.sky[1], 0.38), 23, { width: 1024, height: 190, jag: peaky ? 0.85 : 0.55, snow });
      this.sprites.mid = bakeHills(fadeToSky(region.land[1], region.sky[2], 0.1), 41, { width: 880, height: 150, jag: 0.45 });
      this.sprites.clouds = [0, 1, 2, 3].map((i) => bakeCloud(i * 17 + 3));
      this.sprites.column = this.sprites.column || bakeColumn();
      this.sprites.rain = this.sprites.rain || bakeRainCloud();
      this.sprites.ring = this.sprites.ring || bakeRing(false);
      this.sprites.ringTaken = this.sprites.ringTaken || bakeRing(true);
      // Two variants of each kind so a hillside does not look stamped out.
      const mix = SCENERY[region.id] || SCENERY.town;
      this.sprites.tuft = [];
      this.sprites.tuftPick = [];
      let roll = 0;
      mix.forEach(([kind, share], i) => {
        const from = this.sprites.tuft.length;
        this.sprites.tuft.push(bakeTuft(kind, i * 13 + 2), bakeTuft(kind, i * 13 + 91));
        roll += share;
        this.sprites.tuftPick.push({ upTo: roll, from });
      });
      this.letter = this.letter || bakeLetter();
    }
    const vent = { town: 'chimney', cliffs: 'warmrock', forest: 'campfire', lake: 'shoal', peaks: 'warmrock' }[region.id];
    if (this.ventKey !== vent) {
      this.ventKey = vent;
      this.sprites.vent = bakeVent(vent);
    }
    this.sprites.boxOpen = this.sprites.boxOpen || bakeMailbox(false);
    this.sprites.boxFlag = this.sprites.boxFlag || bakeMailbox(true);
  }

  setPeek(on) {
    this.peek = !!on;
  }

  // ------------------------------------------------------------------ camera

  updateCamera(world, dt, follow) {
    const cam = this.camera;
    const plane = world.plane;
    const viewH = this.viewHeight(cam.zoom);
    const clearance = world.groundAt(plane.x) - plane.y;
    const speed = Math.hypot(plane.vx, plane.vy);
    const wantZoom = 1
      + clamp((speed - 15) / 32, 0, 0.22)
      + clamp((clearance - 16) / 90, 0, 0.5);
    cam.zoom = lerp(cam.zoom, wantZoom, 1 - Math.exp(-dt * 2.2));
    if (!follow) return;
    const aheadX = clamp(plane.vx * 0.55, 0, 16);
    const targetX = plane.x + aheadX + VIEW_W * cam.zoom * 0.1;
    const targetY = plane.y + clamp(clearance * 0.42, -6, viewH * 0.3) + clamp(plane.vy * 0.25, -5, 7);
    if (!cam.ready) {
      cam.x = targetX;
      cam.y = targetY;
      cam.ready = true;
    } else {
      const ease = 1 - Math.exp(-dt * 5.5);
      cam.x = lerp(cam.x, targetX, ease);
      cam.y = lerp(cam.y, targetY, ease);
    }
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 2.4);
  }

  viewHeight(zoom = this.camera.zoom) {
    return VIEW_W * zoom * (this.pxH / this.pxW);
  }

  // ------------------------------------------------------------------ events

  handleEvents(events) {
    for (const event of events) {
      switch (event.type) {
        case 'ring':
          this.burst(event.x, event.y, 14, ['#ffe9a8', '#9be8ff', '#ffffff'], 7);
          break;
        case 'letter':
          this.flyers.push({ x: event.x - 6, y: event.y + 4, tx: event.x, ty: event.y, t: 0 });
          this.burst(event.x, event.y, 12, ['#ffd166', '#ff9ec4', '#ffffff'], 5);
          this.flash = 0.2;
          break;
        case 'snap':
          this.burst(event.x, event.y, this.reduced ? 5 : 14, ['#ffffff', '#ffe9a8'], 9, 'spark');
          break;
        case 'thermal':
          this.burst(event.x, event.y, 8, ['#ffe0a8', '#fff6d8'], 5, 'warm');
          break;
        case 'land':
          this.burst(event.x, event.y - 1, event.soft ? 10 : 18, event.soft ? ['#ffffff', '#cdf0ff'] : ['#e8dcc4', '#c9b893'], event.soft ? 4 : 8, 'dust');
          if (!event.soft && !this.reduced) this.camera.shake = 0.5;
          break;
        case 'fail':
          if (event.outcome === 'water') this.burst(event.x, event.y, 22, ['#bfe6ff', '#ffffff', '#86c8ef'], 9, 'splash');
          else this.burst(event.x, event.y, 16, ['#e8dcc4', '#fff0c2'], 7, 'dust');
          if (!this.reduced) this.camera.shake = 0.7;
          break;
        default:
          break;
      }
    }
  }

  burst(x, y, count, colors, speed, kind = 'puff') {
    const n = this.reduced ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i += 1) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const a = (i / n) * TAU + Math.random();
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (kind === 'warm' ? 3 : 0),
        life: 0,
        max: kind === 'spark' ? 0.5 : 0.95,
        r: kind === 'dust' ? 0.9 : 0.55,
        color: colors[i % colors.length],
        kind,
      });
    }
  }

  stepParticles(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.max) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'warm' ? -4 : 11) * dt;
      p.vx *= 1 - dt * 1.6;
    }
    for (let i = this.flyers.length - 1; i >= 0; i -= 1) {
      const f = this.flyers[i];
      f.t += dt * 2.6;
      if (f.t >= 1) this.flyers.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------- frame

  frame(world, dt, { follow = true, dive = false } = {}) {
    this.time += dt;
    this.updateCamera(world, dt, follow);
    this.stepParticles(dt);
    this.pushTrail(world, dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);

    const ctx = this.ctx;
    const cam = this.camera;
    const scale = this.pxW / (VIEW_W * cam.zoom);
    const viewH = this.viewHeight();
    const shake = cam.shake > 0 ? cam.shake : 0;
    const sx = shake ? (Math.random() - 0.5) * shake * 10 : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * 10 : 0;
    const left = cam.x - VIEW_W * cam.zoom / 2;
    const top = cam.y - viewH / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackdrop(world, left, top, scale);

    ctx.setTransform(scale, 0, 0, scale, -left * scale + sx, -top * scale + sy);
    const x0 = left - 8;
    const x1 = left + VIEW_W * cam.zoom + 8;
    this.drawTerrain(world, x0, x1, top, viewH);
    this.drawAir(world, x0, x1, top, viewH);
    this.drawDrops(world, x0, x1);
    this.drawHazards(world, x0, x1);
    this.drawGoal(world, x0, x1);
    this.drawRings(world, x0, x1);
    this.drawTrail(world);
    this.drawParticles();
    this.drawPlane(world, dive);
    if (this.peek) this.drawPeek(world, x0, x1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 246, 214, ${this.flash * 0.3})`;
      ctx.fillRect(0, 0, this.pxW, this.pxH);
    }
  }

  pushTrail(world, dt) {
    const plane = world.plane;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(plane.x - last.x, plane.y - last.y) > 0.8) {
      this.trail.push({ x: plane.x, y: plane.y, t: this.time });
      if (this.trail.length > TRAIL) this.trail.shift();
    }
    void dt;
  }

  // --------------------------------------------------------------- backdrop

  /**
   * Sky, sun, far ridges and clouds, all drawn in screen space. Every layer
   * moves with the camera by its own fraction, so the distance reads and the
   * ridges always sit behind the real ground rather than on top of it.
   */
  drawBackdrop(world, left, top, scale) {
    const ctx = this.ctx;
    const cam = this.camera;
    const sky = this.sprites.sky;
    ctx.drawImage(sky.img, 0, 0, sky.w, sky.h, 0, 0, this.pxW, this.pxH);

    // The valley floor near the camera is what every far layer is pinned to.
    const groundY = world.terrain.heightAt(cam.x);
    const place = (worldY, k) => this.pxH / 2 + (worldY - cam.y) * k * scale;

    const sun = this.sprites.sun;
    const sunW = this.pxH * 0.5;
    ctx.drawImage(sun.img, this.pxW * 0.74 - sunW / 2, place(groundY - 150, 0.06) - sunW / 2, sunW, sunW);

    // Each band's bottom edge sits on the real ground line, so the near ground
    // always hides it; only the ridge height and the drift speed say how far
    // away it is.
    const floor = place(groundY, 1);
    this.drawHillBand(this.sprites.far, cam.x * 0.12 * scale, floor + 4, this.pxH * 0.4);
    this.drawHillBand(this.sprites.near, cam.x * 0.28 * scale, floor + 12, this.pxH * 0.28);
    this.drawHillBand(this.sprites.mid, cam.x * 0.55 * scale, floor + 20, this.pxH * 0.16);

    // A few clouds, drifting.
    const clouds = this.sprites.clouds;
    for (let i = 0; i < 12; i += 1) {
      const sprite = clouds[i % clouds.length];
      const span = this.pxW * 2.6;
      const drift = this.time * (5 + hash01(i, 9) * 9);
      const x = ((hash01(i, 5) * span + drift - cam.x * 0.5 * scale) % span + span) % span - this.pxW * 0.4;
      const y = place(groundY - 26 - hash01(i, 13) * 135, 0.45 + hash01(i, 23) * 0.2);
      const w = this.pxH * (0.22 + hash01(i, 17) * 0.16);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(sprite.img, x, y, w, w * sprite.img.height / sprite.img.width);
      ctx.globalAlpha = 1;
    }
    void left;
    void top;
  }

  /**
   * Tile one baked band so its bottom edge lands on `bottom`, then flood the
   * same colour on down the screen: the real ground is drawn over the top, so
   * no gap can open up where the valley falls away.
   */
  drawHillBand(band, offset, bottom, height) {
    const ctx = this.ctx;
    const tileW = height * (band.img.width / band.img.height);
    let x = -(((offset % tileW) + tileW) % tileW);
    while (x < this.pxW) {
      ctx.drawImage(band.img, x, bottom - height, tileW, height);
      x += tileW - 1;
    }
    if (bottom < this.pxH) {
      ctx.fillStyle = band.color;
      ctx.fillRect(0, bottom - 1, this.pxW, this.pxH - bottom + 2);
    }
  }

  // ---------------------------------------------------------------- terrain

  drawTerrain(world, x0, x1, top, viewH) {
    const ctx = this.ctx;
    const terrain = world.terrain;
    const region = this.region;
    const bottom = top + viewH + 20;
    const step = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += step) ctx.lineTo(x, terrain.heightAt(x));
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    ctx.fillStyle = region.land[1];
    ctx.fill();

    // A lighter cap band along the surface, so the ground reads as grass.
    ctx.beginPath();
    ctx.moveTo(x0, terrain.heightAt(x0) + 3.2);
    for (let x = x0; x <= x1; x += step) ctx.lineTo(x, terrain.heightAt(x));
    for (let x = x1; x >= x0; x -= step) ctx.lineTo(x, terrain.heightAt(x) + 3.2);
    ctx.closePath();
    ctx.fillStyle = region.land[0];
    ctx.fill();

    // Water spans get their own flat fill and a few shimmer lines.
    for (let i = 0; i < terrain.nodes.length - 1; i += 1) {
      const a = terrain.nodes[i];
      const b = terrain.nodes[i + 1];
      if (a.kind !== 'water' || b.x < x0 || a.x > x1) continue;
      const from = Math.max(x0, a.x);
      const to = Math.min(x1, b.x);
      ctx.fillStyle = 'rgba(96, 164, 214, 0.92)';
      ctx.fillRect(from, a.y, to - from, bottom - a.y);
      ctx.fillStyle = 'rgba(200, 236, 255, 0.5)';
      for (let s = 0; s < 7; s += 1) {
        const lx = from + ((s * 23 + this.time * 5) % Math.max(1, to - from));
        ctx.fillRect(lx, a.y + 1.4 + (s % 3) * 2.4, 5.5, 0.5);
      }
    }

    // Tufts, flowers and pebbles on the surface, same every time you pass.
    const tufts = this.sprites.tuft;
    const first = Math.floor(x0 / 6) * 6;
    for (let x = first; x <= x1; x += 6) {
      if (terrain.kindAt(x) === 'water') continue;
      const roll = hash01(x, 3);
      let slot = this.sprites.tuftPick[this.sprites.tuftPick.length - 1];
      for (const entry of this.sprites.tuftPick) {
        if (roll <= entry.upTo) {
          slot = entry;
          break;
        }
      }
      const pick = slot.from + (hash01(x, 29) < 0.5 ? 0 : 1);
      const y = terrain.heightAt(x);
      if (y > bottom + 24 || y < top - 24) continue;
      draw(ctx, tufts[pick], x + hash01(x, 7) * 4, y + 0.4, 0.82 + hash01(x, 11) * 0.42);
    }
  }

  // -------------------------------------------------------------------- air

  drawAir(world, x0, x1, top, viewH) {
    const ctx = this.ctx;
    const bottom = top + viewH;
    for (const source of world.scene.air) {
      const box = sourceBounds(source);
      if (box.x1 < x0 || box.x0 > x1 || box.y0 > bottom || box.y1 < top) continue;
      switch (source.t) {
        case 'up':
        case 'ridge': {
          const column = this.sprites.column;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(column.img, source.x - source.w, source.y - source.h, source.w * 2, source.h);
          ctx.globalAlpha = 1;
          // Something at the bottom making the warm air: a chimney, a campfire,
          // sun-baked rock, a warm shoal.
          if (source.t === 'up') draw(ctx, this.sprites.vent, source.x, world.groundAt(source.x) + 0.4, 1);
          // Rising motes make the direction obvious.
          const motes = this.reduced ? 4 : 10;
          for (let i = 0; i < motes; i += 1) {
            const phase = (this.time * 0.22 + i / motes) % 1;
            const y = source.y - phase * source.h;
            const sway = Math.sin(phase * 7 + i) * source.w * 0.35;
            ctx.fillStyle = `rgba(255, 232, 178, ${0.8 * (1 - phase)})`;
            ctx.beginPath();
            ctx.arc(source.x + sway, y, 0.55 + phase * 1.1, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'sun': {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#fff2c2';
          ctx.beginPath();
          ctx.ellipse(source.x, source.y, source.w, source.h, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'band':
        case 'gust': {
          const back = source.s < 0;
          ctx.strokeStyle = back ? 'rgba(180, 206, 236, 0.6)' : 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 0.4;
          const streaks = this.reduced ? 4 : 8;
          for (let i = 0; i < streaks; i += 1) {
            const span = source.w * 2;
            const speed = 16 * (back ? -1 : 1);
            const off = ((this.time * speed + i * span / streaks) % span + span) % span;
            const sxp = source.x - source.w + off;
            const syp = source.y - source.h * 0.6 + (i / streaks) * source.h * 1.2;
            ctx.beginPath();
            ctx.moveTo(sxp, syp);
            ctx.lineTo(sxp + (back ? -7 : 7), syp - 0.6);
            ctx.stroke();
          }
          break;
        }
        case 'rain': {
          const cloud = this.sprites.rain;
          draw(ctx, cloud, source.x, source.y - source.h * 0.75, source.w * 2 / cloud.w);
          ctx.strokeStyle = 'rgba(176, 212, 242, 0.75)';
          ctx.lineWidth = 0.3;
          const drops = this.reduced ? 8 : 20;
          for (let i = 0; i < drops; i += 1) {
            const dx = source.x - source.w + hash01(i, 3) * source.w * 2;
            const fall = (this.time * 34 + hash01(i, 9) * 90) % (source.h * 1.7);
            const dy = source.y - source.h * 0.55 + fall;
            ctx.beginPath();
            ctx.moveTo(dx, dy);
            ctx.lineTo(dx - 0.5, dy + 2.2);
            ctx.stroke();
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ things

  dropSprite(world, drop, taken) {
    const key = `${drop.id}:${taken ? 1 : 0}`;
    let sprite = this.dropCache.get(key);
    if (!sprite) {
      const ground = drop.ground ?? world.groundAt(drop.x);
      sprite = bakeDrop(this.region.drop, ground - drop.y + 2.4, taken, hash01(drop.x, 5) * 1000);
      this.dropCache.set(key, sprite);
    }
    return sprite;
  }

  drawDrops(world, x0, x1) {
    const ctx = this.ctx;
    for (const drop of world.scene.drops) {
      if (drop.x < x0 - 12 || drop.x > x1 + 12) continue;
      const taken = world.collected.has(drop.id);
      const sprite = this.dropSprite(world, drop, taken);
      const ground = drop.ground ?? world.groundAt(drop.x);
      draw(ctx, sprite, drop.x, ground + 0.6, 1);
      if (!taken) {
        // A soft marker so the window is findable from a long way off.
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
        ctx.strokeStyle = `rgba(255, 226, 150, ${0.35 + pulse * 0.35})`;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, 7 + pulse * 1.6, 0, TAU);
        ctx.stroke();
      }
    }
    for (const flyer of this.flyers) {
      const t = flyer.t;
      const x = lerp(flyer.x, flyer.tx, t);
      const y = lerp(flyer.y, flyer.ty, t) - Math.sin(t * Math.PI) * 3;
      draw(ctx, this.letter, x, y, 1.4, Math.sin(t * 9) * 0.3, 1 - t * 0.4);
    }
  }

  hazardSprite(hazard, world) {
    const key = `${hazard.kind}:${Math.round(hazard.x)}`;
    let sprite = this.hazardCache.get(key);
    if (!sprite) {
      const ground = world.groundAt(hazard.x);
      sprite = bakeHazard(hazard.kind, ground - hazard.y + (hazard.r || 2) + 2);
      this.hazardCache.set(key, sprite);
    }
    return sprite;
  }

  drawHazards(world, x0, x1) {
    const ctx = this.ctx;
    for (const hazard of world.scene.hazards) {
      const half = hazard.kind === 'line' ? hazard.w : hazard.r;
      if (hazard.x + half < x0 - 10 || hazard.x - half > x1 + 10) continue;
      if (hazard.kind === 'line') {
        // A cable with a post at each end, so it reads as strung, not floating.
        ctx.strokeStyle = '#6b5f52';
        ctx.lineWidth = 0.34;
        ctx.beginPath();
        ctx.moveTo(hazard.x - hazard.w, hazard.y - 1.2);
        ctx.quadraticCurveTo(hazard.x, hazard.y + 1.4, hazard.x + hazard.w, hazard.y - 1.2);
        ctx.stroke();
        for (const side of [-1, 1]) {
          const px = hazard.x + side * hazard.w;
          ctx.beginPath();
          ctx.moveTo(px, hazard.y - 1.2);
          ctx.lineTo(px, world.groundAt(px));
          ctx.strokeStyle = '#7d6e5c';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
        // Washing, bunting or ice on the wire: something to read it by.
        for (let i = -2; i <= 2; i += 1) {
          const t = i / 2.4;
          const px = hazard.x + t * hazard.w * 0.8;
          const py = hazard.y + (1 - t * t) * 1.1;
          ctx.fillStyle = ['#ff9ec4', '#9be8ff', '#ffe08a', '#c7f0a8', '#ffffff'][(i + 2) % 5];
          ctx.fillRect(px - 0.7, py, 1.4, 2.1);
        }
      } else if (hazard.kind === 'birds') {
        const sway = Math.sin(this.time * 1.2 + hazard.x) * 1.6;
        draw(ctx, this.hazardSprite(hazard, world), hazard.x + sway, hazard.y, 1);
      } else {
        const ground = world.groundAt(hazard.x);
        draw(ctx, this.hazardSprite(hazard, world), hazard.x, ground + 0.5, 1);
      }
    }
  }

  drawRings(world, x0, x1) {
    const ctx = this.ctx;
    for (const ring of world.scene.rings) {
      if (ring.x + ring.r < x0 || ring.x - ring.r > x1) continue;
      const taken = world.collected.has(ring.id);
      const sprite = taken ? this.sprites.ringTaken : this.sprites.ring;
      const bob = taken ? 0 : Math.sin(this.time * 1.6 + ring.x * 0.1) * 0.5;
      draw(ctx, sprite, ring.x, ring.y + bob, (ring.r * 2 + 2.4) / sprite.w, 0, taken ? 0.6 : 1);
    }
  }

  drawGoal(world, x0, x1) {
    const scene = world.scene;
    if (!scene.mailbox) {
      this.drawEndlessMarkers(world, x0, x1);
      return;
    }
    const ctx = this.ctx;
    const box = scene.mailbox;
    const from = box.x - PAD_BEFORE;
    const to = box.x + GREEN_AFTER;
    if (to > x0 && from < x1) {
      // The mown green: a lighter stripe with a low fence along the back.
      ctx.fillStyle = 'rgba(190, 236, 150, 0.85)';
      ctx.fillRect(Math.max(from, x0 - 4), box.y, Math.min(to, x1 + 4) - Math.max(from, x0 - 4), 3.4);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 0.3;
      for (let x = Math.max(from, x0); x < Math.min(to, x1); x += 9) {
        ctx.beginPath();
        ctx.moveTo(x, box.y + 0.5);
        ctx.lineTo(x + 4.5, box.y + 0.5);
        ctx.stroke();
      }
    }
    if (box.x > x0 - 20 && box.x < x1 + 20) {
      const sprite = world.status === 'done' ? this.sprites.boxFlag : this.sprites.boxOpen;
      draw(ctx, sprite, box.x, box.y + 0.4, 1);
      if (world.status === 'flying') {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(box.x, box.y - 3, 7 + pulse, 0, TAU);
        ctx.stroke();
      }
    }
  }

  /** Endless has no mailbox: distance posts mark every 100 m instead. */
  drawEndlessMarkers(world, x0, x1) {
    const ctx = this.ctx;
    const first = Math.ceil(x0 / 100) * 100;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '1.9px ui-rounded, system-ui, sans-serif';
    for (let x = first; x <= x1; x += 100) {
      const y = world.groundAt(x);
      ctx.strokeStyle = '#d8c8a8';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 6);
      ctx.stroke();
      ctx.fillStyle = '#fff6e6';
      ctx.beginPath();
      ctx.roundRect(x - 0.2, y - 8.6, 7, 2.8, 0.5);
      ctx.fill();
      ctx.fillStyle = '#3a4a66';
      ctx.fillText(`${Math.round((x - world.startX) / 100) * 100}m`, x + 3.3, y - 7.2);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (world.scene.goal) {
      const gx = world.startX + world.scene.goal;
      if (gx > x0 && gx < x1) {
        const y = world.groundAt(gx);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y - CRUISE - 10);
        ctx.stroke();
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(gx, y - CRUISE - 10, 7, 4);
      }
    }
  }

  // -------------------------------------------------------------- the plane

  drawTrail(world) {
    const ctx = this.ctx;
    const list = this.trail;
    if (list.length < 3) return;
    const soaked = world.plane.soak;
    for (let i = 1; i < list.length; i += 1) {
      const t = i / list.length;
      ctx.globalAlpha = t * t * 0.42;
      ctx.fillStyle = soaked > 0.5 ? '#9fb4cf' : '#ffffff';
      ctx.beginPath();
      ctx.arc(list[i].x, list[i].y, 0.12 + t * 0.28, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const t = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        ctx.fillRect(p.x - p.r, p.y - 0.12, p.r * 2.4, 0.3);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + t), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPlane(world, dive) {
    const plane = world.plane;
    const index = Math.min(SOAK_STEPS - 1, Math.round(plane.soak * (SOAK_STEPS - 1)));
    const sprite = this.planes[index];
    const ctx = this.ctx;
    // A soft shadow on the ground keeps the height readable.
    const ground = world.groundAt(plane.x);
    const clearance = ground - plane.y;
    if (clearance > 0 && clearance < 70) {
      ctx.globalAlpha = 0.16 * (1 - clearance / 70);
      ctx.fillStyle = '#20304a';
      ctx.beginPath();
      ctx.ellipse(plane.x, ground - 0.3, 3.2, 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    draw(ctx, sprite, plane.x, plane.y, PLANE_SCALE, plane.pitch);
    if (dive && world.status === 'flying') {
      // Speed lines off the tail while the button is held.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 0.22;
      for (let i = 0; i < 3; i += 1) {
        const a = plane.pitch + (i - 1) * 0.12;
        const bx = plane.x - Math.cos(a) * 2;
        const by = plane.y - Math.sin(a) * 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - Math.cos(a) * 3.4, by - Math.sin(a) * 3.4);
        ctx.stroke();
      }
    }
  }

  /** `?peek`: the lazy glide line, the wind boxes and the collision radius. */
  drawPeek(world, x0, x1) {
    const ctx = this.ctx;
    const line = world.scene.line;
    if (line) {
      ctx.strokeStyle = 'rgba(255, 110, 180, 0.7)';
      ctx.lineWidth = 0.25;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 4) {
        const y = line.at(x);
        if (x === x0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120, 255, 180, 0.5)';
    ctx.lineWidth = 0.2;
    for (const source of world.scene.air) {
      const box = sourceBounds(source);
      if (box.x1 < x0 || box.x0 > x1) continue;
      ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    }
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
    for (const hazard of world.scene.hazards) {
      if (hazard.kind === 'line') {
        ctx.strokeRect(hazard.x - hazard.w, hazard.y - 1.4, hazard.w * 2, 2.8);
      } else {
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y, hazard.r, 0, TAU);
        ctx.stroke();
      }
    }
  }
}

/** Pull a land colour towards the sky so far hills read as far away. */
function fadeToSky(land, sky, amount) {
  const a = parseInt(land.slice(1), 16);
  const b = parseInt(sky.slice(1), 16);
  const ch = (shift) => Math.round((((a >> shift) & 255) * (1 - amount)) + (((b >> shift) & 255) * amount));
  const hex = (v) => v.toString(16).padStart(2, '0');
  return `#${hex(ch(16))}${hex(ch(8))}${hex(ch(0))}`;
}
