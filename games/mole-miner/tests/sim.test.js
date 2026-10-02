import test from 'node:test';
import assert from 'node:assert/strict';
import { Mine, digTime } from '../src/sim.js';
import { T, PHYS } from '../src/data.js';
import { makeWorld, run, STATS } from './helpers.js';

const open = () => makeWorld([
  'BPP####B',
  'B##o###B',
  'B######B',
  'BBBBBBBB',
], { startX: 4 });

function podAt(mine, x, y) {
  mine.pod.x = x + 0.5;
  mine.pod.y = y + 1 - 0.4 - 1e-4;
  mine.pod.vx = mine.pod.vy = 0;
  mine.pod.grounded = true;
  mine.pod.docked = false;
}

test('the pod rests on the ground and drives', () => {
  const m = new Mine(open(), STATS);
  podAt(m, 4, -1);
  run(m, 0.5);
  assert.ok(m.pod.grounded);
  const x0 = m.pod.x;
  run(m, 0.3, { ax: 1, ay: 0 });
  assert.ok(m.pod.x > x0 + 0.5);
});

test('drilling down digs the tile below and moves the pod into it', () => {
  const w = open();
  const m = new Mine(w, STATS);
  w.tiles[3] = T.EMPTY; // stand in a dug cell on row 0
  podAt(m, 3, 0);
  const ev = run(m, digTime(1, 1) + 0.2, { ax: 0, ay: 1 });
  assert.equal(m.tile(3, 1), T.EMPTY);
  assert.equal(Math.floor(m.pod.y), 1);
  const gem = ev.find((e) => e.type === 'gem');
  assert.ok(gem, 'the copper went into the cargo hold');
  assert.deepEqual(m.pod.cargo, [0]);
});

test('drilling sideways needs the ground and digs the wall', () => {
  const w = open();
  w.tiles[1 * w.w + 4] = T.EMPTY;
  const m = new Mine(w, STATS);
  podAt(m, 4, 1);
  run(m, 0.9, { ax: -1, ay: 0 });
  assert.equal(m.tile(3, 1), T.EMPTY, 'dug left');
  assert.equal(Math.floor(m.pod.x), 3);
});

test('a tile too hard for the drill is refused with a hint', () => {
  const w = open();
  w.layerOf.fill(2); // stone: hardness 3
  const m = new Mine(w, STATS);
  podAt(m, 4, -1);
  const ev = run(m, 0.5, { ax: 0, ay: 1 });
  assert.ok(ev.some((e) => e.type === 'blocked' && e.reason === 'hard'));
  assert.equal(m.tile(4, 0), T.SOIL);
  assert.equal(m.digInfo(0, 3).reason, 'bedrock');
});

test('the propeller flies the pod up and burns fuel', () => {
  const m = new Mine(open(), STATS);
  podAt(m, 4, -1);
  const f0 = m.pod.fuel, y0 = m.pod.y;
  run(m, 0.6, { ax: 0, ay: -1 });
  assert.ok(m.pod.y < y0 - 1);
  assert.ok(m.pod.fuel < f0 - 0.5);
});

test('gas pockets bump the pod upward and nick the hull', () => {
  const w = makeWorld(['B....B', 'BPP..B', 'B..#.B', 'B..g.B', 'B..#.B', 'BBBBBB']);
  const m = new Mine(w, STATS);
  podAt(m, 3, 1);
  w.tiles[1 * w.w + 3] = T.EMPTY;
  w.tiles[2 * w.w + 3] = T.EMPTY;
  podAt(m, 3, 2);
  const ev = run(m, 0.75, { ax: 0, ay: 1 });
  const gas = ev.find((e) => e.type === 'gas');
  assert.ok(gas);
  assert.ok(m.pod.hull < STATS.hull);
});

test('boulders wobble before they fall, then bonk the pod', () => {
  const w = makeWorld(['B....B', 'BPP.OB', 'B...#B', 'B...#B', 'B...#B', 'BBBBBB']);
  const m = new Mine(w, STATS);
  podAt(m, 4, 1);
  // Pod stands on (4,2)... place it under the boulder instead: dig (4,2).
  m.pod.x = 4.5; m.pod.y = 2.6 - 1e-4; m.pod.grounded = true;
  w.tiles[2 * w.w + 4] = T.EMPTY;
  m.wake(4, 2);
  const early = run(m, PHYS.wobble * 0.6);
  assert.ok(early.length === 0 || !early.some((e) => e.type === 'bonk'), 'no bonk during the wobble');
  assert.equal(m.boulders[0].state, 'wobble');
  const ev = run(m, 1.2);
  assert.ok(ev.some((e) => e.type === 'bonk'), 'the boulder fell on the pod');
  assert.equal(m.pod.hull, STATS.hull - PHYS.boulderDamage);
});

test('a boulder with nothing below falls and settles as a tile', () => {
  const w = makeWorld(['B....B', 'BPP.OB', 'B....B', 'B....B', 'B...#B', 'BBBBBB']);
  w.tiles[2 * w.w + 4] = T.EMPTY;
  const m = new Mine(w, STATS);
  m.wake(4, 2);
  const ev = run(m, 2.5);
  assert.ok(ev.some((e) => e.type === 'thud'));
  assert.equal(m.tile(4, 3), T.BOULDER);
  assert.equal(m.tile(4, 1), T.EMPTY);
});

test('lava stings without the Frost Fan and cools with it', () => {
  const rows = ['B....B', 'BPP..B', 'B..#.B', 'B..L.B', 'B..#.B', 'BBBBBB'];
  let w = makeWorld(rows);
  w.tiles[2 * w.w + 3] = T.EMPTY;
  let m = new Mine(w, STATS);
  podAt(m, 3, 2);
  const ev = run(m, 1, { ax: 0, ay: 1 });
  assert.ok(ev.some((e) => e.type === 'hot'));
  assert.ok(ev.some((e) => e.type === 'blocked' && e.reason === 'hot'));
  assert.ok(m.pod.hull < STATS.hull);
  w = makeWorld(rows);
  w.tiles[2 * w.w + 3] = T.EMPTY;
  m = new Mine(w, { ...STATS, fan: true, power: 3 });
  podAt(m, 3, 2);
  const ev2 = run(m, 0.2);
  assert.ok(ev2.some((e) => e.type === 'cool'));
  assert.equal(m.tile(3, 3), T.COOLED);
  assert.equal(m.pod.hull, STATS.hull);
});

test('running out of fuel strands the pod once', () => {
  const m = new Mine(open(), STATS);
  podAt(m, 4, -1);
  m.pod.x = 6.5;
  m.pod.fuel = 0.05;
  const ev = run(m, 0.5, { ax: 0, ay: -1 });
  const st = ev.filter((e) => e.type === 'stranded');
  assert.equal(st.length, 1);
  assert.equal(st[0].reason, 'fuel');
});

test('a full cargo hold leaves the gem behind with a warning', () => {
  const w = open();
  w.tiles[3] = T.EMPTY;
  const m = new Mine(w, { ...STATS, cargo: 1 });
  m.pod.cargo = [0];
  podAt(m, 3, 0);
  const ev = run(m, 0.8, { ax: 0, ay: 1 });
  assert.ok(ev.some((e) => e.type === 'full'));
  assert.equal(m.pod.cargo.length, 1);
});

test('bouncy caps spring the pod back up', () => {
  const w = makeWorld(['B....B', 'B....B', 'B....B', 'B....B', 'B..^.B', 'BBBBBB'], { baseX0: 1, baseX1: 1 });
  const m = new Mine(w, STATS);
  m.pod.x = 3.5; m.pod.y = 0.5; m.pod.grounded = false; m.pod.docked = false;
  const ev = run(m, 1.2);
  assert.ok(ev.some((e) => e.type === 'boing'));
});

test('landing on the base pad docks once', () => {
  const m = new Mine(open(), STATS);
  m.pod.x = 6.5; m.pod.y = -0.401; m.pod.docked = false;
  const ev = run(m, 2, (mm) => ({ ax: mm.pod.x > 2.2 ? -1 : 0, ay: 0 }));
  assert.equal(ev.filter((e) => e.type === 'dock').length, 1);
});

test('stopping near a one-tile shaft slips the pod in; driving past does not', () => {
  const rows = ['BPP##.##B', 'B####.##B', 'B####.##B', 'B#######B', 'BBBBBBBBB'];
  const w = makeWorld(rows);
  const m = new Mine(w, STATS);
  m.pod.x = 5.32; m.pod.y = -0.401; m.pod.docked = false; m.pod.grounded = true;
  run(m, 0.8);
  assert.ok(m.pod.y > 1, `fell into the shaft (y ${m.pod.y.toFixed(2)})`);
  const m2 = new Mine(makeWorld(rows), STATS);
  m2.pod.x = 3.6; m2.pod.y = -0.401; m2.pod.docked = false; m2.pod.grounded = true;
  run(m2, 0.9, { ax: 1, ay: 0 });
  assert.ok(m2.pod.y < 0, 'drove over the shaft');
  assert.ok(m2.pod.x > 6.4, 'made it across');
});

test('a boulder left hanging by a reload or a tow still falls (#106)', () => {
  // Saved mid-wobble: the tile under the boulder is already empty.
  const w = makeWorld(['B....B', 'BPP.OB', 'B....B', 'B...#B', 'BBBBBB']);
  const m = new Mine(w, STATS);
  run(m, 2.5);
  assert.equal(m.tile(4, 1), T.EMPTY);
  assert.equal(m.tile(4, 2), T.BOULDER);
  // Towed mid-wobble: the wobble list is cleared, the boulder wakes again.
  m.setTile(4, 3, T.EMPTY);
  m.wake(4, 3);
  m.boulders.length = 0;
  m.wakeLoose();
  run(m, 2.5);
  assert.equal(m.tile(4, 2), T.EMPTY);
  assert.equal(m.tile(4, 3), T.BOULDER);
});

test('a boulder landing on the edge of the pod bonks it instead of pinning it (#115)', () => {
  const w = makeWorld(['B.....B', 'BPP.O.B', 'B.....B', 'B.....B', 'B######', 'BBBBBBB']);
  const m = new Mine(w, STATS);
  // The pod pokes 0.05 of a tile into the boulder's column.
  m.pod.x = 4 - 0.4 + 0.05; m.pod.y = 3.6 - 1e-4; m.pod.docked = false; m.pod.grounded = true;
  const ev = run(m, 3);
  assert.ok(ev.some((e) => e.type === 'bonk'));
  assert.equal(m.tile(4, 3), T.EMPTY);
  assert.equal(m.overlaps(m.pod.x, m.pod.y), false);
  const x0 = m.pod.x;
  run(m, 0.5, { ax: -1, ay: 0 });
  assert.ok(m.pod.x < x0 - 0.5, 'the pod drives away');
});
