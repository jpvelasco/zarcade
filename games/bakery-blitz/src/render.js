// Draws the bakery. Reads the shift and never changes it. The shop itself is
// baked into one backdrop canvas per layout, so a frame is blits, paths for
// faces and bubbles, and a capped handful of particles.
import { STATIONS, CUSTOMERS, heartsFor } from './recipes.js';
import { Sprites, STATION_SLOTS, roundRect, makeCanvas } from './sprites.js';

const MAX_PARTICLES = 150;
const TAU = Math.PI * 2;

const INK = '#4a2c1a';
const CREAM = '#fff6ea';
const WOOD = '#8a5128';
const WOOD_DARK = '#6a3c1c';

export class ShopView {
  constructor(canvas, { reduceMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.reduceMotion = reduceMotion;
    this.sprites = new Sprites();
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.shift = null;
    this.decor = {};
    this.backdrop = null;
    this.zones = [];
    this.particles = [];
    this.floats = [];
    this.anim = new Map();
    this.time = 0;
    this.shake = 0;
    this.hover = null;
    this.cursor = -1;
    this.helper = { x: 0, t: 0, on: false };
    this.selected = null;
  }

  setShift(shift, { decor = {} } = {}) {
    this.shift = shift;
    this.decor = decor;
    this.particles.length = 0;
    this.floats.length = 0;
    this.anim.clear();
    this.backdrop = null;
    this.cursor = -1;
    if (this.w) this.layout();
  }

  resize(cssW, cssH) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cssW === this.w && cssH === this.h && dpr === this.dpr) return;
    this.w = cssW;
    this.h = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.backdrop = null;
    this.layout();
  }

  // ----------------------------------------------------------------- layout

  layout() {
    if (!this.shift || !this.w) return;
    const { w, h } = this;
    const portrait = h > w * 1.05;
    const pad = Math.max(6, Math.min(14, w * 0.014));
    const seats = this.shift.seats.length;
    const doorW = Math.min(w * (portrait ? 0.1 : 0.12), 86);
    // On a phone the customers are as wide as a fifth of the screen, so the
    // front of the shop only takes the height it needs and the kitchen keeps
    // the rest.
    const seatW = (w - doorW - pad * 2) / seats;
    let seatH;
    let winH;
    if (portrait) {
      const body = Math.min(seatW * 0.95, h * 0.2);
      // Tall enough for a bubble of big, tappable order chips.
      const front = body * 2.6;
      winH = Math.max(h * 0.09, Math.min(h * 0.17, front * 0.5));
      seatH = Math.min(h * 0.5, front + winH + pad);
    } else {
      seatH = h * 0.5;
      winH = seatH * 0.6;
    }
    const counterH = Math.min(h * 0.13, Math.max(66, seatH * 0.26));
    const L = {
      pad,
      portrait,
      seatTop: 0,
      seatH,
      counterY: seatH,
      counterH,
      stationY: seatH + counterH,
      stationH: h - seatH - counterH,
      doorW,
      winH,
    };
    this.L = L;
    this.zones = [];

    // Seats sit in a row to the right of the door.
    this.seatBoxes = [];
    for (let i = 0; i < seats; i++) {
      const box = {
        x: L.doorW + pad + seatW * i, y: L.seatTop, w: seatW, h: L.seatH,
      };
      this.seatBoxes.push(box);
      this.zones.push({ kind: 'seat', index: i, ...box });
    }

    // The counter runs the full width; its slots are where dishes wait.
    this.counterBox = { x: pad, y: L.counterY + 2, w: w - pad * 2, h: L.counterH - 4 };
    this.zones.push({ kind: 'counter', index: -1, ...this.counterBox });
    const slots = this.shift.counterSlots;
    const slotW = this.counterBox.w / slots;
    this.slotBoxes = [];
    for (let i = 0; i < slots; i++) {
      this.slotBoxes.push({
        x: this.counterBox.x + slotW * i, y: this.counterBox.y,
        w: slotW, h: this.counterBox.h,
      });
    }

    // Stations: one row on a wide screen, a tidy grid on a phone.
    const n = this.shift.stations.length;
    // A phone gets the squarest grid that keeps rows of at most four.
    const rows = portrait ? Math.ceil(n / 4) : 1;
    const cols = portrait ? Math.ceil(n / rows) : n;
    // Cap the tiles: three stations should not each be the size of a door.
    const cellW = Math.min((w - pad * (cols + 1)) / cols, 220);
    const cellH = Math.min((L.stationH - pad * (rows + 1)) / rows, portrait ? 185 : 215);
    this.stationBoxes = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const offset = (w - (pad * (inRow + 1) + cellW * inRow)) / 2;
      const col = i - row * cols;
      const rowsH = rows * cellH + (rows - 1) * pad;
      const top = L.stationY + (L.stationH - rowsH) / 2;
      const box = {
        x: offset + pad + col * (cellW + pad),
        y: top + row * (cellH + pad),
        w: cellW,
        h: cellH,
      };
      this.stationBoxes.push(box);
      this.zones.push({ kind: 'station', index: i, ...box });
    }
  }

  // Everything inside one seat: where the customer stands, where the hearts
  // float, and the grid of ticket chips in the bubble over their head.
  seatMetrics(index) {
    const seat = this.shift.seats[index];
    const box = this.seatBoxes[index];
    const customer = seat && seat.customer;
    const feet = box.y + box.h * 0.99;
    const bodySize = Math.min(box.w * 0.92, box.h * 0.52);
    const headTop = feet - bodySize;
    const heartSize = Math.min(box.w * 0.19, 24);
    const heartY = headTop - heartSize - 7;
    const metrics = { box, customer, feet, bodySize, headTop, heartSize, heartY, chips: [], bubble: null };
    if (!customer || customer.state !== 'seated') return metrics;
    const count = customer.tickets.length;
    const most = Math.min(box.h * (this.L.portrait ? 0.17 : 0.21), 44);
    // The biggest chip that fits `n` across the seat.
    const across = (n) => (box.w * 0.94) / (n + (n - 1) * 0.14);
    // Chips that would be cramped in one row wrap, and then grow to fill it.
    const perRow = count === 1 || across(count) >= most * 0.8 ? count : Math.ceil(count / 2);
    const size = Math.min(most, across(perRow));
    const gap = size * 0.14;
    const rows = Math.ceil(count / perRow);
    const bubbleH = rows * size + (rows - 1) * gap + size * 0.44;
    const bubbleW = perRow * size + (perRow - 1) * gap + size * 0.44;
    const bubbleX = box.x + (box.w - bubbleW) / 2;
    const bubbleY = Math.max(box.y + 2, heartY - 10 - bubbleH);
    metrics.bubble = { x: bubbleX, y: bubbleY, w: bubbleW, h: bubbleH, size };
    customer.tickets.forEach((ticket, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, count - row * perRow);
      const rowW = inRow * size + (inRow - 1) * gap;
      metrics.chips.push({
        ticket,
        x: box.x + (box.w - rowW) / 2 + (i - row * perRow) * (size + gap),
        y: bubbleY + size * 0.22 + row * (size + gap),
        w: size,
        h: size,
      });
    });
    return metrics;
  }

  chipBoxes(seatIndex) {
    return this.seatMetrics(seatIndex).chips;
  }

  hit(x, y) {
    if (!this.shift || !this.L) return null;
    for (let i = 0; i < this.shift.seats.length; i++) {
      for (const chip of this.chipBoxes(i)) {
        // Small chips get a wider touch margin, so every chip is a 48 px target.
        const m = Math.max(7, (48 - chip.w) / 2);
        if (x >= chip.x - m && x <= chip.x + chip.w + m && y >= chip.y - m && y <= chip.y + chip.h + m) {
          return { kind: 'ticket', id: chip.ticket.id, state: chip.ticket.state };
        }
      }
    }
    // Stations and the counter are the big targets, so they win ties.
    for (const zone of this.zones) {
      if (zone.kind === 'seat') continue;
      if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) return zone;
    }
    for (const zone of this.zones) {
      if (zone.kind !== 'seat') continue;
      if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) return zone;
    }
    return null;
  }

  // --------------------------------------------------------------- backdrop

  bakeBackdrop() {
    const { w, h, L } = this;
    const canvas = makeCanvas(Math.floor(w * this.dpr), Math.floor(h * this.dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    this.paintRoom(ctx, w, h, L);
    this.backdrop = canvas;

    // The display case is its own layer, drawn after the customers, so they
    // stand on the far side of the glass instead of on top of it.
    const front = makeCanvas(Math.floor(w * this.dpr), Math.floor(h * this.dpr));
    const fctx = front.getContext('2d');
    fctx.scale(this.dpr, this.dpr);
    this.paintCase(fctx, w, L);
    this.caseLayer = front;
  }

  paintRoom(ctx, w, h, L) {
    const wallH = L.stationY;
    const wall = ctx.createLinearGradient(0, 0, 0, wallH);
    wall.addColorStop(0, '#ffeacf');
    wall.addColorStop(1, '#efc496');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, wallH);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    for (let x = 0; x < w; x += 68) ctx.fillRect(x, 0, 28, wallH);
    // panelled dado along the bottom of the wall
    const wainY = L.counterY - L.seatH * 0.16;
    ctx.fillStyle = 'rgba(176,112,62,0.26)';
    ctx.fillRect(0, wainY, w, wallH - wainY);
    ctx.fillStyle = 'rgba(120,70,40,0.26)';
    ctx.fillRect(0, wainY, w, 5);
    ctx.strokeStyle = 'rgba(255,246,234,0.3)';
    ctx.lineWidth = 2;
    const panel = Math.max(70, w / 12);
    for (let x = panel * 0.5; x < w; x += panel) {
      roundRect(ctx, x, wainY + 12, panel * 0.62, Math.max(10, wallH - wainY - 22), 5);
      ctx.stroke();
    }

    this.paintWindow(ctx, w, L);
    this.paintWallBits(ctx, w, L);
    this.paintDoor(ctx, L);

    if (this.decor.chairs) {
      for (const box of this.seatBoxes) {
        // Just the back of an armchair, peeking up behind each customer.
        const body = Math.min(box.w * 0.92, box.h * 0.52);
        const top = box.y + box.h - body * 0.46;
        const cw = Math.min(box.w * 0.72, body * 1.05);
        roundRect(ctx, box.x + (box.w - cw) / 2, top, cw, box.h - (top - box.y), cw * 0.3);
        ctx.fillStyle = 'rgba(176,100,132,0.85)';
        ctx.fill();
        roundRect(ctx, box.x + (box.w - cw) / 2 + cw * 0.1, top + 8, cw * 0.8, box.h - (top - box.y), cw * 0.24);
        ctx.fillStyle = 'rgba(205,131,159,0.9)';
        ctx.fill();
      }
    }

    // the kitchen floor
    const floor = ctx.createLinearGradient(0, L.stationY, 0, h);
    floor.addColorStop(0, '#cf9068');
    floor.addColorStop(1, '#a3643c');
    ctx.fillStyle = floor;
    ctx.fillRect(0, L.stationY, w, h - L.stationY);
    ctx.strokeStyle = 'rgba(90,50,30,0.16)';
    ctx.lineWidth = 2;
    const tile = Math.max(46, w / 13);
    for (let x = -tile; x < w + tile * 2; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, L.stationY);
      ctx.lineTo(x - tile * 0.28, h);
      ctx.stroke();
    }
    for (let y = L.stationY + tile * 0.62; y < h; y += tile * 0.62) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,30,14,0.14)';
    ctx.fillRect(0, L.stationY, w, 6);
  }

  paintWindow(ctx, w, L) {
    const x = L.doorW + L.pad;
    const width = w - x - L.pad;
    const top = L.pad * 0.9;
    const height = L.winH;
    const sky = ctx.createLinearGradient(0, top, 0, top + height);
    sky.addColorStop(0, '#22335c');
    sky.addColorStop(0.5, '#5a5789');
    sky.addColorStop(1, '#e0a284');
    ctx.save();
    roundRect(ctx, x, top, width, height, 10);
    ctx.fillStyle = sky;
    ctx.fill();
    roundRect(ctx, x, top, width, height, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,246,214,0.95)';
    ctx.beginPath();
    ctx.arc(x + width * 0.9, top + height * 0.28, Math.max(9, height * 0.14), 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(x + ((i * 149) % width), top + ((i * 41) % (height * 0.4)), 2, 2);
    }
    // rooftops, then a pavement strip so the street has a floor
    const step = width / 11;
    for (let i = 0; i < 12; i++) {
      const bx = x + i * step - step * 0.1;
      const bh = height * (0.26 + ((i * 53) % 19) / 46);
      const roof = height * 0.08;
      ctx.fillStyle = i % 2 ? '#3b3356' : '#4a3d64';
      ctx.beginPath();
      ctx.moveTo(bx, top + height - bh + roof);
      ctx.lineTo(bx + step * 0.42, top + height - bh);
      ctx.lineTo(bx + step * 0.84, top + height - bh + roof);
      ctx.lineTo(bx + step * 0.84, top + height);
      ctx.lineTo(bx, top + height);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,214,120,0.92)';
      const lamp = Math.max(3, step * 0.14);
      for (let k = 0; k < 2; k++) {
        if ((i + k) % 3) {
          ctx.fillRect(bx + step * 0.18 + k * step * 0.36, top + height - bh + roof + lamp * 1.2, lamp, lamp * 1.2);
        }
      }
    }
    ctx.fillStyle = 'rgba(60,46,74,0.9)';
    ctx.fillRect(x, top + height - Math.max(5, height * 0.08), width, height);
    ctx.restore();
    // frame
    roundRect(ctx, x, top, width, height, 10);
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,246,234,0.92)';
    ctx.lineWidth = 4;
    const panes = Math.max(2, Math.round(width / 230));
    ctx.beginPath();
    for (let i = 1; i < panes; i++) {
      ctx.moveTo(x + (width * i) / panes, top);
      ctx.lineTo(x + (width * i) / panes, top + height);
    }
    ctx.stroke();
    roundRect(ctx, x - 7, top + height - 3, width + 14, 12, 5);
    ctx.fillStyle = '#e9d6bb';
    ctx.fill();
    ctx.fillStyle = 'rgba(120,70,40,0.2)';
    ctx.fillRect(x - 7, top + height + 7, width + 14, 3);

    if (this.decor.flowers) {
      const fw = Math.min(120, width * 0.2);
      const fy = top + height - fw * 0.34;
      ctx.drawImage(this.sprites.flowers, x + 10, fy, fw, fw * 0.72);
      ctx.drawImage(this.sprites.flowers, x + width - fw - 10, fy, fw, fw * 0.72);
    }
  }

  paintWallBits(ctx, w, L) {
    // two pendant lamps over the front of the shop
    const lampY = L.winH * 0.42;
    for (const t of [0.3, 0.74]) {
      const x = L.doorW + (w - L.doorW) * t;
      const r = Math.min(20, L.seatH * 0.07);
      ctx.strokeStyle = 'rgba(60,30,14,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, lampY + r * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r, lampY + r * 1.1);
      ctx.quadraticCurveTo(x, lampY + r * 0.1, x + r, lampY + r * 1.1);
      ctx.closePath();
      ctx.fillStyle = '#d8623f';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,40,20,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, lampY + r * 1.2, r * 0.34, 0, TAU);
      ctx.fillStyle = '#fff3c4';
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.sprites.glowWarm, x - r * 2.2, lampY + r * 0.2, r * 4.4, r * 4.4);
      ctx.globalAlpha = 1;
    }
    if (this.decor.jukebox) {
      const jw = Math.min(66, L.doorW * 0.8);
      ctx.drawImage(this.sprites.jukebox, L.pad * 0.5 + (L.doorW - jw) / 2, L.counterY - jw - 10, jw, jw);
    }
    if (this.decor.bunting) {
      const flags = Math.max(6, Math.round(w / 78));
      const colors = ['#ff9ec4', '#ffd166', '#7fd3ff', '#9ae26a'];
      ctx.strokeStyle = 'rgba(120,70,40,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.quadraticCurveTo(w / 2, 14, w, 3);
      ctx.stroke();
      for (let i = 0; i < flags; i++) {
        const t = (i + 0.5) / flags;
        const x = t * w;
        const y = 3 + Math.sin(Math.PI * t) * 11;
        ctx.beginPath();
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x, y + 15);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
      }
    }
  }

  paintDoor(ctx, L) {
    const x = L.pad * 0.4;
    const width = L.doorW - L.pad * 0.6;
    const top = L.seatH * 0.06;
    const height = (L.counterY - top) * 0.72;
    roundRect(ctx, x, top, width, height, 10);
    ctx.fillStyle = '#9c5f33';
    ctx.fill();
    ctx.strokeStyle = '#7a4520';
    ctx.lineWidth = 4;
    ctx.stroke();
    roundRect(ctx, x + 7, top + 10, width - 14, height * 0.42, 8);
    ctx.fillStyle = 'rgba(190,220,255,0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,234,0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // the OPEN sign and a brass knob
    roundRect(ctx, x + 10, top + height * 0.5, width - 20, 20, 5);
    ctx.fillStyle = '#fff6ea';
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.font = `800 ${Math.round(Math.min(width * 0.3, 14))}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('OPEN', x + width / 2, top + height * 0.5 + 15);
    ctx.beginPath();
    ctx.arc(x + width - 12, top + height * 0.68, 5, 0, TAU);
    ctx.fillStyle = '#ffd166';
    ctx.fill();
  }

  paintCase(ctx, w, L) {
    const cb = this.counterBox;
    const top = cb.y - 10;
    roundRect(ctx, 0, top, w, cb.h + 24, 12);
    ctx.fillStyle = WOOD;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,236,200,0.22)';
    ctx.fillRect(0, top, w, 7);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(0, cb.y + cb.h + 10, w, 10);
    roundRect(ctx, cb.x, cb.y - 2, cb.w, cb.h + 8, 9);
    const glass = ctx.createLinearGradient(0, cb.y, 0, cb.y + cb.h);
    glass.addColorStop(0, 'rgba(255,255,255,0.42)');
    glass.addColorStop(0.45, 'rgba(255,255,255,0.1)');
    glass.addColorStop(1, 'rgba(255,255,255,0.26)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,234,0.65)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // a diagonal shine across the glass
    ctx.save();
    roundRect(ctx, cb.x, cb.y - 2, cb.w, cb.h + 8, 9);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    ctx.moveTo(cb.x + cb.w * 0.12, cb.y + cb.h + 8);
    ctx.lineTo(cb.x + cb.w * 0.26, cb.y - 2);
    ctx.lineTo(cb.x + cb.w * 0.3, cb.y - 2);
    ctx.lineTo(cb.x + cb.w * 0.17, cb.y + cb.h + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    for (const slot of this.slotBoxes) {
      ctx.beginPath();
      ctx.ellipse(slot.x + slot.w / 2, slot.y + slot.h - 6, Math.min(slot.w * 0.3, 44), 6, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,246,234,0.45)';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,246,234,0.4)';
    ctx.lineWidth = 2;
    for (let i = 1; i < this.slotBoxes.length; i++) {
      const x = this.slotBoxes[i].x;
      ctx.beginPath();
      ctx.moveTo(x, cb.y + 2);
      ctx.lineTo(x, cb.y + cb.h);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------- animation

  update(dt, now = 0) {
    this.time += dt;
    const shift = this.shift;
    if (!shift) return;
    const slow = this.reduceMotion ? 0 : 1;
    this.shake = Math.max(0, this.shake - dt * 3);

    for (const customer of shift.active) {
      let a = this.anim.get(customer.id);
      if (!a) {
        a = { in: 0, out: 0, hop: 0 };
        this.anim.set(customer.id, a);
      }
      a.in = Math.min(1, a.in + dt * 4);
      if (customer.state === 'leaving') a.out = Math.min(1, a.out + dt * 1.6);
      a.hop = customer.happy && customer.state === 'leaving' ? a.out : 0;
    }
    for (const id of [...this.anim.keys()]) {
      if (!shift.active.some((c) => c.id === id)) this.anim.delete(id);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt * slow;
      p.y += p.vy * dt * slow;
      p.vy += (p.g || 0) * dt;
      p.spin = (p.spin || 0) + (p.dspin || 0) * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
      else f.y -= dt * 42 * (slow || 0.4);
    }

    // smoke from anything catching colour
    if (slow) {
      for (const station of shift.stations) {
        const item = station.item;
        if (!item || !station.bakes || item.state !== 'ready' || item.scorch <= 0) continue;
        if (Math.random() > dt * 9 * item.scorch) continue;
        const box = this.stationBoxes[station.index];
        this.puff(box.x + box.w * 0.5 + (Math.random() - 0.5) * box.w * 0.3, box.y + box.h * 0.3, '#cfc3b6');
      }
    }

    // Flour the mouse trots along the counter when hired
    this.helper.on = !!shift.eff.helper;
    if (this.helper.on) {
      this.helper.t += dt * 0.35;
      this.helper.x = (Math.sin(this.helper.t) * 0.5 + 0.5);
    }
    this.selected = shift.selected;
  }

  spawn(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  puff(x, y, color) {
    this.spawn({
      kind: 'puff', x, y, vx: (Math.random() - 0.5) * 24, vy: -28 - Math.random() * 20,
      life: 0.9, max: 0.9, size: 7 + Math.random() * 7, color,
    });
  }

  float(x, y, text, color = '#ffd166') {
    if (this.floats.length > 14) this.floats.shift();
    this.floats.push({ x, y, text, color, life: 1.1, max: 1.1 });
  }

  // Turns simulation events into sparkle. The sim never knows about any of it.
  handleEvents(events) {
    if (!this.shift || !this.L) return;
    for (const event of events) {
      const box = event.station >= 0 && this.stationBoxes ? this.stationBoxes[event.station] : null;
      if (event.type === 'serve') {
        const seat = this.seatBoxes[event.seat];
        if (seat) {
          this.float(seat.x + seat.w / 2, seat.y + seat.h * 0.42, `+${event.coins}`);
          for (let i = 0; i < (this.reduceMotion ? 2 : 6); i++) {
            this.spawn({
              kind: 'coin', x: seat.x + seat.w / 2, y: seat.y + seat.h * 0.5,
              vx: (Math.random() - 0.5) * 120, vy: -90 - Math.random() * 70, g: 220,
              life: 0.8, max: 0.8, size: 16, spin: Math.random() * TAU, dspin: 4,
            });
          }
        }
      } else if (event.type === 'happy') {
        const seat = this.seatBoxes[event.seat];
        if (seat) {
          for (let i = 0; i < (this.reduceMotion ? 1 : 4); i++) {
            this.spawn({
              kind: 'heart', x: seat.x + seat.w / 2 + (Math.random() - 0.5) * 30, y: seat.y + seat.h * 0.35,
              vx: (Math.random() - 0.5) * 30, vy: -50 - Math.random() * 30, life: 1, max: 1, size: 16,
            });
          }
        }
      } else if (event.type === 'crispy' && box) {
        for (let i = 0; i < 5; i++) this.puff(box.x + box.w * 0.5, box.y + box.h * 0.3, '#8d6a4f');
        if (!this.reduceMotion) this.shake = 0.5;
      } else if (event.type === 'plate' && box) {
        this.float(box.x + box.w / 2, box.y + box.h * 0.2, 'ready!', '#8cffd6');
      } else if (event.type === 'tidy') {
        this.float(this.counterBox.x + this.counterBox.w / 2, this.counterBox.y, 'to the window', '#ffd9a8');
      } else if (event.type === 'helper') {
        this.float(this.counterBox.x + this.counterBox.w * this.helper.x, this.counterBox.y - 6, 'squeak!', '#e8c3cf');
      } else if (event.type === 'left') {
        const seat = this.seatBoxes[event.seat];
        if (seat) this.float(seat.x + seat.w / 2, seat.y + seat.h * 0.35, 'maybe tomorrow!', '#ffd9a8');
      }
    }
  }

  // ------------------------------------------------------------------- draw

  draw() {
    const { ctx, w, h, shift } = this;
    if (!shift || !w) return;
    if (!this.backdrop) this.bakeBackdrop();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shake > 0 && !this.reduceMotion) {
      const s = this.shake * 3;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    ctx.clearRect(-8, -8, w + 16, h + 16);
    ctx.drawImage(this.backdrop, 0, 0, w, h);

    // Point at a station and the order it would start lights up, so the
    // automatic choice never feels like a mystery.
    this.wouldStart = null;
    const aim = this.hover && this.hover.kind === 'station'
      ? shift.stations[this.hover.index]
      : (this.cursor >= 0 ? shift.stations[this.cursor] : null);
    if (aim && !aim.item) {
      const ticket = shift.nextTicketFor(aim);
      this.wouldStart = ticket ? ticket.id : null;
    }

    this.drawQueue();
    for (let i = 0; i < shift.seats.length; i++) this.drawSeat(i);
    if (this.caseLayer) ctx.drawImage(this.caseLayer, 0, 0, w, h);
    this.drawCounter();
    for (const station of shift.stations) this.drawStation(station);
    if (this.helper.on) this.drawMouse();
    this.drawParticles();
    this.drawFloats();
  }

  drawQueue() {
    const { ctx, L, shift } = this;
    const waiting = shift.waiting.filter((c) => c.arriveAt <= shift.time);
    if (!waiting.length) return;
    const size = Math.min(L.doorW * 0.8, L.seatH * 0.42);
    const show = Math.min(3, waiting.length);
    for (let i = 0; i < show; i++) {
      const art = this.sprites.customer[waiting[i].kind];
      const x = L.pad * 0.5 + (L.doorW - L.pad - size) * 0.5;
      const y = L.seatH * 0.5 + i * size * 0.26;
      ctx.globalAlpha = 0.45 - i * 0.12;
      ctx.drawImage(art, x, y, size, size);
      ctx.globalAlpha = 1;
    }
    if (waiting.length > show) {
      ctx.fillStyle = INK;
      ctx.font = `600 ${Math.round(L.doorW * 0.2)}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`+${waiting.length - show}`, L.doorW * 0.5, L.seatH * 0.96);
    }
  }

  drawSeat(index) {
    const { ctx } = this;
    const m = this.seatMetrics(index);
    const customer = this.shift.seats[index].customer;
    if (!customer) return;
    const box = m.box;
    const anim = this.anim.get(customer.id) || { in: 1, out: 0, hop: 0 };
    const ease = 1 - (1 - anim.in) * (1 - anim.in);
    const leaving = customer.state === 'leaving';
    const slide = leaving ? anim.out : 0;
    ctx.save();
    ctx.globalAlpha = leaving ? Math.max(0, 1 - slide) : ease;
    const size = m.bodySize;
    const hop = anim.hop ? Math.abs(Math.sin(anim.hop * 9)) * size * 0.1 : 0;
    const bx = box.x + (box.w - size) / 2;
    const by = m.headTop + (1 - ease) * 26 + slide * 34 - hop;
    if (leaving && !customer.happy) {
      ctx.translate(bx + size / 2, by + size);
      ctx.rotate(Math.sin(this.time * 8) * 0.06);
      ctx.translate(-(bx + size / 2), -(by + size));
    }
    ctx.drawImage(this.sprites.customer[customer.kind], bx, by, size, size);
    this.drawFace(customer, bx, by, size);
    ctx.restore();
    if (leaving) return;
    this.drawBubble(m);
    this.drawHearts(m);
    if (customer.regular) {
      // A name tag on the chest, clear of the display case in front of them.
      const fs = Math.round(Math.min(box.w * 0.13, 15));
      const y = m.feet - Math.max(20, m.bodySize * 0.12);
      ctx.textAlign = 'center';
      ctx.font = `700 ${fs}px ui-rounded, system-ui, sans-serif`;
      const tw = ctx.measureText(customer.name).width;
      roundRect(ctx, box.x + box.w / 2 - tw / 2 - 6, y - fs, tw + 12, fs + 7, (fs + 7) / 2);
      ctx.fillStyle = 'rgba(255,250,242,0.88)';
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillText(customer.name, box.x + box.w / 2, y);
    }
  }

  drawFace(customer, x, y, size) {
    const { ctx } = this;
    const kind = CUSTOMERS[customer.kind];
    const twin = customer.kind === 'twins';
    const faces = twin
      ? [[x + size * 0.34, y + size * 0.34, size * 0.14], [x + size * 0.67, y + size * 0.36, size * 0.13]]
      : [[x + size * 0.5, y + size * 0.33, size * (customer.kind === 'bear' || customer.kind === 'moose' ? 0.22 : 0.2)]];
    const hearts = heartsFor(customer.patience);
    const happy = customer.happy || hearts === 3;
    const worried = hearts <= 1 && !customer.happy;
    for (const [cx, cy, r] of faces) {
      ctx.strokeStyle = '#3a2318';
      ctx.fillStyle = '#3a2318';
      ctx.lineWidth = Math.max(1.4, r * 0.1);
      ctx.lineCap = 'round';
      const ex = r * 0.38;
      const ey = cy - r * 0.08;
      if (customer.happy && customer.state === 'leaving') {
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + dir * ex, ey, r * 0.16, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
      } else if (customer.kind === 'owl') {
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + dir * ex, ey, r * 0.17, 0, TAU);
          ctx.fill();
        }
      } else {
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + dir * ex, ey, r * 0.12, 0, TAU);
          ctx.fill();
        }
      }
      // mouth
      ctx.beginPath();
      if (happy) ctx.arc(cx, cy + r * 0.3, r * 0.22, 0.2, Math.PI - 0.2);
      else if (worried) ctx.arc(cx, cy + r * 0.52, r * 0.2, Math.PI + 0.3, -0.3);
      else {
        ctx.moveTo(cx - r * 0.14, cy + r * 0.38);
        ctx.lineTo(cx + r * 0.14, cy + r * 0.38);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,160,0.35)';
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + dir * r * 0.66, cy + r * 0.22, r * 0.17, r * 0.1, 0, 0, TAU);
        ctx.fill();
      }
      if (customer.kind === 'moose' || customer.kind === 'fox') {
        ctx.fillStyle = kind.fur === '#f08a3c' ? '#3a2318' : '#5a3418';
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.12, r * 0.12, r * 0.09, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawBubble(m) {
    const { ctx } = this;
    const { bubble, chips, box } = m;
    if (!bubble || !chips.length) return;
    const size = bubble.size;
    roundRect(ctx, bubble.x, bubble.y, bubble.w, bubble.h, size * 0.3);
    ctx.fillStyle = 'rgba(255,250,242,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,40,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const tailX = box.x + box.w / 2;
    ctx.beginPath();
    ctx.moveTo(tailX - size * 0.16, bubble.y + bubble.h - 1);
    ctx.lineTo(tailX + size * 0.16, bubble.y + bubble.h - 1);
    ctx.lineTo(tailX, bubble.y + bubble.h + size * 0.26);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,250,242,0.96)';
    ctx.fill();

    for (const chip of chips) {
      const { ticket } = chip;
      ctx.save();
      if (ticket.state === 'served') ctx.globalAlpha = 0.3;
      ctx.drawImage(this.sprites.dish[ticket.recipe], chip.x, chip.y, chip.w, chip.h);
      ctx.restore();
      if (ticket.state === 'served') {
        ctx.strokeStyle = '#3aa366';
        ctx.lineWidth = Math.max(2, size * 0.1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(chip.x + size * 0.22, chip.y + size * 0.54);
        ctx.lineTo(chip.x + size * 0.44, chip.y + size * 0.74);
        ctx.lineTo(chip.x + size * 0.8, chip.y + size * 0.26);
        ctx.stroke();
      } else if (ticket.state === 'cooking') {
        ctx.strokeStyle = 'rgba(255,140,40,0.95)';
        ctx.lineWidth = Math.max(2, size * 0.09);
        ctx.beginPath();
        ctx.arc(chip.x + size / 2, chip.y + size / 2, size * 0.5, -Math.PI / 2, -Math.PI / 2 + TAU * 0.75);
        ctx.stroke();
      }
      if (this.selected === ticket.id) {
        roundRect(ctx, chip.x - 4, chip.y - 4, size + 8, size + 8, size * 0.3);
        ctx.strokeStyle = '#ff3d6e';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (this.wouldStart === ticket.id) {
        roundRect(ctx, chip.x - 3, chip.y - 3, size + 6, size + 6, size * 0.3);
        ctx.strokeStyle = 'rgba(255,157,77,0.9)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }

  drawHearts(m) {
    const { ctx } = this;
    const { customer, box, heartSize: size, heartY: y } = m;
    const hearts = heartsFor(customer.patience);
    const total = 3 * size * 0.94;
    const x0 = box.x + (box.w - total) / 2;
    const pulse = hearts === 1 ? 1 + Math.sin(this.time * 7) * (this.reduceMotion ? 0 : 0.14) : 1;
    for (let i = 0; i < 3; i++) {
      const on = i < hearts;
      const s = size * (on && i === hearts - 1 ? pulse : 1);
      ctx.globalAlpha = on ? 1 : 0.2;
      ctx.drawImage(this.sprites.heart, x0 + i * size * 0.94 + (size - s) / 2, y + (size - s) / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  drawCounter() {
    const { ctx, shift } = this;
    for (let i = 0; i < this.slotBoxes.length; i++) {
      const slot = this.slotBoxes[i];
      const dish = shift.counter[i];
      if (!dish) continue;
      const size = Math.min(slot.w * 0.74, slot.h * 1.15);
      const bob = this.reduceMotion ? 0 : Math.sin(this.time * 2.4 + i) * 1.6;
      const x = slot.x + (slot.w - size) / 2;
      const y = slot.y + slot.h - size * 0.92 + bob;
      ctx.globalAlpha = 0.45;
      ctx.drawImage(this.sprites.glowMint, x - size * 0.2, y - size * 0.1, size * 1.4, size * 1.4);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.sprites.dishArt(dish.recipe, dish.quality), x, y, size, size);
      if (dish.quality === 'crispy') {
        ctx.fillStyle = '#5a3418';
        ctx.font = `700 ${Math.round(Math.min(size * 0.2, 15))}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('crispy', x + size / 2, y + size * 0.98);
      }
    }
    if (shift.bestServe()) {
      const cb = this.counterBox;
      roundRect(ctx, cb.x, cb.y - 2, cb.w, cb.h + 8, 9);
      ctx.strokeStyle = `rgba(120,255,206,${0.55 + Math.sin(this.time * 4) * (this.reduceMotion ? 0 : 0.3)})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,18,8,0.5)';
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(Math.min(this.w * 0.02, 15))}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText('tap to serve', cb.x + cb.w / 2, cb.y + cb.h - 2);
    }
  }

  drawStation(station) {
    const { ctx } = this;
    const box = this.stationBoxes[station.index];
    const bump = station.bump * (this.reduceMotion ? 0 : 1);
    const lift = bump * 4;
    roundRect(ctx, box.x, box.y - lift, box.w, box.h, box.w * 0.12);
    ctx.fillStyle = 'rgba(255,246,234,0.86)';
    ctx.fill();
    ctx.strokeStyle = station.flash > 0
      ? `rgba(255,110,110,${0.35 + station.flash * 0.65})`
      : this.hover && this.hover.kind === 'station' && this.hover.index === station.index
        ? 'rgba(255,157,77,0.9)' : 'rgba(120,70,40,0.22)';
    ctx.lineWidth = station.flash > 0 ? 4 : 2.5;
    ctx.stroke();
    if (this.cursor === station.index) {
      roundRect(ctx, box.x - 4, box.y - lift - 4, box.w + 8, box.h + 8, box.w * 0.14);
      ctx.strokeStyle = '#ff6b8e';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const art = this.sprites.station[station.kind];
    const size = Math.min(box.w * 0.78, box.h * 0.74);
    const sx = box.x + (box.w - size) / 2;
    const sy = box.y - lift + box.h - size - Math.min(22, box.h * 0.11);
    const item = station.item;
    if (station.bakes && item) {
      ctx.globalAlpha = item.state === 'ready' ? 0.75 : 0.45;
      ctx.drawImage(this.sprites.glowWarm, sx + size * 0.1, sy + size * 0.2, size * 0.8, size * 0.8);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(art, sx, sy, size, size);

    // the number key badge
    const badge = Math.min(box.w * 0.2, 26);
    roundRect(ctx, box.x + 5, box.y - lift + 5, badge, badge, badge * 0.34);
    ctx.fillStyle = 'rgba(74,44,26,0.82)';
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = `700 ${Math.round(badge * 0.68)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${station.index + 1}`, box.x + 5 + badge / 2, box.y - lift + 5 + badge * 0.56);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = 'rgba(74,44,26,0.78)';
    ctx.font = `700 ${Math.round(Math.min(box.w * 0.16, 16))}px ui-rounded, system-ui, sans-serif`;
    ctx.fillText(STATIONS[station.kind].short, box.x + box.w / 2, box.y - lift + box.h - 4);

    if (!item) return;
    // The food sits where it belongs: in the bowl, behind the oven door, on
    // the icing plate.
    const slot = STATION_SLOTS[station.kind] || [0.5, 0.5];
    const dishSize = size * 0.44;
    const ready = item.state === 'ready';
    const pop = ready && !this.reduceMotion ? Math.sin(this.time * 5) * 2.5 : 0;
    const cx = sx + size * slot[0];
    const cy = sy + size * slot[1] + pop;
    const dx = cx - dishSize / 2;
    const dy = cy - dishSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, dishSize * 0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,248,236,0.88)';
    ctx.fill();
    if (ready) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(this.sprites.glowMint, cx - dishSize, cy - dishSize, dishSize * 2, dishSize * 2);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.sprites.dish[item.recipe], dx, dy, dishSize, dishSize);
    if (item.scorch > 0) {
      ctx.globalAlpha = Math.min(1, item.scorch);
      ctx.drawImage(this.sprites.crispy[item.recipe], dx, dy, dishSize, dishSize);
      ctx.globalAlpha = 1;
    }
    if (!ready) {
      const t = Math.min(1, item.t / item.dur);
      const r = dishSize * 0.68;
      ctx.strokeStyle = 'rgba(70,40,20,0.3)';
      ctx.lineWidth = Math.max(3, dishSize * 0.13);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#ff9d4d';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * t);
      ctx.stroke();
    } else {
      const bell = Math.min(box.w * 0.22, 30);
      ctx.drawImage(this.sprites.bell, box.x + box.w - bell - 6, box.y - lift + 6 + pop, bell, bell);
    }
    if (item.quality === 'crispy') {
      ctx.fillStyle = '#5a3418';
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(Math.min(dishSize * 0.3, 15))}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText('crispy', cx, cy + dishSize * 0.95);
    }
    if (station.bakes && item.state === 'ready' && item.scorch > 0 && item.scorch < 1) {
      // a little hurry-up bar under the bake
      const bw = dishSize * 1.5;
      const bx = cx - bw / 2;
      const by = cy + dishSize * 0.8;
      roundRect(ctx, bx, by, bw, 6, 3);
      ctx.fillStyle = 'rgba(120,70,40,0.25)';
      ctx.fill();
      roundRect(ctx, bx, by, bw * (1 - item.scorch), 6, 3);
      ctx.fillStyle = '#ff6b4d';
      ctx.fill();
    }
  }

  drawMouse() {
    const { ctx } = this;
    const cb = this.counterBox;
    const size = Math.min(cb.h * 0.72, 48);
    const x = cb.x + 8 + (cb.w - 16 - size) * this.helper.x;
    const flip = Math.cos(this.helper.t) < 0;
    ctx.save();
    ctx.translate(x + size / 2, cb.y + cb.h - size * 0.5);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(this.sprites.mouse, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, t));
      if (p.kind === 'coin') {
        const s = p.size * (0.6 + t * 0.4);
        ctx.drawImage(this.sprites.coin, p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.kind === 'heart') {
        ctx.drawImage(this.sprites.heart, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.3 - t * 0.5), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFloats() {
    const { ctx } = this;
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const t = f.life / f.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, t * 1.6));
      ctx.font = `800 ${Math.round(Math.min(this.w * 0.035, 22))}px ui-rounded, system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(74,44,26,0.55)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

// Small painters the menus reuse, so the HTML screens show the real art.
export function paintDish(canvas, recipeId, size = 72, sprites = null) {
  const pack = sprites || paintDish.pack || (paintDish.pack = new Sprites());
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.drawImage(pack.dish[recipeId], 0, 0, size, size);
  return pack;
}

export function paintSilhouette(canvas, recipeId, size = 72, sprites = null) {
  const pack = paintDish(canvas, recipeId, size, sprites);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(74,44,26,0.82)';
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  return pack;
}

export function paintStation(canvas, stationId, size = 64, sprites = null) {
  const pack = sprites || paintDish.pack || (paintDish.pack = new Sprites());
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.drawImage(pack.station[stationId], 0, 0, size, size);
  return pack;
}

export function paintCustomer(canvas, kindId, size = 72, sprites = null) {
  const pack = sprites || paintDish.pack || (paintDish.pack = new Sprites());
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.drawImage(pack.customer[kindId], 0, 0, size, size);
  return pack;
}
