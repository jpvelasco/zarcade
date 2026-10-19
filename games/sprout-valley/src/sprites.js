// Pixel art, drawn once into small offscreen canvases. Everything is painted
// with fillRect at 1 logical pixel, then scaled up crisply by the renderer.
import { CROPS, ITEMS, VILLAGERS, FISH, CRITTERS, GOODS, DECOR } from './data.js';
import { STAGES } from './crops.js';

export const T = 16;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function painter(ctx) {
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  p.dot = (x, y, c) => p(x, y, 1, 1, c);
  // Filled ellipse from rows of rects (crisp, no anti-aliasing).
  p.oval = (cx, cy, rx, ry, c) => {
    ctx.fillStyle = c;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01))));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 || 1, 1);
    }
  };
  return p;
}

// Tiny deterministic hash for per-tile variety.
export const h2 = (x, y, s = 0) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------ palettes

export const SEASON_PAL = {
  spring: { grass: '#a3dc7a', dark: '#8acb63', light: '#bfe995', flower: ['#ffb3d1', '#fff1a8', '#c9b8ff', '#ffffff'], path: '#e6c897', pathD: '#d4b07c', tree: ['#7fcf7a', '#5fb35e', '#ffc8dd'], bush: '#6cbf62', sky: '#fff3d6' },
  summer: { grass: '#8bd266', dark: '#70bf52', light: '#a8e384', flower: ['#ff7aa2', '#ffd23f', '#7ad3ff', '#ffffff'], path: '#e8c48c', pathD: '#d3aa70', tree: ['#4fb15a', '#3a9a4b', '#74c96e'], bush: '#4fa94f', sky: '#fff7e0' },
  autumn: { grass: '#c3c56c', dark: '#aeb05a', light: '#d9d684', flower: ['#ff9f43', '#e85d75', '#ffd166', '#f6e7cb'], path: '#e3bd86', pathD: '#cc9f68', tree: ['#f4a259', '#e76f51', '#f6c85f'], bush: '#c08a3e', sky: '#ffe9cf' },
  winter: { grass: '#eef4fb', dark: '#d7e3f3', light: '#ffffff', flower: ['#e63946', '#ffffff', '#a8dadc', '#ffffff'], path: '#e3dde8', pathD: '#cbc3d6', tree: ['#3f8f6b', '#2f7558', '#ffffff'], bush: '#5d9f86', sky: '#eaf2ff' },
};

// ------------------------------------------------------------ ground tiles

export function bakeTiles(season) {
  const pal = SEASON_PAL[season];
  const out = {};
  const make = (name, fn, n = 1) => {
    out[name] = [];
    for (let v = 0; v < n; v++) { const [c, ctx] = canvas(T, T); fn(painter(ctx), v); out[name].push(c); }
  };
  make('grass', (p, v) => {
    p(0, 0, T, T, pal.grass);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(h2(i, v, 1) * 15), y = Math.floor(h2(i, v, 2) * 14);
      if (season === 'winter') { p(x, y, 2, 1, pal.dark); continue; }
      p(x, y + 1, 1, 2, pal.dark); p(x + 1, y, 1, 2, pal.dark);
    }
    for (let i = 0; i < 3; i++) p.dot(Math.floor(h2(i, v, 3) * 16), Math.floor(h2(i, v, 4) * 16), pal.light);
  }, 4);
  make('flowers', (p, v) => {
    p(0, 0, T, T, pal.grass);
    for (let i = 0; i < 4; i++) {
      const x = 1 + Math.floor(h2(i, v, 5) * 13), y = 1 + Math.floor(h2(i, v, 6) * 12);
      const c = pal.flower[(i + v) % pal.flower.length];
      if (season === 'winter') { p(x, y, 1, 1, '#c1121f'); p(x + 1, y + 1, 1, 1, '#2d6a4f'); continue; }
      p(x, y + 2, 1, 2, pal.dark);
      p(x - 1, y, 3, 1, c); p(x, y - 1, 1, 3, c); p.dot(x, y, '#fff7ae');
    }
  }, 4);
  make('path', (p, v) => {
    p(0, 0, T, T, pal.path);
    for (let i = 0; i < 5; i++) p(Math.floor(h2(i, v, 7) * 15), Math.floor(h2(i, v, 8) * 15), 2, 1, pal.pathD);
    for (let i = 0; i < 2; i++) p.dot(Math.floor(h2(i, v, 9) * 16), Math.floor(h2(i, v, 10) * 16), '#fff3dc');
  }, 3);
  make('cobble', (p, v) => {
    p(0, 0, T, T, season === 'winter' ? '#e4e1ee' : '#d8cfe2');
    const stone = season === 'winter' ? '#f4f2fa' : '#e9e3f1', edge = season === 'winter' ? '#c9c4da' : '#b9acc9';
    const rows = [[0, 0, 7, 5], [8, 0, 8, 5], [0, 6, 4, 4], [5, 6, 6, 4], [12, 6, 4, 4], [0, 11, 8, 5], [9, 11, 7, 5]];
    for (const [x, y, w, hh] of rows) {
      const s = h2(x, y, v) * 3 | 0;
      p(x + 1, y + 1, w - 1, hh - 1, s ? stone : '#efe9f6');
      p(x + 1, y + hh - 1, w - 1, 1, edge);
    }
  }, 2);
  make('sand', (p, v) => {
    p(0, 0, T, T, season === 'winter' ? '#f2f2f6' : '#f2dfae');
    for (let i = 0; i < 6; i++) p.dot(Math.floor(h2(i, v, 11) * 16), Math.floor(h2(i, v, 12) * 16), season === 'winter' ? '#dfe3ee' : '#e2c98d');
  }, 2);
  make('floor', (p) => {
    p(0, 0, T, T, '#a9825c');
    p(0, 0, T, 1, '#8f6a47'); p(0, 8, T, 1, '#8f6a47'); p(8, 0, 1, 8, '#8f6a47'); p(3, 8, 1, 8, '#8f6a47');
  });
  // Water: three ripple frames, or ice in winter.
  make('water', (p, v) => {
    if (season === 'winter') {
      p(0, 0, T, T, '#cfe8f6');
      p(2 + v, 4, 6, 1, '#f2fbff'); p(9, 10 - v, 5, 1, '#f2fbff'); p(4, 13, 3, 1, '#b5d7ea');
      return;
    }
    p(0, 0, T, T, '#78c3e2');
    p(0, 12, T, 4, '#6bb5d6');
    const o = v * 2;
    p((1 + o) % 14, 3, 4, 1, '#b8e6f6'); p((8 + o) % 14, 7, 5, 1, '#a6dcf0'); p((4 + o) % 14, 11, 3, 1, '#b8e6f6');
  }, 3);
  make('soil', (p, v) => {
    const wet = v === 1;
    p(1, 1, 14, 14, wet ? '#7a5638' : '#b58457');
    p(1, 1, 14, 1, wet ? '#8d6644' : '#c99868');
    for (let y = 4; y < 15; y += 4) p(2, y, 12, 1, wet ? '#64452c' : '#9c6f45');
    p(1, 14, 14, 1, wet ? '#5c3f28' : '#93673f');
    if (wet) { p.dot(4, 6, '#9ab7c9'); p.dot(11, 10, '#9ab7c9'); }
  }, 2);
  make('fence', (p, v) => {
    // v: 0 horizontal, 1 vertical, 2 post
    const wood = '#c8935a', dark = '#9b6a3a', light = '#e2b47c';
    if (v !== 1) { p(0, 7, T, 2, wood); p(0, 11, T, 2, wood); p(0, 9, T, 1, dark); p(0, 13, T, 1, dark); }
    if (v === 1) { p(6, 0, 4, T, wood); p(6, 0, 1, T, light); p(9, 0, 1, T, dark); }
    p(6, 4, 4, 11, wood); p(6, 4, 4, 1, light); p(9, 5, 1, 10, dark); p(6, 14, 4, 1, dark);
    if (season === 'winter') p(6, 3, 4, 2, '#ffffff');
  }, 3);
  make('bush', (p) => {
    p.oval(8, 9, 7, 6, darken(pal.bush, 0.2));
    p.oval(8, 8, 7, 6, pal.bush);
    p.oval(6, 6, 3, 2, lighten(pal.bush, 0.2));
    if (season === 'summer' || season === 'spring') { p.dot(4, 9, '#ff5a6e'); p.dot(11, 7, '#ff5a6e'); p.dot(9, 11, '#ff5a6e'); }
    if (season === 'winter') { p(3, 3, 10, 2, '#ffffff'); p(2, 5, 4, 1, '#ffffff'); }
  });
  return out;
}

// Trees are taller than a tile: 24×32, anchored at the bottom centre.
export function bakeTrees(season) {
  const pal = SEASON_PAL[season];
  const out = [];
  for (let v = 0; v < 3; v++) {
    const [c, ctx] = canvas(24, 32);
    const p = painter(ctx);
    p.oval(12, 29, 8, 2, 'rgba(40,60,40,0.25)');
    p(10, 18, 4, 11, '#8b5e3c'); p(10, 18, 1, 11, '#a7744c'); p(13, 18, 1, 11, '#6e4a2f');
    if (v === 2 || (season === 'winter' && v === 1)) {
      // A round little pine.
      const g = season === 'winter' ? '#3f8f6b' : '#3f9a63', gd = season === 'winter' ? '#2f7558' : '#2f7d4f';
      for (let i = 0; i < 4; i++) { const w = 3 + i * 2; p(12 - w, 3 + i * 5, w * 2, 6, gd); p(12 - w + 1, 3 + i * 5, w * 2 - 2, 5, g); }
      if (season === 'winter') for (let i = 0; i < 4; i++) { const w = 3 + i * 2; p(12 - w + 1, 3 + i * 5, w * 2 - 4, 2, '#ffffff'); }
    } else if (season === 'winter') {
      p(6, 10, 2, 9, '#8b5e3c'); p(16, 8, 2, 10, '#8b5e3c'); p(8, 6, 2, 6, '#8b5e3c'); p(14, 4, 2, 6, '#8b5e3c');
      p(5, 9, 4, 1, '#ffffff'); p(15, 7, 4, 1, '#ffffff'); p(7, 5, 4, 1, '#ffffff'); p(13, 3, 4, 1, '#ffffff');
    } else {
      p.oval(12, 12, 10, 9, darken(pal.tree[1], 0.1));
      p.oval(12, 11, 10, 8, pal.tree[1]);
      p.oval(10, 9, 7, 6, pal.tree[0]);
      p.oval(8, 7, 3, 2, lighten(pal.tree[0], 0.25));
      const accent = pal.tree[2];
      for (let i = 0; i < 7; i++) p(3 + Math.floor(h2(i, v, 20) * 17), 4 + Math.floor(h2(i, v, 21) * 13), 2, 2, accent);
      if (season === 'summer' && v === 0) for (let i = 0; i < 4; i++) p(5 + Math.floor(h2(i, 9, 22) * 13), 8 + Math.floor(h2(i, 9, 23) * 8), 2, 2, '#ff5a5a');
    }
    out.push(c);
  }
  return out;
}

export function darken(hex, f) { return mix(hex, '#000000', f); }
export function lighten(hex, f) { return mix(hex, '#ffffff', f); }
export function mix(a, b, f) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - f) + ((pb >> 16) & 255) * f);
  const g = Math.round(((pa >> 8) & 255) * (1 - f) + ((pb >> 8) & 255) * f);
  const bl = Math.round((pa & 255) * (1 - f) + (pb & 255) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

// ------------------------------------------------------------ crops

const SHAPE = {
  turnip: 'root', carrot: 'root', beet: 'root', strawberry: 'bush', tomato: 'stake', blueberry: 'bush', cranberry: 'bush',
  melon: 'vine', pumpkin: 'vine', sunflower: 'tall', corn: 'tall', wheat: 'grain', tulip: 'flower', snowdrop: 'flower', kale: 'leafy',
};

export function bakeCrop(id) {
  const c = CROPS[id];
  const shape = SHAPE[id];
  const frames = [];
  const leaf = '#5fb04a', leafD = '#3f8a35', leafL = '#86cf68';
  for (let s = 0; s <= STAGES + 1; s++) {
    const [cv, ctx] = canvas(T, 20);
    const p = painter(ctx);
    const base = 18; // ground line inside the 16×20 sprite
    if (s === STAGES + 1) {
      // Withered.
      p(7, base - 7, 2, 7, '#9c7a4a'); p(4, base - 6, 3, 2, '#b08d57'); p(9, base - 8, 3, 2, '#a07a45'); p(5, base - 2, 6, 2, '#8a6a3d');
      frames.push(cv); continue;
    }
    if (s === 0) { p(7, base - 3, 2, 3, leafD); p(5, base - 4, 2, 2, leaf); p(9, base - 4, 2, 2, leafL); frames.push(cv); continue; }
    if (s === 1) { p(7, base - 6, 2, 6, leafD); p(4, base - 7, 3, 3, leaf); p(9, base - 8, 3, 3, leafL); p(5, base - 3, 2, 2, leaf); frames.push(cv); continue; }
    const ripe = s === STAGES;
    const grown = s >= 3;
    switch (shape) {
      case 'root': {
        p(4, base - 9, 3, 6, leaf); p(9, base - 10, 3, 7, leafL); p(7, base - 11, 2, 9, leafD);
        if (grown) { p(3, base - 12, 2, 4, leaf); p(11, base - 12, 2, 4, leafL); }
        if (ripe) { p.oval(8, base - 2, 4, 2, c.color); p(6, base - 3, 4, 1, lighten(c.color, 0.3)); if (id === 'turnip') p(5, base - 2, 6, 2, c.accent); }
        break;
      }
      case 'bush': case 'leafy': {
        p.oval(8, base - 5, 6, 5, leafD); p.oval(8, base - 6, 5, 4, shape === 'leafy' ? c.color : leaf); p.oval(6, base - 8, 2, 2, leafL);
        if (shape === 'leafy') { p(4, base - 9, 2, 3, c.accent); p(10, base - 10, 2, 4, c.accent); if (grown) p(7, base - 11, 2, 4, lighten(c.color, 0.2)); }
        if (shape === 'bush' && grown) for (const [x, y] of [[4, 7], [10, 5], [7, 9], [12, 8]]) p(x, base - y, 2, 2, ripe ? c.color : '#ffffff');
        if (ripe && shape === 'bush') for (const [x, y] of [[5, 4], [11, 9]]) p(x, base - y, 2, 2, c.color);
        break;
      }
      case 'stake': {
        p(11, base - 15, 1, 15, '#b08d57');
        p(7, base - 12, 2, 12, leafD); p(4, base - 10, 4, 3, leaf); p(8, base - 13, 4, 3, leafL); p(4, base - 5, 4, 3, leaf);
        if (grown) p(8, base - 8, 3, 3, leaf);
        if (ripe) for (const [x, y] of [[4, 7], [9, 10], [6, 3]]) { p(x, base - y, 3, 3, c.color); p.dot(x, base - y, lighten(c.color, 0.4)); }
        break;
      }
      case 'vine': {
        p(2, base - 3, 12, 2, leafD); p(1, base - 6, 4, 3, leaf); p(11, base - 7, 4, 4, leafL); p(6, base - 5, 3, 3, leaf);
        if (grown && !ripe) p.dot(8, base - 2, '#ffe066');
        if (ripe) { p.oval(8, base - 4, 5, 4, c.color); p(5, base - 7, 4, 1, lighten(c.color, 0.3)); p(8, base - 9, 1, 2, '#6b4f2a'); if (id === 'melon') { p(5, base - 6, 1, 4, '#5a9a3a'); p(9, base - 7, 1, 5, '#5a9a3a'); } }
        break;
      }
      case 'tall': {
        const top = grown ? 17 : 13;
        p(7, base - top, 2, top, leafD);
        p(3, base - 8, 4, 2, leaf); p(9, base - 11, 4, 2, leafL); p(3, base - 13, 4, 2, leaf);
        if (id === 'corn' && ripe) { p(9, base - 13, 3, 6, c.color); p(9, base - 13, 3, 1, lighten(c.color, 0.4)); p(4, base - 11, 3, 5, c.color); }
        if (id === 'sunflower') { if (ripe) { p.oval(8, base - 16, 4, 3, c.color); p.oval(8, base - 16, 2, 1, c.accent); } else if (grown) p.oval(8, base - 16, 2, 2, leafL); }
        break;
      }
      case 'grain': {
        const col = ripe ? c.color : leaf;
        for (const x of [3, 6, 9, 12]) { p(x, base - (grown ? 13 : 10), 1, grown ? 13 : 10, ripe ? c.accent : leafD); p(x - 1, base - (grown ? 14 : 11), 3, 4, col); }
        break;
      }
      case 'flower': {
        p(7, base - 10, 2, 10, leafD); p(4, base - 5, 3, 2, leaf); p(9, base - 7, 3, 2, leafL);
        if (grown && !ripe) p(6, base - 13, 4, 3, leafL);
        if (ripe) {
          if (id === 'tulip') { p(5, base - 14, 6, 5, c.color); p(5, base - 15, 2, 2, c.color); p(9, base - 15, 2, 2, c.color); p(7, base - 13, 2, 3, lighten(c.color, 0.3)); }
          else { p(5, base - 13, 6, 3, c.color); p(6, base - 10, 4, 2, c.color); p.dot(7, base - 11, c.accent); p(7, base - 14, 2, 1, leaf); }
        }
        break;
      }
      default: break;
    }
    frames.push(cv);
  }
  return frames;
}

// ------------------------------------------------------------ people

export const PLAYER_PAL = { skin: '#f6c7a0', hair: '#7a4a2a', shirt: '#ff9fb2', pants: '#4f7cac', hat: '#f2d27a', band: '#e76f51' };
const HATS = { clem: 'chef', rowan: 'cap', bram: 'band', juniper: 'bow' };

// 16×20 chibi, feet at the bottom row. dir: down | up | left | right.
export function bakePerson(pal, extras = {}) {
  const out = {};
  for (const dir of ['down', 'up', 'left', 'right']) {
    out[dir] = [];
    for (let f = 0; f < 3; f++) {
      const [c, ctx] = canvas(16, 20);
      const p = painter(ctx);
      const side = dir === 'left' || dir === 'right';
      const step = f === 0 ? 0 : f === 1 ? 1 : -1;
      // Legs.
      const shoe = '#5a3b2a';
      if (side) {
        p(6 + step, 16, 2, 3, pal.pants); p(8 - step, 16, 2, 3, darken(pal.pants, 0.15));
        p(6 + step, 19, 2, 1, shoe); p(8 - step, 19, 2, 1, shoe);
      } else {
        p(5, 16 - (step > 0 ? 1 : 0), 2, 3, pal.pants); p(9, 16 - (step < 0 ? 1 : 0), 2, 3, pal.pants);
        p(5, 19 - (step > 0 ? 1 : 0), 2, 1, shoe); p(9, 19 - (step < 0 ? 1 : 0), 2, 1, shoe);
      }
      // Body and arms.
      p(4, 10, 8, 6, pal.shirt); p(4, 15, 8, 1, darken(pal.shirt, 0.15));
      if (extras.overalls) { p(5, 12, 6, 4, pal.pants); p(5, 10, 1, 2, pal.pants); p(10, 10, 1, 2, pal.pants); }
      if (extras.apron) p(5, 11, 6, 5, '#ffffff');
      if (side) { p(dir === 'left' ? 7 + step : 7 - step, 11, 2, 4, darken(pal.shirt, 0.1)); p(dir === 'left' ? 7 + step : 7 - step, 15, 2, 1, pal.skin); }
      else { p(2, 11 + (step > 0 ? 1 : 0), 2, 4, pal.shirt); p(12, 11 + (step < 0 ? 1 : 0), 2, 4, pal.shirt); p(2, 15 + (step > 0 ? 1 : 0), 2, 1, pal.skin); p(12, 15 + (step < 0 ? 1 : 0), 2, 1, pal.skin); }
      // Head.
      p(3, 2, 10, 8, pal.skin);
      p(3, 9, 10, 1, darken(pal.skin, 0.12));
      // Hair.
      const hair = pal.hair;
      if (dir === 'up') { p(3, 1, 10, 8, hair); p(4, 9, 8, 1, hair); }
      else if (side) {
        p(3, 1, 10, 3, hair);
        if (dir === 'left') { p(9, 2, 4, 6, hair); p(4, 6, 1, 1, '#2b1d14'); p(3, 7, 1, 1, '#f49a8b'); }
        else { p(3, 2, 4, 6, hair); p(11, 6, 1, 1, '#2b1d14'); p(12, 7, 1, 1, '#f49a8b'); }
      } else {
        p(3, 1, 10, 3, hair); p(3, 4, 1, 3, hair); p(12, 4, 1, 3, hair);
        if (extras.long) { p(2, 4, 2, 6, hair); p(12, 4, 2, 6, hair); }
        p(5, 6, 1, 2, '#2b1d14'); p(10, 6, 1, 2, '#2b1d14');
        p(4, 8, 2, 1, '#f49a8b'); p(10, 8, 2, 1, '#f49a8b');
        if (extras.beard) { p(4, 8, 8, 2, hair); p(5, 10, 6, 1, hair); }
      }
      if (extras.long && dir === 'up') p(3, 9, 10, 2, hair);
      // Hats.
      const hat = extras.hat;
      if (hat === 'straw') { p(1, 2, 14, 2, pal.hat); p(4, 0, 8, 3, pal.hat); p(4, 2, 8, 1, pal.band); p(1, 3, 14, 1, darken(pal.hat, 0.15)); }
      if (hat === 'chef') { p(4, -1 + 1, 8, 3, '#ffffff'); p(3, 0, 10, 2, '#ffffff'); p(4, 2, 8, 1, '#e9ecef'); }
      if (hat === 'cap') { p(3, 0, 10, 3, '#4a7c59'); if (dir === 'down') p(3, 3, 10, 1, '#3d6649'); if (side) p(dir === 'left' ? 1 : 12, 2, 3, 1, '#3d6649'); }
      if (hat === 'band') p(3, 2, 10, 1, '#e07a5f');
      if (hat === 'bow' && dir !== 'up') { p(10, 0, 4, 2, '#ef476f'); p(11, 2, 2, 1, '#ef476f'); }
      if (hat === 'bow' && dir === 'up') p(6, 0, 4, 2, '#ef476f');
      if (extras.beret) { p(3, 0, 10, 2, '#e5989b'); p(7, -1 + 1, 2, 1, '#e5989b'); }
      out[dir].push(c);
    }
  }
  return out;
}

export function bakeVillagers() {
  const out = {};
  for (const [id, v] of Object.entries(VILLAGERS)) {
    const extras = { hat: HATS[id] };
    if (id === 'rowan') extras.beard = true;
    if (id === 'mabel' || id === 'clem' || id === 'sol') extras.long = true;
    if (id === 'clem') extras.apron = true;
    if (id === 'sol') extras.beret = true;
    if (id === 'bram') extras.overalls = true;
    out[id] = bakePerson(v.palette, extras);
  }
  return out;
}

// Big friendly portrait for dialogue (48×48), built from the down sprite.
export function portrait(sprites, id) {
  const [c, ctx] = canvas(48, 48);
  ctx.fillStyle = '#fff4dc';
  ctx.fillRect(0, 0, 48, 48);
  ctx.drawImage(sprites[id].down[0], 0, 0, 16, 12, 0, 6, 48, 36);
  return c;
}

// ------------------------------------------------------------ animals

export function bakeAnimals() {
  const out = {};
  const frames = (w, h, fn) => [0, 1].map((f) => { const [c, ctx] = canvas(w, h); fn(painter(ctx), f); return c; });
  out.chicken = frames(12, 12, (p, f) => {
    p.oval(6, 7, 4, 3, '#ffffff'); p(2, 5, 3, 3, '#f1f3f5'); p(8, 2, 3, 4, '#ffffff');
    p(9, 1, 2, 1, '#e63946'); p(11, 4, 1, 1, '#ffb703'); p.dot(10, 3, '#2b2d42');
    p(5, 10, 1, 2 - f, '#ffb703'); p(7, 10, 1, 1 + f, '#ffb703'); p(4, 6, 3, 1, '#e9ecef');
  });
  out.cow = frames(20, 16, (p, f) => {
    p(3, 4, 13, 8, '#ffffff'); p(5, 5, 4, 3, '#2b2d42'); p(11, 8, 3, 3, '#2b2d42'); p(12, 4, 2, 2, '#2b2d42');
    p(15, 3, 5, 5, '#ffffff'); p(16, 7, 4, 2, '#f7b2bd'); p.dot(17, 4, '#2b2d42'); p(15, 2, 1, 2, '#e9d8a6'); p(19, 2, 1, 2, '#e9d8a6');
    p(4, 12, 2, 3 - f, '#ffffff'); p(13, 12, 2, 2 + f, '#ffffff'); p(7, 12, 2, 2 + f, '#e9ecef'); p(10, 12, 2, 3 - f, '#e9ecef');
    p(1, 5, 2, 1, '#ffffff'); p(0, 6, 1, 3, '#2b2d42'); p(9, 12, 2, 1, '#f7b2bd');
  });
  out.goat = frames(16, 14, (p, f) => {
    p(2, 5, 10, 6, '#f1e3c8'); p(11, 2, 4, 5, '#f1e3c8'); p(11, 0, 1, 2, '#8d6e63'); p(13, 0, 1, 2, '#8d6e63');
    p.dot(13, 3, '#2b2d42'); p(12, 7, 2, 2, '#e0cba8'); p(3, 11, 2, 3 - f, '#d9c4a0'); p(9, 11, 2, 2 + f, '#d9c4a0');
    p(0, 5, 2, 2, '#e0cba8'); p(4, 5, 6, 1, '#ffffff');
  });
  return out;
}

// ------------------------------------------------------------ critters and pickups

export function bakeCritters() {
  const out = {};
  for (const [id, cr] of Object.entries(CRITTERS)) {
    out[id] = [0, 1].map((f) => {
      const [c, ctx] = canvas(8, 8);
      const p = painter(ctx);
      const col = cr.color;
      if (id === 'butterfly' || id === 'moth') { const w = f ? 2 : 3; p(4 - w, 2, w, 3, col); p(4, 2, w, 3, col); p(3, 3, 2, 3, '#3d2c2e'); p.dot(4 - w, 2, lighten(col, 0.4)); }
      else if (id === 'bee') { p(2, 3, 4, 3, col); p(3, 3, 1, 3, '#2b2d42'); p(5, 3, 1, 3, '#2b2d42'); p(2, f ? 1 : 2, 3, 1, '#e9f5ff'); }
      else if (id === 'dragonfly') { p(1, 3, 6, 1, col); p(2, f ? 1 : 2, 2, 1, '#e9f5ff'); p(4, f ? 5 : 4, 2, 1, '#e9f5ff'); p(6, 2, 2, 2, darken(col, 0.3)); }
      else if (id === 'firefly') { p(3, 3, 2, 2, '#4a4e69'); p(3, 5, 2, 1, col); p.dot(2, f ? 2 : 3, '#e9f5ff'); }
      else if (id === 'robin') { p(2, 2, 4, 4, '#7f5539'); p(2, 4, 3, 2, col); p.dot(5, 3, '#2b2d42'); p(6, 3, 1, 1, '#ffb703'); p(1, f ? 2 : 4, 2, 1, '#7f5539'); }
      else if (id === 'snail') { p.oval(4, 4, 2, 2, col); p.dot(4, 4, darken(col, 0.3)); p(1, 6, 6, 1, '#d6ccc2'); p(6, 4 + f, 1, 2, '#d6ccc2'); }
      else { p(2, 3, 4, 3, col); p(4, 3, 1, 3, darken(col, 0.35)); p(1, 6, 1, 1, '#2b2d42'); p(6, 6 - f, 1, 1, '#2b2d42'); p(3, 2, 2, 1, '#2b2d42'); if (id === 'ladybug') { p.dot(3, 4, '#2b2d42'); p.dot(5, 5, '#2b2d42'); } }
      return c;
    });
  }
  return out;
}

const EGG_COLORS = ['#ffadad', '#fdffb6', '#9bf6ff', '#caffbf', '#bdb2ff'];

export function bakePickups() {
  const out = {};
  const one = (fn) => { const [c, ctx] = canvas(12, 12); fn(painter(ctx)); return c; };
  out.egg = one((p) => { p.oval(6, 7, 3, 4, '#fff3dc'); p(4, 5, 2, 2, '#ffffff'); });
  out.milk = one((p) => { p(3, 3, 6, 8, '#f8fbff'); p(4, 1, 4, 2, '#dfe7ef'); p(3, 6, 6, 2, '#7fc8f8'); });
  out.goatmilk = one((p) => { p(3, 3, 6, 8, '#fffaf0'); p(4, 1, 4, 2, '#e9dcc6'); p(3, 6, 6, 2, '#f4a261'); });
  out.festival = EGG_COLORS.map((col, i) => one((p) => { p.oval(6, 7, 3, 4, col); p(3, 6 + (i % 2), 7, 1, '#ffffff'); p(4, 9 - (i % 2), 5, 1, darken(col, 0.2)); }));
  return out;
}

// ------------------------------------------------------------ objects

export function bakeObjects(season) {
  const out = {};
  const one = (w, h, fn) => { const [c, ctx] = canvas(w, h); fn(painter(ctx)); return c; };
  const snow = season === 'winter';
  out.stone = one(16, 16, (p) => { p.oval(8, 10, 6, 4, '#8d99ae'); p.oval(7, 9, 5, 3, '#adb5bd'); p(5, 7, 3, 1, '#ced4da'); if (snow) p(4, 6, 7, 2, '#ffffff'); });
  out.weed = one(16, 16, (p) => { const g = snow ? '#7a9a8a' : '#4f9d4a'; p(4, 8, 2, 6, g); p(7, 6, 2, 8, '#3e8a3a'); p(10, 9, 2, 5, g); p(3, 7, 2, 2, g); p(11, 8, 2, 2, g); });
  out.tuft = one(16, 16, (p) => {
    const g = SEASON_PAL[season].dark, l = SEASON_PAL[season].light;
    for (const [x, hh] of [[3, 6], [5, 8], [7, 5], [9, 9], [11, 6]]) p(x, 14 - hh, 1, hh, x % 4 === 1 ? l : g);
    if (snow) p(3, 7, 10, 1, '#ffffff');
  });
  out.sprinkler = one(16, 16, (p) => { p.oval(8, 12, 5, 2, '#6c757d'); p(6, 6, 4, 6, '#adb5bd'); p(5, 5, 6, 2, '#dee2e6'); p(7, 3, 2, 2, '#4dabf7'); });
  // Decorations (16×24 so tall ones can poke up).
  const deco = (id, fn) => { out[id] = one(16, 24, fn); };
  deco('path', (p) => { p(1, 9, 14, 14, '#d6ccc2'); p(2, 10, 12, 12, '#e3d5ca'); p(2, 16, 6, 1, '#c9b8a8'); p(9, 12, 1, 6, '#c9b8a8'); });
  deco('flowerpot', (p) => { p(4, 16, 8, 7, '#e07a5f'); p(3, 15, 10, 2, '#f2a488'); p(5, 10, 2, 5, '#5fb04a'); p(9, 9, 2, 6, '#5fb04a'); p(3, 7, 4, 4, '#ff7eb6'); p(9, 6, 4, 4, '#ffd23f'); });
  deco('bench', (p) => { p(1, 12, 14, 3, '#c8935a'); p(1, 17, 14, 2, '#c8935a'); p(2, 19, 2, 4, '#7f5539'); p(12, 19, 2, 4, '#7f5539'); p(1, 14, 14, 1, '#9b6a3a'); });
  deco('lamp', (p) => { p(7, 6, 2, 17, '#495057'); p(4, 1, 8, 6, '#343a40'); p(5, 2, 6, 4, '#ffe8a3'); p(5, 22, 6, 2, '#495057'); });
  deco('gnome', (p) => { p(5, 16, 6, 7, '#4895ef'); p(5, 12, 6, 4, '#ffd6a5'); p(5, 15, 6, 3, '#ffffff'); p(4, 6, 8, 6, '#e63946'); p(6, 3, 4, 3, '#e63946'); p(7, 1, 2, 2, '#e63946'); p.dot(6, 13, '#2b2d42'); p.dot(9, 13, '#2b2d42'); });
  deco('birdbath', (p) => { p(6, 14, 4, 8, '#adb5bd'); p(2, 10, 12, 4, '#ced4da'); p(3, 10, 10, 2, '#74c0fc'); p(4, 21, 8, 2, '#adb5bd'); p(10, 7, 3, 3, '#7f5539'); p(12, 8, 1, 1, '#ffb703'); });
  deco('scarecrow', (p) => { p(7, 8, 2, 15, '#7f5539'); p(2, 10, 12, 2, '#7f5539'); p(4, 9, 8, 7, '#e76f51'); p(5, 3, 6, 6, '#f2d27a'); p(3, 2, 10, 2, '#c99a3b'); p(5, 0, 6, 3, '#c99a3b'); p.dot(6, 5, '#2b2d42'); p.dot(9, 5, '#2b2d42'); p(2, 12, 2, 2, '#f2d27a'); p(12, 12, 2, 2, '#f2d27a'); });
  deco('bunny', (p) => { p.oval(8, 18, 5, 4, '#f8f9fa'); p.oval(8, 12, 4, 3, '#f8f9fa'); p(5, 4, 2, 7, '#f8f9fa'); p(9, 4, 2, 7, '#f8f9fa'); p(6, 5, 1, 5, '#ffc8dd'); p(10, 5, 1, 5, '#ffc8dd'); p.dot(6, 12, '#2b2d42'); p.dot(10, 12, '#2b2d42'); p(3, 21, 10, 2, '#ced4da'); });
  deco('lantern', (p) => { p(7, 10, 2, 13, '#7f5539'); p(4, 2, 8, 9, '#ff8fab'); p(4, 4, 8, 1, '#ffb3c6'); p(4, 8, 8, 1, '#e5678a'); p(6, 0, 4, 2, '#7f5539'); p(7, 11, 2, 2, '#ffd166'); });
  deco('ribbon', (p) => { p(7, 12, 2, 11, '#7f5539'); p.oval(8, 7, 5, 5, '#ffd166'); p.oval(8, 7, 3, 3, '#f4a261'); p(5, 11, 2, 5, '#4895ef'); p(9, 11, 2, 5, '#4895ef'); });
  deco('snowman', (p) => { p.oval(8, 18, 6, 5, '#ffffff'); p.oval(8, 9, 4, 4, '#ffffff'); p(5, 2, 6, 4, '#2b2d42'); p(4, 5, 8, 1, '#2b2d42'); p.dot(7, 8, '#2b2d42'); p.dot(10, 8, '#2b2d42'); p(9, 10, 3, 1, '#f77f00'); p(4, 12, 8, 2, '#e63946'); p.dot(8, 16, '#2b2d42'); p.dot(8, 19, '#2b2d42'); });
  return out;
}

// ------------------------------------------------------------ buildings

// Each building sprite covers its footprint plus a roof that rises above it.
export function bakeBuildings(season, upgrades) {
  const out = {};
  const snow = season === 'winter';
  const roofSnow = (p, x, y, w) => { if (snow) { p(x, y, w, 3, '#ffffff'); for (let i = 0; i < w; i += 3) p(x + i, y + 3, 2, 1 + (i % 2), '#ffffff'); } };
  const win = (p, x, y, lit = '#fff1b8') => { p(x, y, 8, 7, '#6b4f3a'); p(x + 1, y + 1, 6, 5, lit); p(x + 4, y + 1, 1, 5, '#6b4f3a'); p(x + 1, y + 3, 6, 1, '#6b4f3a'); p(x - 1, y + 7, 10, 2, '#e07a5f'); p(x, y + 7, 2, 1, '#ff7eb6'); p(x + 5, y + 7, 2, 1, '#ffd23f'); };
  const door = (p, x, y, col = '#9c6644') => { p(x, y, 10, 14, '#6b4f3a'); p(x + 1, y + 1, 8, 13, col); p(x + 7, y + 7, 1, 2, '#ffd166'); p(x + 1, y + 1, 8, 1, lighten(col, 0.2)); };
  const house = (w, h, roof, wall, tag) => {
    const W = w * T, H = h * T + 16;
    const [c, ctx] = canvas(W, H);
    const p = painter(ctx);
    const top = 16 + Math.floor(h * T * 0.42);
    p(2, top, W - 4, H - top - 1, wall);
    p(2, H - 4, W - 4, 3, darken(wall, 0.15));
    for (let y = top + 4; y < H - 4; y += 6) p(2, y, W - 4, 1, darken(wall, 0.06));
    // Roof: stepped gable.
    for (let i = 0; i <= top; i++) {
      const inset = Math.max(0, Math.floor((top - i) * 0.35) - 2);
      p(inset, i, W - inset * 2, 1, i % 4 === 0 ? darken(roof, 0.12) : roof);
    }
    p(0, top - 2, W, 3, darken(roof, 0.25));
    roofSnow(p, 6, 2, W - 12);
    return { c, p, W, H, top, tag };
  };
  {
    const b = house(5, 4, '#e76f51', '#fff1d6');
    door(b.p, 32, b.H - 17); win(b.p, 10, b.H - 30); win(b.p, 60, b.H - 30);
    b.p(58, 4, 8, 14, '#9c6644'); b.p(57, 3, 10, 2, '#7f5539');
    out.house = b.c;
  }
  {
    const b = house(4, 3, '#e5989b', '#ffe8a3');
    b.p(24, b.H - 12, 12, 11, '#7f5539'); b.p(26, b.H - 10, 8, 9, '#3d2c2e'); win(b.p, 6, b.H - 26);
    out.coop = b.c;
  }
  {
    const W = 6 * T, H = 4 * T + 16;
    const [c, ctx] = canvas(W, H);
    const p = painter(ctx);
    p(2, 26, W - 4, H - 27, '#d64545'); for (let x = 6; x < W - 4; x += 8) p(x, 30, 1, H - 32, '#b83838');
    for (let i = 0; i < 28; i++) { const inset = Math.max(0, Math.floor((28 - i) * 0.6) - 4); p(inset, i, W - inset * 2, 1, i % 4 === 0 ? '#6d6875' : '#8d8a96'); }
    roofSnow(p, 8, 2, W - 16);
    p(36, H - 26, 24, 25, '#fff1d6'); p(38, H - 24, 20, 23, '#b83838'); p(38, H - 24, 20, 2, '#fff1d6'); p(47, H - 24, 2, 23, '#fff1d6');
    for (let i = 0; i < 20; i++) { p(38 + i, H - 24 + i, 2, 1, '#fff1d6'); p(56 - i, H - 24 + i, 2, 1, '#fff1d6'); }
    p(42, 10, 12, 10, '#fff1d6'); p(44, 12, 8, 6, '#3d2c2e');
    out.barn = c;
  }
  {
    const b = house(7, 5, '#5e9fd6', '#fdf0d5');
    // Striped awning and sign.
    for (let x = 4; x < b.W - 4; x += 8) { b.p(x, b.top + 4, 4, 7, '#ff8fab'); b.p(x + 4, b.top + 4, 4, 7, '#ffffff'); }
    b.p(4, b.top + 11, b.W - 8, 1, '#e5678a');
    b.p(34, b.top - 10, 44, 12, '#ffffff'); b.p(35, b.top - 9, 42, 10, '#ffe066');
    text(b.p, 'STORE', 38, b.top - 7, '#6b4f3a');
    door(b.p, 51, b.H - 17, '#5e9fd6'); win(b.p, 12, b.H - 30); win(b.p, 90, b.H - 30);
    out.shop = b.c;
  }
  {
    const b = house(6, 5, '#f4a6c0', '#fff4e6');
    b.p(28, b.top - 9, 40, 11, '#ffffff'); b.p(29, b.top - 8, 38, 9, '#d4a373');
    text(b.p, 'BAKERY', 31, b.top - 6, '#ffffff');
    door(b.p, 28, b.H - 17, '#d4a373'); win(b.p, 8, b.H - 30); win(b.p, 70, b.H - 30);
    b.p(76, 2, 8, 14, '#c9ada7');
    out.bakery = b.c;
  }
  {
    const b = house(5, 4, '#8d6e63', '#e6ccb2');
    for (let x = 4; x < b.W - 4; x += 5) b.p(x, b.top + 2, 1, b.H - b.top - 6, '#cfae8f');
    door(b.p, 28, b.H - 17, '#7f5539'); win(b.p, 8, b.H - 30);
    b.p(52, b.H - 26, 20, 3, '#adb5bd'); b.p(70, b.H - 28, 2, 7, '#7f5539');
    out.workshop = b.c;
  }
  out.cottage = {};
  for (const tint of ['#ffb4a2', '#a3c4f3', '#ffd6a5', '#b9fbc0', '#cdb4db']) {
    const b = house(4, 4, darken(tint, 0.15), '#fffaf0');
    door(b.p, 12, b.H - 17, darken(tint, 0.35)); win(b.p, 44, b.H - 30);
    out.cottage[tint] = b.c;
  }
  // Greenhouse: glass frame over its whole rect (6×7 tiles).
  {
    const W = 6 * T, H = 7 * T + 8;
    const [c, ctx] = canvas(W, H);
    const p = painter(ctx);
    const ok = upgrades.greenhouse;
    const frame = ok ? '#f8f9fa' : '#a59e94', glass = ok ? 'rgba(190,235,255,0.55)' : 'rgba(150,170,170,0.35)';
    // Back wall (top row) is tall glass; side walls thin; front wall low with a door gap.
    p(0, 0, W, 24, frame); p(2, 2, W - 4, 20, glass);
    for (let x = 2; x < W; x += 12) p(x, 2, 1, 20, frame);
    if (!ok) { p(20, 6, 6, 5, '#7d7468'); p(50, 4, 8, 7, '#7d7468'); p(70, 12, 5, 6, '#7d7468'); }
    p(0, 24, 4, H - 24, frame); p(W - 4, 24, 4, H - 24, frame);
    p(1, 26, 2, H - 30, glass); p(W - 3, 26, 2, H - 30, glass);
    const fy = H - 18;
    p(0, fy, 3 * T - 0, 18, frame); p(4 * T, fy, 2 * T, 18, frame);
    p(2, fy + 2, 3 * T - 4, 12, glass); p(4 * T + 2, fy + 2, 2 * T - 6, 12, glass);
    if (!ok) { p(3 * T, fy, T, 18, '#8d6e63'); for (let i = 0; i < 3; i++) p(3 * T + 1, fy + 3 + i * 5, T - 2, 2, '#6d4c41'); }
    if (snow) { p(0, 0, W, 3, '#ffffff'); }
    out.greenhouse = c;
  }
  return out;
}

// 3×5 pixel font for signs.
const GLYPHS = {
  S: '111100111001111', T: '111010010010010', O: '111101101101111', R: '110101110101101', E: '111100110100111',
  B: '110101110101110', A: '010101111101101', K: '101101110101101', Y: '101101010010010',
};
function text(p, str, x, y, col) {
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') p.dot(x + (i % 3), y + Math.floor(i / 3), col);
    x += 4;
  }
}

// Small props (one tile, drawn 16×24 with height).
export function bakeProps(season) {
  const out = {};
  const snow = season === 'winter';
  const one = (fn, w = 16, h = 24) => { const [c, ctx] = canvas(w, h); fn(painter(ctx)); return c; };
  out.bin = one((p) => { p(1, 10, 14, 13, '#b5835a'); p(1, 10, 14, 2, '#d9a77c'); p(0, 7, 16, 4, '#8d6e63'); p(2, 15, 12, 1, '#9b6a3a'); p(2, 19, 12, 1, '#9b6a3a'); p(6, 8, 4, 1, '#ffd166'); if (snow) p(0, 6, 16, 2, '#ffffff'); });
  out.well = one((p) => { p(2, 13, 12, 10, '#adb5bd'); p(2, 13, 12, 2, '#ced4da'); p(4, 15, 8, 3, '#3a86ff'); p(2, 4, 2, 10, '#7f5539'); p(12, 4, 2, 10, '#7f5539'); p(0, 1, 16, 4, '#e76f51'); p(7, 6, 2, 6, '#7f5539'); if (snow) p(0, 0, 16, 2, '#ffffff'); });
  out.trough = [0, 1, 2].map((lvl) => one((p) => { p(0, 14, 16, 8, '#9c6644'); p(1, 15, 14, 3, '#5e3b22'); if (lvl) p(1, 14, 14, lvl === 2 ? 3 : 2, '#e9c46a'); p(1, 22, 2, 2, '#7f5539'); p(13, 22, 2, 2, '#7f5539'); }));
  out.counter = one((p) => { p(0, 10, 16, 13, '#c8935a'); p(0, 10, 16, 3, '#e2b47c'); p(0, 22, 16, 1, '#9b6a3a'); p(3, 5, 5, 5, '#ff8fab'); p(9, 6, 5, 4, '#a8e6a1'); });
  out.board = one((p) => { p(1, 14, 2, 10, '#7f5539'); p(13, 14, 2, 10, '#7f5539'); p(0, 3, 16, 13, '#9c6644'); p(1, 4, 14, 11, '#d4a373'); p(2, 5, 5, 4, '#ffffff'); p(8, 6, 5, 5, '#fff3b0'); p(3, 10, 4, 4, '#caffbf'); p.dot(4, 5, '#e63946'); p.dot(10, 6, '#4895ef'); }, 16, 24);
  out.stall = [false, true].map((open) => one((p) => {
    p(0, 12, 16, 11, '#c8935a'); p(0, 12, 16, 2, '#e2b47c');
    p(1, 0, 2, 12, '#7f5539'); p(13, 0, 2, 12, '#7f5539');
    for (let x = 0; x < 16; x += 4) { p(x, 0, 2, 5, '#ff595e'); p(x + 2, 0, 2, 5, '#ffffff'); }
    if (open) { p(2, 9, 4, 3, '#ff9a3c'); p(7, 9, 3, 3, '#ff5a6e'); p(11, 9, 3, 3, '#8ed36a'); }
  }));
  out.planter = one((p) => {
    p(0, 12, 16, 11, '#b07d52'); p(0, 12, 16, 2, '#d4a373'); p(1, 22, 14, 1, '#8d6040');
    const pal = SEASON_PAL[season];
    p(1, 7, 14, 6, snow ? '#ffffff' : pal.bush);
    if (!snow) for (let i = 0; i < 5; i++) { const c = pal.flower[i % 4]; p(2 + i * 3, 5 + (i % 2) * 2, 2, 2, c); }
    else { p.dot(4, 8, '#e63946'); p.dot(10, 9, '#e63946'); }
  });
  out.fountain = (() => {
    const [c, ctx] = canvas(32, 40);
    const p = painter(ctx);
    p.oval(16, 30, 15, 8, '#b8b0c8'); p.oval(16, 29, 14, 7, '#d8d0e4'); p.oval(16, 29, 11, 5, snow ? '#d6ecf7' : '#7ec8e3');
    p(13, 12, 6, 17, '#c9c0d8'); p(13, 12, 2, 17, '#e4def0'); p.oval(16, 12, 7, 3, '#d8d0e4'); p.oval(16, 11, 5, 2, snow ? '#d6ecf7' : '#a5dcf0');
    p(15, 4, 2, 7, '#c9c0d8'); p.oval(16, 4, 2, 2, '#e4def0');
    if (!snow) { p(11, 14, 1, 6, '#bfe8f7'); p(20, 14, 1, 6, '#bfe8f7'); p(8, 26, 3, 1, '#ffffff'); p(22, 27, 3, 1, '#ffffff'); }
    else p(9, 22, 14, 2, '#ffffff');
    return c;
  })();
  out.townlamp = one((p) => { p(7, 5, 2, 18, '#3d405b'); p(4, 0, 8, 6, '#3d405b'); p(5, 1, 6, 4, '#ffe8a3'); p(5, 21, 6, 3, '#3d405b'); if (snow) p(4, 0, 8, 1, '#ffffff'); });
  out.lantern = [false, true].map((lit) => one((p) => { p(7, 8, 2, 15, '#6b4f3a'); p(4, 2, 8, 7, lit ? '#ffd166' : '#e9c2cf'); p(4, 4, 8, 1, lit ? '#fff3b0' : '#f5d5de'); p(6, 0, 4, 2, '#6b4f3a'); p(5, 22, 6, 2, '#6b4f3a'); }));
  return out;
}

// Soft round glow for lights (drawn additively at night).
export function bakeGlow(r = 32, color = '255,214,140') {
  const [c, ctx] = canvas(r * 2, r * 2);
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `rgba(${color},0.9)`);
  g.addColorStop(0.4, `rgba(${color},0.35)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r * 2, r * 2);
  return c;
}

export function bakeShadow() {
  const [c, ctx] = canvas(14, 6);
  painter(ctx).oval(7, 3, 6, 2, 'rgba(40,50,60,0.28)');
  return c;
}

// Tool sprites held while working (12×12).
export function bakeTools() {
  const out = {};
  const one = (fn) => { const [c, ctx] = canvas(12, 12); fn(painter(ctx)); return c; };
  out.hoe = one((p) => { p(5, 2, 2, 10, '#9c6644'); p(2, 0, 7, 3, '#adb5bd'); p(2, 2, 2, 2, '#868e96'); });
  out.can = one((p) => { p(2, 4, 7, 6, '#4dabf7'); p(2, 4, 7, 1, '#a5d8ff'); p(9, 5, 3, 1, '#4dabf7'); p(11, 4, 1, 2, '#1c7ed6'); p(3, 2, 5, 2, '#1c7ed6'); });
  out.scythe = one((p) => { p(5, 2, 2, 10, '#9c6644'); p(0, 0, 8, 2, '#dee2e6'); p(0, 2, 2, 2, '#dee2e6'); });
  out.rod = one((p) => { p(1, 11, 1, 1, '#7f5539'); for (let i = 0; i < 10; i++) p.dot(1 + i, 10 - i, '#9c6644'); p(11, 0, 1, 6, '#e9ecef'); });
  out.net = one((p) => { p(5, 5, 2, 7, '#9c6644'); p.oval(6, 3, 4, 3, '#f8f9fa'); p.oval(6, 3, 3, 2, 'rgba(255,255,255,0.4)'); });
  return out;
}

// ------------------------------------------------------------ item icons (UI)

// 16×16 icons for every item and tool, used by the DOM menus as data URLs.
export function bakeIcons(pickups, objects, tools) {
  const icons = {};
  const one = (fn) => { const [c, ctx] = canvas(16, 16); fn(painter(ctx), ctx); return c; };
  for (const [id, c] of Object.entries(CROPS)) {
    icons[id] = one((p) => produceIcon(p, id, c));
    icons[`${id}_seed`] = one((p, ctx) => { p(3, 2, 10, 13, '#f4e1c1'); p(3, 2, 10, 2, '#e0c49a'); p(4, 5, 8, 7, '#ffffff'); ctx.drawImage(icons[id], 0, 0, 16, 16, 4, 5, 8, 8); p(3, 14, 10, 1, '#c9a678'); });
  }
  for (const [id, f] of Object.entries(FISH)) icons[id] = one((p) => { p.oval(7, 8, 5, 3, f.color); p(12, 6, 3, 5, darken(f.color, 0.15)); p(3, 7, 1, 1, '#2b2d42'); p(5, 6, 4, 1, lighten(f.color, 0.4)); if (id === 'koi') p(6, 8, 3, 2, '#ff7b00'); });
  icons.egg = one((p) => { p.oval(8, 9, 4, 5, '#fff3dc'); p(6, 6, 2, 2, '#ffffff'); });
  icons.milk = one((p) => { p(5, 4, 6, 11, '#f8fbff'); p(6, 1, 4, 3, '#dfe7ef'); p(5, 8, 6, 3, '#7fc8f8'); });
  icons.goatmilk = one((p) => { p(5, 4, 6, 11, '#fffaf0'); p(6, 1, 4, 3, '#e9dcc6'); p(5, 8, 6, 3, '#f4a261'); });
  const jar = (col) => one((p) => { p(4, 5, 8, 10, col); p(4, 3, 8, 3, '#e9ecef'); p(5, 7, 2, 5, lighten(col, 0.4)); p(5, 10, 6, 3, '#fff3dc'); });
  icons.jam = jar(GOODS.jam.color); icons.bluejam = jar(GOODS.bluejam.color); icons.cranjam = jar(GOODS.cranjam.color);
  icons.cheese = one((p) => { for (let i = 0; i < 8; i++) p(3, 5 + i, 3 + i, 1, '#ffd166'); p(3, 13, 11, 2, '#f4a261'); p.dot(6, 9, '#f4a261'); p.dot(8, 11, '#f4a261'); });
  icons.goatcheese = one((p) => { p.oval(8, 9, 6, 4, '#fff1c1'); p(3, 10, 11, 3, '#f1e3c8'); p(5, 7, 3, 1, '#ffffff'); });
  icons.bread = one((p) => { p.oval(8, 10, 6, 4, '#d4a373'); p(4, 7, 8, 3, '#e6b98a'); p(5, 8, 1, 3, '#b07d52'); p(8, 7, 1, 3, '#b07d52'); p(11, 8, 1, 3, '#b07d52'); });
  icons.pie = one((p) => { p.oval(8, 10, 7, 4, '#e9c46a'); p.oval(8, 9, 6, 3, '#e76f51'); p(3, 9, 10, 1, '#f4a261'); p(5, 7, 1, 4, '#f4a261'); p(10, 7, 1, 4, '#f4a261'); });
  icons.omelette = one((p) => { p.oval(8, 10, 7, 3, '#f8f9fa'); p.oval(8, 9, 5, 3, '#ffe08a'); p(6, 8, 2, 1, '#5fb04a'); });
  icons.soup = one((p) => { p.oval(8, 10, 7, 4, '#f8f9fa'); p.oval(8, 9, 6, 2, '#90be6d'); p(5, 9, 2, 1, '#ff9a3c'); p(9, 8, 2, 1, '#f4e6f0'); p(4, 3, 1, 3, '#dee2e6'); p(8, 2, 1, 3, '#dee2e6'); });
  icons.hay = one((p) => { p(2, 6, 12, 9, '#e9c46a'); p(2, 6, 12, 2, '#f4d58d'); for (let x = 3; x < 14; x += 3) p(x, 8, 1, 6, '#c99a3b'); p(2, 10, 12, 1, '#a0522d'); });
  icons.sprinkler = one((p, ctx) => ctx.drawImage(objects.sprinkler, 0, 0));
  icons.egghunt = one((p, ctx) => ctx.drawImage(pickups.festival[0], 0, 0, 12, 12, 2, 2, 12, 12));
  for (const id of Object.keys(DECOR)) icons[id] = one((p, ctx) => ctx.drawImage(objects[id], 0, 2, 16, 22, 2, 0, 12, 16));
  for (const [id, cv] of Object.entries(tools)) icons[id] = one((p, ctx) => ctx.drawImage(cv, 0, 0, 12, 12, 1, 1, 14, 14));
  return icons;
}

// Icon canvases to 32×32 PNG data URLs, a few per step so loading stays smooth.
export function* iconUrls(icons, urls, perStep = 8) {
  let n = 0;
  for (const [id, c] of Object.entries(icons)) {
    const [big, bctx] = canvas(32, 32);
    bctx.drawImage(c, 0, 0, 32, 32);
    urls[id] = big.toDataURL();
    if (++n % perStep === 0) yield;
  }
  for (const id of Object.keys(ITEMS)) if (!urls[id]) urls[id] = urls.hay;
}

function produceIcon(p, id, c) {
  const col = c.color, acc = c.accent;
  switch (id) {
    case 'turnip': p.oval(8, 10, 5, 4, col); p(4, 10, 8, 3, acc); p(7, 2, 2, 5, '#5fb04a'); p(4, 3, 3, 3, '#5fb04a'); p(9, 3, 3, 3, '#86cf68'); break;
    case 'carrot': for (let i = 0; i < 9; i++) p(6 + Math.floor(i / 3), 5 + i, 4 - Math.floor(i / 3), 1, col); p(6, 1, 1, 5, acc); p(8, 1, 1, 5, acc); p(10, 2, 1, 4, acc); break;
    case 'beet': p.oval(8, 10, 4, 4, col); p(8, 14, 1, 2, col); p(6, 2, 2, 5, acc); p(9, 3, 2, 4, acc); break;
    case 'strawberry': case 'cranberry': p.oval(8, 9, 5, 5, col); p(5, 3, 6, 2, '#5fb04a'); p.dot(6, 8, '#fff3b0'); p.dot(9, 10, '#fff3b0'); p.dot(7, 12, '#fff3b0'); break;
    case 'blueberry': for (const [x, y] of [[5, 8], [10, 7], [8, 11]]) { p.oval(x, y, 3, 3, col); p.dot(x, y - 1, '#c9d1ff'); } break;
    case 'tomato': p.oval(8, 9, 6, 5, col); p(6, 3, 4, 2, acc); p(5, 6, 2, 2, lighten(col, 0.4)); break;
    case 'melon': p.oval(8, 9, 7, 5, col); for (let x = 3; x < 14; x += 3) p(x, 5, 1, 9, '#5a9a3a'); break;
    case 'pumpkin': p.oval(8, 10, 7, 5, col); p(5, 6, 1, 9, darken(col, 0.15)); p(10, 6, 1, 9, darken(col, 0.15)); p(7, 2, 2, 4, '#6b4f2a'); break;
    case 'sunflower': p.oval(8, 8, 6, 6, col); p.oval(8, 8, 3, 3, acc); p(7, 13, 2, 3, '#5fb04a'); break;
    case 'corn': p(5, 3, 6, 11, col); p(5, 3, 6, 1, lighten(col, 0.4)); p(3, 8, 3, 7, '#6cbf4f'); p(10, 8, 3, 7, '#6cbf4f'); break;
    case 'wheat': for (const x of [4, 8, 12]) { p(x, 6, 1, 9, acc); p(x - 1, 2, 3, 5, col); } break;
    case 'tulip': p(7, 8, 2, 7, '#5fb04a'); p(4, 2, 8, 7, col); p(4, 1, 2, 2, col); p(10, 1, 2, 2, col); p(7, 3, 2, 4, lighten(col, 0.3)); break;
    case 'snowdrop': p(7, 6, 2, 9, '#5fb04a'); p(4, 3, 8, 5, col); p(5, 8, 6, 2, col); p.dot(8, 6, acc); break;
    case 'kale': p.oval(8, 9, 6, 6, col); p(4, 4, 3, 5, acc); p(9, 3, 3, 6, acc); p(7, 12, 2, 4, '#3d8c4c'); break;
    default: p.oval(8, 8, 5, 5, col);
  }
}

export { EGG_COLORS };
