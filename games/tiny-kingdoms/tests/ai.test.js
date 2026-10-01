import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, AI } from '../src/ai.js';
import { generateMap } from '../src/mapgen.js';

const PERS = ['greedy', 'cautious', 'sneaky'];

// a vs b over many symmetric maps, sides swapped, personalities rotated.
function series(a, b, games = 24) {
  let wins = 0, played = 0;
  for (let s = 1; s <= games / 2; s++) {
    const map = generateMap({ seed: s * 7919, size: ['small', 'medium', 'large'][s % 3], kingdoms: 2 });
    for (const swap of [false, true]) {
      const pa = { personality: PERS[s % 3], difficulty: a };
      const pb = { personality: PERS[(s + 1) % 3], difficulty: b };
      const w = simulate(map, swap ? { 1: pb, 2: pa } : { 1: pa, 2: pb }, { maxTime: 600 });
      if (w.winner === (swap ? 2 : 1)) wins++;
      played++;
    }
  }
  return wins / played;
}

test('hard beats easy most of the time', () => {
  const rate = series('hard', 'easy');
  assert.ok(rate >= 0.8, `hard won ${rate}`);
});

test('normal beats easy most of the time', () => {
  const rate = series('normal', 'easy');
  assert.ok(rate >= 0.7, `normal won ${rate}`);
});

test('hard beats normal more often than not', () => {
  const rate = series('hard', 'normal');
  assert.ok(rate > 0.55, `hard won ${rate}`);
});

test('equal rivals on a symmetric map are roughly fair', () => {
  // Same personality and difficulty on both sides: neither side is favoured.
  let first = 0, games = 0;
  for (let s = 1; s <= 16; s++) {
    const map = generateMap({ seed: s * 104729, size: 'medium', kingdoms: 2 });
    const p = { personality: PERS[s % 3], difficulty: 'normal' };
    const w = simulate(map, { 1: p, 2: p }, { maxTime: 600 });
    if (w.winner) { games++; if (w.winner === 1) first++; }
  }
  assert.ok(games >= 10);
  assert.ok(first / games > 0.2 && first / games < 0.8, `side 1 won ${first}/${games}`);
});

test('the AI is deterministic', () => {
  const map = generateMap({ seed: 77, size: 'medium', kingdoms: 3 });
  const players = { 1: { personality: 'sneaky', difficulty: 'hard' }, 2: { personality: 'greedy', difficulty: 'normal' }, 3: { personality: 'cautious', difficulty: 'easy' } };
  const a = simulate(map, players, { maxTime: 120 });
  const b = simulate(map, players, { maxTime: 120 });
  assert.equal(a.fingerprint(), b.fingerprint());
});

test('easy rivals wait before attacking you', () => {
  const map = generateMap({ seed: 5, size: 'small', kingdoms: 2 });
  let attacked = false;
  simulate(map, { 1: 'idle', 2: { personality: 'sneaky', difficulty: 'easy' } }, {
    maxTime: 24,
    onStep: (w) => { if (w.marches.some((m) => w.nodes[m.to].owner === 1)) attacked = true; },
  });
  assert.equal(attacked, false);
});

test('personalities behave differently', () => {
  const map = generateMap({ seed: 11, size: 'large', kingdoms: 2 });
  const sends = {};
  for (const p of PERS) {
    const w = simulate(map, { 1: 'idle', 2: { personality: p, difficulty: 'normal' } }, { maxTime: 40 });
    sends[p] = w.buildingsOf(2).length;
  }
  // Greedy grabs more of the map early than cautious does.
  assert.ok(sends.greedy >= sends.cautious, JSON.stringify(sends));
  assert.ok(new AI(2, { personality: 'cautious' }).style.reserve > new AI(2, { personality: 'greedy' }).style.reserve);
});
