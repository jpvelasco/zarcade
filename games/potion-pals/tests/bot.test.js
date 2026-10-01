import test from 'node:test';
import assert from 'node:assert/strict';
import { Alchemy, newState } from '../src/alchemy.js';
import { Bot, simulate } from '../src/bot.js';
import { DISCOVERIES, ITEMS, PALS, POTIONS } from '../src/recipes.js';

// A player who knows nothing about the recipe table: it only ever tries mixes
// of what it already has and keeps whatever comes out. If this finds all 112
// discoveries, the graph really is findable by experiment.
function blindSolver() {
  const a = new Alchemy(newState(1));
  const tried = new Set();
  let grew = true;
  let brews = 0;
  while (grew) {
    grew = false;
    const known = a.shelf(); // ingredients only; potions cannot go in the pot
    for (let i = 0; i < known.length; i++) {
      for (let j = i; j < known.length; j++) {
        const key = `${known[i]}+${known[j]}`;
        if (tried.has(key)) continue;
        tried.add(key);
        a.clear();
        a.add(known[i]);
        a.add(known[j]);
        brews++;
        if (a.brew('1970-01-01').isNew) grew = true;
      }
    }
    if (grew) continue;
    // Nothing left in pairs: start trying threes.
    for (let i = 0; i < known.length && !grew; i++) {
      for (let j = i; j < known.length && !grew; j++) {
        for (let k = j; k < known.length; k++) {
          const key = `${known[i]}+${known[j]}+${known[k]}`;
          if (tried.has(key)) continue;
          tried.add(key);
          a.clear();
          a.add(known[i]);
          a.add(known[j]);
          a.add(known[k]);
          brews++;
          if (a.brew('1970-01-01').isNew) { grew = true; break; }
        }
      }
    }
  }
  return { a, brews };
}

test('a player who only experiments finds every discovery', () => {
  const { a, brews } = blindSolver();
  const missing = DISCOVERIES.filter((id) => !a.knows(id));
  assert.deepEqual(missing, [], `${missing.length} discoveries cannot be found by mixing`);
  assert.equal(a.discovered, DISCOVERIES.length);
  assert.equal(a.palCount, PALS.length);
  assert.ok(brews > 0);
});

test('the demo alchemist fills the treehouse without help', () => {
  const a = new Alchemy(newState(5));
  simulate(a, 500);
  assert.equal(a.discovered, DISCOVERIES.length);
  assert.equal(a.palCount, PALS.length);
  assert.equal(a.keepsakes().length, POTIONS.length);
  assert.equal(a.state.rooms, 6);
});

test('the attract-mode bot adds, brews and sometimes fizzles', () => {
  const a = new Alchemy(newState(2));
  const bot = new Bot(a, 9);
  let adds = 0;
  let hits = 0;
  let fizzles = 0;
  for (let i = 0; i < 6000; i++) {
    const action = bot.step(1 / 30, '1970-01-01');
    if (!action) continue;
    if (action.kind === 'add') adds++;
    else if (action.result?.ok) hits++;
    else fizzles++;
  }
  assert.ok(adds > 50, `only ${adds} ingredients added`);
  assert.ok(hits > 20, `only ${hits} discoveries`);
  assert.ok(fizzles > 0, 'the demo should show a fizzle too');
  assert.ok(a.palCount > 0, 'the demo treehouse should gain pals');
});

test('the bot never jams, even once everything is found', () => {
  const a = new Alchemy(newState(3));
  simulate(a, 500);
  const bot = new Bot(a, 4);
  for (let i = 0; i < 2000; i++) bot.step(1 / 30, '1970-01-01');
  assert.equal(a.discovered, DISCOVERIES.length);
  assert.ok(a.pot.length <= 3);
});

test('the shelf only ever grows, in the order things were found', () => {
  const a = new Alchemy(newState(6));
  let last = a.shelf();
  for (let n = 0; n < 60; n++) {
    simulate(a, 1, n + 1);
    const now = a.shelf();
    assert.deepEqual(now.slice(0, last.length), last, 'the shelf reordered itself');
    last = now;
  }
  const ingredients = ITEMS.filter((it) => it.kind !== 'potion').length;
  assert.ok(last.length <= ingredients);
});
