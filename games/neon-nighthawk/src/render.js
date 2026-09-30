import {
  BLOCK,
  ROAD,
  ROAD_HALF,
  blockAt,
  districtGlow,
  signalState,
  trafficPosition,
} from './city.js';
import { clamp, hashFloat, lerp, mod } from './math.js';
import { SCAN_CONE, SCAN_RANGE } from './world.js';

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function alpha(color, amount) {
  if (!color.startsWith('#')) return color;
  const hex = color.slice(1);
  const value = hex.length === 3
    ? hex.split('').map((part) => parseInt(part + part, 16))
    : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((part) => parseInt(part, 16));
  return `rgba(${value[0]}, ${value[1]}, ${value[2]}, ${amount})`;
}

function inView(x, y, camera, halfWidth, halfHeight, margin = 80) {
  return x > camera.x - halfWidth - margin && x < camera.x + halfWidth + margin &&
    y > camera.y - halfHeight - margin && y < camera.y + halfHeight + margin;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.camera = { x: 0, y: 0, ready: false };
    this.rain = Array.from({ length: 180 }, (_, index) => ({
      x: hashFloat(index, 3, 77),
      y: hashFloat(index, 5, 31),
      speed: 0.55 + hashFloat(index, 7, 18) * 1.2,
      length: 8 + hashFloat(index, 11, 89) * 16,
      shade: 0.18 + hashFloat(index, 13, 51) * 0.35,
    }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  view(world) {
    const scale = clamp(Math.min(this.width / 1060, this.height / 760) * 0.98, 0.62, 1.04);
    const player = world.player;
    if (!this.camera.ready || Math.hypot(this.camera.x - player.x, this.camera.y - player.y) > 900) {
      this.camera.x = player.x;
      this.camera.y = player.y;
      this.camera.ready = true;
    } else {
      this.camera.x = lerp(this.camera.x, player.x, 0.12);
      this.camera.y = lerp(this.camera.y, player.y, 0.12);
    }
    return {
      scale,
      camera: this.camera,
      halfWidth: this.width / (2 * scale),
      halfHeight: this.height / (2 * scale),
    };
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

  draw(world, { now = performance.now() } = {}) {
    this.resize();
    this.time = this.displayTime(world, now);
    const context = this.context;
    const { scale, camera, halfWidth, halfHeight } = this.view(world);
    const district = world.contract?.district;
    const sky = district?.sky || '#070c18';

    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const gradient = context.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, sky);
    gradient.addColorStop(1, '#030509');
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);

    context.save();
    context.translate(this.width / 2, this.height / 2);
    context.scale(scale, scale);
    context.translate(-camera.x, -camera.y);
    this.drawCity(context, world, camera, halfWidth, halfHeight);
    this.drawLightWaves(context, world);
    this.drawRoute(context, world);
    this.drawSparks(context, world, camera, halfWidth, halfHeight);
    this.drawStops(context, world);
    this.drawTrail(context, world.player, world.paint);
    this.drawEchoes(context, world, camera, halfWidth, halfHeight);
    this.drawTraffic(context, world, camera, halfWidth, halfHeight);
    this.drawPatrols(context, world, camera, halfWidth, halfHeight);
    this.drawRunner(context, world);
    this.drawPulse(context, world);
    this.drawPlayer(context, world.player, world.paint);
    this.drawGuide(context, world, halfWidth, halfHeight);
    context.restore();

    this.drawRain(context, world);
    this.drawScreenEffects(context, world);
    if (world.status === 'chapter-complete' || (world.status === 'debrief' && world.currentResult?.final)) {
      this.drawFireworks(context, now / 1000);
    }
  }

  drawCity(context, world, camera, halfWidth, halfHeight) {
    const left = camera.x - halfWidth - BLOCK;
    const right = camera.x + halfWidth + BLOCK;
    const top = camera.y - halfHeight - BLOCK;
    const bottom = camera.y + halfHeight + BLOCK;
    const firstColumn = Math.floor(left / BLOCK) - 1;
    const lastColumn = Math.ceil(right / BLOCK) + 1;
    const firstRow = Math.floor(top / BLOCK) - 1;
    const lastRow = Math.ceil(bottom / BLOCK) + 1;
    const district = world.contract?.district;
    const accent = district?.accent || '#3fe5ff';

    context.fillStyle = '#070b13';
    context.fillRect(left, top, right - left, bottom - top);

    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const x = column * BLOCK + ROAD_HALF;
        const y = row * BLOCK + ROAD_HALF;
        const block = blockAt(x, y, world.seed);
        const size = BLOCK - ROAD;
        const inset = block.inset;
        const glow = districtGlow(world.seed, x, y);
        const litAt = world.lit?.get(`${column},${row}`);
        // 0 while HALO has the block dark, easing to 1 as the light arrives.
        const light = litAt === undefined ? 0 : clamp((this.time - litAt) / 0.7, 0, 1);

        const saturation = Math.round(6 + light * 52);
        context.fillStyle = `hsl(${block.hue} ${saturation}% ${7 + Math.round(block.height * 6 + light * 10)}%)`;
        context.fillRect(x, y, size, size);
        context.fillStyle = `hsl(${block.hue} ${saturation}% ${4 + Math.round(block.height * 4 + light * 8)}%)`;
        context.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
        if (light > 0) {
          const roof = context.createRadialGradient(x + size / 2, y + size / 2, 4, x + size / 2, y + size / 2, size * 0.7);
          roof.addColorStop(0, `hsla(${block.hue} 90% 60% / ${0.2 * light})`);
          roof.addColorStop(1, 'hsla(0 0% 0% / 0)');
          context.fillStyle = roof;
          context.fillRect(x, y, size, size);
        }
        if (light > 0) {
          context.save();
          context.strokeStyle = alpha(accent, 0.25 + light * 0.45);
          context.shadowColor = accent;
          context.shadowBlur = 16 * light;
          context.lineWidth = 2;
          context.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
          context.restore();
        } else {
          context.strokeStyle = 'rgba(120, 140, 170, .07)';
          context.lineWidth = 1.2;
          context.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
        }

        const columns = 3 + (block.seed % 3);
        const rows = 3 + ((block.seed >>> 4) % 3);
        const windowWidth = (size - inset * 2 - 16) / columns;
        const windowHeight = (size - inset * 2 - 18) / rows;
        for (let wx = 0; wx < columns; wx++) {
          for (let wy = 0; wy < rows; wy++) {
            const chance = hashFloat(column * 12 + wx, row * 9 + wy, world.seed);
            // In the dark only a few windows glow; lit blocks come alive.
            if (chance < 0.37 || (light === 0 && chance < 0.86)) continue;
            const warm = hashFloat(column * 4 + wx, row * 7 + wy, 32) > 0.55;
            const strength = light === 0 ? 0.07 : 0.35 + glow * 0.4 * light;
            context.fillStyle = warm
              ? `rgba(255, 196, 102, ${strength})`
              : alpha(accent, strength);
            context.fillRect(x + inset + 8 + wx * windowWidth, y + inset + 9 + wy * windowHeight, windowWidth * 0.5, windowHeight * 0.22);
          }
        }

        if (block.sign && light > 0) {
          const side = (block.seed >>> 12) & 1;
          const hue = ['#ff5fb7', '#3fe5ff', '#ffc857', '#6df0bd', '#c775ff'][(block.seed >>> 3) % 5];
          context.save();
          context.globalAlpha = light;
          context.translate(x + size * (side ? 0.79 : 0.22), y + size * 0.48);
          context.fillStyle = alpha(hue, 0.85);
          context.shadowColor = hue;
          context.shadowBlur = 20;
          roundedRect(context, -9, -22, 18, 44, 3);
          context.fill();
          context.fillStyle = 'rgba(5, 8, 15, .9)';
          context.fillRect(-4, -15, 8, 4);
          context.fillRect(-4, -4, 8, 4);
          context.fillRect(-4, 7, 8, 4);
          context.restore();
        }
      }
    }

    context.fillStyle = '#111827';
    for (let column = firstColumn; column <= lastColumn; column++) {
      context.fillRect(column * BLOCK - ROAD_HALF, top, ROAD, bottom - top);
    }
    for (let row = firstRow; row <= lastRow; row++) {
      context.fillRect(left, row * BLOCK - ROAD_HALF, right - left, ROAD);
    }

    context.strokeStyle = 'rgba(139, 170, 205, .16)';
    context.lineWidth = 1;
    for (let column = firstColumn; column <= lastColumn; column++) {
      const x = column * BLOCK;
      context.beginPath();
      context.moveTo(x - ROAD_HALF + 9, top);
      context.lineTo(x - ROAD_HALF + 9, bottom);
      context.moveTo(x + ROAD_HALF - 9, top);
      context.lineTo(x + ROAD_HALF - 9, bottom);
      context.stroke();
    }
    for (let row = firstRow; row <= lastRow; row++) {
      const y = row * BLOCK;
      context.beginPath();
      context.moveTo(left, y - ROAD_HALF + 9);
      context.lineTo(right, y - ROAD_HALF + 9);
      context.moveTo(left, y + ROAD_HALF - 9);
      context.lineTo(right, y + ROAD_HALF - 9);
      context.stroke();
    }

    context.strokeStyle = 'rgba(216, 234, 255, .22)';
    context.lineWidth = 1.2;
    context.setLineDash([12, 17]);
    context.lineDashOffset = -world.time * 42;
    for (let column = firstColumn; column <= lastColumn; column++) {
      context.beginPath();
      context.moveTo(column * BLOCK, top);
      context.lineTo(column * BLOCK, bottom);
      context.stroke();
    }
    for (let row = firstRow; row <= lastRow; row++) {
      context.beginPath();
      context.moveTo(left, row * BLOCK);
      context.lineTo(right, row * BLOCK);
      context.stroke();
    }
    context.setLineDash([]);

    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const state = signalState(column, row, world.time);
        const red = state === 'horizontal' ? '#ff4669' : '#51f6c2';
        const green = state === 'horizontal' ? '#51f6c2' : '#ff4669';
        this.drawSignal(context, column * BLOCK - 29, row * BLOCK - 29, red);
        this.drawSignal(context, column * BLOCK + 29, row * BLOCK + 29, red);
        this.drawSignal(context, column * BLOCK - 29, row * BLOCK + 29, green);
        this.drawSignal(context, column * BLOCK + 29, row * BLOCK - 29, green);
      }
    }
  }

  drawSignal(context, x, y, color) {
    context.save();
    context.fillStyle = alpha(color, 0.32);
    context.shadowColor = color;
    context.shadowBlur = 9;
    context.beginPath();
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  drawRoute(context, world) {
    if (!world.target || !world.active) return;
    const player = world.player;
    const points = [player, ...world.route.slice(world.routeIndex), world.target];
    context.save();
    context.strokeStyle = alpha(world.contract.district.accent, 0.19);
    context.lineWidth = 8;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) context.lineTo(points[index].x, points[index].y);
    context.stroke();
    context.strokeStyle = alpha(world.contract.district.accent, 0.72);
    context.lineWidth = 1.8;
    context.setLineDash([11, 15]);
    context.lineDashOffset = -world.time * 58;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) context.lineTo(points[index].x, points[index].y);
    context.stroke();
    context.restore();
  }

  drawStops(context, world) {
    if (!world.contract) return;
    const legs = world.contract.legs;
    const current = Math.min(world.legIndex ?? 0, legs.length - 1);
    for (let leg = current; leg < legs.length; leg++) {
      for (const stop of legs[leg]) {
        if (stop.done || stop.kind === 'runner') continue;
        this.drawStop(context, world, stop, leg === current ? 1 : 0.28);
      }
    }
  }

  drawStop(context, world, stop, strength) {
    const colors = { pickup: '#65f5c1', drop: '#ffc857', cell: '#6df0bd', piece: '#ff5fb7' };
    const labels = { pickup: 'PICKUP', drop: 'DROP', cell: 'SPARK CELL', piece: 'PIECE' };
    const color = colors[stop.kind] || '#ffc857';
    const t = world.time;
    const pulse = 0.5 + Math.sin(t * 4 + stop.x * 0.01) * 0.18;
    context.save();
    context.translate(stop.x, stop.y);
    context.globalAlpha = strength;
    context.strokeStyle = alpha(color, 0.3);
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, 30 + pulse * 14, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = alpha(color, 0.85);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 21, -t * 2, -t * 2 + Math.PI * 1.45);
    context.stroke();
    context.shadowColor = color;
    context.shadowBlur = 24;
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
      context.fillStyle = '#07111c';
      context.beginPath();
      context.moveTo(-10, -7); context.lineTo(0, 1); context.lineTo(10, -7);
      context.lineWidth = 1.6;
      context.strokeStyle = '#07111c';
      context.stroke();
    } else if (stop.kind === 'drop') {
      // A little lantern waiting for its light.
      context.beginPath();
      context.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
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
    context.shadowBlur = 0;
    if (strength >= 1) {
      context.fillStyle = alpha(color, 0.95);
      context.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.textAlign = 'center';
      context.fillText(stop.name ? stop.name.toUpperCase() : labels[stop.kind], 0, -50);
    }
    context.restore();
  }

  // Arrows at the edge of the view point at stops that are off screen.
  drawGuide(context, world, halfWidth, halfHeight) {
    if (!world.active || !world.contract) return;
    const player = world.player;
    const leg = world.contract.legs[Math.min(world.legIndex ?? 0, world.contract.legs.length - 1)];
    for (const stop of leg) {
      if (stop.done) continue;
      const dx = stop.x - player.x;
      const dy = stop.y - player.y;
      if (Math.abs(dx) < halfWidth * 0.8 && Math.abs(dy) < halfHeight * 0.8) continue;
      const angle = Math.atan2(dy, dx);
      const reach = Math.min(Math.abs(halfWidth * 0.82 / (Math.cos(angle) || 1e-6)), Math.abs(halfHeight * 0.78 / (Math.sin(angle) || 1e-6)));
      const color = stop.kind === 'runner' ? '#ff9e5c' : stop.kind === 'drop' ? '#ffc857' : '#65f5c1';
      context.save();
      context.translate(player.x + Math.cos(angle) * reach, player.y + Math.sin(angle) * reach);
      context.rotate(angle);
      context.fillStyle = alpha(color, 0.9);
      context.shadowColor = color;
      context.shadowBlur = 12;
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

  drawSparks(context, world, camera, halfWidth, halfHeight) {
    if (!world.contract) return;
    const t = world.time;
    context.save();
    context.fillStyle = '#fff6c9';
    context.shadowColor = '#ffd35c';
    context.shadowBlur = 12;
    for (const spark of world.contract.sparks) {
      if (spark.taken || !inView(spark.x, spark.y, camera, halfWidth, halfHeight, 20)) continue;
      const bob = Math.sin(t * 5 + spark.x * 0.05 + spark.y * 0.03);
      const size = 4.5 + bob * 1.2;
      context.beginPath();
      context.moveTo(spark.x, spark.y - size * 1.5);
      context.lineTo(spark.x + size, spark.y);
      context.lineTo(spark.x, spark.y + size * 1.5);
      context.lineTo(spark.x - size, spark.y);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  drawLightWaves(context, world) {
    for (const wave of world.lightWaves || []) {
      const age = this.time - wave.time;
      if (age < 0 || age > 1.6) continue;
      const progress = age / 1.6;
      context.save();
      context.strokeStyle = `rgba(255, 226, 150, ${(1 - progress) * 0.55})`;
      context.lineWidth = 10 * (1 - progress) + 2;
      context.shadowColor = '#ffd35c';
      context.shadowBlur = 30;
      context.beginPath();
      context.arc(wave.x, wave.y, 20 + wave.radius * Math.sqrt(progress), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  drawRunner(context, world) {
    const runner = world.runner;
    if (!runner) return;
    const t = world.time;
    context.save();
    context.translate(runner.x, runner.y);
    const hop = runner.caught ? 0 : Math.abs(Math.sin(t * 12)) * 4;
    context.translate(0, -hop);
    if (!runner.caught) {
      context.strokeStyle = 'rgba(255, 158, 92, .55)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, hop, 30 + Math.sin(t * 6) * 4, 0, Math.PI * 2);
      context.stroke();
    }
    context.shadowColor = runner.kind === 'cat' ? '#ffb35c' : '#c775ff';
    context.shadowBlur = 16;
    if (runner.kind === 'cat') {
      context.fillStyle = '#ff9e4a';
      context.beginPath();
      context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(-10, -4); context.lineTo(-8, -16); context.lineTo(-2, -9);
      context.moveTo(10, -4); context.lineTo(8, -16); context.lineTo(2, -9);
      context.fill();
      context.strokeStyle = '#ff9e4a';
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(9, 7);
      context.quadraticCurveTo(20, 8 + Math.sin(t * 9) * 6, 18, -4);
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = '#1b1024';
      context.beginPath();
      context.arc(-4, -1, 1.8, 0, Math.PI * 2);
      context.arc(4, -1, 1.8, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = '#d9c4ff';
      roundedRect(context, -11, -10, 22, 18, 6);
      context.fill();
      context.strokeStyle = '#d9c4ff';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, -10);
      context.lineTo(0, -17);
      context.stroke();
      context.fillStyle = Math.floor(t * 6) % 2 ? '#ff5fb7' : '#ffd35c';
      context.beginPath();
      context.arc(0, -18, 3, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#1b1024';
      context.fillRect(-6, -5, 4, 4);
      context.fillRect(2, -5, 4, 4);
      context.fillStyle = '#6df0bd';
      context.fillRect(-5, 3, 10, 2);
    }
    context.restore();
  }

  drawFireworks(context, time) {
    const colors = ['#ff5fb7', '#3fe5ff', '#ffc857', '#6df0bd', '#c775ff'];
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const cycle = 1.9 + i * 0.29;
      const phase = ((time + i * 0.71) % cycle) / cycle;
      const seed = Math.floor((time + i * 0.71) / cycle) * 13 + i * 7;
      const cx = this.width * (0.15 + hashFloat(seed, 1, 5) * 0.7);
      const cy = this.height * (0.12 + hashFloat(seed, 2, 5) * 0.4);
      const color = colors[(seed >>> 0) % colors.length];
      const radius = Math.min(this.width, this.height) * 0.16 * Math.sqrt(phase);
      context.fillStyle = alpha(color, (1 - phase) * 0.9);
      context.shadowColor = color;
      context.shadowBlur = 14;
      for (let k = 0; k < 28; k++) {
        const angle = (k / 28) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius + phase * phase * 40;
        context.beginPath();
        context.arc(x, y, 4 * (1 - phase) + 1, 0, Math.PI * 2);
        context.fill();
        context.fillRect(x - Math.cos(angle) * radius * 0.25, y - Math.sin(angle) * radius * 0.25, 1.5, 1.5);
      }
    }
    context.restore();
  }

  drawTrail(context, player, paint) {
    const trail = player.trail;
    if (trail.length < 2) return;
    context.save();
    context.lineCap = 'round';
    for (let index = 1; index < trail.length; index++) {
      const previous = trail[index - 1];
      const point = trail[index];
      const life = 1 - point.age / 2.5;
      if (life <= 0) continue;
      context.strokeStyle = alpha(paint, 0.05 + life * (point.drifting ? 0.55 : 0.26));
      context.lineWidth = point.drifting ? 5.5 * life + 1.5 : 3 * life + 1;
      context.shadowColor = paint;
      context.shadowBlur = point.drifting ? 13 : 5;
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
  }

  drawEchoes(context, world, camera, halfWidth, halfHeight) {
    for (const echo of world.echoes) {
      if (!inView(echo.x, echo.y, camera, halfWidth, halfHeight)) continue;
      context.save();
      context.strokeStyle = alpha(world.paint, 0.22);
      context.lineWidth = 3;
      context.setLineDash([5, 8]);
      context.lineDashOffset = -world.time * 55;
      context.beginPath();
      for (let index = 0; index < echo.points.length; index++) {
        const point = echo.points[index];
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
      context.setLineDash([]);
      context.translate(echo.x, echo.y);
      context.fillStyle = alpha(world.paint, 0.42);
      context.shadowColor = world.paint;
      context.shadowBlur = 24;
      context.beginPath();
      context.moveTo(15, 0);
      context.lineTo(-9, -7);
      context.lineTo(-4, 0);
      context.lineTo(-9, 7);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  drawTraffic(context, world, camera, halfWidth, halfHeight) {
    for (const vehicle of world.traffic) {
      const position = trafficPosition(vehicle);
      if (!inView(position.x, position.y, camera, halfWidth, halfHeight)) continue;
      context.save();
      context.translate(position.x, position.y);
      context.rotate(vehicle.axis === 'x' ? (vehicle.dir > 0 ? 0 : Math.PI) : (vehicle.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      context.fillStyle = 'rgba(3, 6, 12, .55)';
      roundedRect(context, -vehicle.length / 2 + 3, -7 + 4, vehicle.length, 14, 5);
      context.fill();
      context.fillStyle = vehicle.color;
      context.shadowColor = vehicle.color;
      context.shadowBlur = 6;
      roundedRect(context, -vehicle.length / 2, -7, vehicle.length, 14, 5);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#071018';
      roundedRect(context, -vehicle.length * 0.13, -5, vehicle.length * 0.36, 10, 3);
      context.fill();
      context.fillStyle = 'rgba(235, 250, 255, .92)';
      context.fillRect(vehicle.length / 2 - 3, -4, 2, 3);
      context.fillRect(vehicle.length / 2 - 3, 1, 2, 3);
      context.restore();
    }
  }

  drawPatrols(context, world, camera, halfWidth, halfHeight) {
    for (const patrol of world.patrols) {
      if (!inView(patrol.x, patrol.y, camera, halfWidth, halfHeight, 300)) continue;
      context.save();
      context.translate(patrol.x, patrol.y);
      context.rotate(patrol.angle);
      const scanColor = patrol.jammed ? '#9aa9bc' : patrol.chasingEcho ? world.paint : patrol.alert > 0 ? '#ffb347' : '#ff4f74';
      if (!patrol.jammed) {
        const spread = Math.acos(SCAN_CONE);
        const cone = context.createRadialGradient(0, 0, 10, 0, 0, SCAN_RANGE);
        cone.addColorStop(0, alpha(scanColor, 0.2 + patrol.scan * 0.25));
        cone.addColorStop(1, alpha(scanColor, 0));
        context.fillStyle = cone;
        context.beginPath();
        context.moveTo(0, 0);
        context.arc(0, 0, SCAN_RANGE, -spread, spread);
        context.closePath();
        context.fill();
      }
      context.fillStyle = '#101827';
      context.shadowColor = scanColor;
      context.shadowBlur = 12;
      roundedRect(context, -17, -10, 34, 20, 6);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#4e6680';
      roundedRect(context, -7, -7, 16, 14, 4);
      context.fill();
      const flash = Math.floor((world.time + patrol.flash) * 7) % 2 === 0;
      context.fillStyle = flash ? '#ff4f74' : '#4ba7ff';
      context.shadowColor = context.fillStyle;
      context.shadowBlur = 10;
      context.fillRect(-12, -11, 8, 3);
      context.fillStyle = flash ? '#4ba7ff' : '#ff4f74';
      context.fillRect(4, -11, 8, 3);
      context.restore();
      if (patrol.mode === 'sentry' && patrol.alert > 0 && !patrol.jammed) {
        context.save();
        context.fillStyle = '#ffb347';
        context.shadowColor = '#ffb347';
        context.shadowBlur = 12;
        context.font = '900 22px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('!', patrol.x, patrol.y - 26);
        context.restore();
      }
    }
  }

  drawPulse(context, world) {
    const player = world.player;
    if (player.pulse <= 0) return;
    const progress = 1 - player.pulse / 0.55;
    const radius = 20 + world.stats.pulseRadius * progress;
    context.save();
    context.strokeStyle = alpha(world.paint, (1 - progress) * 0.42);
    context.lineWidth = 3 - progress * 1.5;
    context.shadowColor = world.paint;
    context.shadowBlur = 14;
    context.beginPath();
    context.arc(player.x, player.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  drawPlayer(context, player, paint) {
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    context.fillStyle = 'rgba(0, 0, 0, .45)';
    context.beginPath();
    context.ellipse(2, 8, 23, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = paint;
    context.shadowBlur = player.dash > 0 ? 30 : 18;
    context.fillStyle = alpha(paint, player.dash > 0 ? 1 : 0.85);
    context.beginPath();
    context.moveTo(24, 0);
    context.lineTo(5, -9);
    context.lineTo(-17, -13);
    context.lineTo(-10, 0);
    context.lineTo(-17, 13);
    context.lineTo(5, 9);
    context.closePath();
    context.fill();
    context.fillStyle = '#07111c';
    context.shadowBlur = 0;
    context.beginPath();
    context.moveTo(11, 0);
    context.lineTo(-3, -5);
    context.lineTo(-9, 0);
    context.lineTo(-3, 5);
    context.closePath();
    context.fill();
    context.fillStyle = '#d9faff';
    context.fillRect(15, -3, 6, 6);
    context.fillStyle = alpha(paint, 0.85);
    context.fillRect(-19, -4, 7, 3);
    context.fillRect(-19, 1, 7, 3);
    context.restore();
  }

  drawRain(context, world) {
    const amount = world.contract?.district?.rain || 0.2;
    if (amount <= 0) return;
    context.save();
    context.globalCompositeOperation = 'screen';
    context.lineWidth = 1;
    for (let index = 0; index < Math.floor(this.rain.length * amount); index++) {
      const drop = this.rain[index];
      const x = mod(drop.x * this.width + world.time * 75 * drop.speed, this.width + 90) - 45;
      const y = mod(drop.y * this.height + world.time * 330 * drop.speed, this.height + 90) - 45;
      context.strokeStyle = `rgba(155, 204, 255, ${drop.shade * amount})`;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 4, y + drop.length);
      context.stroke();
    }
    context.restore();
  }

  drawScreenEffects(context, world) {
    const scan = context.createLinearGradient(0, 0, 0, this.height);
    scan.addColorStop(0, 'rgba(124, 188, 255, .025)');
    scan.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    scan.addColorStop(1, 'rgba(0, 0, 0, .18)');
    context.fillStyle = scan;
    context.fillRect(0, 0, this.width, this.height);

    const vignette = context.createRadialGradient(
      this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.18,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, .48)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, this.width, this.height);

    if (world.player.damageCooldown > 0 && world.player.dash <= 0) {
      context.fillStyle = `rgba(255, 57, 95, ${world.player.damageCooldown * 0.22})`;
      context.fillRect(0, 0, this.width, this.height);
    }
  }

  drawMiniMap(canvas, world) {
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const player = world.player;
    const radius = 850;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#07101c';
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(width / 2, height / 2);
    const scale = width / (radius * 2);
    context.scale(scale, scale);
    context.translate(-player.x, -player.y);
    context.strokeStyle = 'rgba(164, 196, 224, .2)';
    context.lineWidth = 11;
    for (let coordinate = Math.floor((player.x - radius) / BLOCK) * BLOCK; coordinate <= player.x + radius; coordinate += BLOCK) {
      context.beginPath();
      context.moveTo(coordinate, player.y - radius);
      context.lineTo(coordinate, player.y + radius);
      context.stroke();
    }
    for (let coordinate = Math.floor((player.y - radius) / BLOCK) * BLOCK; coordinate <= player.y + radius; coordinate += BLOCK) {
      context.beginPath();
      context.moveTo(player.x - radius, coordinate);
      context.lineTo(player.x + radius, coordinate);
      context.stroke();
    }
    if (world.contract) {
      const leg = world.contract.legs[Math.min(world.legIndex ?? 0, world.contract.legs.length - 1)];
      for (const stop of leg) {
        if (stop.done) continue;
        context.fillStyle = stop.kind === 'runner' ? '#ff9e5c' : stop.kind === 'drop' ? '#ffc857' : '#65f5c1';
        context.beginPath();
        context.arc(stop.x, stop.y, 34, 0, Math.PI * 2);
        context.fill();
      }
    }
    for (const patrol of world.patrols) {
      context.fillStyle = patrol.chasingEcho ? world.paint : '#ff4f74';
      context.beginPath();
      context.arc(patrol.x, patrol.y, 18, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = world.paint;
    context.beginPath();
    context.arc(player.x, player.y, 27, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = 'rgba(210, 241, 255, .28)';
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
  }
}
