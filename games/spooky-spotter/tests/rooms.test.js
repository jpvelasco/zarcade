import test from 'node:test';
import assert from 'node:assert/strict';

import { ROOMS, ROOM, ROOM_IDS, MODES, MODE_IDS, sceneBox, parTime, targetCount, clutterScale, WORLD_H } from '../src/rooms.js';
import { PROPS, PROP_LIST, FAMILIES, coverRects, slotPoints } from '../src/props.js';
import { ITEMS, ITEM, FINDABLE, itemsForKind, lowerLabel } from '../src/items.js';
import { GHOSTS, GHOST, ghostsOf, assignOwners } from '../src/ghosts.js';
import { CURIOS, CURIO, curioFor, mouseCurios, SHELVES } from '../src/curios.js';

const KINDS = ['shelf', 'table', 'floor', 'under', 'nook', 'hook', 'behind', 'high'];

test('prop definitions are sane', () => {
  const seen = new Set();
  for (const p of PROP_LIST) {
    assert.ok(!seen.has(p.id), `two props called ${p.id}`);
    seen.add(p.id);
    assert.ok(p.w[0] > 0 && p.w[1] >= p.w[0], `${p.id} width`);
    assert.ok(p.ratio[0] > 0 && p.ratio[1] >= p.ratio[0], `${p.id} ratio`);
    assert.ok(p.layer >= 1 && p.layer <= 6, `${p.id} layer`);
    assert.ok(Array.isArray(p.solid), `${p.id} solid`);
    for (const r of p.solid) {
      assert.equal(r.length, 4, `${p.id} cover rect`);
      assert.ok(r[2] > 0 && r[3] > 0, `${p.id} empty cover rect`);
    }
    for (const s of p.slots || []) {
      assert.equal(s.length, 3, `${p.id} slot`);
      assert.ok(KINDS.includes(s[2]), `${p.id} slot kind ${s[2]}`);
      assert.ok(s[0] > -0.3 && s[0] < 1.3, `${p.id} slot x ${s[0]}`);
      // A 'high' spot is a surface to stand on, so it sits at the top edge; a
      // 'hook' can dangle below the prop.
      if (s[2] === 'high') assert.ok(s[1] >= 0 && s[1] <= 0.1, `${p.id} high spot at y ${s[1]} would float`);
      assert.ok(s[1] > -0.2 && s[1] < 1.7, `${p.id} slot y ${s[1]}`);
    }
  }
  assert.ok(PROP_LIST.length >= 55, `only ${PROP_LIST.length} props in the library`);
  assert.ok(FAMILIES.length >= 8);
});

test('cover rects and slots land inside sensible world coordinates', () => {
  const box = { x: 100, y: 200, w: 300, h: 400 };
  const rects = coverRects(PROPS.bookcase, box);
  assert.deepEqual(rects[0], { x: 100, y: 200, w: 300, h: 400 });
  const slots = slotPoints(PROPS.bookcase, box);
  assert.ok(slots.length >= 4);
  for (const s of slots) assert.ok(KINDS.includes(s.kind));
});

test('every room recipe points at real props and tiles its width', () => {
  assert.equal(ROOMS.length, 7);
  for (const room of ROOMS) {
    assert.ok(room.name && room.blurb && room.accent, `${room.id} is missing copy`);
    assert.ok(room.par >= 50 && room.par <= 120, `${room.id} par ${room.par}`);
    assert.ok(room.floorY > 0.6 && room.floorY < 0.8, `${room.id} floor line`);
    for (const key of ['wall', 'wall2', 'trim', 'floor', 'floor2', 'glow', 'dusk']) {
      assert.match(room.palette[key], /^#[0-9a-f]{6}$/i, `${room.id} palette ${key}`);
    }
    // Curtains belong at the very edges of the picture, not across the middle
    // of a wall of furniture.
    for (const spot of room.front) {
      if (!spot.pools.includes('curtain')) continue;
      const atEdge = spot.x[1] < 0.1 || spot.x[0] > 0.9;
      assert.ok(atEdge, `${room.id} hangs a curtain at ${spot.x[0]}–${spot.x[1]}`);
    }
    let edge = 0;
    for (const bay of room.bays) {
      assert.ok(bay.x[0] >= edge - 1e-9, `${room.id} bays overlap at ${bay.x[0]}`);
      assert.ok(bay.x[1] > bay.x[0], `${room.id} empty bay`);
      edge = bay.x[1];
      for (const id of bay.pools) assert.ok(PROPS[id], `${room.id} bay wants unknown prop ${id}`);
    }
    assert.ok(Math.abs(edge - 1) < 1e-9, `${room.id} bays stop at ${edge}`);
    for (const group of [room.wallSpots, room.hangSpots, room.front]) {
      for (const spot of group) {
        for (const id of spot.pools) assert.ok(PROPS[id], `${room.id} spot wants unknown prop ${id}`);
        assert.ok(spot.x[1] >= spot.x[0]);
      }
    }
    for (const id of room.clutter.pools) assert.ok(PROPS[id], `${room.id} clutter wants unknown prop ${id}`);
    assert.ok(room.clutter.count[0] >= 5 && room.clutter.count[1] >= room.clutter.count[0]);
    assert.ok(ghostsOf(room.id).length >= 1, `${room.id} has no ghost`);
  }
});

test('rooms offer enough hiding places of every kind they need', () => {
  for (const room of ROOMS) {
    const kinds = new Set(['floor']);
    const pools = [
      ...room.bays.flatMap((b) => b.pools),
      ...room.wallSpots.flatMap((s) => s.pools),
      ...room.hangSpots.flatMap((s) => s.pools),
      ...room.front.flatMap((s) => s.pools),
      ...room.clutter.pools,
    ];
    for (const id of pools) for (const s of PROPS[id].slots || []) kinds.add(s[2]);
    for (const need of ['shelf', 'table', 'nook', 'high', 'under', 'behind']) {
      assert.ok(kinds.has(need), `${room.id} offers no ${need} spot`);
    }
  }
});

test('item catalogue is complete and every kind has candidates', () => {
  assert.ok(ITEMS.length >= 30, `only ${ITEMS.length} things to find`);
  const seen = new Set();
  for (const it of ITEMS) {
    assert.ok(!seen.has(it.id), `two items called ${it.id}`);
    seen.add(it.id);
    assert.ok(it.label && it.label.length < 24, `${it.id} label`);
    assert.ok(it.w >= 50 && it.w <= 130, `${it.id} width ${it.w}`);
    assert.ok(it.h >= 40 && it.h <= 130, `${it.id} height ${it.h}`);
    assert.ok(it.kinds.length >= 3, `${it.id} can only hide in ${it.kinds.length} kinds of spot`);
    for (const k of it.kinds) assert.ok(KINDS.includes(k), `${it.id} kind ${k}`);
    assert.match(it.tint, /^#[0-9a-f]{6}$/i, `${it.id} tint`);
  }
  for (const kind of KINDS) {
    assert.ok(itemsForKind(kind).length >= 6, `only ${itemsForKind(kind).length} things fit a ${kind}`);
  }
  assert.equal(FINDABLE.length, ITEMS.length - 1, 'the mouse is the only secret');
  assert.equal(lowerLabel('teddy'), 'teddy bear');
});

test('ghosts live in real rooms and want real things', () => {
  assert.ok(GHOSTS.length >= 8);
  for (const g of GHOSTS) {
    assert.ok(ROOM[g.room], `${g.id} lives in ${g.room}`);
    assert.ok(ITEM[g.favourite], `${g.id} wants unknown ${g.favourite}`);
    assert.ok(g.bio.length > 30 && g.line.length > 10, `${g.id} needs copy`);
    assert.match(g.hue, /^#[0-9a-f]{6}$/i);
  }
  for (const id of ROOM_IDS) assert.ok(ghostsOf(id).length >= 1, `${id} has nobody in it`);
});

test('owners are shared out, favourites first', () => {
  const crew = ghostsOf('library');
  const items = ['teacup', 'spectacles', 'sock', 'marble', 'key'];
  const owners = assignOwners('library', items);
  assert.equal(owners.length, items.length);
  assert.equal(owners[1], 'lumi', 'the spectacles belong to Lumi');
  assert.equal(owners[3], 'pib', 'the marble belongs to Pib');
  for (const o of owners) assert.ok(GHOST[o]);
  const counts = crew.map((g) => owners.filter((o) => o === g.id).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, 'one ghost got everything');
});

test('the curio cabinet covers every room and mode exactly once', () => {
  assert.equal(CURIOS.length, 24);
  const seen = new Set();
  for (const c of CURIOS) {
    assert.ok(!seen.has(c.id), `two curios called ${c.id}`);
    seen.add(c.id);
    assert.ok(c.shelf >= 0 && c.shelf < SHELVES.length, `${c.id} shelf`);
    assert.ok(c.name && c.blurb && c.art, `${c.id} needs copy`);
    assert.match(c.tint, /^#[0-9a-f]{6}$/i);
    if (c.earn.kind === 'clear') {
      assert.ok(ROOM[c.earn.room], `${c.id} rewards unknown room`);
      assert.ok(MODE_IDS.includes(c.earn.mode), `${c.id} rewards unknown mode`);
    } else {
      assert.equal(c.earn.kind, 'mouse');
      assert.ok(c.earn.n >= 1 && c.earn.n <= 7, `${c.id} needs ${c.earn.n} mice`);
    }
  }
  for (const room of ROOM_IDS) {
    for (const mode of MODE_IDS) assert.ok(curioFor(room, mode), `nothing to win in ${room} ${mode}`);
  }
  assert.equal(mouseCurios(0).length, 0);
  assert.equal(mouseCurios(7).length, 3);
});

test('modes, par times and counts are in a kind range', () => {
  assert.deepEqual(MODE_IDS, ['find', 'diff', 'hunt']);
  for (const m of MODES) assert.ok(m.name && m.short && m.icon);
  for (const room of ROOM_IDS) {
    for (const mode of MODE_IDS) {
      const par = parTime(room, mode);
      assert.ok(par >= 45 && par <= 120, `${room} ${mode} par ${par}`);
    }
  }
  assert.equal(targetCount('find', 0), 6);
  assert.equal(targetCount('find', 6), 9);
  assert.equal(targetCount('hunt', 6), 6);
  assert.equal(targetCount('diff', 6, 1400), 7);
  assert.equal(targetCount('diff', 6, 900), 5);
});

test('the scene box follows the viewport but stays in bounds', () => {
  assert.equal(sceneBox(1366, 760).h, WORLD_H);
  assert.equal(sceneBox(390, 560).w, 900, 'a phone gets the narrowest room');
  assert.equal(sceneBox(4000, 800).w, 2600, 'an ultrawide stops at 2600');
  assert.equal(sceneBox(1366, 410).w, 2600, 'a difference panel is wide and shallow');
  assert.equal(sceneBox(390, 304).w, 1283);
  assert.ok(clutterScale(900) < clutterScale(2600), 'a wider room gets more clutter');
  assert.equal(clutterScale(1200), 1);
  assert.ok(clutterScale(400) >= 0.95 && clutterScale(9000) <= 1.9);
  assert.ok(sceneBox(1366, 760).w > sceneBox(1060, 790).w);
  assert.equal(sceneBox(0, 0).w, 1400, 'a zero viewport still gives a room');
});
