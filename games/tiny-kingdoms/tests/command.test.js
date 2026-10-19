import test from 'node:test';
import assert from 'node:assert/strict';
import { Commander } from '../src/command.js';
import { World } from '../src/sim.js';
import { makeView, hitNode, nearestInDirection, mapBounds } from '../src/view.js';

const N = (x, y, type, owner, troops) => ({ x, y, type, owner, troops });
const world = () => new World({ seed: 1, nodes: [
  N(200, 500, 'castle', 1, 30), N(400, 300, 'cottage', 1, 10), N(400, 700, 'cottage', 1, 10),
  N(800, 500, 'cottage', 0, 5), N(1400, 500, 'castle', 2, 20),
] });

test('drag from a building to a target sends', () => {
  const c = new Commander(world());
  c.down(0);
  c.move(null);
  c.move(3);
  assert.deepEqual(c.up(3), { from: [0], to: 3 });
  assert.equal(c.selected.size, 0);
});

test('dragging through several buildings collects them', () => {
  const c = new Commander(world());
  c.down(0);
  c.move(1);
  c.move(null);
  c.move(2);
  c.move(4);
  assert.deepEqual(c.up(4), { from: [0, 1, 2], to: 4 });
});

test('drag to your own building reinforces it', () => {
  const c = new Commander(world());
  c.down(0);
  c.move(1);
  assert.deepEqual(c.up(1), { from: [0], to: 1 });
});

test('tap to select, tap a target to send, tap ground to clear', () => {
  const c = new Commander(world());
  c.down(0); assert.equal(c.up(0), null);
  assert.deepEqual([...c.selected], [0]);
  c.down(3); assert.deepEqual(c.up(3), { from: [0], to: 3 });
  c.down(1); c.up(1);
  c.down(null); c.up(null);
  assert.equal(c.selected.size, 0);
  // Tapping a selected building deselects it.
  c.tap(1); c.tap(1);
  assert.equal(c.selected.size, 0);
  // With a selection, tapping another of your buildings reinforces it.
  c.down(0); c.up(0);
  c.down(2);
  assert.deepEqual(c.up(2), { from: [0], to: 2 });
});

test('letting go over water keeps the selection for a tap', () => {
  const c = new Commander(world());
  c.down(0); c.move(1); c.move(null);
  assert.equal(c.up(null), null);
  assert.deepEqual([...c.selected].sort(), [0, 1]);
  assert.deepEqual(c.tap(4), { from: [0, 1], to: 4 });
});

test('keyboard letters toggle your buildings and pick targets', () => {
  const c = new Commander(world());
  assert.equal(c.letter(4), null); // nothing selected yet
  c.letter(0); c.letter(1);
  assert.deepEqual([...c.selected], [0, 1]);
  c.letter(1);
  assert.deepEqual([...c.selected], [0]);
  assert.deepEqual(c.letter(2, true), { from: [0], to: 2 }); // Shift: reinforce
  c.letter(1); c.letter(2);
  assert.deepEqual(c.letter(3), { from: [1, 2], to: 3 });
  c.number(1, [0, 1, 2, 3, 4]);
  assert.deepEqual([...c.selected], [0]);
  c.selectAll();
  assert.equal(c.selected.size, 3);
});

test('selection drops buildings you lose', () => {
  const w = world();
  const c = new Commander(w);
  c.selectAll();
  w.nodes[1].owner = 2;
  c.prune();
  assert.deepEqual([...c.selected].sort(), [0, 2]);
});

test('the view maps world and screen both ways, turning tall screens', () => {
  for (const [w, h] of [[1366, 860], [390, 844]]) {
    const v = makeView(w, h, { top: 50, bottom: 60 });
    assert.equal(v.rotate, h > w);
    for (const p of [{ x: 0, y: 0 }, { x: 1600, y: 1000 }, { x: 321, y: 777 }]) {
      const s = v.toScreen(p.x, p.y);
      assert.ok(s.x >= 0 && s.x <= w && s.y >= 50 - 1 && s.y <= h - 60 + 1, `${w}x${h} ${JSON.stringify(s)}`);
      const back = v.toWorld(s.x, s.y);
      assert.ok(Math.abs(back.x - p.x) < 1e-6 && Math.abs(back.y - p.y) < 1e-6);
    }
  }
  // Fitting to a map's buildings zooms in but keeps the round trip exact.
  const b = mapBounds([{ x: 300, y: 400 }, { x: 900, y: 600 }]);
  assert.ok(b.x1 - b.x0 >= 760 && b.y1 - b.y0 >= 480);
  const z = makeView(1366, 860, {}, b);
  assert.ok(z.s > makeView(1366, 860).s);
  const q = z.toWorld(...Object.values(z.toScreen(500, 500)));
  assert.ok(Math.abs(q.x - 500) < 1e-6 && Math.abs(q.y - 500) < 1e-6);
  // On a phone your side (world left) is at the bottom.
  const v = makeView(390, 844);
  assert.ok(v.toScreen(100, 500).y > v.toScreen(1500, 500).y);
});

test('hit testing and direction picking', () => {
  const w = world();
  assert.equal(hitNode(w.nodes, 210, 510), 0);
  assert.equal(hitNode(w.nodes, 1000, 900), null);
  assert.equal(nearestInDirection(w.nodes, w.nodes[1], 1, 0), 3);
  assert.equal(nearestInDirection(w.nodes, w.nodes[0], 0, -1), 1);
});
