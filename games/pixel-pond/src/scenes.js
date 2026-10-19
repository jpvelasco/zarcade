// Starter scenes, built for whatever grid the screen gives. Pure and seeded.
//
// A builder fills a World and returns `anchors`: named points the autoplayer
// paints at. Goal guides (a "hill top" line, a bowl outline) go in
// world.markers, so a resize moves them with the garden.
import {
  EMPTY, WATER, SOIL, SEED, ACORN, STONE, LAVA, ICE, STEM, LEAF, FLOWER, FISH,
  K_FLOWER, FLOWER_COLOURS,
} from './elements.js';
import { mulberry32 } from './rng.js';
import { MORNING } from './world.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------ helpers

export function fillRect(world, x0, y0, x1, y1, el, a = 0) {
  const { w, h } = world;
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) world.put(y * w + x, el, a);
  }
}

function fillEllipse(world, cx, cy, rx, ry, el, a = 0) {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) world.put(y * world.w + x, el, a);
    }
  }
}

// Smooth 1D value noise in [-1, 1].
function noise1(rand, length, period) {
  const knots = Array.from({ length: Math.ceil(length / period) + 2 }, () => rand() * 2 - 1);
  return (x) => {
    const k = Math.floor(x / period);
    const t = x / period - k;
    const s = t * t * (3 - 2 * t);
    return knots[k] * (1 - s) + knots[k + 1] * s;
  };
}

// The ground line: about a fifth of the screen, deeper on tall screens.
export function groundTop(h) {
  return h - clamp(Math.round(h * 0.22), 12, 40);
}

// Soil over a stone bed, with a gently rolling surface. Returns the surface
// height of every column.
function ground(world, rand, { top, amp = 2, wet = 0, period = 24 } = {}) {
  const { w, h } = world;
  const n = noise1(rand, w, period);
  const bed = noise1(rand, w, 9);
  const surface = new Int16Array(w);
  for (let x = 0; x < w; x++) {
    const sy = clamp(Math.round(top + n(x) * amp), 2, h - 2);
    surface[x] = sy;
    const rock = h - 3 - Math.round((bed(x) + 1) * 1.5);
    for (let y = sy; y < h; y++) world.put(y * w + x, y >= rock ? STONE : SOIL, y >= rock ? 0 : wet);
  }
  return surface;
}

// A stone-lined basin cut down from the surface: interior x0..x1, floor at
// y1, open to the sky. Filled with `fill` (or left empty).
function basin(world, x0, x1, top, y1, fill = EMPTY) {
  fillRect(world, x0 - 2, top, x1 + 2, y1 + 2, STONE);
  fillRect(world, x0, 0, x1, y1, EMPTY);
  if (fill !== EMPTY) fillRect(world, x0, top + 1, x1, y1, fill);
}

function boulder(world, cx, cy, r) {
  fillEllipse(world, cx, cy, r * 1.3, r, STONE);
}

// A finished flower, for scenes that start in bloom.
function plantFlower(world, x, base, height, colour) {
  const { w } = world;
  for (let k = 1; k <= height; k++) {
    const y = base - k;
    if (y < 1) return;
    world.put(y * w + x, k === height ? FLOWER : STEM, 0, k === height ? K_FLOWER | 8 | (colour << 4) : K_FLOWER);
    if (k === Math.floor(height / 2)) world.put(y * w + x + 1, LEAF, 0, K_FLOWER);
  }
  const top = base - height;
  const petal = K_FLOWER | (colour << 4);
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) {
    const xx = x + dx;
    const yy = top + dy;
    if (xx >= 0 && xx < w && yy >= 0) world.put(yy * w + xx, FLOWER, 0, petal);
  }
}

// Mirror the garden left to right (for daily variety).
export function mirror(world, anchors) {
  const { w, h } = world;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w >> 1; x++) world.swap(y * w + x, y * w + (w - 1 - x));
  }
  world.clock.fill(0);
  for (const m of world.markers) {
    if (m.x !== undefined) m.x = w - 1 - m.x;
    if (m.x0 !== undefined) [m.x0, m.x1] = [w - 1 - m.x1, w - 1 - m.x0];
  }
  const out = {};
  for (const [k, v] of Object.entries(anchors)) {
    out[k] = { ...v };
    if (v.x !== undefined) out[k].x = w - 1 - v.x;
    if (v.x0 !== undefined) { out[k].x0 = w - 1 - v.x1; out[k].x1 = w - 1 - v.x0; }
  }
  return out;
}

// ------------------------------------------------------------ scenes

export const SCENES = {
  // Rolling soil, a little pond and a few boulders: free play and the title.
  meadow(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    const surface = ground(world, rand, { top, amp: 4, wet: 3, period: 30 });
    const px0 = Math.round(w * (0.55 + rand() * 0.15));
    const px1 = Math.min(w - 4, px0 + clamp(Math.round(w * 0.18), 10, 50));
    const depth = clamp(Math.round(h * 0.07), 5, 14);
    basin(world, px0, px1, top - 1, top + depth, WATER);
    boulder(world, Math.round(w * 0.2), surface[Math.round(w * 0.2)], 2.5);
    world.time = MORNING;
    return { anchors: { pond: { x: (px0 + px1) >> 1, y: top - 4 }, field: { x0: Math.round(w * 0.08), x1: Math.round(w * 0.45), y: top - 8 } } };
  },

  // The title screen: a cliff spring spilling into a fish pond, and a
  // meadow of seeds and acorns about to sprout.
  showcase(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 2.5, wet: 6, period: 34 });
    const cx = Math.round(w * 0.86);
    const ty = top - clamp(Math.round(top * 0.32), 14, 60);
    fillRect(world, cx, ty, w - 1, top + 3, STONE);
    const px1 = cx - 1;
    const px0 = Math.max(4, px1 - clamp(Math.round(w * 0.2), 12, 60));
    const depth = clamp(Math.round(h * 0.08), 6, 16);
    basin(world, px0, px1, top - 1, top + depth, WATER);
    world.put((top + depth - 2) * w + px0 + 3, FISH, 0, 1);
    world.put((top + depth - 4) * w + px1 - 4, FISH, 0, 0);
    const field1 = Math.max(6, px0 - 6);
    for (let k = 0; k < 9; k++) world.put(Math.max(1, top - 12) * w + Math.round(6 + rand() * (field1 - 6)), SEED);
    for (let k = 0; k < 2; k++) world.put(Math.max(1, top - 12) * w + Math.round(field1 * (0.25 + k * 0.45)), ACORN);
    world.time = MORNING;
    return {
      anchors: {
        spring: { x: Math.min(w - 3, cx + 4), y: Math.max(2, ty - 4) },
        field: { x0: 6, x1: field1, y: Math.max(1, top - 12) },
        drain: { x: (px0 + px1) >> 1, y: top + depth - 1 },
      },
    };
  },

  sprout(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1.5, wet: 6 });
    const px0 = Math.round(w * 0.72);
    const px1 = Math.min(w - 4, px0 + clamp(Math.round(w * 0.14), 8, 40));
    basin(world, px0, px1, top - 1, top + clamp(Math.round(h * 0.06), 4, 10), WATER);
    return { anchors: { bed: { x0: Math.round(w * 0.12), x1: Math.round(w * 0.58), y: top - 8 } } };
  },

  // A stone cliff on the left with a flat top and an open edge to spill over.
  waterfall(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1.5, wet: 4 });
    const cx = Math.round(w * 0.36);
    const drop = clamp(Math.round(top * 0.45), 20, 80);
    const ty = top - drop;
    fillRect(world, 0, ty, cx, top + 3, STONE);
    // A shallow dip on top holds a little water near the wall.
    fillRect(world, 2, ty, Math.round(cx * 0.35), ty + 1, EMPTY);
    const px0 = cx + 3;
    const px1 = Math.min(w - 4, px0 + clamp(Math.round(w * 0.22), 10, 60));
    basin(world, px0, px1, top - 1, top + clamp(Math.round(h * 0.07), 5, 14));
    world.markers.push({ id: 'cliff', kind: 'label', x: cx, y: ty - 1, label: 'Cliff top' });
    return { anchors: { pour: { x: Math.round(cx * 0.4), y: Math.max(2, ty - 8) } }, drop };
  },

  // Dry soil to water first, with a pond to the left.
  flowers(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 2, wet: 0 });
    const px1 = Math.round(w * 0.24);
    basin(world, 4, px1, top - 1, top + clamp(Math.round(h * 0.07), 5, 12), WATER);
    return { anchors: { field: { x0: Math.round(w * 0.38), x1: Math.round(w * 0.92), y: top - 10 } } };
  },

  // A hill to beat, and a wet flat plot to plant in.
  'tall-tree'(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 0.8, wet: 6 });
    const hh = clamp(Math.round(h * 0.1), 9, 15);
    const hx0 = Math.round(w * 0.58);
    const hx1 = Math.round(w * 0.96);
    for (let x = hx0; x <= hx1; x++) {
      const t = (x - hx0) / (hx1 - hx0);
      const rise = Math.round(Math.sin(t * Math.PI) * hh);
      for (let y = top - rise; y < top + 2; y++) {
        const i = y * w + x;
        world.put(i, y > top - rise + 2 ? STONE : SOIL, 0);
      }
    }
    world.markers.push({ id: 'hill', kind: 'line', y: top - hh - 1, base: top, label: 'Grow past the hill top' });
    return { anchors: { plot: { x0: Math.round(w * 0.1), x1: Math.round(w * 0.45), y: top - 6 } } };
  },

  // A deep stone pond to drop lava into.
  obsidian(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1.5, wet: 3 });
    const bw = clamp(Math.round(w * 0.34), 20, 90);
    const x0 = Math.round(w / 2 - bw / 2);
    const depth = clamp(Math.round(h * 0.2), 14, 40);
    const btop = top - Math.round(depth * 0.5);
    fillRect(world, x0 - 2, btop, x0 + bw + 2, top, STONE);
    basin(world, x0, x0 + bw, btop, btop + depth - 1, WATER);
    return { anchors: { drop: { x: x0 + (bw >> 1), y: Math.max(2, btop - 12) } } };
  },

  // A lava pool beside a pond: water on lava makes steam, steam makes rain.
  rain(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1, wet: 2 });
    const lx0 = Math.round(w * 0.55);
    const lx1 = Math.min(w - 4, lx0 + clamp(Math.round(w * 0.24), 12, 60));
    basin(world, lx0, lx1, top - 1, top + clamp(Math.round(h * 0.05), 4, 9), LAVA);
    const px1 = Math.round(w * 0.3);
    basin(world, 4, px1, top - 1, top + clamp(Math.round(h * 0.06), 4, 10), WATER);
    return { anchors: { pour: { x: (lx0 + lx1) >> 1, y: Math.max(2, top - 14) } } };
  },

  // An ice block, and a lava pool waiting behind a stone wall.
  melt(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 0.6, wet: 1 });
    fillRect(world, 0, top - 1, w - 1, top + 1, STONE);
    const iw = clamp(Math.round(w * 0.12), 12, 30);
    const ih = clamp(Math.round(h * 0.09), 9, 18);
    const ix0 = Math.round(w * 0.55);
    fillRect(world, ix0, top - 1 - ih, ix0 + iw, top - 2, ICE);
    const lx0 = Math.round(w * 0.12);
    const lx1 = lx0 + clamp(Math.round(w * 0.14), 8, 30);
    fillRect(world, lx0 - 2, top - 8, lx1 + 2, top - 2, STONE);
    fillRect(world, lx0, top - 7, lx1, top - 2, LAVA);
    return { anchors: { ice: { x0: ix0, x1: ix0 + iw, y: top - 2 - ih }, side: { x: ix0 - 3, y: top - 6 } } };
  },

  // A fish in a puddle that is far too shallow.
  'deep-pond'(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1, wet: 5 });
    const x0 = Math.round(w * 0.42);
    const x1 = x0 + clamp(Math.round(w * 0.1), 8, 20);
    basin(world, x0, x1, top - 1, top + 2, WATER);
    world.put((top + 1) * w + ((x0 + x1) >> 1), FISH, 0, 1);
    return { anchors: { pool: { x0, x1, y0: top, y1: top + 2 } } };
  },

  // A dark cave in a stone hill: paint glow moss on its walls.
  'glow-cave'(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1, wet: 2 });
    const cx = Math.round(w * 0.5);
    const rx = clamp(Math.round(w * 0.3), 18, 90);
    const ry = clamp(Math.round(h * 0.26), 14, 60);
    fillEllipse(world, cx, top, rx, ry, STONE);
    const crx = Math.round(rx * 0.62);
    const cry = Math.round(ry * 0.5);
    const ccy = top - Math.round(cry * 0.35);
    fillEllipse(world, cx, ccy, crx, cry, EMPTY);
    // The way in, from the left slope.
    fillRect(world, cx - rx, ccy - 2, cx - crx + 2, ccy + 2, EMPTY);
    world.time = 0.68;
    return { anchors: { cave: { x: cx, y: ccy, rx: crx, ry: cry } } };
  },

  // A meadow already in flower, just before dusk.
  'firefly-night'(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    const surface = ground(world, rand, { top, amp: 2, wet: 5 });
    const count = clamp(Math.round(w / 14), 6, 20);
    for (let k = 0; k < count; k++) {
      const x = Math.round(((k + 0.5) / count) * (w - 6)) + 3;
      plantFlower(world, x, surface[x], 5 + Math.floor(rand() * 7), Math.floor(rand() * FLOWER_COLOURS));
    }
    world.time = 0.57;
    world.autoFireflies = true;
    return { anchors: { meadow: { x0: 4, x1: w - 5, y: top - 14 } } };
  },

  // A tall stone pillar with wet soil at its foot.
  vine(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 0.6, wet: 6 });
    const ph = clamp(Math.round(top * 0.5), 24, 90);
    const cx = Math.round(w * 0.5);
    fillRect(world, cx - 3, top - ph, cx + 3, top + 2, STONE);
    return { anchors: { left: { x: cx - 5, y: top - 3 }, right: { x: cx + 5, y: top - 3 } } };
  },

  // Daily: a flat stone yard and a line to pile sand above.
  tower(world, seed, params = {}) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1, wet: 2 });
    fillRect(world, 0, top, w - 1, top + 1, STONE);
    const height = clamp(Math.round(top * (params.height ?? 0.3)), 10, 60);
    world.markers.push({ id: 'line', kind: 'line', y: top - height, base: top, label: 'Pile sand up past here' });
    return { anchors: { pile: { x: Math.round(w * (0.3 + rand() * 0.4)), y: Math.max(2, top - height - 10) } } };
  },

  // Daily: an empty stone bowl to fill to the brim.
  bowl(world, seed) {
    const rand = mulberry32(seed);
    const { w, h } = world;
    const top = groundTop(h);
    ground(world, rand, { top, amp: 1.5, wet: 2 });
    const bw = clamp(Math.round(w * 0.22), 12, 50);
    const bh = clamp(Math.round(h * 0.1), 8, 20);
    const x0 = Math.round(w * (0.3 + rand() * 0.35));
    const x1 = Math.min(w - 4, x0 + bw);
    const y1 = top - 2;
    const y0 = y1 - bh + 1;
    fillRect(world, x0 - 2, y0, x0 - 1, y1 + 2, STONE);
    fillRect(world, x1 + 1, y0, x1 + 2, y1 + 2, STONE);
    fillRect(world, x0 - 2, y1 + 1, x1 + 2, y1 + 2, STONE);
    world.markers.push({ id: 'bowl', kind: 'box', x0, x1, y0, y1, label: 'Fill me up' });
    return { anchors: { bowl: { x: (x0 + x1) >> 1, y: Math.max(2, y0 - 10) } } };
  },

  blank(world) {
    fillRect(world, 0, world.h - 2, world.w - 1, world.h - 1, STONE);
    return { anchors: {} };
  },
};

// Build a scene into a fresh world. `flip` mirrors it.
export function buildScene(world, id, seed, { flip = false, params } = {}) {
  const builder = SCENES[id] || SCENES.meadow;
  const out = builder(world, seed >>> 0, params) || {};
  let anchors = out.anchors || {};
  if (flip) anchors = mirror(world, anchors);
  world.clock.fill(0);
  world.census();
  return { ...out, anchors };
}

export const SCENE_IDS = Object.keys(SCENES);
