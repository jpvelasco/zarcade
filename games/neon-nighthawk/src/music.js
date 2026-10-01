// The soundtrack as data: one mellow synthwave loop per district plus a
// menu tune. `stepEvents` turns a sixteenth-note step into notes; audio.js
// plays them with WebAudio. DOM-free so tests can check every pattern.

export const STEPS_PER_BAR = 16;

// Patterns are sixteen steps long. Arp numbers index the chord's tones and
// climb an octave past the last tone; bass numbers are semitones above the
// chord root. Drum strings use `x` for a hit and `o` for a soft one.
export const SONGS = {
  menu: {
    tempo: 80,
    root: 53, // F
    chords: [[0, [0, 4, 7, 11]], [-3, [0, 3, 7, 10]], [5, [0, 4, 7, 11]], [7, [0, 4, 7]]],
    arp: [0, null, 2, null, 1, null, 3, null, 0, null, 2, null, 4, null, 3, null],
    bass: [0, null, null, null, null, null, null, null, 7, null, null, null, null, null, null, null],
    kick: '................',
    snare: '................',
    hat: '....o.......o...',
    lead: [[0, 12, 4], [4, 11, 4], [8, 7, 8], [16, 9, 4], [20, 7, 4], [24, 4, 8], [32, 9, 4], [36, 12, 4], [40, 16, 8], [48, 14, 4], [52, 11, 4], [56, 7, 8]],
    arpWave: 'triangle',
    leadWave: 'sine',
    cutoff: 900,
  },
  lowrise: {
    tempo: 88,
    root: 53, // F: Fmaj7 Em7 Dm7 Cmaj7
    chords: [[0, [0, 4, 7, 11]], [-1, [0, 3, 7, 10]], [-3, [0, 3, 7, 10]], [-5, [0, 4, 7, 11]]],
    arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, null, 2, null],
    bass: [0, null, null, null, null, null, 0, null, null, null, 7, null, null, null, null, null],
    kick: 'x.....x...x.....',
    snare: '....o.......o...',
    hat: '..o...o...o...o.',
    lead: [[0, 7, 4], [6, 4, 2], [8, 7, 4], [12, 11, 4], [16, 9, 4], [22, 6, 2], [24, 2, 8], [32, 4, 4], [38, 7, 2], [40, 12, 4], [44, 9, 4], [48, 6, 4], [54, 2, 2], [56, -1, 8]],
    arpWave: 'triangle',
    leadWave: 'triangle',
    cutoff: 1100,
  },
  market: {
    tempo: 100,
    root: 48, // C: Cmaj7 Am7 Fmaj7 G6
    chords: [[0, [0, 4, 7, 11]], [-3, [0, 3, 7, 10]], [5, [0, 4, 7, 11]], [7, [0, 4, 7, 9]]],
    arp: [0, null, 2, 1, null, 3, 2, null, 4, null, 2, 1, null, 3, 2, null],
    bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 0, null, 12, 7, null],
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: 'o.o.o.o.o.o.o.oo',
    lead: [[0, 12, 2], [2, 11, 2], [4, 7, 4], [10, 4, 2], [12, 7, 4], [16, 9, 2], [18, 7, 2], [20, 4, 4], [26, 0, 2], [28, 4, 4], [32, 12, 2], [34, 9, 2], [36, 5, 4], [42, 9, 2], [44, 12, 4], [48, 11, 2], [50, 14, 2], [52, 16, 6], [60, 14, 2], [62, 11, 2]],
    arpWave: 'square',
    leadWave: 'triangle',
    cutoff: 1500,
  },
  floodline: {
    tempo: 76,
    root: 50, // D: Dm9 Bbmaj7 Fmaj7 C6/9
    chords: [[0, [0, 3, 7, 10, 14]], [-4, [0, 4, 7, 11]], [3, [0, 4, 7, 11]], [-2, [0, 4, 7, 9, 14]]],
    arp: [0, null, null, 2, null, null, 4, null, null, 3, null, null, 1, null, null, null],
    bass: [0, null, null, null, null, null, null, null, null, null, null, null, 7, null, null, null],
    kick: 'o.........o.....',
    snare: '................',
    hat: '....o.......o..o',
    lead: [[0, 14, 6], [8, 10, 6], [16, 7, 8], [26, 12, 4], [32, 10, 6], [40, 14, 6], [48, 12, 8], [58, 7, 4]],
    arpWave: 'sine',
    leadWave: 'sine',
    cutoff: 800,
  },
  skybridge: {
    tempo: 112,
    root: 45, // A minor: Am F C G
    chords: [[0, [0, 3, 7]], [-4, [0, 4, 7]], [3, [0, 4, 7]], [-2, [0, 4, 7]]],
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
    bass: [0, null, 0, null, 0, null, 0, 12, 0, null, 0, null, 0, null, 7, null],
    kick: 'x...x...x...x...',
    snare: '....x.......x..o',
    hat: '..x...x...x...x.',
    lead: [[0, 12, 2], [2, 15, 2], [4, 19, 4], [8, 15, 2], [10, 12, 2], [12, 15, 4], [16, 12, 2], [18, 15, 2], [20, 20, 4], [24, 19, 4], [28, 15, 4], [32, 15, 2], [34, 19, 2], [36, 22, 4], [40, 19, 4], [44, 15, 4], [48, 14, 4], [52, 17, 4], [56, 14, 2], [58, 10, 2], [60, 12, 4]],
    arpWave: 'sawtooth',
    leadWave: 'square',
    cutoff: 1300,
  },
  core: {
    tempo: 94,
    root: 52, // E minor: Em7 Cmaj7 G D
    chords: [[0, [0, 3, 7, 10]], [-4, [0, 4, 7, 11]], [3, [0, 4, 7]], [-2, [0, 4, 7]]],
    arp: [0, null, 1, 2, null, 3, null, 2, 0, null, 1, 2, null, 4, null, 3],
    bass: [0, null, null, null, 0, null, null, 7, 0, null, null, null, 0, null, 5, null],
    kick: 'x.......x.x.....',
    snare: '....x.......x...',
    hat: 'o.o.o.o.o.o.o.o.',
    lead: [[0, 7, 4], [4, 10, 2], [6, 12, 2], [8, 15, 6], [16, 12, 4], [20, 7, 4], [24, 3, 6], [32, 7, 2], [34, 10, 2], [36, 15, 4], [40, 15, 4], [44, 10, 4], [48, 14, 4], [52, 9, 4], [56, 5, 6]],
    arpWave: 'triangle',
    leadWave: 'triangle',
    cutoff: 1000,
  },
};

const DISTRICT_SONGS = ['lowrise', 'market', 'floodline', 'skybridge', 'core'];

export function songFor(chapter) {
  return DISTRICT_SONGS[Math.max(0, Math.min(DISTRICT_SONGS.length - 1, chapter | 0))];
}

export function loopSteps(song) {
  return song.chords.length * STEPS_PER_BAR;
}

// Seconds per sixteenth note.
export function stepSeconds(song) {
  return 60 / song.tempo / 4;
}

export const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Keeps chord tones in a comfortable middle register for the pad.
function padRange(midi) {
  let note = midi;
  while (note < 50) note += 12;
  while (note > 74) note -= 12;
  return note;
}

const hit = (pattern, index) => (pattern[index] === 'x' ? 1 : pattern[index] === 'o' ? 0.55 : 0);

// The notes that start on `step` of the loop. Lengths are in steps.
export function stepEvents(song, step) {
  const total = loopSteps(song);
  const s = ((step % total) + total) % total;
  const bar = Math.floor(s / STEPS_PER_BAR);
  const beat = s % STEPS_PER_BAR;
  const [chordRoot, tones] = song.chords[bar];
  const base = song.root + chordRoot;
  const events = [];
  if (beat === 0) {
    events.push({ voice: 'pad', notes: tones.slice(0, 4).map((tone) => padRange(base + tone)), steps: STEPS_PER_BAR, gain: 1 });
  }
  const arp = song.arp[beat];
  if (arp !== null && arp !== undefined) {
    const tone = tones[arp % tones.length] + 12 * Math.floor(arp / tones.length);
    events.push({ voice: 'arp', midi: base + tone + 12, steps: 1, gain: 1 });
  }
  const bass = song.bass[beat];
  if (bass !== null && bass !== undefined) {
    events.push({ voice: 'bass', midi: base + bass - 12, steps: 2, gain: 1 });
  }
  for (const [at, semi, length] of song.lead) {
    if (at === s) events.push({ voice: 'lead', midi: song.root + 12 + semi, steps: length, gain: 1 });
  }
  for (const drum of ['kick', 'snare', 'hat']) {
    const amount = hit(song[drum], beat);
    if (amount) events.push({ voice: drum, steps: 1, gain: amount });
  }
  return events;
}
