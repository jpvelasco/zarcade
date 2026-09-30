import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps.js';
import { simulate } from '../src/autoplay.js';

test('the autoplayer saves the picnic on map 1 with a simple strategy', () => {
  const g = simulate(0);
  assert.equal(g.status, 'won');
  assert.ok(g.baskets >= 5, `baskets left ${g.baskets}`);
});

test('doing nothing loses map 1', () => {
  const g = simulate(0, { build: false });
  assert.equal(g.status, 'lost');
  assert.ok(g.wave <= 4, `lost by wave ${g.wave}`);
});

test('every map is winnable by the autoplayer and lost by an idle player', () => {
  MAPS.forEach((m, i) => {
    assert.equal(simulate(i).status, 'won', `${m.name} autoplayer`);
    assert.equal(simulate(i, { build: false }).status, 'lost', `${m.name} idle`);
  });
});
