// Pseudo-3D canvas renderer. Reads the world, never changes it.
import { makeCamera, project, ROAD_HALF } from './camera.js';
import { LANE_W, HIT, OBSTACLES, PLAYER } from './config.js';
import { BIOMES, biomeAt, palette } from './biomes.js';
import { bakeDino, bakeSky, bakeFog, bakeSign, spriteJobs } from './sprites.js';
import { hash01 } from './rng.js';

const MAX_PARTICLES = 140;
const FAR = 110; // metres of sprites drawn ahead
const SEG = 3; // metres per road stripe
const TAU = Math.PI * 2;
const DINO_SCALE = 1.18; // drawn a touch bigger than its hitbox, for charm

// Gentle seeded bends: an x offset that grows with distance ahead.
function curveAt(d) {
  return 0.0011 * Math.sin(d / 230) + 0.0007 * Math.sin(d / 97 + 1.3);
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.sprites = {};
    this.jobs = spriteJobs(this.sprites);
    this.totalJobs = this.jobs.length;
    this.dino = null;
    this.dinoKey = '';
    this.quality = 1; // multiplier on devicePixelRatio
    this.time = 0;
    this.skyX = 0;
    this.camX = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = 'rgba(255,255,255,1)';
    this.pal = null;
    this.skyKey = -1;
    this.signs = new Map();
    this.pt = { x: 0, y: 0, s: 0 };
    this.pt2 = { x: 0, y: 0, s: 0 };
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push({ on: false });
    this.tumbles = [];
    for (let i = 0; i < 8; i++) this.tumbles.push({ on: false });
    this.puffs = [];
    for (let i = 0; i < 5; i++) this.puffs.push({ on: false });
    this.nextPuff = 2;
    this.draws = [];
    this.drawCount = 0;
    this.lavvyZ = -9;
    this.lavvyA = 0;
    this.lastHitT = -10;
    this.resize();
  }

  get ready() {
    return this.jobs.length === 0;
  }

  get loadProgress() {
    return 1 - this.jobs.length / this.totalJobs;
  }

  // Bake a few sprites, staying inside the time budget.
  pump(budgetMs = 8) {
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < budgetMs) this.jobs.shift()();
  }

  setDino(dinoId, hatId) {
    const key = `${dinoId}/${hatId}`;
    if (key === this.dinoKey) return;
    this.dinoKey = key;
    this.dino = bakeDino(dinoId, hatId);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.quality;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.cam = makeCamera(w, h);
  }

  // Slide the view sideways (title screen framing), eased.
  setShift(px, dt) {
    this.shift = (this.shift || 0) + (px - (this.shift || 0)) * Math.min(1, dt * 4);
    this.cam.cx = this.w / 2 + this.shift;
  }

  // Step resolution down (or back up) when frames are slow.
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.resize();
  }

  // ---- effects -------------------------------------------------------

  spawn(sprite, x, y, z, o = {}) {
    const p = this.particles.find((q) => !q.on);
    if (!p) return;
    p.on = true;
    p.sprite = sprite;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.grav = o.grav ?? 0;
    p.size = o.size || 0.3;
    p.grow = o.grow || 0;
    p.life = p.max = o.life || 0.6;
    p.rot = o.rot || 0;
    p.vr = o.vr || 0;
    p.alpha = o.alpha ?? 1;
  }

  burst(n, sprite, x, y, z, speed, o = {}) {
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(sprite, x, y, z, { vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s + (o.up || 0), vz: (Math.random() - 0.3) * s, ...o });
    }
  }

  handleEvents(events, world) {
    const d = world.d;
    const px = world.p.x * LANE_W;
    for (const e of events) {
      switch (e.type) {
        case 'coin':
          this.spawn('sparkle', e.lane * LANE_W, e.y + 0.2, e.z, { size: 0.55, life: 0.35, grow: 1.2, vy: 1 });
          break;
        case 'jump':
          this.burst(4, 'dust', px, 0.1, d - 0.3, 1.5, { size: 0.5, life: 0.5, grow: 0.8, alpha: 0.7 });
          break;
        case 'land':
          this.burst(e.glide ? 10 : 5, 'dust', px, 0.1, d, 2.2, { size: 0.55, life: 0.55, grow: 0.8, alpha: 0.75 });
          break;
        case 'slam':
        case 'roll':
          this.burst(3, 'dust', px, 0.1, d, 1.2, { size: 0.45, life: 0.45, grow: 0.6, alpha: 0.6 });
          break;
        case 'hit': {
          const x = e.lane * LANE_W;
          this.lastHitT = this.time;
          if (e.kind === 'geyser') this.burst(12, 'steam', x, 1.2, e.z, 4, { size: 0.8, life: 0.8, grow: 1, alpha: 0.9 });
          else if (e.kind === 'hedge') this.burst(10, 'leafBit', px + (x - px) * 0.5, 1, d, 3, { size: 0.35, life: 0.9, grav: 6, vr: 6 });
          else this.burst(10, e.kind === 'log' ? 'chip' : 'dust', x, 0.6, e.z, 4, { size: 0.35, life: 0.8, grav: 9, vr: 8 });
          if (!e.side) this.tumble(e.kind, x, e.z);
          if (e.shield) {
            this.burst(14, 'sparkle', px, 1, d, 5, { size: 0.5, life: 0.6 });
            this.flash = this.reduced ? 0.12 : 0.3;
            this.flashColor = 'rgba(255,250,230,1)';
          } else {
            this.shake = this.reduced ? 0 : 1;
            this.flash = this.reduced ? 0.1 : 0.22;
            this.flashColor = 'rgba(255,170,90,1)';
          }
          break;
        }
        case 'power':
          this.burst(12, 'sparkle', px, 1.2, d, 4, { size: 0.5, life: 0.6 });
          this.flash = this.reduced ? 0.08 : 0.18;
          this.flashColor = 'rgba(255,255,255,1)';
          break;
        case 'caught':
          this.burst(8, 'heart', px, 1.6, d - 0.5, 2.5, { size: 0.5, life: 1.4, up: 1.5 });
          break;
        case 'milestone':
          this.burst(10, 'sparkle', px, 2, d + 3, 4, { size: 0.5, life: 0.9 });
          break;
        default:
          break;
      }
    }
  }

  // A bumped obstacle tumbles off the path.
  tumble(kind, x, z) {
    const sprite = kind === 'ptero' ? 'ptero0' : kind === 'geyser' ? null : kind;
    if (!sprite || !this.sprites[sprite]) return;
    const t = this.tumbles.find((q) => !q.on) || this.tumbles[0];
    const dir = x >= 0 ? 1 : -1;
    Object.assign(t, { on: true, sprite, x, y: kind === 'ptero' ? 1 : 0, z, vx: dir * (5 + Math.random() * 3), vy: kind === 'ptero' ? 7 : 5, vz: 6, rot: 0, vr: dir * 7, life: 1.2 });
  }

  update(dt, world) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (!world) return;
    const curve = curveAt(world.d);
    this.skyX -= curve * world.speed * dt * 9000;
    const target = world.p.x * LANE_W * 0.45;
    this.camX += (target - this.camX) * Math.min(1, dt * 7);
    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.vr * dt;
      if (p.grav && p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.3;
      }
    }
    for (const t of this.tumbles) {
      if (!t.on) continue;
      t.life -= dt;
      if (t.life <= 0) t.on = false;
      t.vy -= 18 * dt;
      t.x += t.vx * dt;
      t.y = Math.max(0, t.y + t.vy * dt);
      t.z += t.vz * dt;
      t.rot += t.vr * dt;
    }
    // Ambient effects.
    const p = world.p;
    if (world.status === 'running') {
      if (world.power.magnet > 0 && Math.random() < dt * 14) {
        const a = Math.random() * TAU;
        this.spawn('sparkleBlue', p.x * LANE_W + Math.cos(a) * 0.9, p.y + 0.7 + Math.sin(a) * 0.7, world.d, { size: 0.3, life: 0.4, vz: world.speed * 0.9 });
      }
      if (p.gliding > 0 && Math.random() < dt * 8) this.spawn('leafBit', p.x * LANE_W + (Math.random() - 0.5), p.y + 0.5, world.d, { size: 0.25, life: 0.9, vy: -0.5, vr: 4, vz: world.speed * 0.6 });
      if (!p.air && p.rolling <= 0 && Math.random() < dt * (this.reduced ? 3 : 8)) {
        this.spawn('dust', p.x * LANE_W + (Math.random() - 0.5) * 0.4, 0.05, world.d - 0.4, { size: 0.35, life: 0.4, grow: 0.8, alpha: 0.45, vz: -1 });
      }
    }
    // Steam over geysers that are about to blow.
    for (const it of world.track.items) {
      if (it.gone || it.kind !== 'geyser') continue;
      const zr = it.z - world.d;
      if (zr < 0 || zr > 70) continue;
      if (Math.random() < dt * 5) this.spawn('steam', it.lane * LANE_W + (Math.random() - 0.5) * 0.6, 0.3, it.z + 0.7, { size: 0.5, vy: 1.5, grow: 1.5, life: 0.8, alpha: 0.7 });
    }
    // Old Rumbles' smoke drifting overhead from behind.
    this.nextPuff -= dt;
    if (this.nextPuff <= 0) {
      this.nextPuff = 4 + Math.random() * 6;
      const q = this.puffs.find((o) => !o.on);
      if (q) Object.assign(q, { on: true, x: (Math.random() - 0.5) * 1.2, t: 0, s: 0.8 + Math.random() * 0.6 });
    }
    for (const q of this.puffs) {
      if (!q.on) continue;
      q.t += dt / 14;
      if (q.t >= 1) q.on = false;
    }
    // Lavvy follows close after a bump, then falls back.
    let lz = -9;
    if (world.status === 'caught') lz = -0.9;
    else if (world.lavvy > 0) lz = -1.6 - 3.2 * (1 - world.lavvy / HIT.lavvyWindow) ** 2;
    this.lavvyZ += (lz - this.lavvyZ) * Math.min(1, dt * (lz > this.lavvyZ ? 5 : 1.5));
  }

  // ---- drawing -------------------------------------------------------

  palette(world) {
    const b = biomeAt(world ? world.d : 0);
    const p = palette(b.from, b.to, b.t);
    if (p.key !== this.skyKey) {
      this.skyKey = p.key;
      this.sky = bakeSky(p.skyTop, p.skyBottom, p.fog);
      this.fog = bakeFog(p.fogRgb);
    }
    this.pal = p;
    return p;
  }

  draw(world, opts = {}) {
    const g = this.g;
    const { w, h, cam } = this;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 14 * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * 10 * this.shake : 0;
    g.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    g.imageSmoothingEnabled = true;
    const pal = this.palette(world);
    this.drawSky(pal);
    if (!world || !this.ready) {
      g.fillStyle = pal.grassA;
      g.fillRect(-20, cam.horizon, w + 40, h - cam.horizon + 20);
      return;
    }
    this.drawGround(world, pal);
    this.collect(world, opts);
    this.drawSprites(world);
    this.drawLavvy(world);
    // A hug from behind: the dino stays in front of Lavvy.
    if (world.status === 'caught') this.drawPlayer(world);
    this.drawOverlays(world);
  }

  drawSky(pal) {
    const g = this.g;
    const { w, cam } = this;
    const hz = cam.horizon;
    if (this.sky) g.drawImage(this.sky, -20, -20, w + 40, hz + 22);
    const S = this.sprites;
    if (pal.nightness > 0 && S.stars) {
      g.globalAlpha = pal.nightness;
      const tw = 512;
      const off = ((this.skyX * 0.15) % tw + tw) % tw;
      for (let x = -off; x < w; x += tw) g.drawImage(S.stars, x, 0, tw, Math.max(10, hz * 0.9));
      g.globalAlpha = 1;
    }
    const sun = S[`sun${pal.u < 0.5 ? pal.from : pal.to}`];
    if (sun) {
      const r = Math.min(w, this.h) * 0.2;
      const x = w * 0.72 + ((this.skyX * 0.05) % (w * 0.3));
      g.drawImage(sun, x - r, hz * 0.32 - r, r * 2, r * 2);
    }
    // Smoke puffs from the volcano behind us, drifting off to the horizon.
    if (S.smoke) {
      for (const q of this.puffs) {
        if (!q.on) continue;
        const k = 1 - q.t;
        const pw = w * 0.5 * q.s * (0.25 + 0.75 * k * k);
        const x = w / 2 + q.x * w * k + (this.skyX * 0.2) % 50;
        const y = hz - hz * 0.25 - (hz * 0.9 + pw) * k * k;
        g.globalAlpha = Math.min(1, q.t * 6) * (0.9 - 0.5 * q.t);
        g.drawImage(S.smoke.img, x - pw / 2, y - pw * 0.33, pw, pw * 0.66);
      }
      g.globalAlpha = 1;
    }
    // Hills: far and near, blended between biomes.
    const from = pal.from;
    const to = pal.to;
    for (const [layer, depth, height] of [['far', 0.25, 0.34], ['near', 0.55, 0.2]]) {
      const hh = Math.max(30, Math.min(hz * height * 1.4, this.h * height));
      const tw = Math.max(w, 900) * (layer === 'far' ? 1.3 : 1);
      const off = (((this.skyX * depth) % tw) + tw) % tw;
      for (const [i, a] of [[from, 1 - pal.u], [to, pal.u]]) {
        if (a <= 0.01) continue;
        const img = S[`${layer}${i}`];
        if (!img) continue;
        g.globalAlpha = a;
        for (let x = -off; x < w; x += tw) g.drawImage(img, x, hz - hh + 1, tw + 1, hh);
      }
      g.globalAlpha = 1;
    }
  }

  drawGround(world, pal) {
    const g = this.g;
    const { w, h, cam } = this;
    const d = world.d;
    this.lastD = d;
    const curve = curveAt(d);
    const pt = this.pt;
    const pt2 = this.pt2;
    const camX = this.camX;
    g.fillStyle = pal.grassA;
    g.fillRect(-20, cam.horizon, w + 40, h - cam.horizon + 20);

    const zClip = (cam.near + 0.05 - cam.H * cam.sin) / cam.cos - cam.D;
    const bend = (z) => curve * z * z - camX;
    // Far section, under the fog: one quad out to 260 m.
    const farZ = 100;
    project(cam, bend(farZ) - ROAD_HALF, 0, farZ, pt);
    project(cam, bend(farZ) + ROAD_HALF, 0, farZ, pt2);
    const fx0 = pt.x;
    const fx1 = pt2.x;
    const fy = pt.y;
    project(cam, bend(260) - ROAD_HALF, 0, 260, pt);
    project(cam, bend(260) + ROAD_HALF, 0, 260, pt2);
    g.fillStyle = pal.roadA;
    quad(g, fx0, fx1, fy, pt.x, pt2.x, pt.y);

    // Striped strips, far to near, aligned to world distance so the
    // stripes stream past.
    const k0 = Math.floor((d + zClip) / SEG);
    const k1 = Math.ceil((d + farZ) / SEG);
    const lane = LANE_W / 2;
    for (let k = k1; k >= k0; k--) {
      let za = k * SEG - d;
      const zb = (k + 1) * SEG - d;
      if (zb <= zClip) continue;
      if (za < zClip) za = zClip;
      if (za > farZ) continue;
      const odd = k & 1;
      const ba = bend(za);
      const bb = bend(Math.min(zb, farZ));
      const zbb = Math.min(zb, farZ);
      // Grass band (whole width).
      project(cam, 0, 0, za, pt);
      project(cam, 0, 0, zbb, pt2);
      const ya = pt.y;
      const yb = pt2.y;
      const sa = pt.s;
      const sb = pt2.s;
      const xa = cam.cx + ba * sa;
      const xb = cam.cx + bb * sb;
      if (odd) {
        g.fillStyle = pal.grassB;
        g.fillRect(-20, yb - 0.5, w + 40, ya - yb + 1);
      }
      // Edge stones.
      const e = ROAD_HALF + 0.45;
      g.fillStyle = odd ? pal.edge : pal.line;
      quad(g, xa - e * sa, xa + e * sa, ya, xb - e * sb, xb + e * sb, yb);
      // Road.
      g.fillStyle = odd ? pal.roadB : pal.roadA;
      quad(g, xa - ROAD_HALF * sa, xa + ROAD_HALF * sa, ya, xb - ROAD_HALF * sb, xb + ROAD_HALF * sb, yb);
      // Lane dashes.
      if (odd) {
        const lw = 0.09;
        g.fillStyle = pal.line;
        quad(g, xa - (lane + lw) * sa, xa - (lane - lw) * sa, ya, xb - (lane + lw) * sb, xb - (lane - lw) * sb, yb);
        quad(g, xa + (lane - lw) * sa, xa + (lane + lw) * sa, ya, xb + (lane - lw) * sb, xb + (lane + lw) * sb, yb);
      }
    }
    // Fog over the far end.
    if (this.fog) {
      const fh = (cam.feetY - cam.horizon) * 0.5;
      g.drawImage(this.fog, -20, cam.horizon - fh * 0.3, w + 40, fh);
    }
  }

  // Gather everything to draw this frame into a reusable list.
  push(z, type, a, b, c, e) {
    let r = this.draws[this.drawCount];
    if (!r) {
      r = { z: 0, type: 0, a: null, b: 0, c: 0, e: 0 };
      this.draws.push(r);
    }
    r.z = z;
    r.type = type;
    r.a = a;
    r.b = b;
    r.c = c;
    r.e = e;
    this.drawCount++;
  }

  collect(world, opts) {
    this.drawCount = 0;
    const d = world.d;
    // Roadside props from a stateless hash of the spot.
    const slot = 6.5;
    for (let k = Math.floor((d - 4) / slot); k <= Math.floor((d + FAR) / slot); k++) {
      for (const side of [-1, 1]) {
        const r = hash01(k, side + 3);
        if (r < 0.22) continue;
        const z = k * slot + hash01(k, side + 7) * 3;
        const bi = biomeAt(z);
        const biome = BIOMES[bi.t > hash01(k, side + 11) ? bi.to : bi.from];
        const name = biome.props[Math.floor(hash01(k, side + 13) * biome.props.length)];
        const big = name === 'tree' || name === 'mesa' || name === 'cycad';
        const x = side * (ROAD_HALF + 1.4 + (big ? 2.5 : 0) + hash01(k, side + 17) * 4.5);
        this.push(z - d, 1, `prop_${name}`, x, 0, hash01(k, side + 19) < 0.5 ? -1 : 1);
      }
    }
    // Milestone signs and your best.
    const m0 = Math.ceil((d - 4) / 500) * 500;
    for (let m = m0; m < d + FAR; m += 500) if (m > 0) this.push(m - d, 2, m, ROAD_HALF + 1.3, 0, 0);
    if (opts.bestAt > 0) {
      const z = opts.bestAt - d;
      if (z > -4 && z < FAR) this.push(z, 3, null, -(ROAD_HALF + 1.0), 0, 0);
    }
    for (const it of world.track.items) {
      if (it.gone) continue;
      const z0 = it.z - d;
      if (z0 > FAR || z0 + it.len < -6) continue;
      if (it.kind === 'hedge') {
        for (let z = it.z + 0.8; z < it.z + it.len; z += 1.5) {
          const zr = z - d;
          if (zr > -6 && zr < FAR) this.push(zr, 4, 'hedge', it.lane * LANE_W, 0, 0);
        }
      } else this.push(z0 + it.len / 2, 5, it, 0, 0, 0);
    }
    for (const c of world.track.coins) {
      if (c.taken) continue;
      const z = c.z - d;
      if (z < -3) continue;
      if (z > FAR - 20) break;
      this.push(z, 6, c, 0, 0, 0);
    }
    for (const p of world.track.powers) {
      if (p.taken) continue;
      const z = p.z - d;
      if (z < -3 || z > FAR - 10) continue;
      this.push(z, 7, p, 0, 0, 0);
    }
    for (const p of this.particles) if (p.on) this.push(p.z - d, 8, p, 0, 0, 0);
    for (const t of this.tumbles) if (t.on) this.push(t.z - d, 9, t, 0, 0, 0);
    this.push(-0.01, 10, null, 0, 0, 0); // the player
    const list = this.draws;
    const n = this.drawCount;
    // Insertion sort, far to near: the list is nearly sorted frame to frame.
    for (let i = 1; i < n; i++) {
      const r = list[i];
      let j = i - 1;
      while (j >= 0 && list[j].z < r.z) {
        list[j + 1] = list[j];
        j--;
      }
      list[j + 1] = r;
    }
  }

  // Draw a sprite standing at track point (x, y, z), `size` scales it.
  sprite(name, x, y, z, size = 1, flip = 1, alpha = 1, rot = 0) {
    const sp = typeof name === 'string' ? this.sprites[name] : name;
    if (!sp) return;
    const pt = this.pt;
    const bendX = curveAt(this.lastD) * z * z - this.camX;
    if (!project(this.cam, x + bendX, y, z, pt)) return;
    const wpx = sp.w * pt.s * size;
    const hpx = sp.h * pt.s * size;
    if (wpx < 0.6 || pt.y - hpx > this.h + 50) return;
    const fade = z > FAR - 25 ? Math.max(0, (FAR - z) / 25) : 1;
    const a = alpha * fade;
    if (a <= 0.01) return;
    const g = this.g;
    g.globalAlpha = a;
    if (flip === 1 && rot === 0) {
      g.drawImage(sp.img, pt.x - wpx / 2, pt.y - hpx * sp.ay, wpx, hpx);
    } else {
      g.save();
      g.translate(pt.x, pt.y - hpx * (sp.ay - 0.5));
      if (rot) g.rotate(rot);
      g.scale(flip, 1);
      g.drawImage(sp.img, -wpx / 2, -hpx / 2, wpx, hpx);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  drawSprites(world) {
    const list = this.draws;
    const t = this.time;
    for (let i = 0; i < this.drawCount; i++) {
      const r = list[i];
      const z = r.z;
      switch (r.type) {
        case 1:
          this.sprite(r.a, r.b, 0, z, 1, r.e);
          break;
        case 2: {
          let sign = this.signs.get(r.a);
          if (!sign) {
            sign = bakeSign(`${r.a} m`);
            this.signs.set(r.a, sign);
          }
          this.sprite(sign, r.b, 0, z);
          break;
        }
        case 3:
          this.sprite('flag', r.b, 0, z);
          break;
        case 4:
          this.sprite('shadow', r.b, 0.01, z, 2.0);
          this.sprite('hedge', r.b, 0, z);
          break;
        case 5:
          this.drawObstacle(r.a, z, t);
          break;
        case 6: {
          const c = r.a;
          const f = Math.floor(t * 12 + c.id * 0.7) % 8;
          this.sprite(`amber${f}`, c.lane * LANE_W, c.y - 0.3 + Math.sin(t * 4 + c.id) * 0.05, z);
          break;
        }
        case 7: {
          const p = r.a;
          const bob = Math.sin(t * 3 + p.id) * 0.12;
          this.sprite('shadow', p.lane * LANE_W, 0.01, z, 1.1, 1, 0.6);
          this.sprite(`power_${p.kind}`, p.lane * LANE_W, p.y - 0.5 + bob, z, 1 + Math.sin(t * 6) * 0.04);
          break;
        }
        case 8: {
          const p = r.a;
          const k = p.life / p.max;
          const size = p.size * (1 + p.grow * (1 - k));
          this.sprite(p.sprite, p.x, p.y - size / 2, z, size, 1, p.alpha * Math.min(1, k * 2), p.rot);
          break;
        }
        case 9: {
          const tb = r.a;
          this.sprite(tb.sprite, tb.x, tb.y, z, 1, 1, Math.min(1, tb.life * 2), tb.rot);
          break;
        }
        case 10:
          this.drawPlayer(world);
          break;
        default:
          break;
      }
    }
  }

  drawObstacle(it, z, t) {
    const x = it.lane * LANE_W;
    switch (it.kind) {
      case 'log':
        this.sprite('shadow', x, 0.01, z, 2.2, 1, 0.8);
        this.sprite('log', x, 0, z);
        break;
      case 'boulder':
        this.sprite('shadow', x, 0.01, z, 2.4);
        this.sprite('boulder', x, 0, z);
        break;
      case 'ptero': {
        const f = Math.floor(t * 6 + it.id) % 2;
        const bob = Math.sin(t * 5 + it.id) * 0.06;
        this.sprite('shadow', x, 0.01, z, 1.8, 1, 0.7);
        this.sprite(`ptero${f}`, x, OBSTACLES.ptero.bottom - 0.18 + bob, z);
        break;
      }
      case 'geyser': {
        // Bubbles at a distance, then erupts as you get close.
        const erupt = Math.max(0, Math.min(1, (46 - z) / 14));
        this.sprite('vent', x, 0, z);
        if (erupt > 0) {
          const f = Math.floor(t * 10 + it.id) % 3;
          const sp = this.sprites[`column${f}`];
          if (sp) this.columnSprite(sp, x, z, erupt);
        }
        break;
      }
      default:
        break;
    }
  }

  // Water column scaled to the eruption height.
  columnSprite(sp, x, z, erupt) {
    const pt = this.pt;
    const bendX = curveAt(this.lastD) * z * z - this.camX;
    if (!project(this.cam, x + bendX, 0.05, z, pt)) return;
    const wpx = sp.w * pt.s * (0.5 + 0.35 * erupt);
    const hpx = sp.h * pt.s * erupt * 0.66;
    const fade = z > FAR - 25 ? Math.max(0, (FAR - z) / 25) : 1;
    this.g.globalAlpha = 0.85 * fade;
    this.g.drawImage(sp.img, pt.x - wpx / 2, pt.y - hpx, wpx, hpx);
    this.g.globalAlpha = 1;
  }

  drawPlayer(world) {
    const D = this.dino;
    if (!D) return;
    const p = world.p;
    const x = p.x * LANE_W;
    const t = this.time;
    const shadowA = Math.max(0.25, 1 - p.y / 5);
    this.sprite('shadow', x, 0.01, 0, 1.3 * (1 - Math.min(0.5, p.y / 8)), 1, shadowA);
    let alpha = 1;
    if (world.immune > 0 && world.status === 'running' && t - this.lastHitT < 1.2) {
      alpha = this.reduced ? 0.6 : Math.floor(t * 16) % 2 ? 0.35 : 1;
    }
    const tilt = (p.laneT < 1 ? (p.lane - p.from) * 0.12 * Math.sin(p.laneT * Math.PI) : 0) + (world.slow > 0 ? Math.sin(t * 30) * 0.08 * (world.slow / HIT.slowTime) : 0);
    if (p.rolling > 0 && !p.air) {
      this.sprite(D.ball, x, 0, 0, DINO_SCALE, 1, alpha, p.run / 0.42);
    } else if (p.gliding > 0 || p.landing) {
      const sway = Math.sin(t * 2.4) * 0.08;
      this.sprite(D.glide, x, p.y, 0, DINO_SCALE, 1, alpha, sway + tilt);
      this.sprite('parasol', x, p.y + D.height * 0.78 * DINO_SCALE, 0.02, DINO_SCALE, 1, 1, sway * 0.6);
    } else if (p.air) {
      this.sprite(p.rolling > 0 ? D.ball : D.jump, x, p.y, 0, DINO_SCALE, 1, alpha, p.rolling > 0 ? p.run / 0.42 : tilt);
    } else {
      const cycle = 2.4 + world.speed * 0.1;
      const f = world.status === 'caught' ? 0 : Math.floor(((p.run / cycle) % 1) * 6);
      this.sprite(D.run[f], x, 0, 0, DINO_SCALE, 1, alpha, tilt);
    }
    if (world.power.shield > 0) {
      const wob = 1 + Math.sin(t * 5) * 0.03;
      const blink = world.power.shield < 3 && Math.floor(t * 6) % 2 ? 0.35 : 0.85;
      this.sprite('eggShield', x, p.rolling > 0 && !p.air ? -0.2 : p.y - 0.1, -0.05, wob * DINO_SCALE, 1, blink);
    }
  }

  // Lavvy runs just behind and beside the dino, so the dino stays in view.
  drawLavvy(world) {
    if (this.lavvyZ < -6.5) return;
    const S = this.sprites;
    const f = Math.floor(this.time * 4) % 2;
    const px = world.p.x * LANE_W;
    const caught = world.status === 'caught';
    const side = world.p.x > 0.3 ? -1 : 1;
    this.lavvySide = this.lavvySide ?? side;
    this.lavvySide += (side - this.lavvySide) * 0.05;
    const x = caught ? px : px + this.lavvySide * 1.7;
    const bob = Math.abs(Math.sin(this.time * 6)) * 0.12;
    this.sprite(S[`lavvy${f}`], x, bob - (caught ? 0 : 0.35), this.lavvyZ, caught ? 0.8 : 0.62, this.lavvySide < 0 ? -1 : 1, 1);
  }

  drawOverlays(world) {
    const g = this.g;
    const { w, h } = this;
    // Speed lines once you're really moving.
    if (!this.reduced && world.status === 'running' && world.speed > 15) {
      const k = Math.min(1, (world.speed - 15) / 8);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < 12; i++) {
        const seed = Math.floor(this.time * 9) * 13 + i;
        const a = hash01(seed, 1) * TAU;
        const r0 = Math.max(w, h) * (0.42 + hash01(seed, 2) * 0.12);
        const len = 40 + 80 * k;
        const cx = w / 2;
        const cy = this.cam.horizon + (this.cam.feetY - this.cam.horizon) * 0.3;
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7);
        g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.7);
      }
      g.globalAlpha = k;
      g.stroke();
      g.globalAlpha = 1;
    }
    if (this.flash > 0) {
      g.globalAlpha = Math.min(0.6, this.flash);
      g.fillStyle = this.flashColor;
      g.fillRect(-20, -20, w + 40, h + 40);
      g.globalAlpha = 1;
    }
    void PLAYER;
  }
}

// A trapezoid between two depths; a hair of overlap hides seams.
function quad(g, ax0, ax1, ay, bx0, bx1, by) {
  g.beginPath();
  g.moveTo(ax0, ay + 0.6);
  g.lineTo(ax1, ay + 0.6);
  g.lineTo(bx1, by - 0.6);
  g.lineTo(bx0, by - 0.6);
  g.closePath();
  g.fill();
}
