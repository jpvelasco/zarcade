// The twelve Grand Prix tracks as plain data, grouped into three cups.
// Points are centreline control points in world units (y grows down), in
// driving order; point 0 sits on the start straight. `width` is the road's
// half-width, `verge` the slow strip before the wall. Pads, boxes and
// bumpers sit at a lap fraction `at` and lateral `off` (-1 right … 1 left of
// travel, as a fraction of the half-width). Shortcuts run from one lap
// fraction to another through `via` points.

export const CUPS = [
  { id: 'toybox', name: 'Toybox Cup', theme: 'toybox', blurb: 'Zoom across the playroom floor', icon: '🧸' },
  { id: 'candy', name: 'Candy Cup', theme: 'candy', blurb: 'Sweet slides through Candy Canyon', icon: '🍭' },
  { id: 'starlight', name: 'Starlight Cup', theme: 'docks', blurb: 'Lantern races on the night docks', icon: '🌟' },
];

export const TRACKS = [
  // ---------------------------------------------------------------- Toybox
  {
    id: 'toybox-speedway', name: 'Toybox Speedway', cup: 0, theme: 'toybox', variant: 0, seed: 101,
    width: 74, verge: 24,
    points: [
      [-200, -640], [500, -650], [1000, -600], [1260, -340], [1260, 260], [1000, 560],
      [500, 620], [220, 470], [-120, 470], [-420, 620], [-950, 590], [-1250, 300],
      [-1260, -300], [-900, -610],
    ],
    pads: [{ at: 0.08, off: 0 }, { at: 0.58, off: 0.3 }],
    boxes: [{ at: 0.2, n: 4 }, { at: 0.48, n: 4 }, { at: 0.8, n: 4 }],
    bumpers: [],
  },
  {
    id: 'block-tower-bend', name: 'Block Tower Bend', cup: 0, theme: 'toybox', variant: 1, seed: 102,
    width: 68, verge: 24,
    points: [
      [-305, 710], [405, 710], [1015, 660], [1265, 355], [1150, 15], [810, -100],
      [625, -390], [645, -700], [405, -965], [0, -910], [-150, -610], [-150, -150],
      [-505, 50], [-1015, 0], [-1265, 305], [-1065, 660],
    ],
    pads: [{ at: 0.05, off: 0 }, { at: 0.5, off: 0 }],
    boxes: [{ at: 0.22, n: 4 }, { at: 0.62, n: 3 }, { at: 0.86, n: 4 }],
    bumpers: [],
  },
  {
    id: 'crayon-curves', name: 'Crayon Curves', cup: 0, theme: 'toybox', variant: 2, seed: 103,
    width: 68, verge: 26,
    points: [
      [-545, 730], [180, 730], [820, 695], [1100, 410], [990, 145], [695, 5],
      [610, -235], [775, -500], [865, -765], [640, -1005], [90, -960], [-135, -685],
      [-460, -525], [-820, -660], [-1185, -500], [-1165, -15], [-950, 240], [-900, 515],
    ],
    pads: [{ at: 0.04, off: 0 }, { at: 0.42, off: -0.2 }, { at: 0.72, off: 0.2 }],
    boxes: [{ at: 0.17, n: 4 }, { at: 0.55, n: 4 }, { at: 0.83, n: 3 }],
    shortcuts: [{ from: 4, to: 7, via: [[1060, -170]], width: 30 }],
    bumpers: [],
  },
  {
    id: 'train-set-twister', name: 'Train Set Twister', cup: 0, theme: 'toybox', variant: 3, seed: 104,
    width: 66, verge: 24,
    points: [
      [0, 550], [515, 560], [920, 440], [1030, 110], [845, -185], [515, -145],
      [290, 45], [35, 35], [-110, -220], [75, -515], [440, -625], [565, -720],
      [580, -840], [440, -995], [-220, -920], [-660, -700], [-920, -295], [-885, 220],
      [-550, 515],
    ],
    pads: [{ at: 0.06, off: 0 }, { at: 0.66, off: 0 }],
    boxes: [{ at: 0.18, n: 4 }, { at: 0.46, n: 4 }, { at: 0.77, n: 4 }],
    bumpers: [{ at: 0.34, off: 0.45, r: 16 }, { at: 0.9, off: -0.45, r: 16 }],
  },
  // ----------------------------------------------------------------- Candy
  {
    id: 'candy-canyon', name: 'Candy Canyon', cup: 1, theme: 'candy', variant: 0, seed: 201,
    width: 66, verge: 30,
    points: [
      [-615, 790], [90, 810], [705, 745], [915, 485], [820, 250], [475, 120],
      [360, -95], [525, -335], [1010, -395], [1155, -705], [880, -1010], [265, -965],
      [-175, -745], [-460, -485], [-880, -525], [-1185, -265], [-1100, 220], [-1070, 600],
    ],
    pads: [{ at: 0.05, off: 0 }, { at: 0.6, off: 0 }],
    boxes: [{ at: 0.2, n: 4 }, { at: 0.5, n: 4 }, { at: 0.8, n: 4 }],
    shortcuts: [{ from: 4, to: 8, via: [[870, -90]], width: 30 }],
    bumpers: [],
  },
  {
    id: 'lollipop-lanes', name: 'Lollipop Lanes', cup: 1, theme: 'candy', variant: 1, seed: 202,
    width: 64, verge: 28,
    points: [
      [-185, 420], [280, 485], [655, 750], [1075, 700], [1170, 340], [1005, 35],
      [1125, -330], [985, -750], [570, -815], [270, -565], [-95, -655], [-280, -1030],
      [-750, -1075], [-1020, -745], [-945, -380], [-1215, -45], [-1170, 420], [-750, 610],
    ],
    pads: [{ at: 0.1, off: 0 }, { at: 0.45, off: 0 }, { at: 0.85, off: 0 }],
    boxes: [{ at: 0.22, n: 4 }, { at: 0.55, n: 4 }, { at: 0.75, n: 3 }],
    bumpers: [{ at: 0.32, off: 0, r: 15 }],
  },
  {
    id: 'gumdrop-gorge', name: 'Gumdrop Gorge', cup: 1, theme: 'candy', variant: 2, seed: 203,
    width: 68, verge: 28,
    points: [
      [-475, 805], [285, 830], [945, 755], [1275, 380], [1180, -95], [805, -285],
      [460, -250], [270, -440], [330, -755], [455, -995], [375, -1225], [-190, -1230],
      [-630, -935], [-665, -500], [-1040, -235], [-1230, 235], [-990, 615],
    ],
    pads: [{ at: 0.04, off: 0 }, { at: 0.52, off: 0.25 }],
    boxes: [{ at: 0.15, n: 4 }, { at: 0.42, n: 4 }, { at: 0.7, n: 4 }],
    bumpers: [
      { at: 0.24, off: 0.4, r: 17 }, { at: 0.27, off: -0.4, r: 17 },
      { at: 0.6, off: 0, r: 17 }, { at: 0.88, off: 0.45, r: 16 },
    ],
  },
  {
    id: 'frosting-falls', name: 'Frosting Falls', cup: 1, theme: 'candy', variant: 3, seed: 204,
    width: 62, verge: 28,
    points: [
      [-355, 880], [355, 890], [970, 840], [1280, 530], [1170, 145], [985, -95],
      [1060, -395], [1100, -795], [705, -1060], [175, -1015], [0, -660], [-190, -355],
      [-145, -45], [-375, 215], [-795, 130], [-1145, 310], [-1190, 705], [-880, 880],
    ],
    pads: [{ at: 0.06, off: 0 }, { at: 0.36, off: 0 }, { at: 0.76, off: 0 }],
    boxes: [{ at: 0.18, n: 4 }, { at: 0.5, n: 4 }, { at: 0.85, n: 3 }],
    shortcuts: [{ from: 11, to: 14, via: [[-470, -120]], width: 30 }],
    bumpers: [],
  },
  // ------------------------------------------------------------- Starlight
  {
    id: 'starlight-docks', name: 'Starlight Docks', cup: 2, theme: 'docks', variant: 0, seed: 301,
    width: 64, verge: 22,
    points: [
      [-495, 795], [300, 795], [990, 775], [1240, 495], [1240, 50], [940, -150],
      [545, -150], [345, -445], [595, -795], [740, -995], [685, -1200], [100, -1240],
      [-345, -990], [-445, -495], [-845, -345], [-1240, -150], [-1290, 395], [-1040, 745],
    ],
    pads: [{ at: 0.05, off: 0 }, { at: 0.47, off: 0 }],
    boxes: [{ at: 0.18, n: 4 }, { at: 0.55, n: 4 }, { at: 0.82, n: 4 }],
    shortcuts: [{ from: 5, to: 8, via: [[740, -470]], width: 30 }],
    bumpers: [],
  },
  {
    id: 'lantern-harbour', name: 'Lantern Harbour', cup: 2, theme: 'docks', variant: 1, seed: 302,
    width: 62, verge: 24,
    points: [
      [0, 870], [735, 870], [1235, 640], [1260, 195], [1065, -85], [1190, -460],
      [1055, -915], [550, -1055], [320, -735], [10, -580], [-275, -780], [-640, -1055],
      [-1100, -915], [-1190, -460], [-985, -125], [-1145, 230], [-1055, 685], [-550, 870],
    ],
    pads: [{ at: 0.08, off: 0 }, { at: 0.4, off: 0 }, { at: 0.7, off: 0 }],
    boxes: [{ at: 0.2, n: 4 }, { at: 0.5, n: 4 }, { at: 0.86, n: 3 }],
    bumpers: [{ at: 0.3, off: 0.4, r: 15 }, { at: 0.62, off: -0.4, r: 15 }],
  },
  {
    id: 'moonbeam-marina', name: 'Moonbeam Marina', cup: 2, theme: 'docks', variant: 2, seed: 303,
    width: 62, verge: 24,
    points: [
      [-210, 710], [355, 710], [850, 635], [1060, 320], [1025, -140], [780, -460],
      [355, -565], [75, -370], [150, -100], [400, 45], [465, 240], [285, 425],
      [-140, 355], [-320, 70], [-355, -320], [-240, -645], [-425, -885], [-850, -745],
      [-1025, -320], [-955, 175], [-710, 565],
    ],
    pads: [{ at: 0.05, off: 0 }, { at: 0.55, off: 0 }],
    boxes: [{ at: 0.16, n: 4 }, { at: 0.42, n: 3 }, { at: 0.7, n: 4 }, { at: 0.9, n: 3 }],
    shortcuts: [{ from: 7, to: 11.7, via: [[0, 20]], width: 28 }],
    bumpers: [],
  },
  {
    id: 'comet-causeway', name: 'Comet Causeway', cup: 2, theme: 'docks', variant: 3, seed: 304,
    width: 60, verge: 24,
    points: [
      [-475, 875], [240, 890], [875, 835], [1230, 555], [1175, 175], [995, -45],
      [1035, -320], [1205, -675], [955, -995], [500, -895], [345, -585], [115, -510],
      [-80, -675], [-395, -995], [-875, -955], [-1120, -600], [-875, -280], [-745, -55],
      [-875, 200], [-1100, 510], [-955, 795],
    ],
    pads: [{ at: 0.04, off: 0 }, { at: 0.3, off: 0 }, { at: 0.64, off: 0 }],
    boxes: [{ at: 0.14, n: 4 }, { at: 0.4, n: 4 }, { at: 0.6, n: 3 }, { at: 0.86, n: 4 }],
    shortcuts: [{ from: 16, to: 19, via: [[-1060, 80]], width: 28 }],
    bumpers: [{ at: 0.5, off: 0.42, r: 15 }, { at: 0.53, off: -0.42, r: 15 }],
  },
];

export const TRACK_IDS = TRACKS.map((t) => t.id);
export const tracksOfCup = (c) => TRACKS.filter((t) => t.cup === c);
export const trackById = (id) => TRACKS.find((t) => t.id === id) || null;
