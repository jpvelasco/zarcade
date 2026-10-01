import test from 'node:test';
import assert from 'node:assert/strict';
import { createFight, stepFight, readout } from '../src/fight.js';
import { fightControls } from '../src/bot.js';
import { FISH, FISH_BY_ID } from '../src/data.js';
import { gearStats } from '../src/gear.js';
import { mulberry32 } from '../src/rng.js';

const DT = 1 / 60;
const STARTER = gearStats({ rod: 'twig', reel: 'clicker', line: 'cotton', bait: 'worm' });
const MID = gearStats({ rod: 'fiberglass', reel: 'gearmaster', line: 'braid', bait: 'worm' });
const BEST = gearStats({ rod: 'starlight', reel: 'tidal', line: 'silk', bait: 'worm' });

function fight(fish, stats, policy, seed = 1, t = 0.5) {
  const rng = mulberry32(seed);
  const f = createFight(fish, t, stats, rng, { dist: 20 });
  const memo = {};
  const events = [];
  for (let i = 0; i < 60 * 300 && !f.outcome; i++) {
    stepFight(f, DT, policy(f, memo));
    events.push(...f.events.map((e) => e.type));
    f.events.length = 0;
  }
  return { f, events };
}
const bot = (f, memo) => fightControls(f, memo);

test('a good angler lands a common fish on starter gear', () => {
  for (const id of ['bluegill', 'shiner', 'chub', 'clownfish', 'smelt', 'glowfin']) {
    const { f } = fight(FISH_BY_ID[id], STARTER, bot);
    assert.equal(f.outcome, 'landed', id);
  }
});

test('the line snaps when you crank too hard on a big fish', () => {
  const { f, events } = fight(FISH_BY_ID.pike, STARTER, () => ({ reel: 1, steer: 0 }));
  assert.equal(f.outcome, 'snapped');
  assert.ok(events.includes('snapped'));
});

test('the fish wriggles free if you never reel', () => {
  const { f } = fight(FISH_BY_ID.bluegill, STARTER, () => ({ reel: 0, steer: 0 }));
  assert.equal(f.outcome, 'escaped');
});

test('holding and letting go (no analog control) can still win', () => {
  // A player-like policy: hold while the needle is low, let go when high or jumping.
  const human = (f) => {
    const r = readout(f);
    const air = r.phase === 'rise' || r.phase === 'jump';
    return { reel: !air && r.frac < (r.low + r.high) / 2 ? 1 : 0, steer: 0 };
  };
  for (const id of ['bluegill', 'perch', 'bass', 'rainbow']) {
    let wins = 0;
    for (let s = 1; s <= 6; s++) if (fight(FISH_BY_ID[id], MID, human, s).f.outcome === 'landed') wins++;
    assert.ok(wins >= 5, `${id} ${wins}/6`);
  }
});

test('steering against the run tires the fish faster', () => {
  const noSteer = (f, memo) => ({ ...fightControls(f, memo), steer: 0 });
  let a = 0, b = 0;
  for (let s = 1; s <= 8; s++) {
    a += fight(FISH_BY_ID.carp, MID, bot, s).f.time;
    b += fight(FISH_BY_ID.carp, MID, noSteer, s).f.time;
  }
  assert.ok(a < b, `steered ${a.toFixed(1)}s vs ${b.toFixed(1)}s`);
});

test('every non-legendary fish can be landed with the best gear', () => {
  for (const fish of FISH.filter((f) => f.rarity !== 'legendary')) {
    let wins = 0;
    for (let s = 1; s <= 4; s++) if (fight(fish, BEST, bot, s, 1).f.outcome === 'landed') wins++;
    assert.ok(wins >= 3, `${fish.id} ${wins}/4`);
  }
});

test('legendary fights have three rounds, a special move, and are winnable with top gear', () => {
  for (const fish of FISH.filter((f) => f.rarity === 'legendary')) {
    let wins = 0, specials = 0;
    for (let s = 1; s <= 6; s++) {
      const { f, events } = fight(fish, BEST, bot, s, 1);
      if (f.outcome === 'landed') {
        wins++;
        assert.equal(events.filter((e) => e === 'stage').length, 2, `${fish.id} three rounds`);
      }
      if (events.includes('special')) specials++;
    }
    assert.ok(wins >= 5, `${fish.id} won ${wins}/6`);
    assert.ok(specials >= 3, `${fish.id} uses its special move`);
  }
});

test('legends are too strong for starter gear', () => {
  for (const fish of FISH.filter((f) => f.rarity === 'legendary')) {
    const { f } = fight(fish, STARTER, bot, 1, 0.5);
    assert.equal(f.outcome, 'snapped', fish.id);
  }
});

test('fights are deterministic for a seed', () => {
  const a = fight(FISH_BY_ID.marlin, BEST, bot, 3);
  const b = fight(FISH_BY_ID.marlin, BEST, bot, 3);
  assert.equal(a.f.time, b.f.time);
  assert.deepEqual(a.events, b.events);
});
