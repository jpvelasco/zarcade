import test from 'node:test';
import assert from 'node:assert/strict';
import { LETTERS, SHORT, MEDIUM, LONG, PUNCTUATED, BOSS_PASSAGES, allEntries } from '../src/words.js';
import { isBlocked, rot13, BLOCKED_WORDS } from '../src/blocklist.js';
import { STAGES, LESSONS, poolFor, makeDaily, drillStrings } from '../src/stages.js';

test('the blocklist catches encoded rude words, whole or inside phrases', () => {
  assert.ok(BLOCKED_WORDS.size > 100);
  // Spot checks are written encoded too, so this file stays clean.
  for (const enc of ['qnza', 'fuvg', 'xvyy', 'ungr', 'fghcvq', 'phz', 'jnax', 'fchax', 'obyybpxf']) {
    const word = rot13(enc);
    assert.equal(isBlocked(word), true, enc);
    assert.equal(isBlocked(`Oh, ${word[0].toUpperCase()}${word.slice(1)}!`), true, enc);
  }
  assert.equal(isBlocked(rot13('shpxvat')), true, 'fragments are caught inside words');
});

test('the blocklist leaves innocent words alone', () => {
  for (const w of ['glass', 'grape', 'hello', 'class', 'Is extra?', 'shell', 'scrape', 'cocoa', 'cucumber', 'shaggy', 'document']) {
    assert.equal(isBlocked(w), false, w);
  }
});

test('every word, phrase and passage is kid-safe', () => {
  const bad = allEntries().filter((e) => isBlocked(e.text)).map((e) => e.text);
  assert.deepEqual(bad, []);
});

test('every stage, lesson and daily pool is kid-safe', () => {
  const pools = [...STAGES, ...LESSONS].map((s) => [s.id, poolFor(s)]);
  for (let t = 0; t < 5; t++) pools.push([`daily-${t}`, poolFor(makeDaily('2026-10-01', t))]);
  for (const [id, pool] of pools) {
    const bad = pool.filter((w) => isBlocked(w));
    assert.deepEqual(bad, [], id);
  }
});

test('generated drills never spell a blocked word, for any seed', () => {
  for (const l of LESSONS) {
    if (!l.words.drill) continue;
    for (let seed = 1; seed <= 25; seed++) {
      const bad = drillStrings(l.words.drill, l.words.focus, seed).filter((s) => isBlocked(s));
      assert.deepEqual(bad, [], `${l.id} seed ${seed}`);
    }
  }
});

test('word tiers have the right shape', () => {
  assert.equal(LETTERS.length, 26);
  const check = (list, min, max) => {
    for (const w of list) {
      assert.match(w, /^[a-z]+$/, w);
      assert.ok(w.length >= min && w.length <= max, `${w} is ${w.length} letters`);
    }
  };
  check(SHORT, 2, 4);
  check(MEDIUM, 5, 6);
  check(LONG, 7, 12);
  assert.ok(SHORT.length >= 150 && MEDIUM.length >= 120 && LONG.length >= 120 && PUNCTUATED.length >= 60);
  for (const w of PUNCTUATED) {
    assert.match(w, /^[A-Za-z][A-Za-z ,.!?'-]*$/, w);
    assert.ok(w.length <= 20, w);
  }
});

test('no word appears twice across the lists', () => {
  const all = [...SHORT, ...MEDIUM, ...LONG, ...PUNCTUATED];
  const dupes = all.filter((w, i) => all.indexOf(w) !== i);
  assert.deepEqual(dupes, []);
});

test('boss passages fit their tier', () => {
  assert.equal(BOSS_PASSAGES.length, 5);
  BOSS_PASSAGES.forEach((passages, tier) => {
    assert.ok(passages.length >= 3);
    for (const p of passages) {
      assert.ok(p.length >= 3 && p.length <= 6);
      for (const phrase of p) {
        assert.ok(phrase.length >= 2 && phrase.length <= 22, phrase);
        assert.notEqual(phrase[0], ' ');
        if (tier < 4) assert.match(phrase, /^[a-z ]+$/, phrase);
        else assert.match(phrase, /^[A-Za-z ,.!?']+$/, phrase);
      }
    }
  });
});
