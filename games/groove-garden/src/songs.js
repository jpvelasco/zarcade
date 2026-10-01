// Every song in Groove Garden, written as pattern data. DOM-free.
//
// A song is a key, a tempo, a style and a list of sections. The style gives
// the groove (drum, bass and chord-comping patterns); each section gives its
// chords, melody and the three charts. `music.js` turns this into timed
// synth events and `chart.js` turns the charts into notes, both through the
// same beat-to-seconds function, so the notes always sit on the music.
//
// Pattern strings, one character per 16th step (12 steps in 3/4):
//   drums  'x' hit, 'X' accent, '.' nothing
//   bass   'R' root, '5' fifth, 'O' octave, '3' third, '-' hold, '.' rest
//   comp   'x' chord, 'a' next arpeggio note, '-' hold, '.' rest
// Melodies: bars split by '|', space-separated tokens spread evenly across
//   the bar. Scale degree 1-7 ('b'/'#' before, "'" up or ',' down after),
//   '-' holds the previous note, '.' rests.
// Charts: bars split by '|', one token per step, spread evenly across the
//   bar. '1'-'4' a lane, '[14]' two lanes together, '-' holds the previous
//   note one more step, '~3' ends the held note by sliding to lane 3,
//   '.' nothing. A chart or melody shorter than its section repeats.

export const STYLES = {
  lofi: {
    name: 'Lo-fi', beats: 4, swing: 0.1,
    drums: {
      main: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      light: { k: 'x.........x.....', h: 'x...x...x...x...' },
      fill: { k: 'x.....x...x.....', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x...' },
    },
    bass: 'R-----R-....5-..',
    comp: 'x-------x-------',
  },
  disco: {
    name: 'Disco', beats: 4, swing: 0,
    drums: {
      main: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x...x...x...x...', o: '..x...x...x...x.' },
      light: { k: 'x...x...x...x...', o: '..x...x...x...x.' },
      fill: { k: 'x...x...x...x...', s: '....x.......xxxx', h: 'x...x...x...x...', o: '..x...x...x.....' },
    },
    bass: 'R.O.R.O.R.O.R.O.',
    comp: '..x-..x-..x-..x-',
  },
  chiptune: {
    name: 'Chiptune', beats: 4, swing: 0,
    drums: {
      main: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      light: { h: 'x.x.x.x.x.x.x.x.' },
      fill: { k: 'x.......x.x.....', s: '....x.......xxxx', h: 'x.x.x.x.x.x.....' },
    },
    bass: 'R.R.O.R.R.R.O.R.',
    comp: 'a.a.a.a.a.a.a.a.',
  },
  reggae: {
    name: 'Reggae', beats: 4, swing: 0.06,
    drums: {
      main: { k: '........x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
      light: { s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
      fill: { k: '........x.......', s: '........x...x.xx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: 'R-....R.5-..R...',
    comp: '....x.......x...',
  },
  synthwave: {
    name: 'Synthwave', beats: 4, swing: 0,
    drums: {
      main: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      light: { h: 'x.x.x.x.x.x.x.x.' },
      fill: { k: 'x.......x.......', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: 'R.R.R.R.R.R.R.R.',
    comp: 'x---------------',
  },
  waltz: {
    name: 'Waltz', beats: 3, swing: 0,
    drums: {
      main: { k: 'x...........', h: '....x...x...' },
      light: { h: '....x...x...' },
      fill: { k: 'x...........', h: '....x...x.x.' },
    },
    bass: 'R-..........',
    comp: '....x-..x-..',
  },
};

// Sections every song shares the shape of.
const INTRO_CHART = {
  easy: '1...|4...',
  normal: '1.2.|3.4.',
  hard: '1234|4321',
};
const INTRO_CHART_8 = {
  easy: '1...|4...',
  normal: '1.2.|3.4.',
  hard: '1.2.3.4.|4.3.2.1.',
};
const OUTRO_CHART = {
  easy: '2---|....',
  normal: '[23]---|....',
  hard: '[14]---|....',
};
const WALTZ_INTRO = { easy: '1..|3..', normal: '1.2|3.4', hard: '123|432' };
const WALTZ_OUTRO = { easy: '2--|...', normal: '[23]--|...', hard: '[14]--|...' };

export const SONGS = [
  {
    id: 'sprout-shuffle',
    title: 'Sprout Shuffle',
    style: 'lofi',
    bpm: 82, key: 'F', tonic: 65, mode: 'major',
    blurb: 'A sleepy, swingy stroll to wake up the seeds.',
    color: '#f6a5c0',
    form: ['intro', 'A', 'B', 'A', 'C', 'C', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['Fmaj7', 'Dm7'], drums: 'light', chart: INTRO_CHART },
      A: {
        bars: 4, chords: ['Fmaj7', 'Dm7', 'Gm7', 'C7'],
        lead: '3 - 5 - 6 5 3 . | 2 - 1 - 6, - . . | 4 - 6 - 1\' 6 4 . | 3 - 2 - 5, - . .',
        chart: {
          easy: '1.3.|2.1.|2.4.|3.1.',
          normal: '1...3...|3.2.1...|2...4...|3.2.1--.',
          hard: '1.2.343.|3.2.1...|2.3.432.|3.2.1--.',
        },
      },
      B: {
        bars: 4, chords: ['Bbmaj7', 'Am7', 'Gm7', 'C7'],
        lead: '4 . 4 5 6 - 5 . | 3 . 3 4 5 - 3 . | 2 . 2 3 4 - 6 . | 5 - - - 7, - . .',
        chart: {
          easy: '1.3.|2.4.|1.3.|4.1.',
          normal: '1.2.3...|2.3.4...|1.2.3.4.|4---1...',
          hard: '[13].234.3.|2.234.2.|1.123.4.|4---1-..',
        },
      },
      C: {
        bars: 4, chords: ['Fmaj7', 'Am7', 'Bbmaj7', 'C7'],
        lead: '1\' - 6 5 6 - 5 3 | 5 - 3 2 3 - . . | 4 - 6 1\' 2\' - 1\' 6 | 5 - - - . . . .',
        chart: {
          easy: '4.3.|3.1.|1.4.|2---',
          normal: '4...3.2.|3.2.1...|1...3.4.|2--~3....',
          hard: '4.323.21|3.212...|1.234.32|2--~3....',
        },
      },
      outro: { bars: 2, chords: ['Fmaj7'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'disco-daisies',
    title: 'Disco Daisies',
    style: 'disco',
    bpm: 116, key: 'A', tonic: 69, mode: 'dorian',
    blurb: 'Glitter on the petals, four on the floor.',
    color: '#ffd23f',
    form: ['intro', 'A', 'B', 'A', 'C', 'B', 'A', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['Am7', 'D7'], lead: null, chart: { easy: '1.2.|3.4.', normal: '1.2.3.4.|4.3.2.1.', hard: '1.2.3.4.|4.3.2.[14].' } },
      A: {
        bars: 4, chords: ['Am7', 'D7', 'Am7', 'D7'],
        lead: '5 . 5 . 7 5 . 4 | 6 - 4 . 3 . 4 . | 5 . 5 . 7 5 . 1\' | 7 - 6 - 4 - . .',
        chart: {
          easy: '2.4.|4.1.|2.4.|4.1.',
          normal: '2...4...|4.2.1...|2...4...|4.3.1--.',
          hard: '2.2.43.1|4.2.1.2.|2.2.43.4|4.3.1--.',
        },
      },
      B: {
        bars: 4, chords: ['Fmaj7', 'G', 'Em7', 'Am7'],
        lead: '3\' - 2\' 1\' 7 - 5 . | 2\' - 1\' 7 6 - 4 . | 1\' - 7 6 5 - 7 . | 1\' - - - . . 5 .',
        chart: {
          easy: '4.2.|4.2.|4.2.|4...',
          normal: '4.3.2.1.|4.3.2.1.|4.3.2...|4---..1.',
          hard: '4.321.2.|4.321.2.|4.321.3.|[14]---..1.',
        },
      },
      C: {
        bars: 2, chords: ['Am7', 'D7'], drums: 'light', lead: null,
        chart: {
          easy: '1---|4---',
          normal: '1--~2....|4--~3....',
          hard: '1--~2[34]...|4--~3[12]...',
        },
      },
      outro: { bars: 2, chords: ['Am7'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'hibiscus-sway',
    title: 'Hibiscus Sway',
    style: 'reggae',
    bpm: 78, key: 'G', tonic: 67, mode: 'major',
    blurb: 'A lazy island one-drop under big red flowers.',
    color: '#ff6b6b',
    form: ['intro', 'A', 'B', 'A', 'B', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['G', 'C'], drums: 'light', lead: null, chart: INTRO_CHART_8 },
      A: {
        bars: 4, chords: ['G', 'C', 'D', 'C'],
        lead: '5 - 3 - 2 - 1 . | 3 - 5 - 6 - 5 . | 5 - 3 - 2 - 3 . | 2 - - - . . . .',
        chart: {
          easy: '4.2.|2.4.|4.2.|2---',
          normal: '4...2...|2...4...|4...2...|2---~3...',
          hard: '4.3.2.1.|2.3.4.3.|4.3.2.3.|2---~3...',
        },
      },
      B: {
        bars: 4, chords: ['Em', 'C', 'G', 'D'],
        lead: '6 . 6 5 3 - . . | 5 . 5 3 1 - . . | 3 . 3 2 1 - 2 3 | 2 - - - . . . .',
        chart: {
          easy: '4.1.|3.1.|2.3.|3---',
          normal: '4...1...|3...1...|2.1.3.4.|3---....',
          hard: '4.431...|3.321...|2.21[34].34|3---....',
        },
      },
      outro: { bars: 2, chords: ['G'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'bluebell-waltz',
    title: 'Bluebell Waltz',
    style: 'waltz',
    bpm: 126, key: 'D', tonic: 74, mode: 'major',
    blurb: 'One-two-three, the bluebells curtsy in the breeze.',
    color: '#7aa7ff',
    form: ['intro', 'A', 'B', 'A', 'B', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['D', 'A'], drums: 'light', lead: null, chart: WALTZ_INTRO },
      A: {
        bars: 8, chords: ['D', 'A', 'Bm', 'G'],
        lead: '5 - - - 3 - | 2 - 3 - 4 - | 3 - - - 1 - | 6, - 7, - 1 - | 5 - - - 1\' - | 7 - 6 - 5 - | 6 - 5 - 4 - | 3 - - - - -',
        chart: {
          easy: '3.1|2..|3.1|1..|4.2|4..|3.1|3--',
          normal: '3.1|234|3.1|123|4.4|432|3.1|3--',
          hard: '312|234|3-1|123|4-4|432|321|3--',
        },
      },
      B: {
        bars: 8, chords: ['G', 'D', 'Em', 'A'],
        lead: '4 - 5 - 6 - | 5 - 3 - 1 - | 2 - 3 - 4 - | 3 - 2 - 6, - | 4 - 5 - 6 - | 1\' - 7 - 6 - | 5 - 6 - 7 - | 1\' - - - - -',
        chart: {
          easy: '2..|3..|2..|3..|2.4|4..|2.4|4--',
          normal: '2.4|3.1|2.4|3.1|2.4|4.2|2.4|4--',
          hard: '234|3[12].|234|321|234|432|234|4--',
        },
      },
      outro: { bars: 2, chords: ['D'], drums: 'light', lead: '1\' - - - - - | . . . . . .', chart: WALTZ_OUTRO },
    },
  },
  {
    id: 'pixel-petals',
    title: 'Pixel Petals',
    style: 'chiptune',
    bpm: 132, key: 'C', tonic: 72, mode: 'major',
    blurb: 'Bleeps and bloops from a tiny 8-bit flower bed.',
    color: '#5ee6a8',
    form: ['intro', 'A', 'B', 'A', 'C', 'B', 'C', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['C', 'G'], drums: 'light', lead: null, chart: INTRO_CHART },
      A: {
        bars: 4, chords: ['C', 'Am', 'F', 'G'],
        lead: '1\' . 5 . 3 . 5 . | 6 . 1\' . 6 . 5 . | 4 . 6 . 1\' . 6 . | 5 4 3 2 5 - - .',
        chart: {
          easy: '4.1.|3.2.|1.4.|4.2.',
          normal: '4...1...|3...2...|1...4...|4.3.2--.',
          hard: '4.2.1.2.|3.4.3.2.|1.3.4.3.|4321[23]--.',
        },
      },
      B: {
        bars: 4, chords: ['F', 'G', 'Em', 'Am'],
        lead: '6 6 5 6 1\' - 6 . | 7 7 6 7 2\' - 7 . | 5 5 4 5 3\' - 2\' . | 1\' - 7 - 6 - 5 .',
        chart: {
          easy: '2.4.|3.4.|2.4.|4.2.',
          normal: '2.1.4...|3.2.4...|2.1.4.3.|4.3.2.1.',
          hard: '22124.2.|33234.3.|22124.3.|4.3.2.1.',
        },
      },
      C: {
        bars: 4, chords: ['F', 'G', 'C', 'C'],
        lead: '4 5 6 1\' 6 5 4 . | 5 6 7 2\' 7 6 5 . | 3 4 5 1\' 5 4 3 5 | 1\' - - - 1 - - .',
        chart: {
          easy: '1.4.|2.3.|1.4.|4.1.',
          normal: '1.3.4.2.|2.4.3.1.|1.3.4.2.|4---1---',
          hard: '1234321.|2343432.|1234321[34]|4---1---',
        },
      },
      outro: { bars: 2, chords: ['C'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'neon-nectar',
    title: 'Neon Nectar',
    style: 'synthwave',
    bpm: 100, key: 'D', tonic: 74, mode: 'minor',
    blurb: 'Glowing moths cruise a midnight boulevard of tulips.',
    color: '#ff5fd2',
    form: ['intro', 'A', 'B', 'C', 'A', 'C', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['Dm', 'Bb'], drums: 'light', lead: null, chart: INTRO_CHART_8 },
      A: {
        bars: 4, chords: ['Dm', 'Bb', 'F', 'C'],
        lead: '1 - - 5 - - 4 3 | 4 - - 3 - - 1 . | 1 - - 5 - - 4 3 | 2 - - - - - . .',
        chart: {
          easy: '1.4.|3.1.|1.4.|2---',
          normal: '1..4..3.|3..2..1.|1..4..3.|2-----..',
          hard: '1--4--32|3--2--1.|1--4--32|2-----..',
        },
      },
      B: {
        bars: 4, chords: ['Gm', 'Bb', 'Dm', 'C'],
        lead: '6 - 5 - 4 - 5 - | 6 - 5 - 4 - 3 - | 4 - 3 - 2 - 3 - | 1 - - - - - - .',
        chart: {
          easy: '4.2.|4.1.|2.4.|1---',
          normal: '4...2...|4...2...|2...4...|1-----~4.',
          hard: '4.3.2.3.|4.3.2.1.|2.1.[14].2.|1-----~4.',
        },
      },
      C: {
        bars: 4, chords: ['Bb', 'C', 'Dm', 'Dm'],
        lead: '5 . 5 6 5 4 3 4 | 5 . 5 6 5 4 3 . | 6 . 6 7 6 5 4 5 | 5 - - - 1\' - - .',
        chart: {
          easy: '3.3.|3.2.|4.4.|3.4.',
          normal: '3...3.2.|3...3.2.|4...4.3.|3---4---',
          hard: '3.343212|3.34321.|[24].434323|3---4---',
        },
      },
      outro: { bars: 2, chords: ['Dm'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'puddle-hop',
    title: 'Puddle Hop',
    style: 'lofi',
    bpm: 88, key: 'E', tonic: 64, mode: 'minor',
    blurb: 'Rainy-day beats for frogs in wellies.',
    color: '#6fd3e8',
    form: ['intro', 'A', 'B', 'A', 'B', 'A', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['Em7', 'Am7'], drums: 'light', lead: null, chart: INTRO_CHART },
      A: {
        bars: 4, chords: ['Em7', 'Am7', 'D', 'Cmaj7'],
        lead: '5 . 7 . 1\' - 7 5 | 4 . 3 . 1 - . . | 2 . 4 . 6 - 5 4 | 3 - - - . . . .',
        chart: {
          easy: '1.4.|2.3.|1.4.|2---',
          normal: '1...4...|2.1.3...|1...4...|2-~1.....',
          hard: '1.2.4.31|2.1.[13]...|1.2.4.32|2-~1.....',
        },
      },
      B: {
        bars: 4, chords: ['Cmaj7', 'D', 'Bm7', 'Em7'],
        lead: '5 . 6 . 7 . 1\' . | 2\' . 1\' . 7 . 6 . | 5 . 6 . 7 . 5 . | 6 - - - 5 - . .',
        chart: {
          easy: '1.3.|4.2.|1.3.|4.3.',
          normal: '1...3...|4...2...|1...3...|4---3--.',
          hard: '1.2.3.4.|4.3.2.1.|1.2.3.1.|4---3--.',
        },
      },
      outro: { bars: 2, chords: ['Em7'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'bumblebee-boogie',
    title: 'Bumblebee Boogie',
    style: 'disco',
    bpm: 124, key: 'G', tonic: 67, mode: 'mixolydian',
    blurb: 'The bees have hired a mirror ball. Buzz along!',
    color: '#ffb02e',
    form: ['intro', 'A', 'B', 'A', 'C', 'B', 'C', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['G', 'F'], lead: null, chart: { easy: '1.2.|3.4.', normal: '1.2.3.4.|4.3.2.1.', hard: '1.2.3.4.|4.3.2.[14].' } },
      A: {
        bars: 4, chords: ['G', 'F', 'C', 'G'],
        lead: '1\' . 1\' 7 1\' . 5 . | 7 . 6 . 5 . 4 . | 3 . 5 . 1\' . 5 . | 4 . 3 . 2 - . .',
        chart: {
          easy: '4.4.|4.2.|1.4.|2.1.',
          normal: '4...4.2.|4...2...|1...4...|2.1---..',
          hard: '4.434.2.|4.3.2.1.|1.2.4.2.|2.1---..',
        },
      },
      B: {
        bars: 4, chords: ['Em7', 'Am7', 'C', 'D'],
        lead: '5 . 5 6 7 . 6 5 | 6 . 6 7 1\' . 7 6 | 5 . 5 6 5 . 3 . | 4 - 5 - 6 - 7 -',
        chart: {
          easy: '1.3.|2.4.|2.2.|1.3.',
          normal: '1...3.2.|2...4.3.|2...2.1.|1.2.3.4.',
          hard: '1.123.21|2.234.32|2.232.1.|1.2.3.4.',
        },
      },
      C: {
        bars: 4, chords: ['C', 'D', 'G', 'G'],
        lead: '1\' 7 1\' 2\' 1\' 7 6 5 | 6 5 6 7 6 5 4 3 | 1\' 7 1\' 2\' 1\' 7 6 5 | 1\' - - - 1 - - .',
        chart: {
          easy: '3.4.|2.3.|3.4.|4.1.',
          normal: '3.3.4.2.|2.2.3.1.|3.3.4.2.|4---1---',
          hard: '3434[14]321|2123[24]321|3434[14]321|4---1---',
        },
      },
      outro: { bars: 2, chords: ['G'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'mango-breeze',
    title: 'Mango Breeze',
    style: 'reggae',
    bpm: 84, key: 'C', tonic: 72, mode: 'major',
    blurb: 'Sunshine, a hammock and a gentle dub echo.',
    color: '#ff9f43',
    form: ['intro', 'A', 'B', 'C', 'A', 'B', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['C', 'F'], drums: 'light', lead: null, chart: INTRO_CHART_8 },
      A: {
        bars: 4, chords: ['C', 'F', 'C', 'G'],
        lead: '3 - 3 - 2 - 1 - | 4 - 3 - 2 - . . | 3 - 3 - 2 - 1 - | 2 - - - 5, - . .',
        chart: {
          easy: '4.3.|4.2.|4.3.|3.1.',
          normal: '4...3...|4.3.2...|4...3...|3---1...',
          hard: '4.4.3.2.|4.3.2...|4.4.3.2.|3---1-..',
        },
      },
      B: {
        bars: 4, chords: ['Am', 'F', 'C', 'G'],
        lead: '6 - 6 - 5 - 3 - | 4 - 4 - 3 - 1 - | 2 - 3 - 4 - 5 - | 5 - - - . . . .',
        chart: {
          easy: '4.3.|3.1.|1.3.|4---',
          normal: '4...3...|3...1...|1.2.3.4.|4---....',
          hard: '4.4.3.1.|3.3.2.1.|1.2.3.4.|4---....',
        },
      },
      C: {
        bars: 4, chords: ['Am', 'F', 'C', 'G'], drums: 'light', lead: null,
        chart: {
          easy: '1---|4---|2.3.|1---',
          normal: '1--~2....|4--~3....|2...3...|[14]---....',
          hard: '1--~2[34]...|4--~3[12]...|2.3.2.3.|[14]---....',
        },
      },
      outro: { bars: 2, chords: ['C'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'beetle-bytes',
    title: 'Beetle Bytes',
    style: 'chiptune',
    bpm: 148, key: 'A', tonic: 69, mode: 'minor',
    blurb: 'Speedy beetles racing on a circuit-board leaf.',
    color: '#b18cff',
    form: ['intro', 'A', 'B', 'C', 'A', 'B', 'C', 'A', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['Am', 'G'], drums: 'light', lead: null, chart: INTRO_CHART },
      A: {
        bars: 4, chords: ['Am', 'F', 'C', 'G'],
        lead: '1\' . 1\' . 7 . 5 . | 6 . 6 . 5 . 3 . | 5 . 5 . 4 . 3 . | 2 . 3 . 5 . 7 .',
        chart: {
          easy: '4.3.|2.1.|3.2.|1.3.',
          normal: '4...3...|2...1...|3...2...|1.2.3.4.',
          hard: '4.4.3.1.|2.2.1.3.|3.3.2.1.|1.2.3.4.',
        },
      },
      B: {
        bars: 4, chords: ['Dm', 'Am', 'E', 'Am'],
        lead: '4 4 6 . 1\' . 6 . | 5 5 3 . 1 . 3 . | #7 . 2\' . #7 . 5 . | 1\' - - - . . . .',
        chart: {
          easy: '1.4.|3.1.|3.3.|4---',
          normal: '1.2.4...|3.2.1...|3.4.3.1.|4---....',
          hard: '112.4.2.|332.1.2.|3.4.3.1.|4---....',
        },
      },
      C: {
        bars: 4, chords: ['Am', 'F', 'G', 'Am'],
        lead: '1 3 5 1\' 5 3 1 3 | 6, 1 3 6 3 1 6, 1 | 5, 7, 2 5 2 7, 5, 7, | 1\' - - - . . . .',
        chart: {
          easy: '1.4.|4.1.|1.4.|2---',
          normal: '1.3.4.2.|4.2.1.3.|1.3.4.2.|[14]---....',
          hard: '12343212|43212343|12343212|[14]---....',
        },
      },
      outro: { bars: 2, chords: ['Am'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'moonflower-drive',
    title: 'Moonflower Drive',
    style: 'synthwave',
    bpm: 108, key: 'E', tonic: 76, mode: 'minor',
    blurb: 'Night blooms open as the city hums its tune.',
    color: '#4fd1ff',
    form: ['intro', 'A', 'B', 'C', 'A', 'B', 'C', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['Em', 'C'], drums: 'light', lead: null, chart: INTRO_CHART_8 },
      A: {
        bars: 4, chords: ['Em', 'C', 'G', 'D'],
        lead: '1 - 2 - 3 - 5 - | 3 - - 2 1 - . . | 1 - 2 - 3 - 7, - | 1 - - - . . . .',
        chart: {
          easy: '1.3.|3.1.|1.3.|1---',
          normal: '1...3...|3...1...|1...3...|1-----~4.',
          hard: '1.2.3.4.|3..21-..|1.2.3.1.|1-----~4.',
        },
      },
      B: {
        bars: 4, chords: ['Am', 'C', 'Em', 'D'],
        lead: '6 - - 5 - - 3 - | 5 - - 3 - - 2 - | 3 - - 2 - - 1 - | 2 - - - 7, - - -',
        chart: {
          easy: '4.2.|4.1.|3.1.|2.1.',
          normal: '4..3..2.|4..2..1.|3..2..1.|2---1---',
          hard: '4--3--2.|4--2--1.|3--2--1.|2---1---',
        },
      },
      C: {
        bars: 4, chords: ['C', 'D', 'Em', 'Em'],
        lead: '5 . 5 . 6 5 3 . | 5 . 5 . 6 5 1\' . | 7 . 7 . 6 5 3 . | 5 - - - 1\' - - -',
        chart: {
          easy: '2.4.|2.3.|4.3.|2.4.',
          normal: '2...4.2.|2...3.4.|4...3.1.|2---4---',
          hard: '2.2.432.|2.2.324.|4.4.321.|2---4---',
        },
      },
      outro: { bars: 2, chords: ['Em'], drums: 'light', lead: '1\' - - - . . . . | . . . . . . . .', chart: OUTRO_CHART },
    },
  },
  {
    id: 'dandelion-dance',
    title: 'Dandelion Dance',
    style: 'waltz',
    bpm: 144, key: 'F', tonic: 77, mode: 'major',
    blurb: 'Twirl with the fluff before the wind takes it away.',
    color: '#ffe066',
    form: ['intro', 'A', 'B', 'A', 'B', 'A', 'outro'],
    sections: {
      intro: { bars: 2, chords: ['F', 'C'], drums: 'light', lead: null, chart: WALTZ_INTRO },
      A: {
        bars: 8, chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'],
        lead: '1 - 3 - 5 - | 5 - 4 - 3 - | 2 - 4 - 6 - | 6 - 5 - 4 - | 3 - 5 - 1\' - | 7 - 6 - 5 - | 4 - 2 - 7, - | 1 - - - - -',
        chart: {
          easy: '1..|4..|2..|4..|2.4|4..|3.1|1--',
          normal: '1.3|4.2|2.4|4.2|2.4|4.2|3.1|1--',
          hard: '123|432|234|432|234|432|321|1--',
        },
      },
      B: {
        bars: 8, chords: ['Dm', 'Am', 'Bb', 'F', 'Gm', 'C', 'F', 'F'],
        lead: '6 5 6 - 1\' - | 5 4 3 - 1 - | 4 3 4 - 6 - | 5 4 3 - - - | 2 3 4 - 2 - | 3 4 5 - 7, - | 1 - 3 - 5 - | 1\' - - - - -',
        chart: {
          easy: '3..|3.1|2..|3--|1..|2.1|1.3|4--',
          normal: '3.4|3.1|2.4|3--|1.1|2.1|123|4--',
          hard: '323.4.|321.1.|212.4.|321---|123.1.|234.1.|1.2.3.|4-----',
        },
      },
      outro: { bars: 2, chords: ['F'], drums: 'light', lead: '1\' - - - - - | . . . . . .', chart: WALTZ_OUTRO },
    },
  },
];

export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DIFFICULTY_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export function songById(id) {
  return SONGS.find((s) => s.id === id) || null;
}

export function styleOf(song) {
  return STYLES[song.style];
}
