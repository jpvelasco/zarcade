import test from 'node:test';
import assert from 'node:assert/strict';
import { Rules, PLANETS, SCORE, TIMES, BALLS_PER_GAME, fmt } from '../src/rules.js';

function game(seed = 3) {
  const r = new Rules({ seed });
  r.newGame();
  r.startBall();
  r.events.length = 0;
  return r;
}
const callouts = (r) => r.events.filter((e) => e.type === 'callout').map((e) => e.kind);
const tick = (r, seconds) => { for (let t = 0; t < seconds; t += 0.05) r.update(0.05); };

test('a new game has three balls, no score, and one planet lit', () => {
  const r = game();
  assert.equal(BALLS_PER_GAME, 3);
  assert.equal(r.ball, 1);
  assert.equal(r.score, 0);
  assert.equal(r.planetsLit.filter(Boolean).length, 1);
  assert.equal(r.kickbackLit, true);
});

test('skill shot: the lit lane on the plunge scores 500,000, any other switch cancels it', () => {
  const r = game();
  r.onLaunch();
  r.onSwitch(`lane${r.skill.lane}`);
  assert.ok(callouts(r).includes('skill'));
  assert.equal(r.score, SCORE.skill + SCORE.lane);

  const miss = game();
  miss.onLaunch();
  miss.onSwitch('bumper');
  miss.onSwitch(`lane${miss.skill.lane}`);
  assert.ok(!callouts(miss).includes('skill'));

  // Only the first launch of a ball arms it.
  const again = game();
  again.onLaunch();
  again.onSwitch('sling');
  again.onLaunch();
  again.onSwitch(`lane${again.skill.lane}`);
  assert.ok(!callouts(again).includes('skill'));
});

test('flipper lane change moves the skill lane in the shooter, and the lit lanes in play', () => {
  const r = game();
  const lane = r.skill.lane;
  r.laneChange(1, true);
  assert.equal(r.skill.lane, (lane + 1) % 3);
  r.onLaunch();
  r.onSwitch('bumper');
  r.lanes = [true, false, false];
  r.laneChange(1, false);
  assert.deepEqual(r.lanes, [false, true, false]);
  r.laneChange(-1, false);
  assert.deepEqual(r.lanes, [true, false, false]);
});

test('completing U-F-O raises the bonus multiplier and lights a planet', () => {
  const r = game();
  r.planetsLit = PLANETS.map(() => false);
  for (const i of [0, 1, 2]) r.onSwitch(`lane${i}`);
  assert.equal(r.bonusX, 2);
  assert.deepEqual(r.lanes, [false, false, false]);
  assert.equal(r.planetsLit.filter(Boolean).length, 1);
  assert.ok(callouts(r).includes('lanes'));
  for (let k = 0; k < 6; k++) for (const i of [0, 1, 2]) r.onSwitch(`lane${i}`);
  assert.equal(r.bonusX, 5, 'capped at 5x');
});

test('Planet Tour: shoot lit planets; all five award the tour and light Extra Ball', () => {
  const r = game();
  let visits = 0;
  for (let guard = 0; guard < 20 && !r.missions.tour; guard++) {
    const i = r.planetsLit.findIndex(Boolean);
    assert.ok(i >= 0, 'a planet is always lit while the tour is running');
    const shot = PLANETS[i].shot;
    if (shot === 'blackHole') r.onHole(); else r.onSwitch(shot === 'ramp' ? 'ramp' : shot);
    visits++;
    r.combo.timer = 0; // keep combos out of the way
  }
  assert.equal(visits, 5);
  assert.equal(r.tours, 1);
  assert.ok(r.extraBallLit);
  assert.ok(callouts(r).includes('tour'));
  assert.equal(r.planetsVisited.filter(Boolean).length, 0, 'the next tour starts fresh');
  // An unlit shot does not visit.
  const before = r.planetsVisited.slice();
  const unlit = PLANETS.findIndex((p, i) => !r.planetsLit[i] && p.shot === 'leftOrbit');
  if (unlit >= 0) {
    r.onSwitch('leftOrbit');
    assert.deepEqual(r.planetsVisited, before);
  }
});

test('extra ball is collected at the Black Hole and shoots again at the end of the ball', () => {
  const r = game();
  r.extraBallLit = true;
  assert.equal(r.onHole(), 'eject');
  assert.equal(r.extraBalls, 1);
  assert.ok(callouts(r).includes('extraBall'));
  assert.equal(r.onDrain(0), 'endBall');
  const bonus = r.endBall();
  assert.equal(bonus.next, 'shootAgain');
  assert.equal(r.ball, 1);
});

test('Asteroid Field: three targets start a 20 s frenzy where every switch scores big', () => {
  const r = game();
  r.onSwitch('target0');
  r.onSwitch('target0'); // already down: ignored
  r.onSwitch('target1');
  assert.equal(r.frenzy, 0);
  r.onSwitch('target2');
  assert.equal(r.frenzy, TIMES.frenzy);
  assert.ok(r.missions.frenzy);
  const before = r.score;
  r.onSwitch('sling');
  assert.equal(r.score - before, SCORE.sling + SCORE.frenzySwitch);
  r.events.length = 0;
  tick(r, TIMES.frenzy + 0.1);
  assert.equal(r.frenzy, 0);
  assert.ok(r.events.some((e) => e.type === 'resetTargets'));
  assert.deepEqual(r.targetsDown, [false, false, false]);
  const after = r.score;
  r.onSwitch('sling');
  assert.equal(r.score - after, SCORE.sling);
});

test('Black Hole: ramp lights lock, two locks start multiball, jackpots then a super jackpot', () => {
  const r = game();
  assert.equal(r.onHole(), 'eject', 'lock not lit yet');
  r.onSwitch('ramp');
  assert.ok(r.lockLit);
  assert.equal(r.onHole(), 'lock');
  assert.equal(r.locked, 1);
  assert.equal(r.onHole(), 'eject', 'needs the ramp again');
  r.onSwitch('ramp');
  assert.equal(r.onHole(), 'multiball');
  assert.ok(r.multiball && r.missions.multiball);
  assert.ok(r.ballSave >= TIMES.multiballSave);
  const jackpot = r.jackpotValue;
  const before = r.score;
  r.combo.timer = 0;
  r.onSwitch('leftOrbit');
  assert.ok(r.score - before >= jackpot + SCORE.orbit);
  assert.equal(r.jackpotValue, jackpot + SCORE.jackpotStep);
  r.onSwitch('ramp');
  r.onSwitch('rightOrbit');
  assert.ok(r.superLit);
  r.events.length = 0;
  r.onHole();
  assert.ok(callouts(r).includes('super'));
  // Losing balls down to one ends multiball.
  r.ballSave = 0;
  assert.equal(r.onDrain(2), 'continue');
  assert.ok(r.multiball);
  assert.equal(r.onDrain(1), 'continue');
  assert.ok(!r.multiball);
});

test('ball save returns a drained ball once, only while the timer runs', () => {
  const r = game();
  r.onLaunch();
  tick(r, TIMES.ballSave - 1);
  assert.equal(r.onDrain(0), 'save');
  assert.equal(r.onDrain(0), 'endBall', 'one save per ball');
  const late = game();
  late.onLaunch();
  tick(late, TIMES.ballSave + 0.5);
  assert.equal(late.onDrain(0), 'endBall');
});

test('tilt: two warnings, then the ball is lost with no scoring and no bonus', () => {
  const r = game();
  r.onSwitch('lane0');
  const results = [];
  for (let i = 0; i < 12 && !r.tilted; i++) results.push(r.nudge());
  assert.ok(results.filter((x) => x === 'danger').length === 2, results.join(','));
  assert.equal(results.at(-1), 'tilt');
  const score = r.score;
  r.onSwitch('bumper');
  assert.equal(r.score, score, 'no scoring while tilted');
  assert.equal(r.onDrain(0), 'endBall');
  assert.equal(r.endBall().total, 0);
  // Gentle nudging with time to settle never tilts.
  const calm = game();
  for (let i = 0; i < 20; i++) { assert.equal(calm.nudge(), 'ok'); tick(calm, 2); }
});

test('the end-of-ball bonus counts this ball and is multiplied', () => {
  const r = game();
  for (let i = 0; i < 10; i++) r.onSwitch('spin');
  r.onSwitch('target0');
  r.bonusX = 3;
  const score = r.score;
  const b = r.endBall();
  assert.equal(b.total, (10 * 1000 + 5000 + 0) * 3);
  assert.equal(r.score, score + b.total);
  assert.equal(b.next, 'nextBall');
  assert.equal(r.ball, 2);
});

test('three balls then game over', () => {
  const r = game();
  const nexts = [];
  for (let i = 0; i < 3; i++) { nexts.push(r.endBall().next); if (!r.gameOver) r.startBall(); }
  assert.deepEqual(nexts, ['nextBall', 'nextBall', 'gameOver']);
  assert.ok(r.gameOver && !r.playing);
  const s = r.score;
  r.onSwitch('bumper');
  assert.equal(r.score, s, 'no scoring after the game');
});

test('combos: major shots within 4 s chain, and the chain breaks after', () => {
  const r = game();
  r.onSwitch('leftOrbit');
  r.onSwitch('rightOrbit');
  r.onSwitch('ramp');
  assert.equal(r.combo.count, 3);
  assert.equal(r.bestCombo, 3);
  tick(r, TIMES.combo + 0.1);
  r.onSwitch('leftOrbit');
  assert.equal(r.combo.count, 1);
});

test('kickback fires once, then the spinner relights it', () => {
  const r = game();
  assert.equal(r.useKickback(), true);
  assert.equal(r.useKickback(), false);
  for (let i = 0; i < 20; i++) r.onSwitch('spin');
  assert.equal(r.kickbackLit, true);
});

test('the same seed gives the same lit planets and mystery awards', () => {
  const a = game(11), b = game(11);
  assert.deepEqual(a.planetsLit, b.planetsLit);
  const picks = (r) => Array.from({ length: 8 }, () => r.mystery(null));
  assert.deepEqual(picks(a), picks(b));
});

test('scores format with thousands separators', () => {
  assert.equal(fmt(1234567), '1,234,567');
});
