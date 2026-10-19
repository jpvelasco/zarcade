import test from 'node:test';
import assert from 'node:assert/strict';
import { Round, COUNTDOWN, FIRE_RUN } from '../src/round.js';
import { timedRules, racksRules, movingRules, trickRules, TRICK_LEVELS, MOTIONS } from '../src/modes.js';
import { idealShot, applyInput } from '../src/shots.js';
import { STEP } from '../src/physics.js';

// Shoot the ideal (optionally spoiled) whenever possible.
function perfect(round, spoil = () => null) {
  if (!round.canShoot()) return;
  const ideal = idealShot(round.shotSetup(), { lead: true });
  const bad = spoil(round);
  round.shoot(bad ? applyInput(ideal, bad.aim || 0, bad.power || 0) : ideal);
}

test('the countdown runs before play starts', () => {
  const round = new Round(timedRules('park', 10));
  assert.equal(round.status, 'countdown');
  assert.equal(round.canShoot(), false);
  round.run(COUNTDOWN + 0.05);
  assert.equal(round.status, 'play');
  assert.ok(round.events.some((e) => e.type === 'go'));
});

test('a timed round ends at the buzzer once balls land, and swishes score 3', () => {
  const round = new Round(timedRules('park', 12), { countdown: false });
  round.run(30, (r) => perfect(r));
  assert.equal(round.status, 'done');
  assert.ok(round.stats.shots >= 8);
  assert.equal(round.stats.makes, round.stats.shots);
  assert.equal(round.stats.swishes, round.stats.makes);
  // 3 per swish, doubled for balls shot while on fire (after FIRE_RUN swishes).
  const scores = round.events.filter((e) => e.type === 'score');
  for (const s of scores) assert.equal(s.points, s.fire ? 6 : 3);
  assert.equal(scores.slice(0, FIRE_RUN).filter((s) => s.fire).length, 0);
  assert.ok(scores.at(-1).fire);
  assert.equal(round.score, scores.reduce((a, s) => a + s.points, 0));
  assert.equal(round.stats.fires, 1);
});

test('three swishes light the ball; a miss puts it out', () => {
  const round = new Round(timedRules('park', 20), { countdown: false });
  let n = 0;
  round.run(20, (r) => perfect(r, () => (n++ === 4 ? { power: -2.5 } : null)));
  const types = round.events.map((e) => e.type);
  const fire = types.indexOf('fire'), out = types.indexOf('fireout');
  assert.ok(fire >= 0 && out > fire, types.join(','));
});

test('spots change after three makes and the camera event fires', () => {
  const round = new Round(timedRules('park', 15), { countdown: false });
  round.run(15, (r) => perfect(r));
  assert.ok(round.events.filter((e) => e.type === 'spot').length >= 2);
});

test('money racks: 25 balls, five racks, last ball of each rack is worth 2', () => {
  const round = new Round(racksRules('park', 120), { countdown: false });
  // Miss every third shot so fire never doubles things.
  let n = 0;
  round.run(120, (r) => perfect(r, () => (n++ % 3 === 2 ? { power: -3 } : null)));
  assert.equal(round.status, 'done');
  assert.equal(round.stats.shots, 25);
  assert.equal(round.events.filter((e) => e.type === 'rack').length, 4);
  const scores = round.events.filter((e) => e.type === 'score');
  for (const s of scores) assert.equal(s.points, (s.money ? 2 : 1) * (s.fire ? 2 : 1));
  assert.ok(scores.some((s) => s.money));
});

test('moving hoop rounds are winnable by leading the hoop', () => {
  const round = new Round(movingRules('beach', 20, MOTIONS.swing), { countdown: false });
  round.run(30, (r) => perfect(r));
  assert.ok(round.stats.makes / round.stats.shots > 0.9);
});

test('balls in the air at the buzzer still count', () => {
  const round = new Round(timedRules('park', 1.2), { countdown: false });
  round.run(1.1);
  perfect(round);
  round.run(5);
  assert.equal(round.stats.buzzer, 1);
  assert.ok(round.events.some((e) => e.type === 'score' && e.buzzer));
});

test('running out of balls with time left is not a buzzer beater', () => {
  const trick = new Round(trickRules(TRICK_LEVELS[4], 'park'), { countdown: false });
  trick.run(90, (r) => perfect(r));
  assert.ok(trick.stats.valid >= 6);
  assert.equal(trick.stats.buzzer, 0);
  const racks = new Round(racksRules('park', 60), { countdown: false });
  racks.run(60, (r) => perfect(r));
  assert.equal(racks.status, 'done');
  assert.ok(racks.timeLeft > 5);
  assert.equal(racks.stats.buzzer, 0);
});

test('every trick-shot level is solvable for three stars, on every court gravity', () => {
  for (const level of TRICK_LEVELS) {
    for (const court of ['park', 'space']) {
      const round = new Round(trickRules(level, court), { countdown: false });
      round.run(90, (r) => perfect(r));
      assert.equal(round.status, 'done', level.id);
      assert.ok(round.stats.valid >= level.stars[2], `${level.id} on ${court}: ${round.stats.valid}`);
    }
  }
});

test('bank levels refuse plain swishes', () => {
  const level = TRICK_LEVELS.find((l) => l.type === 'bank');
  const round = new Round(trickRules(level, 'park'), { countdown: false });
  round.run(1);
  // A straight swish shot (no board).
  const s = round.shotSetup();
  round.shoot(idealShot({ ...s, kind: 'normal', elev: 55 * Math.PI / 180 }));
  round.run(4);
  assert.equal(round.stats.valid, 0);
  assert.ok(round.events.some((e) => e.type === 'invalid'));
});

test('blockers swat short lobs', () => {
  const level = TRICK_LEVELS.find((l) => l.id === 'block1');
  const round = new Round(trickRules(level, 'park'), { countdown: false });
  perfect(round, () => ({ power: -1.2 }));
  round.run(4);
  assert.ok(round.events.some((e) => e.type === 'blocker'));
  assert.equal(round.stats.valid, 0);
});

test('rounds replay identically', () => {
  const play = () => {
    const round = new Round(movingRules('space', 15, MOTIONS.bob), { countdown: false });
    let n = 0;
    round.run(25, (r) => perfect(r, () => ({ aim: Math.sin(n) * 0.5, power: Math.cos(n++ * 1.7) * 0.8 })));
    return JSON.stringify([round.score, round.stats]);
  };
  assert.equal(play(), play());
});

test('a round never steps past done', () => {
  const round = new Round(timedRules('park', 0.5), { countdown: false });
  round.run(3);
  assert.equal(round.status, 'done');
  const t = round.time;
  round.step(STEP);
  assert.equal(round.time, t);
});
