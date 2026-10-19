const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/rules.js');
const { WORLDS, HOLES } = require('../src/holes.js');

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('score words and celebration tiers', () => {
  assert.equal(R.scoreName(1, 3).text, 'Hole in one!');
  assert.equal(R.scoreName(1, 3).tier, 4);
  assert.equal(R.scoreName(2, 4).text, 'Eagle!');
  assert.equal(R.scoreName(2, 3).text, 'Birdie!');
  assert.equal(R.scoreName(3, 3).tier, 1);
  assert.equal(R.scoreName(4, 3).text, 'Bogey');
  assert.equal(R.scoreName(7, 3).text, '+4');
  assert.equal(R.scoreName(8, 3, true).text, 'Picked up');
});

test('stars: 3 under par, 2 at par, 1 one over, 0 otherwise', () => {
  assert.equal(R.starsFor(2, 3), 3);
  assert.equal(R.starsFor(3, 3), 2);
  assert.equal(R.starsFor(4, 3), 1);
  assert.equal(R.starsFor(5, 3), 0);
  assert.equal(R.starsFor(2, 3, true), 0);
});

test('save round-trips under the namespaced key and survives junk', () => {
  const st = memoryStorage();
  const s = R.loadSave(st);
  assert.deepEqual(s, R.freshSave());
  s.muted = true;
  R.recordHole(s, HOLES[0], 3);
  assert.equal(R.writeSave(st, s), true);
  assert.ok(st.map.has('moonshot-golf.v1'));
  assert.equal(R.writeSave(null, s), false);
  assert.equal(R.writeSave({ setItem() { throw new Error('quota'); } }, s), false);
  assert.deepEqual(R.loadSave(st), s);
  assert.deepEqual(R.loadSave(memoryStorage({ 'moonshot-golf.v1': '{oops' })), R.freshSave());
  assert.deepEqual(R.loadSave(memoryStorage({ 'moonshot-golf.v1': '{"v":9}' })), R.freshSave());
  assert.deepEqual(R.loadSave(null), R.freshSave());
});

test('damaged save fields are dropped instead of blocking bests or unlocking worlds', () => {
  const raw = JSON.stringify({
    v: 1, muted: 'yes',
    best: { 'moon-1': null, 'moon-2': 'x', 'moon-3': 2.5, 'moon-4': -1, 'moon-5': 3 },
    rounds: { moon: 'abc', mars: 20 },
    completed: { moon: 'no', mars: true },
  });
  const s = R.loadSave(memoryStorage({ 'moonshot-golf.v1': raw }));
  assert.deepEqual(s, { v: 1, muted: false, best: { 'moon-5': 3 }, rounds: { mars: 20 }, completed: { mars: true } });
  assert.equal(R.recordHole(s, HOLES[0], 4).newBest, true, 'a junk best no longer blocks a real one');
  assert.equal(R.isWorldUnlocked(s, WORLDS, 1), false, '"no" does not count as finished');
  for (const bad of ['[]', '{"v":1,"best":[3],"rounds":"x","completed":7}']) {
    const t = R.loadSave(memoryStorage({ 'moonshot-golf.v1': bad }));
    assert.deepEqual([t.best, t.rounds, t.completed], [{}, {}, {}]);
  }
});

test('best scores only improve and pick-ups are never a best', () => {
  const s = R.freshSave();
  const h = HOLES[3];
  assert.equal(R.recordHole(s, h, 4).newBest, true);
  assert.equal(R.recordHole(s, h, 5).newBest, false);
  assert.equal(s.best[h.id], 4);
  const r = R.recordHole(s, h, 2);
  assert.equal(r.newBest, true);
  assert.equal(r.prev, 4);
  assert.equal(R.recordHole(s, HOLES[4], 8, true).newBest, false);
  assert.equal(s.best[HOLES[4].id], undefined);
});

test('worlds unlock one at a time as rounds are finished', () => {
  const s = R.freshSave();
  assert.equal(R.isWorldUnlocked(s, WORLDS, 0), true);
  assert.equal(R.isWorldUnlocked(s, WORLDS, 1), false);
  assert.equal(R.isWorldUnlocked(s, WORLDS, 2), false);
  R.recordRound(s, 'moon', 20);
  assert.equal(R.isWorldUnlocked(s, WORLDS, 1), true);
  assert.equal(R.isWorldUnlocked(s, WORLDS, 2), false);
  assert.equal(R.recordRound(s, 'moon', 22).newBest, false);
  assert.equal(s.rounds.moon, 20);
});

test('world stars add up best scores', () => {
  const s = R.freshSave();
  const moon = HOLES.filter((h) => h.world === 'moon');
  s.best[moon[0].id] = 1;
  s.best[moon[1].id] = moon[1].par;
  assert.equal(R.worldStars(s, moon), 5);
});
