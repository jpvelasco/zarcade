// The autoplayer: presses and releases planned from a chart. It plays the
// title-screen attract demo and, in the tests, proves every chart is
// playable to the beat. DOM-free.
import { rng } from './garden.js';

const TAP_HOLD = 0.06;

/** Press/release actions for a chart, sorted (releases first on ties). */
export function planActions(chart) {
  const actions = [];
  for (const n of chart.notes) {
    actions.push({ t: n.t, lane: n.lane, down: true });
    if (n.kind === 'tap') actions.push({ t: n.t + TAP_HOLD, lane: n.lane, down: false });
    else if (n.kind === 'hold') actions.push({ t: n.end + 0.02, lane: n.lane, down: false });
    else {
      // Walk the finger lane by lane towards the target, then let go.
      const step = n.slideTo > n.lane ? 1 : -1;
      const lanes = Math.abs(n.slideTo - n.lane);
      let prev = n.lane;
      for (let k = 1; k <= lanes; k++) {
        const lane = n.lane + step * k;
        const at = n.t + ((n.end - n.t) * k) / (lanes + 0.5);
        actions.push({ t: at, lane, down: true });
        actions.push({ t: at + 0.001, lane: prev, down: false });
        prev = lane;
      }
      actions.push({ t: n.end + 0.02, lane: n.slideTo, down: false });
    }
  }
  actions.sort((a, b) => a.t - b.t || Number(a.down) - Number(b.down));
  return actions;
}

/**
 * Feeds planned actions into a Session as time advances. `jitter(i)`
 * returns a timing error in seconds for action i (default 0); `quantize`
 * makes actions land on the frame that reaches them, like real input.
 */
export class Autoplayer {
  constructor(chart, { jitter = () => 0, quantize = false } = {}) {
    this.actions = planActions(chart);
    this.jitter = jitter;
    this.quantize = quantize;
    this.i = 0;
  }

  /** Apply every action due by time `t` to `session`. */
  drive(session, t) {
    while (this.i < this.actions.length && this.actions[this.i].t <= t) {
      const a = this.actions[this.i];
      const at = (this.quantize ? t : a.t) + (a.down ? this.jitter(this.i) : 0);
      if (a.down) session.press(a.lane, at);
      else session.release(a.lane, at);
      this.i++;
    }
  }

  get done() {
    return this.i >= this.actions.length;
  }
}

/** Play a chart start to finish at `fps` and return the session. */
export function simulate(Session, chart, { fps = 60, jitterMs = 0, seed = 1, quantize = false, noFail = true } = {}) {
  const session = new Session(chart, { noFail });
  const r = rng(seed);
  const pilot = new Autoplayer(chart, { quantize, jitter: () => ((r() + r() + r()) / 3 - 0.5) * 2 * (jitterMs / 1000) });
  const dt = 1 / fps;
  for (let t = -1; t < chart.length + 2; t += dt) {
    pilot.drive(session, t);
    session.update(t);
  }
  return session;
}
