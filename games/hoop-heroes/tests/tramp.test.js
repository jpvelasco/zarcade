import test from 'node:test';
import assert from 'node:assert/strict';
import { idealShot, simulate, applyInput, outcome, idealFlick, flickTarget, flickInput, meterPower } from '../src/shots.js';
import { screenProjector } from '../src/render.js';
import { measureFlick, isDownSwipe } from '../src/input.js';
import { Round } from '../src/round.js';
import { trickRules, TRICK_LEVELS } from '../src/modes.js';
import { rng } from '../src/rng.js';

// Trampoline levels flicked the way the game teaches ("Flick up toward the
// hoop", and the levels' "toss it gently"), through the same screen mapping
// as play: the renderer's camera, flickTarget and flickInput.
const REF = 2.7; // the default comfortable flick, screen heights per second
const DEG = Math.PI / 180;
const SCREENS = [[1280, 800], [390, 844]];
const LEVELS = TRICK_LEVELS.filter((l) => l.type === 'tramp');

function shot(level, [W, H]) {
  const round = new Round(trickRules(level), { countdown: false });
  const setup = round.shotSetup(), ideal = idealShot(setup);
  const s = round.shooterPos();
  const P = screenProjector(W, H, s.x, s.z, round.hoop.x, round.hoop.z);
  const B = P(round.releasePoint()), hoop = P(round.hoop), pad = P(ideal.aim), A = P(flickTarget(setup, ideal));
  const up = Math.atan2(hoop.x - B.x, -(hoop.y - B.y)); // screen direction to the hoop
  // A flick `deg` off the line to the hoop at `x` times the ideal flick speed.
  const flick = (deg, x = 1) => {
    const a = up + deg * DEG;
    return { dirX: Math.sin(a), dirY: -Math.cos(a), speed: idealFlick(ideal, setup.g, REF) * x };
  };
  const scores = (f, easy = false) => {
    const { aimErr, powerErr, sens } = flickInput(f, B, A, setup, ideal, REF);
    const o = outcome(simulate(setup, applyInput(ideal, aimErr, powerErr, easy, sens)).ball);
    return o.made && o.tramp;
  };
  return { setup, ideal, B, pad, A, flick, scores };
}

test('the pad sits below the ball on screen, so flicks head up toward the hoop instead', () => {
  for (const level of LEVELS) for (const screen of SCREENS) {
    const { B, pad, A } = shot(level, screen);
    assert.ok(pad.y > B.y, `${level.id}: pad below the ball`);
    assert.ok(A.y < B.y - 50 && Math.abs(A.x - B.x) < 1, `${level.id} ${screen}: flick target straight up`);
  }
});

test('a clean flick up toward the hoop bounces in on every trampoline level', () => {
  for (const level of LEVELS) for (const screen of SCREENS) {
    const { scores, flick } = shot(level, screen);
    assert.ok(scores(flick(0)), `${level.id} at ${screen.join('×')}`);
  }
});

test('trampoline flicks have the same skill curve as other shots', () => {
  for (const level of LEVELS) {
    const { scores, flick } = shot(level, SCREENS[1]);
    for (const d of [-7, 7]) assert.ok(scores(flick(d)), `${level.id} ${d}°`);
    for (const x of [0.833, 1.2]) assert.ok(scores(flick(0, x)), `${level.id} x${x}`);
    for (const d of [-15, 15]) assert.equal(scores(flick(d)), false, `${level.id} ${d}° should miss`);
  }
});

test('clearly wrong flicks miss: well off to the side, or far too soft', () => {
  for (const level of LEVELS) for (const screen of SCREENS) {
    const { scores, flick } = shot(level, screen);
    for (const d of [-25, 25]) assert.equal(scores(flick(d)), false, `${level.id} ${d}°`);
    assert.equal(scores(flick(0, 0.5)), false, `${level.id} half speed`);
  }
});

test('swiping down at the pad is not a shot, and is told apart from a tap', () => {
  const drag = (pts) => ({ samples: pts.map(([x, y, t]) => ({ x, y, t })), t0: pts[0][2], x0: pts[0][0], y0: pts[0][1] });
  const down = drag([[200, 500, 0], [205, 600, 60], [210, 700, 120]]);
  assert.equal(measureFlick(down, 120, 844), null);
  assert.ok(isDownSwipe(down));
  assert.equal(isDownSwipe(drag([[200, 500, 0], [203, 510, 80]])), false, 'tap');
  assert.equal(isDownSwipe(drag([[200, 500, 0], [320, 540, 80]])), false, 'sideways');
  assert.equal(isDownSwipe(drag([[200, 700, 0], [200, 500, 80]])), false, 'up');
});

test('noisy trampoline flicks land in the same make-rate bands as other shots', () => {
  const SKILL = { sloppy: [0.26, 0.5], average: [0.157, 0.28], good: [0.087, 0.15] };
  const rate = ([aim, power], easy = false) => {
    const r = rng(358);
    let made = 0, n = 0;
    for (const level of LEVELS) {
      const { scores, flick } = shot(level, SCREENS[1]);
      for (let i = 0; i < 120; i++) {
        if (scores(flick((r.gauss() * aim) / DEG, Math.pow(2, r.gauss() * power)), easy)) made++;
        n++;
      }
    }
    return made / n;
  };
  const sloppy = rate(SKILL.sloppy), average = rate(SKILL.average), good = rate(SKILL.good);
  const msg = `sloppy ${(sloppy * 100).toFixed(1)}%, average ${(average * 100).toFixed(1)}%, good ${(good * 100).toFixed(1)}%`;
  assert.ok(sloppy >= 0.25 && sloppy <= 0.45, msg);
  assert.ok(average >= 0.5 && average <= 0.72, msg);
  assert.ok(good >= 0.85, msg);
  assert.ok(rate(SKILL.sloppy, true) >= 0.6, 'easy aim helps');
});

test('keyboard meter shots on trampoline levels keep the plain gains: green scores', () => {
  for (const level of LEVELS) {
    const { setup, ideal } = shot(level, SCREENS[0]);
    for (const v of [0.431, 0.5, 0.569]) {
      const o = outcome(simulate(setup, applyInput(ideal, 0, meterPower(v))).ball);
      assert.ok(o.made && o.tramp, `${level.id} v ${v}`);
    }
  }
});
