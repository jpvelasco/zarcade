import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVehicle, stepVehicle, launch, BASE_STATS } from '../src/vehicle.js';

const flat = { height: () => 0, offroad: false };
const sand = { height: () => 0, offroad: true };
const run = (v, input, seconds, ground = flat) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepVehicle(v, input, 1 / 60, ground);
  return v;
};

test('accelerates toward top speed and no further', () => {
  const v = run(makeVehicle(0, 0, 0, 0), { throttle: 1 }, 20);
  assert.ok(v.speed > BASE_STATS.maxSpeed * 0.95, `speed ${v.speed}`);
  assert.ok(v.speed <= BASE_STATS.maxSpeed + 0.01);
  assert.ok(v.z > 100, 'heading 0 drives toward +z');
});

test('off-road is slower', () => {
  const road = run(makeVehicle(0, 0, 0, 0), { throttle: 1 }, 15);
  const off = run(makeVehicle(0, 0, 0, 0), { throttle: 1 }, 15, sand);
  assert.ok(off.speed < road.speed * 0.7);
});

test('nitro raises top speed and drains the tank', () => {
  const v = run(makeVehicle(0, 0, 0, 0), { throttle: 1 }, 15);
  v.nitro = 1;
  run(v, { throttle: 1, nitro: true }, 1.5);
  assert.ok(v.speed > BASE_STATS.maxSpeed * 1.05);
  assert.ok(v.nitro < 0.7);
});

test('steer +1 turns toward decreasing heading (right on screen)', () => {
  const v = run(makeVehicle(0, 0, 0, 0), { throttle: 1 }, 3);
  const before = v.heading;
  run(v, { throttle: 1, steer: 1 }, 0.5);
  assert.ok(v.heading < before);
});

test('braking stops, holding brake reverses', () => {
  const v = run(makeVehicle(0, 0, 0, 0), { throttle: 1 }, 5);
  run(v, { brake: 1 }, 5);
  assert.ok(v.speed < 0 && v.speed >= -BASE_STATS.reverseMax - 0.01);
});

test('launch goes airborne and lands with an impact speed', () => {
  const v = run(makeVehicle(0, 0, 0, 0), { throttle: 1 }, 3);
  launch(v, 12);
  let landed = 0, maxY = 0;
  for (let i = 0; i < 300 && !landed; i++) {
    stepVehicle(v, { throttle: 1 }, 1 / 60, flat);
    maxY = Math.max(maxY, v.y);
    landed = v.landed;
  }
  assert.ok(maxY > 2.5, `apex ${maxY}`);
  assert.ok(landed > 5 && v.grounded);
});

test('climbing momentum carries the jeep off a crest', () => {
  // A ramp-shaped hill: up at 20% for 40 m, then a cliff.
  const hill = { height: (_x, z) => (z < 40 ? Math.max(0, z) * 0.2 : 0), offroad: false };
  const v = makeVehicle(0, -30, 0, 0);
  v.vz = 30; v.speed = 30;
  let airborne = false;
  for (let i = 0; i < 180; i++) {
    stepVehicle(v, { throttle: 1 }, 1 / 60, hill);
    if (!v.grounded) airborne = true;
  }
  assert.ok(airborne);
});
