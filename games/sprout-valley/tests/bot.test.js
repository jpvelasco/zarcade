import test from 'node:test';
import assert from 'node:assert/strict';
import { freshWorld, runBot } from './helpers.js';
import { serialize } from '../src/save.js';

test('the bot farmer plays a full season and ends with more money', () => {
  const w = freshWorld(1);
  const start = w.money;
  const nights = runBot(w, 7);
  assert.equal(nights.length, 7);
  assert.equal(w.season, 'summer');
  assert.ok(w.money > start, `money ${w.money}`);
  assert.ok(w.goalsDone.harvest && w.goalsDone.ship && w.goalsDone.till);
  assert.ok(nights.some((n) => n.income > 500), 'at least one good harvest night');
});

test('the bot is deterministic', () => {
  const a = freshWorld(6), b = freshWorld(6);
  runBot(a, 3);
  runBot(b, 3);
  assert.deepEqual(serialize(a), serialize(b));
});

test('a whole year of bot farming keeps growing', () => {
  const w = freshWorld(2);
  const nights = runBot(w, 28);
  assert.equal(nights.length, 28);
  assert.equal(w.date.year, 2);
  assert.ok(w.earned > 10000, `earned ${w.earned}`);
  assert.ok(w.upgrades.field, 'expanded the field');
  assert.ok(Object.keys(w.collection.crops).length >= 5);
});
