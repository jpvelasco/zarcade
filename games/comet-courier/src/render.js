// Canvas renderer for the cosmic post office. Reads the sim state (shot,
// level, aim) and draws it; it never mutates the simulation.
// The fixed FIELD is scaled to fit the window (DPR aware) and centred over
// a full-screen starfield.
import { FIELD, COMET, STAR, PREVIEW, LETTER } from './config.js';
import { previewPath } from './sim.js';
import { SKINS } from './progress.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ colour utils

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.arcTo(x + w, y + h, x + w, y + h, r);
  g.arcTo(x, y + h, x, y + h, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function starPath(g, x, y, R, r, rot = -Math.PI / 2, points = 5) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const rad = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
}

// Seeded pseudo-random for stable decorations (craters, panel seams).
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function popcount(n) {
  let c = 0;
  for (let m = n; m; m >>= 1) c += m & 1;
  return c;
}

const WORLD_PALETTES = [
  { panel: '#131b3d', seam: '#22305f', wall: '#31437d' },
  { panel: '#1a1440', seam: '#33266b', wall: '#4a3a86' },
  { panel: '#0e2438', seam: '#1c4a66', wall: '#2f6b93' },
  { panel: '#13342a', seam: '#1f5c44', wall: '#358a63' },
  { panel: '#2c1233', seam: '#52215e', wall: '#7c3f96' },
];

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reducedMotion;
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#fff7d6';
    this.particles = [];
    this.trail = [];
    this.level = null;
    this.skin = SKINS[0];
    this.levelStamp = 0;
    this.previewKey = null;
    this.preview = { pts: [], end: 'cut', len: 0 };
    this.stars = Array.from({ length: 130 }, (_, i) => ({
      x: hash(i), y: hash(i + 500), z: 0.25 + hash(i + 900) * 0.75, tw: hash(i + 1300) * TAU,
    }));
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr;
    this.cw = w;
    this.ch = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const scale = Math.min(w / FIELD.w, h / FIELD.h);
    this.scale = scale;
    this.ox = (w - FIELD.w * scale) / 2;
    this.oy = (h - FIELD.h * scale) / 2;
  }

  toField(cx, cy) {
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }

  // The chosen comet skin, which can change from the gallery or from another tab.
  setSkin(save = {}) {
    this.skin = SKINS[Math.min(save.skin || 0, SKINS.length - 1)] || SKINS[0];
  }

  reset(level, save = {}) {
    this.level = level;
    this.setSkin(save);
    this.particles = [];
    this.trail = [];
    this.shake = 0;
    this.flash = 0;
    // The aim projection is cached against the aim and this stamp, so a new
    // panel never shows the previous one's path.
    this.levelStamp = (this.levelStamp || 0) + 1;
    this.previewKey = null;
    this.preview = { pts: [], end: 'cut', len: 0 };
  }

  // A well's glow and rim, baked once per radius: the per-frame draw is then a
  // single drawImage plus the live spiral arms, with no gradients in the loop.
  wellSprite(r) {
    this.wellSprites = this.wellSprites || new Map();
    const key = Math.round(r);
    const cached = this.wellSprites.get(key);
    if (cached) return cached;
    const size = Math.max(8, Math.round(r * 2));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    const c = size / 2;
    const grad = g.createRadialGradient(c, c, 1, c, c, c);
    grad.addColorStop(0, 'rgba(199,155,255,0.62)');
    grad.addColorStop(0.45, 'rgba(140,90,210,0.24)');
    grad.addColorStop(1, 'rgba(120,70,190,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, c, 0, TAU);
    g.fill();
    // Rim: where the pull stops.
    g.strokeStyle = 'rgba(199,155,255,0.45)';
    g.lineWidth = 2;
    g.setLineDash([6, 7]);
    g.beginPath();
    g.arc(c, c, c - 1.5, 0, TAU);
    g.stroke();
    const sprite = { canvas };
    this.wellSprites.set(key, sprite);
    return sprite;
  }

  // ------------------------------------------------------------ fx

  // A small spray of sparks away from a surface, so an impact reads even when
  // the comet is moving fast.
  spark(x, y, nx, ny, strength = 1) {
    if (this.reduced) return;
    const base = Math.atan2(ny, nx);
    const n = 3 + Math.round(strength * 5);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 1.8;
      const s = (60 + Math.random() * 160) * (0.4 + strength);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.18 + Math.random() * 0.22, life: 0.4, color: '#cfe0ff', r: 1 + Math.random() * 1.6 });
    }
    this.shake = Math.min(0.5, this.shake + strength * 0.22);
  }

  burst(x, y, color, n = 22, speed = 220) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.5 + Math.random() * 0.5, life: 0.9, color, r: 1.5 + Math.random() * 2.5 });
    }
  }

  update(dt, view) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    // Comet trail while flying.
    const shot = view?.shot;
    if (shot && shot.result === 'flying' && this.level) {
      const lastP = this.trail[this.trail.length - 1];
      if (!lastP || Math.hypot(shot.x - lastP.x, shot.y - lastP.y) > 3) {
        this.trail.push({ x: shot.x, y: shot.y, t: 0.35 });
        if (this.trail.length > 40) this.trail.shift();
      }
    }
    for (const p of this.trail) p.t -= dt;
    this.trail = this.trail.filter((p) => p.t > 0);
    for (const p of this.particles) {
      p.t -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.t > 0);
  }

  // ------------------------------------------------------------ drawing

  draw(view) {
    const { ctx, dpr } = this;
    const t = view.time;
    ctx.save();
    ctx.scale(dpr, dpr);
    this.drawSky();
    // Panel, shaken by impacts.
    const sx = this.shake > 0 ? Math.sin(t * 60) * this.shake * 3 : 0;
    const sy = this.shake > 0 ? Math.cos(t * 53) * this.shake * 3 : 0;
    ctx.save();
    ctx.translate(this.ox + sx, this.oy + sy);
    ctx.scale(this.scale, this.scale);
    if (this.level) this.drawLevel(view);
    if (view.shot) this.drawComet(view);
    this.drawParticles();
    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = rgba(this.flashColor, this.flash * 0.5);
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    // Inside the dpr transform: drawn outside it, the hint lands a third of the
    // way up the panel on a 3x phone instead of along the bottom.
    if (view.touch && view.mode === 'play') this.drawTouchHint();
    ctx.restore();
  }

  // Reduced motion keeps the celebration but takes the glare out of it.
  setFlash(color = '#fff7d6', amount = 1) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount * (this.reduced ? 0.25 : 0.72));
  }

  drawSky() {
    const { ctx, cw, ch } = this;
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#070313');
    g.addColorStop(0.6, '#0b0620');
    g.addColorStop(1, '#150b33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    for (const s of this.stars) {
      const a = 0.25 + 0.55 * s.z * (0.7 + 0.3 * Math.sin(this.time * 1.6 + s.tw));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x * cw, s.y * ch, s.z > 0.75 ? 2 : 1, s.z > 0.75 ? 2 : 1);
    }
  }

  drawLevel(view) {
    const { ctx } = this;
    const pal = WORLD_PALETTES[this.level.world % WORLD_PALETTES.length];
    // Panel.
    roundRect(ctx, 0, 0, FIELD.w, FIELD.h, 24);
    ctx.fillStyle = pal.panel;
    ctx.fill();
    // Seams.
    ctx.strokeStyle = pal.seam;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let x = 90; x < FIELD.w; x += 90) {
      ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, FIELD.h - 8); ctx.stroke();
    }
    for (let y = 90; y < FIELD.h; y += 90) {
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(FIELD.w - 8, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Walls.
    roundRect(ctx, 4, 4, FIELD.w - 8, FIELD.h - 8, 20);
    ctx.strokeStyle = pal.wall;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = rgba('#9db4ff', 0.35);
    ctx.lineWidth = 2;
    roundRect(ctx, 8, 8, FIELD.w - 16, FIELD.h - 16, 16);
    ctx.stroke();

    // Wind zones: drifting chevrons show the push direction.
    for (const w of this.level.winds) {
      const ang = Math.atan2(w.vy, w.vx);
      ctx.save();
      ctx.translate(w.x + w.w / 2, w.y + w.h / 2);
      ctx.rotate(ang);
      ctx.fillStyle = rgba('#7ad1ff', 0.1);
      ctx.fillRect(-w.w / 2, -w.h / 2, w.w, w.h);
      const drift = this.reduced ? 0 : (this.time * 60) % 40;
      ctx.strokeStyle = rgba('#9fe0ff', 0.55);
      ctx.lineWidth = 3;
      for (let row = -1; row <= 1; row++) {
        for (let i = -2; i <= 2; i++) {
          const x = i * 40 + drift;
          const y = row * 56;
          if (Math.abs(x) > w.w / 2 - 12 || Math.abs(y) > w.h / 2 - 12) continue;
          ctx.beginPath();
          ctx.moveTo(x - 10, y - 9);
          ctx.lineTo(x, y);
          ctx.lineTo(x - 10, y + 9);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Spring pads: a pad with a big arrow.
    for (const s of this.level.springs) {
      const ang = Math.atan2(s.ny, s.nx);
      ctx.save();
      ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
      ctx.rotate(ang);
      roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, 10);
      ctx.fillStyle = rgba('#8affc1', 0.16);
      ctx.fill();
      ctx.strokeStyle = rgba('#8affc1', 0.7);
      ctx.lineWidth = 3;
      ctx.stroke();
      const pulse = this.reduced ? 0 : 3 * Math.sin(this.time * 6);
      ctx.beginPath();
      ctx.moveTo(-14 + pulse, -12);
      ctx.lineTo(6 + pulse, -12);
      ctx.lineTo(6 + pulse, -20);
      ctx.lineTo(22 + pulse, 0);
      ctx.lineTo(6 + pulse, 20);
      ctx.lineTo(6 + pulse, 12);
      ctx.lineTo(-14 + pulse, 12);
      ctx.closePath();
      ctx.fillStyle = '#8affc1';
      ctx.fill();
      ctx.restore();
    }

    // Portals: two glowing rings.
    for (const p of this.level.portals) {
      for (const [mx, my] of [[p.ax, p.ay], [p.bx, p.by]]) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(this.reduced ? 0 : this.time * 2);
        ctx.strokeStyle = '#c79bff';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = rgba('#c79bff', 0.25);
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // Blocks (crystal mail-rock).
    for (const b of this.level.blocks) {
      roundRect(ctx, b.x, b.y, b.w, b.h, 8);
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, pal.wall);
      g.addColorStop(1, pal.panel);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgba('#cfe0ff', 0.5);
      ctx.lineWidth = 2;
      roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 6);
      ctx.stroke();
    }

    // Asteroids.
    for (const a of this.level.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.beginPath();
      ctx.arc(0, 0, a.r, 0, TAU);
      const g = ctx.createRadialGradient(-a.r * 0.4, -a.r * 0.4, a.r * 0.2, 0, 0, a.r);
      g.addColorStop(0, '#5d5470');
      g.addColorStop(1, '#2c2740');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgba('#8d81a8', 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
      // Craters, stable per asteroid.
      const n = Math.floor(a.r / 7);
      for (let i = 0; i < n; i++) {
        const cr = 2 + hash(a.x + i * 31) * (a.r * 0.25);
        const ca = hash(a.y + i * 57) * TAU;
        const cd = hash(i * 91 + a.x) * (a.r - cr - 2);
        ctx.beginPath();
        ctx.arc(Math.cos(ca) * cd, Math.sin(ca) * cd, cr, 0, TAU);
        ctx.fillStyle = rgba('#000000', 0.25);
        ctx.fill();
      }
      ctx.restore();
    }

    // Gravity wells: a baked glow plus live spiral arms winding inward, so the
    // pull reads as a pull and the rim shows exactly where it starts.
    for (const w of this.level.wells) {
      ctx.save();
      ctx.translate(w.x, w.y);
      const sprite = this.wellSprite(w.r);
      ctx.drawImage(sprite.canvas, -w.r, -w.r, w.r * 2, w.r * 2);
      const spin = this.reduced ? 0 : this.time * 1.1;
      ctx.strokeStyle = rgba('#c79bff', 0.75);
      ctx.lineWidth = 2.5;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let k = 0; k <= 22; k++) {
          const f = k / 22;
          const rad = w.r * (1 - f * 0.88);
          const a = spin + (arm / 3) * TAU + f * 2.4;
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#efe2ff';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Mail letters still on the panel. Collected ones leave a faint postmark so
    // the player can see the route they have already flown.
    const got = view.shot?.letters ?? 0;
    this.level.letters.forEach((l, i) => {
      const held = (got & (1 << i)) !== 0;
      const bob = this.reduced ? 0 : Math.sin(this.time * 2.2 + i * 1.7) * 2.2;
      ctx.save();
      ctx.translate(l.x, l.y + bob);
      if (held) {
        ctx.strokeStyle = rgba('#ffffff', 0.16);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, LETTER.r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }
      // Catch halo: how close you have to fly.
      ctx.strokeStyle = rgba('#8affc1', 0.22);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, LETTER.pick - 3, 0, TAU);
      ctx.stroke();
      // Envelope.
      const w = LETTER.r * 1.8;
      const h = LETTER.r * 1.25;
      ctx.rotate(this.reduced ? 0 : Math.sin(this.time * 1.4 + i) * 0.08);
      roundRect(ctx, -w / 2, -h / 2, w, h, 2.5);
      ctx.fillStyle = '#fff6e2';
      ctx.fill();
      ctx.strokeStyle = rgba('#8a7fb0', 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(0, 1.5);
      ctx.lineTo(w / 2, -h / 2);
      ctx.strokeStyle = rgba('#c2543f', 0.85);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    });

    // Mailbox star. It only counts as a delivery once, so while letters are
    // still loose it is drawn waiting — dim, with the count still to collect —
    // and it brightens the moment the satchel is full.
    const s = this.level.star;
    const left = this.level.letters.length - popcount(got);
    const ready = left === 0;
    const pulse = this.reduced ? 0 : Math.sin(this.time * (ready ? 2.4 : 1.2)) * 2;
    ctx.save();
    ctx.translate(s.x, s.y);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, STAR.r + 26 + pulse);
    glow.addColorStop(0, ready ? 'rgba(255,224,138,0.55)' : 'rgba(255,224,138,0.16)');
    glow.addColorStop(1, 'rgba(255,224,138,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, STAR.r + 26 + pulse, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = ready ? '#ffd98a' : rgba('#ffd98a', 0.4);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, STAR.r - 2, 0, TAU);
    ctx.stroke();
    ctx.rotate(this.reduced ? 0 : this.time * 0.8);
    starPath(ctx, 0, 0, STAR.r - 5, (STAR.r - 5) * 0.45, -Math.PI / 2);
    ctx.fillStyle = ready ? '#fff3c4' : rgba('#fff3c4', 0.35);
    ctx.fill();
    ctx.restore();
    if (!ready) {
      // On a dark pill, so the reminder stays readable over a pocket wall.
      const label = `${left} letter${left === 1 ? '' : 's'} to collect`;
      ctx.font = '700 11px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width;
      const ly = s.y + STAR.r + 15;
      roundRect(ctx, s.x - tw / 2 - 7, ly - 9, tw + 14, 18, 9);
      ctx.fillStyle = 'rgba(8,4,24,0.72)';
      ctx.fill();
      ctx.fillStyle = rgba('#ffd98a', 0.9);
      ctx.fillText(label, s.x, ly + 4);
    }

    // Spawn marker: a small postmark circle.
    ctx.strokeStyle = rgba('#ffffff', 0.22);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(this.level.spawn.x, this.level.spawn.y, COMET.r + 8, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Aim: the projected flight path plus the slingshot pull band.
    if (view.aim && view.shot?.result === 'settled' && (view.mode === 'play' || view.mode === 'paused')) {
      this.drawAim(view);
    }
  }

  // The projected path, recomputed only when the aim (or the comet's resting
  // spot) changes, since it runs the real simulation forward.
  aimPreview(view) {
    const a = view.aim;
    const p = view.shot;
    const world = this.level.world || 0;
    const key = `${p.x.toFixed(1)}:${p.y.toFixed(1)}:${a.angle.toFixed(4)}:${a.power.toFixed(4)}:${p.letters}:${this.levelStamp}`;
    if (this.previewKey !== key) {
      this.previewKey = key;
      this.preview = previewPath(this.level, p.x, p.y, a.angle, a.power, {
        bounces: PREVIEW.bounces[Math.min(world, PREVIEW.bounces.length - 1)],
        maxLen: PREVIEW.len[Math.min(world, PREVIEW.len.length - 1)],
        sample: PREVIEW.sample,
        letters: p.letters,
      });
    }
    return this.preview;
  }

  drawAim(view) {
    const { ctx } = this;
    const a = view.aim;
    const p = view.shot;
    const { pts, end, letters, complete } = this.aimPreview(view);
    // Hot colour at full power, calm at a tap: the dots double as a power gauge.
    const col = a.power > 0.82 ? '#ff9b6b' : a.power > 0.5 ? '#ffd98a' : '#8affc1';
    const strong = a.charging || a.dragging;

    // Pull band: the slingshot rubber, drawn opposite the launch.
    if (strong) {
      ctx.strokeStyle = rgba('#ffffff', 0.3);
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(a.angle) * (18 + a.power * 70), p.y - Math.sin(a.angle) * (18 + a.power * 70));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Dotted projection: the dots shrink and fade along the path, so it reads
    // as a fading guess rather than a guaranteed line.
    const total = Math.max(1, pts.length - 1);
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      const f = i / total;
      const fade = (strong ? 0.95 : 0.55) * (1 - f * 0.65);
      if (q.warp) {
        // Came out of a portal: a ring at the exit, and no dots in between.
        ctx.strokeStyle = rgba('#c79bff', fade);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 8, 0, TAU);
        ctx.stroke();
        continue;
      }
      if (q.bounce) {
        ctx.strokeStyle = rgba('#ffffff', fade * 0.9);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 6, 0, TAU);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = rgba(col, fade);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 3.1 - f * 1.3, 0, TAU);
      ctx.fill();
    }

    // Letters this aim would sweep up: ring them, so a side trip can be planned
    // rather than stumbled into.
    const fresh = letters & ~(p.letters || 0);
    if (fresh) {
      this.level.letters.forEach((l, i) => {
        if (!(fresh & (1 << i))) return;
        ctx.strokeStyle = rgba('#8affc1', strong ? 0.95 : 0.6);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(l.x, l.y, LETTER.pick - 1, 0, TAU);
        ctx.stroke();
      });
    }

    // How the projection ended: a ring on the resting spot, a star when this
    // aim delivers, or a soft fade-out when the projection simply ran out.
    const last = pts[pts.length - 1];
    ctx.save();
    if (end === 'star') {
      starPath(ctx, last.x, last.y, 11, 5, -Math.PI / 2 + this.time);
      // Delivering with mail still loose ends the round one star short, so that
      // aim is drawn as the warning it is rather than a win.
      ctx.fillStyle = complete ? rgba('#fff3c4', strong ? 0.95 : 0.6) : rgba('#ff9b6b', strong ? 0.8 : 0.45);
      ctx.fill();
      if (!complete) {
        ctx.font = '700 11px ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center';
        const label = 'mail left behind';
        const tw = ctx.measureText(label).width;
        const ly = last.y - 26;
        roundRect(ctx, last.x - tw / 2 - 7, ly - 9, tw + 14, 18, 9);
        ctx.fillStyle = 'rgba(42,12,6,0.82)';
        ctx.fill();
        ctx.fillStyle = rgba('#ffb391', strong ? 1 : 0.7);
        ctx.fillText(label, last.x, ly + 4);
      }
    } else if (end === 'settle') {
      ctx.strokeStyle = rgba(col, strong ? 0.8 : 0.45);
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(last.x, last.y, COMET.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = rgba(col, strong ? 0.5 : 0.28);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(last.x, last.y, 2.2 - i * 0.6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // Power readout above the comet.
    ctx.fillStyle = rgba('#ffffff', strong ? 0.85 : 0.5);
    ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(a.power * 100)}%`, p.x, p.y - COMET.r - 12);
  }

  drawComet(view) {
    const { ctx } = this;
    const s = view.shot;
    // Trail.
    for (const p of this.trail) {
      const a = Math.max(0, p.t / 0.35) * 0.35;
      ctx.fillStyle = rgba(this.skin.tail, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, COMET.r * (0.4 + a), 0, TAU);
      ctx.fill();
    }
    if (s.result === 'star') return; // captured: the star glow covers it
    ctx.save();
    ctx.translate(s.x, s.y);
    const ang = Math.hypot(s.vx, s.vy) > 1 ? Math.atan2(s.vy, s.vx) : -Math.PI / 2;
    ctx.rotate(ang + Math.PI / 2);
    // Body.
    const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, COMET.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, this.skin.color);
    g.addColorStop(1, rgba(this.skin.color, 0.65));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, COMET.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Little mail satchel.
    ctx.fillStyle = rgba('#ffffff', 0.85);
    roundRect(ctx, -5, 2, 10, 7, 2);
    ctx.fill();
    ctx.strokeStyle = rgba('#2b2440', 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.lineTo(5, 4);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.t / p.life));
      ctx.fillStyle = rgba(p.color, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a + 0.5, 0, TAU);
      ctx.fill();
    }
  }

  drawTouchHint() {
    const { ctx, cw, ch } = this;
    ctx.fillStyle = rgba('#ffffff', 0.55);
    ctx.font = '600 13px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('drag back from the comet · release to launch', cw / 2, ch - 16);
  }
}
