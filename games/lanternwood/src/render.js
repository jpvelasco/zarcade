// Canvas renderer. The world is drawn into a 320 × 192 view (one room) at
// BAKE× resolution, then scaled onto the page. Room backgrounds are baked once
// per visit, sprites are baked at start, and darkness is a small offscreen
// mask with soft holes punched out for the lantern, torches and lamps.
import { TILE, ROOM_W, ROOM_H, tileDef } from './tiles.js';
import { paintTile, paintOver, PALETTES } from './tileart.js';
import { bakeSprites, makeCanvas } from './sprites.js';
import { heartIcons } from './combat.js';
import { nightAmount, ITEMS } from './world.js';
import { hash2 } from './rng.js';
import { F } from './areas.js';
import { BOSS_TYPES } from './bosses.js';
import { ENEMY_NAMES } from './enemies.js';

export const VIEW_W = ROOM_W * TILE; // 320
export const VIEW_H = ROOM_H * TILE; // 192
const BAKE = 3;
const MAX_PARTICLES = 220;
const DIRI = (f) => (f.y > 0 ? 0 : f.y < 0 ? 1 : f.x < 0 ? 2 : 3);

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.view = makeCanvas(VIEW_W * BAKE, VIEW_H * BAKE);
    this.vctx = this.view.getContext('2d');
    this.mask = makeCanvas(VIEW_W / 2, VIEW_H / 2);
    this.mctx = this.mask.getContext('2d');
    this.rooms = new Map();
    this.particles = [];
    this.flies = [];
    this.time = 0;
    this.shake = 0;
    this.sprites = null;
    this.grassBlades = new Map();
    this.layout = { x: 0, y: 0, w: VIEW_W, h: VIEW_H, scale: 1, portrait: false };
    this.resize();
  }

  /** Bake sprites (about 30 ms); main.js calls this before the first frame. */
  prepare() {
    if (!this.sprites) this.sprites = bakeSprites(BAKE);
  }

  resize(touch = false) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
    const portrait = h > w * 1.1;
    // Portrait phones: the view sits at the top, the touch pad gets the rest.
    const availH = portrait && touch ? h * 0.56 : h;
    const scale = Math.min(w / VIEW_W, availH / VIEW_H);
    const vw = VIEW_W * scale, vh = VIEW_H * scale;
    const top = portrait && touch ? 62 : (h - vh) / 2;
    this.layout = { x: (w - vw) / 2, y: top, w: vw, h: vh, scale, portrait, touch };
    return this.layout;
  }

  // ------------------------------------------------------------ rooms

  themeFor(area, room) {
    return area.kind === 'dungeon' ? area.def.theme : room.region;
  }

  roomCache(game, key) {
    const id = `${game.area.id}:${key}`;
    let rc = this.rooms.get(id);
    if (!rc) {
      rc = this.bakeRoom(game, key);
      this.rooms.set(id, rc);
      if (this.rooms.size > 8) this.rooms.delete(this.rooms.keys().next().value);
    }
    return rc;
  }

  bakeRoom(game, key) {
    const area = game.area;
    const room = area.rooms.get(key);
    const canvas = makeCanvas(VIEW_W * BAKE, VIEW_H * BAKE);
    const ctx = canvas.getContext('2d');
    const rc = { canvas, ctx, key, room, theme: this.themeFor(area, room), dyn: [] };
    ctx.setTransform(BAKE, 0, 0, BAKE, 0, 0);
    this.paintRange(game, rc, 0, 0, ROOM_W - 1, ROOM_H - 1);
    this.scanDynamic(game, rc);
    return rc;
  }

  charAt(game, tx, ty) {
    const a = game.area;
    const cx = Math.max(0, Math.min(a.w - 1, tx)), cy = Math.max(0, Math.min(a.h - 1, ty));
    return String.fromCharCode(game.grid[cy * a.w + cx]);
  }

  paintRange(game, rc, x0, y0, x1, y1) {
    const ox = rc.room.rx * ROOM_W, oy = rc.room.ry * ROOM_H;
    const ctx = rc.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
    ctx.clip();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const tx = ox + x, ty = oy + y;
      const get = (dx, dy) => this.charAt(game, tx + dx, ty + dy);
      paintTile(ctx, this.charAt(game, tx, ty), tx, ty, get, rc.theme);
    }
    for (let y = Math.max(0, y0 - 1); y <= Math.min(ROOM_H - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(ROOM_W - 1, x1 + 2); x++) {
      const tx = ox + x, ty = oy + y;
      const ch = this.charAt(game, tx, ty);
      if (ch === 'T' || ch === 'O') paintOver(ctx, ch, tx, ty, (dx, dy) => this.charAt(game, tx + dx, ty + dy), rc.theme);
    }
    ctx.restore();
  }

  scanDynamic(game, rc) {
    rc.dyn = [];
    const ox = rc.room.rx * ROOM_W, oy = rc.room.ry * ROOM_H;
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const tx = ox + x, ty = oy + y;
      const ch = this.charAt(game, tx, ty);
      const h = hash2(tx, ty);
      if (ch === ',' || ch === 't' || ch === 'Y' || ch === 'c' || ch === 'P' || (ch === '~' && h < 0.22) || ch === 'O' || ch === '+') {
        rc.dyn.push({ ch, tx, ty, i: ty * game.area.w + tx, x: tx * TILE, y: ty * TILE, h });
      }
    }
  }

  tileChanged(game, idx) {
    const tx = idx % game.area.w, ty = Math.floor(idx / game.area.w);
    const key = `${Math.floor(tx / ROOM_W)},${Math.floor(ty / ROOM_H)}`;
    const rc = this.rooms.get(`${game.area.id}:${key}`);
    if (!rc) return;
    const lx = tx % ROOM_W, ly = ty % ROOM_H;
    rc.ctx.setTransform(BAKE, 0, 0, BAKE, 0, 0);
    this.paintRange(game, rc, Math.max(0, lx - 1), Math.max(0, ly - 1), Math.min(ROOM_W - 1, lx + 1), Math.min(ROOM_H - 1, ly + 1));
    this.scanDynamic(game, rc);
  }

  resetArea() { this.rooms.clear(); this.particles.length = 0; }

  // ------------------------------------------------------------ events → effects

  handleEvents(events, game) {
    for (const e of events) {
      switch (e.type) {
        case 'tile': this.tileChanged(game, e.idx); break;
        case 'area': this.rooms.clear(); this.particles.length = 0; this.makeFlies(game); break;
        case 'room': this.makeFlies(game); break;
        case 'cut': this.burst(e.x, e.y, e.bush ? 10 : 7, 'leaf', e.region === 'mountain' ? '#a8b07e' : '#5fb04f'); break;
        case 'rustle': if (!this.reduced) this.burst(e.x, e.y + 4, 2, 'leaf', '#6fbf5e'); break;
        case 'poof': this.burst(e.x, e.y, e.big ? 18 : e.small ? 5 : 10, 'puff', '#ffffff'); this.burst(e.x, e.y, e.big ? 10 : 4, 'star', '#ffe36b'); break;
        case 'hit': this.burst(e.x, e.y, 6, 'spark', '#fff3a8'); this.flash = 0.06; break;
        case 'clank': this.burst(e.x, e.y, 5, 'spark', e.ghost ? '#b9a6ff' : '#cfe4ff'); break;
        case 'hurt': this.burst(e.x, e.y, 6, 'spark', '#ff7a8a'); this.hurtFlash = 0.25; break;
        case 'crack': this.burst(e.x, e.y, 14, 'rock', '#a59a8c'); break;
        case 'torch': this.burst(e.x, e.y - 6, 10, 'ember', '#ffb23c'); break;
        case 'snuff': this.burst(e.x, e.y - 6, 8, 'puff', '#7a6aa0'); break;
        case 'chest': this.burst(e.x, e.y - 4, 12, 'star', '#ffe36b'); break;
        case 'pickup': this.burst(e.x, e.y, e.kind === 'shard' ? 16 : 5, 'star', e.kind === 'heart' ? '#ff7a9a' : e.kind === 'honeycap' ? '#ffc23c' : '#c8d0ff'); break;
        case 'appear': this.burst(e.x, e.y, 14, 'puff', '#fff3c0'); break;
        case 'checkpoint': this.burst(e.x, e.y - 6, 14, 'ember', '#ffd25a'); break;
        case 'trail': if (!this.reduced || Math.random() < 0.4) this.burst(e.x, e.y, 2, 'ember', '#ff7a3c'); break;
        case 'thud': this.burst(e.x, e.y + 6, e.big ? 14 : 8, 'dust', '#cdbb98'); break;
        case 'land': this.burst(e.x, e.y + 4, 6, 'dust', '#cdbb98'); break;
        case 'catch': this.burst(game.player.x - 26, game.player.y, 10, 'drop', '#bfe8ff'); break;
        case 'bite': this.burst(game.player.x - 26, game.player.y + 2, 5, 'drop', '#bfe8ff'); break;
        case 'bossdown': this.burst(game.player.x, game.player.y, 0, 'puff'); this.flash = 0.3; break;
        case 'heal': this.burst(game.player.x, game.player.y - 6, 8, 'heart', '#ff7a9a'); break;
        default: break;
      }
    }
  }

  burst(x, y, n, kind, color) {
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 50;
      const p = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.4 + Math.random() * 0.4, kind, color, size: 1 + Math.random() * 1.6, rot: Math.random() * 6 };
      if (kind === 'leaf') { p.vy -= 30; p.max = 0.7; }
      if (kind === 'ember') { p.vy = -20 - Math.random() * 40; p.vx *= 0.4; }
      if (kind === 'puff') { p.vx *= 0.6; p.vy *= 0.6; p.size = 3 + Math.random() * 3; }
      if (kind === 'drop') { p.vy = -60 - Math.random() * 30; }
      if (kind === 'heart') { p.vy = -30; p.vx *= 0.3; p.max = 0.9; }
      this.particles.push(p);
    }
  }

  makeFlies(game) {
    this.flies = [];
    if (game.area.kind !== 'overworld') return;
    const region = game.room.region;
    const n = region === 'forest' ? 10 : region === 'lake' || region === 'meadow' ? 7 : 5;
    for (let i = 0; i < n; i++) this.flies.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, p: Math.random() * 10, s: 0.5 + Math.random() });
  }

  update(dt) {
    this.time += dt;
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'leaf' || p.kind === 'rock' || p.kind === 'drop') p.vy += 160 * dt;
      p.vx *= 0.92; if (p.kind !== 'drop' && p.kind !== 'rock' && p.kind !== 'leaf') p.vy *= 0.92;
      p.rot += dt * 6;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    if (this.flash > 0) this.flash -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  // ------------------------------------------------------------ drawing

  camera(game) {
    const t = game.transition;
    const rr = game.roomRect;
    if (t && t.kind === 'slide') {
      const k = easeInOut(Math.min(1, t.t / t.dur));
      const from = game.area.rooms.get(t.from);
      const fx = from.rx * VIEW_W, fy = from.ry * VIEW_H;
      const to = game.area.rooms.get(t.to);
      return { x: fx + (to.rx * VIEW_W - fx) * k, y: fy + (to.ry * VIEW_H - fy) * k };
    }
    return { x: rr.x, y: rr.y };
  }

  draw(game, opts = {}) {
    const ctx = this.ctx;
    const L = this.layout;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0b1a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!game || !this.sprites) return;
    const v = this.vctx;
    const cam = this.camera(game);
    let sx = 0, sy = 0;
    if (game.shakeT > 0 && !this.reduced) { sx = (Math.random() - 0.5) * game.shakeMag; sy = (Math.random() - 0.5) * game.shakeMag; }
    else if (game.shakeT > 0) { sx = (Math.random() - 0.5) * game.shakeMag * 0.25; }
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.fillStyle = '#0d0b1a';
    v.fillRect(0, 0, this.view.width, this.view.height);
    v.setTransform(BAKE, 0, 0, BAKE, (-cam.x + sx) * BAKE, (-cam.y + sy) * BAKE);
    v.imageSmoothingEnabled = true;

    // Backgrounds (two during a slide).
    const keys = [game.room.key];
    if (game.transition && game.transition.kind === 'slide') keys.splice(0, 1, game.transition.from, game.transition.to);
    for (const key of keys) {
      const rc = this.roomCache(game, key);
      v.drawImage(rc.canvas, rc.room.rx * VIEW_W, rc.room.ry * VIEW_H, VIEW_W, VIEW_H);
      this.drawDynamicTiles(v, game, rc);
    }
    this.drawEntities(v, game);
    this.drawShots(v, game);
    this.drawParticles(v);
    this.drawDarkness(v, game, cam);
    this.drawTelegraphs(v, game);
    this.drawFlies(v, game, cam);

    // Fades for warps and the item fanfare.
    v.setTransform(1, 0, 0, 1, 0, 0);
    const t = game.transition;
    if (t && t.kind === 'fade') {
      const k = t.t / t.dur;
      v.fillStyle = `rgba(13,11,26,${Math.min(1, k < 0.5 ? k * 2 : (1 - k) * 2)})`;
      v.fillRect(0, 0, this.view.width, this.view.height);
    }
    if (this.hurtFlash > 0 && !this.reduced) {
      v.fillStyle = `rgba(255,60,90,${this.hurtFlash * 0.5})`;
      v.fillRect(0, 0, this.view.width, this.view.height);
    }
    if (this.flash > 0 && !this.reduced) {
      v.fillStyle = `rgba(255,255,255,${Math.min(0.35, this.flash)})`;
      v.fillRect(0, 0, this.view.width, this.view.height);
    }

    const d = this.dpr;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.view, L.x * d, L.y * d, L.w * d, L.h * d);
    if (!opts.attract) this.drawHud(ctx, game, opts);
  }

  drawDynamicTiles(v, game, rc) {
    const S = this.sprites, t = this.time;
    const P = PALETTES[rc.theme] || PALETTES.village;
    for (const d of rc.dyn) {
      const ch = String.fromCharCode(game.grid[d.i]);
      if (ch !== d.ch) continue;
      if (ch === ',') this.drawGrass(v, d, P, game, t);
      else if (ch === '~') {
        const a = 0.5 + 0.5 * Math.sin(t * 2 + d.h * 40);
        v.globalAlpha = a * 0.8;
        v.fillStyle = '#e8f8ff';
        v.fillRect(d.x + 3 + d.h * 20 % 8, d.y + 5 + (d.h * 77) % 6, 3, 1);
        v.fillRect(d.x + 9 - (d.h * 33) % 5, d.y + 10, 2, 1);
        v.globalAlpha = 1;
      } else if (ch === 't') {
        const lit = game.room.key === rc.key && game.lit.has(d.i);
        if (lit) this.flame(v, d.x + 8, d.y + 3, 1, t + d.h * 9);
      } else if (ch === 'Y') {
        if (game.flag(F.lamp(d.i))) { this.flame(v, d.x + 8, d.y - 3, 0.75, t + d.h * 9); v.globalCompositeOperation = 'lighter'; v.drawImage(S.glow, d.x - 8, d.y - 19, 32, 32); v.globalCompositeOperation = 'source-over'; }
      } else if (ch === 'c') {
        const solved = game.flag(F.solved(game.area.id, rc.key));
        const bob = Math.sin(t * 3 + d.h * 10) * 1.2;
        v.fillStyle = '#2a1e2e';
        v.beginPath(); v.moveTo(d.x + 8, d.y + 1 + bob); v.lineTo(d.x + 13, d.y + 6 + bob); v.lineTo(d.x + 8, d.y + 11 + bob); v.lineTo(d.x + 3, d.y + 6 + bob); v.fill();
        v.fillStyle = solved ? '#ffcf5a' : '#6fd8ff';
        v.beginPath(); v.moveTo(d.x + 8, d.y + 2.2 + bob); v.lineTo(d.x + 11.8, d.y + 6 + bob); v.lineTo(d.x + 8, d.y + 9.8 + bob); v.lineTo(d.x + 4.2, d.y + 6 + bob); v.fill();
        v.fillStyle = 'rgba(255,255,255,0.8)'; v.fillRect(d.x + 6, d.y + 4 + bob, 1.5, 1.5);
      } else if (ch === 'P') {
        if (game.room.key === rc.key && game.blocks.some((b) => !b.move && b.ty * game.area.w + b.tx === d.i)) {
          v.fillStyle = 'rgba(255,207,90,0.5)'; v.fillRect(d.x + 1, d.y + 1, 14, 14);
        }
      } else if (ch === 'O') {
        if (this.charAt(game, d.tx - 1, d.ty) !== 'O' && this.charAt(game, d.tx, d.ty - 1) !== 'O') this.greatLantern(v, d.x, d.y, game, t);
      } else if (ch === '+' && game.area.kind === 'overworld') {
        const a = 0.4 + 0.4 * Math.sin(t * 3);
        v.globalAlpha = a; v.fillStyle = '#fff3c0';
        v.fillRect(d.x + 7, d.y + 4 + Math.sin(t * 2) * 2, 2, 2);
        v.globalAlpha = 1;
      }
    }
  }

  drawGrass(v, d, P, game, t) {
    const rustle = game.rustle.get(d.i) || 0;
    const sway = (this.reduced ? 0 : Math.sin(t * 2 + d.h * 12) * 0.8) + rustle * Math.sin(t * 40) * 3;
    v.fillStyle = P.tuft || '#4f9944';
    v.fillRect(d.x + 1, d.y + 9, 14, 6);
    for (let i = 0; i < 5; i++) {
      const bx = d.x + 1.5 + i * 3, top = d.y + 2 + ((d.h * (i + 3) * 17) % 4);
      v.fillStyle = i % 2 ? (P.grass2 || '#69b457') : '#8fd36e';
      v.beginPath(); v.moveTo(bx - 1.4, d.y + 14); v.lineTo(bx + sway * (i % 2 ? 1 : 0.7), top); v.lineTo(bx + 1.4, d.y + 14); v.fill();
    }
  }

  flame(v, x, y, s, t) {
    const f = 1 + Math.sin(t * 14) * 0.08 + Math.sin(t * 23) * 0.05;
    v.globalCompositeOperation = 'lighter';
    v.drawImage(this.sprites.glow, x - 12 * s, y - 14 * s, 24 * s, 24 * s);
    v.globalCompositeOperation = 'source-over';
    v.fillStyle = '#ff7a3c';
    v.beginPath(); v.ellipse(x, y - 1 * s, 3.2 * s, 4.6 * s * f, 0, 0, 7); v.fill();
    v.fillStyle = '#ffd25a';
    v.beginPath(); v.ellipse(x, y, 2 * s, 3 * s * f, 0, 0, 7); v.fill();
    v.fillStyle = '#fff6d0';
    v.beginPath(); v.ellipse(x, y + 0.6 * s, 1 * s, 1.6 * s, 0, 0, 7); v.fill();
  }

  greatLantern(v, x, y, game, t) {
    const lit = !!game.save.ended;
    v.fillStyle = '#2a1e2e';
    v.fillRect(x + 15, y - 14, 2, 6);
    v.beginPath(); v.moveTo(x + 6, y - 6); v.lineTo(x + 26, y - 6); v.lineTo(x + 22, y - 10); v.lineTo(x + 10, y - 10); v.fill();
    v.fillStyle = '#2a1e2e';
    v.fillRect(x + 7, y - 6, 18, 25);
    v.fillStyle = lit ? '#ffd25a' : '#6f6a86';
    v.fillRect(x + 9, y - 4, 14, 21);
    v.fillStyle = lit ? '#fff3c0' : '#8a85a2';
    v.fillRect(x + 12, y, 8, 13);
    v.fillStyle = '#2a1e2e';
    v.fillRect(x + 15, y - 4, 2, 21);
    v.fillRect(x + 9, y + 6, 14, 1.5);
    if (lit) {
      v.globalCompositeOperation = 'lighter';
      const s = 1 + Math.sin(t * 2) * 0.05;
      v.drawImage(this.sprites.glow, x + 16 - 36 * s, y + 4 - 36 * s, 72 * s, 72 * s);
      v.globalCompositeOperation = 'source-over';
    } else {
      // Three empty sockets wait for the Flame Shards.
      for (let i = 0; i < 3; i++) {
        const got = i < game.save.shards.length;
        v.fillStyle = got ? '#ffb23c' : '#4a4560';
        v.beginPath(); v.arc(x + 10 + i * 6, y + 20, 1.6, 0, 7); v.fill();
      }
    }
  }

  drawEntities(v, game) {
    const S = this.sprites;
    const list = [];
    const t = this.time;
    for (const p of game.props) {
      if (!game.propVisible(p)) continue;
      list.push({ y: p.y * TILE + 15, kind: 'prop', p });
    }
    for (const b of game.blocks) list.push({ y: b.y + 7, kind: 'block', b });
    for (const e of game.enemies) if (e.alive) list.push({ y: e.y + e.hh, kind: 'enemy', e });
    for (const k of game.pickups) if (!k.dead && !k.carried) list.push({ y: k.y + 4, kind: 'pickup', k });
    list.push({ y: game.player.y + 4, kind: 'player' });
    if (!(game.transition && game.transition.kind === 'slide')) list.push({ y: game.fox.y + 4, kind: 'fox' });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.kind === 'prop') this.drawProp(v, game, it.p, t);
      else if (it.kind === 'block') v.drawImage(S.block[game.isDungeon ? game.area.def.theme : 'overworld'], it.b.x - 8, it.b.y - 8, 16, 16);
      else if (it.kind === 'enemy') this.drawEnemy(v, game, it.e, t);
      else if (it.kind === 'pickup') this.drawPickup(v, it.k, t);
      else if (it.kind === 'player') this.drawPlayer(v, game, t);
      else if (it.kind === 'fox') this.drawFox(v, game, t);
    }
  }

  shadow(v, x, y, rx, ry = rx * 0.4) {
    v.fillStyle = 'rgba(20,10,30,0.28)';
    v.beginPath(); v.ellipse(x, y, rx, ry, 0, 0, 7); v.fill();
  }

  drawProp(v, game, p, t) {
    const S = this.sprites;
    const x = p.x * TILE, y = p.y * TILE;
    const player = game.player;
    switch (p.type) {
      case 'chest': {
        const open = game.flag(F.chest(p.uid));
        v.drawImage(p.big ? (open ? S.chest.bigOpen : S.chest.bigClosed) : (open ? S.chest.open : S.chest.closed), x, y, 16, 16);
        break;
      }
      case 'statue': {
        const r = game.save.respawn;
        const lit = r && r.area === game.area.id && r.x === p.x && r.y === p.y + 1;
        v.drawImage(S.statue[lit ? 1 : 0], x, y - 4, 16, 16);
        if (lit) { v.globalCompositeOperation = 'lighter'; v.drawImage(S.glow, x - 4, y - 10, 24, 24); v.globalCompositeOperation = 'source-over'; }
        break;
      }
      case 'sign': v.drawImage(S.sign, x, y, 16, 16); break;
      case 'flag': v.drawImage(S.flag[Math.floor(t * 4) % 2], x, y, 16, 16); if (game.race) { const a = 0.5 + 0.5 * Math.sin(t * 6); v.globalAlpha = a; v.drawImage(S.glow, x - 8, y - 8, 32, 32); v.globalAlpha = 1; } break;
      case 'honeycap': {
        const bob = Math.sin(t * 3 + p.x) * 1;
        this.shadow(v, x + 8, y + 14, 4);
        v.drawImage(S.items.honeycap, x, y - 2 + bob, 16, 16);
        v.globalCompositeOperation = 'lighter'; v.globalAlpha = 0.5; v.drawImage(S.glow, x - 4, y - 6 + bob, 24, 24); v.globalAlpha = 1; v.globalCompositeOperation = 'source-over';
        break;
      }
      case 'fishspot': {
        const a = 0.35 + 0.25 * Math.sin(t * 2);
        v.strokeStyle = `rgba(255,255,255,${a})`;
        v.lineWidth = 1;
        v.beginPath(); v.ellipse(x - 6, y + 9, 5 + Math.sin(t * 2) * 1.5, 2, 0, 0, 7); v.stroke();
        break;
      }
      case 'npc': {
        const talking = game.talk && game.talk.npc === p.id;
        const near = Math.hypot(player.x - (x + 8), player.y - (y + 8)) < 30;
        let dir = 0;
        if (talking || near) {
          const dx = player.x - (x + 8), dy = player.y - (y + 8);
          dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
        }
        const bob = Math.floor(t * 2 + p.x) % 2;
        this.shadow(v, x + 8, y + 15, 5);
        if (S.people[p.id]) v.drawImage(S.people[p.id][dir][talking ? (Math.floor(t * 6) % 2 ? 1 : 0) : 0], x, y - 1 + (bob && !talking ? -0.3 : 0), 16, 16);
        else if (p.id === 'owl') v.drawImage(S.owl[Math.floor(t * 1.3) % 7 === 0 ? 2 : 0], x, y - 2, 16, 16);
        else if (p.id === 'biscuit') v.drawImage(S.cat[Math.floor(t * 2) % 2], x, y, 16, 16);
        else if (p.id === 'shadefriend') v.drawImage(S.shade[Math.floor(t * 3) % 2][1], x - 2, y - 6, 20, 20);
        if (near && !game.talk && game.mode === 'play') {
          const by = y - 9 + Math.sin(t * 4) * 1;
          v.fillStyle = '#2a1e2e'; v.beginPath(); v.arc(x + 8, by, 4.2, 0, 7); v.fill();
          v.fillStyle = '#fff'; v.beginPath(); v.arc(x + 8, by, 3.4, 0, 7); v.fill();
          v.fillStyle = '#2a1e2e'; v.fillRect(x + 6, by - 0.5, 1, 1); v.fillRect(x + 7.6, by - 0.5, 1, 1); v.fillRect(x + 9.2, by - 0.5, 1, 1);
        }
        break;
      }
      default: break;
    }
  }

  drawPlayer(v, game, t) {
    const S = this.sprites;
    const p = game.player;
    if (p.iframes > 0 && Math.floor(p.iframes * 14) % 2 === 0 && game.mode === 'play') return;
    const dir = DIRI(p.face);
    let frame = 0;
    if (p.moving && !p.action) frame = [1, 0, 2, 0][Math.floor(p.walk * 9) % 4];
    if (game.mode === 'itemget') frame = 3;
    const x = p.x - 8, y = p.y - 11;
    this.shadow(v, p.x, p.y + 4, 5);
    if (p.action === 'dash') { v.globalCompositeOperation = 'lighter'; v.drawImage(S.glow, p.x - 14, p.y - 18, 28, 28); v.globalCompositeOperation = 'source-over'; }
    if (p.action === 'swing') this.drawSword(v, p, dir, true);
    v.drawImage(S.people.wren[dir][frame], x, y, 16, 16);
    if (p.action === 'swing') this.drawSword(v, p, dir, false);
    if (game.mode === 'itemget' && game.itemGet) {
      const it = S.items[game.itemGet.item] || S.items.berry;
      v.globalCompositeOperation = 'lighter';
      v.drawImage(S.glow, p.x - 14, p.y - 34, 28, 28);
      v.globalCompositeOperation = 'source-over';
      v.drawImage(it, p.x - 8, p.y - 28, 16, 16);
    }
    if (game.mode === 'fishing' && game.fishing) {
      const f = game.fishing;
      const bx = p.x - 30, by = p.y + 2 + (f.phase === 'bite' ? Math.sin(t * 40) * 1.5 + 1.5 : Math.sin(t * 3) * 0.6);
      v.strokeStyle = '#6b4526'; v.lineWidth = 1.2;
      v.beginPath(); v.moveTo(p.x - 4, p.y - 2); v.lineTo(p.x - 14, p.y - 14); v.stroke();
      v.strokeStyle = 'rgba(255,255,255,0.7)'; v.lineWidth = 0.5;
      v.beginPath(); v.moveTo(p.x - 14, p.y - 14); v.quadraticCurveTo(bx + 4, p.y - 10, bx, by); v.stroke();
      v.fillStyle = '#ff5a5a'; v.beginPath(); v.arc(bx, by, 2, Math.PI, 0); v.fill();
      v.fillStyle = '#fff'; v.beginPath(); v.arc(bx, by, 2, 0, Math.PI); v.fill();
      if (f.phase === 'bite') { v.fillStyle = '#ffe36b'; v.font = 'bold 10px system-ui'; v.fillText('!', p.x - 2, p.y - 16); }
    }
  }

  drawSword(v, p, dir, behind) {
    // Behind Wren when swinging up, in front otherwise.
    if ((dir === 1) !== behind) return;
    const k = Math.min(1, p.actionT / 0.16);
    const base = [Math.PI / 2, -Math.PI / 2, Math.PI, 0][dir];
    const a = base - 1.1 + k * 2.2;
    const cx = p.x, cy = p.y - 4;
    v.save();
    v.translate(cx, cy);
    if (k < 1) {
      v.strokeStyle = 'rgba(255,255,255,0.65)';
      v.lineWidth = 3;
      v.beginPath(); v.arc(0, 0, 13, base - 1.1, a); v.stroke();
    }
    v.rotate(a + Math.PI / 4 + Math.PI / 2);
    v.drawImage(this.sprites.items.sword, -2, -16, 16, 16);
    v.restore();
  }

  drawFox(v, game, t) {
    const S = this.sprites;
    const f = game.fox;
    const sit = f.sit > 0.8;
    const frame = sit ? 0 : [1, 0, 2, 0][Math.floor(t * 10) % 4];
    this.shadow(v, f.x, f.y + 4, 4);
    v.save();
    v.translate(f.x, f.y - 9);
    if (f.face < 0) v.scale(-1, 1);
    v.drawImage(sit ? S.foxSit : S.fox[frame], -8, -2, 16, 16);
    v.restore();
  }

  drawEnemy(v, game, e, t) {
    const S = this.sprites;
    if (e.iframes > 0 && Math.floor(e.iframes * 30) % 2 === 0) return;
    const f2 = Math.floor(e.anim * 6) % 2;
    const dir = DIRI(e.face);
    switch (e.kind) {
      case 'slime': this.shadow(v, e.x, e.y + 4, 5); v.drawImage(S.slime[e.state === 'squash' ? 1 : e.state === 'hop' ? 2 : 0], e.x - 8, e.y - 11 - e.z, 16, 16); break;
      case 'bigslime': this.shadow(v, e.x, e.y + 8, 11); v.drawImage(S.bigslime[e.state === 'squash' ? 1 : e.state === 'hop' ? 2 : 0], e.x - 16, e.y - 23 - e.z, 32, 32); break;
      case 'bat': this.shadow(v, e.x, e.y + 8, 4); v.drawImage(S.bat[e.state === 'flap' ? Math.floor(e.anim * 20) % 2 : f2], e.x - 8, e.y - 12, 16, 16); break;
      case 'beetle': this.shadow(v, e.x, e.y + 5, 6); v.drawImage(S.beetle[dir][f2], e.x - 8, e.y - 10, 16, 16); break;
      case 'shellbeetle': this.shadow(v, e.x, e.y + 8, 11); v.drawImage(S.shellbeetle[dir][f2], e.x - 16, e.y - 18, 32, 32); break;
      case 'gearknight': {
        this.shadow(v, e.x, e.y + 8, 9);
        v.save(); v.translate(e.x, e.y - 4);
        if (e.state === 'spin') v.rotate(e.anim * 18);
        v.drawImage(S.gearknight[dir][f2], -16, -14, 32, 32);
        v.restore();
        break;
      }
      case 'wisp': {
        const a = 0.75 + 0.25 * Math.sin(e.anim * 5);
        v.globalAlpha = a;
        v.globalCompositeOperation = 'lighter'; v.drawImage(S.glowPurple, e.x - 12, e.y - 14, 24, 24); v.globalCompositeOperation = 'source-over';
        v.drawImage(S.wisp[f2], e.x - 8, e.y - 10 + Math.sin(e.anim * 3) * 1.5, 16, 16);
        v.globalAlpha = 1;
        break;
      }
      case 'toad': {
        this.shadow(v, e.x, e.y + 9, 13 - Math.min(8, e.z / 6), 4);
        const fr = e.state === 'crouch' ? 1 : e.state === 'puff' ? 2 : e.state === 'dazed' ? 3 : 0;
        v.drawImage(S.toad[fr], e.x - 16, e.y - 22 - e.z, 32, 32);
        break;
      }
      case 'bellcrab': {
        this.shadow(v, e.x, e.y + 9, 14, 4);
        const shakeX = e.state === 'bell' ? Math.sin(t * 60) * 1.2 : 0;
        v.drawImage(e.stun > 0 ? S.crabFlip : S.crab[e.state === 'claw' ? 1 : 0], e.x - 16 + shakeX, e.y - 20, 32, 32);
        break;
      }
      case 'shade': {
        const a = e.revealed ? 1 : 0.55 + 0.15 * Math.sin(t * 4);
        v.globalAlpha = a;
        if (e.revealed) { v.globalCompositeOperation = 'lighter'; v.drawImage(S.glow, e.x - 20, e.y - 30, 40, 40); v.globalCompositeOperation = 'source-over'; }
        this.shadow(v, e.x, e.y + 10, 9, 3);
        v.drawImage(S.shade[f2][e.revealed ? 1 : 0], e.x - 16, e.y - 24 - e.z, 32, 32);
        v.globalAlpha = 1;
        break;
      }
      default: break;
    }
    if (e.stun > 0 && !(e.kind === 'bellcrab')) this.stars(v, e.x, e.y - e.hh - 10, t);
    if (e.stun > 0 && e.kind === 'bellcrab') this.stars(v, e.x, e.y - 18, t);
    if (e.state === 'dazed') this.stars(v, e.x, e.y - 24, t);
  }

  stars(v, x, y, t) {
    v.fillStyle = '#ffe36b';
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * 2.1;
      v.fillRect(x + Math.cos(a) * 7 - 1, y + Math.sin(a) * 2.5 - 1, 2, 2);
    }
  }

  drawPickup(v, k, t) {
    const S = this.sprites;
    const bob = k.z + (k.kind === 'shard' || k.kind === 'container' ? Math.sin(t * 3) * 2 + 4 : 0);
    if (k.life !== Infinity && k.life - k.t < 2.5 && Math.floor(k.t * 10) % 2) return;
    this.shadow(v, k.x, k.y + 4, 4);
    if (k.kind === 'shard' || k.kind === 'container') { v.globalCompositeOperation = 'lighter'; v.drawImage(S.glow, k.x - 14, k.y - 18 - bob, 28, 28); v.globalCompositeOperation = 'source-over'; }
    const spr = S.items[k.kind] || S.items.berry;
    const size = k.kind === 'berry' || k.kind === 'berry5' || k.kind === 'heart' ? 11 : 16;
    v.drawImage(spr, k.x - size / 2, k.y - size / 2 - 2 - bob, size, size);
  }

  drawShots(v, game) {
    const S = this.sprites;
    const t = this.time;
    for (const s of game.shots) {
      if (s.kind === 'ember') {
        v.globalCompositeOperation = 'lighter'; v.drawImage(S.glow, s.x - 9, s.y - 9, 18, 18); v.globalCompositeOperation = 'source-over';
        v.fillStyle = '#ffd25a'; v.beginPath(); v.arc(s.x, s.y, 2.2, 0, 7); v.fill();
        v.fillStyle = '#fff6d0'; v.beginPath(); v.arc(s.x, s.y, 1, 0, 7); v.fill();
      } else if (s.kind === 'boomerang') {
        v.save(); v.translate(s.x, s.y); v.rotate(s.spin); v.drawImage(S.items.boomerang, -6, -6, 12, 12); v.restore();
      } else if (s.kind === 'vine') {
        v.strokeStyle = '#2f6b2a'; v.lineWidth = 2.4;
        v.beginPath(); v.moveTo(s.ox, s.oy); v.lineTo(s.x, s.y); v.stroke();
        v.strokeStyle = '#7fd06a'; v.lineWidth = 1.2;
        v.beginPath(); v.moveTo(s.ox, s.oy); v.lineTo(s.x, s.y); v.stroke();
        v.fillStyle = '#6fbf4a'; v.beginPath(); v.ellipse(s.x, s.y, 3, 2, t * 4, 0, 7); v.fill();
      }
    }
    for (const h of game.hostile) {
      if (h.kind === 'seed') { v.fillStyle = '#2a1e2e'; v.beginPath(); v.arc(h.x, h.y, 3.6, 0, 7); v.fill(); v.fillStyle = '#9be36a'; v.beginPath(); v.arc(h.x, h.y, 2.6, 0, 7); v.fill(); }
      else if (h.kind === 'orb') { v.globalCompositeOperation = 'lighter'; v.drawImage(S.glowPurple, h.x - 10, h.y - 10, 20, 20); v.globalCompositeOperation = 'source-over'; v.fillStyle = '#2a1650'; v.beginPath(); v.arc(h.x, h.y, 4, 0, 7); v.fill(); v.fillStyle = '#c8b0ff'; v.fillRect(h.x - 1.5, h.y - 1.5, 1.4, 1.4); }
      else if (h.kind === 'claw') { v.fillStyle = '#2a1e2e'; v.beginPath(); v.ellipse(h.x, h.y, 6, 4.6, Math.atan2(h.vy, h.vx), 0, 7); v.fill(); v.fillStyle = '#e8674d'; v.beginPath(); v.ellipse(h.x, h.y, 5, 3.6, Math.atan2(h.vy, h.vx), 0, 7); v.fill(); }
      else if (h.kind === 'ring') { v.strokeStyle = 'rgba(255,240,200,0.85)'; v.lineWidth = 3; v.beginPath(); v.ellipse(h.x, h.y, h.r, h.r * 0.7, 0, 0, 7); v.stroke(); v.strokeStyle = 'rgba(255,170,80,0.6)'; v.lineWidth = 1.2; v.beginPath(); v.ellipse(h.x, h.y, h.r - 3, (h.r - 3) * 0.7, 0, 0, 7); v.stroke(); }
      else if (h.kind === 'wave') { v.fillStyle = 'rgba(60,30,120,0.8)'; v.beginPath(); v.ellipse(h.x, h.y, h.r + 2, h.h + 6, 0, 0, 7); v.fill(); v.fillStyle = 'rgba(190,160,255,0.7)'; v.beginPath(); v.ellipse(h.x, h.y, h.r - 2, h.h, 0, 0, 7); v.fill(); }
    }
  }

  drawParticles(v) {
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      v.globalAlpha = Math.max(0, k);
      v.fillStyle = p.color;
      if (p.kind === 'puff') { v.beginPath(); v.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, 7); v.fill(); }
      else if (p.kind === 'leaf' || p.kind === 'rock') { v.save(); v.translate(p.x, p.y); v.rotate(p.rot); v.fillRect(-1.5, -0.8, 3, 1.6); v.restore(); }
      else if (p.kind === 'heart') { v.fillRect(p.x - 1, p.y - 1, 2, 2); v.fillRect(p.x - 2, p.y - 2, 1.5, 1.5); v.fillRect(p.x + 0.5, p.y - 2, 1.5, 1.5); }
      else v.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    v.globalAlpha = 1;
  }

  // ------------------------------------------------------------ light

  darkness(game) {
    if (game.area.kind === 'overworld') return nightAmount(game.save.time) * 0.68;
    if (game.room.dark) {
      const solved = game.flag(F.solved(game.area.id, game.room.key));
      return solved && game.room.cond === 'torches' ? 0.55 : 0.9;
    }
    return 0;
  }

  drawDarkness(v, game, cam) {
    let dark = this.darkness(game);
    if (game.transition && game.transition.kind === 'slide') {
      const a = game.area.rooms.get(game.transition.to);
      if (game.area.kind === 'dungeon') dark = a.dark ? 0.9 * Math.min(1, game.transition.t / game.transition.dur) : 0;
    }
    const dusk = game.area.kind === 'overworld' ? duskAmount(game.save.time) : 0;
    v.setTransform(BAKE, 0, 0, BAKE, -cam.x * BAKE, -cam.y * BAKE);
    if (dusk > 0.02) {
      v.fillStyle = `rgba(255,130,60,${(dusk * 0.16).toFixed(3)})`;
      v.fillRect(cam.x, cam.y, VIEW_W, VIEW_H);
    }
    if (dark < 0.02) return;
    const m = this.mctx;
    const k = 0.5; // mask is half resolution
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, this.mask.width, this.mask.height);
    m.fillStyle = game.area.kind === 'overworld' ? '#0b0a2e' : '#07050f';
    m.globalAlpha = dark;
    m.fillRect(0, 0, this.mask.width, this.mask.height);
    m.globalAlpha = 1;
    m.globalCompositeOperation = 'destination-out';
    const L = this.sprites.light;
    const hole = (x, y, r) => m.drawImage(L, (x - cam.x - r) * k, (y - cam.y - r) * k, r * 2 * k, r * 2 * k);
    const p = game.player;
    const flick = 1 + Math.sin(this.time * 9) * 0.03;
    hole(p.x, p.y - 4, (game.isDungeon ? 46 : 52) * flick);
    for (const i of game.lit) hole((i % game.area.w) * TILE + 8, Math.floor(i / game.area.w) * TILE + 4, 54 * flick);
    for (const s of game.shots) if (s.kind === 'ember') hole(s.x, s.y, 26);
    if (game.area.kind === 'overworld') {
      const rc = this.rooms.get(`${game.area.id}:${game.room.key}`);
      if (rc) for (const d of rc.dyn) if (d.ch === 'Y' && game.flag(F.lamp(d.i))) hole(d.x + 8, d.y - 2, 60);
      if (game.save.ended && game.room.key === '1,2') hole(30 * TILE, 29 * TILE, 110);
      for (const pr of game.props) if (pr.type === 'statue') hole(pr.x * TILE + 8, pr.y * TILE + 4, 20);
    }
    for (const e of game.enemies) if (e.alive && e.kind === 'shade' && e.revealed) hole(e.x, e.y - 8, 30);
    for (const k2 of game.pickups) if (k2.kind === 'shard') hole(k2.x, k2.y, 30);
    v.drawImage(this.mask, cam.x, cam.y, VIEW_W, VIEW_H);
  }

  drawFlies(v, game, cam) {
    if (game.area.kind !== 'overworld' || !this.flies.length) return;
    const night = nightAmount(game.save.time);
    const show = Math.max(night, game.room.region === 'forest' ? 0.35 : 0);
    if (show < 0.1) return;
    v.setTransform(BAKE, 0, 0, BAKE, -cam.x * BAKE, -cam.y * BAKE);
    const t = this.time;
    const ox = game.room.rx * VIEW_W, oy = game.room.ry * VIEW_H;
    v.globalCompositeOperation = 'lighter';
    for (const f of this.flies) {
      const x = ox + f.x + Math.sin(t * 0.6 * f.s + f.p) * 18;
      const y = oy + f.y + Math.cos(t * 0.8 * f.s + f.p * 2) * 10;
      const a = (0.5 + 0.5 * Math.sin(t * 3 * f.s + f.p)) * show;
      v.globalAlpha = a;
      v.drawImage(this.sprites.glow, x - 5, y - 5, 10, 10);
      v.fillStyle = '#fff6b0';
      v.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
    v.globalAlpha = 1;
    v.globalCompositeOperation = 'source-over';
  }

  drawTelegraphs(v, game) {
    const t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 16);
    for (const e of game.enemies) {
      if (!e.alive || !e.tele) continue;
      const tl = e.tele;
      v.lineWidth = 1.5;
      if (tl.kind === 'line') {
        const len = tl.len || 90;
        v.strokeStyle = `rgba(255,80,90,${0.35 + pulse * 0.4})`;
        v.setLineDash([4, 3]);
        v.beginPath(); v.moveTo(e.x, e.y); v.lineTo(e.x + tl.dx * len, e.y + tl.dy * len); v.stroke();
        v.setLineDash([]);
      } else if (tl.kind === 'shadow') {
        v.fillStyle = 'rgba(20,10,30,0.35)';
        v.beginPath(); v.ellipse(tl.x, tl.y + 4, tl.r, tl.r * 0.55, 0, 0, 7); v.fill();
        v.strokeStyle = `rgba(255,80,90,${0.4 + pulse * 0.5})`;
        v.beginPath(); v.ellipse(tl.x, tl.y + 4, tl.r, tl.r * 0.55, 0, 0, 7); v.stroke();
      } else if (tl.kind === 'ring') {
        v.strokeStyle = `rgba(255,190,90,${0.3 + pulse * 0.5})`;
        v.setLineDash([3, 3]);
        v.beginPath(); v.ellipse(e.x, e.y, tl.r, tl.r * 0.7, 0, 0, 7); v.stroke();
        v.setLineDash([]);
      } else if (tl.kind === 'glow' || tl.kind === 'squash' || tl.kind === 'puff') {
        v.strokeStyle = `rgba(255,230,110,${0.3 + pulse * 0.6})`;
        v.beginPath(); v.arc(e.x, e.y - 4, e.hw + 6 + pulse * 2, 0, 7); v.stroke();
      } else if (tl.kind === 'point' && tl.tile != null) {
        const tx = (tl.tile % game.area.w) * TILE + 8, ty = Math.floor(tl.tile / game.area.w) * TILE + 2;
        v.strokeStyle = `rgba(170,120,255,${0.4 + pulse * 0.5})`;
        v.setLineDash([2, 3]);
        v.beginPath(); v.moveTo(e.x, e.y - 8); v.lineTo(tx, ty); v.stroke();
        v.setLineDash([]);
      } else if (tl.kind === 'band') {
        const rr = game.roomRect;
        v.fillStyle = `rgba(120,70,220,${0.12 + pulse * 0.16})`;
        v.fillRect(rr.x + TILE, tl.y - 12, rr.w - TILE * 2, 24);
        v.strokeStyle = `rgba(190,150,255,${0.4 + pulse * 0.4})`;
        v.strokeRect(rr.x + TILE, tl.y - 12, rr.w - TILE * 2, 24);
      }
    }
  }

  // ------------------------------------------------------------ HUD

  drawItemBox(ctx, game, L, d, u, opts) {
    const S = this.sprites;
    const box = u * 2.3;
    const bx = (L.x + L.w) * d - box - u * 0.6, by = L.y * d + u * 0.6;
    ctx.fillStyle = 'rgba(20,12,36,0.62)';
    roundedRect(ctx, bx, by, box, box, u * 0.5); ctx.fill();
    ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = Math.max(1.5, u * 0.1);
    roundedRect(ctx, bx, by, box, box, u * 0.5); ctx.stroke();
    const item = game.save.equipped;
    if (S.items[item]) ctx.drawImage(S.items[item], bx + box * 0.15, by + box * 0.12, box * 0.7, box * 0.7);
    ctx.font = `800 ${Math.round(u * 0.5)}px ui-rounded, system-ui, sans-serif`;
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(opts.itemKey ?? 'K', bx + box / 2, by + box * 0.92);
    const owned = ITEMS.filter((i) => game.save.items[i]).length;
    if (owned > 1) { ctx.fillStyle = 'rgba(255,233,168,0.75)'; ctx.fillText(opts.swapKey ?? 'Q ⇄', bx + box / 2, by + box + u * 0.45); }
    ctx.textAlign = 'left';
  }

  drawHud(ctx, game, opts) {
    const L = this.layout, d = this.dpr;
    const u = Math.max(13, Math.min(24, L.h / 15)) * d;
    const x0 = L.x * d + u * 0.7, y0 = L.y * d + u * 0.6;
    const S = this.sprites;
    ctx.save();
    // Hearts
    const icons = heartIcons(game.player.hp, game.save.maxHearts);
    const perRow = 6;
    icons.forEach((kind, i) => {
      const hx = x0 + (i % perRow) * u * 1.05, hy = y0 + Math.floor(i / perRow) * u;
      ctx.globalAlpha = kind === 'empty' ? 0.28 : 1;
      if (kind === 'half') {
        ctx.globalAlpha = 0.28; ctx.drawImage(S.items.heart, hx, hy, u, u);
        ctx.globalAlpha = 1; ctx.save(); ctx.beginPath(); ctx.rect(hx, hy, u / 2, u); ctx.clip(); ctx.drawImage(S.items.heart, hx, hy, u, u); ctx.restore();
      } else ctx.drawImage(S.items.heart, hx, hy, u, u);
    });
    ctx.globalAlpha = 1;
    const rows = Math.ceil(icons.length / perRow);
    let ly = y0 + rows * u + u * 0.15;
    ctx.font = `800 ${Math.round(u * 0.78)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const label = (icon, text, x, y) => {
      ctx.drawImage(icon, x, y, u, u);
      ctx.lineWidth = u * 0.2; ctx.strokeStyle = 'rgba(20,12,36,0.9)'; ctx.strokeText(text, x + u * 1.1, y + u * 0.55);
      ctx.fillStyle = '#fff8e8'; ctx.fillText(text, x + u * 1.1, y + u * 0.55);
      return x + u * 1.3 + ctx.measureText(text).width + u * 0.5;
    };
    let lx = label(S.items.berry, String(game.save.berries), x0, ly);
    if (game.isDungeon) {
      lx = label(S.items.key, String(game.save.keys[game.area.id] || 0), lx, ly);
      if (game.save.bigKeys[game.area.id]) ctx.drawImage(S.items.bigkey, lx, ly, u, u);
    }
    if (game.save.tea) ctx.drawImage(S.items.tea, lx + (game.isDungeon && game.save.bigKeys[game.area.id] ? u * 1.2 : 0), ly, u, u);
    if (game.race) {
      ly += u * 1.2;
      const tt = Math.max(0, game.race.t).toFixed(1);
      ctx.fillStyle = game.race.t < 8 ? '#ff8a8a' : '#fff8e8';
      ctx.strokeText(`⏱ ${tt}s`, x0, ly + u * 0.55);
      ctx.fillText(`⏱ ${tt}s`, x0, ly + u * 0.55);
    }
    // Equipped item, top right of the view. Touch players have the item
    // button instead (and the Bag button sits here in landscape).
    if (opts.itemKey !== '') this.drawItemBox(ctx, game, L, d, u, opts);
    // Boss health
    const boss = game.enemies.find((e) => e.alive && (e.boss || e.mini));
    if (boss && game.mode === 'play') {
      const bw = L.w * d * 0.46, bh = u * 0.42;
      const bx2 = (L.x + L.w / 2) * d - bw / 2, by2 = (L.y + L.h) * d - u * 1.3;
      ctx.fillStyle = 'rgba(20,12,36,0.7)'; roundedRect(ctx, bx2 - 4 * d, by2 - u * 0.9, bw + 8 * d, bh + u * 1.05, u * 0.3); ctx.fill();
      ctx.fillStyle = '#4a2a4a'; roundedRect(ctx, bx2, by2, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = boss.kind === 'shade' ? '#a888ff' : '#ff7a6a';
      roundedRect(ctx, bx2, by2, Math.max(bh, bw * boss.hp / boss.maxHp), bh, bh / 2); ctx.fill();
      ctx.fillStyle = '#fff8e8'; ctx.font = `800 ${Math.round(u * 0.55)}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(BOSS_TYPES[boss.kind]?.name || ENEMY_NAMES[boss.kind] || '', bx2 + bw / 2, by2 - u * 0.4);
      ctx.textAlign = 'left';
    }
    // Toast
    if (game.toast) {
      const msg = game.toast.text;
      ctx.font = `800 ${Math.round(u * 0.72)}px ui-rounded, system-ui, sans-serif`;
      const tw = Math.min(L.w * d * 0.9, ctx.measureText(msg).width + u * 1.6);
      const tx = (L.x + L.w / 2) * d - tw / 2, ty = (L.y + L.h) * d - u * (boss ? 3.2 : 1.9);
      const a = Math.min(1, game.toast.t * 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(20,12,36,0.78)'; roundedRect(ctx, tx, ty - u * 0.6, tw, u * 1.2, u * 0.6); ctx.fill();
      ctx.fillStyle = '#fff8e8'; ctx.textAlign = 'center';
      ctx.fillText(msg, tx + tw / 2, ty, tw - u);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

function duskAmount(time) {
  const t = ((time % 1) + 1) % 1;
  const d = Math.min(Math.abs(t - 0.74), Math.abs(t - 0.24));
  return Math.max(0, 1 - d / 0.06);
}

export { BAKE };
