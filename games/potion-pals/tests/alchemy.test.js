import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Alchemy, newState, normalize, dayKey, prevKey, roomsFor, palRoom,
  requestText, riddleFor, ROOMS, POT_SIZE, START_SCROLLS,
} from '../src/alchemy.js';
import { ITEM, PAL, frontier } from '../src/recipes.js';
import { simulate } from '../src/bot.js';

const fresh = () => new Alchemy(newState(42));

test('a fresh workshop knows the eight starters and nothing else', () => {
  const a = fresh();
  assert.equal(a.shelf().length, 8);
  assert.equal(a.discovered, 0);
  assert.equal(a.palCount, 0);
  assert.equal(a.state.scrolls, START_SCROLLS);
  assert.ok(a.knows('ember'));
  assert.ok(!a.knows('bonfire'));
});

test('the pot holds three things, duplicates allowed', () => {
  const a = fresh();
  assert.ok(a.add('ember'));
  assert.ok(a.add('ember'));
  assert.ok(a.add('snow'));
  assert.ok(!a.add('honey'), 'a fourth should not fit');
  assert.equal(a.pot.length, POT_SIZE);
  a.pop();
  assert.equal(a.pot.length, 2);
  a.clear();
  assert.equal(a.pot.length, 0);
});

test('unknown things cannot go in the pot', () => {
  const a = fresh();
  assert.ok(!a.add('bonfire'));
  assert.ok(!a.add('nonsense'));
});

test('a single ingredient will not brew', () => {
  const a = fresh();
  a.add('ember');
  const res = a.brew();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'short');
  assert.equal(a.pot.length, 1, 'the pot keeps its contents');
});

test('two embers make a bonfire, and it is new only once', () => {
  const a = fresh();
  a.add('ember'); a.add('ember');
  const first = a.brew();
  assert.equal(first.ok, true);
  assert.equal(first.id, 'bonfire');
  assert.equal(first.isNew, true);
  assert.ok(a.knows('bonfire'));
  assert.equal(a.state.unseen.bonfire, 1);
  a.add('ember'); a.add('ember');
  const again = a.brew();
  assert.equal(again.ok, true);
  assert.equal(again.isNew, false);
  assert.equal(a.discovered, 1);
});

test('a mix with no recipe fizzles with a quip and a hint, and never punishes', () => {
  const a = fresh();
  a.add('moonberry'); a.add('frogsneeze'); a.add('starlight');
  const res = a.brew();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'fizzle');
  assert.ok(res.quip.length > 4);
  assert.ok(res.hint.length > 8);
  assert.equal(a.discovered, 0);
  assert.equal(a.state.scrolls, START_SCROLLS, 'fizzling costs nothing');
  assert.equal(a.pot.length, 0);
});

test('fizzle hints rotate and always name something the player owns', () => {
  const a = fresh();
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    a.add('snow'); a.add('snow'); a.add('snow');
    const res = a.brew();
    assert.equal(res.ok, false);
    seen.add(res.hint);
    assert.match(res.hint, /waiting for something|wants two friends/);
  }
  assert.ok(seen.size >= 3, 'the same hint came back every time');
});

test('ordering does not matter at the pot either', () => {
  const a = fresh();
  a.add('snow'); a.add('ember');
  assert.equal(a.brew().id, 'steam');
  a.add('ember'); a.add('snow');
  assert.equal(a.brew().id, 'steam');
});

test('scrolls arrive steadily and potions pay extra', () => {
  const a = fresh();
  const brew = (...ids) => { a.clear(); for (const id of ids) a.add(id); return a.brew(); };
  brew('ember', 'ember');
  brew('snow', 'ember');
  const third = brew('mushroom', 'dewdrop');
  assert.equal(third.scrolls, 1, 'every third discovery pays a scroll');
  assert.equal(a.state.scrolls, START_SCROLLS + 1);
});

test('a potion summons a pal, opens rooms and never summons twice', () => {
  const a = fresh();
  const brew = (...ids) => { a.clear(); for (const id of ids) a.add(id); return a.brew(); };
  brew('mushroom', 'dewdrop'); // moss
  brew('honey', 'dewdrop'); // nectar
  brew('nectar', 'moss'); // blossom
  const potion = brew('moss', 'blossom', 'dewdrop');
  assert.equal(potion.id, 'mossbloombrew');
  assert.equal(potion.pal, 'mossy');
  assert.ok(potion.scrolls >= 2, 'a potion is worth scrolls');
  assert.equal(a.palCount, 1);
  const again = brew('moss', 'blossom', 'dewdrop');
  assert.equal(again.pal, null);
  assert.equal(a.palCount, 1);
});

test('rooms unlock as the pal count grows', () => {
  assert.equal(roomsFor(0), 1);
  assert.equal(roomsFor(2), 1);
  assert.equal(roomsFor(3), 2);
  assert.equal(roomsFor(7), 3);
  assert.equal(roomsFor(30), ROOMS.length);
  assert.equal(roomsFor(999), ROOMS.length);
});

test('pals spread evenly across the rooms they have', () => {
  const rooms = 3;
  const used = new Set();
  for (let order = 1; order <= 9; order++) {
    const room = palRoom(order, rooms);
    assert.ok(room >= 0 && room < rooms);
    used.add(room);
  }
  assert.equal(used.size, 3);
});

test('requests appear once there is a pal, and are always brewable now', () => {
  const a = fresh();
  simulate(a, 30);
  assert.ok(a.palCount > 0, 'the demo should have found a potion');
  a.rollRequests();
  assert.equal(a.state.requests.length, 3);
  const front = new Set(frontier(a.knownSet));
  for (const r of a.state.requests) {
    assert.ok(PAL[r.pal], 'a real pal asks');
    assert.ok(a.state.pals[r.pal], 'only pals you own ask');
    assert.ok(front.has(r.target) || a.knows(r.target), `${r.target} is not brewable yet`);
    assert.match(requestText(r), /wants something/);
  }
});

test('finishing a request pays a scroll and a new one rolls in', () => {
  const a = fresh();
  simulate(a, 30);
  a.rollRequests();
  const req = a.state.requests[0];
  const target = ITEM[req.target];
  const before = a.state.scrolls;
  a.clear();
  for (const input of target.inputs) a.add(input);
  const res = a.brew();
  assert.equal(res.ok, true);
  assert.equal(res.requests.length, 1);
  assert.equal(res.requests[0].target, req.target);
  assert.ok(a.state.scrolls > before);
  assert.equal(a.state.requests.length, 3);
  assert.ok(!a.state.requests.some((r) => r.target === req.target));
});

test('a scroll reveals one input at a time, and known recipes are free', () => {
  const a = fresh();
  a.state.scrolls = 2;
  assert.deepEqual(a.revealed('bonfire'), [null, null]);
  const first = a.reveal('bonfire');
  assert.equal(first.ok, true);
  assert.deepEqual(a.revealed('bonfire'), ['ember', null]);
  a.reveal('bonfire');
  assert.deepEqual(a.revealed('bonfire'), ['ember', 'ember']);
  assert.equal(a.reveal('bonfire').reason, 'full');
  assert.equal(a.state.scrolls, 0);
  assert.equal(a.reveal('steam').reason, 'scrolls');
  a.add('snow'); a.add('ember'); a.brew();
  assert.deepEqual(a.revealed('steam'), ['snow', 'ember'], 'found recipes show for free');
  assert.equal(a.reveal('steam').reason, 'known');
});

test('the daily mystery is the same all day and brewable today', () => {
  const a = fresh();
  simulate(a, 20);
  const key = '2026-10-01';
  const first = a.ensureDaily(key);
  assert.ok(ITEM[first.id]);
  assert.equal(first.done, false);
  const again = a.ensureDaily(key);
  assert.equal(again.id, first.id, 'the riddle must not change mid-chase');
  const riddle = riddleFor(first.id);
  assert.ok(riddle.length >= 2);
  a.clear();
  for (const input of ITEM[first.id].inputs) a.add(input);
  const res = a.brew(key);
  assert.equal(res.daily, true);
  assert.equal(res.streak, 1);
  assert.equal(a.state.daily.done, true);
});

test('the daily seed only depends on the date and the save seed', () => {
  const one = new Alchemy(newState(9));
  const two = new Alchemy(newState(9));
  assert.equal(one.ensureDaily('2026-05-05').id, two.ensureDaily('2026-05-05').id);
  const other = new Alchemy(newState(10));
  const keys = ['2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];
  const picks = keys.map((k) => new Alchemy(newState(9)).ensureDaily(k).id);
  assert.ok(new Set(picks).size > 1, 'different days should differ');
  assert.ok(other.ensureDaily('2026-05-05').id, 'another save still gets one');
});

test('the streak grows day after day and resets after a gap', () => {
  const a = fresh();
  simulate(a, 24);
  const days = ['2026-03-01', '2026-03-02', '2026-03-03'];
  for (const day of days) {
    const d = a.ensureDaily(day);
    a.clear();
    for (const input of ITEM[d.id].inputs) a.add(input);
    a.brew(day);
  }
  assert.equal(a.state.daily.streak, 3);
  assert.equal(a.state.daily.best, 3);
  a.ensureDaily('2026-03-09');
  assert.equal(a.state.daily.streak, 0, 'a missed week starts again');
  assert.equal(a.state.daily.best, 3, 'the best streak is kept');
});

test('prevKey walks back over month ends', () => {
  assert.equal(prevKey('2026-03-01'), '2026-02-28');
  assert.equal(prevKey('2026-01-01'), '2025-12-31');
  assert.equal(prevKey('2024-03-01'), '2024-02-29');
});

test('dayKey is a local calendar date', () => {
  assert.equal(dayKey(new Date(2026, 9, 1, 23, 30)), '2026-10-01');
  assert.match(dayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('poking a pal always says something', () => {
  const a = fresh();
  simulate(a, 30);
  const id = Object.keys(a.state.pals)[0];
  const lines = new Set();
  for (let i = 0; i < 6; i++) lines.add(a.poke(id).line);
  assert.ok(lines.size > 1);
  assert.equal(a.poke('nobody'), null);
  assert.equal(a.state.stats.pokes, 6);
});

test('saves round-trip, and rubbish in a save never breaks the game', () => {
  const a = fresh();
  simulate(a, 40);
  a.rollRequests();
  a.ensureDaily('2026-04-04');
  const copy = new Alchemy(normalize(JSON.parse(JSON.stringify(a.state)), 1));
  assert.equal(copy.discovered, a.discovered);
  assert.equal(copy.palCount, a.palCount);
  assert.equal(copy.state.scrolls, a.state.scrolls);
  assert.equal(copy.state.requests.length, a.state.requests.length);
  assert.equal(copy.state.daily.id, a.state.daily.id);

  const junk = normalize({
    found: { bonfire: 1, notathing: 2, ember: 3 },
    pals: { mossy: 1, nope: 2 },
    scrolls: 'lots',
    reveals: { bonfire: 99, nothing: 1 },
    requests: [{ pal: 'mossy', target: 'steam' }, { pal: 'ghost', target: 'steam' }, 7],
    daily: { key: 5, id: 'nope', streak: -4 },
    stats: null,
    settings: { muted: 1 },
  }, 5);
  assert.deepEqual(Object.keys(junk.found), ['bonfire']);
  assert.deepEqual(Object.keys(junk.pals), ['mossy']);
  assert.equal(junk.scrolls, START_SCROLLS);
  assert.equal(junk.reveals.bonfire, 2);
  assert.equal(junk.requests.length, 1);
  assert.equal(junk.daily.key, '');
  assert.equal(junk.daily.streak, 0);
  assert.equal(junk.settings.muted, true);
  assert.equal(junk.rooms, 1);
});

test('potions are keepsakes, not shelf ingredients', () => {
  const a = fresh();
  simulate(a, 60);
  const keepsakes = a.keepsakes();
  assert.ok(keepsakes.length > 0);
  for (const id of keepsakes) {
    assert.equal(ITEM[id].kind, 'potion');
    assert.ok(!a.shelf().includes(id));
    assert.equal(a.add(id), false);
  }
});
