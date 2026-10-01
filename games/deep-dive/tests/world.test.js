import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, CELL, SURFACE_Y, density, depthMeters, gateRect } from '../src/map.js';
import { World, SCAN_TIME, OXYGEN_BASE, oxygenMax } from '../src/world.js';
import { SPECIES_INDEX } from '../src/creatures.js';

const map = buildMap();
const DT = 1 / 60;
const run = (w, secs, controls = {}) => { const evs = []; for (let i = 0; i < secs * 60; i++) { w.step(DT, typeof controls === 'function' ? controls(w) : controls); evs.push(...w.events); w.events.length = 0; } return evs; };
const at = (w, cx, cy) => { w.sub.x = cx * CELL + CELL / 2; w.sub.y = cy * CELL + CELL / 2; w.sub.vx = 0; w.sub.vy = 0; };
// Keep creatures from wandering into the test: freeze them far away.
const quiet = (w) => { for (const c of w.creatures) { c.x = c.homeX = -9999; c.y = c.homeY = -9999; } for (const g of w.groups.values()) { g.x = g.homeX = -9999; } };

test('a new world starts at the home dock with a full tank', () => {
  const w = new World(map);
  assert.equal(w.lastDock, 'home');
  assert.equal(w.oxygen, OXYGEN_BASE);
  assert.ok(w.sub.y > SURFACE_Y);
  assert.equal(w.area.id, 'shallows');
});

test('Bubbles swims and never ends up inside rock', () => {
  const w = new World(map);
  quiet(w);
  at(w, 20, 10);
  run(w, 1, { ax: 1 });
  assert.ok(w.sub.x > 20 * CELL + 100, 'moved right');
  // Ram the shallows floor for a while.
  run(w, 4, { ax: 0.3, ay: 1 });
  assert.ok(density(map, w.sub.x, w.sub.y) < 0.5, 'centre stays in water');
  assert.ok(w.sub.y < 23 * CELL, 'stopped by the floor');
});

test('bumping costs a little oxygen and reports it', () => {
  const w = new World(map);
  quiet(w);
  at(w, 12, 17);
  const before = w.oxygen;
  const evs = run(w, 2, { ay: 1 });
  const bumps = evs.filter((e) => e.type === 'bump');
  assert.ok(bumps.length >= 1, 'bumped');
  assert.ok(before - w.oxygen > 1 && before - w.oxygen < 20, `cost ${before - w.oxygen}`);
});

test('the surface refills air; running out floats back to the last dock with nothing lost', () => {
  const w = new World(map, { scanned: ['clownfish'] });
  quiet(w);
  at(w, 30, 3);
  w.oxygen = 10;
  run(w, 1);
  assert.ok(w.oxygen > 30, 'breathing at the surface');
  at(w, 30, 15);
  w.oxygen = 0.2;
  const evs = run(w, 1);
  assert.ok(evs.some((e) => e.type === 'oxygen.out'));
  assert.equal(w.status, 'out');
  w.returnToDock();
  assert.equal(w.status, 'play');
  assert.equal(w.oxygen, w.oxygenMax);
  assert.ok(w.scanned.has('clownfish'));
  assert.ok(Math.abs(w.sub.x - (map.docks[0].x * CELL + CELL / 2)) < 1);
});

test('docking refills, saves the dock and reports the dive', () => {
  const w = new World(map);
  quiet(w);
  const kelp = map.docks.find((d) => d.id === 'kelp');
  at(w, kelp.x - 6, kelp.y + 1);
  w.oxygen = 50;
  const evs = run(w, 3, (ww) => ({ target: { x: kelp.x * CELL + 16, y: kelp.y * CELL + 16 } }));
  const dock = evs.find((e) => e.type === 'dock');
  assert.ok(dock, 'docked');
  assert.equal(dock.dock, 'kelp');
  assert.equal(w.lastDock, 'kelp');
  assert.equal(w.oxygen, w.oxygenMax);
});

test('sonar reveals the map and spots hiding creatures', () => {
  const w = new World(map);
  const octo = w.creatures.find((c) => c.sp.id === 'octopus');
  w.sub.x = octo.x - 200; w.sub.y = octo.y;
  w.ups.add('grabber');
  const before = w.revealedWater;
  assert.equal(w.visible(octo), false);
  const evs = run(w, 1.2, (ww) => ({ sonar: ww.t < 0.05 }));
  assert.ok(evs.some((e) => e.type === 'sonar'));
  assert.ok(w.revealedWater > before + 40, 'map revealed');
  assert.ok(w.visible(octo), 'octopus revealed');
});

test('hovering near a calm creature scans it', () => {
  const w = new World(map);
  const star = w.creatures.find((c) => c.sp.id === 'sea-star');
  w.sub.x = star.x; w.sub.y = star.y - 70;
  const evs = run(w, SCAN_TIME + 0.6);
  const scan = evs.find((e) => e.type === 'scan' && e.id === 'sea-star');
  assert.ok(scan, 'scanned');
  assert.ok(scan.first);
  assert.ok(w.scanned.has('sea-star'));
});

test('a shy creature flees from a speeding sub and cannot be scanned while scared', () => {
  const w = new World(map);
  const puff = w.creatures.find((c) => c.sp.id === 'pufferfish');
  w.sub.x = puff.x - 160; w.sub.y = puff.y;
  w.sub.vx = 230;
  w.step(DT, { ax: 1 });
  assert.ok(puff.scared > 0, 'startled');
  assert.equal(w.scanCandidate() === puff, false);
});

test('daily goals can be rescanned even when already known', () => {
  const w = new World(map, { scanned: ['sea-star'] });
  const star = w.creatures.find((c) => c.sp.id === 'sea-star');
  w.sub.x = star.x; w.sub.y = star.y - 70;
  assert.equal(run(w, SCAN_TIME + 0.5).some((e) => e.type === 'scan' && e.id === 'sea-star'), false);
  w.wanted.add('sea-star');
  const scan = run(w, SCAN_TIME + 0.5).find((e) => e.type === 'scan' && e.id === 'sea-star');
  assert.ok(scan && !scan.first && scan.daily);
});

test('a hatch blocks with a hint until Bubbles has the grabber, then opens', () => {
  const gate = map.gates.find((g) => g.id === 'hatch-wreck');
  const r = gateRect(gate);
  const w = new World(map);
  quiet(w);
  w.sub.x = r.x - 60; w.sub.y = r.y + r.h / 2;
  const evs = run(w, 2, { ax: 1 });
  assert.ok(w.sub.x < r.x, 'blocked');
  assert.ok(evs.some((e) => e.type === 'hint' && e.reason === 'grabber'));
  w.ups.add('grabber');
  const evs2 = run(w, 2, { ax: 1 });
  assert.ok(evs2.some((e) => e.type === 'gate' && e.id === 'hatch-wreck'));
  assert.ok(w.opened.has('hatch-wreck'));
  assert.ok(w.sub.x > r.x + r.w, 'swam through');
});

test('dark water pushes back without headlights, and lets Bubbles in with them', () => {
  const w = new World(map, { upgrades: ['grabber', 'drill'] });
  quiet(w);
  at(w, 41, 44);
  const evs = run(w, 3, { ay: 1 });
  assert.ok(evs.some((e) => e.type === 'hint' && e.reason === 'lights'));
  assert.ok(w.sub.y < 47 * CELL, 'stayed out of the Twilight Zone');
  w.ups.add('lights');
  run(w, 3, { ay: 1 });
  assert.ok(w.sub.y > 50 * CELL, 'dived into the Twilight Zone');
});

test('the vent current pushes back without the turbo fin, and turbo pushes through', () => {
  const ups = ['grabber', 'drill', 'lights', 'hull'];
  const w = new World(map, { upgrades: ups });
  quiet(w);
  at(w, 104, 93);
  run(w, 4, { ax: 1 });
  assert.ok(w.sub.x < 112 * CELL, `held back at ${(w.sub.x / CELL).toFixed(1)}`);
  w.ups.add('turbo');
  run(w, 4, { ax: 1 });
  assert.ok(w.sub.x > 115 * CELL, `pushed through to ${(w.sub.x / CELL).toFixed(1)}`);
});

test('golden shells add an extra tank every four', () => {
  assert.equal(oxygenMax(0), OXYGEN_BASE);
  assert.equal(oxygenMax(3), OXYGEN_BASE);
  assert.equal(oxygenMax(4), OXYGEN_BASE + 25);
  assert.equal(oxygenMax(12), OXYGEN_BASE + 75);
});

test('picking up a treasure, a shell and a part', () => {
  const w = new World(map);
  quiet(w);
  const t = map.treasures[0];
  at(w, t.x, t.y);
  let evs = run(w, 0.1);
  assert.ok(evs.some((e) => e.type === 'treasure' && e.id === t.id));
  const s = map.shells.find((q) => q.id === 's06');
  at(w, s.x, s.y);
  evs = run(w, 0.1);
  assert.ok(evs.some((e) => e.type === 'shell'));
  const p = map.parts[0];
  at(w, p.x, p.y);
  evs = run(w, 0.1);
  assert.ok(evs.some((e) => e.type === 'part' && e.id === 'grabber'));
  assert.ok(w.ups.has('grabber'));
  const snap = w.snapshot();
  assert.deepEqual(snap.upgrades, ['grabber']);
  assert.ok(snap.treasures.includes(t.id));
});

test('depth reads like the real ocean', () => {
  assert.equal(depthMeters(SURFACE_Y), 0);
  assert.ok(depthMeters(20 * CELL) < 30);
  assert.ok(depthMeters(60 * CELL) > 200);
  assert.ok(depthMeters(104 * CELL) > 5000);
  assert.ok(SPECIES_INDEX.anglerfish >= 0);
});
