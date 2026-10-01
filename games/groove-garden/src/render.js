// Canvas art: the garden, the lanes, the notes and the juice. Reads the
// game state it is handed and never changes it.
//
// Everything with a gradient or soft glow is baked once into offscreen
// canvases (on resize or when the skin changes); a frame is mostly
// drawImage calls, a few strokes for stems and vines, and one or two strings.

export const LANE_STYLES = [
  { color: '#E69F00', light: '#ffd27a', dark: '#7a4a00', shape: 'circle', name: 'circle' },
  { color: '#56B4E9', light: '#bfe6ff', dark: '#1d5a85', shape: 'triangle', name: 'triangle' },
  { color: '#CC79A7', light: '#f6c4e1', dark: '#7a2f5a', shape: 'diamond', name: 'diamond' },
  { color: '#F0E442', light: '#fff9b8', dark: '#857a00', shape: 'star', name: 'star' },
];
// Three lanes keep three clearly different shapes and colours.
const LANES_3 = [0, 1, 3];
export const laneStyle = (lanes, lane) => LANE_STYLES[lanes === 3 ? LANES_3[lane] : lane];

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FLOWER = ['#ff7eb6', '#ffd23f', '#ff8c42', '#b18cff', '#6fd3e8', '#ff5e5e'];
const APPROACH = [2.1, 1.7, 1.4, 1.15, 0.95]; // seconds on screen per speed setting
const JUDGE_STYLE = {
  perfect: { text: 'Perfect!', a: '#fff7b0', b: '#ffb300' },
  great: { text: 'Great!', a: '#d4ffd0', b: '#3ccf6e' },
  good: { text: 'Good', a: '#e0f3ff', b: '#58a8e8' },
  miss: { text: 'Miss', a: '#e6e1f0', b: '#8f88a8' },
};
const MAX_PARTICLES = 160;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function shapePath(ctx, shape, r) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(0, 0, r, 0, Math.PI * 2);
  else if (shape === 'triangle') {
    const R = r * 1.22;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R + r * 0.18);
    }
    ctx.closePath();
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 1.0, 0);
    ctx.lineTo(0, r * 1.15);
    ctx.lineTo(-r * 1.0, 0);
    ctx.closePath();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const R = i % 2 ? r * 0.55 : r * 1.18;
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R + r * 0.06);
    }
    ctx.closePath();
  }
}

export class Renderer {
  constructor(el, { reduced = false } = {}) {
    this.canvas = el;
    this.ctx = el.getContext('2d');
    this.reduced = reduced;
    this.lanes = 4;
    this.skin = 'petals';
    this.speed = 3;
    this.decor = [];
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push({ life: 0 });
    this.rings = [0, 0, 0, 0];
    this.flash = [0, 0, 0, 0];
    this.popups = [0, 1, 2, 3].map(() => ({ life: 0, j: 'perfect' }));
    this.banner = { life: 0, text: '' };
    this.comboPulse = 0;
    this.comboText = '';
    this.comboValue = -1;
    this.highwayAlpha = 1;
    this.time = 0;
    this.plantPos = [];
    this.resize();
  }

  configure({ lanes = this.lanes, skin = this.skin, speed = this.speed, decor = this.decor, reduced = this.reduced } = {}) {
    const rebake = lanes !== this.lanes || skin !== this.skin || reduced !== this.reduced || decor.join() !== this.decor.join();
    this.lanes = lanes;
    this.skin = skin;
    this.speed = speed;
    this.decor = [...decor];
    this.reduced = reduced;
    if (rebake) this.resize();
  }

  get approach() {
    return APPROACH[clamp(this.speed, 1, 5) - 1];
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    const n = this.lanes;
    this.laneW = Math.round(clamp(Math.min((W * 0.94) / n, n === 3 ? 150 : 124, H * 0.17), 60, 150));
    this.hwW = this.laneW * n;
    this.hwX = Math.round((W - this.hwW) / 2);
    this.hitY = Math.round(H - clamp(H * 0.19, 96, 170));
    this.topY = 56;
    this.noteR = this.laneW * 0.32;
    this.bake();
  }

  laneX(lane) {
    return this.hwX + this.laneW * (lane + 0.5);
  }

  /** Which lane a screen point is over. Taps beside the lanes count for the nearest one. */
  laneAt(x) {
    return clamp(Math.floor((x - this.hwX) / this.laneW), 0, this.lanes - 1);
  }

  // ------------------------------------------------------------ baking

  bake() {
    const { W, H } = this;
    this.bgDull = this.bakeBackground(false);
    this.bgBright = this.bakeBackground(true);
    this.highway = this.bakeHighway();
    const S = Math.ceil(this.noteR * 2.9);
    this.noteSize = S;
    this.notes = [];
    this.receptors = [];
    this.beams = [];
    for (let l = 0; l < this.lanes; l++) {
      const st = laneStyle(this.lanes, l);
      this.notes.push(this.bakeNote(st, S, this.skin, false));
      this.receptors.push([this.bakeReceptor(st, S, false), this.bakeReceptor(st, S, true)]);
      this.beams.push(this.bakeBeam(st));
    }
    this.ghost = this.bakeNote({ ...LANE_STYLES[0], color: '#8d8aa0', light: '#c9c6d8', dark: '#4a475c' }, S, 'plain', true);
    this.judge = {};
    for (const [k, v] of Object.entries(JUDGE_STYLE)) this.judge[k] = this.bakeWord(v, Math.round(clamp(this.laneW * 0.3, 18, 34)));
    this.flowers = FLOWER.map((c) => ['daisy', 'tulip', 'sunflower', 'bell', 'rose', 'lupin'].map((k) => this.bakeFlower(k, c)));
    this.leaf = this.bakeLeaf();
    this.bud = this.bakeBud();
    this.glowDot = this.bakeGlow(24, 'rgba(255,250,200,1)');
    this.petal = LANE_STYLES.map((s) => this.bakePetal(s.color));
    this.petal.push(this.bakePetal('#ffffff'));
    this.sun = this.bakeGlow(Math.min(W, H) * 0.5, 'rgba(255,236,170,1)');
    this.decorSprites = {};
    for (const id of this.decor) this.decorSprites[id] = this.bakeDecor(id);
  }

  bakeBackground(bright) {
    const { W, H } = this;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, H * 0.75);
    if (bright) {
      sky.addColorStop(0, '#3a2f86');
      sky.addColorStop(0.45, '#c46cc4');
      sky.addColorStop(0.8, '#ffb38a');
      sky.addColorStop(1, '#ffe2a0');
    } else {
      sky.addColorStop(0, '#1f2a48');
      sky.addColorStop(0.5, '#43506e');
      sky.addColorStop(1, '#7a8494');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // Stars in the upper sky.
    g.fillStyle = bright ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 70; i++) {
      const x = ((i * 7919) % 1000) / 1000 * W;
      const y = ((i * 104729) % 1000) / 1000 * H * 0.4;
      const r = (i % 3) * 0.5 + 0.6;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // Hills, far to near.
    const hills = bright
      ? [['#6a5fb0', 0.6, 0.05], ['#4f9a78', 0.68, 0.07], ['#3f8a4e', 0.76, 0.05]]
      : [['#3c4660', 0.6, 0.05], ['#3d5850', 0.68, 0.07], ['#33503c', 0.76, 0.05]];
    hills.forEach(([color, base, amp], k) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) {
        const y = H * base - Math.sin(x / (W * 0.21) + k * 2.1) * H * amp - Math.sin(x / (W * 0.09) + k) * H * amp * 0.3;
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    });
    // The garden bed.
    const soil = g.createLinearGradient(0, H * 0.8, 0, H);
    soil.addColorStop(0, bright ? '#3d7a3a' : '#2c4a30');
    soil.addColorStop(0.35, bright ? '#5a3d2a' : '#3a2c24');
    soil.addColorStop(1, bright ? '#3c271a' : '#241a14');
    g.fillStyle = soil;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 16) g.lineTo(x, H * 0.84 - Math.sin(x * 0.05) * 3 - Math.sin(x * 0.013) * 6);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    // Round bushes along the back of the bed.
    for (let i = 0, x = -30; x < W + 60; i++, x += 120 + ((i * 53) % 70)) {
      const y = H * 0.845;
      const r = 34 + ((i * 29) % 26);
      g.fillStyle = bright ? '#2f7a45' : '#24493a';
      for (const [dx, dy, k] of [[-r * 0.7, 6, 0.75], [r * 0.7, 8, 0.7], [0, 0, 1]]) {
        g.beginPath();
        g.arc(x + dx, y - r * 0.5 * k + dy, r * k, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = bright ? '#3d9456' : '#2b5541';
      g.beginPath();
      g.arc(x - r * 0.2, y - r * 0.75, r * 0.45, 0, Math.PI * 2);
      g.fill();
      if (bright) {
        g.fillStyle = ['#ffd6ea', '#fff3b0', '#ffffff'][i % 3];
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.arc(x + Math.cos(k * 2.4 + i) * r * 0.7, y - r * 0.6 + Math.sin(k * 1.7 + i) * r * 0.4, 2.6, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // Grass tufts.
    g.strokeStyle = bright ? '#6cc860' : '#3f6e44';
    g.lineWidth = 2;
    for (let x = 4; x < W; x += 9) {
      const y = H * 0.84 - Math.sin(x * 0.05) * 3 - Math.sin(x * 0.013) * 6 + 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + ((x * 13) % 7) - 3, y - 7 - ((x * 7) % 6));
      g.stroke();
    }
    return c;
  }

  bakeHighway() {
    const { hwW, H, laneW, hitY } = this;
    const pad = 10;
    const c = canvas(hwW + pad * 2, H);
    const g = c.getContext('2d');
    const body = g.createLinearGradient(0, 0, 0, H);
    body.addColorStop(0, 'rgba(20,14,40,0)');
    body.addColorStop(0.12, 'rgba(20,14,40,0.5)');
    body.addColorStop(0.85, 'rgba(18,12,32,0.68)');
    body.addColorStop(1, 'rgba(18,12,32,0.4)');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(pad, 0, hwW, H, 22);
    g.fill();
    for (let l = 0; l < this.lanes; l++) {
      const st = laneStyle(this.lanes, l);
      const glow = g.createLinearGradient(0, hitY - H * 0.35, 0, hitY + laneW * 0.6);
      glow.addColorStop(0, 'rgba(0,0,0,0)');
      glow.addColorStop(1, st.color + '33');
      g.fillStyle = glow;
      g.fillRect(pad + l * laneW + 3, 0, laneW - 6, H);
      if (l) {
        g.fillStyle = 'rgba(255,255,255,0.09)';
        g.fillRect(pad + l * laneW - 1, 0, 2, H);
      }
    }
    // The hit line: a vine across the lanes.
    g.fillStyle = 'rgba(160,255,170,0.5)';
    g.fillRect(pad, hitY - 2, hwW, 4);
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(pad + 1, 1, hwW - 2, H - 2, 22);
    g.stroke();
    c.pad = pad;
    return c;
  }

  bakeNote(st, S, skin, ghost) {
    const c = canvas(S, S);
    const g = c.getContext('2d');
    const r = this.noteR;
    g.translate(S / 2, S / 2);
    if (!ghost) {
      const halo = g.createRadialGradient(0, 0, r * 0.6, 0, 0, S / 2);
      halo.addColorStop(0, st.color + '88');
      halo.addColorStop(1, st.color + '00');
      g.fillStyle = halo;
      g.fillRect(-S / 2, -S / 2, S, S);
    }
    g.lineJoin = 'round';
    shapePath(g, st.shape, r);
    g.lineWidth = r * 0.34;
    g.strokeStyle = 'rgba(20,10,30,0.55)';
    g.stroke();
    const fill = g.createLinearGradient(0, -r, 0, r);
    fill.addColorStop(0, st.light);
    fill.addColorStop(1, st.color);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = r * 0.14;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.save();
    shapePath(g, st.shape, r);
    g.clip();
    this.motif(g, skin, r, st);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-r * 0.32, -r * 0.42, r * 0.36, r * 0.2, -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
    return c;
  }

  motif(g, skin, r, st) {
    if (skin === 'petals') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        g.beginPath();
        g.ellipse(Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24 + r * 0.05, r * 0.17, r * 0.1, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffcf3a';
      g.beginPath();
      g.arc(0, r * 0.05, r * 0.12, 0, Math.PI * 2);
      g.fill();
    } else if (skin === 'seeds') {
      g.fillStyle = '#5a3b22';
      for (const [x, y, a] of [[-0.25, 0.1, 0.4], [0.2, -0.05, -0.3], [0.02, 0.32, 1.4]]) {
        g.beginPath();
        g.ellipse(x * r, y * r, r * 0.16, r * 0.08, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,240,200,0.8)';
      for (const [x, y, a] of [[-0.27, 0.08, 0.4], [0.18, -0.07, -0.3]]) {
        g.beginPath();
        g.ellipse(x * r, y * r, r * 0.07, r * 0.03, a, 0, Math.PI * 2);
        g.fill();
      }
    } else if (skin === 'ladybugs') {
      g.fillStyle = 'rgba(30,10,20,0.85)';
      for (const [x, y, s] of [[-0.3, 0.05, 0.13], [0.3, 0.05, 0.13], [0, 0.35, 0.12], [-0.18, -0.3, 0.1], [0.18, -0.3, 0.1]]) {
        g.beginPath();
        g.arc(x * r, y * r, s * r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(-r * 0.03, -r, r * 0.06, r * 2);
    } else if (skin === 'fruit') {
      g.fillStyle = '#3fae4a';
      g.beginPath();
      g.ellipse(r * 0.18, -r * 0.55, r * 0.28, r * 0.12, -0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (const [x, y] of [[-0.2, 0.2], [0.25, 0.25], [0, 0.45], [0.3, -0.1], [-0.35, -0.05]]) {
        g.beginPath();
        g.arc(x * r, y * r, r * 0.05, 0, Math.PI * 2);
        g.fill();
      }
    } else if (skin === 'stars') {
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const R = i % 2 ? r * 0.1 : r * 0.42;
        g.lineTo(Math.cos(a) * R, Math.sin(a) * R + r * 0.05);
      }
      g.closePath();
      g.fill();
    }
  }

  bakeReceptor(st, S, lit) {
    const c = canvas(S, S);
    const g = c.getContext('2d');
    const r = this.noteR * 1.06;
    g.translate(S / 2, S / 2);
    g.lineJoin = 'round';
    shapePath(g, st.shape, r);
    g.fillStyle = lit ? st.color + 'aa' : 'rgba(10,6,20,0.45)';
    g.fill();
    g.lineWidth = r * 0.16;
    g.strokeStyle = lit ? '#ffffff' : st.color;
    g.stroke();
    shapePath(g, st.shape, r * 0.62);
    g.lineWidth = r * 0.06;
    g.strokeStyle = lit ? 'rgba(255,255,255,0.9)' : st.color + '88';
    g.stroke();
    return c;
  }

  bakeBeam(st) {
    const h = this.H * 0.45;
    const c = canvas(this.laneW, h);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, st.color + '00');
    grad.addColorStop(1, st.color + 'aa');
    g.fillStyle = grad;
    g.fillRect(4, 0, this.laneW - 8, h);
    return c;
  }

  bakeWord({ text, a, b }, size) {
    const g0 = canvas(10, 10).getContext('2d');
    g0.font = `900 ${size}px ${FONT}`;
    const w = Math.ceil(g0.measureText(text).width + size * 0.8);
    const h = Math.ceil(size * 1.6);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.font = `900 ${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = size * 0.28;
    g.strokeStyle = 'rgba(25,10,40,0.85)';
    g.strokeText(text, w / 2, h / 2);
    const fill = g.createLinearGradient(0, h * 0.2, 0, h * 0.8);
    fill.addColorStop(0, a);
    fill.addColorStop(1, b);
    g.fillStyle = fill;
    g.fillText(text, w / 2, h / 2);
    return c;
  }

  bakeFlower(kind, color) {
    const S = 64;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const r = 24;
    if (kind === 'daisy') {
      g.fillStyle = color;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12;
        g.beginPath();
        g.ellipse(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.42, r * 0.16, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'tulip') {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-r * 0.7, -r * 0.5);
      g.quadraticCurveTo(-r * 0.75, r * 0.7, 0, r * 0.7);
      g.quadraticCurveTo(r * 0.75, r * 0.7, r * 0.7, -r * 0.5);
      g.lineTo(r * 0.35, -r * 0.1);
      g.lineTo(0, -r * 0.65);
      g.lineTo(-r * 0.35, -r * 0.1);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.ellipse(-r * 0.25, r * 0.15, r * 0.12, r * 0.4, 0.2, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'sunflower') {
      g.fillStyle = '#ffc93c';
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI * 2) / 16;
        g.beginPath();
        g.ellipse(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, r * 0.36, r * 0.13, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#6b3d1f';
      g.beginPath();
      g.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, r * 0.16, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'bell') {
      g.fillStyle = color;
      for (const [x, y, s] of [[-0.45, 0.1, 0.5], [0.4, -0.2, 0.55], [0, 0.45, 0.45]]) {
        g.beginPath();
        g.moveTo(x * r - s * r * 0.5, y * r - s * r * 0.4);
        g.quadraticCurveTo(x * r - s * r * 0.6, y * r + s * r * 0.6, x * r - s * r * 0.75, y * r + s * r * 0.7);
        g.lineTo(x * r + s * r * 0.75, y * r + s * r * 0.7);
        g.quadraticCurveTo(x * r + s * r * 0.6, y * r + s * r * 0.6, x * r + s * r * 0.5, y * r - s * r * 0.4);
        g.closePath();
        g.fill();
      }
    } else if (kind === 'rose') {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.22)' : color;
        g.beginPath();
        g.arc(Math.cos(i * 2.3) * r * 0.08, Math.sin(i * 2.3) * r * 0.08, r * (0.75 - i * 0.17), 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(80,0,30,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      for (let a = 0; a < 12; a += 0.3) g.lineTo(Math.cos(a) * a * 1.4, Math.sin(a) * a * 1.4);
      g.stroke();
    } else {
      g.fillStyle = color;
      for (let i = 0; i < 9; i++) {
        const y = -r + i * r * 0.22;
        const w = r * (0.18 + i * 0.035);
        g.beginPath();
        g.arc(-w * 0.6, y, w * 0.55, 0, Math.PI * 2);
        g.arc(w * 0.6, y + r * 0.08, w * 0.55, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  }

  bakeLeaf() {
    const c = canvas(28, 14);
    const g = c.getContext('2d');
    g.fillStyle = '#4fb04a';
    g.beginPath();
    g.moveTo(1, 7);
    g.quadraticCurveTo(14, -3, 27, 7);
    g.quadraticCurveTo(14, 17, 1, 7);
    g.fill();
    g.strokeStyle = 'rgba(20,70,20,0.5)';
    g.beginPath();
    g.moveTo(2, 7);
    g.lineTo(25, 7);
    g.stroke();
    return c;
  }

  bakeBud() {
    const c = canvas(24, 20);
    const g = c.getContext('2d');
    g.fillStyle = '#4a3020';
    g.beginPath();
    g.ellipse(12, 17, 10, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7fd06a';
    g.beginPath();
    g.ellipse(8, 10, 5, 2.6, -0.6, 0, Math.PI * 2);
    g.ellipse(16, 10, 5, 2.6, 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillRect(11, 10, 2, 6);
    return c;
  }

  bakeGlow(size, color) {
    const S = Math.max(4, Math.ceil(size));
    const c = canvas(S, S);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.3, color.replace(',1)', ',0.45)'));
    grad.addColorStop(1, color.replace(',1)', ',0)'));
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return c;
  }

  bakePetal(color) {
    const c = canvas(16, 10);
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(8, 5, 7, 4, 0, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  // Decorations unlocked in the collection, drawn as little storybook props.
  bakeDecor(id) {
    const S = 120;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const draw = DECOR_ART[id];
    if (draw) draw(g, S);
    return c;
  }

  // ------------------------------------------------------------ effects

  /** React to session events: bursts, rings, judgement pop-ups. */
  handle(events) {
    for (const ev of events) {
      if (ev.type === 'hit' || ev.type === 'tail') {
        const lane = ev.lane;
        const p = this.popups[lane];
        p.life = 1;
        p.j = ev.judgement;
        if (ev.judgement === 'miss') continue;
        this.rings[lane] = 1;
        this.flash[lane] = 1;
        const n = this.reduced ? 0 : ev.judgement === 'perfect' ? 9 : ev.judgement === 'great' ? 6 : 3;
        this.burst(this.laneX(lane), this.hitY, n, lane);
      } else if (ev.type === 'combo') {
        this.banner.life = 1;
        this.banner.text = ev.combo >= 100 ? `${ev.combo} combo! The whole garden is dancing!` : ev.combo >= 50 ? `${ev.combo} combo! Look at them bloom!` : `${ev.combo} combo! The flowers are dancing!`;
      }
    }
  }

  burst(x, y, n, lane) {
    const st = this.lanes === 3 ? LANES_3[lane] : lane;
    for (let i = 0; i < n; i++) {
      const p = this.particles.find((q) => q.life <= 0);
      if (!p) return;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 120 + Math.random() * 220;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = p.max = 0.6 + Math.random() * 0.5;
      p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 10;
      p.sprite = i % 3 === 0 ? 4 : st;
      p.size = 0.7 + Math.random() * 0.8;
    }
  }

  /** Sparkles where a plant just opened. */
  bloomBurst(plant) {
    const pos = this.plantPos[plant.id];
    if (this.reduced || !pos) return;
    const [x, y] = pos;
    for (let i = 0; i < 6; i++) {
      const p = this.particles.find((q) => q.life <= 0);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * 60; p.vy = Math.sin(a) * 60 - 40;
      p.life = p.max = 0.9;
      p.rot = a; p.vr = 2;
      p.sprite = 4;
      p.size = 0.8;
    }
  }

  update(dt) {
    this.time += dt;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.vx *= 1 - dt * 1.5;
      p.rot += p.vr * dt;
    }
    for (let l = 0; l < 4; l++) {
      this.rings[l] = Math.max(0, this.rings[l] - dt * 3.2);
      this.flash[l] = Math.max(0, this.flash[l] - dt * 4);
      this.popups[l].life = Math.max(0, this.popups[l].life - dt * 1.6);
    }
    this.banner.life = Math.max(0, this.banner.life - dt * 0.55);
    this.comboPulse = Math.max(0, this.comboPulse - dt * 5);
  }

  // ------------------------------------------------------------ frame

  /**
   * state: { session, chart, garden, visT, beat, beatTimes(from, to, cb),
   *          down(lane), showHighway, hud, countdown, bloom, glow }
   */
  draw(state) {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const garden = state.garden;
    const bloom = garden ? garden.bloom : 0.6;
    const glow = garden ? garden.glow : 1;
    const lit = clamp(0.15 + bloom * 0.7 + (glow - 0.7) * 0.4, 0, 1);
    ctx.drawImage(this.bgDull, 0, 0, W, H);
    if (lit > 0.01) {
      ctx.globalAlpha = lit;
      ctx.drawImage(this.bgBright, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const beat = state.beat || 0;
    const pulse = this.reduced ? 0 : Math.max(0, 1 - (beat - Math.floor(beat)) * 3);
    // Sun glow breathes with the beat.
    ctx.globalAlpha = 0.35 + lit * 0.45 + pulse * 0.08;
    const sunS = this.sun.width * (1 + pulse * 0.04);
    ctx.drawImage(this.sun, W * 0.8 - sunS / 2, H * 0.26 - sunS / 2, sunS, sunS);
    ctx.globalAlpha = 1;
    this.drawDecorBack(state, lit, beat);
    this.drawPlants(garden, beat, lit);
    this.drawFireflies(lit, glow);
    this.drawDecorFront(state, lit, beat);

    const hwAlpha = state.showHighway === false ? 0 : 1;
    this.highwayAlpha += (hwAlpha - this.highwayAlpha) * 0.12;
    if (this.highwayAlpha > 0.02 && state.chart) this.drawHighway(state);
    this.drawParticles();
    if (state.hud) this.drawHud(state);
  }

  drawPlants(garden, beat, lit) {
    if (!garden) return;
    const { ctx, W, H, hwX, hwW } = this;
    const dance = this.reduced ? 0 : garden.dance;
    const leftW = hwX - 10, rightX = hwX + hwW + 10, rightW = W - rightX;
    const ground = H * 0.86;
    ctx.strokeStyle = lit > 0.5 ? '#3f9b4a' : '#2f6d3a';
    ctx.lineCap = 'round';
    for (const p of garden.plants) {
      const room = p.side < 0 ? leftW : rightW;
      const wide = room > 70;
      const bx = wide ? (p.side < 0 ? 10 + p.x * (leftW - 20) : rightX + 10 + p.x * (rightW - 20)) : (p.x * W);
      const by = wide ? ground + p.depth * (H - ground - 8) : H - 4 - p.depth * 10;
      const maxH = wide ? H * (0.07 + 0.13 * p.size) * (0.6 + p.depth * 0.6) : clamp(H - this.hitY - 50, 24, 70) * p.size;
      const pos = (this.plantPos[p.id] ||= [0, 0]);
      if (p.grow <= 0) {
        ctx.drawImage(this.bud, bx - 12, by - 18);
        pos[0] = bx; pos[1] = by - 10;
        continue;
      }
      const g = easeOutBack(p.grow);
      const h = maxH * g;
      const sway = dance * 0.22 * Math.sin(beat * Math.PI + p.phase) + (this.reduced ? 0 : 0.03 * Math.sin(this.time * 1.3 + p.phase));
      const hx = bx + sway * h;
      const hy = by - h;
      pos[0] = hx; pos[1] = hy;
      ctx.lineWidth = wide ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + sway * h * 0.2, by - h * 0.55, hx, hy);
      ctx.stroke();
      const ly = by - h * 0.4;
      const lx = bx + sway * h * 0.15;
      const lw = (wide ? 34 : 22) * g, lh = lw / 2;
      ctx.drawImage(this.leaf, lx, ly - lh / 2, lw, lh);
      ctx.save();
      ctx.translate(lx, ly + lh * 0.8);
      ctx.scale(-1, 1);
      ctx.drawImage(this.leaf, 0, -lh / 2, lw, lh);
      ctx.restore();
      const bob = 1 + dance * 0.1 * Math.max(0, Math.cos(beat * Math.PI * 2));
      const s = (wide ? 92 : 40) * p.size * (0.35 + 0.65 * g) * bob;
      const kind = ['daisy', 'tulip', 'sunflower', 'bell', 'rose', 'lupin'].indexOf(p.kind);
      ctx.drawImage(this.flowers[p.hue][kind], hx - s / 2, hy - s / 2, s, s);
    }
  }

  drawFireflies(lit, glow) {
    const { ctx, W, H } = this;
    const n = Math.round(clamp(lit * glow, 0, 1) * 28);
    const t = this.time;
    for (let i = 0; i < n; i++) {
      const sx = (Math.sin(i * 91.7) * 0.5 + 0.5);
      const sy = (Math.sin(i * 37.3) * 0.5 + 0.5);
      const x = sx * W + (this.reduced ? 0 : Math.sin(t * 0.6 + i) * 30);
      const y = H * (0.45 + sy * 0.4) + (this.reduced ? 0 : Math.cos(t * 0.8 + i * 1.7) * 18);
      ctx.globalAlpha = this.reduced ? 0.6 : 0.35 + 0.35 * Math.sin(t * 3 + i * 2.1) ** 2;
      ctx.drawImage(this.glowDot, x - 12, y - 12);
    }
    ctx.globalAlpha = 1;
  }

  // Sky-level decorations (behind the plants).
  drawDecorBack(state, lit, beat) {
    const { ctx, W, H } = this;
    if (this.decor.includes('rainbow') && this.decorSprites.rainbow) {
      ctx.globalAlpha = 0.25 + lit * 0.5;
      const w = Math.min(W * 0.7, 700);
      ctx.drawImage(this.decorSprites.rainbow, W * 0.5 - w / 2, H * 0.3 - w * 0.25, w, w * 0.5);
      ctx.globalAlpha = 1;
    }
    if (this.decor.includes('fairy-lights')) {
      const y0 = H * 0.08;
      ctx.strokeStyle = 'rgba(40,30,50,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 3) * 14 + 14);
      ctx.stroke();
      const on = Math.floor(beat);
      for (let i = 0, x = 10; x < W; x += 36, i++) {
        const y = y0 + Math.sin((x / W) * Math.PI * 3) * 14 + 18;
        ctx.globalAlpha = this.reduced ? 0.8 : (i + on) % 3 === 0 ? 1 : 0.5;
        ctx.drawImage(this.glowDot, x - 9, y - 9, 18, 18);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Ground decorations (gnome, birdhouse ...), each in its own slot on the
  // far sides of the bed: [side, position across that side, height above ground].
  drawDecorFront(state, lit, beat) {
    const { ctx, W, H, hwX, hwW } = this;
    const leftW = hwX, rightW = W - (hwX + hwW);
    const wide = Math.min(leftW, rightW) > 110;
    const zone = Math.min(leftW, rightW);
    const size = wide ? clamp(zone * 0.24, 56, 120) : 36;
    const bob = this.reduced ? 0 : Math.sin(beat * Math.PI) * 0.06;
    const dance = state.garden ? state.garden.dance : 0.3;
    for (const id of this.decor) {
      const slot = DECOR_SLOTS[id];
      const spr = this.decorSprites[id];
      if (!slot || !spr) continue;
      const [side, f, lift] = slot;
      let x, y;
      const s = size * (id === 'butterflies' ? 0.8 : id === 'wind-chimes' ? 1.25 : id === 'windmill' ? 1.3 : 1);
      if (wide) {
        x = side < 0 ? 8 + f * (leftW - 16 - s) : hwX + hwW + 8 + f * (rightW - 16 - s);
        y = H * 0.885;
      } else {
        x = side < 0 ? f * (W / 2 - s) : W / 2 + f * (W / 2 - s);
        y = H - 4;
      }
      y -= lift * s + (id === 'butterflies' && !this.reduced ? Math.sin(this.time * 1.4) * s * 0.15 : 0);
      ctx.save();
      ctx.translate(x + s / 2, y);
      if (id === 'scarecrow' || id === 'gnome') ctx.rotate(bob * dance);
      if (id === 'butterflies' && !this.reduced) ctx.scale(1, 0.85 + 0.15 * Math.sin(this.time * 12));
      ctx.drawImage(spr, -s / 2, -s, s, s);
      ctx.restore();
    }
  }

  drawHighway(state) {
    const { ctx, H, hwX, hitY, laneW, noteSize } = this;
    const session = state.session;
    const visT = state.visT;
    const pps = (hitY - this.topY) / this.approach;
    ctx.globalAlpha = this.highwayAlpha;
    ctx.drawImage(this.highway, hwX - this.highway.pad, 0);
    // Beat lines: thicker on each bar.
    const from = visT - (H - hitY) / pps, to = visT + this.approach + 0.1;
    if (state.beatTimes) {
      state.beatTimes(from, to, (t, isBar) => {
        const y = hitY - (t - visT) * pps;
        ctx.fillStyle = isBar ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(hwX + 4, y - (isBar ? 1.5 : 0.5), this.hwW - 8, isBar ? 3 : 1);
      });
    }
    for (let l = 0; l < this.lanes; l++) {
      const down = state.down ? state.down(l) : false;
      const f = Math.max(this.flash[l], down ? 0.45 : 0);
      if (f > 0.02) {
        ctx.globalAlpha = this.highwayAlpha * f * 0.8;
        const beam = this.beams[l];
        ctx.drawImage(beam, hwX + l * laneW, hitY - beam.height + laneW * 0.3);
      }
      ctx.globalAlpha = this.highwayAlpha;
      const rec = this.receptors[l][down ? 1 : 0];
      const s = noteSize * (down ? 1.08 : 1);
      ctx.drawImage(rec, this.laneX(l) - s / 2, hitY - s / 2, s, s);
    }
    if (session) this.drawNotes(session, visT, pps);
    // Hit rings and judgement words.
    for (let l = 0; l < this.lanes; l++) {
      const r = this.rings[l];
      if (r > 0) {
        const st = laneStyle(this.lanes, l);
        ctx.globalAlpha = this.highwayAlpha * r;
        ctx.strokeStyle = st.light;
        ctx.lineWidth = 4 * r + 1;
        ctx.beginPath();
        ctx.arc(this.laneX(l), hitY, this.noteR * (this.reduced ? 1.2 : 1.1 + (1 - r) * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      }
      const p = this.popups[l];
      if (p.life > 0) {
        const spr = this.judge[p.j];
        const k = this.reduced ? 1 : 1 + 0.35 * Math.max(0, p.life - 0.75) * 4;
        ctx.globalAlpha = this.highwayAlpha * Math.min(1, p.life * 2.2);
        const y = hitY - laneW * 0.95 - (this.reduced ? 0 : (1 - p.life) * 16);
        const w = spr.width * k, h = spr.height * k;
        const px = clamp(this.laneX(l), w / 2 + 2, this.W - w / 2 - 2);
        ctx.drawImage(spr, px - w / 2, y - h / 2, w, h);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawNotes(session, visT, pps) {
    const { ctx, hitY, noteSize: S, H } = this;
    const bottom = H + S;
    const notes = session.notes;
    const horizon = visT + this.approach + 0.2;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > horizon) break;
      const endT = n.end ?? n.t;
      const yEnd = hitY - (endT - visT) * pps;
      if (yEnd > bottom) continue;
      const missed = n.head === 'miss';
      if (n.kind === 'tap') {
        if (n.head && !missed) continue;
        const y = hitY - (n.t - visT) * pps;
        if (missed) ctx.globalAlpha = 0.35 * this.highwayAlpha;
        ctx.drawImage(missed ? this.ghost : this.notes[n.lane], this.laneX(n.lane) - S / 2, y - S / 2);
        ctx.globalAlpha = this.highwayAlpha;
        continue;
      }
      if (n.tail) continue;
      const holding = session.holding(n);
      const broken = missed || (n.head && !holding && n.releasedAt !== null);
      const progress = holding ? clamp((visT - n.t) / (endT - n.t), 0, 1) : 0;
      const headY = holding ? hitY : hitY - (n.t - visT) * pps;
      const st = laneStyle(this.lanes, n.lane);
      const x0 = this.laneX(n.lane);
      const x1 = n.kind === 'slide' ? this.laneX(n.slideTo) : x0;
      const hx = x0 + (x1 - x0) * progress;
      ctx.globalAlpha = this.highwayAlpha * (broken ? 0.35 : 1);
      // The vine: a thick stroke from head to tail, brighter while held.
      ctx.lineCap = 'round';
      ctx.strokeStyle = broken ? '#7c7890' : 'rgba(20,10,30,0.55)';
      ctx.lineWidth = this.noteR * 0.95;
      ctx.beginPath();
      ctx.moveTo(hx, headY);
      ctx.lineTo(x1, yEnd);
      ctx.stroke();
      ctx.strokeStyle = broken ? '#a9a5bb' : holding ? st.light : st.color;
      ctx.lineWidth = this.noteR * 0.62;
      ctx.stroke();
      if (!broken) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Tail cap (the target shape for slides) and the head.
      if (n.kind === 'slide') {
        const ts = S * 0.8;
        ctx.drawImage(broken ? this.ghost : this.notes[n.slideTo], x1 - ts / 2, yEnd - ts / 2, ts, ts);
      } else {
        ctx.fillStyle = broken ? '#a9a5bb' : st.light;
        ctx.beginPath();
        ctx.arc(x1, yEnd, this.noteR * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const headSpr = broken ? this.ghost : this.notes[holding && n.kind === 'slide' && progress > 0.5 ? n.slideTo : n.lane];
      const hs = holding ? S * (1.05 + (this.reduced ? 0 : 0.05 * Math.sin(this.time * 20))) : S;
      ctx.drawImage(headSpr, hx - hs / 2, headY - hs / 2, hs, hs);
      ctx.globalAlpha = this.highwayAlpha;
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      const spr = this.petal[p.sprite];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(spr, -8 * p.size, -5 * p.size, 16 * p.size, 10 * p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawHud(state) {
    const { ctx, W, H } = this;
    const hud = state.hud;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const big = W < 520 ? 22 : 28;
    ctx.font = `800 ${big}px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,10,40,0.7)';
    ctx.fillStyle = '#fffbe8';
    ctx.strokeText(hud.scoreText, 16, 14);
    ctx.fillText(hud.scoreText, 16, 14);
    ctx.font = `700 ${W < 520 ? 13 : 15}px ${FONT}`;
    ctx.fillStyle = '#ffe6f4';
    ctx.strokeText(hud.title, 16, 16 + big);
    ctx.fillText(hud.title, 16, 16 + big);
    ctx.textAlign = 'right';
    ctx.font = `800 ${big}px ${FONT}`;
    ctx.fillStyle = '#d9ffd6';
    const rx = W - (W < 520 ? 66 : 76);
    ctx.strokeText(hud.accText, rx, 14);
    ctx.fillText(hud.accText, rx, 14);
    if (hud.badge) {
      ctx.font = `700 ${W < 520 ? 13 : 15}px ${FONT}`;
      ctx.fillStyle = '#fff3b0';
      ctx.strokeText(hud.badge, rx, 16 + big);
      ctx.fillText(hud.badge, rx, 16 + big);
    }
    // Garden health, when fail is on.
    if (hud.health !== null) {
      const w = Math.min(160, W * 0.3);
      ctx.fillStyle = 'rgba(20,10,40,0.6)';
      ctx.beginPath();
      ctx.roundRect(16, 22 + big + 20, w, 10, 5);
      ctx.fill();
      ctx.fillStyle = hud.health > 0.3 ? '#7be07a' : '#ff8a6b';
      ctx.beginPath();
      ctx.roundRect(16, 22 + big + 20, Math.max(6, w * hud.health), 10, 5);
      ctx.fill();
    }
    // Song progress along the bottom edge.
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, H - 5, W, 5);
    ctx.fillStyle = '#ffd36b';
    ctx.fillRect(0, H - 5, W * clamp(hud.progress, 0, 1), 5);

    // Combo in the middle of the lanes.
    const combo = hud.combo;
    if (combo !== this.comboValue) {
      if (combo > this.comboValue && combo >= 5) this.comboPulse = 1;
      this.comboValue = combo;
      this.comboText = String(combo);
    }
    if (combo >= 5 && !hud.countdown) {
      const cx = this.hwX + this.hwW / 2, cy = H * 0.3;
      const k = 1 + (this.reduced ? 0 : this.comboPulse * 0.12);
      const size = Math.round(clamp(this.laneW * 0.62, 36, 72) * k);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.lineWidth = 8;
      ctx.globalAlpha = 0.92 * this.highwayAlpha;
      ctx.strokeStyle = 'rgba(30,10,50,0.75)';
      ctx.strokeText(this.comboText, cx, cy);
      ctx.fillStyle = combo >= 50 ? '#ffe36b' : '#ffffff';
      ctx.fillText(this.comboText, cx, cy);
      ctx.font = `800 ${Math.round(size * 0.3)}px ${FONT}`;
      ctx.lineWidth = 5;
      ctx.strokeText('COMBO', cx, cy + size * 0.62);
      ctx.fillStyle = '#ffd1ea';
      ctx.fillText('COMBO', cx, cy + size * 0.62);
      ctx.globalAlpha = 1;
    }
    if (this.banner.life > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${W < 520 ? 16 : 22}px ${FONT}`;
      ctx.globalAlpha = Math.min(1, this.banner.life * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(30,10,50,0.8)';
      const y = H * 0.3 - 70;
      ctx.strokeText(this.banner.text, W / 2, y);
      ctx.fillStyle = '#fff3b0';
      ctx.fillText(this.banner.text, W / 2, y);
      ctx.globalAlpha = 1;
    }
    if (hud.countdown) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = Math.round(clamp(W * 0.16, 70, 150));
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(30,10,50,0.8)';
      ctx.fillStyle = '#fff6c8';
      const cx = this.hwX + this.hwW / 2;
      ctx.strokeText(hud.countdown, cx, H * 0.42);
      ctx.fillText(hud.countdown, cx, H * 0.42);
    }
    if (hud.hint) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${W < 520 ? 15 : 19}px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(30,10,50,0.8)';
      ctx.fillStyle = '#ffffff';
      const y = this.hitY + Math.min(70, (H - this.hitY) * 0.55);
      ctx.strokeText(hud.hint, W / 2, y);
      ctx.fillText(hud.hint, W / 2, y);
    }
  }
}

// ------------------------------------------------------------ decoration art

const DECOR_SLOTS = {
  gnome: [-1, 0.02, 0],
  'watering-can': [-1, 0.26, 0],
  mushrooms: [-1, 0.5, 0],
  scarecrow: [-1, 0.74, 0.05],
  beehive: [-1, 0.98, 0.1],
  birdhouse: [1, 0.02, 0.05],
  pond: [1, 0.27, -0.05],
  butterflies: [1, 0.45, 1.1],
  windmill: [1, 0.68, 0.05],
  'wind-chimes': [1, 0.98, 0],
};

const DECOR_ART = {
  gnome(g, S) {
    g.fillStyle = '#3b7dd8'; // body
    g.beginPath(); g.ellipse(S / 2, S * 0.78, S * 0.2, S * 0.18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff3e0'; // beard
    g.beginPath(); g.moveTo(S * 0.36, S * 0.52); g.quadraticCurveTo(S / 2, S * 0.9, S * 0.64, S * 0.52); g.fill();
    g.fillStyle = '#ffcfa8'; // face
    g.beginPath(); g.arc(S / 2, S * 0.5, S * 0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8384f'; // hat
    g.beginPath(); g.moveTo(S * 0.33, S * 0.47); g.lineTo(S * 0.52, S * 0.08); g.lineTo(S * 0.67, S * 0.47); g.closePath(); g.fill();
    g.fillStyle = '#ff9aa8';
    g.beginPath(); g.arc(S / 2, S * 0.53, S * 0.035, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a2a14';
    g.fillRect(S * 0.36, S * 0.92, S * 0.1, S * 0.05); g.fillRect(S * 0.54, S * 0.92, S * 0.1, S * 0.05);
  },
  'watering-can'(g, S) {
    g.fillStyle = '#4fb3a8';
    g.beginPath(); g.roundRect(S * 0.25, S * 0.5, S * 0.42, S * 0.42, 8); g.fill();
    g.strokeStyle = '#4fb3a8'; g.lineWidth = S * 0.06;
    g.beginPath(); g.moveTo(S * 0.66, S * 0.8); g.lineTo(S * 0.88, S * 0.5); g.stroke();
    g.beginPath(); g.arc(S * 0.46, S * 0.5, S * 0.15, Math.PI, 0); g.stroke();
    g.fillStyle = '#86e0d4'; g.beginPath(); g.arc(S * 0.89, S * 0.48, S * 0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(S * 0.3, S * 0.56, S * 0.06, S * 0.3);
  },
  'wind-chimes'(g, S) {
    // A shepherd's hook with the chimes hanging from it.
    g.strokeStyle = '#4a4a5a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(S * 0.18, S); g.lineTo(S * 0.18, S * 0.12); g.quadraticCurveTo(S * 0.18, S * 0.04, S * 0.32, S * 0.06); g.lineTo(S * 0.5, S * 0.08); g.stroke();
    g.strokeStyle = '#8a6a4a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(S * 0.3, S * 0.2); g.lineTo(S * 0.78, S * 0.2); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#ddd';
    g.beginPath(); g.moveTo(S * 0.5, S * 0.08); g.lineTo(S * 0.5, S * 0.2); g.stroke();
    [0.36, 0.48, 0.6, 0.72].forEach((x, i) => {
      g.beginPath(); g.moveTo(S * x, S * 0.2); g.lineTo(S * x, S * (0.32 + i * 0.04)); g.stroke();
      g.fillStyle = ['#ffd23f', '#6fd3e8', '#ff7eb6', '#b18cff'][i];
      g.beginPath(); g.roundRect(S * x - 4, S * (0.32 + i * 0.04), 8, S * (0.26 + (i % 2) * 0.1), 4); g.fill();
    });
  },
  'fairy-lights'(g, S) {
    g.strokeStyle = '#2a1f3a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(S * 0.05, S * 0.3); g.quadraticCurveTo(S * 0.5, S * 0.75, S * 0.95, S * 0.3); g.stroke();
    ['#fff3a0', '#ffb3d9', '#b8f0ff', '#fff3a0', '#ffb3d9'].forEach((c, i) => {
      const t = (i + 0.5) / 5;
      const x = S * (0.05 + 0.9 * t), y = S * (0.3 + 0.45 * 4 * t * (1 - t) * 0.5) + 6;
      const halo = g.createRadialGradient(x, y, 0, x, y, S * 0.12);
      halo.addColorStop(0, c); halo.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = halo; g.fillRect(x - S * 0.12, y - S * 0.12, S * 0.24, S * 0.24);
      g.fillStyle = c; g.beginPath(); g.arc(x, y, S * 0.04, 0, Math.PI * 2); g.fill();
    });
  },
  birdhouse(g, S) {
    g.fillStyle = '#8a5a34'; g.fillRect(S * 0.46, S * 0.55, S * 0.08, S * 0.45);
    g.fillStyle = '#ffb35c'; g.fillRect(S * 0.3, S * 0.3, S * 0.4, S * 0.3);
    g.fillStyle = '#d0453a'; g.beginPath(); g.moveTo(S * 0.24, S * 0.32); g.lineTo(S / 2, S * 0.1); g.lineTo(S * 0.76, S * 0.32); g.closePath(); g.fill();
    g.fillStyle = '#3a2416'; g.beginPath(); g.arc(S / 2, S * 0.43, S * 0.06, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5ab4ff'; g.beginPath(); g.ellipse(S * 0.68, S * 0.25, S * 0.07, S * 0.05, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(S * 0.74, S * 0.24); g.lineTo(S * 0.79, S * 0.25); g.lineTo(S * 0.74, S * 0.27); g.fill();
  },
  mushrooms(g, S) {
    [[0.3, 0.75, 0.16], [0.62, 0.8, 0.12], [0.48, 0.66, 0.2]].forEach(([x, y, r]) => {
      g.fillStyle = '#fff3e0'; g.fillRect(S * x - S * r * 0.3, S * y, S * r * 0.6, S * (1 - y) - 4);
      g.fillStyle = '#e8384f'; g.beginPath(); g.arc(S * x, S * y + 2, S * r, Math.PI, 0); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(S * x - S * r * 0.4, S * y - S * r * 0.3, S * r * 0.15, 0, Math.PI * 2); g.arc(S * x + S * r * 0.35, S * y - S * r * 0.45, S * r * 0.12, 0, Math.PI * 2); g.fill();
    });
  },
  beehive(g, S) {
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S * 0.2); g.stroke();
    ['#ffcf4a', '#f0b432', '#ffcf4a', '#f0b432'].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath(); g.ellipse(S / 2, S * (0.3 + i * 0.13), S * (0.16 + i * 0.05), S * 0.08, 0, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = '#3a2416'; g.beginPath(); g.arc(S / 2, S * 0.62, S * 0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.ellipse(S * 0.8, S * 0.3, S * 0.05, S * 0.035, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23f'; g.fillRect(S * 0.78, S * 0.27, S * 0.015, S * 0.06);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(S * 0.8, S * 0.25, S * 0.04, S * 0.02, -0.5, 0, Math.PI * 2); g.fill();
  },
  rainbow(g, S) {
    ['#ff5e5e', '#ff9f43', '#ffd23f', '#5ee6a8', '#4fd1ff', '#b18cff'].forEach((c, i) => {
      g.strokeStyle = c; g.lineWidth = S * 0.045;
      g.beginPath(); g.arc(S / 2, S * 0.98, S * (0.46 - i * 0.045), Math.PI, 0); g.stroke();
    });
  },
  scarecrow(g, S) {
    g.fillStyle = '#8a5a34'; g.fillRect(S * 0.47, S * 0.3, S * 0.06, S * 0.7); g.fillRect(S * 0.2, S * 0.42, S * 0.6, S * 0.05);
    g.fillStyle = '#5a8ad8'; g.fillRect(S * 0.36, S * 0.4, S * 0.28, S * 0.28);
    g.fillStyle = '#ffcf4a'; g.fillRect(S * 0.18, S * 0.44, S * 0.06, S * 0.08); g.fillRect(S * 0.76, S * 0.44, S * 0.06, S * 0.08);
    g.fillStyle = '#f3e1b0'; g.beginPath(); g.arc(S / 2, S * 0.3, S * 0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(S / 2, S * 0.21, S * 0.18, S * 0.04, 0, 0, Math.PI * 2); g.fill(); g.fillRect(S * 0.42, S * 0.1, S * 0.16, S * 0.1);
    g.fillStyle = '#3a2416'; g.fillRect(S * 0.45, S * 0.28, S * 0.025, S * 0.025); g.fillRect(S * 0.53, S * 0.28, S * 0.025, S * 0.025);
    g.strokeStyle = '#3a2416'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S * 0.32, S * 0.04, 0.2, Math.PI - 0.2); g.stroke();
  },
  windmill(g, S) {
    g.fillStyle = '#f4e9d8'; g.beginPath(); g.moveTo(S * 0.38, S); g.lineTo(S * 0.44, S * 0.38); g.lineTo(S * 0.56, S * 0.38); g.lineTo(S * 0.62, S); g.fill();
    g.fillStyle = '#d0453a'; g.beginPath(); g.moveTo(S * 0.4, S * 0.4); g.lineTo(S / 2, S * 0.28); g.lineTo(S * 0.6, S * 0.4); g.fill();
    g.fillStyle = '#8a6a4a';
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(S / 2, S * 0.36); g.rotate(i * Math.PI / 2 + 0.4);
      g.fillRect(-S * 0.03, -S * 0.34, S * 0.06, S * 0.3); g.fillStyle = '#fff'; g.fillRect(-S * 0.025, -S * 0.32, S * 0.05, S * 0.12); g.fillStyle = '#8a6a4a';
      g.restore();
    }
  },
  pond(g, S) {
    g.fillStyle = '#3e8fd0'; g.beginPath(); g.ellipse(S / 2, S * 0.85, S * 0.46, S * 0.13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.ellipse(S * 0.4, S * 0.82, S * 0.2, S * 0.03, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4fb04a'; g.beginPath(); g.arc(S * 0.66, S * 0.86, S * 0.08, 0.3, Math.PI * 2 - 0.3); g.lineTo(S * 0.66, S * 0.86); g.fill();
    g.fillStyle = '#ff9ac8'; g.beginPath(); g.arc(S * 0.66, S * 0.82, S * 0.035, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5ac05a'; g.beginPath(); g.ellipse(S * 0.32, S * 0.8, S * 0.07, S * 0.05, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(S * 0.3, S * 0.77, S * 0.018, 0, Math.PI * 2); g.arc(S * 0.35, S * 0.77, S * 0.018, 0, Math.PI * 2); g.fill();
  },
  butterflies(g, S) {
    [[0.3, 0.4, '#ff7eb6'], [0.68, 0.6, '#ffd23f'], [0.5, 0.2, '#6fd3e8']].forEach(([x, y, c]) => {
      g.fillStyle = c;
      g.beginPath(); g.ellipse(S * x - 7, S * y, 8, 11, -0.4, 0, Math.PI * 2); g.ellipse(S * x + 7, S * y, 8, 11, 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a1a30'; g.fillRect(S * x - 1.5, S * y - 9, 3, 18);
    });
  },
};
