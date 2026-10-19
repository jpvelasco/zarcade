// Where every bar of a song sits in time. Music and charts both go through
// `beatToTime`, so notes line up with the sound by construction. DOM-free.
import { STYLES } from './songs.js';

export const STEPS_PER_BEAT = 4;

export function stepsPerBar(song) {
  return STYLES[song.style].beats * STEPS_PER_BEAT;
}

/** Sections in play order with their first bar. */
export function layout(song) {
  const out = [];
  let bar = 0;
  for (const name of song.form) {
    const section = song.sections[name];
    if (!section) throw new Error(`${song.id}: missing section ${name}`);
    out.push({ name, section, startBar: bar, bars: section.bars });
    bar += section.bars;
  }
  return { parts: out, bars: bar, beats: bar * STYLES[song.style].beats };
}

/** Swing pushes each off-beat eighth later; downbeats never move. */
export function swingBeat(beat, swing) {
  if (!swing) return beat;
  const whole = Math.floor(beat);
  const f = beat - whole;
  const mid = 0.5 + swing;
  const g = f < 0.5 ? (f / 0.5) * mid : mid + ((f - 0.5) / 0.5) * (1 - mid);
  return whole + g;
}

export function secondsPerBeat(song, tempoScale = 1) {
  return 60 / (song.bpm * tempoScale);
}

/** Seconds from the song's first downbeat. Negative beats are the count-in. */
export function beatToTime(song, beat, tempoScale = 1) {
  return swingBeat(beat, STYLES[song.style].swing) * secondsPerBeat(song, tempoScale);
}

/** Song length in seconds: the last bar's end. */
export function songLength(song, tempoScale = 1) {
  return beatToTime(song, layout(song).beats, tempoScale);
}

/**
 * Split a '|'-separated pattern into bars of tokens. `spaced` patterns
 * (melodies) separate tokens with spaces; charts are read character by
 * character, with '[..]' and '~N' as single tokens.
 */
export function splitBars(text, spaced) {
  return text.split('|').map((bar) => (spaced ? bar.trim().split(/\s+/).filter(Boolean) : tokenizeChartBar(bar.trim())));
}

export function tokenizeChartBar(bar) {
  const tokens = [];
  for (let i = 0; i < bar.length; i++) {
    const ch = bar[i];
    if (ch === ' ') continue;
    if (ch === '[') {
      const end = bar.indexOf(']', i);
      if (end < 0) throw new Error(`unclosed chord in "${bar}"`);
      tokens.push(bar.slice(i, end + 1));
      i = end;
    } else if (ch === '~') {
      tokens.push(bar.slice(i, i + 2));
      i += 1;
    } else tokens.push(ch);
  }
  return tokens;
}
