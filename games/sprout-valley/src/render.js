// Canvas renderer. Reads the world, never changes it. Static ground is baked
// into one small cache per season; everything else is drawn from sprite
// caches at 1 logical pixel per art pixel and scaled up crisply.
import { W, H, G, idx, BUILDINGS, BIN, WELL, TROUGH, SHOP_COUNTER, BOARD, STALL, LANTERNS, GREENHOUSE, FOUNTAIN, PLANTERS, TOWN_LAMPS } from './map.js';
import { CROPS, DECOR, VILLAGER_IDS } from './data.js';
import { stageOf, STAGES } from './crops.js';
import { darkness, isWet } from './time.js';
import {
  T, h2, bakeTiles, bakeTrees, bakeCrop, bakePerson, bakeVillagers, bakeAnimals, bakeCritters, bakePickups, bakeObjects,
  bakeBuildings, bakeProps, bakeGlow, bakeShadow, bakeTools, bakeIcons, iconUrls, PLAYER_PAL, canvas, portrait,
} from './sprites.js';

const MAX_PARTICLES = 220;
const LIGHT_SPOTS = [
  ...BUILDINGS.filter((b) => b.kind !== 'coop' && b.kind !== 'barn').map((b) => [b.door[0] + 0.5, b.door[1] + 0.2, 1.4]),
  ...TOWN_LAMPS.map(([x, y]) => [x + 0.5, y - 0.2, 2.6]),
  // Warm windows.
  ...BUILDINGS.filter((b) => b.kind !== 'barn').flatMap((b) => [[b.x + 0.9, b.y + b.h - 1.3, 0.9], [b.x + b.w - 0.9, b.y + b.h - 1.3, 0.9]]),
];

export class Renderer {
  constructor(cv, { reducedMotion = false } = {}) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.reduced = reducedMotion;
    this.cam = { x: 0, y: 0 };
    this.particles = [];
    this.floaters = []; // item pops and coin text
    this.t = 0;
    this.season = null;
    this.ghKey = null;
    this.hover = null; // [tx, ty] under the mouse
    this.shake = 0;
    this.sky = []; // floating lanterns
    this.rain = [];
    this.sortPool = [];
    this.sortCount = 0;
    this.resize();
  }

  // Bake everything that doesn't depend on the season. Split in steps so the
  // page can spread it over a few frames.
  *bakeSteps() {
    this.crops = {};
    for (const id of Object.keys(CROPS)) { this.crops[id] = bakeCrop(id); yield; }
    this.playerSprites = bakePerson(PLAYER_PAL, { hat: 'straw', overalls: true });
    this.villagerSprites = bakeVillagers();
    yield;
    this.animalSprites = bakeAnimals();
    this.critterSprites = bakeCritters();
    this.pickupSprites = bakePickups();
    this.shadow = bakeShadow();
    this.tools = bakeTools();
    this.glow = bakeGlow(32);
    this.glowBlue = bakeGlow(16, '200,255,140');
    yield;
    const icons = bakeIcons(this.pickupSprites, bakeObjects('spring'), this.tools);
    yield;
    this.icons = {};
    yield* iconUrls(icons, this.icons);
    this.portraits = {};
    for (const id of VILLAGER_IDS) this.portraits[id] = portrait(this.villagerSprites, id).toDataURL();
  }

  bakeAll() { for (const _ of this.bakeSteps()) { /* run to completion */ } }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(this.cv.clientWidth * dpr), h = Math.round(this.cv.clientHeight * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.dpr = dpr;
    // Integer zoom so pixels stay crisp: about 12.5 tiles across the short side.
    this.z = Math.max(2, Math.round(Math.min(w, h) / (T * 12.5)));
    this.viewW = w / this.z; this.viewH = h / this.z;
    this.ctx.imageSmoothingEnabled = false;
  }

  // Season art and the ground cache. Rebuilt when the season or the
  // greenhouse changes.
  prepare(world) {
    let changed = false;
    for (const _ of this.prepareSteps(world)) changed = true;
    return changed;
  }

  *prepareSteps(world) {
    const ghKey = `${world.upgrades.greenhouse}|${world.upgrades.field}`;
    if (this.season === world.season && this.ghKey === ghKey && this.ground) return;
    const season = world.season;
    const seasonChanged = this.season !== season || !this.tiles;
    this.ground = null;
    if (seasonChanged) {
      this.tiles = bakeTiles(season);
      yield;
      this.trees = bakeTrees(season);
      this.objects = bakeObjects(season);
      this.props = bakeProps(season);
      yield;
    }
    this.buildings = bakeBuildings(season, world.upgrades);
    yield;
    this.season = season;
    this.ghKey = ghKey;
    this.bakeGround(world);
    this.buildStatics(world);
    yield;
  }

  bakeGround(world) {
    const [c, ctx] = canvas(W * T, H * T);
    const m = world.map;
    const tiles = this.tiles;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const g = m.ground[idx(x, y)];
      const v = Math.floor(h2(x, y) * 4);
      let spr = tiles.grass[v];
      if (g === G.PATH) spr = tiles.path[v % 3];
      else if (g === G.COBBLE) spr = tiles.cobble[v % 2];
      else if (g === G.SAND) spr = tiles.sand[v % 2];
      else if (g === G.FLOWERS) spr = tiles.flowers[v];
      else if (g === G.FLOOR) spr = tiles.floor[0];
      else if (g === G.WATER) spr = tiles.water[0];
      ctx.drawImage(spr, x * T, y * T);
      if (g === G.BUSH) ctx.drawImage(tiles.bush[0], x * T, y * T);
      if (g === G.FENCE) {
        const left = m.ground[idx(x - 1, y)] === G.FENCE || m.ground[idx(x + 1, y)] === G.FENCE;
        const vert = m.ground[idx(x, y - 1)] === G.FENCE || m.ground[idx(x, y + 1)] === G.FENCE;
        ctx.drawImage(tiles.fence[left && !vert ? 0 : vert && !left ? 1 : 2], x * T, y * T);
        if (left && vert) ctx.drawImage(tiles.fence[0], x * T, y * T);
      }
      // The field: tilled-looking meadow with a little edging so it's easy to find.
      if (world.inField(x, y) && g === G.GRASS) {
        ctx.fillStyle = this.season === 'winter' ? 'rgba(140,150,190,0.12)' : 'rgba(120,80,30,0.13)';
        ctx.fillRect(x * T, y * T, T, T);
        ctx.fillStyle = this.season === 'winter' ? 'rgba(120,130,170,0.35)' : 'rgba(110,70,30,0.32)';
        if (!world.inField(x, y - 1)) ctx.fillRect(x * T, y * T, T, 1);
        if (!world.inField(x, y + 1)) ctx.fillRect(x * T, y * T + T - 1, T, 1);
        if (!world.inField(x - 1, y)) ctx.fillRect(x * T, y * T, 1, T);
        if (!world.inField(x + 1, y)) ctx.fillRect(x * T + T - 1, y * T, 1, T);
      }
      // Pond shores get a soft rim.
      if (g === G.WATER) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        if (m.ground[idx(x, y - 1)] !== G.WATER) ctx.fillRect(x * T, y * T, T, 2);
      }
    }
    this.ground = c;
  }

  // Trees, buildings and props: static y-sorted drawables.
  buildStatics(world) {
    const m = world.map;
    const s = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (m.ground[idx(x, y)] !== G.TREE) continue;
      const v = Math.floor(h2(x, y, 7) * 3);
      s.push({ y: y + 1, x, kind: 'tree', img: this.trees[v], dx: x * T - 4, dy: (y + 1) * T - 32 + 2 });
    }
    for (const b of BUILDINGS) {
      const img = b.kind === 'cottage' ? this.buildings.cottage[b.tint] : this.buildings[b.kind];
      s.push({ y: b.y + b.h, x: b.x, kind: 'building', img, dx: b.x * T, dy: (b.y + b.h) * T - img.height });
    }
    const gh = GREENHOUSE;
    s.push({ y: gh.y0 + 0.9, x: gh.x0, kind: 'building', img: this.buildings.greenhouse, dx: gh.x0 * T, dy: gh.y0 * T - 8, gh: true });
    const prop = (list, img) => list.forEach(([x, y], i) => s.push({ y: y + 1, x, kind: 'prop', img: typeof img === 'function' ? img(i) : img, dx: x * T, dy: (y + 1) * T - 24, prop: true, i }));
    prop([BIN], this.props.bin);
    prop(PLANTERS, this.props.planter);
    prop(TOWN_LAMPS, this.props.townlamp);
    s.push({ y: FOUNTAIN.y + FOUNTAIN.h, x: FOUNTAIN.x, kind: 'building', img: this.props.fountain, dx: FOUNTAIN.x * T, dy: (FOUNTAIN.y + FOUNTAIN.h) * T - 40 });
    prop([WELL], this.props.well);
    prop(SHOP_COUNTER, this.props.counter);
    prop(BOARD, this.props.board);
    s.push(...STALL.map(([x, y]) => ({ y: y + 1, x, kind: 'stall', dx: x * T, dy: (y + 1) * T - 24 })));
    s.push(...TROUGH.map(([x, y]) => ({ y: y + 1, x, kind: 'trough', dx: x * T, dy: (y + 1) * T - 24 })));
    s.push(...LANTERNS.map(([x, y], i) => ({ y: y + 1, x, kind: 'lantern', i, dx: x * T, dy: (y + 1) * T - 24 })));
    this.statics = s;
  }

  toTile(clientX, clientY) {
    const rect = this.cv.getBoundingClientRect();
    const lx = ((clientX - rect.left) * this.dpr) / this.z + this.cam.x;
    const ly = ((clientY - rect.top) * this.dpr) / this.z + this.cam.y;
    return [Math.floor(lx / T), Math.floor(ly / T)];
  }

  // ------------------------------------------------------------ effects

  burst(x, y, n, opts) {
    if (this.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 30) * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x: x * T, y: y * T, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.lift || 0), g: opts.g ?? 60,
        life: 0, max: (opts.life || 0.6) * (0.7 + Math.random() * 0.6), color: opts.colors[i % opts.colors.length], size: opts.size || 1, kind: opts.kind || 'dot',
      });
    }
  }

  floatIcon(x, y, icon, text) {
    if (this.floaters.length > 12) this.floaters.shift();
    this.floaters.push({ x: x * T, y: y * T, icon, text, life: 0 });
  }

  handleEvents(events, world) {
    for (const e of events) {
      switch (e.type) {
        case 'till': this.burst(e.x + 0.5, e.y + 0.7, 8, { colors: ['#9c6f45', '#b58457', '#7a5638'], speed: 26, lift: 30, g: 120, life: 0.5 }); break;
        case 'break': this.burst(e.x + 0.5, e.y + 0.6, 10, { colors: ['#adb5bd', '#ced4da', '#868e96'], speed: 40, lift: 30, g: 140, life: 0.5, size: 2 }); break;
        case 'cut': this.burst(e.x + 0.5, e.y + 0.6, 9, { colors: e.hay ? ['#e9c46a', '#c3c56c', '#8acb63'] : ['#5fb04a', '#86cf68', '#3f8a35'], speed: 34, lift: 20, g: 50, life: 0.7 }); if (e.hay) this.floatIcon(e.x + 0.5, e.y, 'hay', '+1'); break;
        case 'splash': for (const [x, y] of e.tiles) this.burst(x + 0.5, y + 0.5, 5, { colors: ['#a5d8ff', '#74c0fc', '#e7f5ff'], speed: 22, lift: 25, g: 110, life: 0.45 }); break;
        case 'plant': this.burst(e.x + 0.5, e.y + 0.8, 5, { colors: ['#86cf68', '#5fb04a'], speed: 14, lift: 18, g: 60, life: 0.4 }); break;
        case 'harvest':
          this.burst(e.x + 0.5, e.y + 0.4, 14, { colors: ['#fff3b0', '#ffffff', CROPS[e.item].color], speed: 40, lift: 20, g: 20, life: 0.8, kind: 'spark' });
          this.floatIcon(e.x + 0.5, e.y, e.item, e.n > 1 ? `+${e.n}` : '');
          break;
        case 'pickup': this.floatIcon(e.x + 0.5, e.y, e.item, `+${e.n}`); this.burst(e.x + 0.5, e.y + 0.5, 6, { colors: ['#fff3b0', '#ffffff'], speed: 26, g: 10, life: 0.5, kind: 'spark' }); break;
        case 'egg': this.burst(e.x + 0.5, e.y + 0.5, 12, { colors: ['#ffadad', '#fdffb6', '#9bf6ff', '#caffbf', '#bdb2ff'], speed: 40, g: 20, life: 0.8, kind: 'spark' }); break;
        case 'pet': this.burst(e.x, e.y - 0.6, e.happy ? 4 : 1, { colors: ['#ff6b8b'], speed: 10, lift: 30, g: -10, life: 1, kind: 'heart' }); break;
        case 'catch': { const p = world.player; this.floatIcon(p.x, p.y - 1.2, e.id, e.first ? 'New!' : ''); this.burst(p.x, p.y - 0.8, 12, { colors: ['#fff3b0', '#a5d8ff', '#ffffff'], speed: 40, g: 30, life: 0.8, kind: 'spark' }); break; }
        case 'critter': this.burst(e.x, e.y, 12, { colors: ['#fff3b0', '#ffffff', '#ffd6e0'], speed: 36, g: 0, life: 0.8, kind: 'spark' }); break;
        case 'bite': this.burst(e.x + 0.5, e.y + 0.5, 8, { colors: ['#e7f5ff', '#a5d8ff'], speed: 30, lift: 30, g: 120, life: 0.5 }); break;
        case 'festivalWon': this.confetti(world); break;
        case 'lantern': { const [x, y] = LANTERNS[e.i]; this.burst(x + 0.5, y - 0.4, 10, { colors: ['#ffd166', '#fff3b0'], speed: 26, g: -20, life: 0.9, kind: 'spark' }); break; }
        case 'place': case 'pickupObj': this.burst(e.x + 0.5, e.y + 0.8, 6, { colors: ['#ffffff', '#e9ecef'], speed: 20, g: 40, life: 0.4 }); break;
        case 'craft': case 'upgrade': { const p = world.player; this.burst(p.x, p.y - 1, 14, { colors: ['#fff3b0', '#ffd6e0', '#caffbf'], speed: 40, g: 10, life: 0.9, kind: 'spark' }); break; }
        default: break;
      }
    }
  }

  confetti(world) {
    const p = world.player;
    this.burst(p.x, p.y - 1.5, 40, { colors: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'], speed: 90, lift: 60, g: 90, life: 1.6, size: 2 });
  }

  update(dt, world) {
    this.t += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life += dt;
      if (f.life > 1.2) this.floaters.splice(i, 1);
    }
    if (!world) return;
    // Camera eases toward the farmer.
    const px = world.player.x * T - this.viewW / 2, py = world.player.y * T - this.viewH / 2 - 6;
    const tx = clamp(px, 0, W * T - this.viewW), ty = clamp(py, 0, H * T - this.viewH);
    if (this.snapCam || this.reduced) { this.cam.x = tx; this.cam.y = ty; this.snapCam = false; }
    else { const k = Math.min(1, dt * 8); this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; }
    if (W * T < this.viewW) this.cam.x = (W * T - this.viewW) / 2;
    if (H * T < this.viewH) this.cam.y = (H * T - this.viewH) / 2;
    // Floating sky lanterns after Lantern Night is won.
    if (world.fest?.id === 'lanterns' && world.fest.done && world.minute < 24 * 60 && this.sky.length < (this.reduced ? 8 : 30) && Math.random() < dt * 6) {
      this.sky.push({ x: (40 + Math.random() * 16) * T, y: (28 + Math.random() * 8) * T, vx: (Math.random() - 0.5) * 4, vy: -8 - Math.random() * 8, t: Math.random() * 6 });
    }
    for (let i = this.sky.length - 1; i >= 0; i--) {
      const s = this.sky[i];
      s.t += dt; s.x += (s.vx + Math.sin(s.t) * 3) * dt; s.y += s.vy * dt;
      if (s.y < 0) this.sky.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ draw

  draw(world, ui = {}) {
    const ctx = this.ctx;
    const z = this.z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2d4a3e';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    if (!world || !this.ground) return;
    const cx = Math.round(this.cam.x * z) / z, cy = Math.round(this.cam.y * z) / z;
    ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
    ctx.imageSmoothingEnabled = false;
    const x0 = Math.max(0, Math.floor(cx / T) - 1), y0 = Math.max(0, Math.floor(cy / T) - 1);
    const x1 = Math.min(W - 1, Math.ceil((cx + this.viewW) / T) + 1), y1 = Math.min(H - 1, Math.ceil((cy + this.viewH) / T) + 2);
    const sx = x0 * T, sy = y0 * T, sw = (x1 - x0 + 1) * T, sh = (y1 - y0 + 1) * T;
    ctx.drawImage(this.ground, sx, sy, sw, sh, sx, sy, sw, sh);

    const m = world.map;
    const frame = Math.floor(this.t * 2.2) % 3;
    const wfr = this.reduced ? 0 : frame;
    const tiles = this.tiles;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = idx(x, y);
      if (m.ground[k] === G.WATER && wfr) ctx.drawImage(tiles.water[(wfr + ((x + y) & 1)) % 3], x * T, y * T);
      if (world.soil[k]) ctx.drawImage(tiles.soil[world.wet[k] ? 1 : 0], x * T, y * T);
      if (world.tuft[k]) ctx.drawImage(this.objects.tuft, x * T, y * T);
      const o = world.obj[k];
      if (o) {
        if (o.type === 'stone' || o.type === 'weed') ctx.drawImage(this.objects[o.type], x * T, y * T);
        else if (o.type === 'decor' && DECOR[o.id].floor) ctx.drawImage(this.objects.path, 0, 8, 16, 16, x * T, y * T, 16, 16);
      }
    }
    this.drawCursor(world, ui);
    this.drawSorted(world, x0, y0, x1, y1);
    this.drawParticles();
    this.drawLighting(world, x0, y0, x1, y1);
    this.drawWeather(world);
    ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
    this.drawOverlays(world);
  }

  drawCursor(world, ui) {
    const ctx = this.ctx;
    const p = world.player;
    if (p.fishing || ui.hideCursor) return;
    const t = this.hover && ui.mouse ? this.hover : world.facing;
    if (!t) return;
    const [tx, ty] = t;
    const [px, py] = world.tile;
    const near = Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1;
    const pulse = this.reduced ? 0.7 : 0.55 + Math.sin(this.t * 6) * 0.2;
    ctx.globalAlpha = near ? pulse : 0.3;
    ctx.fillStyle = '#ffffff';
    const X = tx * T, Y = ty * T;
    ctx.fillRect(X, Y, 4, 1); ctx.fillRect(X, Y, 1, 4);
    ctx.fillRect(X + 12, Y, 4, 1); ctx.fillRect(X + 15, Y, 1, 4);
    ctx.fillRect(X, Y + 15, 4, 1); ctx.fillRect(X, Y + 12, 1, 4);
    ctx.fillRect(X + 12, Y + 15, 4, 1); ctx.fillRect(X + 15, Y + 12, 1, 4);
    ctx.globalAlpha = 1;
  }

  pushSort(y, kind, ref, a = 0, b = 0) {
    let e = this.sortPool[this.sortCount];
    if (!e) { e = { y: 0, kind: '', ref: null, a: 0, b: 0 }; this.sortPool[this.sortCount] = e; }
    e.y = y; e.kind = kind; e.ref = ref; e.a = a; e.b = b;
    this.sortCount++;
  }

  drawSorted(world, x0, y0, x1, y1) {
    const ctx = this.ctx;
    this.sortCount = 0;
    for (const s of this.statics) {
      const w = s.img ? s.img.width / T : 1;
      if (s.x + w < x0 - 1 || s.x > x1 + 1 || s.y < y0 - 1 || s.y - 7 > y1 + 1) continue;
      this.pushSort(s.y, 'static', s);
    }
    const sway = this.reduced ? 0 : (isWet(world.weather) ? 0.1 : 0.05);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = idx(x, y);
      if (world.crop[k]) this.pushSort(y + 0.95, 'crop', world.crop[k], x, y);
      const o = world.obj[k];
      if (o && (o.type === 'sprinkler' || (o.type === 'decor' && !DECOR[o.id].floor))) this.pushSort(y + 0.9, 'obj', o, x, y);
    }
    for (const pk of world.pickups) if (pk.x >= x0 && pk.x <= x1 && pk.y >= y0 && pk.y <= y1) this.pushSort(pk.y + 0.6, 'pickup', pk);
    for (const a of world.animals) this.pushSort(a.y + 0.3, 'animal', a);
    for (const id of VILLAGER_IDS) { const v = world.vpos[id]; if (v && !v.hidden) this.pushSort(v.y + 0.3, 'villager', v, 0, VILLAGER_IDS.indexOf(id)); }
    for (const c of world.critters) if (!c.fly) this.pushSort(c.y, 'critter', c);
    this.pushSort(world.player.y + 0.3, 'player', world.player);
    // Insertion sort on the pooled entries (nearly sorted frame to frame).
    const arr = this.sortPool, n = this.sortCount;
    for (let i = 1; i < n; i++) {
      const e = arr[i];
      let j = i - 1;
      while (j >= 0 && arr[j].y > e.y) { arr[j + 1] = arr[j]; j--; }
      arr[j + 1] = e;
    }
    for (let i = 0; i < n; i++) {
      const e = arr[i];
      switch (e.kind) {
        case 'static': this.drawStatic(world, e.ref); break;
        case 'crop': this.drawCrop(e.ref, e.a, e.b, sway); break;
        case 'obj': ctx.drawImage(e.ref.type === 'sprinkler' ? this.objects.sprinkler : this.objects[e.ref.id], e.a * T, e.ref.type === 'sprinkler' ? e.b * T : (e.b + 1) * T - 24); break;
        case 'pickup': this.drawPickup(e.ref); break;
        case 'animal': this.drawAnimal(e.ref); break;
        case 'villager': this.drawPerson(this.villagerSprites[VILLAGER_IDS[e.b]], e.ref); break;
        case 'critter': this.drawCritter(e.ref); break;
        case 'player': this.drawPlayer(world); break;
        default: break;
      }
    }
    for (const c of world.critters) if (c.fly) this.drawCritter(c);
  }

  drawStatic(world, s) {
    const ctx = this.ctx;
    if (s.kind === 'stall') { ctx.drawImage(this.props.stall[world.marketOpen() || (world.festival === 'fair' && world.festivalRunning()) ? 1 : 0], s.dx, s.dy); return; }
    if (s.kind === 'trough') { ctx.drawImage(this.props.trough[world.trough <= 0 ? 0 : world.trough < 8 ? 1 : 2], s.dx, s.dy); return; }
    if (s.kind === 'lantern') { ctx.drawImage(this.props.lantern[world.fest?.lit?.includes(s.i) ? 1 : 0], s.dx, s.dy); return; }
    ctx.drawImage(s.img, s.dx, s.dy);
  }

  drawCrop(crop, x, y, sway) {
    const ctx = this.ctx;
    const frames = this.crops[crop.id];
    const st = crop.dead ? STAGES + 1 : stageOf(crop);
    const img = frames[st];
    const bx = x * T + 8, by = y * T + 16;
    const k = st >= 2 && !crop.dead ? Math.sin(this.t * 1.7 + x * 0.7 + y * 0.45) * sway : 0;
    if (k) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.transform(1, 0, -k, 1, 0, 0);
      ctx.drawImage(img, -8, -18);
      ctx.restore();
    } else ctx.drawImage(img, bx - 8, by - 18);
    if (st === STAGES && !this.reduced && Math.floor(this.t * 1.3 + x * 3.7 + y * 1.9) % 7 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 5 + ((x * 7) % 9), by - 12 + ((y * 5) % 6), 1, 1);
    }
  }

  drawPickup(pk) {
    const ctx = this.ctx;
    const bob = this.reduced ? 0 : Math.sin(this.t * 3 + pk.x) * 1.2;
    ctx.drawImage(this.shadow, pk.x * T + 1, pk.y * T + 11);
    const img = pk.festival ? this.pickupSprites.festival[pk.color % 5] : this.pickupSprites[pk.item];
    if (img) ctx.drawImage(img, pk.x * T + 2, pk.y * T + 1 + bob);
  }

  drawAnimal(a) {
    const ctx = this.ctx;
    const frames = this.animalSprites[a.type];
    const img = frames[a.tx !== null ? Math.floor(a.bob * 5) % 2 : 0];
    const x = a.x * T, y = a.y * T;
    ctx.drawImage(this.shadow, x - 7, y - 2);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (a.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -img.width / 2, -img.height + 2);
    ctx.restore();
  }

  drawPerson(sprites, v) {
    const ctx = this.ctx;
    const f = v.moving ? 1 + (Math.floor(v.walk * 7) % 2) : 0;
    const img = sprites[v.dir][f];
    const x = Math.round(v.x * T), y = Math.round(v.y * T);
    ctx.drawImage(this.shadow, x - 7, y - 2);
    ctx.drawImage(img, x - 8, y - 19);
  }

  drawPlayer(world) {
    const ctx = this.ctx;
    const p = world.player;
    this.drawPerson(this.playerSprites, p);
    const x = p.x * T, y = p.y * T;
    if (p.tool && this.tools[p.tool]) {
      // A quick swing arc for the tool.
      const prog = 1 - p.busy / 0.28;
      const dirs = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
      const [dx, dy] = dirs[p.dir];
      const ang = (prog - 0.5) * 1.6 * (dx < 0 ? -1 : 1);
      ctx.save();
      ctx.translate(Math.round(x + dx * 7), Math.round(y - 9 + dy * 5));
      ctx.rotate(ang);
      if (dx < 0) ctx.scale(-1, 1);
      ctx.drawImage(this.tools[p.tool], -2, -10);
      ctx.restore();
    }
    if (p.fishing) {
      const f = p.fishing;
      const bx = (f.tx + 0.5) * T, by = (f.ty + 0.5) * T + (f.state === 'bite' ? Math.sin(this.t * 30) * 1.5 : Math.sin(this.t * 3));
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x + 4, y - 16); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = '#ff595e'; ctx.fillRect(bx - 1, by - 2, 3, 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx - 1, by, 3, 1);
      if (f.state === 'bite') this.bubble(x, y - 24, '!', '#ff595e');
    }
  }

  bubble(x, y, text, color) {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x - 4), Math.round(y - 6), 9, 9);
    ctx.fillRect(Math.round(x - 1), Math.round(y + 3), 3, 2);
    ctx.fillStyle = color;
    ctx.font = 'bold 8px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, Math.round(x) + 0.5, Math.round(y - 1));
  }

  drawCritter(c) {
    const ctx = this.ctx;
    const frames = this.critterSprites[c.id];
    const img = frames[Math.floor(this.t * (c.fly ? 8 : 3) + c.hx) % 2];
    const hover = c.fly ? 6 + Math.sin(c.t * 2) * 2 : 0;
    ctx.drawImage(img, Math.round(c.x * T - 4), Math.round(c.y * T - 6 - hover));
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      if (p.kind === 'heart') {
        const x = Math.round(p.x), y = Math.round(p.y);
        ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1);
      } else if (p.kind === 'spark') {
        const s = a > 0.5 ? 1 : 0;
        ctx.fillRect(p.x - s, p.y, 1 + s * 2, 1); ctx.fillRect(p.x, p.y - s, 1, 1 + s * 2);
      } else ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      const k = f.life / 1.2;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const y = f.y - 10 - Math.min(1, k * 3) * 10;
      const img = this.iconImg(f.icon);
      if (img) ctx.drawImage(img, Math.round(f.x - 6), Math.round(y - 6), 12, 12);
      if (f.text) {
        ctx.font = 'bold 7px ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#3d2c2e'; ctx.fillText(f.text, Math.round(f.x + 7), Math.round(y + 1));
        ctx.fillStyle = '#ffffff'; ctx.fillText(f.text, Math.round(f.x + 6), Math.round(y));
      }
    }
    ctx.globalAlpha = 1;
  }

  iconImg(id) {
    this.iconCache = this.iconCache || {};
    if (this.iconCache[id]) return this.iconCache[id];
    if (!this.icons?.[id]) return null;
    const img = new Image();
    img.src = this.icons[id];
    this.iconCache[id] = img;
    return img;
  }

  drawLighting(world, x0, y0, x1, y1) {
    const ctx = this.ctx;
    const d = darkness(world.minute);
    const wet = isWet(world.weather);
    const cloudy = world.weather === 'cloudy';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (d > 0 || wet || cloudy) {
      // Dusk is warm, night is a soft blue.
      const dusk = world.minute > 16 * 60 && world.minute < 20 * 60 ? Math.sin(((world.minute - 16 * 60) / 240) * Math.PI) : 0;
      let r = 255 - d * 175, g = 255 - d * 165 - dusk * 40, b = 255 - d * 95 - dusk * 90;
      if (wet) { r *= 0.86; g *= 0.88; b *= 0.94; }
      if (cloudy) { r *= 0.94; g *= 0.94; b *= 0.96; }
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (d > 0.15) {
      const z = this.z, cx = this.cam.x, cy = this.cam.y;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, (d - 0.15) * 1.6);
      const light = (tx, ty, r, img = this.glow) => {
        if (tx < x0 - 3 || tx > x1 + 3 || ty < y0 - 3 || ty > y1 + 3) return;
        const s = r * T * z;
        ctx.drawImage(img, (tx * T - cx) * z - s, (ty * T - cy) * z - s, s * 2, s * 2);
      };
      for (const [x, y, r] of LIGHT_SPOTS) light(x, y, r);
      if (world.fest?.lit) LANTERNS.forEach(([x, y], i) => { if (world.fest.lit.includes(i)) light(x + 0.5, y - 0.6, 2.2); });
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const o = world.obj[idx(x, y)];
        if (o?.type === 'decor' && DECOR[o.id].light) light(x + 0.5, y - 0.3, 2.4);
      }
      for (const c of world.critters) if (c.id === 'firefly') { ctx.globalAlpha = 0.5 + Math.sin(this.t * 4 + c.hx) * 0.4; light(c.x, c.y - 0.5, 0.7, this.glowBlue); }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawWeather(world) {
    const ctx = this.ctx;
    const wet = world.weather;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W2 = this.cv.width, H2 = this.cv.height;
    const want = wet === 'rain' ? (this.reduced ? 40 : 110) : wet === 'snow' ? (this.reduced ? 30 : 80) : 0;
    while (this.rain.length < want) this.rain.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.6 });
    if (this.rain.length > want) this.rain.length = want;
    if (!want) return;
    const dt = 1 / 60;
    if (wet === 'rain') {
      ctx.strokeStyle = 'rgba(210,230,255,0.55)';
      ctx.lineWidth = Math.max(1, this.dpr);
      ctx.beginPath();
      for (const r of this.rain) {
        r.y += dt * 1.6 * r.s; r.x += dt * 0.12 * r.s;
        if (r.y > 1) { r.y -= 1; r.x = Math.random(); }
        if (r.x > 1) r.x -= 1;
        const x = r.x * W2, y = r.y * H2;
        ctx.moveTo(x, y); ctx.lineTo(x + 3 * this.dpr, y + 12 * this.dpr * r.s);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const r of this.rain) {
        r.y += dt * 0.12 * r.s; r.x += Math.sin(this.t + r.s * 9) * dt * 0.02;
        if (r.y > 1) { r.y -= 1; r.x = Math.random(); }
        const s = Math.max(2, this.z * 0.6 * r.s);
        ctx.fillRect(r.x * W2, r.y * H2, s, s);
      }
    }
  }

  drawOverlays(world) {
    const ctx = this.ctx;
    // Sky lanterns.
    for (const s of this.sky) {
      ctx.fillStyle = '#ffb3c6'; ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 3, 5, 5);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) + 2, 3, 1);
    }
    // A sparkle over villagers you haven't met yet, a speech dot for today's chat.
    for (const id of VILLAGER_IDS) {
      const v = world.vpos[id];
      if (!v || v.hidden) continue;
      const s = world.villagers[id];
      const bob = this.reduced ? 0 : Math.sin(this.t * 3 + v.x) * 1;
      if (!s.met) this.bubble(v.x * T, v.y * T - 25 + bob, '!', '#f77f00');
      else if (!s.talked) this.bubble(v.x * T, v.y * T - 25 + bob, '…', '#6a4c93');
    }
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
