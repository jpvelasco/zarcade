// Canvas board renderer. Reads the position and view state; never changes
// game state. Everything costly (board texture, piece sprites, power-square
// glows, fog clouds) is baked into offscreen canvases when the size or theme
// changes, so a frame is a handful of drawImage calls.
import { drawPiece, THEMES } from './pieces.js';
import { makeRng } from './rng.js';
import { POWER_SHIELD, POWER_SWAP, POWER_LEAP } from './chess.js';

const PIECE_CODES = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const MAX_PARTICLES = 90;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export class BoardRenderer {
  constructor(el, { reducedMotion = false } = {}) {
    this.el = el;
    this.ctx = el.getContext('2d');
    this.reduced = reducedMotion;
    this.theme = 'wood';
    this.flipped = false;
    this.css = 0;
    this.dpr = 1;
    this.sprites = new Map();
    this.images = new Map();
    this.anims = [];
    this.fading = [];
    this.particles = [];
    this.pops = [];
    this.time = 0;
    this.dirty = true;
  }

  setTheme(theme) {
    if (!THEMES[theme] || theme === this.theme) return;
    this.theme = theme;
    this.images.clear();
    this.bake();
  }

  setFlipped(f) {
    if (f === this.flipped) return;
    this.flipped = f;
    this.bakeBoard();
    this.dirty = true;
  }

  // Size the canvas to its CSS box (square) and rebake when it changes.
  resize(size) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const css = Math.max(160, Math.floor(size / 8) * 8);
    if (css === this.css && dpr === this.dpr) return;
    this.css = css;
    this.dpr = dpr;
    this.el.width = Math.round(css * dpr);
    this.el.height = Math.round(css * dpr);
    this.el.style.width = `${css}px`;
    this.el.style.height = `${css}px`;
    this.bake();
  }

  get sq() { return (this.css * this.dpr) / 8; }

  bake() {
    if (!this.css) return;
    const s = this.sq;
    this.sprites.clear();
    for (const code of PIECE_CODES) {
      const c = canvas(s, s);
      const pad = s * 0.06;
      drawPiece(c.getContext('2d'), code & 7, code >> 3, this.theme, pad, pad * 0.6, s - pad * 2);
      this.sprites.set(code, c);
    }
    this.bakeBoard();
    this.bakeExtras();
    this.dirty = true;
  }

  bakeBoard() {
    if (!this.css) return;
    const th = THEMES[this.theme];
    const s = this.sq, N = s * 8;
    const c = canvas(N, N), g = c.getContext('2d');
    const rng = makeRng(this.theme.length * 977 + 3);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const light = (r + f) % 2 === 0;
        const x = f * s, y = r * s;
        g.fillStyle = light ? th.light : th.dark;
        g.fillRect(x, y, s, s);
        if (th.grain) {
          // Wood grain: a few faint wavy lines per square.
          g.strokeStyle = light ? 'rgba(150, 95, 45, 0.13)' : 'rgba(70, 35, 10, 0.18)';
          g.lineWidth = Math.max(1, s * 0.012);
          const vertical = (r + f) % 2 === 0;
          for (let i = 0; i < 6; i++) {
            const o = rng() * s;
            g.beginPath();
            for (let k = 0; k <= 8; k++) {
              const t = (k / 8) * s, w = Math.sin(k * 0.9 + o) * s * 0.025;
              if (vertical) g.lineTo(x + o + w, y + t); else g.lineTo(x + t, y + o + w);
            }
            g.stroke();
          }
        }
        if (th.stripes && !light) {
          g.save();
          g.beginPath();
          g.rect(x, y, s, s);
          g.clip();
          g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          g.lineWidth = s * 0.09;
          for (let k = -2; k < 4; k++) {
            g.beginPath();
            g.moveTo(x + k * s * 0.33, y + s);
            g.lineTo(x + k * s * 0.33 + s, y);
            g.stroke();
          }
          g.restore();
        }
        if (th.stripes && light) {
          const colors = ['#ff7ab6', '#7be0c3', '#ffe36e', '#8f7bff'];
          for (let i = 0; i < 3; i++) {
            g.fillStyle = colors[Math.floor(rng() * colors.length)];
            g.globalAlpha = 0.5;
            const px = x + s * (0.15 + rng() * 0.7), py = y + s * (0.15 + rng() * 0.7);
            g.save();
            g.translate(px, py);
            g.rotate(rng() * Math.PI);
            g.fillRect(-s * 0.035, -s * 0.012, s * 0.07, s * 0.024);
            g.restore();
            g.globalAlpha = 1;
          }
        }
        if (th.stars) {
          for (let i = 0; i < 3; i++) {
            g.fillStyle = `rgba(255, 255, 255, ${0.25 + rng() * 0.5})`;
            g.beginPath();
            g.arc(x + rng() * s, y + rng() * s, Math.max(0.6, s * 0.012 * (0.5 + rng())), 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    if (th.stars) {
      const neb = g.createRadialGradient(N * 0.7, N * 0.3, 0, N * 0.7, N * 0.3, N * 0.7);
      neb.addColorStop(0, 'rgba(255, 120, 220, 0.16)');
      neb.addColorStop(1, 'rgba(255, 120, 220, 0)');
      g.fillStyle = neb;
      g.fillRect(0, 0, N, N);
    }
    // Coordinates in the edge squares.
    const fs = Math.max(9, s * 0.16);
    g.font = `800 ${fs}px ui-rounded, system-ui, sans-serif`;
    for (let i = 0; i < 8; i++) {
      const file = this.flipped ? 7 - i : i;
      const rank = this.flipped ? i : 7 - i;
      const fileLight = (7 + i) % 2 === 0;
      g.fillStyle = fileLight ? th.coordLight : th.coordDark;
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillText('abcdefgh'[file], (i + 1) * s - s * 0.06, N - s * 0.04);
      const rankLight = i % 2 === 0;
      g.fillStyle = rankLight ? th.coordLight : th.coordDark;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(String(rank + 1), s * 0.06, i * s + s * 0.05);
    }
    this.boardCanvas = c;
  }

  bakeExtras() {
    const th = THEMES[this.theme];
    const s = this.sq;
    // Power squares: a glowing token with an icon.
    this.powerSprites = {};
    const POWER_COLORS = { [POWER_SHIELD]: '#5ec8ff', [POWER_SWAP]: '#ffb84a', [POWER_LEAP]: '#b77bff' };
    for (const type of [POWER_SHIELD, POWER_SWAP, POWER_LEAP]) {
      const c = canvas(s, s), g = c.getContext('2d');
      const col = POWER_COLORS[type];
      const glow = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      glow.addColorStop(0, col);
      glow.addColorStop(0.45, `${col}aa`);
      glow.addColorStop(1, `${col}00`);
      g.fillStyle = glow;
      g.fillRect(0, 0, s, s);
      g.translate(s / 2, s / 2);
      g.scale(s / 100, s / 100);
      drawPowerIcon(g, type);
      this.powerSprites[type] = c;
    }
    // Shield bubble around a protected piece.
    {
      const c = canvas(s, s), g = c.getContext('2d');
      const r = s * 0.46;
      const grad = g.createRadialGradient(s * 0.4, s * 0.35, r * 0.2, s / 2, s / 2, r);
      grad.addColorStop(0, 'rgba(180, 235, 255, 0.05)');
      grad.addColorStop(0.8, 'rgba(94, 200, 255, 0.28)');
      grad.addColorStop(1, 'rgba(94, 200, 255, 0.75)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(220, 245, 255, 0.9)';
      g.lineWidth = s * 0.03;
      g.beginPath();
      g.arc(s / 2, s / 2, r * 0.8, Math.PI * 1.1, Math.PI * 1.45);
      g.stroke();
      this.shieldSprite = c;
    }
    // Fog: a cloudy texture for the whole board. Each position's fog mask is
    // baked from it once (see fogLayer), at half resolution.
    {
      const half = (s * 8) / 2;
      const c = canvas(half, half), g = c.getContext('2d');
      const rng = makeRng(77);
      g.fillStyle = th.fog[0];
      g.fillRect(0, 0, half, half);
      for (let i = 0; i < 90; i++) {
        const x = rng() * half, y = rng() * half, r = half * (0.07 + rng() * 0.12);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, th.fog[1]);
        grad.addColorStop(1, `${th.fog[1]}00`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      this.fogTexture = c;
      this.fogKey = '';
    }
    // Check glow under the king.
    {
      const c = canvas(s, s), g = c.getContext('2d');
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.62);
      grad.addColorStop(0, 'rgba(255, 40, 40, 0.95)');
      grad.addColorStop(0.5, 'rgba(255, 60, 60, 0.55)');
      grad.addColorStop(1, 'rgba(255, 60, 60, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      this.checkSprite = c;
    }
  }

  // A small data-URL image of a piece for the DOM (trays, promotion picker).
  pieceImage(code, size = 96) {
    const key = `${this.theme}:${code}:${size}`;
    if (this.images.has(key)) return this.images.get(key);
    const c = canvas(size, size);
    drawPiece(c.getContext('2d'), code & 7, code >> 3, this.theme, size * 0.04, size * 0.02, size * 0.92);
    const url = c.toDataURL();
    this.images.set(key, url);
    return url;
  }

  // ------------------------------------------------------------ geometry

  // Pixel position (canvas pixels) of a 0x88 square's top-left corner.
  pos(sqr) {
    const f = sqr & 7, r = sqr >> 4;
    const col = this.flipped ? 7 - f : f, row = this.flipped ? r : 7 - r;
    return [col * this.sq, row * this.sq];
  }

  // Square under a client point, or -1.
  squareAt(clientX, clientY) {
    const rect = this.el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
    if (x < 0 || y < 0 || x >= 1 || y >= 1) return -1;
    const col = Math.floor(x * 8), row = Math.floor(y * 8);
    const f = this.flipped ? 7 - col : col, r = this.flipped ? row : 7 - row;
    return r * 16 + f;
  }

  // Square center in CSS pixels relative to the canvas (for DOM popups).
  centerCss(sqr) {
    const [x, y] = this.pos(sqr);
    return [(x + this.sq / 2) / this.dpr, (y + this.sq / 2) / this.dpr];
  }

  // ------------------------------------------------------------ animation

  animateMove(rec) {
    const dur = this.reduced ? 0.09 : 0.24;
    this.anims.length = 0;
    for (const sl of rec.slides) {
      this.anims.push({ piece: sl.piece, from: sl.from, to: sl.to, t: 0, dur: sl.jump ? dur * 1.2 : dur, jump: !!sl.jump });
    }
    if (rec.captured) {
      this.fading.push({ piece: rec.captured, sq: rec.capSq, t: 0, dur: this.reduced ? 0.12 : 0.32 });
      this.burst(rec.capSq, this.reduced ? 6 : 18);
    }
    if (rec.promo || rec.collected) this.burst(rec.slides[0]?.to ?? rec.capSq, this.reduced ? 6 : 16);
    if (rec.power === POWER_SHIELD) this.pops.push({ sq: rec.slides[0]?.from ?? (rec.move & 127), t: 0, dur: 0.4 });
    this.dirty = true;
  }

  burst(sqr, n) {
    if (sqr < 0) return;
    const th = THEMES[this.theme];
    const [x, y] = this.pos(sqr);
    const s = this.sq;
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2, v = s * (1.2 + Math.random() * 2.4);
      this.particles.push({
        x: x + s / 2, y: y + s / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - s, life: 0.5 + Math.random() * 0.4, t: 0,
        r: s * (0.03 + Math.random() * 0.04), color: th.particles[i % th.particles.length],
      });
    }
  }

  get busy() { return this.anims.length > 0; }

  // Advance animations; returns true while something moves.
  update(dt) {
    this.time += dt;
    let active = false;
    for (const a of this.anims) a.t += dt;
    if (this.anims.length && this.anims.every((a) => a.t >= a.dur)) this.anims.length = 0;
    if (this.anims.length) active = true;
    for (let i = this.fading.length - 1; i >= 0; i--) { const f = this.fading[i]; f.t += dt; if (f.t >= f.dur) this.fading.splice(i, 1); else active = true; }
    for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; if (p.t >= p.dur) this.pops.splice(i, 1); else active = true; }
    const g = this.sq * 9;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) { this.particles[i] = this.particles[this.particles.length - 1]; this.particles.pop(); continue; }
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      active = true;
    }
    if (active) this.dirty = true;
    return active;
  }

  // ------------------------------------------------------------ drawing

  // view: { board, selected, targets: Map(sq -> isCapture), last: [from, to],
  //         check, cursor, hint: [from, to], fog, powerSq, shield, eligible:
  //         Set, drag: { piece, from, x, y }, focus: sq, pulse: bool }
  draw(view) {
    const ctx = this.ctx, s = this.sq, th = THEMES[this.theme];
    if (!this.boardCanvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.boardCanvas, 0, 0);
    const fill = (sqr, color) => { const [x, y] = this.pos(sqr); ctx.fillStyle = color; ctx.fillRect(x, y, s, s); };
    const fog = view.fog;
    const seen = (sqr) => !fog || fog[sqr];

    if (view.last) for (const q of view.last) if (q >= 0 && seen(q)) fill(q, th.last);
    if (view.selected >= 0) fill(view.selected, th.select);
    if (view.focus >= 0) {
      const [x, y] = this.pos(view.focus);
      ctx.fillStyle = 'rgba(255, 230, 90, 0.35)';
      ctx.fillRect(x, y, s, s);
    }

    // Power squares pulse gently.
    if (view.powerSq) {
      const pulse = this.reduced ? 0.85 : 0.72 + Math.sin(this.time * 3) * 0.2;
      for (let q = 0; q < 128; q++) {
        if (q & 0x88) { q += 7; continue; }
        const type = view.powerSq[q];
        if (!type || !seen(q)) continue;
        const [x, y] = this.pos(q);
        ctx.globalAlpha = pulse;
        ctx.drawImage(this.powerSprites[type], x, y);
        ctx.globalAlpha = 1;
      }
    }

    if (view.check >= 0) {
      const [x, y] = this.pos(view.check);
      ctx.drawImage(this.checkSprite, x, y);
    }

    // Pieces. Squares being animated are drawn by the animation instead.
    const hidden = this.hiddenSquares || (this.hiddenSquares = new Set());
    hidden.clear();
    for (const a of this.anims) hidden.add(a.to);
    if (view.drag) hidden.add(view.drag.from);
    const b = view.board;
    for (let q = 0; q < 128; q++) {
      if (q & 0x88) { q += 7; continue; }
      const p = b[q];
      if (!p || hidden.has(q) || !seen(q)) continue;
      const [x, y] = this.pos(q);
      if (view.eligible && view.eligible.has(q)) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.drawImage(this.sprites.get(p), x, y);
    }
    if (view.shield >= 0 && seen(view.shield)) {
      const [x, y] = this.pos(view.shield);
      ctx.drawImage(this.shieldSprite, x, y);
    }

    for (const f of this.fading) {
      const k = Math.min(1, f.t / f.dur);
      const [x, y] = this.pos(f.sq);
      const sc = 1 + k * 0.35;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(this.sprites.get(f.piece), x + (s - s * sc) / 2, y + (s - s * sc) / 2, s * sc, s * sc);
      ctx.globalAlpha = 1;
    }

    for (const a of this.anims) {
      const k = Math.min(1, a.t / a.dur);
      const e = this.reduced ? k : easeOut(k);
      const [x0, y0] = this.pos(a.from), [x1, y1] = this.pos(a.to);
      let x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e;
      let sc = 1;
      if (!this.reduced) {
        if (a.jump) { y -= Math.sin(k * Math.PI) * s * 0.45; sc = 1 + Math.sin(k * Math.PI) * 0.14; }
        else sc = 1 + Math.sin(k * Math.PI) * 0.08;
        if (k >= 1) sc = 1;
      }
      if (!seen(a.to) && !seen(a.from)) continue;
      const spr = this.sprites.get(a.piece);
      if (!spr) continue;
      ctx.drawImage(spr, x + (s - s * sc) / 2, y + (s - s * sc) / 2 - (sc - 1) * s * 0.4, s * sc, s * sc);
    }

    for (const p of this.pops) {
      const k = p.t / p.dur;
      const [x, y] = this.pos(p.sq);
      const sc = this.reduced ? 1 : easeOutBack(Math.min(1, k * 1.4));
      ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
      ctx.drawImage(this.shieldSprite, x + (s - s * sc) / 2, y + (s - s * sc) / 2, s * sc, s * sc);
      ctx.globalAlpha = 1;
    }

    if (fog) ctx.drawImage(this.fogLayer(fog), 0, 0, this.el.width, this.el.height);

    // Legal move markers: dots for quiet moves, rings for captures.
    if (view.targets) {
      for (const [q, capture] of view.targets) {
        const [x, y] = this.pos(q);
        if (capture) {
          ctx.strokeStyle = th.ring;
          ctx.lineWidth = s * 0.08;
          ctx.beginPath();
          ctx.arc(x + s / 2, y + s / 2, s * 0.43, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = th.dot;
          ctx.beginPath();
          ctx.arc(x + s / 2, y + s / 2, s * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (view.hint) this.drawArrow(view.hint[0], view.hint[1], th.arrow);

    if (view.cursor >= 0) {
      const [x, y] = this.pos(view.cursor);
      ctx.strokeStyle = th.cursor;
      ctx.lineWidth = s * 0.07;
      const inset = s * 0.05;
      ctx.strokeRect(x + inset, y + inset, s - inset * 2, s - inset * 2);
    }

    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;

    if (view.drag) {
      const spr = this.sprites.get(view.drag.piece);
      const sc = 1.18;
      const rect = this.el.getBoundingClientRect();
      const px = ((view.drag.x - rect.left) / rect.width) * this.el.width;
      const py = ((view.drag.y - rect.top) / rect.height) * this.el.height;
      if (spr) ctx.drawImage(spr, px - (s * sc) / 2, py - s * sc * 0.72, s * sc, s * sc);
    }
    this.dirty = false;
  }

  // Soft-edged fog over hidden squares, rebuilt only when the mask changes
  // (once per move). Blur is applied here at bake time, never per frame.
  fogLayer(mask) {
    if (mask === this.fogMask && this.fogFlip === this.flipped && this.fogCanvas && this.fogKey) return this.fogCanvas;
    this.fogMask = mask;
    this.fogFlip = this.flipped;
    let key = '';
    for (let q = 0; q < 128; q++) { if (q & 0x88) { q += 7; continue; } key += mask[q] ? '1' : '0'; }
    key += this.flipped ? 'f' : 'n';
    if (key === this.fogKey && this.fogCanvas) return this.fogCanvas;
    this.fogKey = key;
    const tex = this.fogTexture;
    const N = tex.width, s = N / 8;
    const c = this.fogCanvas && this.fogCanvas.width === N ? this.fogCanvas : canvas(N, N);
    const g = c.getContext('2d');
    g.clearRect(0, 0, N, N);
    g.filter = `blur(${Math.max(1, s * 0.22)}px)`;
    g.fillStyle = '#000';
    for (let q = 0; q < 128; q++) {
      if (q & 0x88) { q += 7; continue; }
      if (mask[q]) continue;
      const f = q & 7, r = q >> 4;
      const col = this.flipped ? 7 - f : f, row = this.flipped ? r : 7 - r;
      g.fillRect(col * s - s * 0.12, row * s - s * 0.12, s * 1.24, s * 1.24);
    }
    g.filter = 'none';
    g.globalCompositeOperation = 'source-in';
    g.drawImage(tex, 0, 0);
    g.globalCompositeOperation = 'source-over';
    this.fogCanvas = c;
    return c;
  }

  drawArrow(from, to, color) {
    const ctx = this.ctx, s = this.sq;
    const [x0, y0] = this.pos(from), [x1, y1] = this.pos(to);
    const ax = x0 + s / 2, ay = y0 + s / 2, bx = x1 + s / 2, by = y1 + s / 2;
    const ang = Math.atan2(by - ay, bx - ax), len = Math.hypot(bx - ax, by - ay);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    const w = s * 0.16, head = s * 0.42;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, -w / 2);
    ctx.lineTo(len - head, -w / 2);
    ctx.lineTo(len - head, -head * 0.6);
    ctx.lineTo(len - s * 0.08, 0);
    ctx.lineTo(len - head, head * 0.6);
    ctx.lineTo(len - head, w / 2);
    ctx.lineTo(s * 0.18, w / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// Power icons in a 100-unit box centred on the origin.
export function drawPowerIcon(g, type) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(20, 16, 40, 0.85)';
  g.fillStyle = '#ffffff';
  g.lineWidth = 6;
  g.beginPath();
  if (type === POWER_SHIELD) {
    g.moveTo(0, -24); g.lineTo(20, -16); g.quadraticCurveTo(20, 12, 0, 26); g.quadraticCurveTo(-20, 12, -20, -16); g.closePath();
    g.stroke(); g.fill();
    g.strokeStyle = '#5ec8ff'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(0, 14); g.stroke();
  } else if (type === POWER_SWAP) {
    const arrow = (y, dir) => {
      g.beginPath();
      g.moveTo(-20 * dir, y); g.lineTo(18 * dir, y); g.moveTo(8 * dir, y - 9); g.lineTo(19 * dir, y); g.lineTo(8 * dir, y + 9);
      g.strokeStyle = 'rgba(20, 16, 40, 0.85)'; g.lineWidth = 13; g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.stroke();
    };
    arrow(-10, 1);
    arrow(12, -1);
  } else {
    // Leap: a hop arc with an arrow head.
    g.beginPath();
    g.moveTo(-22, 16); g.quadraticCurveTo(-6, -36, 18, 4);
    g.strokeStyle = 'rgba(20, 16, 40, 0.85)'; g.lineWidth = 13; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.stroke();
    g.beginPath(); g.moveTo(6, 6); g.lineTo(20, 8); g.lineTo(21, -6);
    g.strokeStyle = 'rgba(20, 16, 40, 0.85)'; g.lineWidth = 13; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.stroke();
    g.beginPath(); g.arc(-22, 18, 5, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  }
}

// Full-screen confetti on its own canvas (pointer-events: none).
export class Confetti {
  constructor(el, { reducedMotion = false } = {}) {
    this.el = el;
    this.ctx = el.getContext('2d');
    this.reduced = reducedMotion;
    this.bits = [];
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.el.width = Math.round(innerWidth * dpr);
    this.el.height = Math.round(innerHeight * dpr);
  }

  burst(colors) {
    if (!this.el.width) this.resize();
    const n = this.reduced ? 40 : 160;
    const W = this.el.width, H = this.el.height;
    for (let i = 0; i < n && this.bits.length < 220; i++) {
      const fromLeft = i % 2 === 0;
      this.bits.push({
        x: fromLeft ? W * 0.05 : W * 0.95, y: H * 0.75,
        vx: (fromLeft ? 1 : -1) * W * (0.2 + Math.random() * 0.5), vy: -H * (0.9 + Math.random() * 0.7),
        w: (6 + Math.random() * 8) * this.dpr, h: (4 + Math.random() * 5) * this.dpr,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, color: colors[i % colors.length], t: 0,
      });
    }
  }

  get active() { return this.bits.length > 0; }

  update(dt) {
    const H = this.el.height;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      b.vy += H * 1.1 * dt;
      b.vx *= 1 - 0.9 * dt;
      b.vy = Math.min(b.vy, H * 0.35);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y > H + 40 || b.t > 6) { this.bits[i] = this.bits[this.bits.length - 1]; this.bits.pop(); }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    for (const b of this.bits) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      ctx.setTransform(c, s * 0.6, -s, c, b.x, b.y);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
