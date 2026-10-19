import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, currentFold, currentPaper, emptySave, entryFor, formatDistance, formatTime,
  freshenDaily, loadSave, nextRouteIndex, recordEndless, recordRun, refreshStamps, regionOpen,
  routeOpen, stats, totals, writeSave,
} from '../src/progress.js';
import { FOLDS, PAPERS, STAMPS, earnedStamps, meetsNeed, nextStamp, unlockedFolds, unlockedPapers } from '../src/catalog.js';
import { REGIONS, ROUTES } from '../src/routes.js';

function fakeStore() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function routeResult(routeId, over = {}) {
  return {
    routeId,
    endless: false,
    outcome: 'landed',
    stars: 3,
    letters: 2,
    letterTotal: 2,
    rings: 5,
    ringTotal: 5,
    snaps: 2,
    thermals: 3,
    soft: true,
    bullseye: false,
    landSpeed: 11,
    time: 60,
    distance: 800,
    score: 1500,
    peakSoak: 0,
    ...over,
  };
}

test('an empty save reads back as empty, and bad data is ignored', () => {
  assert.deepEqual(loadSave(null), emptySave());
  const store = fakeStore();
  store.setItem(SAVE_KEY, 'not json');
  assert.deepEqual(loadSave(store), emptySave());
  store.setItem(SAVE_KEY, JSON.stringify({ v: 99 }));
  assert.deepEqual(loadSave(store), emptySave());
});

test('a save survives a round trip, and writing to a blocked store is harmless', () => {
  const store = fakeStore();
  const save = emptySave();
  save.fold = 'crane';
  recordRun(save, routeResult('town-1'));
  writeSave(store, save);
  const back = loadSave(store);
  assert.deepEqual(back.routes, save.routes);
  assert.equal(back.fold, 'crane');
  const angry = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(angry), emptySave());
  assert.doesNotThrow(() => writeSave(angry, save));
});

test('a run keeps the best of everything', () => {
  const save = emptySave();
  recordRun(save, routeResult('town-1', { stars: 2, time: 70, letters: 1, rings: 3, soft: false }));
  let entry = entryFor(save, 'town-1');
  assert.equal(entry.stars, 2);
  assert.equal(entry.best, 70);
  const second = recordRun(save, routeResult('town-1', { stars: 3, time: 64, letters: 2, rings: 5, soft: true, bullseye: true }));
  entry = entryFor(save, 'town-1');
  assert.equal(entry.stars, 3);
  assert.equal(entry.best, 64);
  assert.ok(entry.soft && entry.bullseye);
  assert.ok(second.record, 'a faster time is a record');
  const third = recordRun(save, routeResult('town-1', { stars: 1, time: 90, letters: 0, rings: 0, soft: false }));
  assert.equal(entryFor(save, 'town-1').best, 64, 'a slower run does not spoil the best');
  assert.equal(entryFor(save, 'town-1').letters, 2);
  assert.ok(!third.record);
});

test('a failed run still counts its letters but does not open the route', () => {
  const save = emptySave();
  recordRun(save, routeResult('town-1', { outcome: 'water', stars: 0, letters: 1, rings: 2, soft: false }));
  assert.equal(entryFor(save, 'town-1').done, false);
  assert.equal(save.lifetime.letters, 1);
  assert.equal(save.lifetime.rings, 2);
  assert.equal(stats(save).routes, 0);
});

test('routes open one at a time, and a region opens with enough stars', () => {
  const save = emptySave();
  assert.ok(routeOpen(save, 0));
  assert.ok(!routeOpen(save, 1));
  recordRun(save, routeResult(ROUTES[0].id));
  assert.ok(routeOpen(save, 1));
  assert.equal(nextRouteIndex(save), 1);
  // Region 2 is gated by stars, not by the route before it.
  const firstOfRegion1 = ROUTES.findIndex((route) => route.region === 1);
  assert.ok(!regionOpen(save, 1));
  assert.ok(!routeOpen(save, firstOfRegion1));
  for (let i = 0; i < 4; i += 1) recordRun(save, routeResult(ROUTES[i].id));
  assert.ok(stats(save).stars >= REGIONS[1].needStars);
  assert.ok(regionOpen(save, 1));
  assert.ok(routeOpen(save, firstOfRegion1), 'the first route of an open region is always open');
});

test('stars and letters add up across the whole round', () => {
  const save = emptySave();
  for (const route of ROUTES.slice(0, 5)) recordRun(save, routeResult(route.id));
  const sums = totals(save);
  assert.equal(sums.stars, 15);
  assert.equal(sums.routes, 5);
  assert.equal(sums.letters, 10);
  assert.equal(sums.maxStars, 135);
  assert.equal(sums.routeCount, 45);
  assert.equal(sums.stampCount, STAMPS.length);
});

test('endless records the furthest flight', () => {
  const save = emptySave();
  const first = recordEndless(save, { distance: 820, score: 900, letters: 3, rings: 6, snaps: 1, thermals: 4, soft: false, bullseye: false });
  assert.ok(first.record);
  assert.equal(save.endless.best, 820);
  const second = recordEndless(save, { distance: 500, score: 400, letters: 1, rings: 2, snaps: 0, thermals: 1, soft: false, bullseye: false });
  assert.ok(!second.record);
  assert.equal(save.endless.best, 820);
  assert.equal(save.endless.runs, 2);
});

test('the daily goal grows a streak, and a missed day resets it', () => {
  const save = emptySave();
  const monday = { key: '2026-10-01', goal: 700 };
  const tuesday = { key: '2026-10-02', goal: 700 };
  const thursday = { key: '2026-10-04', goal: 700 };
  const flight = (distance) => ({ distance, score: distance, letters: 1, rings: 1, snaps: 0, thermals: 1, soft: false, bullseye: false });

  let folded = recordEndless(save, flight(500), { daily: monday });
  assert.ok(!save.daily.done, 'short of the goal');
  assert.ok(folded.dailyRecord);
  folded = recordEndless(save, flight(900), { daily: monday });
  assert.ok(folded.dailyWin);
  assert.equal(save.daily.streak, 1);
  folded = recordEndless(save, flight(1000), { daily: monday });
  assert.ok(!folded.dailyWin, 'a day only counts once');
  assert.equal(save.daily.wins, 1);

  recordEndless(save, flight(900), { daily: tuesday });
  assert.equal(save.daily.streak, 2);
  recordEndless(save, flight(900), { daily: thursday });
  assert.equal(save.daily.streak, 1, 'Wednesday was missed');

  freshenDaily(save, '2026-10-09');
  assert.equal(save.daily.streak, 0);
  assert.equal(save.daily.done, false);
  assert.equal(save.daily.key, '2026-10-09');
});

test('stamps are earned once and never taken away', () => {
  const save = emptySave();
  assert.deepEqual(save.stamps, []);
  const first = recordRun(save, routeResult('town-1', { letters: 1, snaps: 1, soft: true }));
  assert.ok(first.newStamps.includes('first-post'));
  assert.ok(first.newStamps.includes('route-1'));
  const again = refreshStamps(save);
  assert.deepEqual(again, [], 'nothing new the second time');
  const count = save.stamps.length;
  recordRun(save, routeResult('town-2'));
  assert.ok(save.stamps.length >= count);
  for (const id of save.stamps) assert.ok(STAMPS.some((stamp) => stamp.id === id));
});

test('every stamp is reachable and the album chases the nearest one', () => {
  for (const stamp of STAMPS) {
    assert.ok(stamp.need > 0, stamp.id);
    assert.ok(stamp.blurb.length > 8, stamp.id);
    assert.ok(['letters', 'routes', 'stars', 'rings', 'snaps', 'soft', 'thermals', 'distance', 'daily'].includes(stamp.kind), stamp.kind);
  }
  assert.equal(STAMPS.length, 30);
  const ids = new Set(STAMPS.map((s) => s.id));
  assert.equal(ids.size, STAMPS.length);
  const empty = stats(emptySave());
  const next = nextStamp(empty);
  assert.ok(next && next.left >= 1);
  const everything = { letters: 9999, routes: 99, stars: 999, rings: 9999, snaps: 9999, soft: 999, thermals: 9999, distance: 99999, daily: 99 };
  assert.equal(earnedStamps(everything).length, STAMPS.length);
  assert.equal(nextStamp(everything), null);
});

test('folds and papers unlock from lifetime numbers', () => {
  const empty = stats(emptySave());
  assert.equal(unlockedFolds(empty).length, 1, 'only the Classic Dart to start');
  assert.ok(unlockedPapers(empty).length >= 2);
  const loaded = { ...empty, stars: 999, letters: 999, snaps: 999, routes: 99, stamps: 99, rings: 999, soft: 99, distance: 99999, daily: 99 };
  assert.equal(unlockedFolds(loaded).length, FOLDS.length);
  assert.equal(unlockedPapers(loaded).length, PAPERS.length);
  for (const fold of FOLDS) if (fold.need) assert.ok(fold.need.label.length > 2, fold.id);
  for (const paper of PAPERS) if (paper.need) assert.ok(paper.need.label.length > 2, paper.id);
  assert.ok(meetsNeed(null, empty));
});

test('the chosen fold and paper come back from the save', () => {
  const save = emptySave();
  assert.equal(currentFold(save).id, 'dart');
  assert.equal(currentPaper(save).id, 'cream');
  save.fold = 'hawk';
  save.paper = 'gold';
  assert.equal(currentFold(save).id, 'hawk');
  assert.equal(currentPaper(save).id, 'gold');
  save.fold = 'nonsense';
  assert.equal(currentFold(save).id, 'dart', 'an unknown fold falls back');
});

test('times and distances are formatted for a results card', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(64.25), '1:04.3');
  assert.equal(formatTime(-5), '0:00.0');
  assert.equal(formatDistance(820), '820 m');
  assert.equal(formatDistance(1500), '1.50 km');
});
