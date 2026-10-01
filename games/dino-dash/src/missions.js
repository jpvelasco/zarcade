// Three missions at a time. Finish all three to raise the score multiplier
// and earn bonus amber. "Run" missions count within one run; "total"
// missions add up across runs. DOM-free.
import { makeRng } from './rng.js';

export const MAX_LEVEL = 30;

export const KINDS = {
  coinsRun: { stat: 'coins', scope: 'run', base: 60, step: 25, text: (n) => `Collect ${n} amber in one run` },
  coinsTotal: { stat: 'coins', scope: 'total', base: 200, step: 90, text: (n) => `Collect ${n} amber` },
  distRun: { stat: 'distance', scope: 'run', base: 500, step: 200, round: 50, cap: 6000, text: (n) => `Run ${n} m in one run` },
  distTotal: { stat: 'distance', scope: 'total', base: 2000, step: 800, round: 100, text: (n) => `Run ${n} m in total` },
  logsRun: { stat: 'logs', scope: 'run', base: 6, step: 3, cap: 60, text: (n) => `Jump over ${n} logs in one run` },
  pterosTotal: { stat: 'pteros', scope: 'total', base: 8, step: 4, text: (n) => `Roll under ${n} pterodactyls` },
  powersTotal: { stat: 'powers', scope: 'total', base: 3, step: 1, text: (n) => `Grab ${n} power-ups` },
  lanesRun: { stat: 'lanes', scope: 'run', base: 30, step: 12, cap: 300, text: (n) => `Change lanes ${n} times in one run` },
  jumpsRun: { stat: 'jumps', scope: 'run', base: 15, step: 6, cap: 150, text: (n) => `Jump ${n} times in one run` },
  glideTotal: { stat: 'glide', scope: 'total', base: 150, step: 80, round: 10, text: (n) => `Glide ${n} m on a leaf` },
  magnetTotal: { stat: 'magnetCoins', scope: 'total', base: 40, step: 25, text: (n) => `Collect ${n} amber with a magnet` },
  cleanRun: { stat: 'cleanBest', scope: 'run', base: 300, step: 120, round: 50, cap: 4000, text: (n) => `Run ${n} m without a bump` },
  geysersTotal: { stat: 'geysers', scope: 'total', base: 8, step: 4, minLevel: 2, text: (n) => `Dash past ${n} geysers` },
  shieldTotal: { stat: 'shieldSaves', scope: 'total', base: 1, step: 0.5, minLevel: 3, text: (n) => (n === 1 ? 'Let an egg shield save you' : `Let an egg shield save you ${n} times`) },
  dailyTotal: { stat: 'dailyRuns', scope: 'total', base: 1, step: 0, minLevel: 2, text: () => 'Play a Daily Dash' },
  runsTotal: { stat: 'runs', scope: 'total', base: 3, step: 0.5, text: (n) => `Finish ${n} runs` },
};

export function target(kind, level) {
  const k = KINDS[kind];
  const round = k.round || 1;
  let n = k.base + k.step * (level - 1);
  n = Math.round(n / round) * round;
  if (k.cap) n = Math.min(k.cap, n);
  return Math.max(1, Math.round(n));
}

// The set for a level is always the same three missions.
export function missionSet(level) {
  const rng = makeRng(level * 7919 + 13);
  const pool = Object.keys(KINDS).filter((k) => (KINDS[k].minLevel || 1) <= level);
  const chosen = [];
  const stats = new Set();
  while (chosen.length < 3) {
    const k = rng.pick(pool);
    if (chosen.includes(k) || stats.has(KINDS[k].stat)) continue;
    // At most two lifetime missions, so each set has something to do now.
    if (KINDS[k].scope === 'total' && chosen.filter((c) => KINDS[c].scope === 'total').length >= 2) continue;
    chosen.push(k);
    stats.add(KINDS[k].stat);
  }
  return chosen.map((kind) => ({ kind, target: target(kind, level) }));
}

export function rewardFor(level) {
  return 75 + 25 * level;
}

export function defaultMissions() {
  return { level: 1, progress: [0, 0, 0], done: [false, false, false] };
}

export function sanitizeMissions(raw) {
  const m = defaultMissions();
  if (!raw || typeof raw !== 'object') return m;
  if (Number.isInteger(raw.level)) m.level = Math.max(1, Math.min(MAX_LEVEL + 1, raw.level));
  for (let i = 0; i < 3; i++) {
    const v = raw.progress?.[i];
    if (Number.isFinite(v)) m.progress[i] = Math.max(0, v);
    m.done[i] = raw.done?.[i] === true;
  }
  return m;
}

export const multiplierOf = (state) => Math.min(MAX_LEVEL, state.level);

// Tracks missions during one run. `state` is the saved mission state; it is
// updated in place as missions complete.
export class MissionRun {
  constructor(state) {
    this.state = state;
    this.base = null; // stats snapshot from when the current set started
    this.set = missionSet(state.level);
  }

  start(stats) {
    this.base = { ...stats };
  }

  value(i, stats) {
    const m = this.set[i];
    const k = KINDS[m.kind];
    const now = (stats[k.stat] || 0) - (this.base[k.stat] || 0);
    return k.scope === 'total' ? this.state.progress[i] + now : Math.max(this.state.progress[i], now);
  }

  // Check missions mid-run. Returns { completed: [mission], levelUp: { level, reward } | null }.
  check(stats) {
    const completed = [];
    for (let i = 0; i < 3; i++) {
      if (this.state.done[i]) continue;
      if (this.value(i, stats) >= this.set[i].target) {
        this.state.done[i] = true;
        this.state.progress[i] = this.set[i].target;
        completed.push({ ...this.set[i], text: describe(this.set[i]) });
      }
    }
    let levelUp = null;
    if (this.state.done.every(Boolean)) {
      const reward = rewardFor(this.state.level);
      this.state.level = Math.min(MAX_LEVEL + 1, this.state.level + 1);
      this.state.progress = [0, 0, 0];
      this.state.done = [false, false, false];
      this.set = missionSet(this.state.level);
      this.base = { ...stats };
      levelUp = { level: this.state.level, multiplier: multiplierOf(this.state), reward };
    }
    return { completed, levelUp };
  }

  // End of run: fold this run into saved progress.
  commit(stats) {
    for (let i = 0; i < 3; i++) {
      if (this.state.done[i]) continue;
      this.state.progress[i] = Math.min(this.set[i].target, this.value(i, stats));
    }
  }

  view(stats) {
    return this.set.map((m, i) => ({
      text: describe(m),
      target: m.target,
      value: this.state.done[i] ? m.target : Math.min(m.target, Math.floor(stats ? this.value(i, stats) : this.state.progress[i])),
      done: this.state.done[i],
    }));
  }
}

export function describe(m) {
  return KINDS[m.kind].text(m.target);
}

// Missions view without a run in progress (title, shop).
export function missionView(state) {
  const set = missionSet(state.level);
  return set.map((m, i) => ({
    text: describe(m), target: m.target, done: state.done[i],
    value: state.done[i] ? m.target : Math.min(m.target, Math.floor(state.progress[i])),
  }));
}
