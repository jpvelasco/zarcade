import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH, WATER } from '../src/data.js';
import { lineHolds, gearStats, find } from '../src/gear.js';
import { playCast, BEST } from './helpers.js';

// Find a time and weather when the fish swims, then cast with the bot until
// it lands that species.
function conditionsFor(f) {
  const w = WATER[f.water];
  const period = (f.periods || w.periods)[0];
  const weather = (f.weathers || Object.keys(w.weathers))[0];
  return { period, weather };
}

test('every fish is catchable with some gear', () => {
  for (const f of FISH) {
    const { period, weather } = conditionsFor(f);
    const equip = { ...BEST, bait: f.baits[0] };
    assert.ok(find('bait', equip.bait), f.id);
    assert.ok(lineHolds(gearStats(equip), f), `${f.id}: the best line holds it`);
    let caught = null;
    for (let seed = 1; seed <= 60 && !caught; seed++) {
      const { trip, outcome } = playCast({ water: f.water, period, weather, equip }, { seed });
      if (outcome === 'landed' && trip.result.fish === f) caught = trip.result;
    }
    assert.ok(caught, `${f.id} was caught at ${f.water} (${period}, ${weather}) on ${equip.bait}`);
    assert.ok(caught.cm >= f.cm[0] && caught.cm <= f.cm[1], `${f.id} size in range`);
  }
});

test('legends only bite the Starlight Lure', () => {
  const f = FISH.find((x) => x.id === 'whiskers');
  for (let seed = 1; seed <= 25; seed++) {
    const { trip, outcome } = playCast({ water: 'pond', period: 'night', weather: 'rain', equip: { ...BEST, bait: 'worm' } }, { seed, maxSeconds: 60 });
    if (outcome === 'landed') assert.notEqual(trip.result.fish, f);
  }
});
