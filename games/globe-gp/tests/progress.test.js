import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, defaultSave, loadSave, writeSave, sanitize, totalStars, carStatus, buyCar, buyUpgrade, upgradeCost,
  recordRace, recordCup, recordTimeTrial, medalFor, encodeGhost, decodeGhost, saveGhost, loadGhost, cupUnlocked,
  ROSTER, sanitizeCup, settleCup, adoptSave,
} from '../src/progress.js';
import { CUPS, newCup, applyResult } from '../src/championship.js';

function memory() {
  const data = new Map();
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('save and load round-trip under the namespaced key', () => {
  const store = memory();
  const s = defaultSave();
  s.coins = 321; s.owned.push('bug'); s.car = 'bug'; s.cupStars.sunrise = 2; s.difficulty = 'hard';
  s.upgrades.bug = { engine: 2, grip: 0, boost: 1 }; s.best['paris-circuit:circuit'] = 98.5;
  assert.ok(writeSave(store, s));
  assert.ok(store.data.has(SAVE_KEY));
  assert.equal(SAVE_KEY, 'globe-gp.v1');
  assert.deepEqual(loadSave(store), s);
});

test('missing, corrupt or blocked storage falls back to defaults', () => {
  assert.deepEqual(loadSave(memory()), defaultSave());
  const store = memory();
  store.setItem(SAVE_KEY, '{nope');
  assert.deepEqual(loadSave(store), defaultSave());
  assert.deepEqual(loadSave(broken), defaultSave());
  assert.equal(writeSave(broken, defaultSave()), false);
});

test('sanitize drops invalid values', () => {
  const s = sanitize({ coins: -5, owned: ['bug', 'tank'], car: 'tank', cupStars: { sunrise: 9, fake: 2 }, difficulty: 'insane', upgrades: { bug: { engine: 99 } }, muted: 'yes', liveries: { bug: 40 } });
  assert.equal(s.coins, 0);
  assert.deepEqual(s.owned, ['kart', 'hatch', 'bug']);
  assert.equal(s.car, 'hatch');
  assert.deepEqual(s.cupStars, {});
  assert.equal(s.difficulty, 'easy');
  assert.deepEqual(s.upgrades.bug, {});
  assert.equal(s.muted, false);
  assert.deepEqual(s.liveries, {});
});

test('a damaged cup in progress is dropped instead of crashing the World Tour', () => {
  const good = applyResult(newCup('sunrise', ROSTER), ROSTER);
  assert.deepEqual(sanitizeCup(JSON.parse(JSON.stringify(good))), good);
  const damaged = [
    { ...good, places: {} },
    { ...good, points: { player: 10 } },
    { ...good, round: 9 },
    { ...good, round: -1 },
    { ...good, round: 2 },
    { ...good, points: { ...good.points, player: 'lots' } },
    { ...good, places: { ...good.places, yuki: 5 } },
    { ...good, places: { ...good.places, yuki: [0] } },
    { ...good, cupId: 'moon' },
    'cup',
  ];
  for (const cup of damaged) {
    assert.equal(sanitizeCup(cup), null, JSON.stringify(cup));
    assert.equal(sanitize({ coins: 7, cup }).cup, null);
    assert.equal(sanitize({ coins: 7, cup }).coins, 7, 'the rest of the save survives');
  }
  // Unknown keys never reach the standings table.
  const extra = sanitizeCup({ ...good, points: { ...good.points, ghost: 3 }, places: { ...good.places, ghost: [1] } });
  assert.deepEqual(Object.keys(extra.points), ROSTER);
});

test('a finished cup is awarded even if the trophy screen was never opened', () => {
  const s = defaultSave();
  s.cup = newCup('sunrise', ROSTER);
  for (let i = 0; i < CUPS[0].races.length - 1; i++) applyResult(s.cup, ROSTER);
  assert.equal(settleCup(s), null, 'not finished yet');
  applyResult(s.cup, ROSTER);
  // Saved after the last race, then the tab was closed.
  const store = memory();
  writeSave(store, s);
  const loaded = loadSave(store);
  assert.equal(loaded.cup.round, CUPS[0].races.length, 'a finished cup survives loading');
  const res = settleCup(loaded);
  assert.equal(res.place, 1);
  assert.equal(res.stars, 3);
  assert.equal(loaded.cupStars.sunrise, 3);
  assert.equal(loaded.coins, 150);
  assert.equal(loaded.cup, null);
  assert.equal(settleCup(loaded), null, 'awarded once');
});

test('adopting another tab\'s save replaces this tab\'s copy in place', () => {
  const mine = defaultSave();
  const ref = mine;
  mine.coins = 5;
  const theirs = sanitize({ coins: 420, wins: 3, owned: ['bug'] });
  adoptSave(mine, theirs);
  assert.equal(ref, mine);
  assert.equal(mine.coins, 420);
  assert.equal(mine.wins, 3);
  assert.ok(mine.owned.includes('bug'));
});

test('stars unlock cups and cars; coins buy cars and upgrades', () => {
  const s = defaultSave();
  assert.ok(cupUnlocked(s, CUPS[0]));
  assert.ok(!cupUnlocked(s, CUPS[1]));
  assert.equal(carStatus(s, 'bug').starsOk, false);
  s.coins = 1000;
  assert.equal(buyCar(s, 'bug'), false, 'needs a star first');
  recordCup(s, 'sunrise', 2);
  assert.equal(totalStars(s), 2);
  assert.ok(cupUnlocked(s, CUPS[1]));
  assert.ok(buyCar(s, 'bug'));
  assert.equal(s.car, 'bug');
  const coins = s.coins;
  const cost = upgradeCost(s, 'bug', 'engine');
  assert.ok(buyUpgrade(s, 'bug', 'engine'));
  assert.equal(s.coins, coins - cost);
  assert.equal(s.upgrades.bug.engine, 1);
  s.coins = 0;
  assert.equal(buyUpgrade(s, 'bug', 'engine'), false);
  assert.equal(buyUpgrade(s, 'sports', 'engine'), false, 'cannot upgrade a car you do not own');
});

test('recording races, cups and time trials', () => {
  const s = defaultSave();
  let r = recordRace(s, { trackId: 'paris-circuit', kind: 'circuit', place: 1, time: 100, coins: 5, earned: 60 });
  assert.ok(r.newBest);
  assert.equal(s.coins, 65);
  r = recordRace(s, { trackId: 'paris-circuit', kind: 'circuit', place: 3, time: 110 });
  assert.equal(r.newBest, false);
  assert.equal(s.wins, 1);
  assert.equal(s.races, 2);
  const cup = recordCup(s, 'sunrise', 1);
  assert.equal(cup.stars, 3);
  assert.equal(recordCup(s, 'sunrise', 3).newStars, 0, 'a worse finish keeps the best stars');
  assert.equal(s.cupStars.sunrise, 3);
  const medals = { gold: 40, silver: 45, bronze: 50 };
  assert.equal(medalFor(39, medals), 'gold');
  assert.equal(medalFor(47, medals), 'bronze');
  assert.equal(medalFor(60, medals), null);
  const tt = recordTimeTrial(s, 'paris-circuit', 39, 'gold');
  assert.equal(tt.newMedal, 'gold');
  assert.equal(totalStars(s), 4, 'gold medals add a star');
  assert.equal(recordTimeTrial(s, 'paris-circuit', 44, 'silver').newMedal, null);
});

test('ghost frames survive encoding within a few centimetres', () => {
  const frames = new Float32Array(4 * 500);
  for (let i = 0; i < 500; i++) frames.set([Math.sin(i) * 300, 2 + Math.cos(i), i * 0.8 - 200, (i * 0.1) % 6], i * 4);
  const back = decodeGhost(encodeGhost(frames, 42.5));
  assert.equal(back.lap, 42.5);
  assert.equal(back.frames.length, frames.length);
  for (let i = 0; i < frames.length; i++) {
    const k = i % 4;
    const diff = k === 3 ? Math.abs(Math.atan2(Math.sin(back.frames[i] - frames[i]), Math.cos(back.frames[i] - frames[i]))) : Math.abs(back.frames[i] - frames[i]);
    assert.ok(diff < 0.1, `frame value ${i}`);
  }
  assert.equal(decodeGhost('garbage'), null);
  const store = memory();
  assert.ok(saveGhost(store, 'tokyo-circuit', { frames, lap: 40 }));
  assert.ok([...store.data.keys()][0].startsWith('globe-gp.v1.'));
  assert.equal(loadGhost(store, 'tokyo-circuit').lap, 40);
  assert.equal(loadGhost(broken, 'x'), null);
  assert.equal(saveGhost(broken, 'x', { frames, lap: 1 }), false);
});
