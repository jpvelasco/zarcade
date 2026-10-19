// Moonshot Mini Golf: worlds and handcrafted holes (pure data).
//
// Every hole lives in its own 1000 x 600 frame. Anything that is not floor
// is open space: a ball whose center leaves the floor falls off (+1 stroke).
//
//   floor    [{ pts } | { circle: [x, y, r] }], optional move: { dx, dy, period, phase }
//   walls    [{ pts, closed?, e? }] polylines with restitution e
//   zones    surface patches: { pts | circle, surface: 'sand' | 'ice' | ... }
//   slopes   { circle, k } bowls (k > 0) and mounds (k < 0); { pts, ax, ay } ramps
//   hazards  holes in the floor: { pts | circle, kind: 'lava' | 'space' }
//   posts    { x, y, r } rocks        bumpers { x, y, r, kick? }
//   wells    { x, y, r, k, core }      black holes (core swallows the ball)
//   portals  { a: [x, y], b: [x, y], r, exitAngle? } one-way
//   boosts   { x, y, r, angle, speed } speed pads
//   spinners { x, y, len, arms, speed, phase? } windmills
//   sliders  { x, y, w, h, dx, dy, period, phase? } moving blocks
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoonshotHoles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const box = (x, y, w, h) => ({ pts: rect(x, y, w, h) });
  const walled = (pts, e) => ({ pts, closed: true, ...(e ? { e } : {}) });
  const arc = (cx, cy, r, a0, a1, n = 32) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([Math.round((cx + Math.cos(a) * r) * 10) / 10, Math.round((cy + Math.sin(a) * r) * 10) / 10]);
    }
    return out;
  };
  const ellipse = (cx, cy, rx, ry, n = 20) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push([Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)]);
    }
    return out;
  };
  const deg = (d) => (d * Math.PI) / 180;
  const polar = (cx, cy, r, d) => [Math.round(cx + Math.cos(deg(d)) * r), Math.round(cy + Math.sin(deg(d)) * r)];

  const WORLDS = [
    {
      id: 'moon', name: 'Moon Base', surface: 'regolith',
      blurb: 'Slippery moon dust, crater cups and rocket pads.',
      palette: { floor: '#c3c8ef', floorDark: '#a3a9dc', edge: '#eef0ff', wall: '#ffffff', wallShade: '#7c83c9', accent: '#7de3ff', flag: '#ff5d8f', sky0: '#0b0a2a', sky1: '#241d63' },
    },
    {
      id: 'mars', name: 'Mars Canyon', surface: 'clay',
      blurb: 'Sand traps, windmills, rover traffic and a volcano.',
      palette: { floor: '#f09a68', floorDark: '#d9784a', edge: '#ffd2b0', wall: '#fff1e2', wallShade: '#a3492b', accent: '#ff7a45', flag: '#3fd6ff', sky0: '#1a0b22', sky1: '#5a1f3a' },
    },
    {
      id: 'saturn', name: 'Saturn Rings', surface: 'stardust',
      blurb: 'Bumpers, black holes, wormholes and drifting asteroids.',
      palette: { floor: '#a695ff', floorDark: '#8574e8', edge: '#e6deff', wall: '#fff6d6', wallShade: '#5a47b8', accent: '#ffd35a', flag: '#ff5fa2', sky0: '#07071d', sky1: '#2c1257' },
    },
  ];

  const HOLES = [
    // ---------------------------------------------------------------- Moon
    {
      id: 'moon-1', world: 'moon', name: 'One Small Putt', par: 2,
      tip: 'Drag back from anywhere, then let go to putt. Moon dust is slippery!',
      tee: [180, 300], cup: [800, 300],
      floor: [box(80, 160, 840, 280)],
      walls: [walled(rect(80, 160, 840, 280))],
      posts: [{ x: 520, y: 225, r: 16 }],
    },
    {
      id: 'moon-2', world: 'moon', name: 'Crater Cup', par: 2,
      tip: 'The cup sits in a crater. Anything close rolls down to it.',
      tee: [160, 400], cup: [740, 240],
      floor: [box(60, 110, 880, 380)],
      walls: [walled(rect(60, 110, 880, 380))],
      slopes: [{ circle: [740, 240, 120], k: 180 }],
      posts: [{ x: 450, y: 300, r: 34 }, { x: 590, y: 425, r: 22 }],
    },
    {
      id: 'moon-3', world: 'moon', name: 'Dogleg Dome', par: 3,
      tip: 'Bank it off the wall to turn the corner.',
      tee: [220, 460], cup: [830, 190],
      floor: [{ pts: [[60, 80], [940, 80], [940, 300], [400, 300], [400, 540], [60, 540]] }],
      walls: [walled([[60, 80], [940, 80], [940, 300], [400, 300], [400, 540], [60, 540]])],
      posts: [{ x: 600, y: 150, r: 20 }, { x: 720, y: 240, r: 18 }],
    },
    {
      id: 'moon-4', world: 'moon', name: 'Boulder Field', par: 3,
      tip: 'Thread the moon rocks, or bounce your way through.',
      tee: [130, 300], cup: [860, 300],
      floor: [box(60, 90, 880, 420)],
      walls: [walled(rect(60, 90, 880, 420))],
      posts: [
        { x: 300, y: 195, r: 28 }, { x: 320, y: 405, r: 24 }, { x: 480, y: 300, r: 36 },
        { x: 630, y: 175, r: 24 }, { x: 640, y: 430, r: 30 }, { x: 770, y: 300, r: 22 },
      ],
    },
    {
      id: 'moon-5', world: 'moon', name: 'Launch Ramp', par: 3,
      tip: 'Roll over the rocket pad to blast up the ramp.',
      tee: [140, 300], cup: [860, 225],
      floor: [box(60, 170, 880, 260)],
      walls: [walled(rect(60, 170, 880, 260))],
      posts: [{ x: 805, y: 300, r: 22 }],
      boosts: [{ x: 300, y: 300, r: 30, angle: 0, speed: 880 }],
      slopes: [{ pts: rect(470, 170, 230, 260), ax: -560, ay: 0 }],
    },
    {
      id: 'moon-6', world: 'moon', name: 'Portal Hop', par: 3,
      tip: 'Roll into the blue portal to hop across the gap.',
      tee: [130, 360], cup: [870, 180],
      floor: [box(60, 150, 320, 300), box(580, 90, 360, 420)],
      walls: [walled(rect(60, 150, 320, 300)), walled(rect(580, 90, 360, 420))],
      portals: [{ a: [310, 250], b: [640, 300], r: 24, exitAngle: 0 }],
      posts: [{ x: 790, y: 300, r: 26 }],
      slopes: [{ circle: [870, 180, 60], k: 110 }],
    },

    // ---------------------------------------------------------------- Mars
    {
      id: 'mars-1', world: 'mars', name: 'Red Dunes', par: 2,
      tip: 'Sand traps grab the ball. Bank around them!',
      tee: [150, 300], cup: [850, 300],
      floor: [box(60, 140, 880, 320)],
      walls: [walled(rect(60, 140, 880, 320))],
      zones: [
        { pts: ellipse(500, 300, 110, 100), surface: 'sand' },
        { circle: [760, 405, 34], surface: 'sand' },
      ],
    },
    {
      id: 'mars-2', world: 'mars', name: 'Windmill Wobble', par: 3,
      tip: 'Time your putt to slip between the spinning windmill blades.',
      tee: [140, 300], cup: [850, 300],
      floor: [box(60, 170, 880, 260)],
      walls: [
        walled(rect(60, 170, 880, 260)),
        { pts: [[380, 170], [450, 225], [550, 225], [620, 170]] },
        { pts: [[380, 430], [450, 375], [550, 375], [620, 430]] },
      ],
      spinners: [{ x: 500, y: 300, len: 68, arms: 4, speed: 1.3 }],
    },
    {
      id: 'mars-3', world: 'mars', name: 'Canyon Bridge', par: 4,
      tip: 'Stay on the bridge. The canyon is a long way down!',
      tee: [150, 420], cup: [840, 180],
      floor: [box(60, 100, 320, 400), box(376, 248, 268, 104), box(640, 100, 300, 400)],
      walls: [
        { pts: [[380, 248], [380, 100], [60, 100], [60, 500], [380, 500], [380, 352]] },
        { pts: [[640, 352], [640, 500], [940, 500], [940, 100], [640, 100], [640, 248]] },
      ],
      zones: [{ circle: [760, 265, 40], surface: 'sand' }],
    },
    {
      id: 'mars-4', world: 'mars', name: 'Rover Crossing', par: 3,
      tip: 'Watch the rovers. They do not stop for golf balls.',
      tee: [140, 300], cup: [860, 300],
      floor: [box(60, 120, 880, 360)],
      walls: [walled(rect(60, 120, 880, 360))],
      sliders: [
        { x: 360, y: 170, w: 76, h: 80, dx: 0, dy: 260, period: 3.4 },
        { x: 510, y: 170, w: 76, h: 80, dx: 0, dy: 260, period: 3.4, phase: 0.33 },
        { x: 660, y: 170, w: 76, h: 80, dx: 0, dy: 260, period: 3.4, phase: 0.66 },
      ],
      zones: [{ circle: [860, 160, 40], surface: 'sand' }, { circle: [860, 440, 40], surface: 'sand' }],
    },
    {
      id: 'mars-5', world: 'mars', name: 'Dust Devil Dunes', par: 3,
      tip: 'Dunes push the ball away. The dust pad sends it down the chute.',
      tee: [140, 150], cup: [860, 450],
      floor: [{ pts: [[60, 70], [700, 70], [700, 370], [940, 370], [940, 530], [300, 530], [300, 370], [540, 370], [540, 230], [60, 230]] }],
      walls: [walled([[60, 70], [700, 70], [700, 370], [940, 370], [940, 530], [300, 530], [300, 370], [540, 370], [540, 230], [60, 230]])],
      slopes: [{ circle: [640, 110, 80], k: -260 }, { circle: [860, 450, 60], k: 120 }],
      boosts: [{ x: 620, y: 300, r: 30, angle: Math.PI / 2, speed: 620 }],
      zones: [{ circle: [420, 470, 50], surface: 'sand' }, { circle: [330, 140, 38], surface: 'sand' }],
    },
    {
      id: 'mars-6', world: 'mars', name: 'Olympus Mons', par: 3,
      tip: 'The cup is in the volcano! Putt firmly uphill. Avoid the lava.',
      tee: [130, 480], cup: [640, 300],
      floor: [box(60, 60, 880, 480)],
      walls: [walled(rect(60, 60, 880, 480))],
      slopes: [{ circle: [640, 300, 190], k: -420 }, { circle: [640, 300, 42], k: 300 }],
      hazards: [
        { circle: [360, 150, 45], kind: 'lava' },
        { circle: [380, 460, 50], kind: 'lava' },
        { circle: [880, 120, 38], kind: 'lava' },
      ],
    },

    // ---------------------------------------------------------------- Saturn
    {
      id: 'saturn-1', world: 'saturn', name: 'Ring Road', par: 3,
      tip: 'Follow the ring around. Bumpers give a big kick!',
      tee: [300, 300], cup: [700, 300],
      floor: [{ pts: arc(500, 300, 270, 0, Math.PI * 2, 48).slice(0, 48) }],
      hazards: [{ circle: [500, 300, 120], kind: 'space' }],
      walls: [
        walled(arc(500, 300, 270, 0, Math.PI * 2, 48).slice(0, 48)),
        walled(arc(500, 300, 126, 0, Math.PI * 2, 32).slice(0, 32), 0.8),
      ],
      bumpers: [{ x: 470, y: 102, r: 18 }, { x: 540, y: 498, r: 18 }],
      decor: [{ type: 'planet', x: 500, y: 300, r: 88 }],
    },
    {
      id: 'saturn-2', world: 'saturn', name: 'Bumper Belt', par: 3,
      tip: 'Pinball time. Bumpers bounce the ball away fast.',
      tee: [130, 300], cup: [860, 300],
      floor: [box(60, 80, 880, 440)],
      walls: [walled(rect(60, 80, 880, 440))],
      bumpers: [
        { x: 380, y: 190, r: 24 }, { x: 380, y: 410, r: 24 }, { x: 510, y: 300, r: 24 },
        { x: 640, y: 190, r: 24 }, { x: 640, y: 410, r: 24 }, { x: 760, y: 300, r: 22 },
      ],
      zones: [{ pts: rect(60, 80, 200, 80), surface: 'ice' }, { pts: rect(60, 440, 200, 80), surface: 'ice' }],
    },
    {
      id: 'saturn-3', world: 'saturn', name: 'Event Horizon', par: 3,
      tip: 'Curve around the black hole. Anything that stops near it gets swallowed.',
      tee: [130, 300], cup: [870, 300],
      floor: [box(60, 80, 880, 440)],
      walls: [walled(rect(60, 80, 880, 440))],
      wells: [{ x: 500, y: 300, r: 190, k: 650, core: 20 }],
    },
    {
      id: 'saturn-4', world: 'saturn', name: 'Wormhole Warp', par: 3,
      tip: 'Chain the wormholes to reach the cup island.',
      tee: [140, 450], cup: [870, 380],
      floor: [box(60, 360, 280, 180), box(380, 60, 240, 180), box(660, 300, 280, 240)],
      walls: [walled(rect(60, 360, 280, 180)), walled(rect(380, 60, 240, 180)), walled(rect(660, 300, 280, 240))],
      portals: [
        { a: [290, 450], b: [430, 150], r: 24, exitAngle: 0 },
        { a: [575, 150], b: [710, 420], r: 24, exitAngle: 0 },
      ],
      zones: [{ pts: rect(660, 440, 280, 100), surface: 'ice' }],
      bumpers: [{ x: 820, y: 480, r: 16 }],
    },
    {
      id: 'saturn-5', world: 'saturn', name: 'Asteroid Drift', par: 3,
      tip: 'Ride the drifting asteroid across, or wait for it to line up.',
      tee: [130, 300], cup: [860, 300],
      floor: [
        box(60, 180, 280, 240),
        { pts: rect(336, 120, 288, 120), move: { dx: 0, dy: 240, period: 6, phase: 0 } },
        box(620, 150, 320, 300),
      ],
      walls: [
        { pts: [[340, 250], [340, 180], [60, 180], [60, 420], [340, 420], [340, 350]] },
        { pts: [[620, 350], [620, 450], [940, 450], [940, 150], [620, 150], [620, 250]] },
      ],
      bumpers: [{ x: 760, y: 220, r: 16 }, { x: 760, y: 380, r: 16 }],
    },
    {
      id: 'saturn-6', world: 'saturn', name: "Saturn's Crown", par: 4,
      tip: 'Take the long way round the rings, or find the wormhole shortcut.',
      tee: polar(500, 300, 200, 128), cup: polar(500, 300, 200, 232),
      floor: [{ pts: [...arc(500, 300, 270, deg(-150), deg(150), 40), ...arc(500, 300, 130, deg(150), deg(-150), 24)] }],
      walls: [
        { pts: arc(500, 300, 270, deg(-150), deg(150), 40) },
        { pts: arc(500, 300, 130, deg(-150), deg(150), 24), e: 0.8 },
      ],
      portals: [{ a: polar(500, 300, 200, 55), b: polar(500, 300, 200, 300), r: 24, exitAngle: deg(200) }],
      bumpers: [{ x: polar(500, 300, 200, 0)[0], y: 300, r: 20 }, { x: polar(500, 300, 215, 335)[0], y: polar(500, 300, 215, 335)[1], r: 16 }],
      zones: [{ pts: [...arc(500, 300, 272, deg(-40), deg(40), 10), ...arc(500, 300, 128, deg(40), deg(-40), 10)], surface: 'ice' }],
      wells: [{ x: 500, y: 300, r: 250, k: 150, core: 0 }],
      decor: [{ type: 'planet', x: 500, y: 300, r: 92 }],
    },
  ];

  for (const h of HOLES) h.surface = WORLDS.find((w) => w.id === h.world).surface;
  HOLES.forEach((h, i) => { h.number = i + 1; });

  function worldOf(hole) {
    return WORLDS.find((w) => w.id === hole.world);
  }

  function holesIn(worldId) {
    return HOLES.filter((h) => h.world === worldId);
  }

  return { WIDTH: 1000, HEIGHT: 600, WORLDS, HOLES, worldOf, holesIn };
});
