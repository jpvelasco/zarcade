// Tiny music theory helpers: note names, chords, scale degrees. DOM-free.

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

const QUALITY = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  dim: [0, 3, 6],
};

/** Pitch class (0-11) of a note name such as 'F#' or 'Bb'. */
export function pitchClass(name) {
  const base = LETTER[name[0]];
  if (base === undefined) throw new Error(`bad note name ${name}`);
  let pc = base;
  for (const ch of name.slice(1)) {
    if (ch === '#') pc += 1;
    else if (ch === 'b') pc -= 1;
    else throw new Error(`bad note name ${name}`);
  }
  return (pc + 12) % 12;
}

/** 'F#m7' -> { root: 6, intervals: [0, 3, 7, 10] }. */
export function parseChord(symbol) {
  const m = /^([A-G][#b]?)(.*)$/.exec(symbol);
  if (!m || !(m[2] in QUALITY)) throw new Error(`bad chord ${symbol}`);
  return { root: pitchClass(m[1]), intervals: QUALITY[m[2]] };
}

/**
 * A melody token to a MIDI note: scale degree 1-7, optional 'b'/'#' before
 * it, and "'" (octave up) or ',' (octave down) after it. `tonic` is the MIDI
 * note of degree 1.
 */
export function degreeToMidi(token, tonic, mode = 'major') {
  const m = /^([b#]?)([1-7])(['",]*)$/.exec(token);
  if (!m) throw new Error(`bad melody token ${token}`);
  const scale = MODES[mode];
  if (!scale) throw new Error(`bad mode ${mode}`);
  let midi = tonic + scale[Number(m[2]) - 1];
  if (m[1] === 'b') midi -= 1;
  if (m[1] === '#') midi += 1;
  for (const ch of m[3]) midi += ch === ',' ? -12 : 12;
  return midi;
}

export const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
