import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSave, writeSave, defaultSave, SAVE_KEY, isMapUnlocked, recordCampaign, recordDaily, recordSkirmish,
  unlockedHeroes, unlockedColors, unlockedEmblems, previousDay, currentStreak, totalStars, activeHero, formatTime,
} from '../src/progress.js';
import { CAMPAIGN } from '../src/campaign.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('saves round-trip under the namespaced key and survive bad data', () => {
  const store = memoryStorage();
  const save = defaultSave();
  save.stars.m1 = 3;
  assert.equal(writeSave(store, save), true);
  assert.ok(store.data.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'tiny-kingdoms.v1');
  assert.equal(loadSave(store).stars.m1, 3);
  store.setItem(SAVE_KEY, '{nope');
  assert.deepEqual(loadSave(store), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(throwing), defaultSave());
  assert.equal(writeSave(throwing, save), false);
});

test('wrong-typed save fields are reset instead of breaking screens', () => {
  const store = memoryStorage();
  store.setItem(SAVE_KEY, JSON.stringify({
    stars: { m1: '3', m2: 2, m3: 99 }, goals: { m1: 5, m2: [1, 0] }, best: { m1: 'fast', m2: 41.5 },
    wins: 'lots', played: -2, color: 'nope', emblem: 7, hero: 'dragon',
    daily: { lastWin: 7, streak: 'a', bestStreak: null, best: [] },
    skirmish: { size: 'huge', rivals: 'x', difficulty: 'nightmare', seed: -1, best: { a: 3 } },
    seen: 5, muted: true,
  }));
  const save = loadSave(store);
  assert.deepEqual(save.stars, { m2: 2, m3: 3 });
  assert.deepEqual(save.goals, { m2: [true, false] });
  assert.deepEqual(save.best, { m2: 41.5 });
  assert.equal(save.wins, 0);
  assert.equal(save.played, 0);
  assert.equal(save.color, 'bluebell');
  assert.equal(save.emblem, 'crown');
  assert.equal(save.hero, null);
  assert.deepEqual(save.daily, { lastWin: null, streak: 0, bestStreak: 0, best: {} });
  assert.deepEqual(save.skirmish, { best: { a: 3 }, wins: 0, size: 'medium', rivals: 1, difficulty: 'normal' });
  assert.deepEqual(save.seen, {});
  assert.equal(save.muted, true);
  assert.equal(totalStars(save), 5);
  // Winning with the cleaned save works.
  const rec = recordCampaign(save, 0, { won: true, time: 60, sends: 3, lost: 0 });
  assert.ok(rec.stars >= 1);
  // A good save comes back unchanged.
  const good = defaultSave();
  good.stars.m1 = 2; good.goals.m1 = [true, false]; good.best.m1 = 88.2; good.wins = 4; good.hero = 'none';
  good.daily = { lastWin: '2026-10-01', streak: 2, bestStreak: 3, best: { '2026-10-01': 70 } };
  good.skirmish = { ...good.skirmish, seed: 1234, size: 'large', rivals: 3, difficulty: 'hard', best: { 'large-3-hard': 200 } };
  writeSave(store, good);
  assert.deepEqual(loadSave(store), good);
});

test('any win opens the next map; stars and bests only improve', () => {
  const save = defaultSave();
  assert.equal(isMapUnlocked(save, 1), false);
  const lose = recordCampaign(save, 0, { won: false, time: 50, sends: 3, lost: 1 });
  assert.equal(lose.stars, 0);
  assert.equal(isMapUnlocked(save, 1), false);
  const one = recordCampaign(save, 0, { won: true, time: 9999, sends: 999, lost: 4 });
  assert.equal(one.stars, 1);
  assert.equal(one.firstClear, true);
  assert.equal(isMapUnlocked(save, 1), true);
  const three = recordCampaign(save, 0, { won: true, time: 60, sends: 4, lost: 0 });
  assert.equal(three.stars, 3);
  assert.equal(three.newBest, true);
  const worse = recordCampaign(save, 0, { won: true, time: 500, sends: 99, lost: 2 });
  assert.equal(worse.stars, 3);
  assert.equal(save.stars.m1, 3);
  assert.equal(worse.newBest, false);
  assert.equal(save.best.m1, 60);
  assert.equal(totalStars(save), 3);
});

test('goals met in different wins add up', () => {
  const save = defaultSave();
  const [g1, g2] = CAMPAIGN[0].goals;
  assert.equal(g1.type, 'time');
  assert.equal(g2.type, 'keep');
  assert.equal(recordCampaign(save, 0, { won: true, time: 10, sends: 5, lost: 2 }).stars, 2); // fast
  const r = recordCampaign(save, 0, { won: true, time: 9999, sends: 5, lost: 0 }); // kept everything
  assert.equal(r.stars, 3);
  assert.equal(r.improved, true);
  assert.deepEqual(save.goals.m1, [true, true]);
  // A loss never counts goals.
  const s2 = defaultSave();
  recordCampaign(s2, 0, { won: false, time: 10, sends: 1, lost: 0 });
  assert.equal(s2.goals.m1, undefined);
});

test('heroes join as the campaign goes on', () => {
  const save = defaultSave();
  assert.deepEqual(unlockedHeroes(save), []);
  assert.equal(activeHero(save), null);
  let unlocks = [];
  for (let i = 0; i < 3; i++) unlocks = recordCampaign(save, i, { won: true, time: 100, sends: 10, lost: 0 }).unlocks;
  assert.deepEqual(unlockedHeroes(save), ['knight']);
  assert.ok(unlocks.some((u) => u.kind === 'hero' && u.id === 'knight'));
  assert.equal(activeHero(save), 'knight');
  save.hero = 'none';
  assert.equal(activeHero(save), null);
  for (let i = 3; i < CAMPAIGN.length; i++) recordCampaign(save, i, { won: true, time: 100, sends: 10, lost: 0 });
  assert.deepEqual(unlockedHeroes(save), ['knight', 'ranger', 'wizard', 'shepherd']);
});

test('colours and emblems unlock with stars, wins and streaks', () => {
  const save = defaultSave();
  assert.deepEqual(unlockedColors(save), ['bluebell']);
  assert.deepEqual(unlockedEmblems(save), ['crown']);
  for (let i = 0; i < 3; i++) recordCampaign(save, i, { won: true, time: 1, sends: 1, lost: 0 });
  assert.ok(unlockedColors(save).includes('clover'));
  assert.ok(unlockedEmblems(save).includes('star'));
  assert.ok(unlockedEmblems(save).includes('heart'));
});

test('the daily streak counts days in a row and forgives gaps', () => {
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
  const save = defaultSave();
  assert.equal(recordDaily(save, '2026-10-01', { won: true, time: 100 }).streak, 1);
  assert.equal(recordDaily(save, '2026-10-01', { won: true, time: 90 }).streak, 1); // same day again
  assert.equal(save.daily.best['2026-10-01'], 90);
  assert.equal(recordDaily(save, '2026-10-02', { won: true, time: 120 }).streak, 2);
  assert.equal(currentStreak(save, '2026-10-03'), 2);
  assert.equal(currentStreak(save, '2026-10-05'), 0);
  assert.equal(recordDaily(save, '2026-10-05', { won: true, time: 120 }).streak, 1);
  assert.equal(save.daily.bestStreak, 2);
  assert.ok(unlockedColors(save).includes('rose'));
});

test('skirmish bests per setting', () => {
  const save = defaultSave();
  recordSkirmish(save, 'small-1-easy', { won: true, time: 200 });
  const r = recordSkirmish(save, 'small-1-easy', { won: true, time: 150 });
  assert.equal(r.newBest, true);
  assert.equal(save.skirmish.best['small-1-easy'], 150);
  assert.equal(save.skirmish.wins, 2);
  assert.equal(formatTime(125.4), '2:05');
});
