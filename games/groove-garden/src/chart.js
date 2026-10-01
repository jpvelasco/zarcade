// Charts: the authored lane strings in songs.js turned into timed notes.
// DOM-free.
import { STYLES } from './songs.js';
import { layout, splitBars, stepsPerBar, STEPS_PER_BEAT, beatToTime, songLength } from './timeline.js';

// Four authored lanes fold onto three for the kids layout: both middle lanes
// become the one centre lane.
const FOLD_TO_3 = [0, 1, 1, 2];
// Two notes in one lane need this much air between them (seconds).
export const SAME_LANE_GAP = 0.1;

/** Notes in beats exactly as written, four lanes, 0-based. */
export function parseChart(song, difficulty) {
  const beats = STYLES[song.style].beats;
  const spb = stepsPerBar(song);
  const notes = [];
  let active = null;
  for (const part of layout(song).parts) {
    const text = part.section.chart?.[difficulty];
    if (!text) { active = null; continue; }
    const bars = splitBars(text, false);
    for (let b = 0; b < part.bars; b++) {
      const tokens = bars[b % bars.length];
      if (!tokens.length || spb % tokens.length) {
        throw new Error(`${song.id} ${part.name} ${difficulty}: bar has ${tokens.length} tokens, needs a divisor of ${spb}`);
      }
      const stepBeats = spb / tokens.length / STEPS_PER_BEAT;
      tokens.forEach((token, i) => {
        const beat = (part.startBar + b) * beats + i * stepBeats;
        const where = `${song.id} ${part.name} ${difficulty} bar ${b + 1}`;
        if (token === '.') { active = null; return; }
        if (token === '-') {
          if (!active) throw new Error(`${where}: '-' with nothing to hold`);
          for (const n of active) n.endBeat = beat;
          return;
        }
        if (token[0] === '~') {
          if (!active) throw new Error(`${where}: slide with nothing to hold`);
          const n = active[active.length - 1];
          n.endBeat = beat;
          n.slideTo = laneOf(token[1], where);
          active = null;
          return;
        }
        const lanes = token[0] === '[' ? [...token.slice(1, -1)] : [token];
        active = lanes.map((ch) => ({ beat, lane: laneOf(ch, where), endBeat: null, slideTo: null }));
        notes.push(...active);
      });
    }
  }
  return notes;
}

function laneOf(ch, where) {
  const lane = Number(ch) - 1;
  if (!(lane >= 0 && lane <= 3)) throw new Error(`${where}: bad lane '${ch}'`);
  return lane;
}

/** Lanes a held note occupies: its own, or every lane a slide crosses. */
export function pathLanes(note) {
  if (note.slideTo === null || note.slideTo === undefined) return [note.lane];
  const lo = Math.min(note.lane, note.slideTo), hi = Math.max(note.lane, note.slideTo);
  const out = [];
  for (let l = lo; l <= hi; l++) out.push(l);
  return out;
}

const endOf = (n) => (n.end ?? n.t);

/**
 * A playable chart: notes in seconds, sorted, each with an id and a kind
 * (tap, hold or slide). `lanes: 3` folds the middle lanes together and drops
 * any note that would collide after folding.
 */
export function buildChart(song, difficulty, { lanes = 4, tempoScale = 1 } = {}) {
  const fold = lanes === 3 ? FOLD_TO_3 : null;
  const raw = parseChart(song, difficulty).map((n) => {
    const lane = fold ? fold[n.lane] : n.lane;
    let slideTo = n.slideTo === null ? null : (fold ? fold[n.slideTo] : n.slideTo);
    if (slideTo === lane) slideTo = null;
    const t = beatToTime(song, n.beat, tempoScale);
    const end = n.endBeat === null ? null : beatToTime(song, n.endBeat, tempoScale);
    return { t, beat: n.beat, lane, end, endBeat: n.endBeat, slideTo };
  });
  raw.sort((a, b) => a.t - b.t || a.lane - b.lane);
  const notes = [];
  for (const n of raw) {
    const clash = notes.some((k) => n.t <= endOf(k) + SAME_LANE_GAP - 1e-9 && pathLanes(k).some((l) => pathLanes(n).includes(l)));
    if (clash) continue;
    notes.push(n);
  }
  notes.forEach((n, i) => {
    n.id = i;
    n.kind = n.end === null ? 'tap' : n.slideTo === null ? 'hold' : 'slide';
  });
  const holds = notes.filter((n) => n.kind !== 'tap').length;
  return {
    songId: song.id, difficulty, lanes, tempoScale, notes,
    length: songLength(song, tempoScale),
    judgements: notes.length + holds,
    dropped: raw.length - notes.length,
  };
}

/** The most note heads that start inside any `window`-second span. */
export function peakDensity(notes, window = 2) {
  let best = 0;
  let j = 0;
  for (let i = 0; i < notes.length; i++) {
    while (notes[i].t - notes[j].t >= window) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}
