// Typing statistics: per-key error and speed averages (what the adaptive
// picker learns from), WPM and accuracy, and the run history for the chart.
import { baseKey } from './keys.js';

const ERR_PRIOR = 0.1;
const ERR_RATE = 0.12; // weight of the newest keystroke in the error average
const MS_RATE = 0.15;

// Standard WPM: five characters per word.
export function wpm(chars, seconds) {
  if (!(seconds > 0)) return 0;
  return Math.round((chars / 5) / (seconds / 60));
}

export function accuracy(correct, typos) {
  const total = correct + typos;
  return total ? correct / total : 1;
}

// Record one keystroke for the key the player was meant to press.
// `ms` is the time since the previous key within the same word (or null).
export function recordKey(keyStats, ch, ok, ms = null) {
  const k = baseKey(ch);
  if (k === ' ') return;
  const s = keyStats[k] || (keyStats[k] = { e: ERR_PRIOR, t: 0, n: 0 });
  s.e = s.e * (1 - ERR_RATE) + (ok ? 0 : 1) * ERR_RATE;
  s.n += 1;
  if (ok && ms != null && ms > 40 && ms < 3000) s.t = s.t ? s.t * (1 - MS_RATE) + ms * MS_RATE : ms;
  s.e = Math.round(s.e * 1e4) / 1e4;
  s.t = Math.round(s.t);
}

function medianTime(keyStats) {
  const times = Object.values(keyStats).map((s) => s.t).filter((t) => t > 0).sort((a, b) => a - b);
  return times.length ? times[Math.floor(times.length / 2)] : 0;
}

// How much a key needs practice: 0 (great) and up. Unknown keys sit at the prior.
export function weakness(keyStats, key, median = medianTime(keyStats)) {
  const s = keyStats[baseKey(key)];
  if (!s) return 3 * ERR_PRIOR;
  const slow = median && s.t ? Math.max(0, Math.min(1, (s.t - median) / median)) : 0;
  return 3 * s.e + 0.5 * slow;
}

// The n weakest keys that have been typed at least `minSeen` times.
export function weakKeys(keyStats, n = 3, minSeen = 4) {
  const median = medianTime(keyStats);
  return Object.keys(keyStats)
    .filter((k) => keyStats[k].n >= minSeen && /[a-z;,.?!']/.test(k))
    .map((k) => ({ key: k, w: weakness(keyStats, k, median) }))
    .filter((x) => x.w > 3 * ERR_PRIOR * 0.6)
    .sort((a, b) => b.w - a.w || (a.key < b.key ? -1 : 1))
    .slice(0, n)
    .map((x) => x.key);
}

export const HISTORY_MAX = 60;

// Append a finished run; keep the most recent HISTORY_MAX.
export function pushHistory(history, entry) {
  history.push({ d: entry.d, wpm: entry.wpm, acc: Math.round(entry.acc * 1000) / 1000, stage: entry.stage });
  while (history.length > HISTORY_MAX) history.shift();
  return history;
}

// Average WPM of the last n runs (0 when none).
export function recentWpm(history, n = 5) {
  const last = history.slice(-n);
  return last.length ? Math.round(last.reduce((a, h) => a + h.wpm, 0) / last.length) : 0;
}
