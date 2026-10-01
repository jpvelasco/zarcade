// Simulated 128 x 32 dot-matrix display. DOM-free: it fills a brightness
// buffer (0..15 per dot) that the renderer paints as glowing amber dots.
//
// Dmd       drawing primitives and three bitmap fonts.
// DmdShow   the show: score screen, callout animations, bonus count,
//           attract pages. Feed it world events and call draw() each frame.

export const DMD_W = 128;
export const DMD_H = 32;

// 5 x 7 font, one row per entry, 5 bits per row (MSB on the left).
const F5 = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], '-': [0, 0, 0, 31, 0, 0, 0],
  ':': [0, 12, 12, 0, 12, 12, 0], "'": [4, 4, 8, 0, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16],
  '+': [0, 4, 4, 31, 4, 4, 0], '*': [0, 4, 21, 14, 21, 4, 0], '%': [24, 25, 2, 4, 8, 19, 3],
  '#': [10, 10, 31, 10, 31, 10, 10], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  '&': [12, 18, 20, 8, 21, 18, 13], '=': [0, 0, 31, 0, 31, 0, 0], '>': [8, 4, 2, 1, 2, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2],
};
// Narrow glyphs for punctuation so numbers with commas stay compact.
const NARROW5 = { '.': 2, ',': 2, ':': 2, "'": 2, '!': 3, ' ': 3, '(': 3, ')': 3 };

// 3 x 5 font (3 bits per row).
const F3 = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], '!': [2, 2, 2, 0, 2],
  '?': [6, 1, 2, 0, 2], '-': [0, 0, 7, 0, 0], ':': [0, 2, 0, 2, 0], "'": [2, 2, 0, 0, 0],
  '/': [1, 1, 2, 4, 4], '+': [0, 2, 7, 2, 0], '*': [5, 2, 7, 2, 5], '%': [5, 1, 2, 4, 5],
  '#': [5, 7, 5, 7, 5], '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '&': [2, 5, 2, 5, 3],
  '=': [0, 7, 0, 7, 0], '>': [4, 2, 1, 2, 4], '<': [1, 2, 4, 2, 1],
};
const NARROW3 = { '.': 1, ',': 2, ':': 1, "'": 1, '!': 1, ' ': 2 };

export const FONTS = {
  small: { glyphs: F3, w: 3, h: 5, scale: 1, gap: 1, narrow: NARROW3 },
  normal: { glyphs: F5, w: 5, h: 7, scale: 1, gap: 1, narrow: NARROW5 },
  big: { glyphs: F5, w: 5, h: 7, scale: 2, gap: 2, narrow: NARROW5 },
};

function glyphCols(font, ch) {
  return font.narrow[ch] || font.w;
}

export class Dmd {
  constructor() {
    this.buf = new Uint8Array(DMD_W * DMD_H);
  }

  clear() { this.buf.fill(0); }

  set(x, y, v = 15) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= DMD_W || y >= DMD_H) return;
    const i = y * DMD_W + x;
    if (v > this.buf[i]) this.buf[i] = v;
  }

  // Overwrite (for erasing behind text).
  put(x, y, v) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= DMD_W || y >= DMD_H) return;
    this.buf[y * DMD_W + x] = v;
  }

  fade(k) {
    const b = this.buf;
    for (let i = 0; i < b.length; i++) b[i] = (b[i] * k) | 0;
  }

  measure(str, fontName = 'normal') {
    const f = FONTS[fontName];
    let w = 0;
    for (const ch of str) {
      const g = f.glyphs[ch] ? ch : '?';
      w += (glyphCols(f, g) + f.gap / f.scale) * f.scale;
    }
    return Math.max(0, w - f.gap);
  }

  // The biggest font that fits `str` in `width` dots.
  fit(str, width = DMD_W, prefer = 'big') {
    const order = prefer === 'big' ? ['big', 'normal', 'small'] : prefer === 'normal' ? ['normal', 'small'] : ['small'];
    for (const name of order) if (this.measure(str, name) <= width) return name;
    return 'small';
  }

  text(str, x, y, { font = 'normal', v = 15, align = 'left', clip = null } = {}) {
    const f = FONTS[font];
    const w = this.measure(str, font);
    let cx = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? x - w : x;
    const s = f.scale;
    for (const raw of str) {
      const ch = f.glyphs[raw] ? raw : '?';
      const rows = f.glyphs[ch];
      const cols = glyphCols(f, ch);
      const offset = f.w - cols; // narrow glyphs keep their right-aligned bits
      for (let r = 0; r < f.h; r++) {
        const bits = rows[r];
        for (let c = 0; c < cols; c++) {
          if (!(bits & (1 << (f.w - 1 - (c + (offset > 0 ? Math.floor(offset / 2) : 0)))))) continue;
          for (let sy = 0; sy < s; sy++) for (let sx = 0; sx < s; sx++) {
            const px = cx + c * s + sx, py = y + r * s + sy;
            if (clip && (px < clip[0] || px >= clip[1])) continue;
            this.set(px, py, v);
          }
        }
      }
      cx += (cols + f.gap / s) * s;
    }
    return w;
  }

  rect(x, y, w, h, v = 15, fill = false) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (fill || i === 0 || j === 0 || i === w - 1 || j === h - 1) this.set(x + i, y + j, v);
    }
  }

  circle(cx, cy, r, v = 15, fill = false) {
    const r2 = r * r, inner = (r - 1.2) * (r - 1.2);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d <= r2 && (fill || d >= inner)) this.set(x, y, v);
    }
  }

  line(x0, y0, x1, y1, v = 15) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), v);
  }
}

export function fmtScore(n) {
  return Math.round(n).toLocaleString('en-US');
}

// ------------------------------------------------------------ the show

const DURATION = {
  skill: 2.2, planet: 2.6, tour: 3.2, frenzy: 2.4, frenzyEnd: 1.8, lockLit: 1.8, lock: 2.2,
  multiball: 3, jackpot: 2.2, super: 3, superLit: 2, extraBall: 2.8, ballSave: 1.6, kickback: 1.4,
  kickbackLit: 1.4, lanes: 1.8, combo: 1.3, danger: 1.4, tilt: 3, mystery: 2, shootAgain: 2,
  multiballEnd: 1.8, planetLit: 1.6,
};
// Priority: a high callout interrupts a lower one.
const PRIORITY = { tilt: 9, super: 8, multiball: 8, jackpot: 7, tour: 7, extraBall: 7, lock: 6, skill: 6, planet: 5, frenzy: 5 };
const MAX_QUEUE = 4;

export class DmdShow {
  constructor({ reducedMotion = false } = {}) {
    this.dmd = new Dmd();
    this.reduced = reducedMotion;
    this.queue = [];
    this.current = null;
    this.t = 0;
    this.time = 0;
    this.bonus = null;
    this.attractPage = 0;
    this.attractT = 0;
    this.stars = Array.from({ length: 28 }, (_, i) => ({ x: (i * 37) % 128, y: (i * 11) % 32, s: 8 + ((i * 13) % 40) }));
    this.rocks = Array.from({ length: 9 }, (_, i) => ({ x: (i * 47) % 160, y: 4 + ((i * 7) % 24), r: 1.5 + (i % 3), s: 50 + (i % 4) * 22 }));
  }

  // Feed world events (callouts, bonus, game over).
  handle(events) {
    for (const e of events) {
      if (e.type === 'callout') this.push(e);
      else if (e.type === 'bonus') { this.bonus = { ...e, t: 0 }; this.queue.length = 0; this.current = null; }
      else if (e.type === 'ballStart' || e.type === 'gameStart') this.bonus = null;
    }
  }

  push(c) {
    const p = PRIORITY[c.kind] || 1;
    const item = { ...c, dur: DURATION[c.kind] || 1.8, p };
    if (this.current && p > this.current.p) {
      this.queue.unshift(item);
      this.current = null;
      return;
    }
    this.queue.push(item);
    // Low-priority callouts drop off a long queue instead of piling up.
    while (this.queue.length > MAX_QUEUE) {
      let k = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].p < this.queue[k].p) k = i;
      this.queue.splice(k, 1);
    }
  }

  reset() {
    this.queue.length = 0;
    this.current = null;
    this.bonus = null;
  }

  update(dt) {
    this.time += dt;
    if (this.bonus) this.bonus.t += dt;
    if (!this.current && this.queue.length) { this.current = this.queue.shift(); this.t = 0; }
    if (this.current) {
      this.t += dt;
      if (this.t >= this.current.dur) this.current = null;
    }
    this.attractT += dt;
    if (this.attractT > 4.5) { this.attractT = 0; this.attractPage++; }
  }

  // view: { mode: 'attract'|'play'|'bonus'|'over'|'initials', rules, scores, lastScore }
  draw(view) {
    const d = this.dmd;
    d.clear();
    if (view.mode === 'attract') return this.drawAttract(view);
    if (view.mode === 'over' || view.mode === 'initials') return this.drawGameOver(view);
    if (this.bonus) return this.drawBonus();
    if (this.current) return this.drawCallout(this.current, this.t);
    return this.drawScore(view.rules);
  }

  // ------------------------------------------------------------ screens

  drawScore(r) {
    const d = this.dmd;
    const s = fmtScore(r.score);
    d.text(s, 64, 8, { font: d.fit(s, 126), align: 'center' });
    d.text(`BALL ${r.ball}`, 1, 1, { font: 'small', v: 9 });
    // Planet tour progress: five dots, visited ones filled, lit ones blink.
    for (let i = 0; i < 5; i++) {
      const x = 103 + i * 5;
      if (r.planetsVisited[i]) d.circle(x, 3, 1.6, 12, true);
      else if (r.planetsLit[i] && Math.floor(this.time * 4) % 2) d.circle(x, 3, 1.6, 15, true);
      else d.circle(x, 3, 1.6, 4, false);
    }
    let status = '';
    if (r.tilted) status = 'TILT';
    else if (r.multiball) status = r.superLit ? 'SHOOT BLACK HOLE: SUPER' : `JACKPOT ${fmtScore(r.jackpotValue)}`;
    else if (r.frenzy > 0) status = `ASTEROID FRENZY ${Math.ceil(r.frenzy)}`;
    else if (r.ballSave > 0 && Math.floor(this.time * 3) % 2) status = 'BALL SAVE';
    else if (r.lockLit) status = r.locked ? 'LOCK LIT  1 LOCKED' : 'LOCK IS LIT';
    else if (r.extraBallLit) status = 'EXTRA BALL IS LIT';
    else if (r.bonusX > 1) status = `BONUS ${r.bonusX}X`;
    if (status) d.text(status, 64, 26, { font: 'small', align: 'center', v: 11 });
    else d.text('VISIT ALL 5 PLANETS', 64, 26, { font: 'small', align: 'center', v: 5 });
  }

  drawBonus() {
    const d = this.dmd;
    const b = this.bonus;
    const t = b.t;
    if (b.tilted) {
      d.text('TILT', 64, 4, { font: 'big', align: 'center' });
      d.text('NO BONUS', 64, 24, { font: 'small', align: 'center', v: 10 });
      return;
    }
    const shown = Math.min(b.lines.length, Math.floor(t / 0.42));
    if (shown < b.lines.length || t < b.lines.length * 0.42 + 0.3) {
      d.text('BONUS', 64, 1, { font: 'normal', align: 'center', v: 12 });
      const l = b.lines[Math.max(0, Math.min(b.lines.length - 1, shown))];
      d.text(`${l.n} ${l.label}`, 64, 12, { font: 'normal', align: 'center' });
      d.text(fmtScore(l.points), 64, 23, { font: 'small', align: 'center', v: 11 });
      return;
    }
    d.text(`BONUS X ${b.bonusX}`, 64, 1, { font: 'normal', align: 'center', v: 11 });
    const total = fmtScore(b.total);
    d.text(total, 64, 12, { font: d.fit(total, 126), align: 'center' });
    if (b.next === 'shootAgain') d.text('SHOOT AGAIN', 64, 27, { font: 'small', align: 'center', v: 12 });
  }

  drawGameOver(view) {
    const d = this.dmd;
    const r = view.rules;
    if (view.mode === 'initials') {
      d.text('HIGH SCORE!', 64, 1, { font: 'normal', align: 'center' });
      d.text(fmtScore(r.score), 64, 11, { font: 'normal', align: 'center', v: 11 });
      d.text('ENTER YOUR INITIALS', 64, 24, { font: 'small', align: 'center', v: Math.floor(this.time * 3) % 2 ? 15 : 8 });
      return;
    }
    d.text('GAME OVER', 64, 2, { font: 'big', align: 'center' });
    d.text(fmtScore(r.score), 64, 23, { font: 'normal', align: 'center', v: 11 });
  }

  drawAttract(view) {
    const d = this.dmd;
    const t = this.attractT;
    this.drawStars(0.6);
    const pages = ['logo', 'start', 'scores', 'how', 'last'];
    let page = pages[this.attractPage % pages.length];
    if (page === 'last' && !view.lastScore) page = 'logo';
    if (page === 'scores' && !(view.scores && view.scores.length)) page = 'how';
    switch (page) {
      case 'logo': {
        const reveal = this.reduced ? 128 : Math.min(128, t * 160);
        d.text('PINBALL', 64, 1, { font: 'big', align: 'center', clip: [64 - reveal / 2, 64 + reveal / 2] });
        d.text('PLANET', 64, 18, { font: 'normal', align: 'center', v: 12 });
        const a = this.time * 2.2;
        d.circle(64 + Math.cos(a) * 30, 21 + Math.sin(a) * 4, 2, 15, true);
        break;
      }
      case 'start':
        d.text('PRESS START', 64, 3, { font: 'normal', align: 'center', v: Math.floor(this.time * 2) % 2 ? 15 : 9 });
        d.text('ENTER  SPACE  OR TAP', 64, 15, { font: 'small', align: 'center', v: 10 });
        d.text('3 BALLS  VISIT 5 PLANETS', 64, 24, { font: 'small', align: 'center', v: 7 });
        break;
      case 'scores': {
        d.text('HIGH SCORES', 64, 0, { font: 'small', align: 'center', v: 12 });
        view.scores.slice(0, 4).forEach((s, i) => {
          d.text(`${i + 1} ${s.name}`, 6, 7 + i * 6, { font: 'small', v: 11 });
          d.text(fmtScore(s.score), 122, 7 + i * 6, { font: 'small', align: 'right', v: 14 });
        });
        break;
      }
      case 'how':
        d.text('FLIP: SHIFT / Z  M', 64, 2, { font: 'small', align: 'center', v: 12 });
        d.text('PLUNGE: HOLD SPACE', 64, 10, { font: 'small', align: 'center', v: 12 });
        d.text('NUDGE: X  C', 64, 18, { font: 'small', align: 'center', v: 12 });
        d.text('DON\'T TILT!', 64, 26, { font: 'small', align: 'center', v: 8 });
        break;
      case 'last':
        d.text('LAST GAME', 64, 3, { font: 'small', align: 'center', v: 10 });
        d.text(fmtScore(view.lastScore), 64, 13, { font: 'normal', align: 'center' });
        break;
      default: break;
    }
  }

  drawStars(speed = 1) {
    const d = this.dmd;
    for (const s of this.stars) {
      const x = ((s.x - this.time * s.s * speed) % 128 + 128) % 128;
      d.set(x, s.y, 3 + (s.s % 4));
    }
  }

  // ------------------------------------------------------------ callouts

  drawCallout(c, t) {
    const d = this.dmd;
    const k = Math.min(1, t / 0.25); // entrance
    const blink = Math.floor(t * 6) % 2 === 0;
    const title = c.title || '';
    const sub = c.sub || '';
    const big = (y, v = 15) => d.text(title, 64, y, { font: d.fit(title, 126), align: 'center', v });
    const small = (y, v = 11) => sub && d.text(sub, 64, y, { font: d.fit(sub, 126, 'normal'), align: 'center', v });
    switch (c.kind) {
      case 'planet': case 'planetLit': {
        // A planet slides in from the right, the name types on.
        const px = this.reduced ? 104 : 140 - 36 * k;
        d.circle(px, 15, 11, 9, true);
        d.circle(px, 15, 11, 15, false);
        for (let i = -3; i <= 3; i++) d.line(px - 11, 15 + i * 3, px + 11, 15 + i * 3 + 1, 5);
        if (c.planet === 2) for (let a = 0; a < Math.PI * 2; a += 0.05) d.set(px + Math.cos(a) * 18, 15 + Math.sin(a) * 4, 13);
        const n = this.reduced ? title.length : Math.floor(t * 18);
        const shown = title.slice(0, n);
        d.text(shown, 3, 3, { font: d.fit(title, 84), v: 15 });
        if (t > 0.5) d.text(sub, 3, 25, { font: 'small', v: 10 });
        break;
      }
      case 'frenzy': {
        this.drawRocks(t, 1);
        if (blink || this.reduced) big(6);
        small(24);
        break;
      }
      case 'multiball': case 'lock': {
        // A spiral into the black hole.
        const cx = 16, cy = 16;
        for (let i = 0; i < 70; i++) {
          const a = i * 0.32 - t * 6;
          const r = (i / 70) * 15;
          d.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, 4 + (i % 12));
        }
        d.circle(cx, cy, 3, 0, true);
        d.text(title, 78, 4, { font: d.fit(title, 92), align: 'center', v: c.kind === 'multiball' && !blink ? 9 : 15 });
        d.text(sub, 78, 22, { font: d.fit(sub, 92, 'small'), align: 'center', v: 10 });
        break;
      }
      case 'jackpot': case 'super': case 'tour': case 'extraBall': {
        // Bursting rays behind flashing text.
        const n = 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + t * 0.8;
          const r0 = 6 + ((t * 60) % 30);
          d.line(64 + Math.cos(a) * r0, 16 + Math.sin(a) * r0 * 0.5, 64 + Math.cos(a) * (r0 + 10), 16 + Math.sin(a) * (r0 + 10) * 0.5, 4);
        }
        for (let y = 2; y < 20; y++) for (let x = 0; x < 128; x++) d.put(x, y, 0);
        big(3, blink || this.reduced ? 15 : 8);
        small(24, 13);
        break;
      }
      case 'skill': {
        // Rocket streak.
        const x = this.reduced ? 120 : (t * 220) % 170 - 20;
        d.line(x - 30, 27, x, 27, 6);
        d.line(x - 20, 28, x, 28, 9);
        d.rect(x, 25, 6, 5, 15, true);
        d.set(x + 6, 27, 15); d.set(x + 7, 27, 15);
        big(1);
        small(18, 12);
        break;
      }
      case 'tilt': case 'danger': {
        if (blink || this.reduced) d.rect(0, 0, 128, 32, 15, false);
        big(4);
        small(24, 12);
        break;
      }
      case 'ballSave': {
        const r = 4 + ((t * 20) % 8);
        d.circle(14, 16, r, 8, false);
        d.circle(14, 16, 3, 15, true);
        d.text(title, 76, 6, { font: d.fit(title, 100), align: 'center' });
        d.text(sub, 76, 22, { font: 'small', align: 'center', v: 10 });
        break;
      }
      case 'combo': {
        const s = 1 + Math.min(1, t * 6);
        d.text(title, 64, 16 - 6 * s, { font: d.fit(title, 126), align: 'center' });
        small(24, 12);
        break;
      }
      default: {
        // Wipe in from the middle.
        const reveal = this.reduced ? 128 : 128 * k;
        d.text(title, 64, sub ? 3 : 9, { font: d.fit(title, 126), align: 'center', clip: [64 - reveal / 2, 64 + reveal / 2] });
        if (t > 0.2) small(24);
        break;
      }
    }
  }

  drawRocks(t, speed) {
    const d = this.dmd;
    for (const r of this.rocks) {
      const x = 140 - ((r.x + t * r.s * speed) % 170);
      d.circle(x, r.y, r.r, 8, true);
      d.line(x + r.r, r.y, x + r.r + 6, r.y, 3);
    }
  }
}
