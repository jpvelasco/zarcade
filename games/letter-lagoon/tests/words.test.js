import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOSS_ENTRIES, BONUS_LIST, TARGETS, WORDS, isWord, isTarget, glossFor, canSpell, spellable, tally, normalize } from '../src/words.js';
import { isBlocked, BLOCKED_WORDS, rot13 } from './blocklist.js';

test('the blocklist filter catches blocked words and spares innocent ones', () => {
  assert.equal(rot13(rot13('lagoon')), 'lagoon');
  assert.ok(BLOCKED_WORDS.size > 100);
  for (const word of ['kill', 'beer', 'hate', 'stupid', 'ugly']) assert.ok(isBlocked(word), word);
  for (const word of ['glass', 'class', 'grape', 'grapes', 'hello', 'title', 'shell', 'scrape', 'peacock'.slice(0, 4)]) {
    assert.equal(isBlocked(word), false, word);
  }
});

test('no dictionary word is on the blocklist', () => {
  const blocked = [...WORDS].filter(isBlocked);
  assert.deepEqual(blocked, []);
});

test('every word is lowercase a-z and 3 to 7 letters', () => {
  for (const word of WORDS) assert.match(word, /^[a-z]{3,7}$/, word);
  for (const word of BONUS_LIST) assert.match(word, /^[a-z]+$/, word);
});

test('gloss entries are unique, short and friendly', () => {
  const seen = new Set();
  for (const { word, gloss } of GLOSS_ENTRIES) {
    assert.ok(!seen.has(word), `duplicate gloss for ${word}`);
    seen.add(word);
    assert.match(word, /^[a-z]{3,7}$/, word);
    assert.ok(gloss.length >= 4 && gloss.length <= 70, `${word}: "${gloss}"`);
    assert.match(gloss, /^[A-Z"]/, `${word} gloss starts with a capital`);
    assert.equal(isBlocked(gloss.toLowerCase().replace(/[^a-z ]/g, '')), false);
    for (const part of gloss.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
      assert.equal(isBlocked(part), false, `${word} gloss uses "${part}"`);
    }
  }
  assert.ok(GLOSS_ENTRIES.length >= 600, `only ${GLOSS_ENTRIES.length} target words`);
});

test('plural flags add plain plural targets with a gloss', () => {
  assert.ok(isTarget('pots'));
  assert.equal(glossFor('pots'), 'More than one pot.');
  assert.ok(isTarget('turtles'));
  assert.equal(isTarget('foxs'), false);
  assert.equal(isTarget('boxs'), false);
});

test('lookups: words, targets and glosses', () => {
  assert.ok(isWord('lagoon'));
  assert.ok(isWord('LaGoon'));
  assert.ok(isWord('the'), 'bonus-only words are words');
  assert.equal(isTarget('the'), false);
  assert.equal(isWord('xqzt'), false);
  assert.equal(isWord(''), false);
  assert.match(glossFor('octopus'), /eight arms/);
  assert.equal(glossFor('the'), null);
  assert.equal(normalize(' Sea-Star! '), 'seastar');
  for (const word of TARGETS.keys()) assert.ok(WORDS.has(word));
  assert.ok(WORDS.size > TARGETS.size + 500, 'the bonus list adds plenty of extra words');
});

test('spelling from a wheel respects letter counts', () => {
  assert.ok(canSpell('eat', 'tea'));
  assert.ok(canSpell('tee', 'tees'));
  assert.equal(canSpell('tee', 'tea'), false);
  assert.equal(canSpell('teas', 'tea'), false);
  assert.ok(canSpell('pot', tally('stop')));
  const words = spellable('stop');
  assert.ok(words.includes('stop') && words.includes('pots') && words.includes('top'));
  assert.ok(words.every((w) => canSpell(w, 'stop')));
  for (let i = 1; i < words.length; i++) assert.ok(words[i - 1].length >= words[i].length, 'longest first');
});
