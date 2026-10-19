import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECIPES, RECIPE_IDS, STATIONS, STATION_IDS, BOOK_ORDER, CUSTOMERS, FLOW,
  firstStation, flowsForward, nextStation, stepTime, recipeTime, heartsFor, tipForHearts,
} from '../src/recipes.js';

test('every recipe is a chain of real stations that starts somewhere a baker can start', () => {
  for (const id of RECIPE_IDS) {
    const recipe = RECIPES[id];
    assert.equal(recipe.id, id);
    assert.ok(recipe.steps.length >= 1 && recipe.steps.length <= 4, `${id} has ${recipe.steps.length} steps`);
    for (const step of recipe.steps) assert.ok(STATIONS[step], `${id} uses unknown station ${step}`);
    assert.ok(STATIONS[recipe.steps[0]].start, `${id} starts at ${recipe.steps[0]}, which cannot start work`);
    assert.ok(recipe.value > 0, `${id} is worth nothing`);
    assert.ok(recipe.name.length > 2 && recipe.blurb.length > 10, `${id} needs words`);
    assert.match(recipe.color, /^(#|hsl)/);
    const oven = recipe.steps.filter((s) => s === 'oven').length;
    assert.ok(oven <= 1, `${id} uses the oven twice`);
    if (oven) assert.ok(recipe.bake > 1, `${id} bakes for ${recipe.bake}s`);
  }
});

test('longer recipes pay better than short ones', () => {
  const sorted = RECIPE_IDS.filter((id) => id !== 'special')
    .map((id) => ({ id, steps: RECIPES[id].steps.length, value: RECIPES[id].value }))
    .sort((a, b) => a.value - b.value);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].steps >= sorted[i - 1].steps - 1, `${sorted[i].id} pays more but is much shorter`);
  }
});

test('the chain walks forward and then stops', () => {
  assert.equal(firstStation('cake'), 'mixer');
  assert.equal(nextStation('cake', 'mixer'), 'oven');
  assert.equal(nextStation('cake', 'oven'), 'icing');
  assert.equal(nextStation('cake', 'icing'), 'decor');
  assert.equal(nextStation('cake', 'decor'), null);
  assert.equal(nextStation('cocoa', 'cocoa'), null);
});

test('the oven step uses the recipe bake time, other steps the station time', () => {
  assert.equal(stepTime('cake', 'oven'), RECIPES.cake.bake);
  assert.equal(stepTime('cake', 'mixer'), STATIONS.mixer.time);
  assert.ok(recipeTime('cake') > recipeTime('cupcake'));
  assert.ok(recipeTime('cupcake') > recipeTime('cocoa'));
});

test('every station is reachable from some recipe', () => {
  const used = new Set();
  for (const id of RECIPE_IDS) for (const step of RECIPES[id].steps) used.add(step);
  for (const station of STATION_IDS) assert.ok(used.has(station), `nothing uses ${station}`);
});

test('the recipe book lists every recipe once', () => {
  assert.deepEqual([...BOOK_ORDER].sort(), [...RECIPE_IDS].sort());
  assert.equal(new Set(BOOK_ORDER).size, BOOK_ORDER.length);
});

test('customers are all drawable and the regulars have names and notes', () => {
  for (const [id, kind] of Object.entries(CUSTOMERS)) {
    assert.equal(kind.id, id);
    assert.ok(kind.name.length > 1);
    assert.ok(kind.patience > 0 && kind.pay > 0 && kind.tip > 0);
    assert.ok(kind.order[0] >= 1 && kind.order[1] >= kind.order[0]);
    assert.match(kind.fur, /^#/);
    assert.match(kind.ear, /^#/);
    if (kind.regular) assert.ok(kind.note.length > 10, `${id} has no note`);
  }
  assert.ok(Object.values(CUSTOMERS).filter((c) => c.regular).length >= 4, 'not enough regulars');
});

test('hearts and tips agree: three hearts tips best, no hearts means gone', () => {
  assert.equal(heartsFor(1), 3);
  assert.equal(heartsFor(0.7), 3);
  assert.equal(heartsFor(0.66), 2);
  assert.equal(heartsFor(0.01), 1);
  assert.equal(heartsFor(0), 0);
  assert.ok(tipForHearts(3) > tipForHearts(2));
  assert.ok(tipForHearts(2) > tipForHearts(1));
  assert.equal(tipForHearts(1), 1);
});

test('work only flows one way through the kitchen, so two recipes can never jam', () => {
  assert.deepEqual([...FLOW].sort(), [...STATION_IDS].sort());
  for (const id of RECIPE_IDS) {
    assert.ok(flowsForward(RECIPES[id].steps), `${id} goes backwards: ${RECIPES[id].steps.join(' > ')}`);
  }
  assert.equal(flowsForward(['mixer', 'oven', 'jam']), false);
  assert.equal(flowsForward(['mixer', 'mixer']), false);
  assert.equal(flowsForward(['mixer', 'jam', 'oven', 'decor']), true);
  assert.equal(flowsForward(['nope']), false);
});
