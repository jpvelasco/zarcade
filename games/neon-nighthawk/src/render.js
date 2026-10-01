// Canvas renderer for Neon Nighthawk. It only reads the world.
//
// Frames stay cheap by baking: every city block is drawn once (dark, and
// again lit) into a cached sprite, glows are pre-rendered sprites drawn with
// additive blending instead of `shadowBlur`, and lines are batched into a
// few paths. A quality scaler watches frame times and steps the pixel ratio
// and optional effects down on slower machines.
import { BLOCK, ROAD_HALF, signalState, trafficPosition } from './city.js';
import { LruCache } from './cache.js';
import { clamp, hashFloat, lerp, mod, wrapAngle } from './math.js';
import { SCAN_CONE, SCAN_RANGE } from './world.js';
import { Particles, burst } from './particles.js';
import { QUALITY_LEVELS, QualityScaler, qualityIndex } from './quality.js';
import { FESTIVAL, LOT, blockScenery, crossingDecor, segmentDecor } from './scenery.js';
import {
  BLOCK_PAD,
  bakeBike,
  bakeBlock,
  bakeCar,
  bakeDrone,
  bakeGlow,
  bakeLantern,
  bakeRunner,
  hsl,
  makeCanvas,
  rgba,
  roundedRect,
} from './sprites.js';

const LIGHT_FADE = 0.7; // seconds for a block to ease from dark to lit
const CELEBRATE_SPEED = 760; // world units per second for the finale wave
const SPRITE_SPAN = LOT + BLOCK_PAD * 2;
const STOP_COLORS = { pickup: '#65f5c1', drop: '#ffc857', cell: '#6df0bd', piece: '#ff5fb7' };
const STOP_LABELS = { pickup: 'PICKUP', drop: 'DROP', cell: 'SPARK CELL', piece: 'PIECE' };
const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, { quality = 'auto', reducedMotion = false, onQuality = null } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    this.reducedMotion = reducedMotion;
    this.onQuality = onQuality;
    const pinned = qualityIndex(quality);
    this.scaler = pinned < 0 ? new QualityScaler() : null;
    this.levelIndex = Math.max(0, pinned);
    this.level = QUALITY_LEVELS[this.levelIndex];
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.k = 0; // pixels per world unit that cached sprites are baked at
    this.spritesK = 0;
    this.resizedAt = 0;
    this.camera = { x: 0, y: 0, ready: false };
    this.blocks = new LruCache(96, (_, entry) => { entry.canvas.width = 0; });
    this.scenery = new LruCache(320);
    this.decor = new LruCache(480);
    this.sprites = new Map();
    this.signature = '';
    this.blockBudget = 48;
    this.visibleBlocks = 0;
    this.particles = new Particles(this.level.particles);
    this.rings = [];
    this.ghosts = [];
    this.ghostClock = 0;
    this.lean = 0;
    this.lastAngle = null;
    this.shake = 0;
    this.celebration = null;
    this.fireworkClock = 0;
    this.glowQueue = [];
    this.sizedGlows = new LruCache(320);
    this.miniAt = 0;
    this.miniKeys = new Map();
    this.rain = Array.from({ length: 200 }, (_, index) => ({
      x: hashFloat(index, 3, 77),
      y: hashFloat(index, 5, 31),
      speed: 0.55 + hashFloat(index, 7, 18) * 1.2,
      length: 8 + hashFloat(index, 11, 89) * 16,
      bucket: index % 3,
    }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get qualityName() {
    return this.level.name;
  }

  setQuality(index, reason = 'manual', frameMs = 0) {
    const next = clamp(index, 0, QUALITY_LEVELS.length - 1);
    if (next === this.levelIndex) return;
    const previous = this.level;
    this.levelIndex = next;
    this.level = QUALITY_LEVELS[next];
    if (this.scaler) this.scaler.level = next;
    this.particles.setLimit(this.level.particles);
    this.resize(true);
    this.onQuality?.({ from: previous.name, to: this.level.name, reason, 'frame.ms': Math.round(frameMs * 10) / 10, dpr: this.dpr });
  }

  resize(immediate = false) {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1, this.level.dpr);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    // Sprites keep drawing (scaled) while a window drag settles, then rebake.
    this.resizedAt = immediate ? -Infinity : performance.now();
  }

  view(world) {
    const scale = clamp(Math.min(this.width / 1060, this.height / 760) * 0.98, 0.62, 1.04);
    const player = world.player;
    if (!this.camera.ready || Math.hypot(this.camera.x - player.x, this.camera.y - player.y) > 900) {
      this.camera.x = player.x;
      this.camera.y = player.y;
      this.camera.ready = true;
      this.lastAngle = null;
      this.ghosts.length = 0;
    } else {
      this.camera.x = lerp(this.camera.x, player.x, 0.12);
      this.camera.y = lerp(this.camera.y, player.y, 0.12);
    }
    return scale;
  }

  // The simulation clock stops between jobs, but light still spreading from
  // the last drop should finish its wave. Keep a display clock that runs on.
  displayTime(world, now) {
    if (world !== this.clockWorld || world.time !== this.clockBase) {
      this.clockWorld = world;
      this.clockBase = world.time;
      this.clockSince = now;
    }
    return world.time + (now - this.clockSince) / 1000;
  }

  // ------------------------------------------------------------ caches

  small(key, bake) {
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = bake();
      this.sprites.set(key, sprite);
    }
    return sprite;
  }

  sceneFor(seed, column, row) {
    const key = `${column},${row}`;
    let scene = this.scenery.get(key);
    if (!scene) {
      scene = blockScenery(column, row, seed);
      scene.flatDark = '#161c29';
      scene.flatLit = hsl(scene.hue, 40, 24);
      this.scenery.set(key, scene);
    }
    return scene;
  }

  decorFor(seed, column, row) {
    const key = `${column},${row}`;
    let decor = this.decor.get(key);
    if (!decor) {
      decor = { x: segmentDecor(column, row, 'x', seed), y: segmentDecor(column, row, 'y', seed), cross: crossingDecor(column, row, seed) };
      this.decor.set(key, decor);
    }
    return decor;
  }

  // Baking is spread over frames: a sprite the frame needs is always allowed
  // once, more only while the frame's time budget lasts.
  canBuild(required) {
    if (required && this.builds === 0) {
      this.builds++;
      return true;
    }
    const limit = required ? this.buildDeadline : this.buildDeadline - this.level.buildMs * 0.5;
    if (performance.now() < limit) {
      this.builds++;
      return true;
    }
    return false;
  }

  blockSprite(scene, lit, required) {
    const key = `${scene.column},${scene.row},${lit ? 1 : 0}`;
    let entry = this.blocks.get(key);
    if (entry && entry.k === this.k) return entry;
    if (this.canBuild(required)) {
      const canvas = bakeBlock(scene, { lit, accent: this.accent, k: this.k });
      if (entry) entry.canvas.width = 0;
      entry = { canvas, k: this.k };
      this.blocks.set(key, entry);
    }
    return entry || null;
  }

  // World time at which a block is (or will be) lit, including the finale
  // wave. Infinity while HALO still has it dark.
  blockLitAt(world, column, row) {
    const litAt = world.lit.get(`${column},${row}`);
    let at = litAt === undefined ? Infinity : litAt;
    const party = this.celebration;
    if (party) {
      const cx = column * BLOCK + BLOCK / 2;
      const cy = row * BLOCK + BLOCK / 2;
      at = Math.min(at, party.start + Math.hypot(cx - party.x, cy - party.y) / CELEBRATE_SPEED);
    }
    return at;
  }

  // ------------------------------------------------------------ events

  // Juice for simulation events: bursts, rings and a little shake. Called by
  // main.js with the events it drained from the world.
  effects(events, world, { attract = false } = {}) {
    const player = world.player;
    const calm = this.reducedMotion;
    for (const event of events) {
      switch (event.type) {
        case 'spark':
          this.sparkle(event.x, event.y, '#ffd35c', calm ? 3 : 7, 120);
          this.ring(event.x, event.y, '#ffe9a8', 26, 0.35, 2);
          break;
        case 'stop':
        case 'pickup': {
          const at = event.stop || player;
          const color = STOP_COLORS[event.stop?.kind] || '#65f5c1';
          this.ring(at.x, at.y, color, 110, 0.7, 4);
          this.sparkle(at.x, at.y, color, calm ? 6 : 16, 260);
          if (event.type === 'stop' && event.stop?.kind === 'drop') this.confetti(at.x, at.y, calm ? 10 : 26);
          break;
        }
        case 'delivered':
          this.ring(player.x, player.y, '#ffe29a', 180, 1, 6);
          this.confetti(player.x, player.y, calm ? 14 : 36);
          this.sparkle(player.x, player.y, '#ffd35c', calm ? 8 : 22, 320);
          break;
        case 'caught':
          this.confetti(player.x, player.y, calm ? 10 : 24);
          this.ring(player.x, player.y, '#ff9e5c', 90, 0.6, 3);
          break;
        case 'impact':
          this.sparkle(player.x, player.y, '#ff6f91', calm ? 3 : 9, 200);
          if (!calm && !attract) this.shake = Math.min(10, Math.max(this.shake, 3.5 + (event.harm || 0) * 0.35));
          break;
        case 'flux':
          this.ring(player.x, player.y, '#7fe9ff', 60, 0.45, 3);
          break;
        case 'dash':
          this.sparkle(player.x, player.y, world.paint, calm ? 3 : 10, 160);
          break;
        case 'pulse':
          this.sparkle(player.x, player.y, world.paint, calm ? 4 : 12, 260);
          break;
        case 'near-miss':
          this.sparkle(player.x, player.y, '#e8fbff', calm ? 2 : 5, 140);
          break;
        case 'scan':
          this.ring(player.x, player.y, '#ff4f74', 50, 0.4, 2.5);
          if (!calm && !attract) this.shake = Math.max(this.shake, 2.5);
          break;
        default:
          break;
      }
    }
  }

  sparkle(x, y, color, count, speed) {
    for (const v of burst(count, speed)) {
      this.particles.spawn({ x, y, vx: v.vx, vy: v.vy, life: 0.45 + Math.random() * 0.35, size: 9 + Math.random() * 8, color, drag: 3.2 });
    }
  }

  confetti(x, y, count) {
    for (const v of burst(count, 300)) {
      this.particles.spawn({
        x, y, vx: v.vx, vy: v.vy - 60, life: 0.9 + Math.random() * 0.6, size: 3 + Math.random() * 3,
        color: FESTIVAL[Math.floor(Math.random() * FESTIVAL.length)], drag: 2.4, gravity: 140,
        kind: 'confetti', spin: (Math.random() - 0.5) * 14, angle: Math.random() * TAU,
      });
    }
  }

  ring(x, y, color, radius, life, width) {
    if (this.rings.length > 24) this.rings.shift();
    this.rings.push({ x, y, color, radius, life, width, age: 0 });
  }

  // ------------------------------------------------------------ frame

  draw(world, { now = performance.now(), elapsed = 0, attract = false } = {}) {
    if (this.scaler && elapsed > 0) {
      const mean = this.scaler.mean;
      const next = this.scaler.sample(elapsed);
      if (next >= 0) this.setQuality(next, 'auto', mean);
    }
    this.resize();
    const dt = clamp(elapsed / 1000, 0, 0.05);
    this.time = this.displayTime(world, now);
    const context = this.context;
    const scale = this.view(world);
    const district = world.contract?.district;
    this.accent = district?.accent || '#3fe5ff';

    const signature = `${world.seed}|${this.accent}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.blocks.clear();
      this.scenery.clear();
      this.decor.clear();
      this.miniKeys.clear();
    }
    const targetK = scale * this.dpr;
    if (this.k !== targetK && (this.k === 0 || now - this.resizedAt > 280)) this.k = targetK;
    if (this.spritesK !== this.k) {
      this.sprites.clear();
      this.spritesK = this.k;
      const side = Math.ceil(SPRITE_SPAN * this.k);
      // About 48 MB of block sprites, but never fewer than the view needs.
      this.blockBudget = clamp(Math.floor(12e6 / (side * side)), 24, 200);
    }
    this.buildDeadline = performance.now() + this.level.buildMs;
    this.builds = 0;

    this.updateMotion(world, dt, attract);

    const px = scale * this.dpr;
    let shakeX = 0;
    let shakeY = 0;
    if (this.shake > 0.15) {
      shakeX = Math.sin(this.time * 63) * this.shake;
      shakeY = Math.cos(this.time * 49) * this.shake;
    }
    const ox = Math.round((this.width / 2 + shakeX) * this.dpr - this.camera.x * px);
    const oy = Math.round((this.height / 2 + shakeY) * this.dpr - this.camera.y * px);
    const view = {
      px, ox, oy,
      left: -ox / px,
      top: -oy / px,
      right: (this.canvas.width - ox) / px,
      bottom: (this.canvas.height - oy) / px,
    };
    this.viewRect = view;

    context.setTransform(px, 0, 0, px, ox, oy);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    this.drawGround(context, world, view);
    const pending = this.drawBlocks(context, world, view);
    this.blocks.setLimit(Math.max(this.blockBudget, this.visibleBlocks * 2 + 12));
    context.setTransform(px, 0, 0, px, ox, oy);
    this.drawStreetLights(context, world, view);
    this.drawLightWaves(context, world);
    this.drawRoute(context, world);
    this.drawSparks(context, world, view);
    this.drawStops(context, world);
    this.drawTrail(context, world);
    this.drawEchoes(context, world, view);
    this.drawTraffic(context, world, view);
    this.drawPatrols(context, world, view);
    this.drawRunner(context, world);
    this.drawPulse(context, world);
    this.drawPlayer(context, world);
    this.drawLanterns(context, world, view);
    this.drawParticles(context, view, false);
    this.drawRings(context);
    this.drawGuide(context, world, view);

    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawRain(context, world);
    this.drawScreenEffects(context, world);
    if (this.celebration) this.drawFireworks(context, dt);
    this.drawParticles(context, view, true);

    // Spare time this frame bakes lit versions of nearby dark blocks, so a
    // drop-off lights them without a hitch.
    for (const scene of pending) {
      if (!this.blockSprite(scene, true, false)) break;
    }
  }

  updateMotion(world, dt, attract) {
    const player = world.player;
    this.shake = this.shake > 0.05 ? this.shake * Math.exp(-dt * 9) : 0;
    this.particles.update(dt);
    for (const ring of this.rings) ring.age += dt;
    while (this.rings.length && this.rings[0].age > this.rings[0].life) this.rings.shift();
    if (this.rings.some((ring) => ring.age > ring.life)) this.rings = this.rings.filter((ring) => ring.age <= ring.life);

    // Lean into turns: the bike's turn rate tilts the sprite.
    if (this.lastAngle === null) this.lastAngle = player.angle;
    const turn = dt > 0 ? wrapAngle(player.angle - this.lastAngle) / dt : 0;
    this.lastAngle = player.angle;
    this.lean = lerp(this.lean, clamp(turn * 0.2, -1, 1), 1 - Math.exp(-dt * 10));

    for (const ghost of this.ghosts) ghost.age += dt;
    while (this.ghosts.length && this.ghosts[0].age > 0.3) this.ghosts.shift();
    this.ghostClock -= dt;
    if (player.dash > 0 && this.ghostClock <= 0 && world.active) {
      this.ghostClock = 0.028;
      this.ghosts.push({ x: player.x, y: player.y, angle: player.angle, age: 0 });
      if (this.ghosts.length > 12) this.ghosts.shift();
    }
    if (player.drifting && world.active && Math.random() < 0.6) {
      const back = player.angle + Math.PI;
      this.particles.spawn({
        x: player.x + Math.cos(back) * 16, y: player.y + Math.sin(back) * 16,
        vx: Math.cos(back + (Math.random() - 0.5)) * 60, vy: Math.sin(back + (Math.random() - 0.5)) * 60,
        life: 0.35, size: 7, color: world.paint, drag: 4,
      });
    }

    const celebrating = !attract && (world.status === 'chapter-complete' || (world.status === 'debrief' && world.currentResult?.final));
    if (celebrating && this.celebration?.world !== world) {
      this.celebration = { world, start: this.time, x: player.x, y: player.y };
      this.fireworkClock = 0.3;
    } else if (this.celebration && (this.celebration.world !== world || world.active)) {
      this.celebration = null;
    }
  }

  // ------------------------------------------------------------ city

  drawGround(context, world, view) {
    const { px, ox, oy, left, top, right, bottom } = view;
    // One fill for the asphalt; lots cover the rest.
    context.fillStyle = '#10161f';
    context.fillRect(left, top, right - left, bottom - top);
    const c0 = Math.floor(left / BLOCK);
    const c1 = Math.ceil(right / BLOCK);
    const r0 = Math.floor(top / BLOCK);
    const r1 = Math.ceil(bottom / BLOCK);

    // Curb lines and centre dashes, one path each, broken at crossings.
    context.beginPath();
    for (let c = c0; c <= c1; c++) {
      const x = c * BLOCK;
      for (let r = r0 - 1; r <= r1; r++) {
        const y0 = r * BLOCK + ROAD_HALF;
        const y1 = (r + 1) * BLOCK - ROAD_HALF;
        context.moveTo(x - ROAD_HALF + 9, y0); context.lineTo(x - ROAD_HALF + 9, y1);
        context.moveTo(x + ROAD_HALF - 9, y0); context.lineTo(x + ROAD_HALF - 9, y1);
      }
    }
    for (let r = r0; r <= r1; r++) {
      const y = r * BLOCK;
      for (let c = c0 - 1; c <= c1; c++) {
        const x0 = c * BLOCK + ROAD_HALF;
        const x1 = (c + 1) * BLOCK - ROAD_HALF;
        context.moveTo(x0, y - ROAD_HALF + 9); context.lineTo(x1, y - ROAD_HALF + 9);
        context.moveTo(x0, y + ROAD_HALF - 9); context.lineTo(x1, y + ROAD_HALF - 9);
      }
    }
    context.strokeStyle = 'rgba(139, 170, 205, .15)';
    context.lineWidth = 1;
    context.stroke();

    context.beginPath();
    for (let c = c0; c <= c1; c++) {
      for (let r = r0 - 1; r <= r1; r++) {
        context.moveTo(c * BLOCK, r * BLOCK + ROAD_HALF + 10);
        context.lineTo(c * BLOCK, (r + 1) * BLOCK - ROAD_HALF - 10);
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0 - 1; c <= c1; c++) {
        context.moveTo(c * BLOCK + ROAD_HALF + 10, r * BLOCK);
        context.lineTo((c + 1) * BLOCK - ROAD_HALF - 10, r * BLOCK);
      }
    }
    context.setLineDash([12, 16]);
    context.strokeStyle = 'rgba(216, 234, 255, .2)';
    context.lineWidth = 1.3;
    context.stroke();
    context.setLineDash([]);

    // Puddles in wet districts mirror the lights of lit blocks beside them.
    const rain = world.contract?.district?.rain || 0;
    if (this.level.puddles && rain >= 0.3) {
      const water = new Path2D();
      const shine = new Path2D();
      let reflections = null;
      for (let c = c0 - 1; c <= c1; c++) {
        for (let r = r0 - 1; r <= r1; r++) {
          const decor = this.decorFor(world.seed, c, r);
          for (const segment of [decor.x, decor.y]) {
            if (!segment.puddles.length) continue;
            const litAt = Math.min(this.blockLitAt(world, ...segment.blocks[0]), this.blockLitAt(world, ...segment.blocks[1]));
            const lit = this.time > litAt;
            for (const p of segment.puddles) {
              if (p.x < left - 40 || p.x > right + 40 || p.y < top - 40 || p.y > bottom + 40) continue;
              water.moveTo(p.x + p.rx, p.y);
              water.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU);
              shine.moveTo(p.x - p.rx * 0.6, p.y - p.ry * 0.35);
              shine.ellipse(p.x, p.y, p.rx * 0.7, p.ry * 0.55, 0, Math.PI * 1.1, Math.PI * 1.6);
              if (lit) {
                reflections ||= new Path2D();
                reflections.moveTo(p.x + p.rx * 0.8, p.y);
                reflections.ellipse(p.x, p.y, p.rx * 0.8, p.ry * 0.7, 0, 0, TAU);
              }
            }
          }
        }
      }
      context.fillStyle = 'rgba(70, 105, 165, .11)';
      context.fill(water);
      context.strokeStyle = 'rgba(190, 220, 255, .2)';
      context.lineWidth = 1.2;
      context.stroke(shine);
      if (reflections) {
        const shimmer = this.reducedMotion ? 1 : 0.85 + Math.sin(this.time * 2.2) * 0.15;
        context.globalCompositeOperation = 'lighter';
        context.fillStyle = rgba(this.accent, 0.07 * shimmer);
        context.fill(reflections);
        context.strokeStyle = rgba('#ffd98a', 0.22 * shimmer);
        context.lineWidth = 1.4;
        context.stroke(reflections);
        context.globalCompositeOperation = 'source-over';
      }
    }

    // Zebra crossings: two thin baked strips, blitted in device pixels.
    context.setTransform(1, 0, 0, 1, 0, 0);
    const across = this.small('zebra|x', () => bakeZebra(this.k, false));
    const along = this.small('zebra|y', () => bakeZebra(this.k, true));
    const exact = Math.abs(this.k - px) < 1e-6;
    const put = (sprite, wx, wy) => {
      const x = Math.round(wx * px + ox);
      const y = Math.round(wy * px + oy);
      if (exact) context.drawImage(sprite.canvas, x, y);
      else context.drawImage(sprite.canvas, x, y, sprite.w * px, sprite.h * px);
    };
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const x = c * BLOCK;
        const y = r * BLOCK;
        put(across, x - across.w / 2, y - ROAD_HALF - 16);
        put(across, x - across.w / 2, y + ROAD_HALF + 4);
        put(along, x - ROAD_HALF - 16, y - along.h / 2);
        put(along, x + ROAD_HALF + 4, y - along.h / 2);
      }
    }
    context.setTransform(px, 0, 0, px, ox, oy);

    // Traffic signals: two batched paths, plus soft glows when there is room.
    for (const horizontalRed of [true, false]) {
      const color = horizontalRed ? '#ff4669' : '#51f6c2';
      context.beginPath();
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          const horizontal = signalState(c, r, world.time) === 'horizontal';
          const x = c * BLOCK;
          const y = r * BLOCK;
          const pair = horizontal === horizontalRed ? [x - 29, y - 29, x + 29, y + 29] : [x - 29, y + 29, x + 29, y - 29];
          for (let i = 0; i < 4; i += 2) {
            context.moveTo(pair[i] + 3, pair[i + 1]);
            context.arc(pair[i], pair[i + 1], 3, 0, TAU);
            if (this.level.signals) this.glowAt(color, pair[i], pair[i + 1], 18, 0.45 * this.level.glow);
          }
        }
      }
      context.fillStyle = rgba(color, 0.55);
      context.fill();
    }
    this.flushGlows(context);
  }

  // Additive glows are queued in world units, then drawn in device pixels
  // from sprites baked at the exact size: each one is a plain blit, which
  // even a software canvas does quickly.
  glowAt(color, x, y, size, alpha = 1) {
    if (alpha > 0.01) this.glowQueue.push(color, x, y, size, alpha);
  }

  sizedGlow(color, diameter) {
    const key = `${color}|${diameter}`;
    let sprite = this.sizedGlows.get(key);
    if (!sprite) sprite = this.sizedGlows.set(key, bakeGlow(color, diameter));
    return sprite;
  }

  flushGlows(context, screen = false) {
    const queue = this.glowQueue;
    if (!queue.length) return;
    const view = this.viewRect;
    const px = screen ? this.dpr : view.px;
    const ox = screen ? 0 : view.ox;
    const oy = screen ? 0 : view.oy;
    const width = this.canvas.width;
    const height = this.canvas.height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < queue.length; i += 5) {
      const d = glowStep(queue[i + 3] * px);
      const x = Math.round(queue[i + 1] * px + ox - d / 2);
      const y = Math.round(queue[i + 2] * px + oy - d / 2);
      if (x > width || y > height || x + d < 0 || y + d < 0) continue;
      context.globalAlpha = Math.min(1, queue[i + 4]);
      context.drawImage(this.sizedGlow(queue[i], d), x, y);
    }
    queue.length = 0;
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    if (screen) context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    else context.setTransform(px, 0, 0, px, ox, oy);
  }

  // Blocks are blitted in device pixels at whole-pixel positions, the
  // fastest path a canvas has. Returns dark blocks worth pre-baking lit.
  drawBlocks(context, world, view) {
    const { px, ox, oy, left, top, right, bottom } = view;
    context.setTransform(1, 0, 0, 1, 0, 0);
    const pending = [];
    const c0 = Math.floor((left - LOT) / BLOCK);
    const c1 = Math.ceil(right / BLOCK);
    const r0 = Math.floor((top - LOT) / BLOCK);
    const r1 = Math.ceil(bottom / BLOCK);
    const size = SPRITE_SPAN * px;
    const flashSize = glowStep(size * 1.2);
    const flash = this.sizedGlow(this.accent, flashSize);
    const player = world.player;
    let visible = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const wx = c * BLOCK + ROAD_HALF - BLOCK_PAD;
        const wy = r * BLOCK + ROAD_HALF - BLOCK_PAD;
        if (wx > right || wy > bottom || wx + SPRITE_SPAN < left || wy + SPRITE_SPAN < top) continue;
        visible++;
        const scene = this.sceneFor(world.seed, c, r);
        const litAt = this.blockLitAt(world, c, r);
        const light = clamp((this.time - litAt) / LIGHT_FADE, 0, 1);
        const dx = Math.round(wx * px + ox);
        const dy = Math.round(wy * px + oy);
        const dark = light < 1 ? this.blockSprite(scene, false, true) : null;
        const lit = light > 0 ? this.blockSprite(scene, true, true) : null;
        if (light < 1) {
          if (dark) blit(context, dark, dx, dy, size, px);
          else flat(context, scene.flatDark, wx, wy, px, ox, oy);
        }
        if (light > 0) {
          context.globalAlpha = light;
          if (lit) blit(context, lit, dx, dy, size, px);
          else flat(context, scene.flatLit, wx, wy, px, ox, oy);
          context.globalAlpha = 1;
          if (light < 1) {
            // A warm flash as the light arrives.
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = Math.sin(light * Math.PI) * 0.7 * this.level.glow;
            context.drawImage(flash, Math.round(dx + size / 2 - flashSize / 2), Math.round(dy + size / 2 - flashSize / 2));
            context.globalAlpha = 1;
            context.globalCompositeOperation = 'source-over';
          }
        } else if (litAt - this.time < 1.5) {
          pending.unshift(scene);
        } else if (Math.abs(c * BLOCK + BLOCK / 2 - player.x) < BLOCK * 1.6 && Math.abs(r * BLOCK + BLOCK / 2 - player.y) < BLOCK * 1.6) {
          // Blocks beside the bike are the next to catch a spark.
          pending.push(scene);
        }
      }
    }
    this.visibleBlocks = visible;
    return pending;
  }

  // Lit signs breathe a little; everything else on the block is baked.
  drawStreetLights(context, world, view) {
    const { left, top, right, bottom } = view;
    if (this.reducedMotion || this.level.glow < 0.6) return;
    const c0 = Math.floor((left - LOT) / BLOCK);
    const c1 = Math.ceil(right / BLOCK);
    const r0 = Math.floor((top - LOT) / BLOCK);
    const r1 = Math.ceil(bottom / BLOCK);
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const scene = this.scenery.peek(`${c},${r}`);
        if (!scene?.sign) continue;
        const light = clamp((this.time - this.blockLitAt(world, c, r)) / LIGHT_FADE, 0, 1);
        if (light <= 0) continue;
        const flicker = 0.55 + Math.sin(this.time * 3.1 + c * 1.7 + r) * 0.25 + (hashFloat(Math.floor(this.time * 8), c, r) > 0.97 ? -0.3 : 0);
        const sx = c * BLOCK + ROAD_HALF + scene.sign.x;
        const sy = r * BLOCK + ROAD_HALF + scene.sign.y;
        this.glowAt(scene.sign.color, sx, sy, 64, light * flicker * 0.5 * this.level.glow);
      }
    }
    this.flushGlows(context);
  }

  drawLanterns(context, world, view) {
    if (!this.level.lanterns) return;
    const { left, top, right, bottom } = view;
    const c0 = Math.floor(left / BLOCK);
    const c1 = Math.ceil(right / BLOCK);
    const r0 = Math.floor(top / BLOCK);
    const r1 = Math.ceil(bottom / BLOCK);
    const strings = [];
    for (let c = c0 - 1; c <= c1; c++) {
      for (let r = r0 - 1; r <= r1; r++) {
        const decor = this.decorFor(world.seed, c, r);
        for (const item of [decor.x, decor.y, decor.cross]) {
          const string = item?.string;
          if (!string) continue;
          const mx = (string.x1 + string.x2) / 2;
          const my = (string.y1 + string.y2) / 2;
          if (mx < left - 80 || mx > right + 80 || my < top - 80 || my > bottom + 80) continue;
          let litAt = Infinity;
          for (const [bc, br] of item.blocks) litAt = Math.min(litAt, this.blockLitAt(world, bc, br));
          strings.push({ string, litAt });
        }
      }
    }
    if (!strings.length) return;
    context.beginPath();
    for (const { string } of strings) {
      const sag = (string.lanterns.length > 3 ? 9 : 7);
      context.moveTo(string.x1, string.y1);
      context.quadraticCurveTo((string.x1 + string.x2) / 2 + sag * 0.7, (string.y1 + string.y2) / 2 + sag * 2, string.x2, string.y2);
    }
    context.strokeStyle = 'rgba(20, 16, 30, .85)';
    context.lineWidth = 1.4;
    context.stroke();

    const sway = this.reducedMotion ? 0 : 1.4;
    const glows = [];
    for (const { string, litAt } of strings) {
      for (const lantern of string.lanterns) {
        const u = clamp((this.time - (litAt + 0.3 + lantern.index * 0.14)) / 0.32, 0, 1);
        const sprite = this.small(`lantern|${lantern.color}|${u > 0 ? 1 : 0}`, () => bakeLantern(lantern.color, u > 0, this.k));
        const x = lantern.x + Math.sin(this.time * 1.7 + lantern.x * 0.05) * sway;
        const pop = u > 0 && u < 1 && !this.reducedMotion ? 1 + Math.sin(u * Math.PI) * 0.55 : 1;
        // Unlit lanterns hang small and dim until their street lights up.
        const grow = u > 0 ? pop * (lantern.size / 6) : 0.75;
        const w = sprite.w * grow;
        const h = sprite.h * grow;
        context.globalAlpha = u > 0 ? 1 : 0.55;
        context.drawImage(sprite.canvas, x - w / 2, lantern.y - h / 2, w, h);
        context.globalAlpha = 1;
        if (u > 0) glows.push(x, lantern.y, u, lantern.color);
      }
    }
    const glow = this.level.glow;
    for (let i = 0; i < glows.length; i += 4) {
      this.glowAt(glows[i + 3], glows[i], glows[i + 1], 34, glows[i + 2] * 0.65 * glow);
      // A warm pool on the road under each lit lantern.
      if (glow >= 1) this.glowAt(glows[i + 3], glows[i], glows[i + 1] + 12, 50, glows[i + 2] * 0.16);
    }
    this.flushGlows(context);
  }

  drawLightWaves(context, world) {
    let any = false;
    for (const wave of world.lightWaves || []) {
      const age = this.time - wave.time;
      if (age < 0 || age > 1.6) continue;
      const progress = age / 1.6;
      const radius = 20 + wave.radius * Math.sqrt(progress);
      if (!any) {
        context.globalCompositeOperation = 'lighter';
        any = true;
      }
      context.beginPath();
      context.arc(wave.x, wave.y, radius, 0, TAU);
      context.strokeStyle = rgba('#ffd35c', (1 - progress) * 0.18);
      context.lineWidth = 34 * (1 - progress) + 6;
      context.stroke();
      context.strokeStyle = rgba('#ffe7a8', (1 - progress) * 0.6);
      context.lineWidth = 8 * (1 - progress) + 2;
      context.stroke();
    }
    if (any) context.globalCompositeOperation = 'source-over';
  }

  drawRoute(context, world) {
    if (!world.target || !world.active) return;
    const player = world.player;
    const points = [player, ...world.route.slice(world.routeIndex), world.target];
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) context.lineTo(points[index].x, points[index].y);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = rgba(this.accent, 0.17);
    context.lineWidth = 9;
    context.stroke();
    context.strokeStyle = rgba(this.accent, 0.75);
    context.lineWidth = 2;
    context.setLineDash([11, 15]);
    context.lineDashOffset = -world.time * 58;
    context.stroke();
    context.setLineDash([]);
    context.lineDashOffset = 0;
  }

  drawSparks(context, world, view) {
    if (!world.contract) return;
    const t = this.time;
    const visible = [];
    for (const spark of world.contract.sparks) {
      if (spark.taken || spark.x < view.left - 20 || spark.x > view.right + 20 || spark.y < view.top - 20 || spark.y > view.bottom + 20) continue;
      visible.push(spark);
    }
    if (!visible.length) return;
    for (const spark of visible) this.glowAt('#ffd35c', spark.x, spark.y, 34, 0.75 * this.level.glow);
    this.flushGlows(context);
    context.beginPath();
    for (const spark of visible) {
      const bob = this.reducedMotion ? 0 : Math.sin(t * 5 + spark.x * 0.05 + spark.y * 0.03);
      const size = 4.5 + bob * 1.2;
      context.moveTo(spark.x, spark.y - size * 1.5);
      context.lineTo(spark.x + size, spark.y);
      context.lineTo(spark.x, spark.y + size * 1.5);
      context.lineTo(spark.x - size, spark.y);
      context.closePath();
    }
    context.fillStyle = '#fff6c9';
    context.fill();
  }

  drawStops(context, world) {
    if (!world.contract) return;
    const legs = world.contract.legs;
    const current = Math.min(world.legIndex ?? 0, legs.length - 1);
    for (let leg = current; leg < legs.length; leg++) {
      for (const stop of legs[leg]) {
        if (stop.done || stop.kind === 'runner') continue;
        const color = STOP_COLORS[stop.kind] || '#ffc857';
        const strength = leg === current ? 1 : 0.28;
        this.glowAt(color, stop.x, stop.y, 120, 0.28 * this.level.glow * strength);
        this.glowAt(color, stop.x, stop.y, 44, 0.8 * strength);
      }
    }
    this.flushGlows(context);
    context.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.textAlign = 'center';
    for (let leg = current; leg < legs.length; leg++) {
      for (const stop of legs[leg]) {
        if (stop.done || stop.kind === 'runner') continue;
        this.drawStop(context, stop, leg === current ? 1 : 0.28);
      }
    }
  }

  drawStop(context, stop, strength) {
    const color = STOP_COLORS[stop.kind] || '#ffc857';
    const t = this.time;
    const pulse = 0.5 + Math.sin(t * 4 + stop.x * 0.01) * 0.18;
    context.save();
    context.translate(stop.x, stop.y);
    context.globalAlpha = strength;
    context.strokeStyle = rgba(color, 0.32);
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, 30 + pulse * 14, 0, TAU);
    context.stroke();
    context.strokeStyle = rgba(color, 0.88);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 21, -t * 2, -t * 2 + Math.PI * 1.45);
    context.stroke();
    context.fillStyle = color;
    if (stop.kind === 'cell') {
      roundedRect(context, -7, -10, 14, 20, 3);
      context.fill();
      context.fillRect(-3, -13, 6, 3);
      context.fillStyle = '#07111c';
      context.beginPath();
      context.moveTo(1, -7); context.lineTo(-4, 1); context.lineTo(0, 1); context.lineTo(-1, 7); context.lineTo(4, -1); context.lineTo(0, -1);
      context.closePath();
      context.fill();
    } else if (stop.kind === 'piece') {
      context.rotate(Math.sin(t * 2) * 0.2);
      context.fillRect(-10, -7, 20, 14);
      context.beginPath();
      context.moveTo(-10, -7); context.lineTo(0, 1); context.lineTo(10, -7);
      context.lineWidth = 1.6;
      context.strokeStyle = '#07111c';
      context.stroke();
    } else if (stop.kind === 'drop') {
      // A little lantern waiting for its light.
      context.beginPath();
      context.ellipse(0, 0, 8, 10, 0, 0, TAU);
      context.fill();
      context.fillStyle = '#07111c';
      context.fillRect(-4, -13, 8, 3);
      context.fillRect(-4, 10, 8, 3);
    } else {
      roundedRect(context, -8, -8, 16, 16, 3);
      context.fill();
      context.fillStyle = '#07111c';
      context.fillRect(-8, -1.5, 16, 3);
    }
    if (strength >= 1) {
      context.fillStyle = rgba(color, 0.95);
      context.fillText(stop.name ? stop.name.toUpperCase() : STOP_LABELS[stop.kind], 0, -50);
    }
    context.restore();
  }

  // Arrows at the edge of the view point at stops that are off screen.
  drawGuide(context, world, view) {
    if (!world.active || !world.contract) return;
    const player = world.player;
    const halfWidth = (view.right - view.left) / 2;
    const halfHeight = (view.bottom - view.top) / 2;
    const leg = world.contract.legs[Math.min(world.legIndex ?? 0, world.contract.legs.length - 1)];
    for (const stop of leg) {
      if (stop.done) continue;
      const dx = stop.x - player.x;
      const dy = stop.y - player.y;
      if (Math.abs(dx) < halfWidth * 0.8 && Math.abs(dy) < halfHeight * 0.8) continue;
      const angle = Math.atan2(dy, dx);
      const reach = Math.min(Math.abs(halfWidth * 0.82 / (Math.cos(angle) || 1e-6)), Math.abs(halfHeight * 0.78 / (Math.sin(angle) || 1e-6)));
      const color = stop.kind === 'runner' ? '#ff9e5c' : stop.kind === 'drop' ? '#ffc857' : '#65f5c1';
      const x = player.x + Math.cos(angle) * reach;
      const y = player.y + Math.sin(angle) * reach;
      this.glowAt(color, x, y, 44, 0.55);
      this.flushGlows(context);
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.fillStyle = rgba(color, 0.92);
      context.beginPath();
      context.moveTo(14, 0);
      context.lineTo(-8, -11);
      context.lineTo(-3, 0);
      context.lineTo(-8, 11);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  drawTrail(context, world) {
    const trail = world.player.trail;
    if (trail.length < 2) return;
    const paint = world.paint;
    // Segments are grouped into a few alpha bands so the whole trail is a
    // handful of strokes.
    const bands = 4;
    const paths = [];
    for (let band = 0; band < bands * 2; band++) paths.push([]);
    for (let index = 1; index < trail.length; index++) {
      const point = trail[index];
      const life = 1 - point.age / 2.5;
      if (life <= 0) continue;
      const band = Math.min(bands - 1, Math.floor(life * bands));
      paths[band + (point.drifting ? bands : 0)].push(trail[index - 1], point);
    }
    context.lineCap = 'round';
    context.globalCompositeOperation = 'lighter';
    for (let slot = 0; slot < paths.length; slot++) {
      const segments = paths[slot];
      if (!segments.length) continue;
      const drifting = slot >= bands;
      const life = ((slot % bands) + 0.5) / bands;
      context.beginPath();
      for (let i = 0; i < segments.length; i += 2) {
        context.moveTo(segments[i].x, segments[i].y);
        context.lineTo(segments[i + 1].x, segments[i + 1].y);
      }
      if (this.level.glow >= 0.7) {
        context.strokeStyle = rgba(paint, life * (drifting ? 0.16 : 0.08));
        context.lineWidth = drifting ? 16 * life + 4 : 9 * life + 3;
        context.stroke();
      }
      context.strokeStyle = rgba(paint, 0.05 + life * (drifting ? 0.6 : 0.3));
      context.lineWidth = drifting ? 5.5 * life + 1.5 : 3 * life + 1;
      context.stroke();
    }
    context.globalCompositeOperation = 'source-over';
  }

  drawEchoes(context, world, view) {
    for (const echo of world.echoes) {
      if (!echo.alive || echo.x < view.left - 80 || echo.x > view.right + 80 || echo.y < view.top - 80 || echo.y > view.bottom + 80) continue;
      context.beginPath();
      for (let index = 0; index < echo.points.length; index++) {
        const point = echo.points[index];
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.strokeStyle = rgba(world.paint, 0.22);
      context.lineWidth = 3;
      context.setLineDash([5, 8]);
      context.lineDashOffset = -world.time * 55;
      context.stroke();
      context.setLineDash([]);
      // The decoy is a ghost of the bike, heading the way its path goes.
      const t = clamp(echo.time / echo.duration, 0, 1) * (echo.points.length - 1);
      const a = echo.points[Math.floor(t)];
      const b = echo.points[Math.min(echo.points.length - 1, Math.floor(t) + 1)];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const bike = this.small(`bike|${world.paint}`, () => bakeBike(world.paint, this.k));
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = 0.45 + Math.sin(this.time * 12) * 0.1;
      drawRotated(context, bike, echo.x, echo.y, angle);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    }
  }

  drawTraffic(context, world, view) {
    const lights = [];
    for (const vehicle of world.traffic) {
      const position = trafficPosition(vehicle);
      if (position.x < view.left - 40 || position.x > view.right + 40 || position.y < view.top - 40 || position.y > view.bottom + 40) continue;
      const angle = vehicle.axis === 'x' ? (vehicle.dir > 0 ? 0 : Math.PI) : (vehicle.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const length = Math.round(vehicle.length);
      const sprite = this.small(`car|${vehicle.color}|${length}`, () => bakeCar(vehicle.color, length, this.k));
      drawRotated(context, sprite, position.x, position.y, angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      lights.push(position.x + cos * (length / 2 + 12), position.y + sin * (length / 2 + 12));
    }
    if (!lights.length || this.level.glow < 0.7) return;
    for (let i = 0; i < lights.length; i += 2) this.glowAt('#e9f6ff', lights[i], lights[i + 1], 32, 0.35 * this.level.glow);
    this.flushGlows(context);
  }

  drawPatrols(context, world, view) {
    for (const patrol of world.patrols) {
      if (patrol.x < view.left - 340 || patrol.x > view.right + 340 || patrol.y < view.top - 340 || patrol.y > view.bottom + 340) continue;
      const scanColor = patrol.jammed ? '#9aa9bc' : patrol.chasingEcho ? world.paint : patrol.alert > 0 ? '#ffb347' : '#ff4f74';
      if (!patrol.jammed) {
        // Two nested wedges read as a soft beam without a gradient.
        const spread = Math.acos(SCAN_CONE);
        const strength = 0.55 + patrol.scan * 0.45;
        context.beginPath();
        context.moveTo(patrol.x, patrol.y);
        context.arc(patrol.x, patrol.y, SCAN_RANGE, patrol.angle - spread, patrol.angle + spread);
        context.closePath();
        context.fillStyle = rgba(scanColor, 0.07 * strength);
        context.fill();
        context.beginPath();
        context.moveTo(patrol.x, patrol.y);
        context.arc(patrol.x, patrol.y, SCAN_RANGE * 0.58, patrol.angle - spread * 0.9, patrol.angle + spread * 0.9);
        context.closePath();
        context.fillStyle = rgba(scanColor, 0.12 * strength);
        context.fill();
        context.strokeStyle = rgba(scanColor, 0.3 * strength);
        context.lineWidth = 1.5;
        context.stroke();
      }
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 4 + patrol.flash * 3) * 1.5;
      const body = this.small(`drone|${scanColor}`, () => bakeDrone(scanColor, this.k));
      drawRotated(context, body, patrol.x, patrol.y + bob, patrol.angle);
      const flash = Math.floor((world.time + patrol.flash) * 7) % 2 === 0;
      this.glowAt(flash ? '#ff4f74' : '#4ba7ff', patrol.x - 9, patrol.y - 14 + bob, 18, 0.9);
      this.glowAt(flash ? '#4ba7ff' : '#ff4f74', patrol.x + 9, patrol.y - 14 + bob, 18, 0.9);
      this.flushGlows(context);
      if (patrol.mode === 'sentry' && patrol.alert > 0 && !patrol.jammed) {
        context.fillStyle = '#ffb347';
        context.font = '900 22px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('!', patrol.x, patrol.y - 28);
      }
    }
  }

  drawRunner(context, world) {
    const runner = world.runner;
    if (!runner) return;
    const t = this.time;
    const hop = runner.caught || this.reducedMotion ? 0 : Math.abs(Math.sin(t * 12)) * 4;
    if (!runner.caught) {
      context.strokeStyle = 'rgba(255, 158, 92, .55)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(runner.x, runner.y, 30 + Math.sin(t * 6) * 4, 0, TAU);
      context.stroke();
    }
    const sprite = this.small(`runner|${runner.kind}`, () => bakeRunner(runner.kind, this.k));
    // Squash on landing, stretch in the air.
    const stretch = 1 + (hop / 4) * 0.12;
    const w = sprite.w / stretch;
    const h = sprite.h * stretch;
    if (runner.kind === 'cat') {
      context.strokeStyle = '#ff9e4a';
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(runner.x + 9, runner.y + 7 - hop);
      context.quadraticCurveTo(runner.x + 20, runner.y + 8 + Math.sin(t * 9) * 6 - hop, runner.x + 18, runner.y - 4 - hop);
      context.stroke();
    }
    context.drawImage(sprite.canvas, runner.x - w / 2, runner.y - hop - h / 2, w, h);
    if (runner.kind !== 'cat') {
      this.glowAt(Math.floor(t * 6) % 2 ? '#ff5fb7' : '#ffd35c', runner.x, runner.y - 18 - hop, 18, 1);
      this.flushGlows(context);
    }
  }

  drawPulse(context, world) {
    const player = world.player;
    if (player.pulse <= 0) return;
    const progress = 1 - player.pulse / 0.55;
    const radius = 20 + world.stats.pulseRadius * progress;
    context.globalCompositeOperation = 'lighter';
    context.beginPath();
    context.arc(player.x, player.y, radius, 0, TAU);
    context.strokeStyle = rgba(world.paint, (1 - progress) * 0.16);
    context.lineWidth = 16;
    context.stroke();
    context.strokeStyle = rgba(world.paint, (1 - progress) * 0.5);
    context.lineWidth = 3 - progress * 1.5;
    context.stroke();
    context.globalCompositeOperation = 'source-over';
  }

  drawPlayer(context, world) {
    const player = world.player;
    const paint = world.paint;
    const bike = this.small(`bike|${paint}`, () => bakeBike(paint, this.k));
    if (this.ghosts.length) {
      context.globalCompositeOperation = 'lighter';
      for (const ghost of this.ghosts) {
        context.globalAlpha = (1 - ghost.age / 0.3) * 0.4;
        drawRotated(context, bike, ghost.x, ghost.y, ghost.angle);
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    }
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);
    const lean = this.reducedMotion ? 0 : this.lean;
    // The shadow slides out from under the bike as it leans.
    context.fillStyle = 'rgba(0, 0, 0, .42)';
    context.beginPath();
    context.ellipse(player.x + 3 - sin * lean * 5, player.y + 9 + cos * lean * 5, 22, 10 - Math.abs(lean) * 2, player.angle, 0, TAU);
    context.fill();

    const thrust = clamp(player.speed / 260, 0.25, 1.2) * (this.reducedMotion ? 1 : 0.85 + Math.random() * 0.3);
    this.glowAt(paint, player.x - cos * 22, player.y - sin * 22, 26 + thrust * 22, 0.75);
    this.glowAt('#ffffff', player.x - cos * 20, player.y - sin * 20, 10 + thrust * 6, 0.7);
    if (player.dash > 0) this.glowAt('#ffffff', player.x, player.y, 90, 0.35);
    this.flushGlows(context);

    const blink = player.damageCooldown > 0 && player.dash <= 0 && Math.floor(this.time * 18) % 2 === 0;
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    context.scale(1, 1 - Math.abs(lean) * 0.22);
    context.translate(0, lean * 2.5);
    context.globalAlpha = blink ? 0.45 : 1;
    context.drawImage(bike.canvas, -bike.w / 2, -bike.h / 2, bike.w, bike.h);
    context.restore();
  }

  drawParticles(context, view, screen) {
    const items = this.particles.items;
    if (!items.length) return;
    const { px, ox, oy } = view;
    for (const p of items) {
      if (p.screen !== screen || p.kind !== 'glow') continue;
      const fade = 1 - p.age / p.life;
      this.glowAt(p.color, p.x, p.y, p.size * (0.6 + fade * 0.6), fade);
    }
    this.flushGlows(context, screen);
    const base = context.getTransform();
    for (const p of items) {
      if (p.screen !== screen || p.kind !== 'confetti') continue;
      const fade = Math.min(1, (1 - p.age / p.life) * 2);
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      const s = screen ? this.dpr : px;
      const tx = screen ? 0 : ox;
      const ty = screen ? 0 : oy;
      context.setTransform(s * cos, s * sin, -s * sin * 0.5, s * cos * 0.5, tx + p.x * s, ty + p.y * s);
      context.globalAlpha = fade;
      context.fillStyle = p.color;
      context.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
    }
    context.globalAlpha = 1;
    context.setTransform(base);
  }

  drawRings(context) {
    if (!this.rings.length) return;
    context.globalCompositeOperation = 'lighter';
    for (const ring of this.rings) {
      const u = ring.age / ring.life;
      const ease = 1 - (1 - u) * (1 - u);
      context.beginPath();
      context.arc(ring.x, ring.y, 8 + ring.radius * ease, 0, TAU);
      context.strokeStyle = rgba(ring.color, (1 - u) * 0.8);
      context.lineWidth = ring.width * (1 - u) + 0.5;
      context.stroke();
    }
    context.globalCompositeOperation = 'source-over';
  }

  drawFireworks(context, dt) {
    this.fireworkClock -= dt;
    if (this.fireworkClock > 0) return;
    const calm = this.reducedMotion;
    this.fireworkClock = calm ? 1.4 : 0.38 + Math.random() * 0.35;
    const x = this.width * (0.12 + Math.random() * 0.76);
    const y = this.height * (0.1 + Math.random() * 0.4);
    const color = FESTIVAL[Math.floor(Math.random() * FESTIVAL.length)];
    const count = calm ? 14 : 34;
    for (const v of burst(count, calm ? 120 : 240)) {
      this.particles.spawn({ x, y, vx: v.vx, vy: v.vy, life: 1.1 + Math.random() * 0.5, size: 10 + Math.random() * 6, color, drag: 1.6, gravity: 70, screen: true });
    }
    this.particles.spawn({ x, y, life: 0.35, size: 120, color: '#fff3c4', drag: 0, screen: true });
  }

  drawRain(context, world) {
    const amount = (world.contract?.district?.rain || 0.2) * this.level.rain;
    if (amount <= 0.01) return;
    const count = Math.floor(this.rain.length * amount);
    const time = this.reducedMotion ? world.time * 0.35 : world.time;
    const shades = [0.22, 0.34, 0.48];
    context.lineWidth = 1;
    for (let bucket = 0; bucket < 3; bucket++) {
      context.beginPath();
      for (let index = bucket; index < count; index += 3) {
        const drop = this.rain[index];
        const x = mod(drop.x * this.width + time * 75 * drop.speed, this.width + 90) - 45;
        const y = mod(drop.y * this.height + time * 330 * drop.speed, this.height + 90) - 45;
        context.moveTo(x, y);
        context.lineTo(x - 4, y + drop.length);
      }
      context.strokeStyle = `rgba(155, 204, 255, ${shades[bucket] * Math.min(1, amount + 0.25)})`;
      context.stroke();
    }
  }

  // The vignette is a CSS layer over the canvas (index.html), composited
  // for free; only the damage flash is drawn here.
  drawScreenEffects(context, world) {
    if (world.player.damageCooldown > 0 && world.player.dash <= 0) {
      context.fillStyle = 'rgb(255, 57, 95)';
      context.globalAlpha = Math.min(0.25, world.player.damageCooldown * 0.22);
      context.fillRect(0, 0, this.width, this.height);
      context.globalAlpha = 1;
    }
  }

  // The HUD minimap redraws at about 15 frames a second; it changes slowly.
  drawMiniMap(canvas, world, now = performance.now()) {
    if (now - this.miniAt < 66) return;
    this.miniAt = now;
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const player = world.player;
    const radius = 850;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#07101c';
    context.fillRect(0, 0, width, height);
    const scale = width / (radius * 2);
    context.setTransform(scale, 0, 0, scale, width / 2 - player.x * scale, height / 2 - player.y * scale);

    // Lit blocks glow in the district colour.
    context.fillStyle = rgba(this.accent || '#3fe5ff', 0.4);
    context.beginPath();
    for (const key of world.lit.keys()) {
      let cell = this.miniKeys.get(key);
      if (!cell) {
        const [c, r] = key.split(',').map(Number);
        cell = { x: c * BLOCK + ROAD_HALF, y: r * BLOCK + ROAD_HALF };
        this.miniKeys.set(key, cell);
      }
      if (Math.abs(cell.x - player.x) > radius + BLOCK || Math.abs(cell.y - player.y) > radius + BLOCK) continue;
      context.rect(cell.x, cell.y, LOT, LOT);
    }
    context.fill();

    context.beginPath();
    for (let x = Math.floor((player.x - radius) / BLOCK) * BLOCK; x <= player.x + radius; x += BLOCK) {
      context.moveTo(x, player.y - radius);
      context.lineTo(x, player.y + radius);
    }
    for (let y = Math.floor((player.y - radius) / BLOCK) * BLOCK; y <= player.y + radius; y += BLOCK) {
      context.moveTo(player.x - radius, y);
      context.lineTo(player.x + radius, y);
    }
    context.strokeStyle = 'rgba(164, 196, 224, .2)';
    context.lineWidth = 11;
    context.stroke();

    if (world.contract) {
      const leg = world.contract.legs[Math.min(world.legIndex ?? 0, world.contract.legs.length - 1)];
      for (const stop of leg) {
        if (stop.done) continue;
        context.fillStyle = stop.kind === 'runner' ? '#ff9e5c' : stop.kind === 'drop' ? '#ffc857' : '#65f5c1';
        context.beginPath();
        context.arc(stop.x, stop.y, 34, 0, TAU);
        context.fill();
      }
    }
    for (const patrol of world.patrols) {
      context.fillStyle = patrol.chasingEcho ? world.paint : '#ff4f74';
      context.beginPath();
      context.arc(patrol.x, patrol.y, 18, 0, TAU);
      context.fill();
    }
    context.fillStyle = world.paint;
    context.beginPath();
    context.arc(player.x, player.y, 27, 0, TAU);
    context.fill();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.strokeStyle = 'rgba(210, 241, 255, .28)';
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
  }
}

// ---------------------------------------------------------------- helpers

// Glow diameters snap to a few sizes so the baked sprites can be reused.
function glowStep(diameter) {
  if (diameter < 24) return Math.max(2, Math.round(diameter / 2) * 2);
  if (diameter < 96) return Math.round(diameter / 6) * 6;
  return Math.round(diameter / 16) * 16;
}

function blit(context, entry, dx, dy, size, px) {
  if (entry.k === px) context.drawImage(entry.canvas, dx, dy);
  else context.drawImage(entry.canvas, dx, dy, size, size);
}

function flat(context, color, wx, wy, px, ox, oy) {
  context.fillStyle = color;
  const x = (wx + BLOCK_PAD) * px + ox;
  const y = (wy + BLOCK_PAD) * px + oy;
  context.fillRect(Math.round(x), Math.round(y), Math.round(LOT * px), Math.round(LOT * px));
}

function drawRotated(context, sprite, x, y, angle) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
  context.restore();
}

// One zebra crossing: stripes across a street, 12 units deep.
function bakeZebra(k, vertical) {
  const length = ROAD_HALF * 2 - 20;
  const w = vertical ? 12 : length;
  const h = vertical ? length : 12;
  const canvas = makeCanvas(w * k, h * k);
  const g = canvas.getContext('2d');
  g.scale(k, k);
  g.fillStyle = 'rgba(225, 235, 250, .11)';
  for (let i = 2; i < length - 3; i += 9) {
    if (vertical) g.fillRect(0, i, 12, 5);
    else g.fillRect(i, 0, 5, 12);
  }
  return { canvas, w, h };
}
