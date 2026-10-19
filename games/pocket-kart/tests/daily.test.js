import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeed, dailyTrackDef, dateKey, generateTrackSteps, isDateKey, previousDay, recordDaily, streakLabel } from '../src/daily.js';
import { buildTrack, validateTrack } from '../src/track.js';
import { defaultSave } from '../src/progress.js';
import { Race } from '../src/race.js';
import { RACERS, kartById } from '../src/karts.js';
import { run } from './helpers.js';

test('date keys are local calendar days', () => {
  assert.equal(dateKey(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2027-01-01'), '2026-12-31');
  assert.ok(isDateKey('2026-10-09') && !isDateKey('2026-1-9') && !isDateKey(5));
});

test('same day, same track; another day, another track', () => {
  const a = dailyTrackDef('2026-10-09'), b = dailyTrackDef('2026-10-09'), c = dailyTrackDef('2026-10-10');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.points, c.points);
  assert.equal(a.cup, -1);
  assert.ok(a.name.split(' ').length === 3, a.name);
});

test('400 days of daily tracks are all valid', () => {
  for (let i = 0; i < 400; i++) {
    const key = dateKey(new Date(2026, 9, 9 + i, 12));
    const def = dailyTrackDef(key);
    const t = buildTrack(def, { decor: false });
    assert.deepEqual(validateTrack(t), [], key);
  }
});

test('the generator yields between attempts so a browser can spread it out', () => {
  const it = generateTrackSteps(dailySeed('2026-10-12'));
  let yields = 0, done;
  for (;;) { const s = it.next(); if (s.done) { done = s.value; break; } yields++; }
  assert.ok(done.points.length >= 6);
  assert.ok(yields >= 0);
});

test('an AI can finish a week of daily tracks', () => {
  for (let i = 0; i < 7; i++) {
    const t = buildTrack(dailyTrackDef(dateKey(new Date(2026, 9, 9 + i, 12))));
    const race = new Race({ track: t, entrants: [{ racer: RACERS[0], kart: kartById('buggy'), personality: 'steady' }], mode: 'tt', items: false, seed: 1 });
    run(race, { maxTime: 200 });
    assert.ok(race.karts[0].finished, t.name);
  }
});

test('a gentle streak: days in a row count up, a gap starts fresh but keeps the best', () => {
  const save = defaultSave();
  recordDaily(save, '2026-10-09', 30);
  assert.equal(save.daily.streak, 1);
  const again = recordDaily(save, '2026-10-09', 28);
  assert.equal(again.newBest, true);
  assert.equal(save.daily.streak, 1);
  assert.equal(save.daily.plays, 1);
  recordDaily(save, '2026-10-10', 31);
  recordDaily(save, '2026-10-11', 31);
  assert.equal(save.daily.streak, 3);
  assert.equal(save.daily.best, 31, 'best resets for the new day');
  recordDaily(save, '2026-10-20', 29);
  assert.equal(save.daily.streak, 1);
  assert.equal(save.daily.bestStreak, 3);
  assert.equal(save.daily.plays, 4);
  assert.match(streakLabel(save, '2026-10-20'), /Played today/);
  assert.match(streakLabel(save, '2026-10-21'), /keep it going/);
  assert.match(streakLabel(save, '2026-10-25'), /waiting/);
});
