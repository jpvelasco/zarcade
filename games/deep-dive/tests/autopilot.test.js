import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, density } from '../src/map.js';
import { World } from '../src/world.js';
import { Autopilot } from '../src/autopilot.js';
import { UPGRADE_ORDER } from '../src/areas.js';

const DT = 1 / 60;

function drive(world, pilot, maxSeconds, stop) {
  const log = [];
  for (let i = 0; i < maxSeconds * 60; i++) {
    world.step(DT, pilot.controls(world, DT));
    for (const e of world.events) log.push({ t: world.t, ...e });
    world.events.length = 0;
    if (world.status === 'out') world.returnToDock();
    if (stop(world)) break;
  }
  return log;
}

test('the autopilot finds every part in order and the Heart of the Sea, using real physics', () => {
  const map = buildMap();
  const world = new World(map);
  const pilot = new Autopilot({ mode: 'parts' });
  let inRock = 0;
  const log = [];
  for (let i = 0; i < 600 * 60 && !world.heart; i++) {
    world.step(DT, pilot.controls(world, DT));
    if (density(map, world.sub.x, world.sub.y) > 0.5) inRock++;
    for (const e of world.events) log.push(e);
    world.events.length = 0;
    if (world.status === 'out') world.returnToDock();
  }
  const parts = log.filter((e) => e.type === 'part').map((e) => e.id);
  assert.deepEqual(parts, UPGRADE_ORDER, 'parts collected in the intended order');
  assert.ok(world.heart, `heart found by ${world.t.toFixed(0)} s`);
  assert.equal(inRock, 0, 'never inside rock');
  assert.ok(world.opened.has('hatch-wreck') && world.opened.has('coral-shaft'), 'opened the gates on the way');
});

test('the explorer autopilot scans creatures and collects treasure in the opening areas', () => {
  const map = buildMap();
  const world = new World(map);
  const pilot = new Autopilot({ mode: 'explore' });
  drive(world, pilot, 240, (w) => w.ups.has('drill'));
  assert.ok(world.scanned.size >= 10, `scanned ${world.scanned.size}`);
  assert.ok(world.treasures.size >= 4, `treasure ${world.treasures.size}`);
  assert.ok(world.completion > 0.15, `explored ${(world.completion * 100).toFixed(0)}%`);
});
