import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { buildScene, fillRect, SCENES } from '../src/scenes.js';
import {
  GOALS, GOAL_BY_ID, goalOpen, nextGoal, dailyPrompt, DAILY_TEMPLATES,
  waterfallRun, fishDepth, treeTop, vineHeight, restingSandTop, boxFill,
} from '../src/goals.js';
import { solve } from '../src/autoplay.js';
import { dateKey } from '../src/rng.js';
import { EMPTY, WATER, STONE, SAND, FISH, WOOD, LEAF, STEM, K_CROWN, K_VINE, PALETTE, BRUSHES, SKIES } from '../src/elements.js';

// The three screen shapes: a phone held upright, a phone on its side, a
// 16:10 desktop window (grid sizes the layout picks for them).
const SHAPES = [[130, 231], [241, 130], [320, 173]];

test('waterfallRun counts water falling through air, not a pond', () => {
  const w = new World(20, 40, 1);
  fillRect(w, 0, 30, 19, 39, WATER);
  assert.equal(waterfallRun(w), 0, 'a still pond is no waterfall');
  for (let y = 5; y < 25; y++) if (y % 4) w.put(y * 20 + 8, WATER);
  assert.ok(waterfallRun(w) >= 19, 'a stream with small gaps is one fall');
  const drip = new World(20, 40, 1);
  for (let y = 5; y < 25; y += 4) drip.put(y * 20 + 8, WATER);
  assert.ok(waterfallRun(drip) < 12, 'scattered drips are not a waterfall');
});

test('fishDepth measures still water through the fish', () => {
  const w = new World(20, 30, 2);
  fillRect(w, 0, 18, 19, 29, WATER);
  w.put(25 * 20 + 10, FISH);
  assert.equal(fishDepth(w), 12);
  for (let y = 0; y < 18; y++) w.put(y * 20 + 10, WATER); // a stream pouring in
  assert.equal(fishDepth(w), 12, 'the falling stream above does not count');
  assert.equal(fishDepth(new World(20, 20, 2)), 0);
});

test('treeTop, vineHeight, restingSandTop and boxFill read the garden', () => {
  const w = new World(30, 30, 3);
  assert.equal(treeTop(w), 30);
  w.put(20 * 30 + 5, WOOD);
  w.put(12 * 30 + 6, LEAF, 0, K_CROWN);
  w.put(8 * 30 + 9, LEAF, 0, 1); // a flower leaf is not a tree
  assert.equal(treeTop(w), 12);
  for (let y = 5; y < 25; y++) w.put(y * 30 + 20, STEM, 0, K_VINE);
  assert.equal(vineHeight(w), 20);

  const s = new World(10, 30, 4);
  fillRect(s, 0, 28, 9, 29, STONE);
  s.put(10 * 10 + 5, SAND);
  s.step();
  assert.equal(restingSandTop(s), 30, 'falling sand is not a pile');
  s.run(100);
  assert.equal(restingSandTop(s), 27, 'resting sand is');

  const b = new World(10, 10, 5);
  fillRect(b, 2, 2, 5, 5, WATER);
  assert.equal(boxFill(b, { x0: 2, x1: 5, y0: 2, y1: 5 }), 1);
  assert.equal(boxFill(b, { x0: 2, x1: 5, y0: 2, y1: 9 }), 0.5);
});

test('every goal is complete data with a scene, a check and a reward that exists', () => {
  const ids = new Set();
  for (const g of GOALS) {
    assert.ok(!ids.has(g.id));
    ids.add(g.id);
    assert.ok(g.title && g.text && g.tip && g.icon);
    assert.ok(SCENES[g.scene], `${g.id} scene`);
    assert.equal(typeof g.check, 'function');
    const r = g.reward;
    const pools = { element: PALETTE, brush: BRUSHES, sky: SKIES };
    if (r.type === 'flowers') assert.equal(r.id, 'rainbow');
    else {
      const item = pools[r.type].find((x) => x.id === r.id);
      assert.ok(item, `${g.id} reward ${r.id}`);
      assert.equal(item.unlock, g.id, `${r.id} unlocks from ${g.id}`);
    }
    for (const id of g.lend || []) assert.ok(PALETTE.some((p) => p.id === id));
  }
  for (const list of [PALETTE, BRUSHES, SKIES]) {
    for (const item of list) if (item.unlock) assert.ok(GOAL_BY_ID[item.unlock], `${item.id} unlock goal`);
  }
});

test('the next three unfinished goals are always open', () => {
  const done = {};
  assert.deepEqual(GOALS.map((_, i) => goalOpen(done, i)).slice(0, 4), [true, true, true, false]);
  done.waterfall = true;
  assert.deepEqual(GOALS.map((_, i) => goalOpen(done, i)).slice(0, 5), [true, true, true, true, false]);
  assert.equal(nextGoal(done).id, 'sprout');
  for (const g of GOALS) done[g.id] = true;
  assert.equal(nextGoal(done), null);
});

for (const g of GOALS) {
  test(`goal "${g.id}": its starter scene fits every screen and the script finishes it`, () => {
    for (const [w, h] of SHAPES) {
      const world = new World(w, h, 7);
      const info = buildScene(world, g.scene, 99);
      for (const [name, a] of Object.entries(info.anchors)) {
        for (const k of ['x', 'x0', 'x1']) if (a[k] !== undefined) assert.ok(a[k] >= 0 && a[k] < w, `${g.id} ${name}.${k} on screen`);
        for (const k of ['y', 'y0', 'y1']) if (a[k] !== undefined) assert.ok(a[k] >= 0 && a[k] < h, `${g.id} ${name}.${k} on screen`);
      }
      assert.equal(g.check(world).done, false, `${g.id} is not done before you start (${w}x${h})`);
      // The top-centre stays clear for the full-screen pill and the HUD.
      for (let y = 0; y < Math.min(6, h); y++) {
        for (let x = (w >> 1) - 4; x <= (w >> 1) + 4; x++) assert.equal(world.at(x, y), EMPTY, `${g.id} top centre clear`);
      }
      const steps = solve(world, g.id, info.anchors, (wd) => g.check(wd), 6000);
      assert.ok(steps >= 0, `${g.id} finished on ${w}x${h} (${JSON.stringify(g.check(world))})`);
    }
  });
}

test('a starter scene is the same every time for the same seed and size', () => {
  for (const g of GOALS) {
    const a = new World(200, 120, 1);
    const b = new World(200, 120, 1);
    buildScene(a, g.scene, 5);
    buildScene(b, g.scene, 5);
    assert.equal(a.hash(), b.hash(), g.id);
  }
});

test('the daily prompt is fixed for a day, changes between days and never repeats two days running', () => {
  const k = dateKey(new Date(2026, 9, 9));
  assert.deepEqual({ ...dailyPrompt(k), check: 0 }, { ...dailyPrompt(k), check: 0 });
  const seen = new Set();
  let last = null;
  for (let d = 0; d < 365; d++) {
    const p = dailyPrompt(dateKey(new Date(2026, 9, 9 + d)));
    assert.ok(DAILY_TEMPLATES.includes(p.template));
    assert.ok(p.title.length > 0 && p.text.length > 0);
    assert.notEqual(p.template, last, `${p.key} repeats yesterday`);
    last = p.template;
    seen.add(p.template);
  }
  assert.equal(seen.size, DAILY_TEMPLATES.length, 'every kind of prompt comes up');
});

test('every kind of daily prompt can be finished on a phone and a desktop', () => {
  const byTemplate = new Map();
  for (let d = 0; byTemplate.size < DAILY_TEMPLATES.length && d < 400; d++) {
    const p = dailyPrompt(dateKey(new Date(2026, 9, 9 + d)));
    if (!byTemplate.has(p.template)) byTemplate.set(p.template, p);
  }
  for (const p of byTemplate.values()) {
    for (const [w, h] of [SHAPES[0], SHAPES[2]]) {
      const world = new World(w, h, p.key);
      const info = buildScene(world, p.scene, p.seed, { flip: p.flip, params: p.params });
      assert.equal(p.check(world).done, false, `${p.template} not done at the start`);
      const steps = solve(world, p.template, info.anchors, p.check, 6000);
      assert.ok(steps >= 0, `${p.template} (${p.title}) finished on ${w}x${h}`);
    }
  }
});

test('finds come from what is in the garden right now', async () => {
  const { findsIn } = await import('../src/goals.js');
  const { COLLECTION_IDS, SOIL: S, OBSIDIAN: O } = await import('../src/elements.js');
  const w = new World(30, 30, 1);
  assert.deepEqual(findsIn(w), []);
  fillRect(w, 0, 25, 29, 29, S, 5);
  w.put(3, O);
  w.census();
  assert.deepEqual(findsIn(w), ['soil', 'mud', 'obsidian']);
  w.stats.rain = 1;
  assert.ok(findsIn(w).includes('rain'));
  for (const id of findsIn(w)) assert.ok(COLLECTION_IDS.includes(id));
});
