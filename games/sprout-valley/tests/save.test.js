import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, loadWorld, writeWorld, SAVE_KEY, loadSettings, writeSettings, clearSave } from '../src/save.js';
import { freshWorld, runBot } from './helpers.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('a farm survives a save and load', () => {
  const w = freshWorld(8);
  runBot(w, 5);
  w.talkTo('juniper');
  w.add('gnome');
  const data = serialize(w);
  const json = JSON.parse(JSON.stringify(data));
  const back = deserialize(json);
  assert.equal(back.day, w.day);
  assert.equal(back.money, w.money);
  assert.deepEqual(back.inv, w.inv);
  assert.deepEqual(back.belt, w.belt);
  assert.deepEqual(Array.from(back.soil), Array.from(w.soil));
  assert.deepEqual(back.crop, w.crop);
  assert.deepEqual(back.requests, w.requests);
  assert.deepEqual(back.collection, w.collection);
  assert.equal(back.villagers.juniper.points, w.villagers.juniper.points);
  assert.equal(back.animals.length, w.animals.length);
  assert.deepEqual(back.goalsDone, w.goalsDone);
  assert.deepEqual(serialize(back), data, 'round trip is stable');
});

test('storage helpers tolerate blocked or corrupt storage', () => {
  const s = memoryStorage();
  assert.equal(loadWorld(s), null);
  const w = freshWorld(3);
  assert.ok(writeWorld(s, w));
  assert.equal(loadWorld(s).seed, 3);
  s.setItem(SAVE_KEY, '{nope');
  assert.equal(loadWorld(s), null);
  s.setItem(SAVE_KEY, JSON.stringify({ v: 1, day: 'x', money: -5, inv: { nonsense: 3, turnip: 2 }, tiles: [[-1], [5, 1, 1, 0, ['bogus', 1, 0, 0], 'piano']] }));
  const odd = loadWorld(s);
  assert.equal(odd.day, 0);
  assert.equal(odd.money, 0);
  assert.deepEqual(odd.inv, { turnip: 2 });
  assert.equal(odd.crop[5], null);
  assert.equal(odd.obj[5], null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(loadWorld(blocked), null);
  assert.equal(writeWorld(blocked, w), false);
  assert.deepEqual(loadSettings(blocked), { muted: false, music: true, speed: 'normal', reduced: false });
  assert.equal(writeSettings(blocked, {}), false);
  assert.equal(clearSave(blocked), false);
  writeSettings(s, { muted: true, music: false, speed: 'relaxed' });
  assert.equal(loadSettings(s).speed, 'relaxed');
  assert.ok(clearSave(s));
  assert.equal(loadWorld(s), null);
});

test('quitting mid-day resumes at the same time with watered soil and the bin', () => {
  const w = freshWorld(4);
  w.minute = 14 * 60 + 30;
  w.soil[600] = 1; w.wet[600] = 1;
  w.add('turnip', 3);
  w.ship('turnip', 3);
  w.player.x = 20.5; w.player.y = 19.5;
  const back = deserialize(JSON.parse(JSON.stringify(serialize(w))));
  assert.equal(Math.floor(back.minute), 14 * 60 + 30);
  assert.equal(back.wet[600], 1);
  assert.deepEqual(back.bin, { turnip: 3 });
  assert.equal(back.player.x, 20.5);
  assert.equal(back.weather, w.weather);
});

test('an egg hunt in progress resumes with the eggs still to find', () => {
  const w = freshWorld(4);
  w.day = 3; w.startDay();
  w.minute = 10 * 60;
  w.step(0.01, {});
  const egg = w.pickups.find((p) => p.festival);
  w.player.x = egg.x + 0.5; w.player.y = egg.y + 0.5;
  w.step(0.01, {});
  assert.equal(w.fest.eggs, 1);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(w))));
  assert.equal(back.fest.eggs, 1);
  assert.equal(back.pickups.filter((p) => p.festival).length, 11);
});
