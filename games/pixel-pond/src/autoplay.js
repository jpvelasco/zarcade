// Scripted gardeners. Each plan paints like a player would (same brushes,
// same densities) at a scene's anchors. Tests use them to prove every goal
// can be finished at every screen shape; ?autoplay and the title use them
// as a demo. Pure: no DOM.
import { SAND, WATER, SEED, STONE, LAVA, ACORN, MOSS, EMPTY, PALETTE_BY_ID } from './elements.js';
import { mulberry32 } from './rng.js';

const D = (id) => PALETTE_BY_ID[id].density;
const OVER_STONE = (() => {
  const m = new Uint8Array(32);
  m[WATER] = 1;
  return m;
})();

// An action runs on every `every`-th step from `from` up to (not including) `to`.
const act = (from, to, every, run) => ({ from, to, every, run });

// Take up to `n` water cells near (x, y): a spring's outflow.
function drain(world, x, y, n) {
  for (let r = 0; r <= 3 && n > 0; r++) {
    for (let dy = -r; dy <= r && n > 0; dy++) {
      for (let dx = -r; dx <= r && n > 0; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= world.w || yy >= world.h) continue;
        const i = yy * world.w + xx;
        if (world.type[i] === WATER) { world.put(i, EMPTY); n--; }
      }
    }
  }
}

function floorBelow(world, x, y) {
  for (let yy = Math.max(0, y); yy < world.h; yy++) if (world.type[yy * world.w + x] !== EMPTY) return yy - 1;
  return world.h - 1;
}

export function planFor(id, anchors, world, seed = 1) {
  const rand = mulberry32(seed);
  const pick = (lo, hi) => Math.round(lo + rand() * (hi - lo));
  switch (id) {
    case 'sprout':
    case 'sprouts': {
      const { bed } = anchors;
      return [act(0, 240, 6, (w) => w.spray(pick(bed.x0, bed.x1), bed.y, 3, SEED, 2))];
    }
    case 'waterfall':
      return [act(0, 900, 1, (w) => w.paint(anchors.pour.x, anchors.pour.y, 3, WATER, D('water')))];
    case 'flowers': {
      const { field } = anchors;
      let k = 0;
      return [
        act(0, 420, 1, (w) => { w.paint(field.x0 + ((k += 3) % Math.max(1, field.x1 - field.x0)), field.y, 3, WATER, D('water')); }),
        act(480, 720, 8, (w) => w.spray(pick(field.x0, field.x1), field.y, 3, SEED, 2)),
      ];
    }
    case 'tall-tree': {
      const { plot } = anchors;
      return [act(0, 50, 10, (w) => w.paint(pick(plot.x0, plot.x1), plot.y, 0, ACORN))];
    }
    case 'obsidian':
      return [act(0, 160, 1, (w) => w.paint(anchors.drop.x, anchors.drop.y, 1, LAVA, D('lava')))];
    case 'rain':
      return [act(0, 1200, 1, (w) => w.paint(anchors.pour.x, anchors.pour.y, 2, WATER, D('water')))];
    case 'melt': {
      const { ice, side } = anchors;
      return [
        act(0, 400, 1, (w) => w.paint(side.x, side.y, 2, LAVA, D('lava'))),
        act(0, 400, 2, (w) => w.paint(pick(ice.x0, ice.x1), Math.max(1, ice.y - 3), 1, LAVA, D('lava'))),
      ];
    }
    case 'deep-pond': {
      const { pool } = anchors;
      const top = pool.y0 - 2;
      return [
        act(0, 1, 1, (w) => {
          w.line(pool.x0 - 1, top, pool.x0 - 1, top - 12, 0, STONE, 1, OVER_STONE);
          w.line(pool.x1 + 1, top, pool.x1 + 1, top - 12, 0, STONE, 1, OVER_STONE);
        }),
        act(2, 1400, 1, (w) => w.paint((pool.x0 + pool.x1) >> 1, Math.max(1, top - 16), 2, WATER, D('water'))),
      ];
    }
    case 'glow-cave': {
      const { cave } = anchors;
      return [act(0, 8, 1, (w) => {
        const x = Math.round(cave.x + (rand() - 0.5) * cave.rx * 1.2);
        w.paint(x, floorBelow(w, x, cave.y), 1, MOSS, 1);
      })];
    }
    case 'firefly-night':
      return [act(0, 1, 1, (w) => w.skipTo(0.66))];
    case 'vine':
      return [act(0, 40, 8, (w) => {
        w.paint(anchors.left.x, anchors.left.y, 0, SEED);
        w.paint(anchors.right.x, anchors.right.y, 0, SEED);
      })];
    case 'tower':
      return [act(0, 2400, 1, (w) => w.paint(anchors.pile.x, anchors.pile.y, 3, SAND, D('sand')))];
    case 'bowl':
      return [act(0, 1600, 1, (w) => w.paint(anchors.bowl.x, anchors.bowl.y, 3, WATER, D('water')))];
    case 'showcase':
      // The title demo: the spring keeps running and seeds drift down now
      // and then.
      return [
        act(0, 1e9, 1, (w) => {
          w.paint(anchors.spring.x, anchors.spring.y, 0, WATER, 0.5);
          if (w.tick % 400 === 200) w.spray(pick(anchors.field.x0, anchors.field.x1), anchors.field.y, 4, SEED, 2);
        }),
        // A hidden outflow keeps the pond from overflowing.
        act(0, 1e9, 2, (w) => drain(w, anchors.drain.x, anchors.drain.y, 1)),
      ];
    case 'meadow':
      return [];
    default:
      return [];
  }
}

export class Autoplayer {
  constructor(id, anchors, world, seed = 1) {
    this.plan = planFor(id, anchors || {}, world, seed);
    this.t = 0;
  }

  act(world) {
    const t = this.t++;
    for (const a of this.plan) {
      if (t >= a.from && t < a.to && (t - a.from) % a.every === 0) a.run(world);
    }
  }
}

// Play a goal to the end: step until `check` says done or `max` steps pass.
export function solve(world, id, anchors, check, max = 6000, every = 15) {
  const pilot = new Autoplayer(id, anchors, world);
  for (let s = 0; s < max; s++) {
    pilot.act(world);
    world.step();
    if (s % every === 0 && check(world).done) return s;
  }
  return -1;
}
