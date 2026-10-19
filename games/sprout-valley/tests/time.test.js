import test from 'node:test';
import assert from 'node:assert/strict';
import { dateOf, DAYS_PER_SEASON, DAYS_PER_YEAR, formatTime, weatherFor, darkness, minutesFor, MARKET_DAY, DAY_START } from '../src/time.js';
import { festivalOn } from '../src/festivals.js';
import { FESTIVALS, FESTIVAL_IDS } from '../src/data.js';

test('seasons roll over every seven days and years every 28', () => {
  assert.deepEqual(dateOf(0), { year: 1, seasonIndex: 0, season: 'spring', day: 1, weekday: 'Monday' });
  assert.equal(dateOf(DAYS_PER_SEASON - 1).season, 'spring');
  assert.equal(dateOf(DAYS_PER_SEASON - 1).day, 7);
  assert.equal(dateOf(DAYS_PER_SEASON).season, 'summer');
  assert.equal(dateOf(DAYS_PER_SEASON).day, 1);
  assert.equal(dateOf(DAYS_PER_YEAR - 1).season, 'winter');
  assert.equal(dateOf(DAYS_PER_YEAR).season, 'spring');
  assert.equal(dateOf(DAYS_PER_YEAR).year, 2);
  for (let d = 0; d < 60; d++) assert.equal(dateOf(d).day === MARKET_DAY, dateOf(d).weekday === 'Saturday');
});

test('clock text and pacing', () => {
  assert.equal(formatTime(DAY_START), '6:00 am');
  assert.equal(formatTime(13 * 60 + 47), '1:40 pm');
  assert.equal(formatTime(24 * 60 + 30), '12:30 am');
  assert.equal(minutesFor(1, 'normal'), 2);
  assert.ok(minutesFor(1, 'relaxed') < minutesFor(1, 'brisk'));
  assert.equal(darkness(12 * 60), 0);
  assert.ok(darkness(22 * 60) > 0.5);
});

test('weather is seeded, day one is sunny and festivals stay dry', () => {
  for (let d = 0; d < 56; d++) assert.equal(weatherFor(7, d), weatherFor(7, d));
  assert.equal(weatherFor(7, 0), 'sunny');
  const kinds = new Set();
  for (let d = 1; d < 200; d++) kinds.add(weatherFor(3, d));
  assert.ok(kinds.has('rain') && kinds.has('snow') && kinds.has('sunny'));
  for (let d = 0; d < 28; d++) {
    const w = weatherFor(9, d);
    if (dateOf(d).season !== 'winter') assert.notEqual(w, 'snow');
    else assert.notEqual(w, 'rain');
    if (festivalOn(d)) assert.equal(weatherFor(9, d, true), 'sunny');
  }
});

test('each season has exactly one festival on a weekday that is not market day', () => {
  const seen = new Set();
  for (let d = 0; d < DAYS_PER_YEAR; d++) {
    const f = festivalOn(d);
    if (!f) continue;
    seen.add(f);
    assert.equal(FESTIVALS[f].season, dateOf(d).season);
    assert.notEqual(dateOf(d).day, MARKET_DAY);
  }
  assert.deepEqual([...seen].sort(), FESTIVAL_IDS.slice().sort());
});
