import test from 'node:test';
import assert from 'node:assert/strict';
import { KART, collideKarts, hitKart, makeKart, stepKart } from '../src/kart.js';
import { KARTS, RACERS, STATS, STAT_TOTAL, kartById, kartModifiers } from '../src/karts.js';
import { track } from './helpers.js';
import { buildTrack } from '../src/track.js';

const STEP = 1 / 120;
const t = track('toybox-speedway');
// A huge, wide ring: room to drift in circles without meeting a wall.
const ring = buildTrack({
  id: 'ring', name: 'Ring', points: Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2) * 2200, Math.sin((i / 16) * Math.PI * 2) * 2200]),
  width: 340, verge: 30, pads: [], boxes: [], bumpers: [],
}, { decor: false });

function kartAt(i = 0, kart = 'buggy', lat = 0, tr = t) {
  const m = tr.main;
  const slot = { x: m.x[i] + m.nx[i] * lat, y: m.y[i] + m.ny[i] * lat, angle: Math.atan2(m.ty[i], m.tx[i]), i, s: m.s[i] };
  return makeKart({ racer: RACERS[0], kart: kartById(kart), slot, index: 0 });
}

function drive(k, controls, seconds, events = [], tr = t) {
  for (let s = 0; s < seconds / STEP; s++) stepKart(k, typeof controls === 'function' ? controls(k) : controls, tr, STEP, events);
  return events;
}

test('every kart has the same stat total, and each is best or worst at something', () => {
  for (const k of KARTS) {
    const sum = STATS.reduce((a, s) => a + k.stats[s], 0);
    assert.equal(sum, STAT_TOTAL, k.id);
    for (const s of STATS) assert.ok(k.stats[s] >= 1 && k.stats[s] <= 5);
  }
  for (const k of KARTS.filter((x) => x.id !== 'buggy')) {
    const extremes = STATS.filter((s) => k.stats[s] !== 3);
    assert.ok(extremes.some((s) => k.stats[s] > 3) && extremes.some((s) => k.stats[s] < 3), `${k.id} trades something for something`);
  }
});

test('stat trade-offs stay small: top speeds within ±5%', () => {
  for (const k of KARTS) {
    const m = kartModifiers(k);
    assert.ok(m.speed >= 0.95 && m.speed <= 1.05, k.id);
  }
});

test('gas reaches top speed in a few seconds; steering needs speed', () => {
  const k = kartAt();
  const h0 = k.h;
  drive(k, { steer: 1, gas: 0 }, 0.5);
  assert.ok(Math.abs(k.h - h0) < 0.01, 'no spinning on the spot');
  drive(k, { steer: 0, gas: 1 }, 3);
  assert.ok(k.v > KART.top * 0.9, `speed ${k.v}`);
});

test('a drift charges blue, orange and pink sparks, and longer drifts give longer turbos', () => {
  const turboFor = (seconds) => {
    const k = kartAt(10, 'buggy', 0, ring);
    drive(k, { steer: 0, gas: 1 }, 2.5, [], ring);
    const events = [];
    drive(k, { steer: 0.6, gas: 1, drift: true }, seconds, events, ring);
    drive(k, { steer: 0, gas: 1, drift: false }, STEP, events, ring);
    assert.ok(!events.some((e) => e.type === 'wall'), 'open ground');
    const tiers = events.filter((e) => e.type === 'spark-tier').map((e) => e.tier);
    return { boost: k.boostT, tiers, drifted: events.some((e) => e.type === 'drift-start') };
  };
  const short = turboFor(0.2), blue = turboFor(0.6), orange = turboFor(1.1), pink = turboFor(1.9);
  assert.ok(blue.drifted);
  assert.equal(short.boost, 0, 'too short: no turbo');
  assert.deepEqual(pink.tiers, [1, 2, 3]);
  assert.ok(blue.boost > 0 && orange.boost > blue.boost && pink.boost > orange.boost, `${blue.boost} ${orange.boost} ${pink.boost}`);
});

test('a drift only starts while steering at speed', () => {
  const slow = kartAt();
  const ev1 = drive(slow, { steer: 1, gas: 0.2, drift: true }, 0.4);
  assert.ok(!ev1.some((e) => e.type === 'drift-start'));
  const straight = kartAt();
  drive(straight, { gas: 1 }, 2);
  const ev2 = drive(straight, { steer: 0, gas: 1, drift: true }, 0.4);
  assert.ok(ev2.some((e) => e.type === 'hop') && !ev2.some((e) => e.type === 'drift-start'));
});

test('the verge slows a kart, a boost mostly ignores it', () => {
  const k = kartAt(10, 'buggy', 0);
  drive(k, { gas: 1 }, 3);
  const road = k.v;
  k.surface = 'verge';
  const verge = kartAt(10, 'buggy', t.main.hw[10] + 10);
  drive(verge, (kk) => { kk.x = verge.x; return { gas: 1 }; }, 0);
  verge.v = road;
  for (let s = 0; s < 240; s++) {
    stepKart(verge, { gas: 1 }, t, STEP, []);
    // Hold it on the verge.
    const m = t.main;
    const i = verge.hint;
    const lat = m.hw[i] + 10;
    verge.x = m.x[i] + m.nx[i] * lat; verge.y = m.y[i] + m.ny[i] * lat;
  }
  assert.equal(verge.surface, 'verge');
  assert.ok(verge.v < road * 0.7, `verge ${verge.v} vs road ${road}`);
});

test('hitting a wall slows the kart but never stops it', () => {
  const k = kartAt(30);
  drive(k, { gas: 1 }, 2.5);
  const before = k.v;
  // Turn hard toward the left wall and hold gas.
  k.h += 1.3;
  k.m = k.h;
  const events = drive(k, { gas: 1 }, 0.5);
  assert.ok(events.some((e) => e.type === 'wall'), 'hit the wall');
  assert.ok(k.v > before * 0.3, `kept speed ${k.v} of ${before}`);
  assert.ok(k.over <= 0.5, 'stays inside');
});

test('a head-on hit turns the kart along the wall and keeps a third of its speed', () => {
  const k = kartAt(30);
  k.v = 300;
  const m = t.main;
  // Point straight at the left wall.
  k.h = k.m = Math.atan2(m.ny[30], m.nx[30]);
  const events = drive(k, { gas: 0 }, 0.4);
  assert.ok(events.some((e) => e.type === 'wall'));
  assert.ok(k.v >= 60, `speed after head-on ${k.v}`);
});

test('karts bump apart, and the heavy one moves less', () => {
  const a = kartAt(20, 'chonk', 10), b = kartAt(20, 'swish', -10);
  b.index = 1;
  a.y = b.y; a.x = b.x - 15;
  const ax = a.x, bx = b.x;
  a.v = 200; a.m = a.h = 0; b.v = 0; b.m = b.h = 0;
  const events = [];
  collideKarts(a, b, events);
  assert.ok(events.some((e) => e.type === 'bump'));
  assert.ok(Math.abs(b.x - bx) > Math.abs(a.x - ax), 'light kart is pushed further');
  assert.ok(Math.hypot(b.px, b.py) > Math.hypot(a.px, a.py));
});

test('a hit is a short wobble, blocked by a shield', () => {
  const k = kartAt(10);
  drive(k, { gas: 1 }, 2);
  const events = [];
  assert.equal(hitKart(k, events, { kind: 'jelly' }), true);
  assert.ok(k.wobbleT > 0);
  drive(k, { gas: 1 }, KART.wobble + 0.1);
  assert.ok(k.wobbleT <= 0 && k.v > 30, 'moving again after the wobble');
  const s = kartAt(10);
  s.shieldT = 5;
  assert.equal(hitKart(s, events, {}), false);
  assert.equal(s.shieldT, 0);
  assert.ok(events.some((e) => e.type === 'shield-pop'));
});
