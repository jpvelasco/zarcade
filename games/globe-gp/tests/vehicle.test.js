import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVehicle, stepVehicle, followGround, driftTier, miniTurbo, surfaceFactor, DRIFT, BOOST } from '../src/vehicle.js';
import { CARS, CAR_BY_ID, carStats, statBars } from '../src/cars.js';

const DT = 1 / 60;
const run = (v, input, seconds, surf) => { for (let i = 0; i < seconds * 60; i++) stepVehicle(v, input, DT, surf); };
const hatch = () => makeVehicle(0, 0, 0, 0, carStats(CAR_BY_ID.hatch));

test('drift tiers and mini-turbo lengths', () => {
  assert.equal(driftTier(0), 0);
  assert.equal(driftTier(DRIFT.tiers[0] - 0.01), 0);
  assert.equal(driftTier(DRIFT.tiers[0]), 1);
  assert.equal(driftTier(DRIFT.tiers[1] + 0.1), 2);
  assert.equal(driftTier(99), 3);
  assert.equal(miniTurbo(0), 0);
  assert.deepEqual([1, 2, 3].map(miniTurbo), DRIFT.turbo);
  assert.ok(DRIFT.turbo[0] < DRIFT.turbo[1] && DRIFT.turbo[1] < DRIFT.turbo[2]);
});

test('a drift starts only at speed with steering, then charges', () => {
  const v = hatch();
  run(v, { throttle: 1 }, 0.3);
  assert.equal(stepVehicle(v, { throttle: 1, steer: 1, drift: true }, DT), null, 'too slow to drift');
  assert.equal(v.drifting, false);
  run(v, { throttle: 1 }, 3);
  assert.ok(v.speed > DRIFT.minSpeed);
  assert.equal(stepVehicle(v, { throttle: 1, steer: 0, drift: true }, DT), null, 'needs steering');
  assert.equal(stepVehicle(v, { throttle: 1, steer: 1, drift: true }, DT), 'drift');
  assert.equal(v.drifting, true);
  assert.equal(v.driftDir, 1);
  const before = v.driftCharge;
  run(v, { throttle: 1, steer: 1, drift: true }, 0.5);
  assert.ok(v.driftCharge > before);
});

test('releasing a charged drift fires a mini-turbo that raises top speed', () => {
  const v = hatch();
  run(v, { throttle: 1 }, 3);
  run(v, { throttle: 1, steer: 1, drift: true }, 2.2);
  const tier = driftTier(v.driftCharge);
  assert.ok(tier >= 2, `tier ${tier} after 2.2 s`);
  assert.equal(stepVehicle(v, { throttle: 1, steer: 0, drift: false }, DT), 'turbo');
  assert.equal(v.lastTier, tier);
  assert.ok(Math.abs(v.turbo - miniTurbo(tier)) < DT * 1.5);

  // Boosted top speed beats plain top speed.
  const plain = hatch(), boosted = hatch();
  run(plain, { throttle: 1 }, 12);
  run(boosted, { throttle: 1 }, 12);
  boosted.turbo = 3;
  run(boosted, { throttle: 1 }, 1.5);
  assert.ok(boosted.speed > plain.speed * 1.08, `${boosted.speed} vs ${plain.speed}`);
});

test('a short drift gives no turbo', () => {
  const v = hatch();
  run(v, { throttle: 1 }, 3);
  run(v, { throttle: 1, steer: -1, drift: true }, 0.3);
  assert.equal(stepVehicle(v, { throttle: 1 }, DT), null);
  assert.equal(v.turbo, 0);
});

test('drifting tucked in turns tighter than counter-steering', () => {
  const tight = hatch(), wide = hatch();
  for (const v of [tight, wide]) { run(v, { throttle: 1 }, 3); stepVehicle(v, { throttle: 1, steer: 1, drift: true }, DT); }
  const h0 = tight.heading;
  run(tight, { throttle: 1, steer: 1, drift: true }, 1);
  run(wide, { throttle: 1, steer: -1, drift: true }, 1);
  assert.ok(wide.drifting && tight.drifting);
  assert.ok(Math.abs(tight.heading - h0) > Math.abs(wide.heading - h0) * 1.4);
});

test('boost meter burns while held and fills while drifting or flying', () => {
  const v = hatch();
  run(v, { throttle: 1 }, 2);
  v.meter = 0.5;
  run(v, { throttle: 1, boost: true }, 0.5);
  assert.ok(Math.abs(v.meter - (0.5 - BOOST.burn * 0.5)) < 0.02);
  assert.ok(v.boosting);
  const m = v.meter;
  run(v, { throttle: 1, steer: 1, drift: true }, 1);
  assert.ok(v.meter > m);
  v.grounded = false;
  const m2 = v.meter;
  run(v, { throttle: 1 }, 0.5);
  assert.ok(v.meter > m2);
});

test('slippery surfaces grip less, and off-road cars feel them less', () => {
  const asphalt = surfaceFactor('asphalt', 0), snow = surfaceFactor('snow', 0), sand = surfaceFactor('sand', 0);
  assert.equal(asphalt.grip, 1);
  assert.ok(snow.grip < 0.7 && sand.speed < 0.9);
  const rally = surfaceFactor('snow', 1);
  assert.ok(rally.grip > snow.grip && rally.grip < 1);
  // On snow a hard turn leaves more sideways slide than on asphalt.
  const slide = (surf) => {
    const v = hatch();
    run(v, { throttle: 1 }, 3, surf);
    run(v, { throttle: 1, steer: 1 }, 0.6, surf);
    return v.slip;
  };
  assert.ok(slide(snow) > slide(asphalt) * 1.3);
  // Sand caps top speed.
  const a = hatch(), s = hatch();
  run(a, { throttle: 1 }, 10, asphalt);
  run(s, { throttle: 1 }, 10, sand);
  assert.ok(s.speed < a.speed * 0.9);
});

test('cars have distinct handling', () => {
  assert.ok(CARS.length >= 8);
  const ids = new Set(CARS.map((c) => c.id));
  for (const id of ['kart', 'hatch', 'muscle', 'rally', 'sports', 'bug', 'pickup', 'ev']) assert.ok(ids.has(id), id);
  const bars = CARS.map((c) => JSON.stringify(statBars(c)));
  assert.equal(new Set(bars).size, CARS.length, 'no two cars rate the same');
  const top = (id) => { const v = makeVehicle(0, 0, 0, 0, carStats(CAR_BY_ID[id])); run(v, { throttle: 1 }, 15); return v.speed; };
  assert.ok(top('ev') > top('kart') + 5);
  assert.ok(top('muscle') > top('hatch'));
  const quick = (id) => { const v = makeVehicle(0, 0, 0, 0, carStats(CAR_BY_ID[id])); run(v, { throttle: 1 }, 1.5); return v.speed; };
  assert.ok(quick('kart') > quick('pickup'));
  assert.ok(CAR_BY_ID.pickup.stats.weight > CAR_BY_ID.kart.stats.weight * 2);
  assert.ok(CAR_BY_ID.rally.stats.offroad > CAR_BY_ID.sports.stats.offroad);
});

test('upgrades raise speed and grip', () => {
  const base = carStats(CAR_BY_ID.hatch), up = carStats(CAR_BY_ID.hatch, { engine: 3, grip: 3, boost: 3 });
  assert.ok(up.maxSpeed > base.maxSpeed * 1.08);
  assert.ok(up.grip > base.grip * 1.15);
  assert.ok(up.boostFill > 1.5);
  assert.equal(CAR_BY_ID.hatch.stats.maxSpeed, 35, 'base stats are not mutated');
});

test('crests and ramps throw the car into the air, and it lands', () => {
  const v = makeVehicle(0, 0, 0, 0, carStats(CAR_BY_ID.hatch));
  // Climbing quickly then the ground dropping away.
  for (let i = 0; i < 20; i++) followGround(v, i * 0.12, DT);
  followGround(v, 0, DT);
  assert.equal(v.grounded, false);
  let landed = 0;
  for (let i = 0; i < 120 && !landed; i++) { followGround(v, 0, DT); landed = v.landed; }
  assert.ok(landed > 0 && v.grounded);
});
