import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSave, writeSave, defaultSave, recordRound, nextRival, liveStreak, buyItem, adaptFlick, rivalEase, SAVE_KEY } from '../src/save.js';
import { RIVALS } from '../src/rivals.js';
import { BALLS, COURT_ITEMS, itemState } from '../src/cosmetics.js';
import { progressMissions, freshMissions, MISSIONS } from '../src/missions.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('saves round-trip and survive junk or blocked storage', () => {
  const st = memory();
  const s = defaultSave();
  s.tickets = 77; s.beaten.push('hops'); s.rivalBest.hops = 30; s.trick.bank1 = { stars: 2, best: 5 };
  assert.ok(writeSave(st, s));
  const back = loadSave(st);
  assert.equal(back.tickets, 77);
  assert.deepEqual(back.beaten, ['hops']);
  assert.equal(back.rivalBest.hops, 30);
  assert.equal(back.trick.bank1.stars, 2);
  st.setItem(SAVE_KEY, '{nope');
  assert.equal(loadSave(st).tickets, 0);
  assert.equal(loadSave(null).tickets, 0);
  assert.equal(writeSave({ setItem() { throw new Error('full'); } }, s), false);
});

test('beating the three rivals of a court wins its trophy and opens the next court', () => {
  const s = defaultSave();
  for (const r of RIVALS.slice(0, 3)) {
    assert.equal(nextRival(s).id, r.id);
    recordRound(s, { mode: 'tour', rival: r.id, score: 20, won: true, shots: 10, makes: 6 });
  }
  assert.ok(s.trophies.includes('park'));
  assert.ok(s.owned.courts.includes('beach'));
  assert.equal(nextRival(s).id, 'pinch');
});

test('winning everything brings the Golden Hoop and its prizes', () => {
  const s = defaultSave();
  let last;
  for (const r of RIVALS) last = recordRound(s, { mode: 'tour', rival: r.id, score: 40, won: true });
  assert.ok(last.trophies.includes('gold'));
  assert.ok(s.owned.balls.includes('gold'));
  assert.ok(s.owned.jerseys.includes('champ'));
  assert.equal(nextRival(s), null);
});

test('losing makes the rival a little easier, up to a cap', () => {
  const s = defaultSave();
  const r = RIVALS[0];
  assert.equal(rivalEase(s, r), 1);
  for (let i = 0; i < 6; i++) recordRound(s, { mode: 'tour', rival: r.id, score: 1, won: false });
  assert.ok(rivalEase(s, r) > 1 && rivalEase(s, r) <= 1.37);
});

test('quick play bests and the new-best moment', () => {
  const s = defaultSave();
  recordRound(s, { mode: 'quick', kind: 'timed', score: 20 });
  const r = recordRound(s, { mode: 'quick', kind: 'timed', score: 31 });
  assert.equal(r.newBest, true);
  assert.equal(r.prevBest, 20);
  assert.equal(recordRound(s, { mode: 'quick', kind: 'timed', score: 10 }).newBest, false);
  assert.equal(s.best.timed, 31);
});

test('daily streak counts consecutive days and forgives nothing else', () => {
  const s = defaultSave();
  recordRound(s, { mode: 'daily', dateKey: '2026-10-01', score: 10 });
  recordRound(s, { mode: 'daily', dateKey: '2026-10-01', score: 14 });
  assert.equal(s.daily.streak, 1);
  assert.equal(s.daily.scores['2026-10-01'], 14);
  recordRound(s, { mode: 'daily', dateKey: '2026-10-02', score: 5 });
  assert.equal(s.daily.streak, 2);
  assert.equal(liveStreak(s, '2026-10-03'), 2);
  assert.equal(liveStreak(s, '2026-10-05'), 0);
  recordRound(s, { mode: 'daily', dateKey: '2026-10-05', score: 5 });
  assert.equal(s.daily.streak, 1);
  assert.equal(s.daily.bestStreak, 2);
  // Across a month boundary.
  const t = defaultSave();
  recordRound(t, { mode: 'daily', dateKey: '2026-10-31', score: 1 });
  recordRound(t, { mode: 'daily', dateKey: '2026-11-01', score: 1 });
  assert.equal(t.daily.streak, 2);
});

test('tickets buy locker items; trophy items cannot be bought', () => {
  const s = defaultSave();
  const retro = BALLS.find((b) => b.id === 'retro');
  assert.equal(buyItem(s, 'balls', retro), false);
  s.tickets = 100;
  assert.equal(buyItem(s, 'balls', retro), true);
  assert.equal(s.tickets, 100 - retro.price);
  assert.equal(itemState(s, 'balls', retro), 'owned');
  assert.equal(itemState(s, 'balls', BALLS.find((b) => b.id === 'gold')), 'locked');
  assert.equal(itemState(s, 'courts', COURT_ITEMS.find((c) => c.id === 'candy')), 'buy');
});

test('every round pays tickets and a good round buys a cheap item', () => {
  const s = defaultSave();
  const r = recordRound(s, { mode: 'quick', kind: 'timed', score: 60, makes: 20, shots: 30 });
  assert.ok(r.tickets >= 35);
  assert.ok(recordRound(s, { mode: 'quick', kind: 'timed', score: 0 }).tickets > 0);
});

test('missions progress, pay out and rotate in a fresh one', () => {
  const st = freshMissions();
  assert.equal(st.active.length, 3);
  const first = st.active[0].id;
  const done = progressMissions(st, { makes: 10, swishes: 2 });
  assert.ok(done.some((m) => m.id === first));
  assert.equal(st.active.length, 3);
  assert.equal(new Set(st.active.map((a) => a.id)).size, 3);
  assert.ok(!st.active.some((a) => a.id === first));
  // Partial progress sticks.
  const sw = st.active.find((a) => a.id === 'swish5');
  assert.equal(sw.progress, 2);
  // Cycling many times always keeps three different missions.
  for (let i = 0; i < 40; i++) progressMissions(st, { makes: 50, swishes: 20, fires: 3, banks: 3, money: 3, score: 60, won: 1, buzzer: 1, stars: 3, daily: 1, tramps: 3 });
  assert.equal(new Set(st.active.map((a) => a.id)).size, 3);
  assert.ok(st.done > 40);
  assert.ok(MISSIONS.length >= 12);
});

test('the flick reference adapts gently and stays in range', () => {
  const s = defaultSave();
  for (let i = 0; i < 10; i++) adaptFlick(s, 4);
  assert.ok(s.flickRef > 2.4 && s.flickRef < 4);
  for (let i = 0; i < 400; i++) adaptFlick(s, 50);
  assert.equal(s.flickRef, 5);
  adaptFlick(s, NaN);
  assert.equal(s.flickRef, 5);
});
