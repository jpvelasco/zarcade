import test from 'node:test';
import assert from 'node:assert/strict';
import { World, refit, isNight, nightAmount, NIGHT_START, MORNING } from '../src/world.js';
import {
  EMPTY, SAND, WATER, SOIL, SEED, STONE, LAVA, STEAM, OBSIDIAN, FIRE, STEM, LEAF, FLOWER, WOOD,
  ACORN, ICE, MOSS, FISH, FIREFLY, TIP, WET_MAX, K_FLOWER, K_VINE, K_TREE,
} from '../src/elements.js';
import { fillRect } from '../src/scenes.js';
import { vineHeight, treeTop } from '../src/goals.js';

const count = (w, t) => w.type.reduce((n, v) => n + (v === t ? 1 : 0), 0);
const cells = (w, t) => {
  const out = [];
  for (let i = 0; i < w.n; i++) if (w.type[i] === t) out.push([i % w.w, Math.floor(i / w.w)]);
  return out;
};
const plants = (w) => [STEM, LEAF, FLOWER, WOOD, TIP].reduce((n, t) => n + count(w, t), 0);

// A stone floor two cells thick.
function yard(w = 40, h = 30, seed = 1) {
  const world = new World(w, h, seed);
  fillRect(world, 0, h - 2, w - 1, h - 1, STONE);
  return world;
}

test('sand falls, piles into a slope and never floats', () => {
  const w = yard(60, 40);
  for (let s = 0; s < 400; s++) {
    if (s < 300) w.paint(30, 2, 0, SAND);
    w.step();
  }
  w.run(200);
  const sand = cells(w, SAND);
  assert.ok(sand.length > 200);
  for (const [x, y] of sand) assert.notEqual(w.at(x, y + 1), EMPTY, `sand at ${x},${y} rests on something`);
  const ys = sand.map(([, y]) => y);
  const xs = sand.map(([x]) => x);
  const height = 38 - Math.min(...ys);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  assert.ok(width >= height * 1.6, `a heap, not a tower (${width} wide, ${height} tall)`);
});

test('sand sinks through water and the water ends up on top', () => {
  const w = yard(20, 30);
  fillRect(w, 0, 20, 19, 27, WATER);
  fillRect(w, 0, 10, 19, 12, SAND);
  w.run(300);
  for (let x = 0; x < 20; x++) {
    assert.equal(w.at(x, 27), SAND, `sand reached the floor at column ${x}`);
  }
  assert.equal(count(w, SAND), 60);
  assert.equal(count(w, WATER), 160);
});

test('water flows sideways and settles level in a tub', () => {
  const w = yard(50, 30);
  fillRect(w, 4, 10, 5, 27, STONE);
  fillRect(w, 44, 10, 45, 27, STONE);
  for (let s = 0; s < 260; s++) {
    if (s < 160) w.paint(8, 4, 1, WATER, 1);
    w.step();
  }
  w.run(600);
  const surface = [];
  for (let x = 6; x <= 43; x++) {
    let y = 0;
    while (y < 28 && w.at(x, y) !== WATER) y++;
    surface.push(y);
  }
  const spread = Math.max(...surface) - Math.min(...surface);
  assert.ok(spread <= 1, `level within a cell (surface rows ${Math.min(...surface)}..${Math.max(...surface)})`);
  assert.ok(Math.min(...surface) < 28, 'there is a pond');
});

test('dry soil soaks up water and darkens; saturated soil holds a pond', () => {
  const w = yard(30, 30);
  fillRect(w, 0, 20, 29, 27, SOIL, 0);
  fillRect(w, 0, 14, 29, 17, WATER);
  const before = count(w, WATER);
  w.run(400);
  const soil = cells(w, SOIL);
  const wet = soil.filter(([x, y]) => w.a[y * 30 + x] >= 3).length;
  assert.ok(wet > 20, `the top of the soil got wet (${wet})`);
  assert.ok(count(w, WATER) < before, 'some water soaked in');

  const pond = yard(30, 30);
  fillRect(pond, 0, 20, 29, 27, SOIL, WET_MAX);
  fillRect(pond, 0, 16, 29, 19, WATER);
  pond.run(400);
  assert.equal(count(pond, WATER), 120, 'saturated soil lets the pond stay');
});

test('seeds sprout on wet soil only', () => {
  const dry = yard(30, 30);
  fillRect(dry, 0, 22, 29, 27, SOIL, 0);
  for (const x of [5, 10, 15, 20, 25]) dry.paint(x, 5, 0, SEED);
  dry.run(800);
  assert.equal(dry.stats.sprouted, 0);
  assert.equal(count(dry, SEED), 5);

  const wet = yard(30, 30);
  fillRect(wet, 0, 22, 29, 27, SOIL, 6);
  for (const x of [5, 10, 15, 20, 25]) wet.paint(x, 5, 0, SEED);
  wet.run(800);
  assert.equal(wet.stats.sprouted, 5);
  assert.equal(count(wet, SEED), 0);
  assert.ok(plants(wet) > 10);
});

test('seeds on stone or sand stay seeds', () => {
  const w = yard(30, 30);
  fillRect(w, 0, 24, 14, 27, SAND);
  w.paint(4, 2, 0, SEED);
  w.paint(22, 2, 0, SEED);
  w.run(800);
  assert.equal(w.stats.sprouted, 0);
});

test('flowers bloom with petals in one colour on a green stem', () => {
  const w = yard(40, 40, 3);
  fillRect(w, 0, 30, 39, 37, SOIL, 6);
  for (const x of [6, 16, 26, 34]) w.paint(x, 10, 0, SEED);
  w.run(1500);
  assert.ok(w.stats.bloomed >= 2, `bloomed ${w.stats.bloomed}`);
  const centres = cells(w, FLOWER).filter(([x, y]) => w.b[y * 40 + x] & 8);
  assert.ok(centres.length >= 2);
  for (const [x, y] of centres) {
    const colour = w.b[y * 40 + x] >> 4;
    assert.equal(w.b[y * 40 + x] & 7, K_FLOWER);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) {
      const j = (y + dy) * 40 + x + dx;
      if (w.type[j] === FLOWER) assert.equal(w.b[j] >> 4, colour, 'petals match their flower');
    }
    assert.ok([STEM, LEAF, FLOWER].includes(w.at(x, y + 1)), 'the flower sits on its stem');
  }
});

test('a seed planted by a stone wall grows into a vine that climbs it', () => {
  const w = yard(40, 60, 4);
  fillRect(w, 0, 50, 39, 57, SOIL, 6);
  fillRect(w, 20, 10, 22, 50, STONE);
  w.paint(19, 45, 0, SEED);
  w.run(2500);
  assert.ok(w.stats.sprouted >= 1);
  const vine = cells(w, STEM).filter(([x, y]) => (w.b[y * 40 + x] & 7) === K_VINE);
  assert.ok(vine.length > 15, `vine cells ${vine.length}`);
  assert.ok(vineHeight(w) >= 20, `vine climbed ${vineHeight(w)} cells`);
});

test('an acorn grows a tree with a wooden trunk and a leafy crown', () => {
  const w = yard(60, 70, 5);
  fillRect(w, 0, 60, 59, 67, SOIL, 6);
  w.paint(30, 40, 0, ACORN);
  w.run(2500);
  assert.equal(count(w, ACORN), 0);
  assert.ok(count(w, WOOD) >= 16, `wood ${count(w, WOOD)}`);
  const crown = cells(w, LEAF).length;
  assert.ok(crown >= 12, `leaves ${crown}`);
  assert.ok(60 - treeTop(w) >= 18, `tree height ${60 - treeTop(w)}`);
  const trunk = cells(w, WOOD).filter(([x, y]) => (w.b[y * 60 + x] & 7) === K_TREE || w.b[y * 60 + x] === 0);
  assert.ok(trunk.length > 0);
});

test('stone, obsidian and ice stay exactly where they are painted', () => {
  const w = new World(30, 30, 6);
  w.paint(5, 5, 1, STONE);
  w.paint(15, 5, 1, OBSIDIAN);
  w.paint(25, 5, 1, ICE);
  const before = w.type.slice();
  w.run(300);
  assert.deepEqual(w.type, before);
});

test('lava flows, but slower than water', () => {
  const w = yard(80, 30, 7);
  for (let s = 0; s < 40; s++) {
    w.paint(15, 26, 1, WATER, 1);
    w.paint(60, 26, 1, LAVA, 1);
    w.step();
  }
  w.run(60);
  const spanOf = (t) => {
    const xs = cells(w, t).map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(spanOf(WATER) > spanOf(LAVA) + 5, `water ${spanOf(WATER)} vs lava ${spanOf(LAVA)}`);
});

test('lava sets plants alight, and fire burns them away', () => {
  const w = yard(40, 30, 8);
  fillRect(w, 0, 24, 39, 27, SOIL, 6);
  for (let x = 10; x < 30; x++) for (let y = 16; y < 24; y++) w.put(y * 40 + x, x % 2 ? STEM : LEAF, 0, K_FLOWER);
  const green = plants(w);
  fillRect(w, 8, 20, 9, 23, LAVA);
  let sawFire = false;
  for (let s = 0; s < 1500; s++) {
    w.step();
    if (!sawFire && count(w, FIRE) > 0) sawFire = true;
  }
  assert.ok(sawFire, 'fire appeared');
  assert.ok(w.stats.burned > 20, `burned ${w.stats.burned}`);
  assert.ok(plants(w) < green / 2, `most plants burned (${plants(w)} of ${green} left)`);
});

test('fire burns out by itself, and water puts it out sooner with a hiss', () => {
  const alone = yard(20, 20, 9);
  for (let x = 5; x < 15; x++) alone.put(17 * 20 + x, FIRE, 100);
  alone.run(60);
  assert.equal(count(alone, FIRE), 10, 'still burning');
  alone.run(60);
  assert.equal(count(alone, FIRE), 0, 'burned out');

  const doused = yard(20, 20, 9);
  for (let x = 5; x < 15; x++) doused.put(17 * 20 + x, FIRE, 250);
  fillRect(doused, 5, 10, 14, 11, WATER);
  doused.run(150);
  assert.ok(doused.fx.hiss > 0, 'water touched the fire');
  assert.equal(count(doused, FIRE), 0);
});

test('lava and water: a splash makes stone and steam, a plunge makes obsidian', () => {
  const pool = yard(30, 30, 10);
  fillRect(pool, 0, 24, 29, 27, LAVA);
  for (let s = 0; s < 120; s++) {
    pool.paint(15, 4, 1, WATER, 0.5);
    pool.step();
  }
  pool.run(200);
  assert.ok(pool.stats.steam > 10, `steam ${pool.stats.steam}`);
  assert.ok(count(pool, STONE) > 60, 'a stone crust formed');

  const pond = yard(30, 40, 11);
  fillRect(pond, 4, 10, 25, 37, WATER);
  fillRect(pond, 2, 10, 3, 37, STONE);
  fillRect(pond, 26, 10, 27, 37, STONE);
  for (let s = 0; s < 60; s++) {
    pond.paint(15, 2, 1, LAVA, 0.35);
    pond.step();
  }
  pond.run(300);
  assert.ok(count(pond, OBSIDIAN) >= 5, `obsidian ${count(pond, OBSIDIAN)}`);
  assert.ok(count(pond, LAVA) < count(pond, OBSIDIAN), 'most of the lava cooled (a little may glow on, sealed inside)');
});

test('steam rises and comes back down as rain; nothing is lost', () => {
  const w = yard(30, 60, 12);
  fillRect(w, 5, 50, 24, 57, STEAM);
  for (let i = 0; i < w.n; i++) if (w.type[i] === STEAM) w.a[i] = 60;
  const total = count(w, STEAM);
  let highest = 60;
  for (let s = 0; s < 120; s++) {
    w.step();
    for (const [, y] of cells(w, STEAM)) highest = Math.min(highest, y);
  }
  assert.ok(highest < 30, `steam rose to row ${highest}`);
  w.run(800);
  assert.equal(count(w, STEAM), 0);
  assert.equal(count(w, WATER), total, 'every puff became a raindrop');
  assert.equal(w.stats.rain, total);
});

test('ice melts near lava, and stays frozen on its own', () => {
  const alone = yard(30, 30, 13);
  fillRect(alone, 10, 20, 19, 27, ICE);
  alone.run(500);
  assert.equal(count(alone, ICE), 80);

  const hot = yard(30, 30, 13);
  fillRect(hot, 10, 20, 19, 27, ICE);
  fillRect(hot, 4, 22, 9, 27, LAVA);
  hot.run(600);
  assert.ok(hot.stats.melted >= 5, `melted ${hot.stats.melted}`);
  assert.ok(count(hot, ICE) < 80);
});

test('glow moss creeps along stone but not into open air, and stops in time', () => {
  const w = yard(80, 30, 14);
  w.paint(40, 27, 0, MOSS);
  w.run(1500);
  const moss = cells(w, MOSS);
  assert.ok(moss.length >= 20, `moss ${moss.length}`);
  for (const [x, y] of moss) {
    const touching = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => w.at(x + dx, y + dy) === STONE);
    assert.ok(touching || (x === 40 && y === 27), `moss at ${x},${y} clings to stone`);
  }
  const n = moss.length;
  w.run(1500);
  assert.equal(cells(w, MOSS).length, n, 'moss spreads only a few generations');
  assert.ok(n < 60);
});

test('fish swim inside the pond and stay under the surface', () => {
  const w = yard(40, 30, 15);
  fillRect(w, 2, 14, 37, 27, WATER);
  fillRect(w, 0, 10, 1, 27, STONE);
  fillRect(w, 38, 10, 39, 27, STONE);
  w.addFish(10, 20);
  w.addFish(30, 24);
  const xs = new Set();
  for (let s = 0; s < 1500; s++) {
    w.step();
    for (const [x, y] of cells(w, FISH)) {
      xs.add(x);
      assert.ok(y >= 14, `fish at row ${y} stays in the water`);
    }
  }
  assert.equal(count(w, FISH), 2);
  assert.ok(xs.size > 10, 'they swim about');
});

test('a fish on dry land flops toward water and is never lost, even to lava', () => {
  const w = yard(40, 30, 16);
  fillRect(w, 0, 26, 39, 27, STONE);
  fillRect(w, 26, 24, 39, 25, WATER);
  w.addFish(10, 20);
  w.run(3000);
  assert.equal(count(w, FISH), 1);
  const [[x]] = cells(w, FISH);
  assert.ok(x >= 24, `the fish found the water (x=${x})`);

  const hot = yard(20, 20, 17);
  hot.addFish(10, 17);
  fillRect(hot, 6, 10, 14, 12, LAVA);
  hot.run(800);
  assert.equal(count(hot, FISH), 1);
});

test('fireflies hover low and wander; visitors come at night and leave by day', () => {
  const w = yard(60, 60, 18);
  for (let k = 0; k < 6; k++) w.paint(10 + k * 8, 30, 0, FIREFLY);
  for (let s = 0; s < 1200; s++) {
    w.step();
    for (const [, y] of cells(w, FIREFLY)) assert.ok(y < 58);
  }
  assert.equal(count(w, FIREFLY), 6, 'painted fireflies stay');
  const lowest = Math.max(...cells(w, FIREFLY).map(([, y]) => y));
  assert.ok(lowest > 35, 'they drift down toward the ground');

  const night = yard(60, 40, 19);
  fillRect(night, 0, 30, 59, 37, SOIL, 6);
  for (let x = 5; x < 55; x += 6) night.put(29 * 60 + x, FLOWER, 0, K_FLOWER | 8);
  night.autoFireflies = true;
  night.census();
  night.time = NIGHT_START + 0.01;
  night.run(900);
  const visitors = count(night, FIREFLY);
  assert.ok(visitors >= 5, `fireflies came (${visitors})`);
  night.time = MORNING;
  night.run(1200);
  assert.ok(count(night, FIREFLY) < visitors, 'and drift off in the morning');
});

test('the same seed and the same paint make the same garden', () => {
  const grow = (seed) => {
    const w = yard(64, 48, seed);
    fillRect(w, 0, 38, 63, 45, SOIL, 5);
    for (let s = 0; s < 400; s++) {
      if (s % 3 === 0) w.paint(10 + (s % 40), 4, 2, SAND, 0.35);
      if (s % 5 === 0) w.paint(50, 6, 2, WATER, 0.45);
      if (s % 40 === 0) w.spray(30, 20, 6, SEED, 3);
      if (s === 100) w.paint(40, 10, 2, LAVA);
      w.step();
    }
    return w.hash();
  };
  assert.equal(grow(42), grow(42));
  assert.notEqual(grow(42), grow(43));
});

test('a snapshot restores the garden exactly (undo)', () => {
  const w = yard(40, 30, 20);
  fillRect(w, 0, 22, 39, 27, SOIL, 6);
  w.paint(10, 4, 3, SAND);
  w.run(50);
  const snap = w.snapshot();
  const h = w.hash();
  w.paint(20, 10, 5, WATER);
  w.clear();
  assert.notEqual(w.hash(), h);
  assert.equal(w.restore(snap), true);
  assert.equal(w.hash(), h);
  assert.equal(w.restore({ ...snap, w: 10 }), false, 'a snapshot of another size is refused');
});

test('painting fills empty space, replaces only what it may, and the eraser clears anything', () => {
  const w = new World(30, 30, 21);
  fillRect(w, 0, 10, 29, 19, WATER);
  w.paint(15, 15, 3, SAND, 1);
  assert.equal(count(w, SAND), 0, 'sand does not overwrite water');
  const over = new Uint8Array(32);
  over[WATER] = 1;
  w.paint(15, 15, 3, STONE, 1, over);
  assert.ok(count(w, STONE) > 20, 'stone builds a dam through water');
  w.paint(15, 15, 6, EMPTY);
  assert.equal(w.at(15, 15), EMPTY);
  assert.ok(w.addFish(5, 12));
  assert.equal(w.at(5, 12), FISH);
  assert.equal(w.addFish(15, 15) && w.addFish(-1, 3), false);
});

test('day turns to night and back; the sky button hurries it along', () => {
  const w = new World(20, 20, 22);
  assert.equal(isNight(w.time), false);
  assert.equal(nightAmount(0.2), 0);
  assert.equal(nightAmount(0.8), 1);
  for (let t = 0; t < 1; t += 0.01) {
    const v = nightAmount(t);
    assert.ok(v >= 0 && v <= 1);
  }
  w.skipTo(0.7);
  for (let s = 0; s < 200 && w.warp; s++) w.step();
  assert.equal(w.warp, null);
  assert.ok(Math.abs(w.time - 0.7) < 0.001);
  assert.ok(isNight(w.time));
  w.skipTo(MORNING);
  for (let s = 0; s < 200 && w.warp; s++) w.step();
  assert.ok(Math.abs(w.time - MORNING) < 0.001, 'forward through the night to morning');
});

test('refit keeps every cell when the garden fits, anchored bottom-centre', () => {
  const tall = new World(40, 80, 23);
  fillRect(tall, 0, 70, 39, 79, STONE);
  fillRect(tall, 10, 60, 14, 69, SOIL, 4);
  tall.markers.push({ id: 'line', y: 50, base: 70, x: 20 });
  const { world: wide, f } = refit(tall, 80, 40);
  assert.equal(f, 1);
  assert.equal(count(wide, SOIL), 50);
  assert.equal(wide.at(30, 39), STONE, 'bottom row stays at the bottom');
  assert.equal(wide.at(30, 20), SOIL, 'soil keeps its place relative to the ground');
  assert.equal(wide.at(34, 29), SOIL);
  assert.equal(wide.at(35, 29), EMPTY);
  assert.equal(wide.at(0, 39), STONE, 'ground extends into the new width');
  assert.equal(wide.at(0, 20), EMPTY, 'but only ground');
  const m = wide.markers[0];
  assert.deepEqual([m.x, m.y, m.base], [40, 10, 30]);
  assert.equal(wide.a[wide.idx(32, 25)], 4, 'cell state comes along');
});

test('refit scales a garden down evenly when it would not fit', () => {
  const w = new World(40, 80, 24);
  fillRect(w, 0, 76, 39, 79, STONE);
  fillRect(w, 19, 0, 20, 75, WOOD); // a tree to the very top
  const { world: short, f } = refit(w, 80, 40);
  assert.ok(f < 1);
  assert.ok(count(short, WOOD) > 0);
  assert.ok(short.at(39, 0) === WOOD || short.at(40, 0) === WOOD, 'the top of the tree is still on screen');
  assert.equal(short.at(40, 39), STONE);
});

test('turning a phone sideways and back gives the same garden', () => {
  const upright = new World(130, 235, 26);
  fillRect(upright, 0, 195, 129, 234, SOIL, 6);
  fillRect(upright, 0, 230, 129, 234, STONE);
  fillRect(upright, 50, 185, 70, 194, WATER);
  fillRect(upright, 30, 150, 31, 194, WOOD);
  const before = upright.hash();
  const side = refit(upright, 234, 130).world;
  assert.equal(count(side, WOOD), 90, 'the tree fits sideways');
  assert.equal(side.at(0, 129), STONE, 'the ground runs to the new edges');
  const back = refit(side, 130, 235).world;
  assert.equal(back.hash(), before, 'and back again, cell for cell');
});

test('refit keeps sand, water and plants on screen when the grid narrows', () => {
  const wide = new World(200, 60, 27);
  fillRect(wide, 0, 50, 199, 59, SOIL);
  fillRect(wide, 2, 45, 6, 49, SAND);
  fillRect(wide, 193, 45, 197, 49, WATER);
  const { world: narrow, f } = refit(wide, 100, 60);
  assert.ok(f < 1);
  assert.ok(count(narrow, SAND) > 0 && count(narrow, WATER) > 0);
});

test('a full-budget garden steps quickly', () => {
  const W = 320;
  const H = 187;
  const w = new World(W, H, 25);
  fillRect(w, 0, 150, W - 1, H - 1, SOIL, 6);
  fillRect(w, 20, 100, 140, 149, WATER);
  for (let k = 0; k < 3000; k++) w.paint(160 + (k % 150), 10 + (k % 80), 0, SAND);
  w.spray(220, 140, 60, SEED, 300);
  w.paint(250, 60, 8, LAVA);
  w.run(30);
  const t0 = performance.now();
  w.run(120);
  const ms = (performance.now() - t0) / 120;
  assert.ok(ms < 6, `step took ${ms.toFixed(2)} ms`);
});
