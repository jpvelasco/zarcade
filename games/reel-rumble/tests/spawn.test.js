import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH, WATERS, WATER, appearsAt } from '../src/data.js';
import { periodOf, weatherFor, nextPeriodHour, advanceClock, spawnTable, rollFish } from '../src/spawn.js';
import { mulberry32 } from '../src/rng.js';

const combos = (w) => w.periods.flatMap((p) => Object.keys(w.weathers).map((x) => [p, x]));

test('spawn tables only hold fish whose time and weather match', () => {
  for (const w of WATERS) {
    for (const [period, weather] of combos(w)) {
      const table = spawnTable(w.id, period, weather);
      assert.ok(table.length >= 3, `${w.id} ${period} ${weather} has fish`);
      for (const { fish, weight } of table) {
        assert.equal(fish.water, w.id);
        assert.ok(appearsAt(fish, period, weather), `${fish.id} at ${period}/${weather}`);
        if (fish.periods) assert.ok(fish.periods.includes(period));
        if (fish.weathers) assert.ok(fish.weathers.includes(weather));
        assert.ok(weight > 0);
      }
      // And nothing that should be there is missing.
      const ids = new Set(table.map((e) => e.fish.id));
      for (const f of FISH.filter((x) => x.water === w.id)) assert.equal(ids.has(f.id), appearsAt(f, period, weather), f.id);
    }
  }
});

test('every fish shows up somewhere, sometime', () => {
  for (const f of FISH) {
    const w = WATER[f.water];
    assert.ok(combos(w).some(([p, x]) => spawnTable(w.id, p, x).some((e) => e.fish === f)), f.id);
  }
});

test('rolls are seeded, respect bands, and legends need the Starlight Lure', () => {
  const table = spawnTable('pond', 'night', 'rain');
  const a = mulberry32(5), b = mulberry32(5);
  for (let i = 0; i < 50; i++) assert.equal(rollFish(a, table, { band: 'deep', baitId: 'worm' }), rollFish(b, table, { band: 'deep', baitId: 'worm' }));
  const rng = mulberry32(9);
  let legend = 0;
  for (let i = 0; i < 400; i++) {
    const f = rollFish(rng, table, { band: 'deep', baitId: 'worm' });
    assert.ok(f.bands.includes('deep'));
    if (f.rarity === 'legendary') legend++;
  }
  assert.equal(legend, 0, 'no legend without the lure');
  for (let i = 0; i < 400; i++) if (rollFish(rng, table, { band: 'deep', baitId: 'starlight' }).rarity === 'legendary') legend++;
  assert.ok(legend > 20, 'the Starlight Lure brings legends');
});

test('the clock maps hours to times of day', () => {
  assert.equal(periodOf(5), 'dawn');
  assert.equal(periodOf(7.9), 'dawn');
  assert.equal(periodOf(8), 'day');
  assert.equal(periodOf(17), 'dusk');
  assert.equal(periodOf(20), 'night');
  assert.equal(periodOf(2), 'night');
  assert.equal(periodOf(12, 'lagoon'), 'night', 'Starfall Lagoon is always night');
  for (let h = 0; h < 24; h += 0.5) {
    const n = nextPeriodHour(h);
    assert.ok(n > h && n <= h + 24);
    assert.notEqual(periodOf(n), periodOf(h));
  }
  assert.deepEqual(advanceClock({ day: 1, hour: 23 }, 2), { day: 2, hour: 1 });
});

test('weather is deterministic and from the water\'s list', () => {
  for (const w of WATERS) {
    const seen = new Set();
    for (let day = 1; day < 20; day++) for (let h = 0; h < 24; h += 3) {
      const x = weatherFor(w.id, day, h);
      assert.ok(x in w.weathers, `${w.id} ${x}`);
      assert.equal(weatherFor(w.id, day, h), x);
      seen.add(x);
    }
    assert.equal(seen.size, Object.keys(w.weathers).length, `${w.id} gets every kind of weather`);
  }
});
