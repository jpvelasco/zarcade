import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, normalize, recordWin, totalStars, levelOpen, worldOpen, nextLevel, unlocked, recordDaily,
  liveStreak, BUGS, PAINTS, TOPPERS, WORLD_UNLOCK,
} from '../src/progress.js';
import { WORLDS, LEVELS } from '../src/levels.js';

const win = (s, id, tiles, par, extra = {}) => recordWin(s, id, { tiles, par, features: {}, ...extra });

test('normalize survives junk and keeps good data', () => {
  assert.deepEqual(normalize(null), newState());
  assert.deepEqual(normalize('nope'), newState());
  const s = normalize({
    levels: { '1-1': { stars: 9, best: 3 }, bad: 'x' },
    bugs: { bonk: true, nonsense: true },
    paint: 'gold', topper: 'nope',
    settings: { speed: 3, muted: 1 },
    custom: [{ code: 'RR1.x', name: 'a' }, { nope: 1 }],
    drafts: { '1-1': { main: 'F', p1: '' }, '1-2': { main: 5 } },
  });
  assert.equal(s.levels['1-1'].stars, 3);
  assert.equal(s.levels.bad, undefined);
  assert.deepEqual(Object.keys(s.bugs), ['bonk']);
  assert.equal(s.paint, 'gold');
  assert.equal(s.topper, 'ball');
  assert.equal(s.settings.speed, 1);
  assert.equal(s.settings.muted, true);
  assert.equal(s.custom.length, 1);
  assert.deepEqual(Object.keys(s.drafts), ['1-1']);
});

test('wins keep the best stars and tile count', () => {
  const s = newState();
  let r = win(s, '1-1', 5, 3);
  assert.equal(r.stars, 2);
  r = win(s, '1-1', 3, 3);
  assert.equal(r.stars, 3);
  assert.equal(r.newBest, true);
  r = win(s, '1-1', 9, 3);
  assert.equal(s.levels['1-1'].stars, 3);
  assert.equal(s.levels['1-1'].best, 3);
  assert.equal(totalStars(s), 3);
});

test('levels open one skip ahead; worlds open after six wins', () => {
  const s = newState();
  assert.equal(levelOpen(s, '1-1'), true);
  assert.equal(levelOpen(s, '1-2'), false);
  win(s, '1-1', 3, 3);
  assert.equal(levelOpen(s, '1-2'), true);
  assert.equal(levelOpen(s, '1-3'), true, 'one skip allowed');
  assert.equal(levelOpen(s, '1-4'), false);
  assert.equal(worldOpen(s, 2), false);
  for (const id of WORLDS[0].levels.slice(0, WORLD_UNLOCK)) win(s, id, 20, 3);
  assert.equal(worldOpen(s, 2), true);
  assert.equal(levelOpen(s, '2-1'), true);
  assert.equal(nextLevel(s, '1-6'), '1-7');
});

test('bugs are awarded for the ideas used and the milestones reached', () => {
  const s = newState();
  const r = win(s, '2-1', 3, 3, { features: { repeat: true, nested: true, call: true, recursion: true, colour: true }, firstRun: true, editedWhilePaused: true });
  assert.deepEqual(r.bugs.sort(), ['colour', 'first', 'fix', 'loop', 'nest', 'proc', 'recur'].sort());
  assert.deepEqual(win(s, '2-2', 2, 3).bugs, ['clever']);
  assert.equal(BUGS.length, 18);
  for (const id of WORLDS[0].levels) win(s, id, 1, 30);
  assert.ok(s.bugs.perfect && s.bugs.world);
});

test('unlocks follow stars, worlds, dailies and building', () => {
  const s = newState();
  assert.deepEqual(unlocked(s), { paints: ['teal'], toppers: ['ball'] });
  const r = win(s, '1-1', 3, 3);
  assert.deepEqual(r.unlocks, []);
  for (const id of WORLDS[0].levels) win(s, id, 1, 30);
  const u = unlocked(s);
  assert.ok(u.paints.includes('sunny'));
  assert.ok(u.toppers.includes('spring') && u.toppers.includes('star'));
  assert.equal(PAINTS.length, 8);
  assert.equal(TOPPERS.length, 8);
  const d = recordWin(s, 'daily-2026-10-01', { tiles: 4, par: 4, daily: '2026-10-01' });
  assert.ok(d.bugs.includes('daily'));
  assert.ok(d.unlocks.some((x) => x.id === 'mint'));
  assert.equal(s.levels['daily-2026-10-01'], undefined, 'dailies are not campaign levels');
  s.built = 1;
  assert.ok(unlocked(s).toppers.includes('dish'));
});

test('daily streaks count consecutive days and forgive nothing else', () => {
  const s = newState();
  recordDaily(s, '2026-10-01', 3);
  recordDaily(s, '2026-10-01', 2);
  assert.equal(s.daily.count, 1);
  assert.equal(s.daily.done['2026-10-01'], 3);
  recordDaily(s, '2026-10-02', 1);
  recordDaily(s, '2026-10-03', 1);
  assert.equal(s.daily.streak, 3);
  assert.equal(liveStreak(s, '2026-10-04'), 3);
  assert.equal(liveStreak(s, '2026-10-06'), 0);
  recordDaily(s, '2026-10-06', 1);
  assert.equal(s.daily.streak, 1);
  assert.equal(s.daily.best, 3);
});

test('every level belongs to a world', () => {
  assert.equal(WORLDS.reduce((n, w) => n + w.levels.length, 0), LEVELS.length);
});
