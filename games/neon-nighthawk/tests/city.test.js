import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK,
  ROAD_HALF,
  isRoad,
  keepOnRoad,
  routeBetween,
  routeLength,
  signalState,
  trafficPosition,
  makeTraffic,
} from '../src/city.js';

test('roads form a stable grid around every intersection', () => {
  assert.equal(isRoad(0, 0), true);
  assert.equal(isRoad(BLOCK * 3, BLOCK * -2), true);
  assert.equal(isRoad(BLOCK / 2, 0), true);
  assert.equal(isRoad(0, BLOCK / 2), true);
  assert.equal(isRoad(BLOCK / 2, BLOCK / 2), false);
});

test('keepOnRoad pushes a bike out of a building without moving it off-grid', () => {
  const result = keepOnRoad({ x: BLOCK / 2, y: BLOCK / 2 }, 18);
  assert.equal(result.hit, true);
  assert.equal(isRoad(result.x, result.y, 18), true);
  assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
});

test('a rounded lane boundary does not become a repeated wall hit', () => {
  const inset = 18;
  const edge = ROAD_HALF - inset;
  const result = keepOnRoad({ x: -edge - 1e-10, y: BLOCK * 4 + 49 }, inset);
  assert.equal(result.hit, false);
});

test('route generation is deterministic, road-aligned, and has Manhattan length', () => {
  const from = { x: 0, y: 0 };
  const to = { x: BLOCK * 4, y: BLOCK * -3 };
  const route = routeBetween(from, to, 87);
  assert.deepEqual(route, routeBetween(from, to, 87));
  assert.deepEqual(route.at(-1), to);
  assert.equal(routeLength(from, route), BLOCK * 7);
  let previous = from;
  for (const point of route) {
    assert.ok(point.x === previous.x || point.y === previous.y, 'each segment stays on a street');
    previous = point;
  }
});

test('traffic is deterministic and each vehicle has a usable rendered position', () => {
  const first = makeTraffic(123, 5);
  const second = makeTraffic(123, 5);
  assert.deepEqual(first, second);
  for (const vehicle of first) {
    const point = trafficPosition(vehicle);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(['x', 'y'].includes(vehicle.axis));
  }
});

test('signals alternate directions over time', () => {
  assert.notEqual(signalState(2, -3, 0), signalState(2, -3, 4.8));
});
