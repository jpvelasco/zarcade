// 12×12 pixel-art icons for the tray and the collection. Pure data; the
// renderer turns them into images. '.' is transparent.

export const INK = {
  s: '#f2d184', S: '#d9b05e',
  w: '#4fc3e0', W: '#2f8fd0', q: '#c4f5ff',
  o: '#a8754a', O: '#86593a',
  m: '#5e3d26', M: '#45301f',
  e: '#e6c27d', E: '#b88d4c',
  g: '#5cbf54', G: '#3e9440', l: '#9be584',
  p: '#ff7eb6', y: '#ffd23f',
  v: '#3b9f6a',
  a: '#a8652f', A: '#6b3a1a', k: '#d08d52',
  t: '#8a5a36', T: '#6e4428',
  n: '#8b8f9c', N: '#6a6e7a', h: '#b8bcc8',
  L: '#ff5a1f', Y: '#ffc043', R: '#d23814',
  c: '#f2f5ff', C: '#c5cfec',
  b: '#2a1f3d', B: '#4b3870', u: '#a184ff',
  f: '#ffe066', F: '#ff8a2a', x: '#ff4a1a',
  i: '#d4f4ff', I: '#8fd0ea', j: '#ffffff',
  z: '#5cf0bf', Z: '#2aa882',
  d: '#ff8c32', D: '#e0601a', K: '#2a1a10',
  1: '#efff7a', 2: '#6b5a3a', 3: '#dff3ff',
  4: '#ff9bb0', 5: '#ffffff', 6: '#8f95ab',
};

export const ICONS = {
  sand: [
    '............', '............', '............', '............', '.....s......', '....sss.....',
    '...ssSss....', '..sssssSs...', '..ssSssssS..', '.sssssSssss.', 'ssSsssssssSs', 'SSSSSSSSSSSS',
  ],
  water: [
    '.....w......', '.....w......', '....www.....', '....www.....', '...wwwww....', '...wqwww....',
    '..wqwwwww...', '..wqwwwWw...', '..wwwwwWw...', '...wwwWw....', '....WWW.....', '............',
  ],
  soil: [
    '............', '............', '............', '............', '....oooo....', '..oooOoooo..',
    '.ooOooooOoo.', 'oooooOoooooo', 'oOooooooOooo', 'ooooOoooooOo', 'OoooooOooooO', 'OOOOOOOOOOOO',
  ],
  mud: [
    '.......q....', '......qwq...', '......www...', '.......w....', '....mmmm....', '..mmmMmmmm..',
    '.mmMmmmmmMm.', 'mmmmmMmmmmmm', 'mMmmmmmmMmmm', 'mmmmMmmmmmMm', 'MmmmmmMmmmmM', 'MMMMMMMMMMMM',
  ],
  seed: [
    '............', '............', '............', '...ee.......', '..eEee......', '..eeEe..ee..',
    '...ee..eEee.', '.......eeEe.', '....ee..ee..', '...eEee.....', '...eeEe.....', '....ee......',
  ],
  sprout: [
    '............', '............', '............', '...gg..gg...', '..gllg.ggg..', '..ggggggGg..',
    '...gg.Ggg...', '......G.....', '......G.....', '....ooGoo...', '..oooOoooo..', 'oooooooOoooo',
  ],
  flower: [
    '....pp.pp...', '...ppppppp..', '....ppyypp..', '...ppyyyypp.', '....ppyypp..', '...ppppppp..',
    '....pp.pp...', '......G.....', '...gg.G.....', '....ggG.gg..', '......Ggg...', '......G.....',
  ],
  vine: [
    'nnnn..v.....', 'nnNn.vvl....', 'nnnnvv......', 'nNnnv..l....', 'nnnnvv.vl...', 'nnnn.vvv....',
    'nNnnvv......', 'nnnnv.vl....', 'nnnnvv......', 'nnNn.vvv....', 'nnnnvv..l...', 'nnnnnvv.....',
  ],
  acorn: [
    '......A.....', '.....AA.....', '...AAAAAA...', '..AAkAAkAA..', '..AAAAAAAA..', '...aaaaaa...',
    '...akaaaa...', '...aaaaaa...', '...aakaaa...', '....aaaa....', '.....aa.....', '............',
  ],
  tree: [
    '...gggggg...', '..gglggggg..', '.gggggglggg.', '.gglggggggg.', '.ggggggGggg.', '..gGggggGg..',
    '...gggtggg..', '.....tt.....', '.....tt.....', '.....tT.....', '.....tt.....', '....tTtt....',
  ],
  stone: [
    '............', '............', '............', '....nnnnn...', '...nhhnnnn..', '..nhnnnnnnn.',
    '..nnnnnNnnn.', '.nnnnnnnnNn.', '.nnNnnnnnnn.', '.nnnnnnNnnN.', '..NnnnnnnNN.', '...NNNNNNN..',
  ],
  lava: [
    '............', '.....Y......', '....YLY.....', '.....L......', '............', '..LLYLLLLY..',
    '.LYYLLLRLLL.', 'LLLLLYLLLLRL', 'LRLLLLLLYLLL', 'LLLYLLRLLLLL', 'RLLLLLLLLRLL', 'RRRRRRRRRRRR',
  ],
  steam: [
    '............', '.....cc.....', '...cccccc...', '..cccCcccc..', '.ccccccccCc.', '.cCcccccccc.',
    '..cccccCcc..', '...cc..cc...', '....c..c....', '.....c......', '....c.......', '............',
  ],
  rain: [
    '...ccccc....', '.cccccccccc.', 'cccCcccccccc', '.cccccccCcc.', '............', '..w...w...w.',
    '..w...w...w.', '.....w...w..', '.w...w...w..', '.w.......w..', '....w...w...', '....w.......',
  ],
  obsidian: [
    '............', '....bbbb....', '...bBuubb...', '..bBuuBbbb..', '.bbBubbbBbb.', '.bBbbbbbbbb.',
    '.bbbbbbBbbb.', '..bbbbbbbb..', '...bbBbbb...', '....bbbb....', '.....bb.....', '............',
  ],
  fire: [
    '.....f......', '.....ff.....', '....fff.....', '....fFff....', '...ffFfff...', '..fFFFFfff..',
    '..fFxxFFff..', '.ffFxxxFFf..', '.fFxxfxxFf..', '.fFxfffxFf..', '..fFxfxFf...', '...fFFFf....',
  ],
  ice: [
    '............', '...iiiiiii..', '..ijjiiiiI..', '.iiiiiiiiII.', '.ijiiiiiiII.', '.iiiiiiiiII.',
    '.iiiiiiiiII.', '.iiiiijiiII.', '.iiiiiiiiII.', '.iiiiiiiiI..', '.IIIIIIIII..', '............',
  ],
  moss: [
    '............', '............', '..z...z.....', '.zzz.zzz..z.', '.zZzzzZz.zzz', 'zzzzzzzzzzZz',
    'zZzzZzzzzzzz', 'nnnnnnnnnnnn', 'nhnnnnNnnnnn', 'nnnnNnnnnhnn', 'nNnnnnnnnnnN', 'NNNNNNNNNNNN',
  ],
  fish: [
    '............', '............', '............', '....dddd....', '..ddddddd..D', '.dKdddddddDD',
    '.ddddddddDDD', '..ddddddd..D', '....dddd....', '............', '............', '............',
  ],
  firefly: [
    '............', '....3..3....', '...333333...', '...3322333..', '....2222....', '....2222....',
    '....1111....', '...111111...', '...111111...', '....1111....', '............', '............',
  ],
  eraser: [
    '............', '............', '......4444..', '.....44444..', '....444444..', '...4444445..',
    '..44444455..', '.666444555..', '.66664555...', '..666655....', '...6665.....', '............',
  ],
};
