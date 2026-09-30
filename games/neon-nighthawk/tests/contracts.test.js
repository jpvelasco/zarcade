import test from 'node:test';
import assert from 'node:assert/strict';
import { isRoad, routeLength } from '../src/city.js';
import { DISTRICTS, districtFor, makeContract } from '../src/contracts.js';

test('a Shift Code regenerates the same contract', () => {
  const first = makeContract(81234, 2, { x: 0, y: 0 });
  const second = makeContract(81234, 2, { x: 0, y: 0 });
  assert.deepEqual(first, second);
});

test('contracts have street targets, a route, and a viable time window', () => {
  const contract = makeContract(92, 3, { x: 560, y: -280 });
  assert.equal(isRoad(contract.pickup.x, contract.pickup.y), true);
  assert.equal(isRoad(contract.delivery.x, contract.delivery.y), true);
  assert.equal(contract.toPickup.at(-1).x, contract.pickup.x);
  assert.equal(contract.toDelivery.at(-1).y, contract.delivery.y);
  assert.ok(contract.timeLimit >= 50);
  assert.ok(contract.reward > 100);
  assert.equal(routeLength({ x: 560, y: -280 }, contract.toPickup) + routeLength(contract.pickup, contract.toDelivery), contract.distance);
});

test('later routes grow in difficulty without sprawling into marathon trips', () => {
  for (let index = 0; index < 5; index++) {
    for (const seed of [1, 34, 92, 711, 81234]) {
      const contract = makeContract(seed, index);
      assert.ok(contract.distance <= (9 + Math.min(index, 2) * 2) * 280, `${seed}/${index}: ${contract.distance}`);
      assert.ok(contract.timeLimit <= 100, `${seed}/${index}: ${contract.timeLimit}`);
    }
  }
});

test('a shift reaches every district and closes with the Dawn Relay', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => districtFor(index)), DISTRICTS);
  const final = makeContract(13, 4);
  assert.equal(final.type.label, 'DAWN RELAY');
  assert.equal(final.type.client, 'All channels');
});
