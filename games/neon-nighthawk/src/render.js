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

  draw(world) {
    this.resize();
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
    this.drawRoute(context, world);
    this.drawBeacon(context, world);
    this.drawTrail(context, world.player, world.paint);
    this.drawEchoes(context, world, camera, halfWidth, halfHeight);
    this.drawTraffic(context, world, camera, halfWidth, halfHeight);
    this.drawPatrols(context, world, camera, halfWidth, halfHeight);
    this.drawPulse(context, world);
    this.drawPlayer(context, world.player, world.paint);
    context.restore();

    this.drawRain(context, world);
    this.drawScreenEffects(context, world);
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

        context.fillStyle = `hsl(${block.hue} 24% ${8 + Math.round(block.height * 8)}%)`;
        context.fillRect(x, y, size, size);
        context.fillStyle = `hsl(${block.hue} 25% ${5 + Math.round(block.height * 5)}%)`;
        context.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
        context.strokeStyle = alpha(accent, 0.06 + glow * 0.08);
        context.lineWidth = 1.2;
        context.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);

        const columns = 3 + (block.seed % 3);
        const rows = 3 + ((block.seed >>> 4) % 3);
        const windowWidth = (size - inset * 2 - 16) / columns;
        const windowHeight = (size - inset * 2 - 18) / rows;
        for (let wx = 0; wx < columns; wx++) {
          for (let wy = 0; wy < rows; wy++) {
            const lit = hashFloat(column * 12 + wx, row * 9 + wy, world.seed) > 0.37;
            if (!lit) continue;
            const warm = hashFloat(column * 4 + wx, row * 7 + wy, 32) > 0.65;
            context.fillStyle = warm
              ? `rgba(255, 189, 91, ${0.12 + glow * 0.16})`
              : alpha(accent, 0.08 + glow * 0.11);
            context.fillRect(x + inset + 8 + wx * windowWidth, y + inset + 9 + wy * windowHeight, windowWidth * 0.38, windowHeight * 0.16);
          }
        }

        if (block.sign) {
          const side = (block.seed >>> 12) & 1;
          context.save();
          context.translate(x + size * (side ? 0.79 : 0.22), y + size * 0.48);
          context.fillStyle = alpha(accent, 0.45);
          context.shadowColor = accent;
          context.shadowBlur = 14;
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

  drawBeacon(context, world) {
    const target = world.target;
    if (!target) return;
    const player = world.player;
    const pickup = world.status === 'pickup';
    const color = pickup ? '#65f5c1' : '#ffc857';
    const pulse = 0.5 + Math.sin(world.time * 4) * 0.18;
    context.save();
    context.translate(target.x, target.y);
    context.strokeStyle = alpha(color, 0.22);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 28 + pulse * 12, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = alpha(color, 0.74);
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(0, 0, 18, -world.time * 2, -world.time * 2 + Math.PI * 1.45);
    context.stroke();
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 24;
    context.beginPath();
    context.arc(0, 0, 5.5, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = alpha(color, 0.85);
    context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.textAlign = 'center';
    context.fillText(pickup ? 'PICKUP' : 'DROP', 0, -47);
    context.restore();

    // Guide arrow appears only when the destination is outside the immediate
    // play area; the actual route remains visible in the streets.
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    if (Math.hypot(dx, dy) > 680) {
      context.save();
      context.translate(player.x, player.y);
      context.rotate(Math.atan2(dy, dx));
      context.fillStyle = alpha(color, 0.8);
      context.beginPath();
      context.moveTo(62, 0);
      context.lineTo(45, -9);
      context.lineTo(45, 9);
      context.closePath();
      context.fill();
      context.restore();
    }
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
      const scanColor = patrol.jammed ? '#9aa9bc' : patrol.chasingEcho ? world.paint : '#ff4f74';
      if (!patrol.jammed) {
        context.fillStyle = alpha(scanColor, patrol.chasingEcho ? 0.06 : 0.08);
        context.beginPath();
        context.moveTo(10, 0);
        context.lineTo(258, -76);
        context.lineTo(258, 76);
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
    if (world.target) {
      context.fillStyle = world.status === 'pickup' ? '#65f5c1' : '#ffc857';
      context.beginPath();
      context.arc(world.target.x, world.target.y, 32, 0, Math.PI * 2);
      context.fill();
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
