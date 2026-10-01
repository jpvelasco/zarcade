import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, defaultSave, recordMatch, hatUnlocked, nextHat, HATS, TROPHIES, SAVE_KEY, COLORS, FACES } from '../src/save.js';
import { Match } from '../src/match.js';

const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};

test('saves round-trip under the namespaced key', () => {
  const store = memory();
  const s = defaultSave();
  s.stars = 12; s.looks[1].hat = 3; s.settings.mode = 'koth'; s.muted = true;
  assert.ok(writeSave(store, s));
  assert.ok(SAVE_KEY in store.data);
  assert.equal(SAVE_KEY, 'bumper-blobs.v1');
  assert.deepEqual(loadSave(store), s);
});

test('corrupt, hostile or blocked storage falls back to defaults', () => {
  assert.deepEqual(loadSave(memory({ [SAVE_KEY]: '{oops' })), defaultSave());
  assert.deepEqual(loadSave(null), defaultSave());
  const thrower = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(thrower), defaultSave());
  assert.equal(writeSave(thrower, defaultSave()), false);
  const odd = loadSave(memory({ [SAVE_KEY]: JSON.stringify({ stars: -5, looks: [{ color: 99, face: -1, hat: 'x' }], stats: { bonks: 'lots', modes: [1, 'lbs'] }, trophies: ['fake', 'firstWin'] }) }));
  assert.equal(odd.stars, 0);
  assert.deepEqual(odd.looks[0], { color: 0, face: 0, hat: 0 });
  assert.equal(odd.stats.bonks, 0);
  assert.deepEqual(odd.stats.modes, ['lbs']);
  assert.deepEqual(odd.trophies, ['firstWin']);
});

test('looks data is complete', () => {
  assert.equal(COLORS.length, 8);
  assert.ok(FACES.length >= 6);
  assert.ok(HATS.length >= 8);
  assert.ok(HATS.every((h, i) => i === 0 || h.stars >= HATS[i - 1].stars), 'hat costs climb');
  assert.equal(new Set(TROPHIES.map((t) => t.id)).size, TROPHIES.length);
});

function finishedMatch(winner) {
  const m = new Match({ mode: 'lbs', target: { lbs: 1 } }, [{ bot: null }, { bot: 'hard' }], 1);
  const w = m.nextRound();
  w.blobs[0].stats.bonks = 4;
  w.result = { winner, ranking: [winner, 1 - winner] };
  m.endRound(w);
  return m;
}

test('a human win earns stars, trophies and unlocks hats', () => {
  const s = defaultSave();
  assert.ok(!hatUnlocked(s, 2));
  const res = recordMatch(s, finishedMatch(0), [0]);
  // 1 for playing, 1 round, 3 for the win, plus trophies (debut, win, bot buster).
  assert.equal(res.stars, 5 + 3 * 5);
  assert.deepEqual(res.newTrophies.map((t) => t.id).sort(), ['firstMatch', 'firstWin', 'hardWin']);
  assert.equal(s.stats.wins, 1);
  assert.equal(s.stats.bonks, 4);
  assert.ok(hatUnlocked(s, 2) && hatUnlocked(s, 5));
  assert.ok(res.newHats.length >= 4);
  assert.equal(nextHat(s).stars, HATS.find((h) => h.stars > s.stars).stars);
  // Trophies are only counted once.
  const again = recordMatch(s, finishedMatch(1), [0]);
  assert.equal(again.stars, 1);
});

test('bot-only matches do not change progress', () => {
  const s = defaultSave();
  const res = recordMatch(s, finishedMatch(0), []);
  assert.equal(res.stars, 0);
  assert.equal(s.stats.matches, 0);
});
