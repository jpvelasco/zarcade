import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH, WATERS, WATER, BANDS, BEHAVIORS, SPECIALS, RARITY_INFO, PERIODS, WEATHER_INFO, bandAt, depthAt, sizeOf, fishOfWater } from '../src/data.js';
import { BAITS, RODS } from '../src/gear.js';
import { SHAPES } from '../src/fishart.js';
import { Trip } from '../src/trip.js';

test('there are 40+ species, ten per water, one legend each', () => {
  assert.ok(FISH.length >= 40);
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length, 'unique ids');
  for (const w of WATERS) {
    const list = fishOfWater(w.id);
    assert.equal(list.length, 10, w.id);
    assert.equal(list.filter((f) => f.rarity === 'legendary').length, 1, `${w.id} legend`);
    for (const r of ['common', 'uncommon', 'rare']) assert.ok(list.some((f) => f.rarity === r), `${w.id} has ${r}`);
  }
});

test('every fish has valid data', () => {
  const baitIds = new Set(BAITS.map((b) => b.id));
  for (const f of FISH) {
    const w = WATER[f.water];
    assert.ok(w, f.id);
    assert.ok(RARITY_INFO[f.rarity], f.id);
    assert.ok(BEHAVIORS[f.behavior], f.id);
    assert.ok(SHAPES[f.look.shape], `${f.id} shape`);
    for (const k of ['body', 'belly', 'fin', 'accent']) assert.match(f.look[k], /^#[0-9a-f]{6}$/i, `${f.id} ${k}`);
    assert.ok(f.cm[0] > 0 && f.cm[1] > f.cm[0], `${f.id} cm`);
    assert.ok(f.kg[0] > 0 && f.kg[1] > f.kg[0], `${f.id} kg`);
    assert.ok(f.bands.length && f.bands.every((b) => BANDS.includes(b)), `${f.id} bands`);
    assert.ok(f.baits.length && f.baits.every((b) => baitIds.has(b)), `${f.id} baits`);
    if (f.periods) assert.ok(f.periods.every((p) => w.periods.includes(p)), `${f.id} periods fit ${w.id}`);
    if (f.weathers) assert.ok(f.weathers.every((x) => x in w.weathers), `${f.id} weathers fit ${w.id}`);
    assert.ok(f.fact.length > 20, `${f.id} has a fun fact`);
    assert.ok(f.power > 0 && f.stamina > 0 && f.speed > 0, f.id);
    if (f.rarity === 'legendary') {
      assert.ok(SPECIALS[f.special], `${f.id} special`);
      assert.equal(f.stages, 3);
      assert.deepEqual(f.baits, ['starlight']);
    } else assert.ok(!f.baits.includes('starlight'), `${f.id} ignores the legend lure`);
  }
  for (const w of WATERS) for (const x of Object.keys(w.weathers)) assert.ok(WEATHER_INFO[x], x);
  for (const w of WATERS) for (const p of w.periods) assert.ok(PERIODS.includes(p));
});

test('sizes grow with the roll', () => {
  for (const f of FISH) {
    const a = sizeOf(f, 0), b = sizeOf(f, 1);
    assert.ok(b.cm > a.cm && b.kg > a.kg, f.id);
  }
});

test('every fish lives at a depth the best rod can reach', () => {
  const bestCast = Math.max(...RODS.map((r) => r.cast));
  for (const f of FISH) {
    const trip = new Trip({ water: f.water, period: WATER[f.water].periods[0], weather: Object.keys(WATER[f.water].weathers)[0], equip: { rod: 'starlight', reel: 'tidal', line: 'silk', bait: 'worm' } });
    assert.equal(trip.reach, bestCast);
    const depths = [];
    for (let p = 0; p <= 1; p += 0.02) depths.push(trip.landingFor(p).y);
    for (const band of f.bands) assert.ok(depths.some((d) => bandAt(d) === band), `${f.id} ${band} reachable at ${f.water}`);
  }
});

test('the bottom gets deeper away from shore', () => {
  for (const w of WATERS) {
    if (w.ice) continue;
    assert.ok(depthAt(w, 2) < 3.5, `${w.id} shallow near shore`);
    assert.ok(depthAt(w, 55) > 8, `${w.id} deep far out`);
  }
});
