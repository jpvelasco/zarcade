import test from 'node:test';
import assert from 'node:assert/strict';
import { idealShot, simulate, applyInput, outcome, ELEV, idealFlick, referenceSpeed } from '../src/shots.js';
import { RIM_Y } from '../src/physics.js';

const DEG = Math.PI / 180;
const hoop = (motion = null) => ({ x: 0, y: RIM_Y, z: 0, motion });
const setupAt = (d, a, g = 9.8, extra = {}) => ({
  p0: { x: d * Math.sin(a * DEG), y: 2.1, z: -d * Math.cos(a * DEG) }, g, hoop: hoop(), time: 0, kind: 'normal', elev: ELEV.normal, ...extra,
});

test('ideal shots swish from every spot, on Earth and in low gravity', () => {
  for (const g of [9.8, 4]) {
    for (const d of [3.8, 4.6, 5.5, 6.5]) {
      for (const a of [-70, -35, 0, 35, 70]) {
        const s = setupAt(d, a, g);
        const ideal = idealShot(s);
        assert.ok(ideal, `solvable ${d} ${a}`);
        const o = outcome(simulate(s, ideal).ball);
        assert.ok(o.swish, `swish from ${d} m at ${a}° (g ${g})`);
      }
    }
  }
});

test('slightly off shots still go in; way off shots miss', () => {
  const s = setupAt(4.6, 0);
  const ideal = idealShot(s);
  for (const pe of [-0.25, 0.25]) assert.ok(outcome(simulate(s, applyInput(ideal, 0, pe)).ball).made, `power ${pe}`);
  for (const ae of [-0.15, 0.15]) assert.ok(outcome(simulate(s, applyInput(ideal, ae, 0)).ball).made, `aim ${ae}`);
  assert.equal(outcome(simulate(s, applyInput(ideal, 0, -2)).ball).made, false, 'way too soft');
  assert.equal(outcome(simulate(s, applyInput(ideal, 0, 2)).ball).swish, false, 'way too hard');
  for (const ae of [-1, 1]) assert.equal(outcome(simulate(s, applyInput(ideal, ae, 0)).ball).made, false, `aim ${ae}`);
});

test('near misses rattle the rim believably', () => {
  const s = setupAt(4.6, 0);
  const ideal = idealShot(s);
  let rimMakes = 0, rimMisses = 0, swishes = 0;
  for (let pe = -1.4; pe <= 1.4; pe += 0.05) {
    const r = simulate(s, applyInput(ideal, 0, pe));
    const o = outcome(r.ball);
    if (o.swish) swishes++;
    else if (o.made && o.rim) rimMakes++;
    else if (!o.made && o.rim) rimMisses++;
    // The ball never ends up inside the rim's metal or below the floor.
    assert.ok(r.ball.p.y > 0.1);
  }
  assert.ok(swishes >= 4, `swishes ${swishes}`);
  assert.ok(rimMakes >= 1, `rim-in makes ${rimMakes}`);
  assert.ok(rimMisses >= 3, `rim-outs ${rimMisses}`);
});

test('easy aim halves the effect of a sloppy flick', () => {
  const s = setupAt(5, 20);
  const ideal = idealShot(s);
  const hard = applyInput(ideal, 0.4, 0.8, false), easy = applyInput(ideal, 0.4, 0.8, true);
  assert.ok(Math.abs(easy.yaw - ideal.yaw) < Math.abs(hard.yaw - ideal.yaw));
  assert.ok(Math.abs(easy.speed - ideal.speed) < Math.abs(hard.speed - ideal.speed));
});

test('bank shots solve to a board contact and go in', () => {
  for (const [d, a] of [[4.2, -35], [4.4, 38], [5.2, -45]]) {
    const s = setupAt(d, a, 9.8, { kind: 'bank', elev: ELEV.bank });
    const ideal = idealShot(s);
    assert.ok(ideal, `bank solvable ${d} ${a}`);
    assert.ok(ideal.aim.z > 0.3, 'aim point is on the board');
    const o = outcome(simulate(s, ideal).ball);
    assert.ok(o.made && o.bank, `bank from ${d} ${a}`);
  }
});

test('trampoline shots bounce in', () => {
  const s = setupAt(4.5, 0, 9.8, { kind: 'tramp', tramp: { x: 0, z: -4.5 * 0.6, r: 0.6 } });
  const ideal = idealShot(s);
  assert.ok(ideal);
  const o = outcome(simulate(s, ideal).ball);
  assert.ok(o.made && o.tramp);
});

test('leading a moving hoop: the lead shot goes in, aiming at where it is now misses', () => {
  const s = { ...setupAt(4.6, 0), hoop: hoop({ ax: 1.0, wx: 1.3 }), time: 0 };
  const lead = idealShot(s, { lead: true });
  assert.ok(outcome(simulate(s, lead).ball).made);
  const now = idealShot(s);
  assert.equal(outcome(simulate(s, now).ball).made, false);
});

test('deeper shots ask for a slightly harder flick', () => {
  const near = idealShot(setupAt(4, 0)), far = idealShot(setupAt(6.5, 0));
  assert.ok(idealFlick(far, 9.8, 2.4) > idealFlick(near, 9.8, 2.4));
  assert.ok(Math.abs(idealFlick(idealShot(setupAt(4.6, 0)), 9.8, 2.4) - 2.4) < 0.1);
  assert.ok(referenceSpeed(4) < referenceSpeed(9.8));
});
