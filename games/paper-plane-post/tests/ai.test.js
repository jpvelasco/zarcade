// The autopilot doubles as the balance check: if it can fly a route with the
// same model and the same one button a player gets, the route is flyable.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, flyWithPilot, nextTarget } from '../src/ai.js';
import { ROUTES, routeById } from '../src/routes.js';
import { World } from '../src/world.js';
import { makeEndless } from '../src/endless.js';
import { tuningFor } from '../src/flight.js';
import { FOLDS, PAPERS } from '../src/catalog.js';

test('the autopilot delivers the post on every one of the 45 routes', () => {
  // One pass over the whole round, checked from several angles: this is the
  // balance check, so it is worth being strict about all of it at once.
  const failures = [];
  const stuck = [];
  let soft = 0;
  let letters = 0;
  let letterTotal = 0;
  let rings = 0;
  let ringTotal = 0;
  for (const route of ROUTES) {
    const result = flyWithPilot(new World(route.prepare()));
    if (result.outcome !== 'landed') failures.push(`${route.id}: ${result.outcome} at ${result.distance} m`);
    if (result.outcome === 'stuck') stuck.push(route.id);
    if (result.soft) soft += 1;
    letters += result.letters;
    letterTotal += result.letterTotal;
    rings += result.rings;
    ringTotal += result.ringTotal;
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(stuck, [], 'it should keep clear of the hazards it is told about');
  assert.ok(soft >= 15, `only ${soft} of ${ROUTES.length} landings were feather landings`);
  assert.ok(letters / letterTotal > 0.35, `letters ${letters}/${letterTotal}`);
  assert.ok(rings / ringTotal > 0.4, `rings ${rings}/${ringTotal}`);
});

test('the first routes are gentle: stars without trying hard', () => {
  for (const id of ['town-1', 'town-2']) {
    const result = flyWithPilot(new World(routeById(id).prepare()));
    assert.equal(result.outcome, 'landed', id);
    assert.ok(result.stars >= 2, `${id} only earned ${result.stars} stars`);
  }
});

test('every fold can still deliver the first round of every region', () => {
  const firsts = ROUTES.filter((route) => route.id.endsWith('-1'));
  for (const fold of FOLDS) {
    for (const route of firsts) {
      const world = new World(route.prepare(), { tuning: tuningFor(fold, PAPERS[0]) });
      const result = flyWithPilot(world);
      assert.equal(result.outcome, 'landed', `${fold.id} on ${route.id} ended as ${result.outcome}`);
    }
  }
});

test('the autopilot flies a long way on the endless breeze', () => {
  const distances = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const world = new World(makeEndless({ seed, theme: 'soft' }));
    distances.push(flyWithPilot(world, { maxSeconds: 420 }).distance);
  }
  const best = Math.max(...distances);
  const median = distances.slice().sort((a, b) => a - b)[3];
  assert.ok(best > 2000, `best was only ${best} m`);
  assert.ok(median > 900, `median was only ${median} m`);
});

test('it is deterministic, so the attract flight is reproducible', () => {
  const route = routeById('forest-3').prepare();
  const a = flyWithPilot(new World(route));
  const b = flyWithPilot(new World(route));
  assert.deepEqual(a, b);
});

test('the next target is always ahead, and the mailbox is the last of them', () => {
  const route = routeById('town-4').prepare();
  const world = new World(route);
  const pilot = createPilot(world);
  let seen = 0;
  while (world.status === 'flying') {
    const target = nextTarget(world);
    // Everything is ahead, except the mailbox once the plane is over the green:
    // there the target is the landing itself.
    assert.ok(target.x >= world.plane.x || target.kind === 'mailbox', 'targets are never behind');
    if (target.kind === 'mailbox') seen += 1;
    world.step(1 / 60, pilot.control(1 / 60));
    world.events.length = 0;
  }
  assert.ok(seen > 0, 'it should aim at the mailbox eventually');
});

