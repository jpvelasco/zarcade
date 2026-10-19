import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, multiplier, starsFor, paceFor, METER_MAX, REACH_X, VIEW_X, BOSS_X } from '../src/battle.js';
import { STAGES } from '../src/stages.js';
import { mulberry32 } from '../src/rng.js';

// A stage with a fixed word list so tests know exactly what appears.
function stage(over = {}) {
  return { id: 't', region: 1, index: 0, name: 'Test', words: { tier: 1 }, count: 3, targetWpm: 10, maxActive: 3, tier: 1, gentle: false, monsters: ['slime'], boss: null, ...over };
}
function fixedPicker(words) {
  let i = 0;
  return { weak: [], next: () => words[i++ % words.length] };
}
function walkIn(b, until = VIEW_X - 1) {
  let guard = 0;
  while (b.monsters.some((m) => m.x > until) && guard++ < 10000) b.step(1 / 60);
}
const typeAll = (b, text) => [...text].map((c) => b.type(c));

test('typing a word poofs its monster and scores it', () => {
  const b = new Battle(stage({ count: 1 }), { picker: fixedPicker(['cat']) });
  b.step(0.01);
  walkIn(b);
  assert.deepEqual(typeAll(b, 'cat'), ['hit', 'hit', 'hit']);
  assert.equal(b.monsters.length, 0);
  assert.equal(b.stats.words, 1);
  assert.equal(b.score, 30);
  assert.ok(b.events.some((e) => e.type === 'poof' && e.word === 'cat'));
  b.step(0.01);
  assert.equal(b.status, 'cleared');
});

test('the first letter locks the nearest matching monster', () => {
  const b = new Battle(stage({ count: 2, maxActive: 2 }), { picker: fixedPicker(['dog', 'duck']) });
  b.step(0.01);
  b.spawnMinion();
  b.monsters[0].x = 40;
  b.monsters[1].x = 30;
  b.type('d');
  assert.equal(b.target, b.monsters[1].id);
  assert.equal(b.monsters[1].typed, 1);
});

test('a typo stumbles the knight and breaks the combo but costs nothing else', () => {
  const b = new Battle(stage({ count: 2 }), { picker: fixedPicker(['cat', 'cow']) });
  b.step(0.01);
  walkIn(b);
  typeAll(b, 'cat');
  assert.equal(b.combo, 1);
  b.spawnMinion();
  walkIn(b);
  const hearts = b.hearts;
  const score = b.score;
  b.type('c');
  assert.equal(b.type('x'), 'typo');
  assert.equal(b.combo, 0);
  assert.ok(b.stumble > 0);
  assert.equal(b.hearts, hearts);
  assert.equal(b.score, score);
  assert.ok(b.events.some((e) => e.type === 'key' && e.ch === 'o' && e.ok === false), 'the expected key takes the miss');
  assert.deepEqual(typeAll(b, 'ow'), ['hit', 'hit']);
});

test('a stray space is ignored, a stray letter is a soft typo', () => {
  const b = new Battle(stage({ count: 1 }), { picker: fixedPicker(['cat']) });
  b.step(0.01);
  walkIn(b);
  assert.equal(b.type(' '), 'ignored');
  assert.equal(b.type('z'), 'typo');
  assert.equal(b.target, null);
  assert.ok(!b.events.some((e) => e.type === 'key' && !e.ok), 'no key is blamed without a target');
});

test('monsters off screen cannot be typed yet', () => {
  const b = new Battle(stage({ count: 1 }), { picker: fixedPicker(['cat']) });
  b.step(0.001);
  assert.ok(b.monsters[0].x > VIEW_X + 2);
  assert.equal(b.type('c'), 'typo');
});

test('combo raises the multiplier and charges Star Spin', () => {
  assert.equal(multiplier(0), 1);
  assert.equal(multiplier(5), 1.5);
  assert.equal(multiplier(40), 3);
  const b = new Battle(stage({ count: 12, maxActive: 1 }), { picker: fixedPicker(['a', 'b', 'c']) });
  for (let i = 0; i < 9; i++) {
    b.step(0.01);
    walkIn(b);
    const m = b.monsters[0];
    b.type(m.word);
  }
  assert.equal(b.combo, 9);
  assert.equal(b.meter, METER_MAX, 'combo 5 adds a bonus charge');
  assert.ok(b.events.some((e) => e.type === 'meterFull'));
});

test('Star Spin clears every visible minion', () => {
  const b = new Battle(stage({ count: 5, maxActive: 5 }), { picker: fixedPicker(['ant', 'bee', 'cow', 'dog']) });
  b.step(0.01);
  for (let i = 0; i < 3; i++) b.spawnMinion();
  for (const m of b.monsters) m.x = 50;
  assert.equal(b.special(), false, 'needs a full meter');
  b.meter = METER_MAX;
  assert.equal(b.special(), true);
  assert.equal(b.monsters.length, 0);
  assert.equal(b.meter, 0);
  assert.equal(b.events.filter((e) => e.type === 'poof' && e.special).length, 4);
});

test('reaching the knight bonks; three bonks end the stage', () => {
  const b = new Battle(stage({ count: 5, maxActive: 3 }), { picker: fixedPicker(['ant', 'bee', 'cow']) });
  let guard = 0;
  while (b.status === 'play' && guard++ < 100000) b.step(1 / 30);
  assert.equal(b.status, 'failed');
  assert.equal(b.hearts, 0);
  assert.equal(b.stats.bonks, 3);
});

test('gentle monsters wait at the knight instead of bonking', () => {
  const b = new Battle(stage({ count: 2, gentle: true }), { picker: fixedPicker(['ant', 'bee']) });
  for (let i = 0; i < 60 * 60; i++) b.step(1 / 60);
  assert.equal(b.status, 'play');
  assert.equal(b.hearts, 3);
  assert.ok(b.monsters.every((m) => m.state === 'wait' && m.x === REACH_X));
  typeAll(b, 'antbee');
  b.step(0.01);
  assert.equal(b.status, 'cleared');
});

test('bosses take a phrase at a time, spaces and all', () => {
  const st = stage({ count: 1, boss: 'kingSlime', passages: [['a big hug', 'for my pal']] });
  const b = new Battle(st, { picker: fixedPicker(['cat']), gentle: true });
  b.step(0.01);
  walkIn(b);
  typeAll(b, 'cat');
  b.step(0.01);
  assert.ok(b.boss);
  walkIn(b);
  typeAll(b, 'a big hug');
  assert.equal(b.boss.word, 'for my pal');
  assert.equal(b.boss.hp, 1);
  assert.ok(b.events.some((e) => e.type === 'bossHit'));
  typeAll(b, 'for my pal');
  assert.ok(b.events.some((e) => e.type === 'bossDefeated'));
  b.step(0.01);
  assert.equal(b.status, 'cleared');
});

test('a boss strides fully on screen and its phrase can be typed at once', () => {
  const st = stage({ count: 1, boss: 'kingSlime', passages: [['a big hug', 'for my pal']] });
  const b = new Battle(st, { picker: fixedPicker(['cat']) });
  b.step(0.01);
  walkIn(b);
  typeAll(b, 'cat');
  b.step(0.01);
  assert.ok(b.boss && b.boss.x > VIEW_X, 'it starts at the edge');
  assert.deepEqual(typeAll(b, 'a b'), ['hit', 'hit', 'hit'], 'typing the visible phrase is never a typo');
  assert.equal(b.stats.typos, 0);
  for (let i = 0; i < 90; i++) b.step(1 / 60);
  assert.ok(b.boss.x <= BOSS_X && !b.boss.entering, `in place after 1.5 s (x ${b.boss.x})`);
  const slow = b.bossSpeed(b.boss);
  assert.equal(b.boss.speed, slow, 'then walks at its normal pace');
});

test('Star Spin keeps its charge when nothing is on screen to hit', () => {
  const b = new Battle(stage({ count: 5, maxActive: 5 }), { picker: fixedPicker(['ant', 'bee']) });
  b.step(0.01);
  for (const m of b.monsters) m.x = VIEW_X + 3;
  b.meter = METER_MAX;
  assert.equal(b.special(), false);
  assert.equal(b.meter, METER_MAX);
  const st = stage({ count: 1, boss: 'kingSlime', passages: [['a big hug', 'for my pal']] });
  const bb = new Battle(st, { picker: fixedPicker(['cat']) });
  bb.step(0.01); walkIn(bb); typeAll(bb, 'cat'); bb.step(0.01);
  bb.meter = METER_MAX;
  assert.equal(bb.special(), true, 'a boss walking in can be spun');
  assert.equal(bb.boss.word, 'for my pal');
});

test('capitals count unless caseless', () => {
  const st = stage({ count: 1 });
  const strict = new Battle(st, { picker: fixedPicker(['Hello!']) });
  strict.step(0.01);
  walkIn(strict);
  assert.equal(strict.type('h'), 'typo');
  assert.deepEqual(typeAll(strict, 'Hello!'), Array(6).fill('hit'));
  const easy = new Battle(st, { picker: fixedPicker(['Hello!']), caseless: true });
  easy.step(0.01);
  walkIn(easy);
  assert.deepEqual(typeAll(easy, 'hello!'), Array(6).fill('hit'));
});

test('wpm counts correct keys over active time only', () => {
  const b = new Battle(stage({ count: 1 }), { picker: fixedPicker(['abcde']) });
  b.step(0.01);
  const idle = b.stats.activeTime;
  walkIn(b);
  assert.equal(idle, 0, 'the clock waits while nothing is on screen');
  const start = b.stats.activeTime;
  typeAll(b, 'abcde');
  b.stats.activeTime = start + 12; // pretend the word took 12 seconds
  assert.equal(b.wpm, 5);
});

test('stars reward accuracy and few bonks', () => {
  assert.equal(starsFor({ acc: 0.7, bonks: 2 }), 1);
  assert.equal(starsFor({ acc: 0.9, bonks: 2 }), 2);
  assert.equal(starsFor({ acc: 0.96, bonks: 2 }), 2);
  assert.equal(starsFor({ acc: 0.96, bonks: 1 }), 3);
});

test('pace eases after fails and speeds up for fast typists', () => {
  const st = { targetWpm: 10 };
  assert.equal(paceFor(st), 1);
  assert.equal(paceFor(st, { fails: 1 }), 0.85);
  assert.equal(paceFor(st, { fails: 9 }), 0.55);
  assert.equal(paceFor(st, { recentWpm: 60 }), 1.25);
  assert.equal(paceFor(st, { recentWpm: 14 }), 1);
});

test('same stage and seed play out identically', () => {
  const run = () => {
    const b = new Battle(STAGES[8], { seed: 77 });
    const words = [];
    for (let i = 0; i < 60 * 40; i++) {
      b.step(1 / 60);
      for (const e of b.events) if (e.type === 'spawn') words.push(b.monsters.find((m) => m.id === e.id).word);
      b.events.length = 0;
      const m = b.monsters.find((x) => x.x < 60);
      if (m && !b.target) b.type(m.word[0]);
      else if (b.target) { const t = b.monsters.find((x) => x.id === b.target); b.type(t.word[t.typed]); }
    }
    return { words, score: b.score };
  };
  assert.deepEqual(run(), run());
});

test('the next character hint follows the target', () => {
  const b = new Battle(stage({ count: 1 }), { picker: fixedPicker(['cat']) });
  b.step(0.01);
  walkIn(b);
  assert.equal(b.nextChar(), 'c');
  b.type('c');
  assert.equal(b.nextChar(), 'a');
  void mulberry32;
});
