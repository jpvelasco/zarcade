import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, MAX_W, MAX_H, openSlots, parseLayout } from '../src/layouts.js';
import { LEVELS, DAILY_STOCK, QUICK_STOCK } from '../src/deals.js';
import { computeTable, overlapsRect, TOP_BAND, BTN } from '../src/table.js';

const overlap = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

test('layout ids are unique and every layout has a name and blurb', () => {
  const ids = new Set();
  for (const l of LAYOUTS) {
    assert.ok(!ids.has(l.id), `duplicate ${l.id}`);
    ids.add(l.id);
    assert.ok(l.name && l.blurb, l.id);
  }
  assert.ok(LAYOUTS.length >= 8);
});

test('counts are right: 20-30 cards, a waste card and a full stock fit in one deck', () => {
  for (const l of LAYOUTS) {
    assert.ok(l.count >= 20 && l.count <= 30, `${l.id} has ${l.count} cards`);
    const stocks = [DAILY_STOCK, QUICK_STOCK, ...LEVELS.filter((lv) => lv.layoutId === l.id).map((lv) => lv.stock)];
    for (const s of stocks) assert.ok(l.count + 1 + s <= 52, `${l.id} + stock ${s} overflows the deck`);
  }
});

test('every layout stays inside 8 cards by 5 card heights', () => {
  for (const l of LAYOUTS) {
    assert.ok(l.width <= MAX_W && l.height <= MAX_H, `${l.id} is ${l.width}x${l.height} units`);
    assert.equal(Math.min(...l.slots.map((s) => s.x)), 0, `${l.id} is normalized`);
    for (const s of l.slots) assert.ok(s.x >= 0 && s.y >= 0 && s.x + 2 <= l.width && s.y + 2 <= l.height);
  }
});

test('cards cover correctly: no overlap within a row, covers match the geometry both ways', () => {
  for (const l of LAYOUTS) {
    l.slots.forEach((a, i) => {
      l.slots.forEach((b, j) => {
        if (i === j) return;
        if (a.y === b.y) assert.ok(!overlap(a, b), `${l.id}: slots ${i} and ${j} overlap in one row`);
        const covers = b.y > a.y && overlap(a, b);
        assert.equal(l.coveredBy[i].includes(j), covers, `${l.id}: ${j} over ${i}`);
        assert.equal(l.covers[j].includes(i), covers, `${l.id}: covers list for ${j}`);
      });
      const mask = l.coveredBy[i].reduce((m, j) => m | (1 << j), 0);
      assert.equal(l.coverMask[i], mask);
    });
  }
});

test('covers are acyclic: clearing face-up cards in turn clears the whole layout', () => {
  for (const l of LAYOUTS) {
    let mask = 0;
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < l.count; i++) {
        if (mask & (1 << i)) continue;
        if ((mask & l.coverMask[i]) === l.coverMask[i]) {
          mask |= 1 << i;
          progress = true;
        }
      }
    }
    assert.equal(mask, (1 << l.count) - 1, `${l.id} cannot be fully uncovered`);
  }
});

test('peaks cover nothing and start face down; enough cards start face up', () => {
  for (const l of LAYOUTS) {
    assert.ok(l.peaks.length >= 1, `${l.id} has a peak`);
    for (const p of l.peaks) {
      assert.deepEqual(l.covers[p], [], `${l.id}: peak ${p} lies over another card`);
      assert.ok(l.coveredBy[p].length > 0, `${l.id}: peak ${p} is free from the start`);
    }
    assert.ok(openSlots(l).length >= 3, `${l.id} starts with ${openSlots(l).length} open cards`);
  }
});

test('constellation lines join real peaks without repeats', () => {
  for (const l of LAYOUTS) {
    const seen = new Set();
    for (const [a, b] of l.lines) {
      assert.ok(a !== b && a >= 0 && b >= 0 && a < l.peaks.length && b < l.peaks.length, `${l.id} line ${a}-${b}`);
      const key = [Math.min(a, b), Math.max(a, b)].join('-');
      assert.ok(!seen.has(key), `${l.id} repeats line ${key}`);
      seen.add(key);
    }
  }
  assert.ok(LAYOUTS.filter((l) => l.lines.length).length >= 3, 'at least three constellations');
});

test('the art parser rejects stray characters', () => {
  assert.throws(() => parseLayout({ id: 'bad', art: ['o x'] }), /unexpected/);
});

const PHONES = [[390, 844], [844, 390]];
const DESKTOPS = [[1366, 860], [1280, 800], [1920, 1080], [768, 1024]];

function checkTable(l, vw, vh, minW) {
  const t = computeTable(vw, vh, l);
  const tag = `${l.id} at ${vw}x${vh}`;
  assert.ok(t.W >= minW, `${tag}: cards ${t.W}px wide`);
  const inside = (r, what) => {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh, `${tag}: ${what} off screen ${JSON.stringify(r)}`);
    assert.ok(r.y >= TOP_BAND, `${tag}: ${what} under the top band`);
  };
  t.slots.forEach((r, i) => inside(r, `slot ${i}`));
  for (const k of ['stock', 'waste', 'undo', 'hint']) inside(t[k], k);
  assert.ok(t.undo.w >= 44 && t.hint.w >= 44 && t.undo.w === BTN);
  const things = [['board', t.board], ['stock', t.stock], ['waste', t.waste], ['undo', t.undo], ['hint', t.hint]];
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      assert.ok(!overlapsRect(things[i][1], things[j][1]), `${tag}: ${things[i][0]} overlaps ${things[j][0]}`);
    }
  }
  assert.ok(t.stock.w >= t.W && t.waste.w >= t.W, `${tag}: piles at least card size`);
  return t;
}

test('every layout renders on a phone, upright and sideways, with 44px+ cards', () => {
  for (const l of LAYOUTS) for (const [vw, vh] of PHONES) checkTable(l, vw, vh, 44);
});

test('every layout scales up on desktop and tablet windows', () => {
  for (const l of LAYOUTS) {
    for (const [vw, vh] of DESKTOPS) {
      const t = checkTable(l, vw, vh, 70);
      // The table uses the window: wide layouts span its width, tall ones
      // its height.
      const across = Math.max(t.board.w, t.waste.x + t.waste.w - t.stock.x) / vw;
      const down = (Math.max(t.board.y + t.board.h, t.stock.y + t.stock.h, t.hint.y + t.hint.h) - t.board.y) / vh;
      assert.ok(Math.max(across, down) > 0.55, `${l.id} at ${vw}x${vh} only spans ${across.toFixed(2)} x ${down.toFixed(2)}`);
    }
  }
});

test('a small 360x640 phone still gets tappable cards', () => {
  for (const l of LAYOUTS) checkTable(l, 360, 640, 42);
});
