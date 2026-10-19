// A solver that plays a round by clicking, used three ways: as a test that
// every hidden thing really can be found, as the ?autopilot demo, and as the
// quiet attract loop behind the title screen.
import { hitTest } from './scene.js';
import { diffHitTest } from './modes.js';
import { Rng } from './rng.js';

// Click the middle of every target's visible blob and check the click lands on
// that target and no other. Returns a report rather than throwing.
export function autoplay(scene, { tolerance = 20 } = {}) {
  const order = scene.targets.slice();
  const report = { clicks: 0, found: [], wrong: [], missed: [] };
  for (const t of order) {
    report.clicks++;
    const got = hitTest(scene, t.hit.x, t.hit.y, tolerance);
    if (!got) report.missed.push(t.id);
    else if (got !== t) report.wrong.push({ wanted: t.id, got: got.id });
    else { got.found = true; report.found.push(t.id); }
  }
  report.solved = report.missed.length === 0 && report.wrong.length === 0;
  return report;
}

export function autoplayDiff(diff, { tolerance = 20 } = {}) {
  const report = { clicks: 0, found: [], missed: [] };
  for (const c of diff.changes) {
    report.clicks++;
    const got = diffHitTest(diff, c.cx, c.cy, tolerance);
    if (!got) report.missed.push(c.index);
    else { got.found = true; report.found.push(got.index); }
  }
  report.solved = report.missed.length === 0;
  return report;
}

// A paced version for the screen: one find every so often, with a little
// wandering in between so it looks like somebody searching.
export class Bot {
  constructor({ seed = 1, pace = 1.5 } = {}) {
    this.rng = new Rng(seed);
    this.pace = pace;
    this.wait = 0.9;
    this.look = { x: 0, y: 0 };
    this.goal = null;
  }

  // Returns a click position when it is time to pick something up.
  step(dt, openTargets) {
    this.wait -= dt;
    if (!openTargets.length) return null;
    if (!this.goal || this.goal.found || !openTargets.includes(this.goal)) {
      this.goal = this.rng.pick(openTargets);
      this.look.x = this.goal.hit.x + this.rng.range(-220, 220);
      this.look.y = this.goal.hit.y + this.rng.range(-160, 160);
    }
    // Drift the gaze towards the goal, then pounce.
    this.look.x += (this.goal.hit.x - this.look.x) * Math.min(1, dt * 3);
    this.look.y += (this.goal.hit.y - this.look.y) * Math.min(1, dt * 3);
    if (this.wait > 0) return null;
    this.wait = this.pace * this.rng.range(0.7, 1.3);
    const g = this.goal;
    this.goal = null;
    return { x: g.hit.x, y: g.hit.y };
  }
}
