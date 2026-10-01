import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, dailyLevel } from '../src/levels.js';
import { Game } from '../src/game.js';
import { playLevel, candidates } from '../src/ai.js';

// The autoplayer is the solvability check: it has to clear every level with
// the beans the level gives you.
for (const lv of LEVELS) {
  test(`autoplayer clears ${lv.id} ${lv.name}`, () => {
    const g = playLevel(new Game(lv));
    assert.equal(g.state, 'won', `${lv.id}: ${g.bearsLeft} bears left after ${g.shots} shots`);
    assert.ok(g.stars >= 1);
  });
}

test('autoplayer clears nearly every daily fort across a month', () => {
  let won = 0;
  const days = 30;
  for (let d = 0; d < days; d++) {
    const dt = new Date(2026, 9, 1 + d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    if (playLevel(new Game(dailyLevel(key))).state === 'won') won++;
  }
  assert.ok(won >= days - 1, `${won}/${days} daily forts cleared`);
});

test('candidate shots exist for every bean type', () => {
  for (const lv of LEVELS) assert.ok(candidates(new Game(lv)).length > 4, lv.id);
});
