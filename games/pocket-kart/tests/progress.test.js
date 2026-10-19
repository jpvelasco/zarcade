import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, claimUnlocks, defaultSave, isCupOpen, isKartUnlocked, isRacerUnlocked, loadSave, recordCup,
  recordMedal, recordTrackTimes, sanitize, trophyForPlace, unlockHint, writeSave,
} from '../src/progress.js';
import { KARTS, RACERS } from '../src/karts.js';
import { encodeGhost } from '../src/ghost.js';
import { memoryStorage } from './helpers.js';

test('a missing, blocked or garbage save loads as a fresh one', () => {
  assert.deepEqual(loadSave(memoryStorage()), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
  assert.deepEqual(loadSave({ getItem() { throw new Error('blocked'); } }), defaultSave());
  assert.deepEqual(loadSave(memoryStorage({ [SAVE_KEY]: '{not json' })), defaultSave());
  assert.deepEqual(loadSave(memoryStorage({ [SAVE_KEY]: '[1,2]' })), defaultSave());
});

test('one damaged field keeps its default; the rest survive', () => {
  const g = encodeGhost([0, 0, 0, 1, 1, 0.1, 2, 2, 0.2]);
  const save = sanitize({
    racer: 'dragon', kart: 'zoomer', classId: 'warp',
    trophies: { 'toybox:zippy': 3, 'toybox:cosy': 9, 'candy:turbo': '2', 'nope:zippy': 1 },
    cupsFinished: { toybox: true, candy: 'yes' },
    best: { 'toybox-speedway': { lap: 21.5, race: NaN }, 'block-tower-bend': { lap: -4 }, 'fake-track': { lap: 20 } },
    medals: { 'toybox-speedway': 2, 'crayon-curves': 7 },
    ghosts: { 'toybox-speedway': g, 'crayon-curves': '%%%' },
    daily: { day: '2026-10-09', best: 33.3, streak: 'many', bestStreak: 4, lastDay: 'yesterday', plays: 2.7 },
    settings: { muted: 'yes', music: false, camera: 'spin', easyDrift: false },
    stats: { races: -5, wins: 3 },
    announced: ['kart:zoomer', 5, 'x'.repeat(100)],
  });
  assert.equal(save.racer, 'bun');
  assert.equal(save.kart, 'zoomer', 'unlocked by the Toybox trophy');
  assert.equal(save.classId, 'cosy');
  assert.deepEqual(save.trophies, { 'toybox:zippy': 3 });
  assert.deepEqual(save.cupsFinished, { toybox: true });
  assert.deepEqual(save.best, { 'toybox-speedway': { lap: 21.5, race: null } });
  assert.deepEqual(save.medals, { 'toybox-speedway': 2 });
  assert.deepEqual(Object.keys(save.ghosts), ['toybox-speedway']);
  assert.equal(save.daily.best, 33.3);
  assert.equal(save.daily.streak, 0);
  assert.equal(save.daily.bestStreak, 4);
  assert.equal(save.daily.lastDay, '');
  assert.equal(save.daily.plays, 2);
  assert.equal(save.settings.muted, false);
  assert.equal(save.settings.music, false);
  assert.equal(save.settings.camera, 'follow');
  assert.equal(save.settings.easyDrift, false);
  assert.equal(save.stats.races, 0);
  assert.equal(save.stats.wins, 3);
  assert.deepEqual(save.announced, ['kart:zoomer']);
  for (const v of Object.values(save.stats)) assert.ok(Number.isFinite(v));
});

test('a cup in progress is kept only when every part makes sense', () => {
  const gp = { cup: 1, classId: 'zippy', race: 2, racers: ['bun', 'fen', 'pip', 'bo', 'mimi', 'toto'], karts: ['buggy', 'buggy', 'bumble', 'chonk', 'swish', 'buggy'], points: [18, 10, 8, 6, 4, 2], places: [1, 3] };
  assert.deepEqual(sanitize({ gp }).gp, gp);
  assert.equal(sanitize({ gp: { ...gp, cup: 7 } }).gp, null);
  assert.equal(sanitize({ gp: { ...gp, racers: ['bun', 'bun', 'pip', 'bo', 'mimi', 'toto'] } }).gp, null);
  assert.equal(sanitize({ gp: { ...gp, points: [1, 2] } }).gp, null);
  assert.equal(sanitize({ gp: { ...gp, race: 4 } }).gp, null);
});

test('a locked kart or racer in the save falls back to a starter', () => {
  const save = sanitize({ kart: 'comet', racer: 'ollie' });
  assert.equal(save.kart, 'buggy');
  assert.equal(save.racer, 'bun');
  assert.equal(sanitize({ kart: 'bumble', racer: 'pip' }).kart, 'bumble');
});

test('saves round-trip through storage', () => {
  const store = memoryStorage();
  const save = defaultSave();
  save.trophies['candy:turbo'] = 2;
  save.settings.camera = 'fixed';
  assert.equal(writeSave(store, save), true);
  assert.deepEqual(loadSave(store), save);
  assert.equal(writeSave({ setItem() { throw new Error('full'); } }, save), false);
});

test('trophies: gold, silver, bronze for the podium; they only ever improve', () => {
  assert.deepEqual([1, 2, 3, 4, 6].map(trophyForPlace), [3, 2, 1, 0, 0]);
  const save = defaultSave();
  const r = recordCup(save, 0, 'cosy', 2);
  assert.equal(r.trophy, 2);
  assert.equal(r.firstFinish, true);
  assert.equal(r.opened.id, 'candy');
  recordCup(save, 0, 'cosy', 5);
  assert.equal(save.trophies['toybox:cosy'], 2);
  recordCup(save, 0, 'cosy', 1);
  assert.equal(save.trophies['toybox:cosy'], 3);
});

test('cups open in order by finishing, whatever the place', () => {
  const save = defaultSave();
  assert.equal(isCupOpen(save, 0), true);
  assert.equal(isCupOpen(save, 1), false);
  recordCup(save, 0, 'cosy', 6);
  assert.equal(isCupOpen(save, 1), true);
  assert.equal(isCupOpen(save, 2), false);
});

test('karts and racers unlock with plain goals, celebrated once', () => {
  const save = defaultSave();
  const startKarts = KARTS.filter((k) => isKartUnlocked(save, k)).map((k) => k.id);
  assert.deepEqual(startKarts, ['buggy', 'bumble']);
  assert.equal(RACERS.filter((r) => isRacerUnlocked(save, r)).length, 6);
  for (const k of KARTS.filter((x) => x.unlock)) assert.ok(unlockHint(k).length > 5, k.id);
  recordCup(save, 0, 'cosy', 3);
  assert.ok(isKartUnlocked(save, KARTS.find((k) => k.id === 'zoomer')));
  assert.deepEqual(claimUnlocks(save).sort(), ['cup:candy', 'kart:zoomer']);
  assert.deepEqual(claimUnlocks(save), []);
  for (const id of ['toybox-speedway', 'block-tower-bend', 'crayon-curves', 'train-set-twister']) recordMedal(save, id, 1);
  assert.ok(isRacerUnlocked(save, RACERS.find((r) => r.id === 'dot')));
  save.daily.plays = 3;
  assert.ok(isRacerUnlocked(save, RACERS.find((r) => r.id === 'ollie')));
  for (const c of [0, 1, 2]) recordCup(save, c, 'zippy', 1);
  assert.ok(isKartUnlocked(save, KARTS.find((k) => k.id === 'comet')));
});

test('best laps and race times only improve; the ghost follows the best lap', () => {
  const save = defaultSave();
  const r1 = recordTrackTimes(save, 'toybox-speedway', { lap: 22, race: 70, ghost: 'g1' });
  assert.ok(r1.lapBest && r1.raceBest && r1.firstTime);
  const r2 = recordTrackTimes(save, 'toybox-speedway', { lap: 23, race: 68, ghost: 'g2' });
  assert.ok(!r2.lapBest && r2.raceBest);
  assert.equal(save.ghosts['toybox-speedway'], 'g1');
  recordTrackTimes(save, 'toybox-speedway', { lap: 21.5, ghost: 'g3' });
  assert.equal(save.ghosts['toybox-speedway'], 'g3');
  assert.deepEqual(save.best['toybox-speedway'], { lap: 21.5, race: 68 });
  assert.equal(recordMedal(save, 'toybox-speedway', 2), true);
  assert.equal(recordMedal(save, 'toybox-speedway', 1), false);
});
