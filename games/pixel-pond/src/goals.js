// Goal cards and the daily prompt. Every check is a pure function of the
// world, so tests can build a scene, play a script and ask "done yet?".
import {
  WATER, SAND, SOIL, SEED, STONE, LAVA, STEAM, OBSIDIAN, FIRE, FLOWER, ACORN, ICE, MOSS, FIREFLY, FISH,
  WOOD, LEAF, TIP, STEM, K_VINE, K_TREE, K_BRANCH, K_CROWN,
} from './elements.js';
import { isNight } from './world.js';
import { hash32, mulberry32 } from './rng.js';

export function progress(have, need, label) {
  const h = Math.max(0, Math.floor(have));
  return { have: Math.min(h, need), need, done: h >= need, label };
}

// ------------------------------------------------------------ measures

// Water in the air: a water cell with open air on at least one side, so
// pond water never counts. Returns the longest such run down one column,
// allowing gaps of up to two cells between drops.
export function waterfallRun(world) {
  const { w, h, type } = world;
  let best = 0;
  for (let x = 0; x < w; x++) {
    let run = 0;
    let gap = 0;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      let airborne = false;
      if (type[i] === WATER) {
        const left = x > 0 ? type[i - 1] : -1;
        const right = x < w - 1 ? type[i + 1] : -1;
        airborne = left === 0 || right === 0;
      }
      if (airborne) {
        run += 1 + gap;
        gap = 0;
        if (run > best) best = run;
      } else if (run > 0 && gap < 2 && type[i] === 0) {
        gap++;
      } else {
        run = 0;
        gap = 0;
      }
    }
  }
  return best;
}

// The deepest pond any fish is swimming in: the unbroken column of still
// water through the fish, from the surface to the bottom. Water with open
// air beside it is falling, not pond, so a stream pouring in doesn't count.
export function fishDepth(world) {
  const { w, h, type } = world;
  const pond = (x, y) => {
    const t = type[y * w + x];
    if (t !== WATER && t !== FISH) return false;
    return !((x > 0 && type[y * w + x - 1] === 0) || (x < w - 1 && type[y * w + x + 1] === 0));
  };
  let best = 0;
  for (let i = 0; i < type.length; i++) {
    if (type[i] !== FISH) continue;
    const x = i % w;
    const y = (i - x) / w;
    let depth = 1;
    for (let yy = y - 1; yy >= 0 && pond(x, yy); yy--) depth++;
    for (let yy = y + 1; yy < h && pond(x, yy); yy++) depth++;
    if (depth > best) best = depth;
  }
  return best;
}

const isTreeKind = (k) => k === K_TREE || k === K_BRANCH || k === K_CROWN;

// The highest row any part of a tree reaches (h when there is no tree).
export function treeTop(world) {
  const { w, h, type, b } = world;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = type[i];
      if (t === WOOD || ((t === LEAF || t === TIP) && isTreeKind(b[i] & 7))) return y;
    }
  }
  return h;
}

// How tall the vines stand: lowest to highest vine cell.
export function vineHeight(world) {
  const { w, type, b } = world;
  let top = Infinity;
  let bottom = -1;
  for (let i = 0; i < type.length; i++) {
    const t = type[i];
    if ((t === STEM || t === TIP || t === LEAF) && (b[i] & 7) === K_VINE) {
      const y = Math.floor(i / w);
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return bottom < 0 ? 0 : bottom - top + 1;
}

// The highest sand that has sat still for a while (falling sand doesn't
// count). `clock` holds the step stamp of each cell's last move.
export function restingSandTop(world, still = 40) {
  const { w, h, type, clock, stamp } = world;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (type[i] !== SAND) continue;
      const age = (stamp - clock[i] + 65535) % 65535;
      if (clock[i] === 0 || age >= still) return y;
    }
  }
  return h;
}

// Share of a box that is full of water (fish count as water).
export function boxFill(world, box) {
  const { w, type } = world;
  let wet = 0;
  let total = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= world.h) continue;
      total++;
      const t = type[y * w + x];
      if (t === WATER || t === FISH) wet++;
    }
  }
  return total ? wet / total : 0;
}

const marker = (world, id) => world.markers.find((m) => m.id === id);

// Collection entries present in the garden right now (from the census).
export function findsIn(world) {
  const c = world.counts;
  const out = [];
  const add = (id, yes) => { if (yes) out.push(id); };
  add('sand', c[SAND]);
  add('water', c[WATER]);
  add('soil', c[SOIL]);
  add('mud', world.wetSoil);
  add('seed', c[SEED]);
  add('sprout', c[TIP] + c[STEM]);
  add('flower', c[FLOWER]);
  add('vine', world.vineCells);
  add('acorn', c[ACORN]);
  add('tree', c[WOOD]);
  add('stone', c[STONE]);
  add('lava', c[LAVA]);
  add('steam', c[STEAM]);
  add('rain', world.stats.rain);
  add('obsidian', c[OBSIDIAN]);
  add('fire', c[FIRE]);
  add('ice', c[ICE]);
  add('moss', c[MOSS]);
  add('fish', c[FISH]);
  add('firefly', c[FIREFLY]);
  return out;
}

// ------------------------------------------------------------ goals

export const GOALS = [
  {
    id: 'sprout', title: 'First sprout', icon: 'sprout', scene: 'sprout',
    text: 'Sprinkle seeds on the dark, wet soil and watch them wake up.',
    tip: 'Pick Seeds, then paint over the soil.',
    reward: { type: 'brush', id: 'spray', name: 'Spray brush', icon: 'rain', text: 'Scatter sand, seeds or rain in a sprinkle.' },
    check: (w) => progress(w.stats.sprouted, 3, 'Sprouts'),
  },
  {
    id: 'waterfall', title: 'Make a waterfall', icon: 'water', scene: 'waterfall',
    text: 'Pour water on top of the cliff so it tumbles over the edge.',
    tip: 'Hold Water down on the cliff top for a little while.',
    reward: { type: 'element', id: 'acorn', name: 'Acorn', icon: 'acorn', text: 'Plant it in wet soil to grow a tree.' },
    check: (w) => progress(waterfallRun(w), 12, 'Waterfall'),
  },
  {
    id: 'flowers', title: 'Flower patch', icon: 'flower', scene: 'flowers',
    text: 'Grow five flowers. This soil is dry, so water it first!',
    tip: 'Wet soil turns dark. Then sprinkle seeds on it.',
    reward: { type: 'brush', id: 'line', name: 'Line brush', icon: 'stone', text: 'Drag to draw straight walls and ramps.' },
    check: (w) => progress(w.stats.bloomed, 5, 'Flowers'),
  },
  {
    id: 'tall-tree', title: 'Taller than the hill', icon: 'tree', scene: 'tall-tree', lend: ['acorn'],
    text: 'Plant an acorn and grow a tree taller than the hill.',
    tip: 'Acorns sprout in wet soil. Plant a few!',
    reward: { type: 'element', id: 'moss', name: 'Glow moss', icon: 'moss', text: 'It creeps over stone and glows at night.' },
    check(w) {
      const m = marker(w, 'hill');
      if (!m) return progress(0, 1, 'Tree');
      const top = treeTop(w);
      return { have: top < w.h ? Math.max(0, m.base - top) : 0, need: m.base - m.y + 1, done: top < m.y, label: 'Tree' };
    },
  },
  {
    id: 'obsidian', title: 'Make obsidian', icon: 'obsidian', scene: 'obsidian',
    text: 'Drop lava into the deep pond. It cools into shiny black obsidian.',
    tip: 'Lava that cools deep under water turns to obsidian.',
    reward: { type: 'element', id: 'ice', name: 'Ice', icon: 'ice', text: 'Cold blocks that melt when lava comes near.' },
    check: (w) => progress(w.counts[OBSIDIAN], 3, 'Obsidian'),
  },
  {
    id: 'rain', title: 'Make it rain', icon: 'rain', scene: 'rain',
    text: 'Pour water on the lava. Steam floats up and falls as rain. Make 30 raindrops!',
    tip: 'Keep pouring water onto the lava pool.',
    reward: { type: 'sky', id: 'sunset', name: 'Sunset sky', icon: 'steam', text: 'Pick it from the pause menu.' },
    check: (w) => progress(w.stats.rain, 30, 'Raindrops'),
  },
  {
    id: 'melt', title: 'Melt the ice', icon: 'ice', scene: 'melt', lend: ['ice'],
    text: 'Ice melts when lava comes close. Melt the ice block!',
    tip: 'Paint lava right next to the ice.',
    reward: { type: 'element', id: 'fish', name: 'Fish', icon: 'fish', text: 'Drop them into a pond and watch them swim.' },
    check: (w) => progress(w.stats.melted, 25, 'Melted'),
  },
  {
    id: 'deep-pond', title: 'A deep pond', icon: 'fish', scene: 'deep-pond', lend: ['fish'],
    text: 'This fish needs a pond 10 cells deep. Dig down or build walls, then fill it up.',
    tip: 'The eraser digs. Stone builds walls. Then pour water.',
    reward: { type: 'element', id: 'firefly', name: 'Fireflies', icon: 'firefly', text: 'They visit your flowers every dusk.' },
    check: (w) => progress(fishDepth(w), 10, 'Depth'),
  },
  {
    id: 'glow-cave', title: 'Glow cave', icon: 'moss', scene: 'glow-cave', lend: ['moss'],
    text: 'Paint glow moss inside the dark cave and let it creep over the walls.',
    tip: 'Moss spreads along stone. Dab a few spots.',
    reward: { type: 'sky', id: 'aurora', name: 'Aurora sky', icon: 'moss', text: 'Dancing lights at night. Pick it from the pause menu.' },
    check: (w) => progress(w.counts[MOSS], 100, 'Moss'),
  },
  {
    id: 'firefly-night', title: 'Firefly night', icon: 'firefly', scene: 'firefly-night', lend: ['firefly'],
    text: 'At dusk, fireflies visit the flowers. Have five fireflies glowing at night.',
    tip: 'Wait for the night, or paint some fireflies.',
    reward: { type: 'sky', id: 'candy', name: 'Candy sky', icon: 'flower', text: 'A pink and purple sky. Pick it from the pause menu.' },
    check(w) {
      const night = isNight(w.time);
      const p = progress(night ? w.counts[FIREFLY] : 0, 5, night ? 'Fireflies' : 'Waiting for night');
      return p;
    },
  },
  {
    id: 'vine', title: 'Vine climber', icon: 'vine', scene: 'vine',
    text: 'Plant seeds right next to the stone pillar. Can a vine climb 20 cells high?',
    tip: 'Seeds touching stone grow into vines.',
    reward: { type: 'flowers', id: 'rainbow', name: 'Rainbow flowers', icon: 'flower', text: 'Petals that shimmer every colour. Switch them on in the pause menu.' },
    check: (w) => progress(vineHeight(w), 20, 'Vine'),
  },
];

export const GOAL_BY_ID = Object.fromEntries(GOALS.map((g) => [g.id, g]));

// The next three unfinished goals are always open, so nobody gets stuck.
export function goalOpen(done, index) {
  if (done[GOALS[index].id]) return true;
  let unfinished = 0;
  for (let i = 0; i < index; i++) if (!done[GOALS[i].id]) unfinished++;
  return unfinished < 3;
}

export function nextGoal(done) {
  return GOALS.find((g) => !done[g.id]) || null;
}

// ------------------------------------------------------------ daily prompt

const DAILY = [
  {
    id: 'flowers', scene: 'flowers', param: (r) => 3 + (r % 4),
    title: (n) => `Grow ${n} flowers`, text: 'Water the dry soil, then sprinkle seeds on it.',
    check: (w, n) => progress(w.stats.bloomed, n, 'Flowers'),
  },
  {
    id: 'obsidian', scene: 'obsidian', param: (r) => 3 + (r % 6),
    title: (n) => `Make ${n} obsidian`, text: 'Drop lava deep into the pond.',
    check: (w, n) => progress(w.counts[OBSIDIAN], n, 'Obsidian'),
  },
  {
    id: 'rain', scene: 'rain', param: (r) => 20 + (r % 31),
    title: (n) => `Make ${n} raindrops`, text: 'Pour water onto the lava and watch the steam rise.',
    check: (w, n) => progress(w.stats.rain, n, 'Raindrops'),
  },
  {
    id: 'waterfall', scene: 'waterfall', param: () => 12,
    title: () => 'Make a waterfall', text: 'Pour water over the cliff edge.',
    check: (w, n) => progress(waterfallRun(w), n, 'Waterfall'),
  },
  {
    id: 'tower', scene: 'tower', param: (r) => 20 + (r % 16),
    title: () => 'Sand mountain', text: 'Pile sand up past the dotted line.',
    check(w) {
      const m = marker(w, 'line');
      if (!m) return progress(0, 1, 'Sand');
      const top = restingSandTop(w);
      return { have: top < w.h ? Math.max(0, m.base - top) : 0, need: m.base - m.y, done: top <= m.y, label: 'Sand pile' };
    },
  },
  {
    id: 'bowl', scene: 'bowl', param: () => 85,
    title: () => 'Fill the bowl', text: 'Fill the stone bowl right up with water.',
    check(w, n) {
      const m = marker(w, 'bowl');
      return progress(m ? Math.round(boxFill(w, m) * 100) : 0, n, 'Full %');
    },
  },
  {
    id: 'sprouts', scene: 'sprout', param: (r) => 5 + (r % 6),
    title: (n) => `Sprout ${n} seeds`, text: 'Sprinkle seeds across the wet soil.',
    check: (w, n) => progress(w.stats.sprouted, n, 'Sprouts'),
  },
];
export const DAILY_TEMPLATES = DAILY.map((d) => d.id);

// Days are dealt in blocks: each block shows every kind of prompt once, in
// a shuffled order, and a block never starts with the kind the last one
// ended on. Same day, same prompt, and never the same kind two days running.
const dayNumber = (key) => Math.round(Date.UTC(Math.floor(key / 10000), Math.floor(key / 100) % 100 - 1, key % 100) / 86400000);

function blockOrder(block) {
  const rand = mulberry32(hash32(block + 0x2545f491));
  const order = DAILY.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function templateIndex(key) {
  const day = dayNumber(key);
  const L = DAILY.length;
  const block = Math.floor(day / L);
  const order = blockOrder(block);
  if (order[0] === blockOrder(block - 1)[L - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order[day - block * L];
}

// Today's prompt, derived from the local date: same day, same garden.
export function dailyPrompt(key) {
  const t = DAILY[templateIndex(key)];
  const r = hash32(key ^ 0x5bd1e995);
  const n = t.param(r);
  return {
    key,
    template: t.id,
    scene: t.scene,
    seed: hash32(key + 17),
    flip: ((r >>> 9) & 1) === 1,
    params: t.id === 'tower' ? { height: n / 100 } : undefined,
    n,
    title: t.title(n),
    text: t.text,
    check: (w) => t.check(w, n),
  };
}
