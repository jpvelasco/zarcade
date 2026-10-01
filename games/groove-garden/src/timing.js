// Clock and timing math: judgement windows, latency offsets and calibration.
// DOM-free.

// Forgiving windows (seconds either side of the note).
export const WINDOWS = { perfect: 0.055, great: 0.095, good: 0.14 };
export const JUDGEMENTS = ['perfect', 'great', 'good', 'miss'];
// Let go of a hold this close to its end and it still counts as held through.
export const TAIL_EARLY = 0.15;
// Lift and press again within this long and a hold keeps going.
export const REGRAB = 0.12;

/** perfect / great / good for a timing error, or null when outside every window. */
export function judgeDelta(delta, windows = WINDOWS) {
  const a = Math.abs(delta);
  if (a <= windows.perfect) return 'perfect';
  if (a <= windows.great) return 'great';
  if (a <= windows.good) return 'good';
  return null;
}

/**
 * AudioContext time at a performance.now() instant, from an
 * AudioContext.getOutputTimestamp() pair. This lets the visual clock and
 * input timestamps follow the audio clock smoothly between its updates.
 */
export function audioTimeAt(perfMs, stamp) {
  return stamp.contextTime + (perfMs - stamp.performanceTime) / 1000;
}

/** Song time the player is hearing right now. */
export function heardSongTime(audioTime, startTime, outputLatency = 0) {
  return audioTime - startTime - outputLatency;
}

/** The song time a press counts at, after the player's calibrated input offset. */
export function judgedTime(heard, inputOffsetMs = 0) {
  return heard - inputOffsetMs / 1000;
}

/** The song time the notes are drawn at; a positive offset brings them in sooner. */
export function displayTime(heard, visualOffsetMs = 0) {
  return heard + visualOffsetMs / 1000;
}

export const OFFSET_LIMIT_MS = 400;

export function clampOffset(ms) {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, n));
}

/**
 * Calibration: given tap times and beat times (seconds, same clock), the
 * typical lateness of the taps in milliseconds. Each tap is matched to its
 * nearest beat; taps more than a third of a beat off are ignored, and the
 * median keeps one wild tap from skewing the result. Null until enough taps.
 */
export function estimateOffset(taps, beats, { minTaps = 6 } = {}) {
  if (beats.length < 2) return null;
  const gap = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  const errors = [];
  for (const tap of taps) {
    let best = Infinity;
    for (const b of beats) if (Math.abs(tap - b) < Math.abs(best)) best = tap - b;
    if (Math.abs(best) <= gap / 3) errors.push(best);
  }
  if (errors.length < minTaps) return null;
  errors.sort((a, b) => a - b);
  const mid = errors.length >> 1;
  const median = errors.length % 2 ? errors[mid] : (errors[mid - 1] + errors[mid]) / 2;
  const spread = errors.map((e) => Math.abs(e - median)).sort((a, b) => a - b)[mid];
  return { offsetMs: clampOffset(median * 1000), spreadMs: Math.round(spread * 1000), taps: errors.length };
}
