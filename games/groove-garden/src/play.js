// One play of one chart: presses and releases in, judgements, combo, health
// and events out. Every call takes a song time in seconds, so the browser,
// the autoplayer and the tests all drive it the same way. DOM-free.
import { pathLanes } from './chart.js';
import { WINDOWS, TAIL_EARLY, REGRAB, judgeDelta } from './timing.js';
import { emptyCounts, accuracy, gradeFor, finalScore, WEIGHT } from './score.js';

const HEALTH = { perfect: 0.02, great: 0.012, good: 0.004, miss: -0.08 };
export const COMBO_MILESTONE = 25;

export class Session {
  constructor(chart, { noFail = true, windows = WINDOWS } = {}) {
    this.chart = chart;
    this.lanes = chart.lanes;
    this.windows = windows;
    this.noFail = noFail;
    this.notes = chart.notes.map((n) => ({ ...n, path: pathLanes(n), head: null, tail: null, delta: null, releasedAt: null }));
    this.down = new Array(this.lanes).fill(false);
    this.active = [];
    this.next = 0;
    this.counts = emptyCounts();
    this.combo = 0;
    this.maxCombo = 0;
    this.health = 1;
    this.failed = false;
    this.judged = 0;
    this.total = chart.judgements;
    this.recent = [];
    this.events = [];
    this.time = -Infinity;
  }

  /** A lane went down at song time `t`. Returns the judgement, if it hit a note. */
  press(lane, t) {
    if (!(lane >= 0 && lane < this.lanes)) return null;
    this.down[lane] = true;
    for (const h of this.active) {
      if (h.releasedAt !== null && h.path.includes(lane) && t - h.releasedAt <= REGRAB) h.releasedAt = null;
    }
    const w = this.windows.good;
    let pick = null;
    for (let i = this.next; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - t > w) break;
      if (n.head || n.lane !== lane || t - n.t > w) continue;
      pick = n;
      break;
    }
    if (!pick) {
      this.events.push({ type: 'tap', lane, t });
      return null;
    }
    const delta = t - pick.t;
    const j = judgeDelta(delta, this.windows);
    pick.head = j;
    pick.delta = delta;
    this.record(j, pick, t, 'hit', delta);
    if (pick.kind !== 'tap') this.active.push(pick);
    return j;
  }

  /** A lane came up at song time `t`. */
  release(lane, t) {
    if (!(lane >= 0 && lane < this.lanes)) return;
    this.down[lane] = false;
    for (const h of [...this.active]) {
      if (!h.path.includes(lane) || h.path.some((l) => this.down[l])) continue;
      if (t >= h.end - TAIL_EARLY) this.finishTail(h, t, lane);
      else h.releasedAt = t;
    }
  }

  /** Advance to song time `t`: late notes become misses, holds finish or break. */
  update(t) {
    this.time = t;
    const w = this.windows.good;
    while (this.next < this.notes.length) {
      const n = this.notes[this.next];
      if (n.head) { this.next++; continue; }
      if (t - n.t <= w) break;
      n.head = 'miss';
      this.record('miss', n, n.t + w, 'hit', null);
      if (n.kind !== 'tap') {
        n.tail = 'miss';
        this.record('miss', n, n.t + w, 'tail', null);
      }
      this.next++;
    }
    for (const h of [...this.active]) {
      if (h.releasedAt !== null && t - h.releasedAt > REGRAB) {
        this.endHold(h);
        h.tail = 'miss';
        this.record('miss', h, t, 'tail', null);
      } else if (h.releasedAt === null && t >= h.end) this.finishTail(h, t, null);
    }
  }

  finishTail(h, t, releasedLane) {
    this.endHold(h);
    let j = 'perfect';
    if (h.kind === 'slide' && !(this.down[h.slideTo] || releasedLane === h.slideTo)) j = 'good';
    h.tail = j;
    this.record(j, h, t, 'tail', null);
  }

  endHold(h) {
    const i = this.active.indexOf(h);
    if (i >= 0) this.active.splice(i, 1);
  }

  record(j, note, t, type, delta) {
    this.counts[j]++;
    this.judged++;
    if (j === 'miss') this.combo = 0;
    else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    this.health = Math.max(0, Math.min(1, this.health + HEALTH[j]));
    this.recent.push(WEIGHT[j]);
    if (this.recent.length > 16) this.recent.shift();
    const lane = type === 'tail' && note.kind === 'slide' ? note.slideTo : note.lane;
    this.events.push({ type, judgement: j, lane, note, t, delta, combo: this.combo });
    if (j !== 'miss' && this.combo % COMBO_MILESTONE === 0) this.events.push({ type: 'combo', combo: this.combo, t });
    if (!this.noFail && this.health <= 0 && !this.failed) {
      this.failed = true;
      this.events.push({ type: 'fail', t });
    }
  }

  /** Is a hold being held right now (for drawing)? */
  holding(note) {
    return this.active.includes(note) && note.releasedAt === null;
  }

  get finished() {
    return this.failed || this.judged >= this.total;
  }

  /** Rolling accuracy of the last few judgements, 0..1 (1 before any). */
  get glow() {
    if (!this.recent.length) return 1;
    return this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
  }

  get accuracy() {
    return accuracy(this.counts);
  }

  results() {
    const acc = this.accuracy;
    return {
      counts: { ...this.counts },
      accuracy: acc,
      grade: gradeFor(acc),
      score: finalScore(this.counts, this.maxCombo, this.total),
      maxCombo: this.maxCombo,
      total: this.total,
      fullCombo: this.counts.miss === 0 && this.judged >= this.total,
      allPerfect: this.counts.perfect === this.total,
      failed: this.failed,
    };
  }
}
