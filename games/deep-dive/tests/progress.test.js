import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, PAINTS, freshSave, loadSave, writeSave, encodeBits, decodeBits, dateKey, previousDay,
  dailyGoals, ensureDaily, dailyRemaining, recordDailyScan, currentStreak, paintUnlocked, newPaints, recordDive, areaCompletion,
} from '../src/progress.js';
import { SPECIES } from '../src/creatures.js';
import { AREA_STAGE } from '../src/gating.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('a save round-trips through storage under deep-dive.v1', () => {
  const st = memory();
  const s = freshSave();
  s.progress.upgrades = ['grabber', 'drill'];
  s.progress.scanned = ['clownfish', 'dolphin'];
  s.paint = 'sunset';
  s.bests.depth = 321;
  assert.ok(writeSave(st, s));
  assert.ok(st.m.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'deep-dive.v1');
  const back = loadSave(st);
  assert.deepEqual(back.progress.upgrades, ['grabber', 'drill']);
  assert.deepEqual(back.progress.scanned, ['clownfish', 'dolphin']);
  assert.equal(back.paint, 'sunset');
  assert.equal(back.bests.depth, 321);
});

test('broken or hostile saves load as fresh, and blocked storage is fine', () => {
  const st = memory();
  st.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadSave(st).progress.upgrades, []);
  st.setItem(SAVE_KEY, JSON.stringify({ progress: { upgrades: ['hull', 'grabber', 'laser'], scanned: ['nope', 'clownfish', 5] }, paint: 'invisible', bests: { depth: 'deep' } }));
  const s = loadSave(st);
  assert.deepEqual(s.progress.upgrades, ['grabber', 'hull']);
  assert.deepEqual(s.progress.scanned, ['clownfish']);
  assert.equal(s.paint, 'classic');
  assert.equal(s.bests.depth, 0);
  assert.equal(loadSave(null).paint, 'classic');
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadSave(throwing).v, 1);
  assert.equal(writeSave(throwing, freshSave()), false);
});

test('a daily dive naming unknown creatures is rebuilt for the day', () => {
  const st = memory();
  st.setItem(SAVE_KEY, JSON.stringify({ daily: { date: '2026-10-02', goals: ['not-a-fish', 'clownfish', 'x'], done: ['clownfish'], complete: true } }));
  const s = loadSave(st);
  assert.deepEqual(s.daily.goals, []);
  assert.equal(s.daily.complete, false);
  assert.equal(ensureDaily(s, '2026-10-02'), true);
  assert.equal(s.daily.goals.length, 3);
  for (const id of s.daily.goals) assert.ok(SPECIES.some((sp) => sp.id === id), id);
  const good = freshSave();
  ensureDaily(good, '2026-10-02');
  good.daily.done = [good.daily.goals[0]];
  st.setItem(SAVE_KEY, JSON.stringify(good));
  assert.deepEqual(loadSave(st).daily, good.daily, 'a healthy daily dive is kept');
});

test('the revealed map packs into a short string and back', () => {
  const bits = new Uint8Array(16500);
  for (let i = 0; i < bits.length; i += 7) bits[i] = 1;
  const text = encodeBits(bits);
  assert.ok(text.length < 3000);
  assert.deepEqual(decodeBits(text, bits.length), bits);
  assert.equal(decodeBits('', 10).length, 10);
  assert.equal(decodeBits('%%%', 10).reduce((a, b) => a + b, 0), 0);
});

test('dates: keys and the day before, across months and years', () => {
  assert.equal(dateKey(new Date(2026, 9, 1)), '2026-10-01');
  assert.equal(previousDay('2026-10-01'), '2026-09-30');
  assert.equal(previousDay('2027-01-01'), '2026-12-31');
  assert.equal(previousDay('2028-03-01'), '2028-02-29');
});

test('daily goals are deterministic and only use areas the player can reach', () => {
  const a = dailyGoals('2026-10-01', 0), b = dailyGoals('2026-10-01', 0);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  for (let stage = 0; stage <= 5; stage++) {
    for (let d = 1; d <= 28; d++) {
      const goals = dailyGoals(`2026-11-${String(d).padStart(2, '0')}`, stage);
      for (const id of goals) assert.ok(AREA_STAGE[SPECIES.find((s) => s.id === id).area] <= stage, `${id} at stage ${stage}`);
    }
  }
  assert.notDeepEqual(dailyGoals('2026-10-01', 0), dailyGoals('2026-10-02', 0));
});

test('completing daily dives builds a streak; a missed day starts again at one', () => {
  const s = freshSave();
  const finish = (key) => {
    ensureDaily(s, key);
    s.daily.time = 120;
    let r;
    for (const g of [...s.daily.goals]) r = recordDailyScan(s, key, g);
    return r;
  };
  let r = finish('2026-10-01');
  assert.ok(r.completed);
  assert.equal(r.streak, 1);
  assert.equal(s.bests.dailyTime, 120);
  r = finish('2026-10-02');
  assert.equal(r.streak, 2);
  assert.equal(currentStreak(s, '2026-10-03'), 2, 'still standing the next day');
  r = finish('2026-10-04');
  assert.equal(r.streak, 1, 'missed a day');
  assert.equal(s.streak.best, 2);
  assert.equal(currentStreak(s, '2026-10-09'), 0);
  assert.equal(s.stats.dailyDone, 3);
});

test('daily scans ignore other species and repeats', () => {
  const s = freshSave();
  ensureDaily(s, '2026-10-05');
  const other = SPECIES.find((sp) => !s.daily.goals.includes(sp.id)).id;
  assert.equal(recordDailyScan(s, '2026-10-05', other).progressed, false);
  const g = s.daily.goals[0];
  assert.equal(recordDailyScan(s, '2026-10-05', g).progressed, true);
  assert.equal(recordDailyScan(s, '2026-10-05', g).progressed, false);
  assert.equal(dailyRemaining(s).length, 2);
  // Same day keeps the goals even after progress changes.
  const goals = s.daily.goals.slice();
  s.progress.upgrades = ['grabber', 'drill', 'lights'];
  assert.equal(ensureDaily(s, '2026-10-05'), false);
  assert.deepEqual(s.daily.goals, goals);
  assert.equal(ensureDaily(s, '2026-10-06'), true);
});

test('paint jobs unlock from milestones and are reported once', () => {
  const s = freshSave();
  assert.equal(PAINTS.filter((p) => paintUnlocked(s, p)).length, 1);
  assert.deepEqual(newPaints(s), []);
  s.progress.scanned = SPECIES.slice(0, 5).map((x) => x.id);
  s.progress.shells = ['s01'];
  const fresh = newPaints(s).map((p) => p.id);
  assert.deepEqual(fresh.sort(), ['mint', 'sunset']);
  assert.deepEqual(newPaints(s), []);
  s.progress.scanned = SPECIES.map((x) => x.id);
  assert.ok(paintUnlocked(s, PAINTS.find((p) => p.id === 'rainbow')));
  assert.equal(new Set(PAINTS.map((p) => p.id)).size, PAINTS.length);
  assert.ok(PAINTS.length >= 10);
});

test('dives record personal bests', () => {
  const s = freshSave();
  assert.deepEqual(recordDive(s, { maxDepth: 120, scans: 3 }), ['depth', 'diveScans']);
  assert.deepEqual(recordDive(s, { maxDepth: 80, scans: 1 }), []);
  assert.equal(s.bests.depth, 120);
  assert.equal(s.stats.dives, 2);
});

test('encyclopedia completion is counted per area', () => {
  const s = freshSave();
  s.progress.scanned = ['clownfish', 'dolphin', 'octopus'];
  const c = areaCompletion(s);
  assert.equal(c.length, 7);
  assert.equal(c[0].got, 2);
  assert.equal(c[2].got, 1);
  assert.equal(c.reduce((n, a) => n + a.total, 0), SPECIES.length);
});
