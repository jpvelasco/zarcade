import test from 'node:test';
import assert from 'node:assert/strict';
import { PalSim, STATES, liftOf, floorOf } from '../src/pals.js';
import { layout, cauldronHit, inRect } from '../src/layout.js';
import { Alchemy, newState, ROOMS, ROOM_CAP } from '../src/alchemy.js';
import { simulate } from '../src/bot.js';
import { PALS } from '../src/recipes.js';

const owned = (ids, rooms = 1) => ids.map((id, i) => ({ id, room: i % rooms }));

test('the layout fits a laptop and a phone', () => {
  for (const [W, H] of [[1366, 700], [1024, 560], [390, 620], [820, 1024], [360, 480], [844, 220], [932, 260]]) {
    const lay = layout(W, H);
    assert.equal(lay.rooms.length, ROOMS.length);
    for (const r of lay.rooms) {
      assert.ok(r.x >= 0 && r.y >= 0, 'a room went off the left or top');
      assert.ok(r.x + r.w <= W + 1 && r.y + r.h <= H + 1, 'a room went off the right or bottom');
      assert.ok(r.w > 40 && r.h > 40, `rooms too small at ${W}x${H}`);
      assert.ok(r.floor.w > 10 && r.floor.h > 10);
      assert.ok(r.floor.x >= r.x && r.floor.x + r.floor.w <= r.x + r.w);
      assert.ok(r.floor.y >= r.y && r.floor.y + r.floor.h <= r.y + r.h);
    }
    assert.ok(lay.cauldron.y > lay.hearth.y && lay.cauldron.y < H);
    assert.ok(lay.cauldron.r > 20);
  }
});

test('rooms never overlap', () => {
  for (const [W, H] of [[1366, 700], [390, 620], [844, 220]]) {
    const { rooms } = layout(W, H);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        assert.ok(apart, `rooms ${i} and ${j} overlap at ${W}x${H}`);
      }
    }
  }
});

test('rooms fill the tree from the bottom upwards', () => {
  for (const [W, H] of [[1366, 700], [390, 620]]) {
    const { rooms } = layout(W, H);
    // The first room is on the lowest row; the last is on the highest.
    const first = rooms[0].y;
    const last = rooms[rooms.length - 1].y;
    assert.ok(last < first, `rooms grow downwards at ${W}x${H}`);
  }
});

test('the cauldron hit area is generous but stays on screen', () => {
  const lay = layout(1366, 700);
  const hit = cauldronHit(lay);
  assert.ok(inRect(hit, lay.cauldron.x, lay.cauldron.y));
  assert.ok(!inRect(hit, lay.cauldron.x, lay.rooms[0].y));
  assert.ok(hit.w > lay.cauldron.r * 2);
});

test('every room holds all six of its pals', () => {
  assert.ok(ROOM_CAP * ROOMS.length >= PALS.length, 'not enough room for everyone');
});

test('pals stay inside their room, whatever they are doing', () => {
  const lay = layout(1200, 640);
  const sim = new PalSim(11);
  sim.sync(owned(PALS.slice(0, 12).map((p) => p.id), 3), lay.rooms);
  for (let i = 0; i < 4000; i++) {
    sim.update(1 / 60, lay.rooms);
    for (const a of sim.actors) {
      const f = floorOf(lay.rooms, a.room);
      assert.ok(a.x >= f.x - 0.01 && a.x <= f.x + f.w + 0.01, `${a.id} walked out sideways`);
      assert.ok(a.y >= f.y - 0.01 && a.y <= f.y + f.h + 0.01, `${a.id} left the floor`);
    }
  }
});

test('pals do all four things over time', () => {
  const lay = layout(1200, 640);
  const sim = new PalSim(3);
  sim.sync(owned(PALS.slice(0, 8).map((p) => p.id), 2), lay.rooms);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    sim.update(1 / 60, lay.rooms);
    for (const a of sim.actors) seen.add(a.state);
  }
  for (const state of STATES) assert.ok(seen.has(state), `nobody ever did "${state}"`);
});

test('the same seed always looks the same', () => {
  const lay = layout(1000, 600);
  const run = () => {
    const sim = new PalSim(123);
    sim.sync(owned(['mossy', 'fizz', 'cinder', 'nimbus'], 2), lay.rooms);
    for (let i = 0; i < 900; i++) sim.update(1 / 60, lay.rooms);
    return sim.actors.map((a) => `${a.id}:${a.state}:${a.x.toFixed(3)}:${a.y.toFixed(3)}`).join('|');
  };
  assert.equal(run(), run());
});

test('a newcomer walks in from the cauldron and settles down', () => {
  const lay = layout(1200, 640);
  const sim = new PalSim(5);
  sim.sync(owned(['mossy'], 1), lay.rooms);
  sim.sync([{ id: 'mossy', room: 0 }, { id: 'fizz', room: 0 }], lay.rooms, { walkIn: true, from: lay.cauldron });
  const fizz = sim.get('fizz');
  assert.equal(fizz.state, 'arrive');
  assert.ok(Math.abs(fizz.x - lay.cauldron.x) < 2);
  for (let i = 0; i < 200; i++) sim.update(1 / 60, lay.rooms);
  assert.notEqual(sim.get('fizz').state, 'arrive');
  const f = floorOf(lay.rooms, 0);
  assert.ok(fizz.x >= f.x && fizz.x <= f.x + f.w);
});

test('syncing keeps old pals where they were and forgets strangers', () => {
  const lay = layout(1000, 600);
  const sim = new PalSim(8);
  sim.sync(owned(['mossy', 'fizz'], 1), lay.rooms);
  for (let i = 0; i < 120; i++) sim.update(1 / 60, lay.rooms);
  const was = { ...sim.get('mossy') };
  sim.sync(owned(['mossy', 'cinder'], 1), lay.rooms);
  assert.equal(sim.get('mossy').x, was.x);
  assert.equal(sim.get('fizz'), null);
  assert.equal(sim.actors.length, 2);
});

test('poking wakes a napping pal and makes it hop', () => {
  const lay = layout(1000, 600);
  const sim = new PalSim(2);
  sim.sync(owned(['mossy'], 1), lay.rooms);
  const a = sim.get('mossy');
  a.state = 'nap';
  sim.poke('mossy');
  assert.equal(a.state, 'idle');
  assert.equal(a.hop, 1);
  assert.ok(liftOf(a) > 0);
  assert.equal(sim.poke('nobody'), null);
});

test('reduced motion keeps pals still', () => {
  const lay = layout(1000, 600);
  const sim = new PalSim(4);
  sim.sync(owned(['mossy'], 1), lay.rooms);
  const a = sim.get('mossy');
  a.state = 'idle';
  a.hop = 0;
  assert.equal(liftOf(a, true), 0);
});

test('tapping finds the pal under the finger', () => {
  const lay = layout(1200, 640);
  const sim = new PalSim(6);
  sim.sync(owned(['mossy', 'fizz'], 2), lay.rooms);
  const a = sim.get('fizz');
  assert.equal(sim.at(a.x, a.y - 10)?.id, 'fizz');
  assert.equal(sim.at(4, 4), null, 'the corner of the roof holds nobody');
});

test('a played-out save puts all 32 pals in six rooms', () => {
  const lay = layout(1366, 700);
  const alchemy = new Alchemy(newState(1));
  simulate(alchemy, 400);
  assert.equal(alchemy.palCount, PALS.length);
  const list = Object.keys(alchemy.state.pals).map((id) => ({ id, room: alchemy.roomOf(id) }));
  const sim = new PalSim(1);
  sim.sync(list, lay.rooms);
  assert.equal(sim.actors.length, PALS.length);
  const perRoom = new Array(ROOMS.length).fill(0);
  for (const a of sim.actors) perRoom[a.room]++;
  for (const n of perRoom) assert.ok(n > 0 && n <= ROOM_CAP, `a room holds ${n} pals`);
});
