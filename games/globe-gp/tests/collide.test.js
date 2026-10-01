import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVehicle, stepVehicle } from '../src/vehicle.js';
import { collideWall, collideCircle, bumpCars } from '../src/collide.js';
import { CAR_BY_ID, carStats } from '../src/cars.js';
import { Race, DT } from '../src/race.js';
import { LOCATION_BY_ID } from '../src/locations.js';

const R = 1.5;
// A straight wall along z at x = 5, facing -x (the drivable side).
const wall = { ax: 5, az: -500, bx: 5, bz: 500, ex: 0, ez: 1000, len: 1000, nx: -1, nz: 0 };

function car(heading, speed) {
  const v = makeVehicle(0, 0, 0, heading, carStats(CAR_BY_ID.hatch));
  v.vx = Math.sin(heading) * speed;
  v.vz = Math.cos(heading) * speed;
  return v;
}

function drive(v, seconds, collide, input = { throttle: 1 }) {
  let hits = 0;
  for (let i = 0; i < seconds * 60; i++) {
    stepVehicle(v, input, DT);
    if (collide(v)) hits++;
  }
  return hits;
}

test('a car driven into a wall at an angle slides along it and never sticks', () => {
  for (const angleDeg of [15, 35, 60, 85]) {
    const heading = (angleDeg * Math.PI) / 180; // toward +x, into the wall
    const v = car(heading, 25);
    const hits = drive(v, 3, (c) => collideWall(c, wall, R, DT));
    assert.ok(hits > 0, `${angleDeg}°: touched the wall`);
    assert.ok(v.x <= 5 - R + 0.05, `${angleDeg}°: stayed on the road side (${v.x})`);
    assert.ok(v.z > 25, `${angleDeg}°: kept moving along the wall (${v.z.toFixed(1)} m)`);
    assert.ok(Math.hypot(v.vx, v.vz) > 10, `${angleDeg}°: kept speed`);
  }
});

test('a head-on wall hit turns into a glance instead of a dead stop', () => {
  const v = car(Math.PI / 2 - 0.02, 30); // almost straight at the wall
  drive(v, 2, (c) => collideWall(c, wall, R, DT, { x: 0, z: 1 }));
  assert.ok(Math.abs(v.z) > 8, `slid sideways ${v.z.toFixed(1)} m`);
  assert.ok(v.x <= 5 - R + 0.05);
});

test('a car cannot tunnel through a wall even at very high speed', () => {
  const v = car(Math.PI / 2, 80);
  v.x = 3.2;
  v.px = 3.2;
  stepVehicle(v, { throttle: 1 }, DT);
  collideWall(v, wall, R, DT);
  assert.ok(v.x < 5);
});

test('a car behind a wall is held on its own side', () => {
  const v = car(-Math.PI / 2, 20); // driving toward -x from beyond the wall
  v.x = v.px = 8;
  drive(v, 1, (c) => collideWall(c, wall, R, DT));
  assert.ok(v.x >= 5 + R - 0.05, `stayed behind (${v.x})`);
});

test('scraping a round prop slides around it', () => {
  const v = car(0, 25);
  v.x = v.px = 0.8;
  const hits = drive(v, 2, (c) => collideCircle(c, 0, 20, 1.2, R, DT));
  assert.ok(hits > 0);
  assert.ok(v.z > 25, `got past the prop (${v.z.toFixed(1)})`);
  assert.ok(Math.hypot(v.vx, v.vz) > 15, 'kept most of its speed');
});

test('a head-on prop hit still lets the car get past', () => {
  const v = car(0, 25);
  drive(v, 3, (c) => collideCircle(c, 0, 20, 1.2, R, DT, { x: 0, z: 1 }));
  assert.ok(v.z > 25, `got round the prop (${v.z.toFixed(1)})`);
});

test('car bumps separate cars and the lighter one moves more', () => {
  const kart = makeVehicle(0, 0, 0, 0, carStats(CAR_BY_ID.kart));
  const truck = makeVehicle(2, 0, 0, 0, carStats(CAR_BY_ID.pickup));
  kart.vx = 6; // drifting into the truck
  const impact = bumpCars(kart, truck, 1.25, 1.75);
  assert.ok(impact > 5);
  assert.ok(Math.hypot(truck.x - kart.x, truck.z - kart.z) >= 3 - 1e-6);
  assert.ok(kart.vx < truck.vx, 'kart bounced back');
  assert.ok(Math.abs(kart.x - 0) > Math.abs(truck.x - 2), 'lighter car pushed further');
  // Cars at different heights (one jumping) pass over each other.
  const a = makeVehicle(0, 0, 0, 0, carStats(CAR_BY_ID.kart)), b = makeVehicle(1, 3, 0, 0, carStats(CAR_BY_ID.kart));
  assert.equal(bumpCars(a, b, 1.25, 1.25), 0);
});

test('in a full race, a player holding full lock into the wall keeps moving', () => {
  const race = new Race({ location: LOCATION_BY_ID.tokyo, kind: 'timetrial', car: CAR_BY_ID.muscle, difficulty: 'normal' });
  for (let i = 0; i < 200; i++) race.step(DT, { throttle: 0 });
  const p = race.player;
  for (let i = 0; i < 60 * 8; i++) race.step(DT, { throttle: 1, steer: i < 60 ? 1 : 0.15 });
  const t = race.track;
  assert.ok(Math.abs(p.lateral) < t.wallOffset + 0.5, `held inside the walls (${p.lateral.toFixed(1)})`);
  assert.ok(p.raceDist > 120, `still made progress (${p.raceDist.toFixed(0)} m)`);
});
