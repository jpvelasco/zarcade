import test from 'node:test';
import assert from 'node:assert/strict';
import { idealShot, simulate, applyInput, outcome, meterPower } from '../src/shots.js';
import { Round } from '../src/round.js';
import { timedRules, racksRules } from '../src/modes.js';
import { rng } from '../src/rng.js';

// A noisy-flick harness: the perfect flick for each of the game's real shot
// spots (Hot Shot and Money Racks, on Earth and in low gravity) plus seeded
// Gaussian error, fed through the same applyInput the game uses. Spread is
// in flick terms: aim in screen radians, power in log2 of flick speed.
const SKILL = {
  sloppy: { aim: 0.26, power: 0.5 }, // about 15° and ±40 % speed: a small kid
  average: { aim: 0.157, power: 0.28 }, // about 9° and ±20 %
  good: { aim: 0.087, power: 0.15 }, // about 5° and ±11 %: a practised player
};

const SPOTS = (() => {
  const out = [];
  for (const court of ['park', 'space']) {
    for (const rules of [timedRules(court), racksRules(court)]) {
      const round = new Round(rules, { countdown: false });
      for (let i = 0; i < rules.spots.length; i++) {
        round.spotIndex = i;
        const setup = round.shotSetup();
        out.push({ setup, ideal: idealShot(setup) });
      }
    }
  }
  return out;
})();

const scores = ({ setup, ideal }, aimErr, powerErr, easy = false) => outcome(simulate(setup, applyInput(ideal, aimErr, powerErr, easy)).ball).made;

function makeRate(skill, { easy = false, perSpot = 80, seed = 354 } = {}) {
  const r = rng(seed);
  let made = 0, n = 0;
  for (const spot of SPOTS) {
    for (let i = 0; i < perSpot; i++) {
      if (scores(spot, r.gauss() * skill.aim, r.gauss() * skill.power, easy)) made++;
      n++;
    }
  }
  return made / n;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

test('every real spot has a perfect flick that scores', () => {
  assert.equal(SPOTS.length, 22);
  for (const spot of SPOTS) {
    assert.ok(spot.ideal);
    assert.ok(scores(spot, 0, 0));
  }
});

test('accuracy matters: sloppy, average and good flicks land in their make-rate bands', () => {
  const sloppy = makeRate(SKILL.sloppy), average = makeRate(SKILL.average), good = makeRate(SKILL.good);
  const msg = `sloppy ${pct(sloppy)}, average ${pct(average)}, good ${pct(good)}`;
  assert.ok(sloppy >= 0.3 && sloppy <= 0.45, msg);
  assert.ok(average >= 0.55 && average <= 0.7, msg);
  assert.ok(good >= 0.85, msg);
  assert.ok(good - average >= 0.15 && average - sloppy >= 0.15, msg);
});

test('easy aim still lets a sloppy flicker score most shots', () => {
  const easy = makeRate(SKILL.sloppy, { easy: true });
  assert.ok(easy >= 0.6, `sloppy with easy aim ${pct(easy)}`);
});

test('aim is not free: 5° off always scores, 15° off almost never does', () => {
  const DEG = Math.PI / 180;
  for (const spot of SPOTS) for (const a of [-5, 5]) assert.ok(scores(spot, a * DEG, 0), `${a}°`);
  let made15 = 0;
  for (const spot of SPOTS) for (const a of [-15, 15]) if (scores(spot, a * DEG, 0)) made15++;
  assert.ok(made15 / (SPOTS.length * 2) <= 0.1, `15° off still scored ${made15} of ${SPOTS.length * 2}`);
  // Easy aim halves the error, so the same 15° flick goes in.
  for (const spot of SPOTS) for (const a of [-15, 15]) assert.ok(scores(spot, a * DEG, 0, true), `easy ${a}°`);
});

test('a flick within 15 % of the ideal speed always scores; half speed never does', () => {
  for (const spot of SPOTS) {
    for (const x of [0.87, 1.15]) assert.ok(scores(spot, 0, Math.log2(x)), `x${x}`);
    assert.equal(scores(spot, 0, -1), false, 'half speed');
  }
});

test('keyboard meter: the green band always scores and the red ends rarely do', () => {
  for (const spot of SPOTS) for (const v of [0.5 - 0.069, 0.5, 0.5 + 0.069]) assert.ok(scores(spot, 0, meterPower(v)), `v ${v}`);
  let ends = 0;
  for (const spot of SPOTS) for (const v of [0, 0.1, 0.9, 1]) if (scores(spot, 0, meterPower(v))) ends++;
  assert.ok(ends / (SPOTS.length * 4) <= 0.25, `red-end presses scored ${ends} of ${SPOTS.length * 4}`);
  assert.ok(meterPower(1) > 0 && meterPower(0) < 0 && meterPower(0.5) === 0);
});

test('the flick harness is deterministic', () => {
  assert.equal(makeRate(SKILL.average, { perSpot: 20 }), makeRate(SKILL.average, { perSpot: 20 }));
});
