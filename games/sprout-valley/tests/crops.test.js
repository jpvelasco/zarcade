import test from 'node:test';
import assert from 'node:assert/strict';
import { plant, growNight, checkSeason, harvest, isRipe, stageOf, STAGES, canPlant, daysLeft } from '../src/crops.js';
import { CROPS, CROP_IDS } from '../src/data.js';
import { DAYS_PER_SEASON } from '../src/time.js';

test('a watered crop ripens after exactly its growing days', () => {
  for (const id of CROP_IDS) {
    const c = plant(id);
    for (let d = 0; d < CROPS[id].days; d++) {
      assert.equal(isRipe(c), false, `${id} ripe too early on day ${d}`);
      growNight(c, true);
    }
    assert.equal(isRipe(c), true, `${id} should be ripe`);
    assert.equal(stageOf(c), STAGES);
  }
});

test('growth is deterministic and needs water', () => {
  const a = plant('carrot'), b = plant('carrot');
  const pattern = [true, false, true, true, false, true];
  for (const wet of pattern) { growNight(a, wet); growNight(b, wet); }
  assert.deepEqual(a, b);
  assert.equal(a.age, 4);
  const dry = plant('turnip');
  for (let i = 0; i < 10; i++) growNight(dry, false);
  assert.equal(dry.age, 0);
  assert.equal(daysLeft(dry), CROPS.turnip.days);
});

test('greenhouse crops grow without water and never wither', () => {
  const c = plant('melon');
  for (let i = 0; i < CROPS.melon.days; i++) growNight(c, false, true);
  assert.ok(isRipe(c));
  checkSeason(c, 'winter', true);
  assert.equal(c.dead, false);
  assert.ok(canPlant('melon', 'winter', true));
  assert.equal(canPlant('melon', 'winter', false), false);
});

test('stages climb monotonically while growing', () => {
  for (const id of CROP_IDS) {
    const c = plant(id);
    let last = -1;
    while (!isRipe(c)) { const s = stageOf(c); assert.ok(s >= last); last = s; growNight(c, true); }
  }
});

test('regrowing crops come back and single crops are pulled', () => {
  const s = plant('strawberry');
  for (let i = 0; i < CROPS.strawberry.days; i++) growNight(s, true);
  const first = harvest(s);
  assert.deepEqual(first, { item: 'strawberry', n: 1, keep: true });
  assert.equal(isRipe(s), false);
  for (let i = 0; i < CROPS.strawberry.regrow; i++) growNight(s, true);
  assert.ok(isRipe(s));
  const t = plant('turnip');
  for (let i = 0; i < 3; i++) growNight(t, true);
  assert.equal(harvest(t).keep, false);
  assert.equal(harvest(plant('turnip')), null);
});

test('out-of-season crops wither at the season change', () => {
  const c = plant('turnip');
  checkSeason(c, 'spring');
  assert.equal(c.dead, false);
  checkSeason(c, 'summer');
  assert.equal(c.dead, true);
  growNight(c, true);
  assert.equal(c.age, 0);
  assert.equal(isRipe(c), false);
});

test('every crop fits in a season and pays back its seed', () => {
  for (const [id, c] of Object.entries(CROPS)) {
    assert.ok(c.days < DAYS_PER_SEASON, `${id} must ripen within a season`);
    // Planted on the first day of its first season, a crop pays back its seed.
    const span = DAYS_PER_SEASON * c.seasons.length - 1;
    const harvests = 1 + (c.regrow ? Math.floor((span - c.days) / c.regrow) : 0);
    assert.ok(c.sell * (c.yield || 1) * Math.min(harvests, 2) > c.seed * 1.2, `${id} must be profitable within a season`);
    assert.ok(c.seasons.length >= 1);
  }
  for (const s of ['spring', 'summer', 'autumn', 'winter']) {
    assert.ok(CROP_IDS.some((id) => CROPS[id].seasons.includes(s)), `${s} has a crop`);
  }
});
