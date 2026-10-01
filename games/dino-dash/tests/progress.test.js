import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, defaultSave, loadSave, writeSave, buy, equip, upgradeBoost, boostPrice, recordRun, dailyStatus } from '../src/progress.js';
import { DINOS, HATS, BOOSTS, BOOST_MAX } from '../src/catalog.js';
import { dailyInfo, dateKey, previousKey } from '../src/daily.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test('a fresh save starts with Pip, no hat and nothing owed', () => {
  const s = loadSave(memoryStorage());
  assert.deepEqual(s, defaultSave());
  assert.equal(s.dino, 'pip');
  assert.deepEqual(s.hats, ['none', 'leaf']);
});

test('saves round-trip under the namespaced key', () => {
  const storage = memoryStorage();
  const s = defaultSave();
  s.coins = 321;
  s.best = 1234;
  s.dinos.push('trix');
  s.dino = 'trix';
  assert.ok(writeSave(storage, s));
  assert.ok(storage.map.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'dino-dash.v1');
  assert.deepEqual(loadSave(storage), s);
});

test('corrupt, blocked or tampered storage never breaks loading', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  assert.deepEqual(loadSave({ getItem() { throw new Error('blocked'); } }), defaultSave());
  const bad = memoryStorage();
  bad.setItem(SAVE_KEY, '{nope');
  assert.deepEqual(loadSave(bad), defaultSave());
  const odd = memoryStorage();
  odd.setItem(SAVE_KEY, JSON.stringify({ coins: -5, best: 'far', dino: 'sunny', dinos: ['dragon'], hats: ['crown'], hat: 'crown', boosts: { magnet: 99 } }));
  const s = loadSave(odd);
  assert.equal(s.coins, 0);
  assert.equal(s.dino, 'pip', 'can\'t wear a dino you never bought');
  assert.ok(s.hats.includes('crown'));
  assert.equal(s.hat, 'crown');
  assert.equal(s.boosts.magnet, BOOST_MAX);
  assert.equal(writeSave({ setItem() { throw new Error('full'); } }, s), false);
});

test('buying spends amber, unlocks and equips; you can\'t buy twice or overspend', () => {
  const s = defaultSave();
  const trix = DINOS.find((d) => d.id === 'trix');
  assert.equal(buy(s, 'dino', 'trix').reason, 'coins');
  s.coins = trix.price + 10;
  assert.ok(buy(s, 'dino', 'trix').ok);
  assert.equal(s.coins, 10);
  assert.equal(s.dino, 'trix');
  assert.equal(buy(s, 'dino', 'trix').reason, 'owned');
  assert.ok(equip(s, 'dino', 'pip'));
  assert.equal(equip(s, 'dino', 'sunny'), false);
  s.coins = 5000;
  assert.ok(buy(s, 'hat', 'crown').ok);
  assert.equal(s.hat, 'crown');
  assert.equal(buy(s, 'hat', 'nope').ok, false);
});

test('boosts upgrade five times and then stop', () => {
  const s = defaultSave();
  s.coins = 1e6;
  for (const b of BOOSTS) {
    for (let i = 0; i < BOOST_MAX; i++) assert.ok(upgradeBoost(s, b.id).ok);
    assert.equal(upgradeBoost(s, b.id).reason, 'max');
    assert.equal(boostPrice(s, b.id), null);
  }
});

test('prices are generous and rise along the shelf', () => {
  for (const list of [DINOS, HATS]) {
    for (let i = 1; i < list.length; i++) assert.ok(list[i].price >= list[i - 1].price);
  }
  assert.ok(DINOS[1].price <= 300, 'first new dino within a run or two');
  assert.ok(HATS.filter((h) => h.price > 0)[0].price <= 150);
});

test('runs bank amber and record bests; daily runs have their own board', () => {
  const s = defaultSave();
  let r = recordRun(s, { distance: 812.6, score: 2400, coins: 120 });
  assert.ok(r.newBest && r.newBestScore);
  assert.equal(s.best, 812);
  assert.equal(s.coins, 120);
  r = recordRun(s, { distance: 500, score: 100, coins: 30 });
  assert.equal(r.newBest, false);
  const daily = dailyInfo('2026-10-01');
  r = recordRun(s, { distance: 2000, score: 9000, coins: 10, daily });
  assert.equal(s.best, 812, 'daily runs leave the main best alone');
  assert.ok(r.dailyGoal);
  assert.equal(r.streak, 1);
  assert.equal(s.coins, 160 + daily.reward);
  r = recordRun(s, { distance: 3000, score: 9000, coins: 0, daily });
  assert.equal(r.dailyGoal, false, 'the daily reward pays once a day');
  assert.equal(s.daily.best, 3000);
});

test('the daily streak grows on consecutive days and quietly restarts after a gap', () => {
  const s = defaultSave();
  const day = (k) => recordRun(s, { distance: 5000, score: 1, coins: 0, daily: dailyInfo(k) });
  assert.equal(day('2026-09-29').streak, 1);
  assert.equal(day('2026-09-30').streak, 2);
  assert.equal(day('2026-10-01').streak, 3);
  assert.equal(dailyStatus(s, '2026-10-02').streak, 3, 'still alive the next day');
  assert.equal(dailyStatus(s, '2026-10-04').streak, 0);
  assert.equal(day('2026-10-05').streak, 1);
  assert.equal(dailyStatus(s, '2026-10-05').goalDone, true);
  assert.equal(dailyStatus(s, '2026-10-06').goalDone, false);
});

test('daily info is stable per date and varies across dates', () => {
  assert.deepEqual(dailyInfo('2026-10-01'), dailyInfo('2026-10-01'));
  const seeds = new Set();
  const themes = new Set();
  for (let i = 1; i <= 28; i++) {
    const info = dailyInfo(`2026-02-${String(i).padStart(2, '0')}`);
    seeds.add(info.seed);
    themes.add(info.theme);
    assert.ok(info.goal >= 700 && info.goal <= 1400);
  }
  assert.equal(seeds.size, 28);
  assert.ok(themes.size >= 4);
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(previousKey('2026-01-01'), '2025-12-31');
  assert.equal(previousKey('2024-03-01'), '2024-02-29');
});
