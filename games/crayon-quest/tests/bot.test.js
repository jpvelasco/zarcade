// Balance check: a reasonable strategy wins sometimes, but not always, and
// clearly beats random play. Every run finishes (nothing gets stuck).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun } from '../src/run.js';
import { playRun } from '../src/bot.js';
import { HEROES } from '../src/data.js';

const RUNS = 40;

function sample(hero, random) {
  let wins = 0;
  let floors = 0;
  let pastPage1 = 0;
  let turns = 0;
  for (let s = 1; s <= RUNS; s++) {
    const run = playRun(newRun({ seed: s * 7919 + 13, hero }), { random, seed: s });
    assert.equal(run.phase, 'over', `${hero} seed ${s} finished`);
    if (run.result === 'won') wins++;
    if (run.floor > 0) pastPage1++;
    floors += run.floor;
    turns += run.stats.turns;
  }
  return { wins: wins / RUNS, floors: floors / RUNS, pastPage1: pastPage1 / RUNS, turns: turns / RUNS };
}

for (const h of HEROES) {
  test(`${h.name}: the playtest bot wins sometimes, not always`, () => {
    const smart = sample(h.id, false);
    assert.ok(smart.wins >= 0.15 && smart.wins <= 0.8, `win rate ${smart.wins}`);
    assert.ok(smart.pastPage1 >= 0.75, `most runs clear page 1 (${smart.pastPage1})`);
    // 15-25 minute runs: roughly 25-55 battle turns in a full climb.
    assert.ok(smart.turns >= 20 && smart.turns <= 60, `turns ${smart.turns}`);
  });
}

test('random play does clearly worse than the bot', () => {
  const smart = sample('kid', false);
  const random = sample('kid', true);
  assert.ok(random.wins < smart.wins);
  assert.ok(random.floors < smart.floors);
});
