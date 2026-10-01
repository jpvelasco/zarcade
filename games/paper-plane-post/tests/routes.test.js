import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DROP_RADIUS, MAX_STARS, REGIONS, ROUTES, TOTAL_LETTERS, TOTAL_RINGS, routeById, routesInRegion,
} from '../src/routes.js';
import { highestPoint, makeTerrain } from '../src/terrain.js';
import { GREEN_AFTER, PAD_BEFORE } from '../src/world.js';

const prepared = ROUTES.map((route) => route.prepare());

test('the round is five regions of nine handcrafted routes', () => {
  assert.equal(ROUTES.length, 45);
  assert.equal(MAX_STARS, 135);
  assert.equal(REGIONS.length, 5);
  for (let i = 0; i < REGIONS.length; i += 1) {
    assert.equal(routesInRegion(i).length, 9, `region ${i}`);
  }
  assert.ok(TOTAL_LETTERS >= 100, `only ${TOTAL_LETTERS} letters`);
  assert.ok(TOTAL_RINGS >= 250, `only ${TOTAL_RINGS} rings`);
  // Region gates stay ahead of each other but never out of reach.
  let previous = -1;
  for (const region of REGIONS) {
    assert.ok(region.needStars > previous, `${region.id} gate`);
    assert.ok(region.needStars <= 27 * REGIONS.indexOf(region), `${region.id} gate is too high`);
    previous = region.needStars;
  }
});

test('route ids, names and hints are unique and present', () => {
  const ids = new Set();
  for (const route of ROUTES) {
    assert.ok(!ids.has(route.id), `duplicate ${route.id}`);
    ids.add(route.id);
    assert.equal(routeById(route.id), route);
    assert.ok(route.name.length > 2, route.id);
    assert.ok(route.hint.length > 10, `${route.id} needs a hint`);
    assert.ok(route.length > 600, `${route.id} is only ${route.length} m`);
  }
});

test('terrain control points march forward, and the landing green is flat', () => {
  for (const route of prepared) {
    const nodes = route.terrain.nodes;
    for (let i = 1; i < nodes.length; i += 1) {
      assert.ok(nodes[i].x > nodes[i - 1].x, `${route.id} terrain goes backwards at ${nodes[i].x}`);
    }
    const box = route.mailbox;
    for (let x = box.x - PAD_BEFORE; x <= box.x + GREEN_AFTER; x += 7) {
      assert.ok(Math.abs(route.terrain.heightAt(x) - box.y) < 0.4, `${route.id} green is not level at ${x}`);
      assert.notEqual(route.terrain.kindAt(x), 'water', `${route.id} green is in the water at ${x}`);
    }
  }
});

test('the lazy glide line reaches every mailbox with height in hand', () => {
  for (const route of prepared) {
    const arrive = route.terrain.heightAt(route.mailbox.x) - route.line.at(route.mailbox.x);
    assert.ok(route.line.flown >= route.mailbox.x,
      `${route.id} lazy line only reached ${Math.round(route.line.flown)} of ${route.mailbox.x}`);
    assert.ok(arrive > 8, `${route.id} arrives only ${arrive.toFixed(1)} m up`);
    assert.ok(arrive < 60, `${route.id} arrives a silly ${arrive.toFixed(1)} m up`);
  }
});

test('the lazy line keeps clear of the ground the whole way', () => {
  for (const route of prepared) {
    let worst = Infinity;
    for (let x = route.start.x; x <= route.mailbox.x; x += 4) {
      worst = Math.min(worst, route.terrain.heightAt(x) - route.line.at(x));
    }
    assert.ok(worst > 8, `${route.id} skims the ground by ${worst.toFixed(1)} m`);
  }
});

test('rings and letters sit in flyable air', () => {
  for (const route of prepared) {
    assert.equal(route.rings.length, route.ringCount);
    assert.equal(route.drops.length, route.letterCount);
    for (const ring of route.rings) {
      const ground = route.terrain.heightAt(ring.x);
      assert.ok(ring.y < ground - ring.r, `${route.id} ring at ${ring.x} is in the ground`);
      assert.ok(ring.y > route.ceiling, `${route.id} ring at ${ring.x} is above the ceiling`);
      assert.ok(ring.x > route.start.x && ring.x < route.mailbox.x + GREEN_AFTER, `${route.id} stray ring`);
    }
    for (const drop of route.drops) {
      const ground = route.terrain.heightAt(drop.x);
      // A window is an upper floor of a believable building, and the plane only
      // ever has to dip a little way off the line to reach one.
      assert.ok(drop.y <= ground - 7.9, `${route.id} window at ${drop.x} is on the floor`);
      assert.ok(drop.y >= ground - 34.1, `${route.id} window at ${drop.x} is on a skyscraper`);
      const off = Math.abs(drop.y - route.line.at(drop.x));
      assert.ok(off < 24, `${route.id} window at ${drop.x} is ${off.toFixed(0)} m off the line`);
      assert.ok(drop.x < route.mailbox.x, `${route.id} window past the mailbox`);
    }
    const ids = new Set([...route.rings, ...route.drops].map((item) => item.id));
    assert.equal(ids.size, route.rings.length + route.drops.length, `${route.id} duplicate ids`);
  }
});

test('every hazard leaves a fair gap and stands on something', () => {
  for (const route of prepared) {
    for (const hazard of route.hazards) {
      const ground = route.terrain.heightAt(hazard.x);
      const size = hazard.kind === 'line' ? 1.4 : hazard.r;
      const gap = Math.abs(route.line.at(hazard.x) - hazard.y) - size - 0.9;
      assert.ok(gap >= 8, `${route.id} ${hazard.kind} at ${hazard.x} leaves only ${gap.toFixed(1)} m`);
      assert.ok(hazard.y < ground - size, `${route.id} ${hazard.kind} at ${hazard.x} is buried`);
      assert.ok(hazard.x < route.mailbox.x - PAD_BEFORE, `${route.id} hazard over the green`);
    }
  }
});

test('air sources are anchored to their ground and point the right way', () => {
  for (const route of prepared) {
    assert.ok(route.air.length > 0, `${route.id} has no air`);
    for (const source of route.air) {
      assert.ok(source.w > 0 && source.h > 0, `${route.id} empty ${source.t}`);
      if (source.t === 'up' || source.t === 'ridge') {
        assert.ok(Math.abs(source.y - route.terrain.heightAt(source.x)) < 3,
          `${route.id} ${source.t} at ${source.x} floats off the ground`);
        assert.ok(source.s > 0);
      }
      if (source.t === 'rain') assert.ok(source.rain > 0 && source.rain <= 1);
    }
  }
});

test('preparing a route twice gives the same valley', () => {
  const route = ROUTES[20];
  const first = route.rings.map((ring) => `${ring.x}:${ring.y.toFixed(4)}`).join();
  route.prepare();
  const second = route.rings.map((ring) => `${ring.x}:${ring.y.toFixed(4)}`).join();
  assert.equal(first, second);
});

test('terrain smoothing, surfaces and trimming behave', () => {
  const terrain = makeTerrain([[0, 0], [100, -20], [200, -20, 'water'], [300, -20]]);
  assert.equal(terrain.heightAt(-50), 0, 'clamped before the start');
  assert.equal(terrain.heightAt(400), -20, 'clamped past the end');
  assert.ok(terrain.heightAt(50) < 0 && terrain.heightAt(50) > -20);
  assert.equal(terrain.kindAt(10), 'grass');
  assert.equal(terrain.kindAt(250), 'water');
  assert.ok(terrain.slopeAt(50) < 0, 'climbing to the left means a negative slope');
  assert.equal(highestPoint(terrain), -20);
  terrain.extend([[400, -30]]);
  assert.equal(terrain.heightAt(400), -30);
  terrain.trim(250);
  assert.ok(terrain.x0 >= 100);
  assert.equal(terrain.heightAt(400), -30, 'trimming keeps the rest of the line');
});

test('drop radius and ring radius are the sizes the tests assume', () => {
  assert.equal(DROP_RADIUS, 7);
  for (const route of prepared) {
    for (const ring of route.rings) assert.ok(ring.r >= 8 && ring.r <= 12);
  }
});
