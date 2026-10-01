// The soundtrack as data: one loop per stage plus title and boss themes.
// Lead lines are written tracker style, one token per 16th note:
//   C5, F#4, Bb3 ... a note     '.' hold the previous note     '-' rest
// Bars are separated by '|' and must have 16 steps. Chords (one per bar)
// drive the bass and the arpeggio channel.

export const TRACKS = {
  title: {
    tempo: 118,
    chords: ['C', 'Am', 'F', 'G'],
    bass: 'walk',
    arp: true,
    drums: 'k---h---s---h-h-',
    lead: 'C5 . . . G4 . C5 . E5 . . . D5 . C5 . | A4 . . . E5 . . . C5 . A4 . B4 . C5 . | F5 . . . E5 . D5 . C5 . . . A4 . C5 . | D5 . . . . . G4 . B4 . D5 . G5 . . .',
  },
  jungle: {
    tempo: 148,
    chords: ['Am', 'F', 'C', 'G'],
    bass: 'drive',
    arp: true,
    drums: 'k-h-s-h-k-k-s-hh',
    lead: 'A4 . C5 . E5 . A5 . G5 . E5 . D5 . C5 . | F4 . A4 . C5 . F5 . E5 . C5 . A4 . C5 . | E5 . . G5 E5 . C5 . D5 . E5 . G5 . . . | D5 . B4 . G4 . B4 . D5 . G5 . F5 . D5 .',
  },
  river: {
    tempo: 138,
    chords: ['D', 'Bm', 'G', 'A'],
    bass: 'walk',
    arp: true,
    drums: 'k--hs--hk-h-s--h',
    lead: 'F#5 . . E5 D5 . A4 . B4 . D5 . E5 . . . | D5 . . C#5 B4 . F#4 . G4 . B4 . D5 . . . | B4 . D5 . G5 . F#5 . E5 . D5 . B4 . . . | C#5 . E5 . A5 . G5 . F#5 . E5 . C#5 . . .',
  },
  caves: {
    tempo: 112,
    chords: ['Em', 'C', 'Am', 'B'],
    bass: 'slow',
    arp: true,
    drums: 'k-------s-----h-',
    lead: 'E5 . . . - - B4 . . . - - G4 . A4 . | B4 . . . - - E5 . . . D5 . C5 . . . | A4 . . . C5 . E5 . . . - - D5 . C5 . | B4 . . . . . D#5 . . . F#5 . . . . .',
  },
  temple: {
    tempo: 128,
    chords: ['E', 'F', 'E', 'Dm'],
    bass: 'gallop',
    arp: false,
    drums: 'k--k--s-k--k--sh',
    lead: 'E5 . F5 . G#5 . . . F5 . E5 . D5 . E5 . | F5 . . . E5 . D5 . C5 . D5 . E5 . . . | B4 . C5 . D5 . E5 . F5 . E5 . G#5 . . . | A5 . G#5 . F5 . E5 . D5 . F5 . E5 . . .',
  },
  volcano: {
    tempo: 158,
    chords: ['Cm', 'Ab', 'Bb', 'G'],
    bass: 'drive',
    arp: true,
    drums: 'k-hhs-hhk-hks-hh',
    lead: 'C5 . C5 G4 C5 . D#5 . D5 . C5 . G4 . . . | C5 . C5 Ab4 C5 . D#5 . F5 . D#5 . C5 . . . | D5 . D5 Bb4 D5 . F5 . G5 . F5 . D5 . Bb4 . | B4 . . . D5 . . . G5 . F5 . D5 . B4 .',
  },
  alien: {
    tempo: 150,
    chords: ['Bm', 'G', 'Em', 'F#'],
    bass: 'drive',
    arp: true,
    drums: 'x-h-s-h-x-h-s-hs',
    lead: 'B4 . F#5 . B5 . A5 . F#5 . D5 . E5 . F#5 . | G5 . . . D5 . B4 . D5 . G5 . F#5 . E5 . | E5 . G5 . B5 . . . A5 . G5 . F#5 . E5 . | F#5 . . . C#5 . F#5 . A#5 . . . C#6 . . .',
  },
  boss: {
    tempo: 170,
    chords: ['Dm', 'Bb', 'C', 'A'],
    bass: 'gallop',
    arp: true,
    drums: 'k-hks-hkk-hks-ss',
    lead: 'D5 D5 . D5 F5 . D5 . A5 . G5 . F5 . E5 . | D5 D5 . D5 F5 . D5 . Bb5 . A5 . F5 . D5 . | C5 C5 . C5 E5 . G5 . C6 . Bb5 . G5 . E5 . | A4 . C#5 . E5 . A5 . G5 . E5 . C#5 . A4 .',
  },
};

export const STAGE_TRACK = { jungle: 'jungle', river: 'river', caves: 'caves', temple: 'temple', volcano: 'volcano', alien: 'alien' };

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI number for a name like C5, F#4 or Bb3. */
export function noteMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + accidental;
}

export function chordTones(chord) {
  const m = /^([A-G][#b]?)(m|7|dim)?$/.exec(chord);
  if (!m) throw new Error(`bad chord ${chord}`);
  const root = noteMidi(`${m[1]}2`);
  const third = m[2] === 'm' || m[2] === 'dim' ? 3 : 4;
  const fifth = m[2] === 'dim' ? 6 : 7;
  return { root, tones: [0, third, fifth, m[2] === '7' ? 10 : 12].map((i) => root + i) };
}

const BASS = {
  drive: [[0, 0, 2], [2, 12, 2], [4, 0, 2], [6, 12, 2], [8, 0, 2], [10, 12, 2], [12, 7, 2], [14, 12, 2]],
  walk: [[0, 0, 4], [4, 7, 4], [8, 12, 4], [12, 7, 4]],
  slow: [[0, 0, 8], [8, 7, 8]],
  gallop: [[0, 0, 2], [3, 0, 1], [4, 12, 2], [6, 0, 2], [8, 0, 2], [11, 0, 1], [12, 7, 2], [14, 12, 2]],
};

/** Expand a track into per-step note lists for the sequencer. */
export function parseTrack(spec) {
  const bars = spec.lead.split('|').map((bar) => bar.trim().split(/\s+/));
  for (const [i, bar] of bars.entries()) {
    if (bar.length !== 16) throw new Error(`bar ${i + 1} has ${bar.length} steps`);
  }
  if (bars.length !== spec.chords.length) throw new Error('one chord per bar');
  const steps = bars.length * 16;
  const lead = Array.from({ length: steps }, () => []);
  const harmony = Array.from({ length: steps }, () => []);
  const bass = Array.from({ length: steps }, () => []);
  const tokens = bars.flat();
  for (let i = 0; i < steps; i += 1) {
    const tok = tokens[i];
    if (tok === '.' || tok === '-') continue;
    let len = 1;
    while (i + len < steps && tokens[i + len] === '.') len += 1;
    lead[i].push({ midi: noteMidi(tok), len });
  }
  spec.chords.forEach((name, bar) => {
    const chord = chordTones(name);
    for (const [at, offset, len] of BASS[spec.bass] || BASS.drive) {
      bass[bar * 16 + at].push({ midi: chord.root + 12 + offset, len });
    }
    if (spec.arp) {
      for (let s = 0; s < 16; s += 2) harmony[bar * 16 + s].push({ midi: chord.tones[(s / 2) % 4] + 36, len: 1 });
    }
  });
  return { tempo: spec.tempo, steps, lead, harmony, bass, drums: spec.drums };
}
