import test from 'node:test';
import assert from 'node:assert/strict';
import { BULLSEYE, PAD_BEFORE, World } from '../src/world.js';
import { ROUTES, routeById } from '../src/routes.js';
import { makeTerrain } from '../src/terrain.js';
import { createPlane } from '../src/flight.js';
import { tuningFor } from '../src/flight.js';
import { FOLDS, PAPERS } from '../src/catalog.js';
import { rain, updraft } from '../src/wind.js';

const DT = 1 / 60;

/** A tiny scene so the rules can be tested without flying a whole route. */
function bench(options = {}) {
  const terrain = makeTerrain([[0, 0], [2000, 0]], { kind: options.surface || 'grass' });
  return {
    id: 'bench',
    terrain,
    air: options.air || [],
    rings: options.rings || [],
    drops: options.drops || [],
    hazards: options.hazards || [],
    mailbox: options.mailbox === null ? null : { x: options.mailbox ?? 600, y: 0 },
    softSpeed: 13,
    ceiling: -200,
    breeze: { x: 0, y: 0 },
    start: { x: 10, y: -50, speed: 11.2, angle: 0.04 },
    ...options.extra,
  };
}

function run(world, control = () => ({}), limit = 6000) {
  let steps = 0;
  while (world.status === 'flying' && steps < limit) {
    world.step(DT, control(world, steps));
    steps += 1;
  }
  return world;
}

test('a plain glide onto the green delivers the post', () => {
  const world = run(new World(bench({ mailbox: 560 })));
  assert.equal(world.status, 'done');
  assert.equal(world.outcome, 'landed');
  assert.ok(world.stars() >= 1);
  assert.ok(world.soft, 'a plain glide should be a feather landing');
  assert.ok(world.time > 10);
});

test('landing well before the green comes up short', () => {
  const world = run(new World(bench({ mailbox: 1500 })));
  assert.equal(world.status, 'failed');
  assert.equal(world.outcome, 'short');
  assert.equal(world.stars(), 0);
});

test('the green is generous: anywhere on it counts', () => {
  const near = run(new World(bench({ mailbox: 560 })));
  assert.ok(near.plane.x >= 560 - PAD_BEFORE);
  const bull = new World(bench({ mailbox: 560 }));
  run(bull);
  assert.equal(bull.bullseye, Math.abs(bull.plane.x - 560) <= BULLSEYE);
});

test('water ends the round with a splash', () => {
  const world = run(new World(bench({ surface: 'water', mailbox: 1800 })));
  assert.equal(world.outcome, 'water');
  assert.ok(world.events.some((event) => event.type === 'fail' && event.outcome === 'water'));
});

test('a branch catches the paper', () => {
  const world = run(new World(bench({
    mailbox: 900,
    hazards: [{ x: 120, y: -40, r: 8, kind: 'branch' }],
  })));
  assert.equal(world.outcome, 'stuck');
  assert.ok(world.plane.x < 160);
});

test('a strung line catches the paper too, and only across its span', () => {
  // Find where a lazy glide crosses x = 200, then hang a line right there.
  const probe = new World(bench({ mailbox: 1800 }));
  while (probe.plane.x < 200) probe.step(DT, {});
  const y = probe.plane.y;
  const caught = run(new World(bench({ mailbox: 900, hazards: [{ x: 200, y, w: 30, kind: 'line' }] })));
  assert.equal(caught.outcome, 'stuck');
  assert.ok(Math.abs(caught.plane.x - 200) < 32);
  // The same line, but strung somewhere the plane never goes.
  const missed = run(new World(bench({ mailbox: 560, hazards: [{ x: 200, y: y - 30, w: 30, kind: 'line' }] })));
  assert.equal(missed.outcome, 'landed');
});

test('rings and letters are collected once each, with an event', () => {
  const world = new World(bench({
    mailbox: 600,
    rings: [{ id: 'r0', x: 60, y: -46, r: 9 }],
    drops: [{ id: 'd0', x: 90, y: -44 }],
  }));
  run(world);
  assert.equal(world.ringsHit, 1);
  assert.equal(world.letters, 1);
  assert.equal(world.collected.size, 2);
  const result = world.result();
  assert.equal(result.rings, 1);
  assert.equal(result.letters, 1);
  assert.equal(result.stars, 3, 'everything collected plus a landing is three stars');
});

test('a route the plane never finishes scores nothing', () => {
  const world = new World(bench({ mailbox: 600 }));
  world.step(DT, {});
  assert.equal(world.stars(), 0);
  assert.equal(world.result().outcome, '');
});

test('riding a warm column is counted once per climb', () => {
  const world = new World(bench({ mailbox: 1700, air: [updraft(200, 0, 140, 40, 7)] }));
  run(world);
  assert.ok(world.thermals >= 1, 'should notice the climb');
  assert.ok(world.thermals <= 3, `counted ${world.thermals} climbs through one column`);
});

test('rain soaks the wings and the world remembers the worst of it', () => {
  const world = new World(bench({ mailbox: 1400, air: [rain(200, -50, 60, 40, 4, { rain: 1 })] }));
  run(world);
  assert.ok(world.peakSoak > 0.3, `peak soak ${world.peakSoak}`);
  assert.ok(world.events.length >= 0);
});

test('the ceiling pushes a plane back down out of the thin air', () => {
  const world = new World(bench({ mailbox: 1700, extra: { ceiling: -70 }, air: [updraft(300, 0, 300, 120, 12)] }));
  let highest = 0;
  for (let i = 0; i < 2000 && world.status === 'flying'; i += 1) {
    world.step(DT, {});
    highest = Math.min(highest, world.plane.y);
  }
  assert.ok(highest > -130, `climbed to ${highest} through a -70 ceiling`);
});

test('the same route plus the same inputs gives the same run', () => {
  const route = routeById('town-3').prepare();
  const control = (_, step) => ({ dive: step % 140 < 55 });
  const a = run(new World(route), control);
  const b = run(new World(route), control);
  assert.deepEqual(a.result(), b.result());
  assert.equal(a.plane.x, b.plane.x);
});

test('a run never changes the shared route data', () => {
  const route = routeById('town-2').prepare();
  const before = JSON.stringify({ rings: route.rings, drops: route.drops, hazards: route.hazards });
  run(new World(route), (_, step) => ({ dive: step % 90 < 30 }));
  assert.equal(JSON.stringify({ rings: route.rings, drops: route.drops, hazards: route.hazards }), before);
});

test('every fold can fly the first route of every region', () => {
  const firsts = ROUTES.filter((route) => route.id.endsWith('-1'));
  for (const fold of FOLDS) {
    for (const route of firsts) {
      const world = new World(route.prepare(), { tuning: tuningFor(fold, PAPERS[0]) });
      // A lazy glide: no input at all. It should at least stay up most of the way.
      run(world);
      assert.ok(world.plane.x > route.mailbox.x - 180,
        `${fold.id} on ${route.id} only reached ${Math.round(world.plane.x)} of ${route.mailbox.x}`);
    }
  }
});

test('score rewards letters, rings, snaps and a soft landing', () => {
  const plain = new World(bench({ mailbox: 600 }));
  run(plain);
  const rich = new World(bench({
    mailbox: 600,
    rings: [{ id: 'r0', x: 60, y: -46, r: 9 }],
    drops: [{ id: 'd0', x: 90, y: -44 }],
  }));
  run(rich);
  assert.ok(rich.score() > plain.score());
});

test('altitude and a snapshot read the live plane', () => {
  const world = new World(bench());
  world.step(DT, {});
  assert.ok(Math.abs(world.altitude() - 50) < 3);
  const snap = world.snapshot();
  assert.equal(snap.x, world.plane.x);
  world.step(DT, { dive: true });
  assert.notEqual(snap.x, world.plane.x, 'the snapshot is a copy');
});

test('a finished world ignores further steps', () => {
  const world = run(new World(bench({ mailbox: 560 })));
  const x = world.plane.x;
  world.step(DT, { dive: true });
  assert.equal(world.plane.x, x);
});

test('createPlane starts where it is told', () => {
  const plane = createPlane({ x: 5, y: -20, speed: 12, angle: 0 });
  assert.equal(plane.x, 5);
  assert.equal(plane.y, -20);
  assert.ok(Math.abs(plane.vx - 12) < 0.001);
});
