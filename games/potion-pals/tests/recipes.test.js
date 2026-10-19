import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEMS, ITEM, BASES, DISCOVERIES, POTIONS, PALS, PAL, RECIPES, USES,
  keyOf, resultOf, reachableFrom, frontier, branchOf, BRANCHES,
} from '../src/recipes.js';
import { SHAPE_NAMES, BODY_NAMES } from '../src/art.js';

test('the workshop starts with eight ingredients', () => {
  assert.equal(BASES.length, 8);
  for (const id of BASES) assert.equal(ITEM[id].inputs.length, 0);
});

test('there are at least 100 discoveries and 30 pals', () => {
  assert.ok(DISCOVERIES.length >= 100, `only ${DISCOVERIES.length} discoveries`);
  assert.ok(PALS.length >= 30, `only ${PALS.length} pals`);
  assert.ok(POTIONS.length >= 30, `only ${POTIONS.length} potions`);
});

test('ids and names are unique', () => {
  const ids = new Set();
  const names = new Set();
  for (const it of ITEMS) {
    assert.ok(!ids.has(it.id), `duplicate id ${it.id}`);
    assert.ok(!names.has(it.name), `duplicate name ${it.name}`);
    ids.add(it.id);
    names.add(it.name);
  }
  const palIds = new Set();
  for (const p of PALS) {
    assert.ok(!palIds.has(p.id), `duplicate pal ${p.id}`);
    palIds.add(p.id);
  }
});

test('every recipe input is a real item, and no potion is an input', () => {
  for (const it of ITEMS) {
    assert.ok(it.inputs.length === 0 || it.inputs.length === 2 || it.inputs.length === 3, `${it.id} has ${it.inputs.length} inputs`);
    for (const input of it.inputs) {
      assert.ok(ITEM[input], `${it.id} needs unknown ${input}`);
      assert.notEqual(ITEM[input].kind, 'potion', `${it.id} uses the potion ${input}`);
    }
  }
});

test('no two recipes share the same mix', () => {
  assert.equal(RECIPES.size, DISCOVERIES.length);
  const seen = new Set();
  for (const it of ITEMS) {
    if (!it.inputs.length) continue;
    const key = keyOf(it.inputs);
    assert.ok(!seen.has(key), `two recipes for ${key}`);
    seen.add(key);
  }
});

test('order never matters', () => {
  for (const it of ITEMS) {
    if (!it.inputs.length) continue;
    const reversed = it.inputs.slice().reverse();
    assert.equal(resultOf(reversed), it.id);
  }
});

test('inputs are only ever things defined earlier, so the table stays layered', () => {
  const seen = new Set();
  for (const it of ITEMS) {
    for (const input of it.inputs) assert.ok(seen.has(input), `${it.id} uses ${input} before it exists`);
    seen.add(it.id);
  }
});

test('every discovery is reachable from the starting eight', () => {
  const have = reachableFrom();
  const missing = DISCOVERIES.filter((id) => !have.has(id));
  assert.deepEqual(missing, []);
});

test('no dead ends: every ingredient is used in some recipe', () => {
  const dead = ITEMS.filter((it) => it.kind !== 'potion' && !USES.has(it.id)).map((it) => it.id);
  assert.deepEqual(dead, []);
});

test('every pal has exactly one potion, and every potion pal exists', () => {
  const counts = new Map();
  for (const it of ITEMS) {
    if (!it.pal) continue;
    assert.ok(PAL[it.pal], `${it.id} summons unknown pal ${it.pal}`);
    counts.set(it.pal, (counts.get(it.pal) || 0) + 1);
  }
  for (const p of PALS) assert.equal(counts.get(p.id), 1, `${p.id} has ${counts.get(p.id) || 0} potions`);
});

test('the first discovery is never more than one mix away', () => {
  // Every pair of starting ingredients (including a thing with itself) works,
  // so a first experiment practically always finds something.
  let hits = 0;
  for (let i = 0; i < BASES.length; i++) {
    for (let j = i; j < BASES.length; j++) {
      if (resultOf([BASES[i], BASES[j]])) hits++;
    }
  }
  assert.equal(hits, 36);
});

test('every art shape and pal body is implemented', () => {
  for (const it of ITEMS) assert.ok(SHAPE_NAMES.includes(it.shape), `no shape "${it.shape}" for ${it.id}`);
  for (const p of PALS) assert.ok(BODY_NAMES.includes(p.body), `no body "${p.body}" for ${p.id}`);
});

test('every item has a blurb and at least two tags', () => {
  for (const it of ITEMS) {
    assert.ok(it.name.length > 1 && it.blurb.length > 8, `thin copy for ${it.id}`);
    assert.ok(it.tags.length >= 2, `${it.id} needs more tags`);
    assert.match(it.c1, /^#[0-9a-f]{6}$/i);
    assert.match(it.c2, /^#[0-9a-f]{6}$/i);
  }
  for (const p of PALS) assert.ok(p.bio.length > 8 && p.species.length > 2, `thin copy for ${p.id}`);
});

test('every discovery lands on exactly one book page', () => {
  const pages = new Set(BRANCHES.map((b) => b.id));
  const counts = {};
  for (const id of DISCOVERIES) {
    const page = branchOf(id);
    assert.ok(pages.has(page), `${id} has no page`);
    counts[page] = (counts[page] || 0) + 1;
  }
  for (const b of BRANCHES) assert.ok(counts[b.id] > 0, `page ${b.id} is empty`);
});

test('the frontier grows from eight to everything', () => {
  const known = new Set(BASES);
  let steps = 0;
  while (known.size < ITEMS.length && steps < 400) {
    const next = frontier(known);
    assert.ok(next.length, 'the frontier dried up');
    for (const id of next) known.add(id);
    steps++;
  }
  assert.equal(known.size, ITEMS.length);
  assert.ok(steps <= 12, `the graph is ${steps} layers deep`);
});
