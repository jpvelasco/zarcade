// All the drawing. Reads world state, never changes it.
//
// Everything is vector art computed at run time: parallax skies, tiles with
// grassy caps, Pip's squash and stretch, and a particle system for dust,
// sparkles and petals.

import { ZONES } from './levels.js';
import { TILE } from './tiles.js';
import { PETALS } from './world.js';

export const VIEW_W = 352;
export const VIEW_H = 198;

/** One-way platform colour per zone: vine, wet wood, weathered plank, ice pine. */
const PLANK = { meadow: '#c08a4e', caves: '#6f97ab', cliffs: '#b9744f', summit: '#dbe9ff' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Stable pseudo-random in 0..1 from two integers: used for texture. */
function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const TAU = Math.PI * 2;

/** Each of these owns its own path: chained arcs in one path get bridged. */
function fillCircle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function fillEllipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Rounds only the top two corners. Terrain tiles need this: rounding the
 * bottom would leave a notch where the sky shows through the tile below.
 */
function topRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const to = amount < 0 ? 0 : 255;
  const mix = Math.abs(amount);
  const r = Math.round(lerp((n >> 16) & 255, to, mix));
  const g = Math.round(lerp((n >> 8) & 255, to, mix));
  const b = Math.round(lerp(n & 255, to, mix));
  return `rgb(${r}, ${g}, ${b})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.camera = { x: VIEW_W / 2, y: VIEW_H / 2, shake: 0, ready: false, zoom: 1 };
    this.particles = [];
    this.pulses = new Map();  // mushrooms and flowers that were just touched
    this.time = 0;
    this.dustTimer = 0;
    this.blink = 0;
    this.peek = false;
    this.world = null;
    this.zone = ZONES[0];
    this.flash = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.scale = width / VIEW_W;
    this.viewH = height / this.scale;
  }

  setWorld(world) {
    this.world = world;
    this.zone = ZONES[world.level.zone];
    this.camera.ready = false;
    this.camera.shake = 0;
    this.particles.length = 0;
    this.pulses.clear();
    this.clouds = Array.from({ length: 9 }, (_, i) => ({
      x: hash(i, 7) * world.pixelWidth,
      y: 10 + hash(i, 13) * 90,
      s: 0.6 + hash(i, 19) * 1.1,
      speed: 2 + hash(i, 23) * 4,
    }));
    this.motes = Array.from({ length: 26 }, (_, i) => ({
      x: hash(i, 31) * VIEW_W * 2,
      y: hash(i, 37) * VIEW_H * 1.6,
      s: 0.7 + hash(i, 41) * 1.6,
      drift: 0.3 + hash(i, 43),
    }));
  }

  // ------------------------------------------------------------ camera

  updateCamera(dt, follow = true) {
    const world = this.world;
    const cam = this.camera;
    const viewW = VIEW_W / cam.zoom;
    const viewH = this.viewH / cam.zoom;
    const p = world.player;
    if (!follow) return;

    const aheadX = clamp(p.vx * 0.22, -46, 46);
    const targetX = p.x + p.w / 2 + aheadX;
    const targetY = p.y + p.h / 2 + clamp(p.vy * 0.06, -22, 34);

    if (!cam.ready) {
      cam.x = targetX;
      cam.y = targetY;
      cam.ready = true;
    } else {
      // A dead zone keeps small hops from moving the world around.
      const dzx = 14;
      const dzy = 22;
      const dx = targetX - cam.x;
      const dy = targetY - cam.y;
      const wantX = Math.abs(dx) > dzx ? cam.x + (dx - Math.sign(dx) * dzx) : cam.x;
      const wantY = Math.abs(dy) > dzy ? cam.y + (dy - Math.sign(dy) * dzy) : cam.y;
      const kx = 1 - Math.exp(-dt * 7);
      const ky = 1 - Math.exp(-dt * (p.onGround ? 6 : 4));
      cam.x = lerp(cam.x, wantX, kx);
      cam.y = lerp(cam.y, wantY, ky);
    }

    cam.x = world.pixelWidth <= viewW
      ? world.pixelWidth / 2
      : clamp(cam.x, viewW / 2, world.pixelWidth - viewW / 2);
    cam.y = world.pixelHeight <= viewH
      ? world.pixelHeight / 2
      : clamp(cam.y, viewH / 2, world.pixelHeight - viewH / 2);
    cam.shake = Math.max(0, cam.shake - dt * 26);
  }

  setPeek(on) {
    this.peek = on;
    if (!this.world) return;
    if (on) {
      const zx = VIEW_W / (this.world.pixelWidth + 24);
      const zy = this.viewH / (this.world.pixelHeight + 24);
      this.camera.zoom = Math.min(zx, zy);
      this.camera.ready = false;
    } else {
      this.camera.zoom = 1;
      this.camera.ready = false;
    }
  }

  // ------------------------------------------------------------ particles

  spawn(kind, x, y, count, extra = {}) {
    const limit = this.reduced ? Math.ceil(count / 3) : count;
    for (let i = 0; i < limit; i += 1) {
      const angle = extra.angle !== undefined ? extra.angle + (Math.random() - 0.5) * (extra.spread || 1) : Math.random() * Math.PI * 2;
      const speed = (extra.speed || 40) * (0.4 + Math.random() * 0.8);
      this.particles.push({
        kind,
        x: x + (Math.random() - 0.5) * (extra.jitter || 4),
        y: y + (Math.random() - 0.5) * (extra.jitter || 4),
        vx: Math.cos(angle) * speed + (extra.vx || 0),
        vy: Math.sin(angle) * speed + (extra.vy || 0),
        life: 0,
        max: (extra.life || 0.5) * (0.7 + Math.random() * 0.6),
        size: (extra.size || 2.4) * (0.6 + Math.random() * 0.8),
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
        color: extra.color || '#ffffff',
        gravity: extra.gravity === undefined ? 120 : extra.gravity,
      });
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
  }

  stepParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - dt * 1.4;
      p.rot += p.spin * dt;
    }
    for (const [key, pulse] of this.pulses) {
      pulse.t += dt;
      if (pulse.t > 1.2) this.pulses.delete(key);
    }
  }

  handleEvents(events) {
    const accent = this.zone.accent;
    for (const event of events) {
      switch (event.type) {
        case 'jump':
          this.spawn('dust', event.x + 5, event.y + 14, 5, { angle: Math.PI / 2, spread: 1.6, speed: 34, life: 0.32, color: '#ffffff', gravity: 40 });
          break;
        case 'double':
          this.spawn('sparkle', event.x + 5, event.y + 8, 10, { speed: 70, life: 0.45, color: accent, gravity: 30, size: 2 });
          break;
        case 'wallJump':
          this.spawn('dust', event.x + 5, event.y + 7, 8, { speed: 60, life: 0.35, color: '#ffffff', gravity: 60 });
          break;
        case 'land':
          this.spawn('dust', event.x + 5, event.y, event.hard ? 10 : 5, { angle: 0, spread: Math.PI, speed: event.hard ? 62 : 34, life: 0.36, color: '#ffffff', gravity: 30 });
          if (event.hard) this.camera.shake = this.reduced ? 0 : 2.6;
          break;
        case 'spring':
          this.spawn('sparkle', event.x, event.y, 14, { angle: -Math.PI / 2, spread: 2, speed: 110, life: 0.5, color: '#ffd7f0', gravity: 90 });
          this.pulses.set(`m${Math.round(event.x / TILE)},${Math.round(event.y / TILE)}`, { t: 0, kind: 'spring' });
          break;
        case 'seed':
          this.spawn('sparkle', event.x, event.y + 5, 6, { speed: 52, life: 0.34, color: '#ffe17d', gravity: -10, size: 1.8 });
          break;
        case 'acorn':
          this.spawn('sparkle', event.x, event.y + 6, 24, { speed: 95, life: 0.75, color: '#ffd166', gravity: 20, size: 2.4 });
          this.flash = 0.35;
          break;
        case 'checkpoint':
          this.spawn('petal', event.x, event.y + 6, 16, { speed: 65, life: 0.9, color: '#ff9ecb', gravity: 55 });
          break;
        case 'stomp':
          this.spawn('dust', event.x, event.y + 6, 10, { angle: 0, spread: Math.PI, speed: 70, life: 0.35, color: '#fff3c4', gravity: 90 });
          this.camera.shake = this.reduced ? 0 : 2;
          break;
        case 'break':
          this.spawn('chunk', event.x, event.y, 10, { speed: 70, life: 0.7, color: '#e8dcc2', gravity: 320, size: 2.6 });
          break;
        case 'gate':
          this.camera.shake = this.reduced ? 0 : 4;
          break;
        case 'hurt':
        case 'wilt':
          this.spawn('petal', event.x, event.y - 8, event.type === 'wilt' ? 20 : 10, { speed: 80, life: 1, color: '#ffc2dd', gravity: 90 });
          this.camera.shake = this.reduced ? 0 : 4.5;
          break;
        case 'goal':
          this.spawn('sparkle', event.x + 8, event.y + 8, 60, { speed: 150, life: 1.2, color: '#fff0b8', gravity: -10, size: 3 });
          this.flash = 0.6;
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------ frame

  frame(world, dt, { follow = true } = {}) {
    this.world = world || this.world;
    this.time += dt;
    this.blink = (this.blink + dt) % 4.6;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.stepParticles(dt);
    this.trailDust(dt);
    this.updateCamera(dt, follow);

    const ctx = this.ctx;
    const cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(this.scale, this.scale);

    const viewW = VIEW_W / cam.zoom;
    const viewH = this.viewH / cam.zoom;
    const shakeX = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    const shakeY = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    const left = cam.x - viewW / 2 + shakeX;
    const top = cam.y - viewH / 2 + shakeY;

    this.drawSky(ctx, left, top, viewW, viewH);
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-left, -top);
    this.drawWind(ctx);
    this.drawTiles(ctx, left, top, viewW, viewH);
    this.drawMovers(ctx);
    this.drawCollectibles(ctx);
    this.drawGoal(ctx);
    this.drawEnemies(ctx);
    this.drawPip(ctx);
    this.drawParticles(ctx);
    ctx.restore();
    this.drawWeather(ctx, left, top, viewW, viewH);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 250, 225, ${this.flash * 0.5})`;
      ctx.fillRect(0, 0, VIEW_W, this.viewH);
    }
    ctx.restore();
  }

  /** Running dust and wall-slide scuffs, spawned outside the event stream. */
  trailDust(dt) {
    const p = this.world?.player;
    if (!p) return;
    this.dustTimer -= dt;
    if (this.dustTimer > 0) return;
    if (p.onGround && Math.abs(p.vx) > 70) {
      this.dustTimer = 0.08;
      this.spawn('dust', p.x + p.w / 2 - Math.sign(p.vx) * 4, p.y + p.h, 1, {
        angle: Math.PI, spread: 1, speed: 18, life: 0.3, color: '#ffffff', gravity: -10, size: 1.8, jitter: 2,
      });
    } else if (p.wallSlide) {
      this.dustTimer = 0.07;
      this.spawn('dust', p.x + (p.wallDir > 0 ? p.w : 0), p.y + p.h * 0.5, 1, {
        speed: 20, life: 0.3, color: '#ffffff', gravity: 60, size: 1.6,
      });
    } else {
      this.dustTimer = 0.05;
    }
  }

  // ------------------------------------------------------------ background

  drawSky(ctx, left, top, viewW, viewH) {
    const zone = this.zone;
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, zone.sky[0]);
    grad.addColorStop(0.55, zone.sky[1]);
    grad.addColorStop(1, zone.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, this.viewH);

    const depth = this.world.pixelHeight;
    // The sun climbs as Pip climbs: the whole game is a sunrise.
    const climb = 1 - clamp(this.camera.y / Math.max(1, depth), 0, 1);
    const sunX = VIEW_W * 0.74 - left * 0.04;
    const sunY = this.viewH * (0.82 - climb * 0.5);
    if (zone.id !== 'caves') {
      const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 86);
      glow.addColorStop(0, 'rgba(255, 246, 214, 0.95)');
      glow.addColorStop(0.35, 'rgba(255, 216, 130, 0.45)');
      glow.addColorStop(1, 'rgba(255, 210, 140, 0)');
      ctx.fillStyle = glow;
      fillCircle(ctx, sunX, sunY, 86);
      ctx.fillStyle = '#fff6d2';
      fillCircle(ctx, sunX, sunY, 15);
    }

    if (zone.id === 'caves') {
      this.drawCaveBack(ctx, left, top);
    } else {
      this.drawClouds(ctx, left, top);
      this.drawHills(ctx, left, top);
    }
  }

  drawClouds(ctx, left, top) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    for (const cloud of this.clouds) {
      const x = ((cloud.x - left * 0.18 + this.time * cloud.speed) % (this.world.pixelWidth + 400)) - 60;
      const y = cloud.y - top * 0.1;
      const s = cloud.s;
      fillCircle(ctx, x, y, 9 * s);
      fillCircle(ctx, x + 11 * s, y + 2 * s, 12 * s);
      fillCircle(ctx, x + 24 * s, y, 8 * s);
    }
  }

  drawCaveBack(ctx, left, top) {
    // Layered cave walls: jagged bands of rock receding into the dark.
    const zone = this.zone;
    const bands = [
      { color: zone.hills[0], par: 0.16, amp: 12, base: 0.2, freq: 0.02 },
      { color: zone.hills[1], par: 0.3, amp: 16, base: 0.12, freq: 0.014 },
    ];
    for (const band of bands) {
      ctx.fillStyle = band.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= VIEW_W; x += 10) {
        const wx = (x + left * band.par) * band.freq;
        ctx.lineTo(x, this.viewH * band.base + Math.sin(wx) * band.amp + Math.sin(wx * 3.1) * band.amp * 0.4);
      }
      ctx.lineTo(VIEW_W, 0);
      ctx.closePath();
      ctx.fill();
      // stalactites hanging off the band
      for (let i = 0; i < 9; i += 1) {
        const x = ((i * 47 - left * band.par) % (VIEW_W + 60)) - 20;
        const wx = (x + left * band.par) * band.freq;
        const y = this.viewH * band.base + Math.sin(wx) * band.amp + Math.sin(wx * 3.1) * band.amp * 0.4;
        const h = 10 + hash(i, 5) * 22;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 1);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + 4, y - 1);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Distant waterfalls in front of the rock.
    for (let i = 0; i < 5; i += 1) {
      const x = ((i * 137 - left * 0.3) % (VIEW_W + 120)) - 40;
      const w = 16 + hash(i, 3) * 20;
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, 'rgba(120, 220, 240, 0)');
      grad.addColorStop(0.5, 'rgba(150, 235, 255, 0.24)');
      grad.addColorStop(1, 'rgba(120, 220, 240, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, w, this.viewH);
      ctx.fillStyle = 'rgba(220, 250, 255, 0.35)';
      for (let d = 0; d < 6; d += 1) {
        const y = ((this.time * (90 + i * 30) + d * 44) % (this.viewH + 30)) - 10;
        ctx.fillRect(x + w * 0.35 + hash(i, d) * w * 0.3, y, 1.4, 12);
      }
    }
  }

  drawHills(ctx, left, top) {
    const zone = this.zone;
    const layers = [
      { color: zone.hills[0], par: 0.12, amp: 16, base: 0.62, freq: 0.006, phase: 0 },
      { color: zone.hills[1], par: 0.26, amp: 22, base: 0.76, freq: 0.009, phase: 1.7 },
      { color: zone.hills[2], par: 0.42, amp: 26, base: 0.92, freq: 0.013, phase: 3.4 },
    ];
    for (const layer of layers) {
      const yBase = this.viewH * layer.base - top * layer.par * 0.5;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, this.viewH);
      for (let x = 0; x <= VIEW_W; x += 8) {
        const wx = (x + left * layer.par) * layer.freq + layer.phase;
        const y = yBase + Math.sin(wx) * layer.amp + Math.sin(wx * 2.7) * layer.amp * 0.32;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(VIEW_W, this.viewH);
      ctx.closePath();
      ctx.fill();
    }
    // Little floating islands, kept up in the sky where they read as scenery.
    for (let i = 0; i < 4; i += 1) {
      const x = ((i * 213 + 60 - left * 0.55) % (VIEW_W + 260)) - 80;
      const y = 26 + hash(i, 61) * 52 - top * 0.22;
      if (y > this.viewH * 0.5) continue;
      const w = 26 + hash(i, 67) * 30;
      const drop = 6 + hash(i, 71) * 7;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = shade(zone.hills[2], -0.16);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.bezierCurveTo(x - w * 0.3, y + drop, x - w * 0.1, y + drop * 1.5, x, y + drop * 1.6);
      ctx.bezierCurveTo(x + w * 0.14, y + drop * 1.3, x + w * 0.34, y + drop * 0.8, x + w / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(zone.rockTop, -0.14);
      ctx.beginPath();
      ctx.ellipse(x, y - 1, w / 2, 4.5, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(x - w / 2, y - 1, w, 2.5);
      ctx.globalAlpha = 1;
    }
  }

  drawWeather(ctx, left, top, viewW, viewH) {
    const zone = this.zone;
    const style = { meadow: '#fff6c9', caves: '#bff4ff', cliffs: '#ffd9c2', summit: '#ffffff' }[zone.id];
    ctx.fillStyle = style;
    for (const mote of this.motes) {
      const speed = zone.id === 'summit' ? 26 : 14;
      const sway = Math.sin(this.time * mote.drift * 2 + mote.x) * (zone.id === 'cliffs' ? 14 : 5);
      const x = ((mote.x - left * 0.9 + this.time * (zone.id === 'cliffs' ? 60 : 8) * mote.drift) % (VIEW_W + 40)) - 20 + sway;
      const y = ((mote.y - top * 0.9 + this.time * speed * mote.drift) % (this.viewH + 40)) - 20;
      ctx.globalAlpha = 0.55;
      if (zone.id === 'cliffs') {
        ctx.fillRect(x, y, mote.s * 5, 0.8);
      } else {
        fillCircle(ctx, x, y, mote.s);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawWind(ctx) {
    for (const wind of this.world.winds) {
      const strength = Math.hypot(wind.ax, wind.ay);
      const dirX = wind.ax / (strength || 1);
      const dirY = wind.ay / (strength || 1);
      ctx.save();
      const wash = ctx.createLinearGradient(wind.x, wind.y, wind.x, wind.y + wind.h);
      wash.addColorStop(0, 'rgba(255, 255, 255, 0)');
      wash.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
      wash.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = wash;
      ctx.fillRect(wind.x, wind.y, wind.w, wind.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2;
      const count = Math.max(3, Math.round(wind.w / 14));
      for (let i = 0; i < count; i += 1) {
        const phase = (this.time * 1.3 + i * 0.37) % 1;
        const sx = wind.x + 6 + (i / count) * (wind.w - 12) + dirX * phase * 46;
        const sy = wind.y + wind.h - phase * (wind.h - 4) + dirY * 6;
        ctx.globalAlpha = 0.7 * Math.sin(phase * Math.PI);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dirX * 14, sy + dirY * 14);
        ctx.stroke();
        // little arrow head so the push direction reads at a glance
        ctx.beginPath();
        ctx.moveTo(sx + dirX * 14, sy + dirY * 14);
        ctx.lineTo(sx + dirX * 10 - dirY * 3, sy + dirY * 10 + dirX * 3);
        ctx.moveTo(sx + dirX * 14, sy + dirY * 14);
        ctx.lineTo(sx + dirX * 10 + dirY * 3, sy + dirY * 10 - dirX * 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ tiles

  drawTiles(ctx, left, top, viewW, viewH) {
    const world = this.world;
    const zone = this.zone;
    const c0 = Math.max(0, Math.floor(left / TILE) - 1);
    const c1 = Math.min(world.width - 1, Math.ceil((left + viewW) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(top / TILE) - 1);
    const r1 = Math.min(world.height - 1, Math.ceil((top + viewH) / TILE) + 1);
    const rock = zone.rock;
    const rockDark = shade(rock, -0.22);
    const rockLight = shade(rock, 0.12);

    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const ch = world.grid[row][col];
        const x = col * TILE;
        const y = row * TILE;
        const solid = (c, r) => {
          const t = world.grid[r]?.[c];
          return t === '#' || t === 'I' || (t === 'D' && !world.gatesOpen);
        };
        switch (ch) {
          case '#': {
            ctx.fillStyle = rock;
            const openTop = !solid(col, row - 1);
            // A touch of overlap hides the hairline seams between tiles.
            topRoundRect(ctx, x, y, TILE + 0.6, TILE + 0.6, openTop ? 3 : 0);
            ctx.fill();
            // speckles
            ctx.fillStyle = rockDark;
            for (let i = 0; i < 3; i += 1) {
              const hx = hash(col * 3 + i, row * 5);
              const hy = hash(col * 7, row * 11 + i);
              ctx.fillRect(x + 2 + hx * 11, y + 4 + hy * 10, 1.4, 1.4);
            }
            if (openTop) {
              ctx.fillStyle = zone.rockTop;
              ctx.beginPath();
              ctx.moveTo(x, y + 5);
              for (let i = 0; i <= 4; i += 1) {
                const px = x + (i / 4) * TILE;
                ctx.lineTo(px, y + 3.5 + Math.sin(col * 1.7 + i) * 1.6);
              }
              ctx.lineTo(x + TILE, y + 5.5);
              ctx.lineTo(x + TILE, y);
              ctx.lineTo(x, y);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = shade(zone.rockTop, 0.22);
              ctx.fillRect(x, y, TILE, 1.4);
              if (hash(col, row) > 0.5) {
                const tx = x + 3 + hash(col, row + 1) * 9;
                if (zone.id === 'meadow' || zone.id === 'caves') {
                  // a blade of grass or a mossy frond
                  ctx.fillStyle = shade(zone.rockTop, -0.18);
                  ctx.beginPath();
                  ctx.moveTo(tx, y + 1);
                  ctx.quadraticCurveTo(tx - 2, y - 2.5, tx + 1, y - 4);
                  ctx.quadraticCurveTo(tx + 2.5, y - 1.5, tx + 2, y + 1);
                  ctx.fill();
                } else {
                  // a wind-worn pebble or a lump of snow
                  ctx.fillStyle = shade(zone.rockTop, 0.18);
                  ctx.beginPath();
                  ctx.ellipse(tx + 1, y + 0.5, 2.6, 1.8, 0, Math.PI, TAU);
                  ctx.fill();
                }
              }
            }
            if (!solid(col - 1, row)) {
              ctx.fillStyle = rockDark;
              ctx.fillRect(x, y + (openTop ? 5 : 0), 1.2, TILE - (openTop ? 5 : 0));
            }
            if (!solid(col + 1, row)) {
              ctx.fillStyle = rockLight;
              ctx.fillRect(x + TILE - 1.2, y + (openTop ? 5 : 0), 1.2, TILE - (openTop ? 5 : 0));
            }
            break;
          }
          case 'I': {
            const grad = ctx.createLinearGradient(x, y, x, y + TILE);
            grad.addColorStop(0, 'rgba(238, 252, 255, 0.98)');
            grad.addColorStop(0.4, 'rgba(178, 232, 250, 0.95)');
            grad.addColorStop(1, 'rgba(126, 194, 226, 0.95)');
            ctx.fillStyle = grad;
            topRoundRect(ctx, x, y, TILE + 0.6, TILE + 0.6, solid(col, row - 1) ? 0 : 2.5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 3, y + TILE - 3);
            ctx.lineTo(x + TILE - 4, y + 3);
            ctx.stroke();
            break;
          }
          case 'C': {
            const block = world.crumbles.get(`${row},${col}`);
            if (block?.state === 'gone') {
              ctx.strokeStyle = 'rgba(255,255,255,0.22)';
              ctx.setLineDash([2, 3]);
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
              ctx.setLineDash([]);
              break;
            }
            const shaking = block?.state === 'shaking';
            const jx = shaking ? (Math.random() - 0.5) * 1.8 : 0;
            ctx.fillStyle = shaking ? '#f1e3c0' : '#e6d6b4';
            roundRect(ctx, x + jx, y, TILE, TILE, 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(132, 108, 70, 0.28)';
            ctx.lineWidth = 0.65;
            ctx.beginPath();
            ctx.moveTo(x + jx + 4, y + 3);
            ctx.lineTo(x + jx + 6.5, y + 8);
            ctx.lineTo(x + jx + 4.5, y + 12.5);
            ctx.stroke();
            ctx.fillStyle = 'rgba(160, 134, 92, 0.3)';
            for (let i = 0; i < 4; i += 1) {
              ctx.fillRect(x + jx + 2 + hash(col + i, row) * 11, y + 2 + hash(col, row + i) * 11, 1.1, 1.1);
            }
            break;
          }
          case 'M': {
            const pulse = this.pulses.get(`m${col},${row}`);
            const squash = pulse ? Math.sin(pulse.t * 14) * Math.exp(-pulse.t * 5) * 0.5 : 0;
            ctx.fillStyle = '#f6e7d0';
            ctx.fillRect(x + 5, y + 8, 6, 8);
            const capH = 9 * (1 - squash);
            const capW = TILE * (1 + squash * 0.6);
            ctx.fillStyle = '#ff6f91';
            ctx.beginPath();
            ctx.ellipse(x + TILE / 2, y + 9 - (capH - 9), capW / 2, capH, 0, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            fillCircle(ctx, x + 5, y + 6 - (capH - 9) * 0.5, 1.6);
            fillCircle(ctx, x + 11, y + 4 - (capH - 9) * 0.5, 1.2);
            break;
          }
          case '-': {
            ctx.fillStyle = PLANK[zone.id] || PLANK.meadow;
            roundRect(ctx, x, y, TILE, 5, 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(x, y + 3.6, TILE, 1.4);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillRect(x + 1, y + 0.6, TILE - 2, 1);
            break;
          }
          case '^': {
            const up = !solid(col, row + 1);
            ctx.fillStyle = zone.id === 'summit' ? '#9fb6d8' : '#6f5a46';
            ctx.beginPath();
            for (let i = 0; i < 4; i += 1) {
              const bx = x + i * 4;
              if (up) {
                ctx.moveTo(bx, y + TILE);
                ctx.lineTo(bx + 2, y + 4);
                ctx.lineTo(bx + 4, y + TILE);
              } else {
                ctx.moveTo(bx, y);
                ctx.lineTo(bx + 2, y + TILE - 4);
                ctx.lineTo(bx + 4, y);
              }
            }
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            for (let i = 0; i < 4; i += 1) {
              ctx.fillRect(x + i * 4 + 1.4, up ? y + 5 : y + TILE - 6, 0.9, 3);
            }
            break;
          }
          case '~': {
            const surface = world.grid[row - 1]?.[col] !== '~';
            ctx.fillStyle = surface ? '#54b4d6' : '#3f97bd';
            ctx.fillRect(x, y, TILE, TILE + 0.5);
            if (surface) {
              const wave = (px) => y + 2.4 + Math.sin(px * 0.16 + this.time * 2.4) * 1.5 + Math.sin(px * 0.07 - this.time * 1.4) * 0.8;
              ctx.fillStyle = 'rgba(214, 248, 255, 0.8)';
              ctx.beginPath();
              ctx.moveTo(x, wave(x));
              for (let i = 1; i <= 4; i += 1) ctx.lineTo(x + (i / 4) * TILE, wave(x + (i / 4) * TILE));
              ctx.lineTo(x + TILE, y + 5.5);
              ctx.lineTo(x, y + 5.5);
              ctx.closePath();
              ctx.fill();
            }
            break;
          }
          case 'D': {
            if (world.gatesOpen) break;
            ctx.fillStyle = '#8c7f9c';
            roundRect(ctx, x, y, TILE, TILE, 1.5);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
            if ((row + col) % 3 === 0) {
              ctx.fillStyle = '#ffd166';
              ctx.beginPath();
              ctx.arc(x + TILE / 2, y + TILE / 2, 2.4, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          }
          default:
            break;
        }
      }
    }
  }

  drawMovers(ctx) {
    for (const mover of this.world.movers) {
      if (mover.kind === 'stone') {
        ctx.fillStyle = shade(this.zone.rock, 0.04);
        roundRect(ctx, mover.x, mover.y, mover.w, mover.h, 3.5);
        ctx.fill();
        ctx.fillStyle = shade(this.zone.rock, -0.2);
        for (let i = 0; i < 6; i += 1) {
          ctx.fillRect(mover.x + 2 + hash(i, mover.index) * (mover.w - 5), mover.y + 4 + hash(mover.index, i) * (mover.h - 6), 1.4, 1.4);
        }
        ctx.fillStyle = this.zone.rockTop;
        ctx.beginPath();
        ctx.moveTo(mover.x, mover.y + 4);
        for (let i = 0; i <= 5; i += 1) {
          const px = mover.x + (i / 5) * mover.w;
          ctx.lineTo(px, mover.y + 2.6 + Math.sin(i * 1.6) * 1.2);
        }
        ctx.lineTo(mover.x + mover.w, mover.y + 4);
        ctx.lineTo(mover.x + mover.w, mover.y);
        ctx.lineTo(mover.x, mover.y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#5fbf6a';
        ctx.beginPath();
        ctx.ellipse(mover.x + mover.w / 2, mover.y + mover.h / 2, mover.w / 2, mover.h / 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30, 90, 50, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mover.x + 2, mover.y + mover.h / 2);
        ctx.lineTo(mover.x + mover.w - 2, mover.y + mover.h / 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        fillEllipse(ctx, mover.x + mover.w * 0.35, mover.y + mover.h * 0.3, mover.w * 0.22, 1.4);
      }
    }
  }

  // ------------------------------------------------------------ things

  drawCollectibles(ctx) {
    const world = this.world;
    const t = this.time;
    for (const seed of world.seeds) {
      if (seed.taken) continue;
      const cx = seed.box.x + seed.box.w / 2;
      const cy = seed.box.y + seed.box.h / 2 + Math.sin(t * 3 + seed.col * 0.7) * 1.4;
      const spin = Math.abs(Math.cos(t * 2.4 + seed.col));
      ctx.fillStyle = 'rgba(255, 226, 138, 0.28)';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd45e';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2.2 + spin * 1.6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.ellipse(cx - 0.6, cy - 1.2, 0.9 * (0.4 + spin), 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const acorn of world.acorns) {
      if (acorn.taken) continue;
      const cx = acorn.box.x + acorn.box.w / 2;
      const cy = acorn.box.y + acorn.box.h / 2 + Math.sin(t * 2 + acorn.col) * 1.6;
      const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, 13);
      glow.addColorStop(0, 'rgba(255, 224, 150, 0.6)');
      glow.addColorStop(1, 'rgba(255, 210, 120, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4b73f';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 1.5, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a5a22';
      roundRect(ctx, cx - 4.4, cy - 4.6, 8.8, 4.2, 1.6);
      ctx.fill();
      ctx.fillStyle = '#6d4318';
      ctx.fillRect(cx - 0.6, cy - 7, 1.2, 2.4);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      const sp = (t * 1.6 + acorn.col) % 1;
      ctx.globalAlpha = Math.sin(sp * Math.PI);
      ctx.beginPath();
      ctx.arc(cx + 4 - sp * 9, cy - 6 + sp * 4, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const flower of world.checkpoints) {
      const cx = flower.box.x + flower.box.w / 2;
      const base = flower.box.y + flower.box.h;
      const sway = Math.sin(t * 2 + flower.col) * 1.6;
      ctx.strokeStyle = '#4f9e57';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, base);
      ctx.quadraticCurveTo(cx + sway * 0.5, base - 6, cx + sway, base - 11);
      ctx.stroke();
      ctx.fillStyle = '#4f9e57';
      ctx.beginPath();
      ctx.ellipse(cx + 3 + sway * 0.4, base - 6, 3, 1.6, -0.5, 0, Math.PI * 2);
      ctx.fill();
      if (flower.bloomed) {
        const petals = 6;
        const pop = Math.min(1, (t * 2) % 100);
        ctx.fillStyle = '#ff8fc0';
        for (let i = 0; i < petals; i += 1) {
          const a = (i / petals) * Math.PI * 2 + t * 0.6;
          ctx.beginPath();
          ctx.ellipse(cx + sway + Math.cos(a) * 3.4, base - 11 + Math.sin(a) * 3.4, 2.6 * pop, 2 * pop, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffe680';
        ctx.beginPath();
        ctx.arc(cx + sway, base - 11, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 240, 180, 0.25)';
        ctx.beginPath();
        ctx.arc(cx + sway, base - 11, 9 + Math.sin(t * 3) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#9ec6a2';
        ctx.beginPath();
        ctx.ellipse(cx + sway, base - 11, 2.6, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const latch of this.world.switches) {
      const cx = latch.box.x + latch.box.w / 2;
      const cy = latch.box.y + latch.box.h / 2;
      ctx.fillStyle = latch.pressed ? '#ffd166' : '#6f6a86';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = latch.pressed ? 'rgba(255, 233, 160, 0.9)' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + (latch.pressed ? this.time : 0);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
        ctx.lineTo(cx + Math.cos(a) * (latch.pressed ? 9 : 7.5), cy + Math.sin(a) * (latch.pressed ? 9 : 7.5));
        ctx.stroke();
      }
    }
  }

  drawGoal(ctx) {
    const goal = this.world.goal;
    if (!goal) return;
    const cx = goal.box.x + goal.box.w / 2;
    const cy = goal.box.y + goal.box.h / 2;
    const t = this.time;
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34);
    glow.addColorStop(0, 'rgba(255, 250, 220, 0.9)');
    glow.addColorStop(0.4, 'rgba(255, 216, 130, 0.42)');
    glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 246, 210, 0.75)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + t * 0.5;
      const r0 = 11 + Math.sin(t * 3 + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + 6), cy + Math.sin(a) * (r0 + 6));
      ctx.stroke();
    }
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + Math.sin(t * 2.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEnemies(ctx) {
    for (const enemy of this.world.enemies) {
      const cx = enemy.x + enemy.w / 2;
      const cy = enemy.y + enemy.h / 2;
      if (!enemy.alive) {
        ctx.globalAlpha = Math.max(0, 1 - enemy.squish);
        ctx.fillStyle = enemy.kind === 'b' ? '#b4612f' : '#d8b13a';
        ctx.beginPath();
        ctx.ellipse(cx, enemy.y + enemy.h, enemy.w / 2 * (1 + enemy.squish * 0.5), 2.2 * (1 - enemy.squish * 0.7), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      const walk = Math.sin(this.time * 12) * 1.2;
      if (enemy.kind === 'b') {
        ctx.fillStyle = '#4a3320';
        for (let i = 0; i < 3; i += 1) {
          const lx = enemy.x + 3 + i * 4;
          ctx.fillRect(lx, enemy.y + enemy.h - 2, 1.6, 2.4 + (i % 2 ? walk : -walk) * 0.5);
        }
        ctx.fillStyle = '#c4703a';
        ctx.beginPath();
        ctx.ellipse(cx, cy, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8f4a22';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 1, enemy.w / 2 - 0.5, enemy.h / 2 - 1, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5e2f14';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(cx, cy - enemy.h / 2 + 1);
        ctx.lineTo(cx, cy + enemy.h / 2 - 1.5);
        ctx.stroke();
        // face
        const fx = cx + enemy.dir * 4;
        ctx.fillStyle = '#fff';
        fillCircle(ctx, fx, cy - 1, 1.8);
        ctx.fillStyle = '#23180f';
        fillCircle(ctx, fx + enemy.dir * 0.5, cy - 1, 0.9);
        ctx.strokeStyle = '#4a3320';
        ctx.beginPath();
        ctx.moveTo(fx, cy - 4);
        ctx.lineTo(fx + enemy.dir * 2.5, cy - 6.5);
        ctx.stroke();
      } else {
        const flap = Math.sin(this.time * 34) * 3;
        ctx.fillStyle = 'rgba(240, 252, 255, 0.82)';
        fillEllipse(ctx, cx - 3, cy - 5, 6, 3, -0.6 + flap * 0.1);
        fillEllipse(ctx, cx + 3, cy - 5, 6, 3, 0.6 - flap * 0.1);
        ctx.strokeStyle = 'rgba(150, 200, 220, 0.6)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.ellipse(cx - 3, cy - 5, 6, 3, -0.6 + flap * 0.1, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx + 3, cy - 5, 6, 3, 0.6 - flap * 0.1, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ffd24a';
        fillEllipse(ctx, cx, cy, enemy.w / 2, enemy.h / 2.4);
        ctx.fillStyle = '#3a2a12';
        for (let i = 0; i < 2; i += 1) {
          ctx.beginPath();
          ctx.ellipse(cx - 1 + i * 3.4, cy, 1.3, enemy.h / 2.4 - 0.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const fx = cx + enemy.dir * 4.5;
        ctx.fillStyle = '#fff';
        fillCircle(ctx, fx, cy - 1, 1.8);
        ctx.fillStyle = '#23180f';
        fillCircle(ctx, fx + enemy.dir * 0.4, cy - 1, 0.85);
        ctx.strokeStyle = '#23180f';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(fx - enemy.dir * 1.2, cy + 2.6, 1.4, 0.1, Math.PI - 0.1);
        ctx.stroke();
      }
    }
  }

  drawPip(ctx) {
    const world = this.world;
    const p = world.player;
    if (world.invuln > 0 && Math.floor(this.time * 18) % 2 === 0) return;

    const squash = clamp(p.squash, -1, 1);
    const sx = 1 + squash * 0.3 - (p.vy < -120 ? 0.07 : 0);
    const sy = 1 - squash * 0.3 + (p.vy < -120 ? 0.09 : 0);
    const cx = p.x + p.w / 2;
    const base = p.y + p.h;
    const lean = p.wallSlide ? -p.wallDir * 0.22 : clamp(p.vx / 900, -0.12, 0.12);
    const run = p.onGround && Math.abs(p.vx) > 20 ? Math.sin(this.time * 18) : 0;

    ctx.save();
    // soft shadow on the ground below
    const groundY = this.groundBelow(p);
    if (groundY !== null) {
      const fade = clamp(1 - (groundY - base) / 110, 0.1, 0.55);
      ctx.fillStyle = `rgba(20, 30, 20, ${fade * 0.35})`;
      fillEllipse(ctx, cx, groundY - 1, 5.5 * fade + 2, 1.8 * fade + 0.6);
    }

    ctx.translate(cx, base);
    ctx.rotate(lean);
    ctx.scale(sx, sy);

    const bodyW = 11;
    const bodyH = 13;
    // feet
    ctx.fillStyle = '#e8b866';
    fillEllipse(ctx, -3, -1 + run * 0.8, 2.6, 1.7);
    fillEllipse(ctx, 3, -1 - run * 0.8, 2.6, 1.7);

    // body
    const grad = ctx.createLinearGradient(0, -bodyH, 0, 0);
    grad.addColorStop(0, '#c7ef86');
    grad.addColorStop(0.55, '#8fd45c');
    grad.addColorStop(1, '#5fae43');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, -2);
    ctx.quadraticCurveTo(-bodyW / 2 - 1.4, -bodyH + 1, 0, -bodyH);
    ctx.quadraticCurveTo(bodyW / 2 + 1.4, -bodyH + 1, bodyW / 2, -2);
    ctx.quadraticCurveTo(0, 1.6, -bodyW / 2, -2);
    ctx.closePath();
    ctx.fill();

    // leaf arms
    ctx.fillStyle = '#6fc24d';
    const armSwing = p.onGround ? run * 1.6 : (p.vy < 0 ? -2.2 : 1.6);
    ctx.save();
    ctx.translate(-bodyW / 2 + 0.5, -6 + armSwing * 0.4);
    ctx.rotate(-0.5 + armSwing * 0.18);
    ctx.beginPath();
    ctx.ellipse(-2, 0, 3.4, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(bodyW / 2 - 0.5, -6 - armSwing * 0.4);
    ctx.rotate(0.5 - armSwing * 0.18);
    ctx.beginPath();
    ctx.ellipse(2, 0, 3.4, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // sprout
    const sproutTilt = clamp(-p.vx / 260, -0.5, 0.5) + Math.sin(this.time * 6) * 0.06;
    ctx.save();
    ctx.translate(0, -bodyH + 0.5);
    ctx.rotate(sproutTilt);
    ctx.strokeStyle = '#4f9e3a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -4);
    ctx.stroke();
    ctx.fillStyle = '#7ed957';
    ctx.beginPath();
    ctx.ellipse(-2.6, -4.6, 2.9, 1.7, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a8e86a';
    ctx.beginPath();
    ctx.ellipse(2.6, -5.2, 2.6, 1.5, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // face
    const look = clamp(p.vx / 200, -1, 1) * 0.9;
    const blinking = this.blink > 4.4;
    ctx.fillStyle = '#fffdf4';
    if (!blinking) {
      fillEllipse(ctx, -2.6 + look, -8, 1.9, 2.3);
      fillEllipse(ctx, 2.6 + look, -8, 1.9, 2.3);
      ctx.fillStyle = '#2a3d22';
      fillCircle(ctx, -2.4 + look * 1.6, -7.7, 1.05);
      fillCircle(ctx, 2.8 + look * 1.6, -7.7, 1.05);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      fillCircle(ctx, -2.9 + look * 1.6, -8.5, 0.45);
      fillCircle(ctx, 2.3 + look * 1.6, -8.5, 0.45);
    } else {
      ctx.strokeStyle = '#2a3d22';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-4 + look, -8);
      ctx.lineTo(-0.8 + look, -8);
      ctx.moveTo(1 + look, -8);
      ctx.lineTo(4.2 + look, -8);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 150, 170, 0.5)';
    fillEllipse(ctx, -4.4 + look, -5.4, 1.5, 1);
    fillEllipse(ctx, 4.6 + look, -5.4, 1.5, 1);
    ctx.strokeStyle = '#2a3d22';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    const smile = p.vy < -80 ? 1.4 : 0.9;
    ctx.arc(0.4 + look, -5.6, 1.5, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.restore();
  }

  /** Distance to the first solid tile under Pip, for his drop shadow. */
  groundBelow(p) {
    const world = this.world;
    const col = Math.floor((p.x + p.w / 2) / TILE);
    const start = Math.floor((p.y + p.h) / TILE);
    for (let row = start; row < Math.min(world.height, start + 9); row += 1) {
      const ch = world.tileAt(col, row);
      if (ch === '#' || ch === 'I' || ch === '-' || ch === 'C' || ch === 'M' || ch === 'D') return row * TILE;
    }
    return null;
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const life = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, life);
      if (p.kind === 'sparkle') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * (0.4 + life);
        ctx.fillRect(-s, -0.5, s * 2, 1);
        ctx.fillRect(-0.5, -s, 1, s * 2);
        ctx.restore();
      } else if (p.kind === 'petal') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.3, p.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'chunk') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, life) * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + (1 - life) * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

export { PETALS };
