// Everything you see. The world is drawn at 320×180 logical pixels in chunky
// pixel art, then scaled up crisply; the CRT glow and "2600 mode" are
// post-effects on top. Rendering only reads world state.
//
// Performance: terrain, skies and parallax strips are baked once per stage
// into offscreen canvases; per frame we draw a few hundred small rects, no
// gradients, filters or shadows.

import { THEMES, FONT, GLYPH_W, GLYPH_H, lighten, retroColor, textWidth } from './palette.js';
import { VIEW_W, VIEW_H, crocPhase, moverOffset, shotBox } from './world.js';
import { vineEnd } from './physics.js';
import { TILE } from './tiles.js';
import { WEAPONS } from './weapons.js';

const MAX_PARTICLES = 260;
const PLAYER_COLORS = [
  { band: '#e8302a', shirt: '#e8d8a8', shade: '#bca878', pants: '#4a6a3a', boot: '#5a3418', hair: '#4a2a14' },
  { band: '#2a8ae8', shirt: '#a8e0e8', shade: '#78b4bc', pants: '#5a4a8a', boot: '#2a2a44', hair: '#1a1a1a' },
];
const POD_COLORS = { spread: '#ff4a3a', laser: '#3ac8ff', rapid: '#ffd23a', flame: '#ff8a1a', bomb: '#c8c8d8', heart: '#ff5aa8' };
const POD_LETTER = { spread: 'S', laser: 'L', rapid: 'R', flame: 'F', bomb: 'B', heart: '<' };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Cheap deterministic hash for speckles and variation.
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.low = makeCanvas(VIEW_W, VIEW_H);
    this.g = this.low.getContext('2d');
    this.half = makeCanvas(VIEW_W / 2, VIEW_H);
    this.bloomA = makeCanvas(VIEW_W / 2, VIEW_H / 2);
    this.bloomB = makeCanvas(VIEW_W / 4, VIEW_H / 4);
    this.reduced = reducedMotion;
    this.settings = { crt: true, retro: false, shake: true };
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.frameCount = 0;
    this.time = 0;
    this.banner = null;
    this.textCache = new Map();
    this.world = null;
    this.theme = THEMES.jungle;
    this.scale = 1;
    this.glow = {};
    this.resize();
  }

  // ----------------------------------------------------------- settings

  setSettings(settings) {
    const retroChanged = settings.retro !== this.settings.retro;
    this.settings = { ...this.settings, ...settings };
    if (retroChanged && this.world) this.bake(this.world);
    this.textCache.clear();
  }

  c(hex) {
    return this.settings.retro ? retroColor(hex) : hex;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const want = Math.max(1, (rect.width || VIEW_W) * dpr);
    // An integer multiple of the logical size keeps every pixel the same size.
    const k = Math.max(1, Math.min(6, Math.round(want / VIEW_W)));
    this.scale = k;
    if (this.canvas.width !== VIEW_W * k) {
      this.canvas.width = VIEW_W * k;
      this.canvas.height = VIEW_H * k;
    }
    this.ctx.imageSmoothingEnabled = false;
  }

  // -------------------------------------------------------------- baking

  setWorld(world) {
    this.world = world;
    this.theme = THEMES[world.level.id] || THEMES.jungle;
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.bake(world);
  }

  bake(world) {
    const t = this.theme;
    this.bakeGlows();
    this.skyCanvas = this.bakeSky(t);
    this.farCanvas = this.bakeFar(t, world.level.id);
    this.midCanvas = this.bakeMid(t, world.level.id);
    this.terrain = this.bakeTerrain(world, t);
  }

  bakeGlows() {
    const make = (color, size) => {
      const cv = makeCanvas(size, size);
      const g = cv.getContext('2d');
      const r = size / 2;
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      return cv;
    };
    const c = (hex) => this.c(hex);
    this.glow = {
      yellow: make(c('#ffe66a') + 'aa', 12),
      red: make(c('#ff4a6a') + 'aa', 14),
      orange: make(c('#ff9a2a') + 'cc', 20),
      blue: make(c('#5ad8ff') + 'aa', 14),
      white: make('rgba(255,255,255,0.8)', 32),
      green: make(c('#7aff6a') + 'aa', 16),
      big: make(c('#ffd27a') + 'cc', 48),
    };
  }

  bakeSky(t) {
    const cv = makeCanvas(VIEW_W, VIEW_H);
    const g = cv.getContext('2d');
    const bands = t.sky;
    const bandH = this.settings.retro ? 8 : 4;
    // Horizontal colour bands, the 2600's signature: dither between steps.
    for (let y = 0; y < VIEW_H; y += bandH) {
      const k = Math.min(bands.length - 1, (y / VIEW_H) * bands.length * 1.15);
      const i = Math.floor(k);
      const next = Math.min(bands.length - 1, i + 1);
      const mix = k - i;
      g.fillStyle = this.c(mix > 0.5 && (y / bandH) % 2 === 0 ? bands[next] : bands[i]);
      g.fillRect(0, y, VIEW_W, bandH);
    }
    const id = this.world ? this.world.level.id : 'jungle';
    if (id === 'alien' || id === 'caves') {
      for (let i = 0; i < 70; i += 1) {
        const x = Math.floor(hash(i, 3) * VIEW_W);
        const y = Math.floor(hash(i, 7) * VIEW_H * 0.7);
        g.fillStyle = this.c(i % 5 === 0 ? (id === 'caves' ? '#5a4a80' : '#ffffff') : id === 'alien' ? '#9a8ad8' : '#3a3058');
        g.fillRect(x, y, 1, 1);
      }
    }
    if (t.volcano) {
      g.fillStyle = this.c('#ffb04a');
      g.fillRect(250, 30, 8, 8);
    } else if (t.temple) {
      g.fillStyle = this.c('#ffe07a');
      for (let r = 0; r < 12; r += 1) {
        const w = Math.round(Math.sqrt(144 - (r - 6) * (r - 6) * 4) || 0);
        g.fillRect(240 - w, 96 + r, w * 2, 1);
      }
    } else if (id !== 'alien' && id !== 'caves') {
      g.fillStyle = this.c('#fff2b0');
      g.fillRect(262, 22, 10, 10);
      g.fillRect(260, 24, 14, 6);
    }
    return cv;
  }

  bakeFar(t, id) {
    const W = 640;
    const cv = makeCanvas(W, VIEW_H);
    const g = cv.getContext('2d');
    const fill = (hex) => { g.fillStyle = this.c(hex); };
    for (let x = 0; x < W; x += 2) {
      let h;
      if (id === 'volcano') {
        const d = Math.abs(((x + 160) % 640) - 320);
        h = Math.max(30, 120 - d * 0.55) + Math.sin(x * 0.07) * 4;
      } else if (id === 'alien') {
        h = 40 + (Math.floor(x / 24) % 5) * 14 + (hash(Math.floor(x / 24), 9) > 0.7 ? 30 : 0);
      } else if (id === 'caves') {
        h = 30 + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.11) * 5;
      } else if (id === 'temple') {
        const step = Math.floor(((x % 320) - 100) / 10);
        h = x % 320 > 100 && x % 320 < 220 ? 90 - Math.abs(step - 6) * 9 : 34 + Math.sin(x * 0.03) * 8;
      } else {
        h = 46 + Math.sin(x * 0.018) * 16 + Math.sin(x * 0.051) * 7;
      }
      fill(t.far);
      g.fillRect(x, VIEW_H - 20 - h, 2, h + 20);
      fill(t.farHi);
      g.fillRect(x, VIEW_H - 20 - h, 2, 2);
    }
    if (id === 'caves') {
      // Stalactites hanging from the cave roof.
      fill(t.far);
      for (let x = 0; x < W; x += 12) {
        const len = 10 + hash(x, 5) * 34;
        for (let y = 0; y < len; y += 2) g.fillRect(x + Math.floor(y / len * 4), y, Math.max(1, 6 - Math.floor(y / len * 6)), 2);
      }
    }
    if (id === 'volcano') {
      fill('#ff6a1a');
      g.fillRect(156, VIEW_H - 140, 8, 6);
      g.fillRect(476, VIEW_H - 140, 8, 6);
    }
    if (id === 'alien') {
      for (let i = 0; i < 40; i += 1) {
        fill(i % 3 ? '#ff4cf0' : '#4cf0ff');
        g.fillRect(Math.floor(hash(i, 11) * W), VIEW_H - 30 - Math.floor(hash(i, 13) * 70), 2, 1);
      }
    }
    if (t.river) {
      fill('#3a8ad0');
      g.fillRect(0, VIEW_H - 26, W, 6);
      fill('#7ac0ee');
      for (let x = 0; x < W; x += 16) g.fillRect(x + (x % 32 ? 4 : 0), VIEW_H - 25, 6, 1);
    }
    return cv;
  }

  bakeMid(t, id) {
    const W = 640;
    const cv = makeCanvas(W, VIEW_H);
    const g = cv.getContext('2d');
    const fill = (hex) => { g.fillStyle = this.c(hex); };
    if (id === 'jungle' || id === 'river') {
      // The canopy band and the straight trunks of a 2600 jungle.
      for (let x = 0; x < W; x += 80) {
        const tx = x + 20 + Math.floor(hash(x, 1) * 30);
        fill(t.trunk);
        g.fillRect(tx, 20, 8, VIEW_H);
        fill(t.trunkHi);
        g.fillRect(tx + 1, 20, 2, VIEW_H);
        g.fillRect(tx + 5, 60, 1, 30);
      }
      for (let x = 0; x < W; x += 2) {
        const h = 22 + Math.sin(x * 0.09) * 5 + Math.sin(x * 0.23) * 3;
        fill(t.canopy[0]);
        g.fillRect(x, 0, 2, h + 4);
        fill(t.canopy[1]);
        g.fillRect(x, 0, 2, h);
        fill(t.canopy[2]);
        if ((x / 2) % 3 !== 0) g.fillRect(x, Math.floor(h * 0.5), 2, 2);
      }
      fill(t.canopy[0]);
      for (let x = 6; x < W; x += 22) g.fillRect(x, 24 + Math.floor(hash(x, 4) * 6), 2, 6 + Math.floor(hash(x, 8) * 10));
    } else if (id === 'caves') {
      for (let x = 0; x < W; x += 50) {
        const cx = x + Math.floor(hash(x, 2) * 30);
        const h = 20 + Math.floor(hash(x, 3) * 30);
        fill(t.trunk);
        for (let y = 0; y < h; y += 2) g.fillRect(cx - Math.floor((h - y) / 6), VIEW_H - 20 - y, Math.max(2, Math.floor((h - y) / 3)), 2);
        fill('#4de0ff');
        g.fillRect(cx, VIEW_H - 24 - h, 2, 4);
        g.fillRect(cx + 6, VIEW_H - 28, 2, 6);
      }
    } else if (id === 'temple') {
      for (let x = 0; x < W; x += 64) {
        fill(t.trunk);
        g.fillRect(x + 10, 40, 14, VIEW_H);
        fill(t.trunkHi);
        g.fillRect(x + 10, 40, 14, 4);
        g.fillRect(x + 8, 36, 18, 4);
        g.fillRect(x + 12, 46, 2, VIEW_H);
      }
      fill(t.canopy[1]);
      for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 3, 8 + Math.floor(hash(x, 6) * 10));
    } else if (id === 'volcano') {
      for (let x = 0; x < W; x += 40) {
        const h = 30 + Math.floor(hash(x, 5) * 40);
        fill(t.trunk);
        g.fillRect(x + 6, VIEW_H - 20 - h, 10, h + 20);
        fill('#ff6a1a');
        g.fillRect(x + 10, VIEW_H - 20 - h + 6, 2, h - 6);
      }
    } else if (id === 'alien') {
      for (let x = 0; x < W; x += 48) {
        fill(t.trunk);
        g.fillRect(x + 4, 18, 6, VIEW_H);
        g.fillRect(x, 18, 48, 4);
        fill(t.trunkHi);
        g.fillRect(x + 5, 18, 1, VIEW_H);
        fill('#ff4cf0');
        g.fillRect(x + 20, 19, 6, 2);
      }
    }
    return cv;
  }

  bakeTerrain(world, t) {
    const cv = makeCanvas(world.width, world.height);
    const g = cv.getContext('2d');
    const fill = (hex) => { g.fillStyle = this.c(hex); };
    const tileAt = (c, r) => world.tileAt(c, r);
    const id = world.level.id;
    for (let r = 0; r < world.rows; r += 1) {
      for (let c = 0; c < world.cols; c += 1) {
        const tile = tileAt(c, r);
        const x = c * TILE;
        const y = r * TILE;
        const solidish = tile === '#' || tile === '=';
        // Tunnel and cave backdrops behind open tiles below the surface.
        if (!solidish && r >= 11) {
          fill(t.under);
          g.fillRect(x, y, TILE, TILE);
          fill(t.underBand);
          g.fillRect(x, y + 4, TILE, 2);
          g.fillRect(x, y + 11, TILE, 1);
        }
        if (tile === '#') {
          const above = tileAt(c, r - 1);
          const airAbove = above === ' ' || above === 'H' || above === '-';
          const deep = r >= 12;
          for (let yy = 0; yy < TILE; yy += 4) {
            fill(t.dirt[((r * 4 + yy / 4) >> 1) % t.dirt.length]);
            g.fillRect(x, y + yy, TILE, 4);
          }
          for (let i = 0; i < 5; i += 1) {
            const sx = Math.floor(hash(c * 7 + i, r) * 15);
            const sy = Math.floor(hash(c, r * 5 + i) * 15);
            fill(t.dirt[(i + 1) % t.dirt.length]);
            g.fillRect(x + sx, y + sy, 2, 1);
          }
          if (id === 'alien') {
            fill(t.mortar);
            g.fillRect(x, y + 15, TILE, 1);
            g.fillRect(x + 15, y, 1, TILE);
            fill('#2a3044');
            g.fillRect(x + 2, y + 2, 1, 1);
            g.fillRect(x + 12, y + 12, 1, 1);
          }
          if (airAbove && deep) {
            fill(t.dirt[0]);
            g.fillRect(x, y, TILE, 2);
            fill(t.topHi);
            for (let i = 0; i < TILE; i += 5) g.fillRect(x + i, y, 2, 1);
          } else if (airAbove) {
            fill(t.top);
            g.fillRect(x, y, TILE, 4);
            fill(t.topHi);
            for (let i = 0; i < TILE; i += 3) g.fillRect(x + i, y + (hash(c, i) > 0.5 ? 0 : 1), 1 + (i % 2), 1);
            if (id === 'jungle' || id === 'river') {
              fill(t.top);
              for (let i = 1; i < TILE; i += 4) g.fillRect(x + i, y + 4, 1, 1 + Math.floor(hash(c, i + r) * 2));
            }
            if (id === 'volcano') {
              fill('#ff6a1a');
              if (hash(c, 2) > 0.6) g.fillRect(x + 4, y + 5, 6, 1);
            }
            if (id === 'alien') {
              fill('#e8c020');
              for (let i = 0; i < TILE; i += 4) g.fillRect(x + i, y + 3, 2, 1);
            }
          }
          if (!['#', '='].includes(tileAt(c, r + 1)) && r < world.rows - 1) {
            fill(t.dirt[3]);
            g.fillRect(x, y + 14, TILE, 2);
          }
        } else if (tile === '=') {
          fill(t.brick);
          g.fillRect(x, y, TILE, TILE);
          fill(t.mortar);
          for (let yy = 0; yy < TILE; yy += 4) {
            g.fillRect(x, y + yy + 3, TILE, 1);
            const off = ((r * 4 + yy / 4) % 2) * 4;
            g.fillRect(x + off, y + yy, 1, 3);
            g.fillRect(x + off + 8, y + yy, 1, 3);
          }
          if (id === 'alien') {
            fill('#9aa4c4');
            g.fillRect(x + 1, y + 1, 1, 1);
            g.fillRect(x + 14, y + 1, 1, 1);
          }
        } else if (tile === '-') {
          fill(t.ledge);
          g.fillRect(x, y, TILE, 5);
          fill(t.ledgeHi);
          g.fillRect(x, y, TILE, 1);
          fill(t.dirt[3]);
          g.fillRect(x, y + 5, TILE, 1);
          if (id === 'jungle' || id === 'river' || id === 'volcano') {
            fill(t.canopy ? t.canopy[1] : t.ledge);
            if (c % 2 === 0) g.fillRect(x + 4, y - 2, 6, 2);
          }
        } else if (tile === 'H') {
          fill(t.ladder);
          g.fillRect(x + 2, y, 2, TILE);
          g.fillRect(x + 12, y, 2, TILE);
          for (let yy = 1; yy < TILE; yy += 5) g.fillRect(x + 4, y + yy, 8, 2);
        } else if (tile === '^') {
          fill(t.spikes);
          for (let i = 0; i < 4; i += 1) {
            for (let k = 0; k < 4; k += 1) g.fillRect(x + i * 4 + k, y + 8 + (k < 2 ? 6 - k * 3 : (k - 2) * 3), 1, 8 - (k < 2 ? 6 - k * 3 : (k - 2) * 3));
          }
          fill(t.dirt[2]);
          g.fillRect(x, y + 14, TILE, 2);
        }
      }
    }
    return cv;
  }

  // -------------------------------------------------------------- events

  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'explode': {
          const big = e.size || 1;
          this.burst(e.x, e.y, 10 + big * 8, ['#fff6a0', '#ffb03a', '#ff5a2a', '#ffffff'], 70 + big * 30, 0.5 + big * 0.12);
          this.ring(e.x, e.y, big);
          this.addShake(big >= 2 ? 3 : 1.2);
          if (e.score) this.popText(`${e.score}`, e.x, e.y - 6, '#ffffff');
          break;
        }
        case 'hit': this.burst(e.x, e.y, 3, ['#ffffff', '#ffd23a'], 60, 0.2); break;
        case 'bossHit': this.burst(e.x, e.y, 2, ['#ffffff', '#ffd23a'], 70, 0.18); break;
        case 'spark': this.burst(e.x, e.y, 3, ['#ffe6a0', '#ffffff'], 50, 0.18); break;
        case 'splash': this.burst(e.x, e.y + 6, 14, this.theme.water, 90, 0.6, -60); this.addShake(1); break;
        case 'hurt': this.burst(e.x, e.y, 8, ['#ffffff', '#ff4a4a'], 80, 0.35); this.addShake(2); this.flashScreen('#ff2a2a', 0.12); break;
        case 'death': this.burst(e.x, e.y, 22, ['#ffffff', '#ffd23a', '#ff4a4a'], 110, 0.8); this.addShake(3); break;
        case 'jump': this.dust(e.x, e.y, 3); break;
        case 'land': this.dust(e.x, e.y, 4); break;
        case 'trip': this.dust(e.x, e.y, 6); this.popText('OOF!', e.x, e.y - 24, '#ffd23a'); break;
        case 'treasure':
          this.burst(e.x, e.y, 16, ['#ffffff', '#ffe66a', '#7af0ff'], 70, 0.7, -30);
          this.popText(`+${e.score}`, e.x, e.y - 8, '#ffe66a');
          break;
        case 'powerup':
          this.burst(e.x, e.y, 12, ['#ffffff', POD_COLORS[e.kind] || '#ffffff'], 60, 0.5);
          this.popText(e.kind === 'heart' ? 'HEART!' : e.kind === 'bomb' ? '+BOMB' : (WEAPONS[e.kind]?.label || '').toUpperCase(), e.x, e.y - 10, POD_COLORS[e.kind] || '#ffffff');
          break;
        case 'podOpen': this.burst(e.x, e.y, 8, ['#ffffff', '#c8c8d8'], 60, 0.3); break;
        case 'oneUp': {
          const p = this.world && this.world.players[0];
          if (p) this.popText('1UP!', p.x + 5, p.y - 12, '#7aff6a');
          break;
        }
        case 'checkpoint': this.burst(e.x, e.y - 20, 14, ['#7aff6a', '#ffffff', '#ffe66a'], 60, 0.7, -40); this.popText('CHECKPOINT', e.x, e.y - 34, '#7aff6a'); break;
        case 'bomb':
          this.flashScreen('#ffffff', this.reduced ? 0.25 : 0.5);
          this.addShake(5);
          break;
        case 'quake': this.addShake(2.5 * (e.power || 1)); this.dust(e.x, e.y, 8); break;
        case 'erupt': this.burst(e.x, e.y - 4, 18, ['#c8a070', '#8a6a4a', '#ffffff'], 90, 0.7, -80); this.addShake(2); break;
        case 'dig': this.dust(e.x, e.y, 10); break;
        case 'rubble': this.burst(e.x, e.y, 6, ['#8a8090', '#5a5468'], 60, 0.5, -30); break;
        case 'burst': this.burst(e.x, e.y, 6, ['#ffb03a', '#ff5a2a'], 60, 0.4); break;
        case 'crumble': this.burst(e.x, e.y + 4, 6, [this.theme.dirt[0], this.theme.dirt[2]], 40, 0.5); break;
        case 'bubble': this.burst(e.x, e.y, 3, this.theme.water, 20, 0.4, -20); break;
        case 'bossDown': this.addShake(4); this.flashScreen('#ffffff', this.reduced ? 0.2 : 0.4); break;
        case 'bossPhase': this.addShake(2); this.burst(e.x, e.y, 20, ['#ffffff', '#ffd23a'], 120, 0.6); break;
        case 'bossIntro': this.showBanner('WARNING!', e.name, 2.6, true); break;
        case 'laserBlast': this.addShake(1.5); break;
        case 'respawn': this.burst(e.x, e.y - 10, 12, ['#ffffff', '#7af0ff'], 50, 0.5); break;
        case 'vine': this.leaves(e.x, e.y); break;
        default: break;
      }
    }
  }

  addShake(amount) {
    if (!this.settings.shake || this.reduced) return;
    this.shake = Math.min(6, this.shake + amount);
  }

  flashScreen(color, amount) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, this.reduced ? amount * 0.5 : amount);
  }

  showBanner(title, sub = '', seconds = 2.4, warn = false) {
    this.banner = { title, sub, time: seconds, max: seconds, warn };
  }

  spawn(x, y, vx, vy, life, color, size = 1, gravity = 220) {
    const limit = this.reduced ? MAX_PARTICLES / 2 : MAX_PARTICLES;
    if (this.particles.length >= limit) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, max: life, color, size, gravity });
  }

  burst(x, y, count, colors, speed, life, lift = 0) {
    const n = this.reduced ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s + lift, life * (0.6 + Math.random() * 0.5), colors[i % colors.length], Math.random() < 0.3 ? 2 : 1);
    }
  }

  ring(x, y, size) {
    this.spawn(x, y, 0, 0, 0.22, 'ring', 6 + size * 6, 0);
  }

  dust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      this.spawn(x + (Math.random() - 0.5) * 8, y - 1, (Math.random() - 0.5) * 50, -Math.random() * 30, 0.35, this.theme.dirt[0], 1, 60);
    }
  }

  leaves(x, y) {
    for (let i = 0; i < 4; i += 1) this.spawn(x, y, (Math.random() - 0.5) * 40, -20 - Math.random() * 20, 0.8, this.theme.canopy[2], 1, 90);
  }

  popText(text, x, y, color) {
    if (this.texts.length > 12) this.texts.shift();
    this.texts.push({ text, x, y, color, life: 0.9 });
  }

  // ------------------------------------------------------------- drawing

  R(x, y, w, h, color) {
    const g = this.g;
    g.fillStyle = this.c(color);
    g.fillRect(Math.round(x), Math.round(y), w, h);
  }

  text(str, x, y, color = '#ffffff', scale = 1, align = 'left') {
    const key = `${str}|${color}|${scale}|${this.settings.retro ? 1 : 0}`;
    let cv = this.textCache.get(key);
    if (!cv) {
      if (this.textCache.size > 300) this.textCache.clear();
      const w = textWidth(str, scale) + scale * 2;
      cv = makeCanvas(w, (GLYPH_H + 1) * scale + scale);
      const g = cv.getContext('2d');
      const ink = (col, dx, dy) => {
        g.fillStyle = col;
        for (let i = 0; i < str.length; i += 1) {
          const glyph = FONT[str[i]] || FONT[str[i].toUpperCase()] || FONT['?'];
          for (let gy = 0; gy < GLYPH_H; gy += 1) {
            for (let gx = 0; gx < GLYPH_W; gx += 1) {
              if (glyph[gy * GLYPH_W + gx] === '#') g.fillRect((i * (GLYPH_W + 1) + gx) * scale + dx, gy * scale + dy, scale, scale);
            }
          }
        }
      };
      ink(this.c('#000000'), scale, scale);
      ink(this.c(color), 0, 0);
      this.textCache.set(key, cv);
    }
    let dx = Math.round(x);
    if (align === 'center') dx = Math.round(x - cv.width / 2);
    else if (align === 'right') dx = Math.round(x - cv.width);
    this.g.drawImage(cv, dx, Math.round(y));
  }

  frame(world, dt, opts = {}) {
    this.time += dt;
    this.frameCount += 1;
    const g = this.g;
    g.imageSmoothingEnabled = false;
    this.updateEffects(dt);
    const cam = world.camera;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.2) {
      sx = Math.round((Math.random() - 0.5) * this.shake * 2);
      sy = Math.round((Math.random() - 0.5) * this.shake * 2);
    }
    const camX = Math.round(cam.x) - sx;
    const camY = Math.round(cam.y) - sy;
    this.camX = camX;
    this.camY = camY;

    g.drawImage(this.skyCanvas, 0, 0);
    this.drawStrip(this.farCanvas, camX * 0.15, camY * 0.1);
    this.drawStrip(this.midCanvas, camX * 0.45, camY * 0.3);
    g.drawImage(this.terrain, camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    g.save();
    g.translate(-camX, -camY);
    this.drawFluids(world);
    this.drawCheckpoints(world);
    this.drawVines(world);
    this.drawMovers(world);
    this.drawCrocs(world);
    this.drawItems(world);
    this.drawMarkers(world);
    this.drawEnemies(world);
    if (world.boss) this.drawBoss(world.boss, world);
    for (const p of world.players) this.drawPlayer(p, world);
    this.drawBullets(world);
    this.drawShots(world);
    this.drawParticles();
    g.restore();

    if (this.settings.retro) this.chunkify();
    if (this.flash > 0) {
      g.globalAlpha = Math.min(0.8, this.flash);
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.globalAlpha = 1;
    }
    if (opts.hud !== false) this.drawHud(world, opts);
    this.drawBanner();
    this.present();
  }

  drawStrip(cv, offsetX, offsetY) {
    const W = cv.width;
    const x = -(((Math.round(offsetX) % W) + W) % W);
    const y = -Math.round(offsetY);
    this.g.drawImage(cv, x, y);
    if (x + W < VIEW_W) this.g.drawImage(cv, x + W, y);
  }

  /** 2600 mode: halve horizontal resolution for fat playfield pixels. */
  chunkify() {
    const h = this.half.getContext('2d');
    h.imageSmoothingEnabled = false;
    h.drawImage(this.low, 0, 0, VIEW_W, VIEW_H, 0, 0, VIEW_W / 2, VIEW_H);
    this.g.drawImage(this.half, 0, 0, VIEW_W / 2, VIEW_H, 0, 0, VIEW_W, VIEW_H);
  }

  present() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.low, 0, 0, W, H);
    if (this.settings.crt) {
      // Bloom: blur by shrinking twice, then add it back on top softly.
      const a = this.bloomA.getContext('2d');
      const b = this.bloomB.getContext('2d');
      a.imageSmoothingEnabled = true;
      b.imageSmoothingEnabled = true;
      a.drawImage(this.low, 0, 0, this.bloomA.width, this.bloomA.height);
      b.drawImage(this.bloomA, 0, 0, this.bloomB.width, this.bloomB.height);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.drawImage(this.bloomB, 0, 0, W, H);
      ctx.globalAlpha = 0.1;
      ctx.drawImage(this.bloomA, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = false;
    }
  }

  updateEffects(dt) {
    this.shake = Math.max(0, this.shake - dt * 14);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 18 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.banner) {
      this.banner.time -= dt;
      if (this.banner.time <= 0) this.banner = null;
    }
  }

  visibleCols() {
    const c0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    return [c0, c0 + Math.ceil(VIEW_W / TILE) + 2];
  }

  drawFluids(world) {
    const t = this.theme;
    const [c0, c1] = this.visibleCols();
    const r0 = Math.max(0, Math.floor(this.camY / TILE));
    const r1 = Math.min(world.rows - 1, r0 + 12);
    const time = this.reduced ? this.time * 0.3 : this.time;
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const tile = world.tileAt(c, r);
        if (tile !== '~' && tile !== 'L' && tile !== 'Q' && tile !== 'T') continue;
        const x = c * TILE;
        const y = r * TILE;
        const surface = world.tileAt(c, r - 1) === ' ' || world.tileAt(c, r - 1) === '-';
        if (tile === '~' || tile === 'L') {
          const cols = tile === 'L' ? THEMES.volcano.water : t.water;
          this.R(x, y + 2, TILE, TILE - 2, cols[0]);
          this.R(x, y + 8, TILE, 2, cols[1]);
          if (surface) {
            this.R(x, y + 2, TILE, 2, cols[1]);
            for (let i = 0; i < TILE; i += 4) {
              const wave = Math.round(Math.sin(time * 3 + (x + i) * 0.25) * 1.5);
              this.R(x + i, y + 2 + wave, 3, 1, cols[2]);
            }
            if (tile === 'L' && hash(c, Math.floor(time * 2)) > 0.85) this.R(x + 6, y + 5, 2, 2, '#ffe070');
          }
        } else {
          const cols = tile === 'T' ? ['#1a1418', '#2e2830'] : t.sand;
          this.R(x, y + 1, TILE, TILE - 1, cols[0]);
          if (surface) this.R(x, y + 1, TILE, 1, tile === 'T' ? '#4a4050' : '#f0d488');
          for (let i = 0; i < 6; i += 1) {
            const px = (Math.floor(hash(c, i) * 16) + Math.floor(time * 4 * (i % 2 ? 1 : -1))) & 15;
            this.R(x + px, y + 2 + i * 2, 2, 1, cols[1]);
          }
          if (tile === 'T') this.R(x + 3, y + 1, 4, 1, '#5a5060');
        }
      }
    }
  }

  drawCheckpoints(world) {
    world.level.checkpoints.forEach((cp, i) => {
      const lit = i <= world.checkpoint;
      const x = cp.x;
      const y = cp.y;
      this.R(x - 1, y - 30, 2, 30, '#d8d0b8');
      const wave = Math.round(Math.sin(this.time * 5) * (this.reduced ? 0 : 1));
      this.R(x + 1, y - 30, 10, 6 + wave, lit ? '#3ae04a' : '#e83a3a');
      this.R(x + 1, y - 30, 10, 1, '#ffffff');
      this.R(x - 3, y - 2, 6, 2, '#8a8270');
    });
  }

  drawVines(world) {
    const t = this.theme;
    for (const v of world.vines) {
      const end = vineEnd(v);
      const steps = Math.ceil(v.len / 2);
      for (let i = 0; i <= steps; i += 1) {
        const k = i / steps;
        const x = v.ax + (end.x - v.ax) * k;
        const y = v.ay + (end.y - v.ay) * k;
        this.R(x, y, 2, 2, i % 6 < 3 ? '#3a8a2a' : '#4caa34');
        if (i % 7 === 3) this.R(x + (i % 2 ? 2 : -2), y, 2, 1, t.canopy ? t.canopy[2] : '#5aca4a');
      }
      this.R(v.ax - 3, v.ay - 2, 6, 3, '#2a6a1e');
    }
  }

  drawMovers(world) {
    const t = this.theme;
    for (const m of world.movers) {
      if (m.gone > 0) continue;
      if (m.kind === 'crumble') {
        const shake = m.crumble > 0 && !m.falling ? Math.round(Math.sin(this.time * 60)) : 0;
        const x = m.x + shake;
        const y = m.y + m.fall;
        this.R(x, y, m.w, m.h, t.dirt[1]);
        this.R(x, y, m.w, 2, t.topHi);
        this.R(x + 5, y + 2, 1, 3, t.dirt[3]);
        continue;
      }
      const off = moverOffset(m, world.t);
      const x = m.x + off.x;
      const y = m.y + off.y;
      if (world.level.id === 'alien') {
        this.R(x, y, m.w, m.h - 2, '#8a94b0');
        this.R(x, y, m.w, 1, '#e0e8ff');
        this.R(x + 4, y + m.h - 2, m.w - 8, 2, (this.frameCount >> 2) % 2 ? '#4cf0ff' : '#2a8aff');
      } else {
        for (let i = 0; i < m.w; i += 8) {
          this.R(x + i, y, 7, m.h, '#8a5a2a');
          this.R(x + i, y, 7, 2, '#b07a3a');
          this.R(x + i + 6, y, 1, m.h, '#5a3a1a');
        }
        this.R(x + 10, y + 1, 1, m.h - 2, '#d8c090');
        this.R(x + m.w - 11, y + 1, 1, m.h - 2, '#d8c090');
      }
    }
  }

  drawCrocs(world) {
    const volcano = world.level.id === 'volcano';
    for (const c of world.crocs) {
      const phase = crocPhase(c, world.t);
      const x = Math.round(c.x);
      const y = c.y + 2;
      const body = volcano ? '#5a4a40' : '#3a8a3a';
      const hi = volcano ? '#ff8a3a' : '#6ac85a';
      const jitter = phase === 'warn' && !this.reduced ? Math.round(Math.sin(this.time * 50)) : 0;
      // Head and eyes (the back half, always safe).
      this.R(x - 2 + jitter, y - 6, 15, 7, body);
      this.R(x + 2 + jitter, y - 9, 4, 3, body);
      this.R(x + 7 + jitter, y - 9, 4, 3, body);
      this.R(x + 3 + jitter, y - 9, 2, 2, '#ffe040');
      this.R(x + 8 + jitter, y - 9, 2, 2, '#ffe040');
      this.R(x - 2 + jitter, y - 6, 15, 1, hi);
      if (phase === 'open') {
        // Jaws wide: upper jaw up, teeth showing.
        this.R(x - 14, y - 15, 13, 4, body);
        this.R(x - 14, y - 11, 13, 1, '#ffffff');
        this.R(x - 4, y - 14, 3, 9, body);
        this.R(x - 14, y - 3, 13, 4, body);
        this.R(x - 14, y - 4, 13, 1, '#ffffff');
        this.R(x - 12, y - 10, 9, 6, '#c8283a');
      } else {
        const open = phase === 'warn' ? 2 : 0;
        this.R(x - 14 + jitter, y - 5 - open, 13, 3, body);
        this.R(x - 14 + jitter, y - 2, 13, 3, body);
        this.R(x - 14 + jitter, y - 5 - open, 13, 1, hi);
        this.R(x - 13 + jitter, y - 3, 1, 1, '#ffffff');
        this.R(x - 9 + jitter, y - 3, 1, 1, '#ffffff');
        this.R(x - 5 + jitter, y - 3, 1, 1, '#ffffff');
      }
    }
  }

  drawItems(world) {
    for (const item of world.items) {
      if (item.state === 'taken') continue;
      const x = Math.round(item.x);
      const y = Math.round(item.y);
      if (item.state === 'treasure') {
        const tw = (this.frameCount >> 3) % 8;
        if (item.kind === 'gold') {
          this.R(x - 6, y - 1, 12, 6, '#d8a020');
          this.R(x - 4, y - 3, 8, 3, '#ffd23c');
          this.R(x - 4, y - 3, 8, 1, '#fff2a0');
        } else if (item.kind === 'ring') {
          this.R(x - 4, y - 1, 8, 2, '#d8d8e8');
          this.R(x - 5, y + 1, 2, 4, '#d8d8e8');
          this.R(x + 3, y + 1, 2, 4, '#d8d8e8');
          this.R(x - 4, y + 5, 8, 2, '#d8d8e8');
          this.R(x - 2, y - 5, 4, 4, '#7af0ff');
          this.R(x - 1, y - 5, 1, 1, '#ffffff');
        } else {
          this.R(x - 3, y - 6, 6, 5, '#2ac87a');
          this.R(x - 4, y - 1, 8, 5, '#2ac87a');
          this.R(x - 5, y + 4, 10, 2, '#1a8a5a');
          this.R(x - 2, y - 5, 1, 1, '#ffe040');
          this.R(x + 1, y - 5, 1, 1, '#ffe040');
        }
        if (tw < 2 && !this.reduced) {
          this.R(x + 4, y - 7, 1, 3, '#ffffff');
          this.R(x + 3, y - 6, 3, 1, '#ffffff');
        }
        continue;
      }
      const color = POD_COLORS[item.kind] || '#ffffff';
      if (item.state === 'pod') {
        const flap = (this.frameCount >> 3) % 2;
        this.R(x - 10, y - 2 - flap, 5, 2, '#d8d8e8');
        this.R(x + 5, y - 2 - flap, 5, 2, '#d8d8e8');
        this.R(x - 6, y - 5, 12, 10, '#8a90a8');
        this.R(x - 6, y - 5, 12, 1, '#e0e4f0');
        this.R(x - 4, y - 3, 8, 6, color);
        this.text(POD_LETTER[item.kind] || '?', x - 1, y - 2, '#ffffff');
      } else {
        this.g.drawImage(this.glow.white, x - 10, y - 10, 20, 20);
        this.R(x - 5, y - 5, 10, 10, color);
        this.R(x - 5, y - 5, 10, 1, '#ffffff');
        this.text(POD_LETTER[item.kind] || '?', x - 1, y - 2, '#ffffff');
      }
    }
  }

  drawMarkers(world) {
    const on = this.reduced || (this.frameCount >> 2) % 2 === 0;
    for (const m of world.markers) {
      const k = 1 - m.life / m.max;
      if (m.kind === 'hbeam') {
        if (on) this.R(m.x, m.y, m.w, 1, '#ff4a4a');
        continue;
      }
      if (m.kind === 'column' || m.kind === 'land') {
        this.g.globalAlpha = 0.18 + k * 0.25;
        this.R(m.x, m.y - 90, m.w, 90, m.kind === 'land' ? '#ffd23a' : '#ff4a4a');
        this.g.globalAlpha = 1;
      }
      this.R(m.x, m.y, m.w, Math.max(2, m.h), on ? '#ffd23a' : '#ff4a4a');
    }
  }

  // ------------------------------------------------------------ enemies

  drawEnemies(world) {
    const id = world.level.id;
    const flicker = this.settings.retro && !this.reduced && world.enemies.length > 4;
    world.enemies.forEach((e, i) => {
      if (e.dead) return;
      if (flicker && (i + (this.frameCount >> 2)) % 2 === 0) this.g.globalAlpha = 0.55;
      this.drawEnemy(e, id);
      this.g.globalAlpha = 1;
    });
  }

  drawEnemy(e, id) {
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    const f = e.facing;
    const white = e.flash > 0;
    const C = (hex) => (white ? lighten(hex, 0.7) : hex);
    const warn = e.windup > 0 && (this.reduced || (this.frameCount >> 2) % 2 === 0);
    const alien = id === 'alien';
    switch (e.kind) {
      case 'raider':
      case 'sniper': {
        const crouch = e.kind === 'sniper' ? 3 : 0;
        const body = alien ? '#7a3aa8' : id === 'temple' ? '#8a3a2a' : '#4a5a6a';
        const bodyHi = alien ? '#a85ad8' : id === 'temple' ? '#b85a3a' : '#6a7e92';
        const step = e.kind === 'raider' && Math.abs(e.vx) > 1 ? Math.round(Math.sin(e.x * 0.35) * 2) : 0;
        this.R(x + 2, y + 13 + crouch, 3, 7 - crouch, C('#2a2a34'));
        this.R(x + 7, y + 13 + crouch, 3, 7 - crouch, C('#2a2a34'));
        if (step) { this.R(x + 2 + step, y + 18, 3, 2, C('#1a1a20')); this.R(x + 7 - step, y + 18, 3, 2, C('#1a1a20')); }
        this.R(x + 1, y + 6 + crouch, 10, 8, C(body));
        this.R(x + 1, y + 6 + crouch, 10, 1, C(bodyHi));
        this.R(x + 2, y + crouch, 8, 6, C(alien ? '#5ac85a' : '#8a96a8'));
        this.R(x + (f > 0 ? 5 : 2), y + 2 + crouch, 5, 2, C(warn ? '#ffffff' : '#ff3a3a'));
        const gx = f > 0 ? x + 9 : x - 5;
        this.R(gx, y + 9 + crouch, 8, 2, C('#2a2a30'));
        if (warn) this.R(f > 0 ? gx + 8 : gx - 2, y + 8 + crouch, 2, 4, '#ffe040');
        break;
      }
      case 'jumper': {
        const air = !e.onGround;
        const col = id === 'caves' ? '#4a8ae8' : alien ? '#c84af0' : id === 'temple' || id === 'volcano' ? '#a86a3a' : '#3ac83a';
        const hi = id === 'caves' ? '#8ac0ff' : alien ? '#e8a0ff' : '#8af06a';
        if (id === 'temple' || id === 'volcano') {
          // Monkey.
          this.R(x + 2, y + 2, 8, 8, C(col));
          this.R(x + 3, y + 3, 6, 4, C('#e8c098'));
          this.R(x + (f > 0 ? 6 : 3), y + 4, 2, 1, C('#1a1a1a'));
          this.R(x + (f > 0 ? -2 : 10), y + 4 - (air ? 3 : 0), 4, 2, C(col));
          this.R(x + 2, y + 10, 3, 2, C(col));
          this.R(x + 7, y + 10, 3, 2, C(col));
        } else {
          const h = air ? 9 : 7;
          this.R(x + 1, y + 12 - h, 10, h, C(col));
          this.R(x + 1, y + 12 - h, 10, 1, C(hi));
          this.R(x + 2, y + 10 - h, 3, 3, C(col));
          this.R(x + 7, y + 10 - h, 3, 3, C(col));
          this.R(x + 3, y + 11 - h, 1, 1, C('#1a1a1a'));
          this.R(x + 8, y + 11 - h, 1, 1, C('#1a1a1a'));
          this.R(x - 1, y + 10, 4, 2, C(col));
          this.R(x + 9, y + 10, 4, 2, C(col));
        }
        break;
      }
      case 'flyer':
      case 'drone': {
        const flap = (this.frameCount >> 2) % 2;
        if (e.kind === 'drone' || alien) {
          this.R(x, y + 4, 12, 3, C('#9aa4c0'));
          this.R(x + 3, y + 1, 6, 3, C('#5af0ff'));
          this.R(x + 1, y + 7, 10, 1, C(warn ? '#ffffff' : '#ff4cf0'));
          break;
        }
        const col = id === 'caves' || id === 'temple' ? '#7a3ab8' : id === 'volcano' ? '#ff6a1a' : '#e83a3a';
        const wing = id === 'caves' || id === 'temple' ? '#4a2a7a' : id === 'volcano' ? '#ffd040' : '#3ab8e8';
        this.R(x + 4, y + 3, 6, 5, C(col));
        this.R(x + (f > 0 ? 9 : 2), y + 4, 3, 2, C('#ffd23a'));
        this.R(x + (f > 0 ? 7 : 5), y + 3, 1, 1, C('#ffffff'));
        if (flap) { this.R(x, y, 5, 3, C(wing)); this.R(x + 9, y, 5, 3, C(wing)); }
        else { this.R(x, y + 6, 5, 3, C(wing)); this.R(x + 9, y + 6, 5, 3, C(wing)); }
        if (warn) this.R(x + 6, y + 1, 2, 1, '#ffffff');
        break;
      }
      case 'scorpion': {
        const col = alien ? '#5ac85a' : '#e86a1a';
        const dark = alien ? '#2a8a3a' : '#a83a0a';
        const back = f > 0 ? x : x + 10;
        this.R(x + 2, y + 5, 10, 5, C(col));
        this.R(back, y + 1, 4, 5, C(col));
        this.R(back + (f > 0 ? 1 : 0), y - 1, 3, 3, C(warn ? '#ffffff' : dark));
        const claw = f > 0 ? x + 12 : x - 2;
        this.R(claw, y + 4, 4, 3, C(dark));
        this.R(x + 3, y + 9, 1, 1, C(dark));
        this.R(x + 7, y + 9, 1, 1, C(dark));
        this.R(x + 10, y + 9, 1, 1, C(dark));
        break;
      }
      case 'turret': {
        const base = alien ? '#5a6280' : id === 'temple' ? '#8a7050' : '#5a6050';
        if (e.hidden) {
          this.R(x, y + 9, e.w, 3, C(base));
          this.R(x + 2, y + 8, e.w - 4, 1, C('#2a2a2a'));
          break;
        }
        this.R(x, y + 5, e.w, 7, C(base));
        this.R(x, y + 5, e.w, 1, C('#c8c8c8'));
        this.R(x + 3, y + 1, 8, 5, C('#3a3a40'));
        const aim = e.aim || { x: f, y: 0 };
        for (let i = 0; i < 7; i += 1) this.R(x + 7 + aim.x * i - 1, y + 3 + aim.y * i - 1, 2, 2, C('#1a1a1a'));
        this.R(x + 5, y + 2, 4, 2, C(warn ? '#ffffff' : '#ff3a3a'));
        break;
      }
      case 'leaper': {
        if (e.hidden) {
          if (e.windup > 0) this.R(x + 2, e.homeY + e.h - 2, 6, 2, this.theme.water[2]);
          break;
        }
        if (id === 'volcano') {
          this.g.drawImage(this.glow.orange, x - 5, y - 4, 20, 20);
          this.R(x + 1, y + 1, 8, 10, C('#ff8a1a'));
          this.R(x + 2, y + 2, 4, 3, C('#ffe060'));
          this.R(x + 2, y + 6, 2, 2, C('#1a1a1a'));
          this.R(x + 6, y + 6, 2, 2, C('#1a1a1a'));
        } else {
          this.R(x + 1, y + 2, 8, 8, C(alien ? '#5ac85a' : '#e84a6a'));
          this.R(x + 3, y, 4, 3, C(alien ? '#2a8a3a' : '#a82a4a'));
          this.R(x + 2, y + 9, 6, 3, C('#ffffff'));
          this.R(x + 6, y + 4, 2, 2, C('#1a1a1a'));
        }
        break;
      }
      case 'log': {
        const turn = Math.floor(-e.phase * 2) % 4;
        this.R(x + 1, y, 12, 12, '#7a4a20');
        this.R(x, y + 2, 14, 8, '#7a4a20');
        this.R(x + 2, y + 2, 10, 8, '#b07a3a');
        this.R(x + 4, y + 4, 6, 4, '#d8a85a');
        this.R(x + 6, y + 5, 2, 2, '#7a4a20');
        const spokes = [[1, 0], [0, 1], [-1, 0], [0, -1]][(turn + 4) % 4];
        this.R(x + 6 + spokes[0] * 4, y + 5 + spokes[1] * 4, 2, 2, '#5a3412');
        break;
      }
      default:
        this.R(x, y, e.w, e.h, '#ff00ff');
    }
  }

  // --------------------------------------------------------------- bosses

  drawBoss(b, world) {
    if (b.dead) return;
    const g = this.g;
    if (b.dying > 0 && (this.frameCount >> 1) % 2 && !this.reduced) g.globalAlpha = 0.6;
    // Hits tint the boss pale every other frame or so: readable, never a strobe.
    const white = b.flash > 0 && (this.frameCount & 4) === 0;
    const C = (hex) => (white ? lighten(hex, 0.55) : hex);
    const warn = b.windup && (this.reduced || (this.frameCount >> 2) % 2 === 0);
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    const f = b.facing;
    switch (b.type) {
      case 'gorilla': {
        const crouch = b.action === 'pound' && b.windup ? 3 : 0;
        const fur = '#5a6a7a';
        const metal = '#8a9ab0';
        const yy = y + crouch;
        // Legs
        this.R(x + 6, yy + 38, 10, 14 - crouch, C(fur));
        this.R(x + 28, yy + 38, 10, 14 - crouch, C(fur));
        this.R(x + 4, y + 48, 14, 4, C('#3a4250'));
        this.R(x + 26, y + 48, 14, 4, C('#3a4250'));
        // Torso and chest plate
        this.R(x + 4, yy + 14, 36, 26, C(fur));
        this.R(x + 10, yy + 18, 24, 16, C(metal));
        this.R(x + 10, yy + 18, 24, 2, C('#c8d4e8'));
        this.R(x + 18, yy + 22, 8, 8, C(warn ? '#ffffff' : '#ff3a3a'));
        this.R(x + 20, yy + 24, 4, 4, C('#ffd23a'));
        // Arms (raised on wind-ups)
        const up = b.windup && (b.action === 'barrel' || b.action === 'pound' || b.action === 'beat') ? -14 : 0;
        const beat = b.action === 'beat' && !b.windup ? Math.round(Math.sin(this.time * 30) * 3) : 0;
        this.R(x - 4, yy + 16 + up + beat, 10, 26, C(fur));
        this.R(x + 38, yy + 16 + up - beat, 10, 26, C(fur));
        this.R(x - 6, yy + 38 + up + beat, 12, 8, C(metal));
        this.R(x + 38, yy + 38 + up - beat, 12, 8, C(metal));
        if (b.action === 'barrel' && b.windup) {
          this.R(x + (f < 0 ? -8 : 36), yy + 2, 14, 14, C('#8a5a2a'));
          this.R(x + (f < 0 ? -8 : 36), yy + 6, 14, 2, C('#c8a060'));
        }
        // Head
        this.R(x + 12, yy, 20, 16, C(fur));
        this.R(x + 14, yy + 8, 16, 7, C('#3a4250'));
        const laser = b.action === 'laser';
        this.R(x + 15, yy + 4, 5, 3, C(laser && (warn || !b.windup) ? '#ffffff' : '#ff3a3a'));
        this.R(x + 24, yy + 4, 5, 3, C(laser && (warn || !b.windup) ? '#ffffff' : '#ff3a3a'));
        this.R(x + 16, yy + 11, 12, 2, C('#c8d4e8'));
        this.R(x + 20, yy - 4, 2, 4, C('#c8d4e8'));
        this.R(x + 19, yy - 6, 4, 2, C(warn ? '#ffffff' : '#ff3a3a'));
        break;
      }
      case 'croc': {
        const jaw = Math.round((b.jaw || 0) * 10);
        const body = '#4a7a5a';
        const plate = '#8aa898';
        this.R(x + 10, y + 8, 54, 20, C(body));
        this.R(x + 10, y + 8, 54, 2, C(plate));
        for (let i = 0; i < 6; i += 1) this.R(x + 14 + i * 8, y + 4, 5, 4, C(plate));
        this.R(x + 16, y + 26, 10, 4, C('#2a3a30'));
        this.R(x + 44, y + 26, 10, 4, C('#2a3a30'));
        // Snout and jaws, facing left.
        this.R(x - 2, y + 12 - jaw, 16, 6, C(body));
        this.R(x - 2, y + 17 - jaw, 16, 1, C('#ffffff'));
        this.R(x - 2, y + 20, 16, 6, C(body));
        this.R(x - 2, y + 20, 16, 1, C('#ffffff'));
        if (jaw > 2) this.R(x, y + 18 - jaw, 12, jaw + 2, C('#c8283a'));
        this.R(x + 14, y + 6, 6, 5, C('#2a3a30'));
        this.R(x + 15, y + 7, 4, 3, C(warn ? '#ffffff' : '#ffe040'));
        this.R(x + 40, y - 2, 4, 6, C('#5a6a68'));
        this.R(x + 38, y - 4, 8, 2, C(warn && b.action === 'mortar' ? '#ffffff' : '#ff3a3a'));
        break;
      }
      case 'mole': {
        if (b.underground) {
          this.R(x + 6, b.floor - 4, b.w - 12, 4, C('#6a5a48'));
          break;
        }
        const spin = b.spin > 0;
        const body = '#7a5a48';
        this.R(x + 4, y + 8, 32, 26, C(body));
        this.R(x + 4, y + 8, 32, 2, C('#a88870'));
        this.R(x + 8, y + 14, 24, 14, C('#c8a088'));
        this.R(x + 10, y + 4, 20, 8, C(body));
        this.R(x + 13, y + 6, 4, 3, C(warn ? '#ffffff' : '#1a1a1a'));
        this.R(x + 23, y + 6, 4, 3, C(warn ? '#ffffff' : '#1a1a1a'));
        this.R(x + 4, y + 30, 10, 6, C('#5a4030'));
        this.R(x + 26, y + 30, 10, 6, C('#5a4030'));
        // The drill on its nose.
        const dx = f < 0 ? x - 14 : x + 36;
        const turn = spin ? (this.frameCount >> 1) % 3 : 0;
        for (let i = 0; i < 4; i += 1) {
          const len = 16 - i * 4;
          this.R(f < 0 ? dx + i * 4 : dx, y + 12 + i * 2 + (i === turn ? 0 : 1), len, 2, C(i % 2 ? '#c8ccd8' : '#8a90a0'));
        }
        this.R(f < 0 ? dx + 12 : dx, y + 12, 4, 10, C('#c8ccd8'));
        break;
      }
      case 'idol': {
        const gold = '#e8b030';
        const dark = '#a87a18';
        this.g.drawImage(this.glow.big, x - 10, y - 10, b.w + 20, b.h + 20);
        this.R(x + 4, y, 44, 52, C(gold));
        this.R(x, y + 8, 52, 36, C(gold));
        this.R(x + 4, y, 44, 3, C('#fff0a0'));
        this.R(x + 4, y + 14, 44, 2, C(dark));
        // Eyes
        const eye = b.action === 'eyes' && (warn || !b.windup) ? '#ffffff' : '#ff3a3a';
        this.R(x + 10, y + 18, 10, 6, C('#2a1a08'));
        this.R(x + 32, y + 18, 10, 6, C('#2a1a08'));
        this.R(x + 13, y + 19, 4, 4, C(eye));
        this.R(x + 35, y + 19, 4, 4, C(eye));
        // Mouth
        const open = b.action === 'fireballs' || b.action === 'spiral' ? 6 : 2;
        this.R(x + 16, y + 34, 20, 4 + open, C('#2a1a08'));
        if (open > 2) this.R(x + 20, y + 36, 12, open, C(warn ? '#ffffff' : '#ff6a1a'));
        for (let i = 0; i < 5; i += 1) this.R(x + 17 + i * 4, y + 34, 2, 2, C('#fff0a0'));
        this.R(x + 24, y + 26, 4, 6, C(dark));
        this.R(x - 4, y + 24, 6, 10, C(dark));
        this.R(x + 50, y + 24, 6, 10, C(dark));
        this.R(x + 22, y - 6, 8, 6, C('#2ac87a'));
        break;
      }
      case 'wyrm': {
        const body = '#c8381a';
        const belly = '#ffb03a';
        // Body segments trailing down into the ground behind the head.
        const segs = 7;
        for (let i = segs; i >= 1; i -= 1) {
          const k = i / segs;
          const sx = x + 8 - f * i * 7 + Math.sin(this.time * 3 + i) * 2;
          const sy = Math.min(b.floor - 10, y + 6 + i * i * 1.6);
          this.R(sx, sy, 16 - k * 4, 14 - k * 4, C(i % 2 ? body : '#a82a12'));
          this.R(sx + 2, sy + 9 - k * 4, 10 - k * 4, 2, C(belly));
        }
        this.g.drawImage(this.glow.orange, x - 8, y - 8, b.w + 16, b.h + 16);
        this.R(x, y + 4, 30, 18, C(body));
        this.R(x + (f < 0 ? -6 : 26), y + 10, 10, 10, C(body));
        this.R(x + 2, y + 18, 26, 4, C(belly));
        this.R(x + 4, y, 6, 6, C('#a82a12'));
        this.R(x + 20, y, 6, 6, C('#a82a12'));
        this.R(x + (f < 0 ? 6 : 18), y + 8, 5, 4, C(warn ? '#ffffff' : '#ffe040'));
        if (b.action === 'spit' || b.action === 'rain') this.R(x + (f < 0 ? -6 : 30), y + 16, 6, 3, C('#ffe040'));
        break;
      }
      case 'mothership': {
        const hull = '#8a94b0';
        const dark = '#4a5068';
        this.R(x + 20, y, 72, 10, C('#a8b4d0'));
        this.R(x + 36, y - 8, 40, 10, C('#5af0ff'));
        this.R(x + 40, y - 8, 12, 3, C('#d0ffff'));
        this.R(x, y + 10, 112, 14, C(hull));
        this.R(x, y + 10, 112, 2, C('#e0e8ff'));
        this.R(x + 8, y + 24, 96, 6, C(dark));
        for (let i = 0; i < 8; i += 1) {
          const lit = ((this.frameCount >> 3) + i) % 4 === 0;
          this.R(x + 8 + i * 13, y + 16, 6, 3, C(lit ? '#ffe040' : '#ff4cf0'));
        }
        this.R(x + 46, y + 28, 20, 6, C(warn ? '#ffffff' : '#ff3a3a'));
        this.R(x + 10, y + 28, 8, 4, C(dark));
        this.R(x + 94, y + 28, 8, 4, C(dark));
        break;
      }
      default:
        this.R(x, y, b.w, b.h, '#ff00ff');
    }
    g.globalAlpha = 1;
  }

  // -------------------------------------------------------------- players

  drawPlayer(p, world) {
    if (p.state === 'out') return;
    const pal = PLAYER_COLORS[p.id] || PLAYER_COLORS[0];
    const fx = Math.round(p.x + p.w / 2);
    const fy = Math.round(p.y + p.h);
    if (p.state === 'dead') {
      const k = 1.5 - p.respawn;
      if (k > 1.1) return;
      const x = Math.round(p.deathX + p.w / 2 - k * 30 * p.facing);
      const y = Math.round(p.deathY + p.h - Math.sin(Math.min(1, k) * Math.PI) * 26 + k * k * 10);
      this.R(x - 9, y - 6, 16, 5, pal.shirt);
      this.R(x + 6, y - 7, 5, 5, '#f0b888');
      this.R(x + 6, y - 8, 5, 2, pal.band);
      this.R(x - 12, y - 4, 4, 3, pal.pants);
      return;
    }
    if (p.invuln > 0 && p.state === 'alive') {
      if (this.reduced) this.g.globalAlpha = 0.6;
      else if ((this.frameCount >> 2) % 2 === 0) return;
    }
    const f = p.facing;
    const skin = '#f0b888';
    const hurt = p.hurtTimer > 0;
    const C = (hex) => (hurt ? '#ffffff' : hex);
    const tail = Math.round(Math.sin(this.time * 14) * (this.reduced ? 0 : 1));

    if (p.duck && p.mode === 'run') {
      // Prone, Contra style.
      const x = fx - 8;
      this.R(x - (f > 0 ? 2 : 0), fy - 3, 8, 3, C(pal.pants));
      this.R(x + 4, fy - 5, 9, 5, C(pal.shirt));
      this.R(f > 0 ? x + 12 : x - 2, fy - 6, 5, 5, C(skin));
      this.R(f > 0 ? x + 12 : x - 2, fy - 7, 5, 2, C(pal.band));
      this.R(f > 0 ? x + 10 : x - 4, fy - 8, 2, 1, C(pal.band));
      this.R(f > 0 ? fx + 6 : fx - 14, fy - 4, 8, 2, C('#2a2a30'));
      this.g.globalAlpha = 1;
      return;
    }

    const climbing = p.mode === 'ladder';
    const hanging = p.mode === 'vine';
    const air = !p.onGround && !climbing && !hanging;
    // Legs
    if (climbing) {
      const s = Math.round(Math.sin(p.runTime * 0.25) * 2);
      this.R(fx - 3, fy - 8 + s, 2, 8 - s, C(pal.pants));
      this.R(fx + 1, fy - 8 - s, 2, 8 + s, C(pal.pants));
      this.R(fx - 4, fy - 2 + s, 3, 2, C(pal.boot));
      this.R(fx + 1, fy - 2 - s, 3, 2, C(pal.boot));
    } else if (air || hanging) {
      const swing = hanging ? Math.round(Math.sin(world.vines[p.vine]?.theta || 0) * -3) : 0;
      this.R(fx - 3 + swing, fy - 8, 2, 6, C(pal.pants));
      this.R(fx + 1 + swing, fy - 8, 2, 5, C(pal.pants));
      this.R(fx - 4 + swing + f * 2, fy - 3, 3, 2, C(pal.boot));
      this.R(fx + 1 + swing - f * 1, fy - 4, 3, 2, C(pal.boot));
    } else {
      const moving = Math.abs(p.vx) > 8;
      const ph = p.runTime * 0.32;
      const a = moving ? Math.round(Math.sin(ph) * 3) : 0;
      const lift1 = moving ? Math.max(0, Math.round(Math.cos(ph) * 2)) : 0;
      const lift2 = moving ? Math.max(0, Math.round(-Math.cos(ph) * 2)) : 0;
      this.R(fx - 3 + Math.round(a / 2), fy - 8, 2, 4, C(pal.pants));
      this.R(fx - 3 + a, fy - 4 - lift1, 2, 4, C(pal.pants));
      this.R(fx + 1 - Math.round(a / 2), fy - 8, 2, 4, C(pal.pants));
      this.R(fx + 1 - a, fy - 4 - lift2, 2, 4, C(pal.pants));
      this.R(fx - 4 + a + (f > 0 ? 1 : 0), fy - 2 - lift1, 3, 2, C(pal.boot));
      this.R(fx + 0 - a + (f > 0 ? 1 : 0), fy - 2 - lift2, 3, 2, C(pal.boot));
    }
    // Torso
    this.R(fx - 3, fy - 14, 6, 6, C(pal.shirt));
    this.R(f > 0 ? fx - 3 : fx + 2, fy - 14, 1, 6, C(pal.shade));
    this.R(fx - 3, fy - 9, 6, 1, C('#5a3a1a'));
    // Head
    const hx = fx - 2;
    const hy = fy - 20;
    if (climbing) {
      this.R(hx, hy, 5, 5, C(pal.hair));
      this.R(hx, hy + 2, 5, 1, C(pal.band));
    } else {
      this.R(hx, hy + 1, 5, 5, C(skin));
      this.R(hx, hy, 5, 2, C(pal.hair));
      this.R(hx, hy + 2, 5, 1, C(pal.band));
      this.R(f > 0 ? hx - 2 : hx + 5, hy + 2 + tail, 2, 1, C(pal.band));
      this.R(f > 0 ? hx - 3 : hx + 7, hy + 3 + tail, 1, 1, C(pal.band));
      this.R(f > 0 ? hx + 3 : hx + 1, hy + 3, 1, 1, C('#1a1a1a'));
    }
    // Arms and gun
    if (climbing || hanging) {
      const s = climbing ? Math.round(Math.sin(p.runTime * 0.25) * 2) : 0;
      this.R(fx - 4, fy - 19 - s, 2, 7, C(skin));
      this.R(fx + 2, fy - 19 + s, 2, 7, C(skin));
      if (hanging) {
        const aim = { x: p.aimX, y: p.aimY };
        this.drawGun(fx, fy - 12, aim, pal);
      }
    } else {
      this.drawGun(fx, fy - 12, { x: p.aimX, y: p.aimY }, pal);
    }
    if (p.mode === 'stun') {
      for (let i = 0; i < 3; i += 1) {
        const a = this.time * 6 + i * 2.1;
        this.R(fx + Math.cos(a) * 6, fy - 24 + Math.sin(a) * 2, 1, 1, '#ffe040');
      }
    }
    if (p.onSand && p.sink > 0) this.R(fx - 7, fy - 2, 14, 3, p.onSand ? this.theme.sand[0] : '#000');
    this.g.globalAlpha = 1;
  }

  drawGun(x, y, aim, pal) {
    const len = Math.hypot(aim.x, aim.y) || 1;
    const ax = aim.x / len;
    const ay = aim.y / len;
    this.R(x + ax * 2 - 1, y + ay * 2 - 1, 2, 2, '#f0b888');
    for (let i = 3; i <= 8; i += 1) this.R(x + ax * i - 1, y + ay * i - 1, 2, 2, i > 6 ? '#5a5a66' : '#2a2a30');
  }

  // -------------------------------------------------------------- bullets

  drawBullets(world) {
    const g = this.g;
    for (const b of world.bullets) {
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      switch (b.kind) {
        case 'spread':
          g.drawImage(this.glow.red, x - 6, y - 6);
          this.R(x - 2, y - 2, 4, 4, '#ff5a3a');
          this.R(x - 1, y - 1, 2, 2, '#ffffff');
          break;
        case 'laser': {
          const dx = Math.cos(b.angle);
          const dy = Math.sin(b.angle);
          for (let i = -12; i <= 12; i += 2) this.R(x + dx * i - 1, y + dy * i - 1, 3, 3, Math.abs(i) < 6 ? '#ffffff' : '#3ac8ff');
          break;
        }
        case 'rapid':
          g.drawImage(this.glow.yellow, x - 6, y - 6);
          this.R(x - 1, y - 1, 2, 2, '#fff6a0');
          break;
        case 'flame': {
          const k = b.age / b.life;
          const s = Math.round(5 + k * 12);
          g.globalAlpha = 1 - k * 0.6;
          g.drawImage(this.glow.orange, x - s, y - s, s * 2, s * 2);
          this.R(x - 2, y - 2, 4, 4, k < 0.4 ? '#ffffa0' : '#ff8a1a');
          g.globalAlpha = 1;
          break;
        }
        default:
          g.drawImage(this.glow.yellow, x - 6, y - 6);
          this.R(x - 1, y - 1, 3, 3, '#ffffff');
          this.R(x - 1, y, 3, 1, '#ffe040');
      }
    }
  }

  drawShots(world) {
    const g = this.g;
    for (const s of world.shots) {
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      switch (s.kind) {
        case 'barrel': {
          const turn = Math.floor(s.x / 4) % 2;
          this.R(x - 7, y - 6, 14, 12, '#8a5a2a');
          this.R(x - 6, y - 7, 12, 14, '#8a5a2a');
          this.R(x - 7, y - 3 + turn, 14, 2, '#c8a060');
          this.R(x - 7, y + 2 - turn, 14, 2, '#c8a060');
          break;
        }
        case 'rock':
          this.R(x - 5, y - 4, 10, 8, '#7a7088');
          this.R(x - 4, y - 5, 7, 2, '#a8a0b8');
          break;
        case 'wave': {
          const box = shotBox(s);
          g.drawImage(this.glow.white, box.x - 4, box.y - 4, box.w + 8, box.h + 8);
          this.R(box.x + 2, box.y, 2, box.h, '#ffffff');
          this.R(box.x + 5, box.y + 4, 2, box.h - 4, '#ffe6a0');
          this.R(box.x, box.y + 6, 2, box.h - 6, '#ffe6a0');
          break;
        }
        case 'torpedo': {
          const box = shotBox(s);
          this.R(box.x, box.y, box.w, box.h, '#9aa4b8');
          this.R(box.x, box.y, 3, box.h, '#ff3a3a');
          this.R(box.x + box.w, box.y + 1, 3, box.h - 2, (this.frameCount >> 1) % 2 ? '#ffe040' : '#ff8a1a');
          break;
        }
        case 'fire':
          g.drawImage(this.glow.orange, x - 10, y - 10);
          this.R(x - 3, y - 3, 6, 6, '#ff8a1a');
          this.R(x - 1, y - 2, 3, 3, '#ffffa0');
          break;
        case 'shell':
          this.R(x - 4, y - 4, 8, 8, '#2a2a30');
          this.R(x - 2, y - 3, 3, 2, '#8a8aa0');
          break;
        case 'beam': {
          const box = shotBox(s);
          const pulse = this.reduced ? 0 : (this.frameCount >> 1) % 2;
          if (s.style === 'tractor') {
            g.globalAlpha = 0.55;
            this.R(box.x, box.y, box.w, box.h, '#5aff7a');
            g.globalAlpha = 1;
            this.R(box.x + 4 + pulse * 2, box.y, 2, box.h, '#d0ffd0');
            this.R(box.x + box.w - 6 - pulse * 2, box.y, 2, box.h, '#d0ffd0');
          } else if (s.style === 'pillar') {
            g.drawImage(this.glow.orange, box.x - 8, box.y, box.w + 16, box.h);
            this.R(box.x + 2, box.y, box.w - 4, box.h, '#ff6a1a');
            this.R(box.x + 5, box.y, box.w - 10, box.h, '#ffe070');
          } else if (s.style === 'erupt') {
            this.R(box.x, box.y, box.w, box.h, '#8a6a4a');
            this.R(box.x + 4, box.y, box.w - 8, 4, '#c8a070');
          } else {
            this.R(box.x, box.y, box.w, box.h, '#ff3a3a');
            this.R(box.x, box.y + 2 + pulse, box.w, 3, '#ffffff');
          }
          break;
        }
        default:
          g.drawImage(this.glow.red, x - 7, y - 7);
          this.R(x - 2, y - 2, 5, 5, '#ff3ab8');
          this.R(x - 1, y - 1, 3, 3, '#ffffff');
      }
    }
  }

  drawParticles() {
    const g = this.g;
    for (const p of this.particles) {
      if (p.color === 'ring') {
        const k = 1 - p.life / p.max;
        const r = Math.round(p.size * (0.4 + k));
        g.globalAlpha = 1 - k;
        this.R(p.x - r, p.y - r, r * 2, 1, '#ffffff');
        this.R(p.x - r, p.y + r, r * 2, 1, '#ffffff');
        this.R(p.x - r, p.y - r, 1, r * 2, '#ffffff');
        this.R(p.x + r, p.y - r, 1, r * 2 + 1, '#ffffff');
        g.globalAlpha = 1;
        continue;
      }
      this.R(p.x, p.y, p.size, p.size, p.color);
    }
    for (const t of this.texts) {
      this.text(t.text, t.x - this.camX - (t.text.length * 2) + this.camX, t.y, t.color);
    }
  }

  // ------------------------------------------------------------------ HUD

  drawHud(world, opts) {
    const run = world.run;
    const p1 = world.players[0];
    const adv = run.mode === 'adventure';
    const drawPlayerHud = (p, x, align) => {
      const right = align === 'right';
      const label = `${p.id + 1}P`;
      const lives = run.lives[p.id];
      const startX = right ? x - 60 : x;
      this.text(label, startX, 4, p.id === 0 ? '#ff6a5a' : '#5ab0ff');
      // Lives as little heads.
      for (let i = 0; i < Math.min(6, lives); i += 1) {
        this.R(startX + 12 + i * 6, 4, 4, 4, '#f0b888');
        this.R(startX + 12 + i * 6, 4, 4, 1, PLAYER_COLORS[p.id].band);
      }
      if (lives > 6) this.text(`x${lives}`, startX + 48, 4, '#ffffff');
      if (adv && p.state === 'alive') {
        for (let i = 0; i < world.rules.hearts; i += 1) this.text('<', startX + i * 5, 11, i < p.hearts ? '#ff5a8a' : '#4a3040');
      }
      const gun = WEAPONS[p.gun.id];
      const badgeX = startX + (adv ? 18 : 0);
      if (gun && gun.letter) {
        this.R(badgeX, 11, 7, 7, POD_COLORS[p.gun.id]);
        this.text(gun.letter, badgeX + 2, 12, '#ffffff');
      }
      for (let i = 0; i < p.bombs; i += 1) {
        this.R(badgeX + 10 + i * 6, 12, 4, 4, '#c8c8d8');
        this.R(badgeX + 11 + i * 6, 11, 2, 1, '#ffb03a');
      }
    };
    drawPlayerHud(p1, 4, 'left');
    if (world.players[1]) drawPlayerHud(world.players[1], VIEW_W - 4, 'right');
    const score = String(run.score).padStart(6, '0');
    if (world.players[1]) this.text(score, VIEW_W / 2 + 40, 4, '#ffffff', 1, 'left');
    else {
      this.text(score, VIEW_W - 4, 4, '#ffffff', 1, 'right');
      if (opts.hiScore) this.text(`HI ${String(Math.max(opts.hiScore, run.score)).padStart(6, '0')}`, VIEW_W - 4, 11, '#ffd23a', 1, 'right');
    }
    const treasures = `${world.stats.treasures}/${world.stats.treasureTotal}`;
    this.R(4, VIEW_H - 10, 6, 5, '#d8a020');
    this.R(5, VIEW_H - 11, 4, 2, '#ffd23c');
    this.text(treasures, 13, VIEW_H - 10, '#ffe66a');
    const boss = world.boss;
    if (boss && !boss.dead && world.arena && world.arena.active) {
      const w = 140;
      const x = (VIEW_W - w) / 2;
      const y = VIEW_H - 12;
      this.text(boss.name, VIEW_W / 2, y - 7, '#ffffff', 1, 'center');
      this.R(x - 1, y - 1, w + 2, 6, '#000000');
      this.R(x, y, w, 4, '#4a1a1a');
      const k = Math.max(0, boss.hp / boss.maxHp);
      this.R(x, y, Math.round(w * k), 4, k > 2 / 3 ? '#ffd23a' : k > 1 / 3 ? '#ff8a1a' : '#ff3a3a');
      this.R(x, y, Math.round(w * k), 1, '#ffffff');
      this.R(x + w / 3, y, 1, 4, '#000000');
      this.R(x + (w * 2) / 3, y, 1, 4, '#000000');
    }
    for (const p of world.players) {
      if (p.state !== 'out' || world.players.length < 2) continue;
      this.text(`${p.id + 1}P OUT - KEEP GOING!`, VIEW_W / 2, 22, '#ffffff', 1, 'center');
    }
  }

  drawBanner() {
    const b = this.banner;
    if (!b) return;
    const k = b.time / b.max;
    const appear = Math.min(1, (1 - k) * 6, k * 5);
    const g = this.g;
    g.globalAlpha = Math.max(0, appear);
    const y = 58;
    this.R(0, y - 6, VIEW_W, 36, '#000000');
    // Rainbow stripes like an old cartridge label.
    const stripes = b.warn ? ['#ff3a3a', '#ffd23a'] : ['#ff3a3a', '#ff8a1a', '#ffd23a', '#3ae04a', '#3a8aff'];
    stripes.forEach((col, i) => this.R(0, y - 6 + i * 2, VIEW_W, 1, col));
    stripes.forEach((col, i) => this.R(0, y + 29 - i * 2, VIEW_W, 1, col));
    const show = !b.warn || this.reduced || (this.frameCount >> 3) % 4 !== 0;
    if (show) this.text(b.title, VIEW_W / 2, y + 2, b.warn ? '#ff4a4a' : '#ffffff', 2, 'center');
    if (b.sub) this.text(b.sub, VIEW_W / 2, y + 17, '#ffd23a', 1, 'center');
    g.globalAlpha = 1;
  }
}
