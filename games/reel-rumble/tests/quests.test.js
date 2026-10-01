import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, openQuests, settleQuests, questProgress, TOURNAMENTS, tournamentResult, tournamentCount, newTournament, awardMedal, TOURNAMENT_FISH } from '../src/quests.js';
import { FISH_BY_ID, fishOfWater } from '../src/data.js';
import { defaultSave, recordCatch } from '../src/progress.js';

const catchOf = (id, kg = 1) => ({ fish: FISH_BY_ID[id], cm: 20, kg, coins: 5 });

test('quest data is linked up', () => {
  const ids = new Set(QUESTS.map((q) => q.id));
  assert.equal(ids.size, QUESTS.length);
  for (const q of QUESTS) {
    if (q.after) assert.ok(ids.has(q.after), q.id);
    assert.ok(q.reward > 0 && (q.event || q.progress), q.id);
  }
  for (const t of TOURNAMENTS) {
    assert.ok(ids.has(t.needs), t.id);
    assert.equal(t.rivals.length, 3);
    for (let i = 1; i < 3; i++) assert.ok(t.rivals[i][1] > t.rivals[i - 1][1]);
  }
});

test('the first catch finishes the first quest and opens the next ones', () => {
  const s = defaultSave();
  assert.deepEqual(openQuests(s).map((q) => q.id), ['first']);
  recordCatch(s, catchOf('bluegill'));
  const done = settleQuests(s, { result: catchOf('bluegill'), water: 'pond', period: 'day', weather: 'clear' });
  assert.deepEqual(done.map((q) => q.id), ['first']);
  assert.equal(s.coins, 5 + 20);
  assert.ok(openQuests(s).some((q) => q.id === 'pond4'));
  assert.ok(openQuests(s).some((q) => q.id === 'night'));
});

test('event quests need the right moment; chains settle in one go', () => {
  const s = defaultSave();
  for (const f of fishOfWater('pond').slice(0, 4)) recordCatch(s, catchOf(f.id, 2.5));
  const done = settleQuests(s, { result: catchOf('bluegill'), water: 'pond', period: 'night', weather: 'rain' });
  const ids = done.map((q) => q.id);
  for (const id of ['first', 'pond4', 'night', 'big', 'rain']) assert.ok(ids.includes(id), id);
  assert.deepEqual(questProgress(s, QUESTS.find((q) => q.id === 'river5')), [0, 5]);
  assert.equal(settleQuests(s, null).length, 0, 'nothing twice');
});

test('tournaments: medals by rivals beaten, prizes only for upgrades', () => {
  const t = TOURNAMENTS[0];
  const run = newTournament(t);
  for (let i = 0; i < TOURNAMENT_FISH - 1; i++) assert.equal(tournamentCount(run, catchOf('carp', 1)), false);
  assert.equal(tournamentCount(run, { fish: FISH_BY_ID.carp, lost: 'snapped' }), true, 'lost fish count too');
  assert.equal(run.kg, 4);
  const r = tournamentResult(t, run.kg);
  assert.equal(r.medal, 'silver');
  assert.equal(r.table[r.place].you, true);
  const s = defaultSave();
  assert.equal(awardMedal(s, t, r), t.prizes.silver);
  assert.equal(awardMedal(s, t, tournamentResult(t, 1.5)), 0, 'bronze after silver pays nothing');
  assert.equal(s.medals[t.id], 'silver');
  assert.equal(awardMedal(s, t, tournamentResult(t, 50)), t.prizes.gold - t.prizes.silver);
  assert.equal(tournamentResult(t, 0.2).medal, null);
});
