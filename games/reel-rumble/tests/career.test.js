import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH, WATER } from '../src/data.js';
import { owns, speciesCaught } from '../src/gear.js';
import { autoShop, planOuting } from '../src/bot.js';
import { defaultSave, recordCatch } from '../src/progress.js';
import { settleQuests } from '../src/quests.js';
import { periodOf, weatherFor, advanceClock, nextPeriodHour } from '../src/spawn.js';
import { mulberry32 } from '../src/rng.js';
import { playCast } from './helpers.js';

// A bot angler plays a few hundred casts the way a player would: shop for
// upgrades, pick a spot and bait for fish it hasn't caught, wait when
// nothing new is around.
function career(casts, seed = 7) {
  const save = defaultSave();
  const rng = mulberry32(seed);
  const log = [];
  for (let c = 0; c < casts; c++) {
    autoShop(save);
    let plan = planOuting(save, rng);
    if (plan.score < 6) {
      save.clock = advanceClock(save.clock, nextPeriodHour(save.clock.hour) - save.clock.hour);
      plan = planOuting(save, rng);
    }
    save.equip.bait = plan.bait;
    const period = periodOf(save.clock.hour, plan.water);
    const weather = weatherFor(plan.water, save.clock.day, save.clock.hour);
    const { trip, outcome } = playCast({ water: plan.water, period, weather, equip: save.equip }, { seed: seed * 1000 + c, skill: 0.85, maxSeconds: 120 });
    save.stats.casts++;
    if (outcome === 'landed') {
      recordCatch(save, trip.result);
      settleQuests(save, { result: trip.result, water: plan.water, period, weather });
    } else if (outcome === 'lost') save.stats.lost++;
    assert.ok(save.coins >= 0);
    save.clock = advanceClock(save.clock, 0.5);
    log.push(plan.water);
  }
  return { save, log };
}

test('a bot angler fills a sensible part of the collection', () => {
  const { save, log } = career(260);
  const n = speciesCaught(save);
  assert.ok(n >= FISH.length * 0.5, `caught ${n} species`);
  assert.ok(n < FISH.length, 'but not everything right away');
  assert.ok(owns(save, 'boat', 'canoe') && owns(save, 'boat', 'sailboat'), 'bought boats to new waters');
  for (const w of ['pond', 'river', 'coral']) assert.ok(log.includes(w), `fished at ${WATER[w].name}`);
  assert.ok(save.quests.length >= 6, `finished ${save.quests.length} quests`);
  assert.ok(save.stats.caught > 200, 'most casts catch something');
});
