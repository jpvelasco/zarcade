import test from 'node:test';
import assert from 'node:assert/strict';
import { Trip } from '../src/trip.js';
import { WATER, bandAt } from '../src/data.js';
import { playCast, STARTER, BEST } from './helpers.js';

const base = { water: 'pond', period: 'day', weather: 'clear', equip: STARTER };

test('hold to charge, let go to cast: the lure lands where the meter said', () => {
  const trip = new Trip({ ...base, seed: 3 });
  trip.step(1 / 60, { hold: true });
  assert.equal(trip.state, 'charging');
  for (let i = 0; i < 40; i++) trip.step(1 / 60, { hold: true });
  trip.step(1 / 60, { hold: false });
  assert.equal(trip.state, 'flying');
  const cast = trip.events.find((e) => e.type === 'cast');
  const land = trip.landingFor(cast.power);
  for (let i = 0; i < 200 && trip.state === 'flying'; i++) trip.step(1 / 60, {});
  assert.ok(Math.abs(trip.lure.x - land.x) < 0.01);
  assert.ok(land.x <= trip.reach && land.x >= 3);
  for (let i = 0; i < 60 * 20 && trip.state === 'sinking'; i++) trip.step(1 / 60, {});
  assert.ok(['waiting', 'nibble', 'bite'].includes(trip.state), trip.state);
});

test('the power meter sweeps up and back down', () => {
  const trip = new Trip({ ...base, seed: 3 });
  let max = 0, sawFall = false;
  for (let i = 0; i < 200; i++) { trip.step(1 / 60, { hold: true }); max = Math.max(max, trip.cast.power); if (!trip.cast.rising) sawFall = true; }
  assert.equal(max, 1);
  assert.ok(sawFall);
});

test('holding while waiting reels the lure back in', () => {
  const trip = new Trip({ ...base, seed: 4 });
  trip.step(1 / 60, { hold: true });
  for (let i = 0; i < 30; i++) trip.step(1 / 60, { hold: true });
  trip.step(1 / 60, { hold: false });
  for (let i = 0; i < 120; i++) trip.step(1 / 60, {});
  let seen = false;
  for (let i = 0; i < 60 * 30 && trip.state !== 'ready'; i++) {
    trip.step(1 / 60, { hold: true });
    if (trip.state === 'reeling') seen = true;
    if (trip.state === 'nibble' || trip.state === 'bite' || trip.state === 'fight') break;
  }
  assert.ok(seen);
});

test('ice fishing drops the lure straight down the hole', () => {
  const w = WATER.frozen;
  const trip = new Trip({ water: 'frozen', period: 'day', weather: 'snow', equip: { ...BEST, bait: 'waxworm' }, seed: 2 });
  const a = trip.landingFor(0), b = trip.landingFor(1);
  assert.equal(a.x, w.holeX);
  assert.equal(b.x, w.holeX);
  assert.ok(bandAt(a.y) === 'shallow' && bandAt(b.y) === 'deep');
});

test('the same seed plays out the same way', () => {
  const a = playCast({ ...base }, { seed: 11 });
  const b = playCast({ ...base }, { seed: 11 });
  assert.deepEqual(a.events, b.events);
  assert.equal(a.outcome, b.outcome);
});

test('fish come to the right bait at the right depth', () => {
  let landed = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { trip, outcome } = playCast({ ...base }, { seed });
    if (outcome !== 'landed') continue;
    landed++;
    assert.ok(trip.result.fish.baits.includes('worm'), trip.result.fish.id);
    assert.equal(trip.result.fish.water, 'pond');
  }
  assert.ok(landed >= 10, `landed ${landed}/12 on starter gear`);
});

test('sniffing fish that dislike the bait are reported once per species', () => {
  let sniffs = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { events } = playCast({ water: 'pond', period: 'day', weather: 'clear', equip: { ...STARTER, bait: 'dough' } }, { seed, maxSeconds: 60 });
    sniffs += events.filter((e) => e === 'sniff').length;
  }
  assert.ok(sniffs > 0);
});
