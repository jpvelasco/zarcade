import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, simulateMatch, cleanSettings, defaultSettings } from '../src/match.js';
import { ARENA_IDS } from '../src/arenas.js';

const bots = (n, level = 'normal') => Array.from({ length: n }, () => ({ bot: level }));

for (const mode of ['lbs', 'koth', 'coins']) {
  test(`a full 4-bot ${mode} match terminates with a winner`, () => {
    for (const seed of [1, 2]) {
      const { match, rounds } = simulateMatch({ mode, arena: 'cycle' }, bots(4), seed);
      assert.ok(match.over, 'over');
      assert.ok(match.winner >= 0 && match.winner < 4);
      assert.equal(match.ranking.length, 4);
      assert.equal(match.ranking[0], match.winner);
      assert.ok(rounds.every((r) => r.done), 'every round finished');
      if (mode === 'lbs') assert.equal(match.wins[match.winner], Math.max(...match.wins));
      else assert.ok(match.scores[match.winner] >= Math.max(...match.scores));
    }
  });
}

test('bot matches replay identically from the same seed', () => {
  const a = simulateMatch({ mode: 'lbs', arena: 'random' }, bots(3, 'hard'), 42);
  const b = simulateMatch({ mode: 'lbs', arena: 'random' }, bots(3, 'hard'), 42);
  assert.deepEqual(a.rounds, b.rounds);
  assert.equal(a.match.winner, b.match.winner);
});

test('cycling arenas visits every arena before repeating', () => {
  const m = new Match({ mode: 'lbs', arena: 'cycle', target: { lbs: 50 } }, bots(2), 5);
  const seen = ARENA_IDS.map(() => m.nextRound().arenaDef.id);
  assert.deepEqual(seen.slice().sort(), ARENA_IDS.slice().sort());
  const fixed = new Match({ mode: 'lbs', arena: 'rink' }, bots(2), 5);
  assert.equal(fixed.nextRound().arenaDef.id, 'rink');
});

test('draws never stall a match: after the round cap the leader wins', () => {
  const m = new Match({ mode: 'lbs', target: { lbs: 2 } }, bots(2), 1);
  let res;
  for (let r = 0; r < m.maxRounds; r++) {
    const w = m.nextRound();
    w.result = { winner: -1, ranking: [0, 1] };
    res = m.endRound(w);
  }
  assert.ok(m.over);
  assert.equal(res.matchWinner, 0);
});

test('first to the target wins Last Blob Standing', () => {
  const m = new Match({ mode: 'lbs', target: { lbs: 2 } }, bots(3), 1);
  const win = (i) => { const w = m.nextRound(); w.result = { winner: i, ranking: [i] }; return m.endRound(w); };
  assert.equal(win(1).matchWinner, -1);
  assert.equal(win(2).matchWinner, -1);
  assert.equal(win(1).matchWinner, 1);
  assert.deepEqual(m.ranking.slice(0, 2), [1, 2]);
});

test('settings are cleaned up from bad saves', () => {
  const s = cleanSettings({ mode: 'nope', arena: 'moon', bots: 9, botLevel: 'ultra', target: { lbs: -1, koth: 40 }, powerups: false });
  assert.equal(s.mode, 'lbs');
  assert.equal(s.arena, 'cycle');
  assert.equal(s.bots, 3);
  assert.equal(s.botLevel, 'normal');
  assert.equal(s.target.lbs, defaultSettings().target.lbs);
  assert.equal(s.target.koth, 40);
  assert.equal(s.powerups, false);
  assert.deepEqual(cleanSettings(null), defaultSettings());
});
