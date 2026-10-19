import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMALS, BIOMES, RARITIES, DECOS, RANKS, animalsOf, HABITAT_LEVELS, PLOTS_PER_BIOME } from '../src/data.js';

test('42 animals with unique ids and names', () => {
  assert.ok(ANIMALS.length >= 40);
  assert.equal(new Set(ANIMALS.map((a) => a.id)).size, ANIMALS.length);
  assert.equal(new Set(ANIMALS.map((a) => a.name)).size, ANIMALS.length);
});

test('every biome has 3 common, 2 uncommon, 1 rare and 1 legendary', () => {
  for (const b of BIOMES) {
    const list = animalsOf(b.id);
    const count = (r) => list.filter((a) => a.rarity === r).length;
    assert.deepEqual(RARITIES.map(count), [3, 2, 1, 1], b.id);
  }
});

test('every animal has a look, a size and a fun fact', () => {
  const kinds = new Set(['mammal', 'bird', 'fish', 'crab', 'octopus', 'seahorse', 'frog', 'seal']);
  for (const a of ANIMALS) {
    assert.ok(kinds.has(a.look.kind), `${a.id} kind`);
    assert.ok(a.look.size > 0.5 && a.look.size <= 1.25, `${a.id} size`);
    assert.match(a.look.body, /^#[0-9a-f]{6}$/i);
    assert.ok(a.fact.length > 10 && a.fact.length < 90, `${a.id} fact length`);
  }
});

test('biome prices and tiers climb in unlock order', () => {
  for (let b = 1; b < BIOMES.length; b++) {
    assert.ok(BIOMES[b].unlock > BIOMES[b - 1].unlock);
    assert.ok(BIOMES[b].egg > BIOMES[b - 1].egg);
    assert.ok(BIOMES[b].tier > BIOMES[b - 1].tier);
    assert.equal(BIOMES[b].habitats.length, PLOTS_PER_BIOME);
  }
  assert.equal(BIOMES[0].unlock, 0);
});

test('every biome has room for all its animals at max level', () => {
  const max = HABITAT_LEVELS.at(-1).cap * PLOTS_PER_BIOME;
  for (const b of BIOMES) assert.ok(max >= animalsOf(b.id).length);
});

test('decorations and ranks are ordered', () => {
  for (let i = 1; i < DECOS.length; i++) assert.ok(DECOS[i].price > DECOS[i - 1].price);
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].score > RANKS[i - 1].score);
  assert.ok(DECOS.length <= BIOMES.length * 3, 'enough spots for every decoration');
});
