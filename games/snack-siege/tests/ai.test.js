import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, dailyLevel } from '../src/levels.js';
import { Game } from '../src/game.js';
import { playLevel, candidates, searchShots } from '../src/ai.js';

// The autoplayer is the solvability check: it has to clear every level with
// the beans the level gives you.
for (const lv of LEVELS) {
  test(`autoplayer clears ${lv.id} ${lv.name}`, () => {
    const g = playLevel(new Game(lv));
    assert.equal(g.state, 'won', `${lv.id}: ${g.bearsLeft} bears left after ${g.shots} shots`);
    assert.ok(g.stars >= 1);
  });
}

test('Lime and Mint shots include a plain fling with the power unused', () => {
  const g = new Game(LEVELS[0]);
  for (const bean of ['lime', 'mint']) {
    g.queue[0] = bean;
    const list = candidates(g);
    assert.ok(list.some((s) => s.powerTick < 0), `${bean} plain fling`);
    assert.ok(list.some((s) => s.powerTick > 0), `${bean} power shot`);
  }
});

test('a quick search stops at the first winning shot', () => {
  const g = new Game(dailyLevel('2026-12-04'));
  const quick = [...searchShots(g, { quick: true })];
  const full = [...searchShots(g)];
  assert.equal(quick.at(-1).result.state, 'won');
  assert.equal(full.at(-1).result.state, 'won');
  assert.ok(quick.length < full.length, `${quick.length} of ${full.length} shots tried`);
});

test('candidate shots exist for every bean type', () => {
  for (const lv of LEVELS) assert.ok(candidates(new Game(lv)).length > 4, lv.id);
});
