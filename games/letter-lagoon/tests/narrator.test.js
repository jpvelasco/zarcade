import test from 'node:test';
import assert from 'node:assert/strict';
import { Narrator, LINES, line } from '../src/narrator.js';
import { aquariumRoster, CRITTERS, CRITTER_IDS } from '../src/critters.js';
import { ZONES } from '../src/levels.js';
import { isBlocked } from './blocklist.js';

test('Pinch rotates friendly lines', () => {
  const pinch = new Narrator();
  const a = pinch.say('found');
  const b = pinch.say('found');
  assert.notEqual(a, b);
  assert.equal(line('nothing-like-this', 0), LINES.found[0]);
  for (const list of Object.values(LINES)) {
    for (const text of list) {
      assert.ok(text.length <= 70, text);
      for (const part of text.toLowerCase().split(/[^a-z]+/).filter(Boolean)) assert.equal(isBlocked(part), false, text);
    }
  }
});

test('every zone critter exists and the aquarium roster is capped and fair', () => {
  for (const zone of ZONES) for (const id of zone.critters) assert.ok(CRITTERS[id], id);
  assert.deepEqual(aquariumRoster({}), []);
  const roster = aquariumRoster({ turtle: 100, seahorse: 1, whale: 3 }, 10);
  assert.equal(roster.length, 10);
  for (const id of ['turtle', 'seahorse', 'whale']) assert.ok(roster.includes(id), id);
  assert.deepEqual(aquariumRoster({ ray: 2 }, 10), ['ray', 'ray']);
  assert.ok(CRITTER_IDS.length >= 10);
});
