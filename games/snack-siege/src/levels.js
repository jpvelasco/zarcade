// Level data: a tiny fort-building kit, the 36 campaign levels (three
// worlds of twelve) and the seeded daily fort. All y values passed to the
// builder are the bottom edge of a piece; ground level is y = 0.
import { MATERIALS, BEARS, BEAR_SCORE, BEAN_BONUS, WORLDS } from './config.js';
import { mulberry32, hashString } from './rng.js';

export const LEVELS_PER_WORLD = 12;
const COL = 0.4; // column / plank thickness

export class Builder {
  constructor() {
    this.pieces = [];
    this.bears = [];
    this.terrain = [];
    this.pits = [];
  }

  box(x, y, w, h, mat = 'cookie', a = 0) {
    this.pieces.push({ mat, shape: 'box', x, y: y + h / 2, w, h, a });
    return y + h;
  }
  col(x, y, h = 2, mat = 'cookie') { return this.box(x, y, COL, h, mat); }
  plank(x, y, w = 2.8, mat = 'cookie') { return this.box(x, y, w, COL, mat); }
  block(x, y, s = 1, mat = 'cookie') { return this.box(x, y, s, s, mat); }
  crate(x, y, s = 1) { return this.box(x, y, s, s, 'fizz'); }
  ball(x, y, r = 0.5, mat = 'gumball') {
    this.pieces.push({ mat, shape: 'circle', x, y: y + r, r, w: r * 2, h: r * 2 });
    return y + 2 * r;
  }

  // Two columns and a lid. Returns the top of the lid.
  frame(x, y, w = 2.8, h = 2, mat = 'cookie', lid = mat) {
    this.col(x - w / 2 + COL / 2, y, h, mat);
    this.col(x + w / 2 - COL / 2, y, h, mat);
    return this.plank(x, y + h, w, lid);
  }

  // Frames stacked n high; `fill(i, y)` can add things inside floor i.
  tower(x, y, n, { w = 2.8, h = 2, mat = 'cookie', lid = mat, mats = null, fill = null } = {}) {
    for (let i = 0; i < n; i++) {
      const m = mats ? mats[i % mats.length] : mat;
      const top = this.frame(x, y, w, h, m, mats ? m : lid);
      if (fill) fill(i, y);
      y = top;
    }
    return y;
  }

  pyramid(x, y, rows, s = 1, mat = 'cookie') {
    for (let r = 0; r < rows; r++) {
      const n = rows - r;
      for (let i = 0; i < n; i++) this.box(x + (i - (n - 1) / 2) * s, y + r * s, s * 0.98, s, typeof mat === 'function' ? mat(r, i) : mat);
    }
    return y + rows * s;
  }

  bear(x, y, size = 's') {
    this.bears.push({ x, y: y + BEARS[size].r, size });
    return y + BEARS[size].r * 2;
  }

  // A raised plateau of static ground with its top at `top`.
  ledge(x0, x1, top, ice = false) {
    this.terrain.push({ x: (x0 + x1) / 2, y: (top - 4) / 2, w: x1 - x0, h: top + 4, ice });
    return top;
  }
  pit(x0, x1) { this.pits.push([x0, x1]); }
  // A static ramp from (x0, y0) to (x1, y1), 0.5 thick, top surface on the line.
  slope(x0, y0, x1, y1, ice = false) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    const t = 0.5;
    this.terrain.push({ x: (x0 + x1) / 2 + Math.sin(a) * t / 2, y: (y0 + y1) / 2 - Math.cos(a) * t / 2, w: len, h: t, a, ice });
  }
}

function groundSpans(width, pits) {
  const spans = [];
  let x = -30;
  for (const [a, b] of pits.slice().sort((p, q) => p[0] - q[0])) {
    if (a > x) spans.push([x, a]);
    x = Math.max(x, b);
  }
  spans.push([x, width + 30]);
  return spans;
}

export function starThresholds(pieces, bears, beanCount) {
  const blocks = pieces.reduce((s, p) => s + MATERIALS[p.mat].score, 0);
  const base = bears.length * BEAR_SCORE;
  const round = (v) => Math.round(v / 500) * 500;
  const two = round(base + blocks * 0.3);
  const three = round(base + blocks * 0.5 + (beanCount > 1 ? BEAN_BONUS : 0));
  return [two, Math.max(three, two + 1000)];
}

function finish(def, b, meta) {
  const maxX = Math.max(...b.pieces.map((p) => p.x + p.w / 2), ...b.bears.map((p) => p.x + 1), ...b.terrain.map((t) => t.x + t.w / 2), 20);
  const maxY = Math.max(...b.pieces.map((p) => p.y + p.h / 2), ...b.bears.map((p) => p.y + 1), ...b.terrain.map((t) => t.y + t.h / 2), 8);
  const width = Math.max(24, Math.ceil(maxX + 2.5));
  return {
    ...meta,
    name: def.name,
    beans: def.beans.slice(),
    tip: def.tip || null,
    width,
    height: maxY,
    ground: groundSpans(width, b.pits),
    pits: b.pits.slice(),
    terrain: b.terrain,
    pieces: b.pieces,
    bears: b.bears,
    stars: starThresholds(b.pieces, b.bears, def.beans.length),
  };
}

// ------------------------------------------------------------ campaign

const W1 = [
  {
    name: 'First Crumbs', beans: ['cherry', 'cherry', 'cherry'], tip: 'Pull back, aim the dotted arc at the gummy bears, and let go!',
    build(b) {
      const top = b.frame(21, 0, 2.8, 2);
      b.bear(21, top, 's');
      b.bear(21, 0, 's');
    },
  },
  {
    name: 'Cookie Row', beans: ['cherry', 'cherry', 'cherry'],
    build(b) {
      b.bear(19, b.frame(19, 0), 's');
      b.block(21.6, 0, 1); b.block(21.6, 1, 1, 'glass');
      b.bear(24.2, b.frame(24.2, 0), 's');
      b.bear(24.2, 0, 's');
    },
  },
  {
    name: 'Glass House', beans: ['cherry', 'cherry', 'cherry'], tip: 'Sugar glass shatters with the smallest bump.',
    build(b) {
      const top = b.tower(23, 0, 2, { mat: 'glass', lid: 'cookie', fill: (i, y) => i === 0 && b.bear(23, y, 'm') });
      b.bear(23, top, 's');
      b.block(25.4, 0, 1, 'glass'); b.block(26.4, 0, 1, 'glass');
    },
  },
  {
    name: 'Berry Good', beans: ['blue', 'blue', 'cherry'],
    build(b) {
      b.bear(19.5, b.plank(19.5, b.col(19.5, 0, 2.4), 1.2), 's');
      b.bear(22.5, b.tower(22.5, 0, 1, { w: 1.6, mat: 'glass' }), 's');
      b.bear(25.5, b.plank(25.5, b.col(25.5, 0, 3.2), 1.2), 's');
      b.block(27.2, 0, 1); b.bear(27.2, 1, 's');
    },
  },
  {
    name: 'Crumbly Castle', beans: ['cherry', 'blue', 'cherry'],
    build(b) {
      const t1 = b.tower(22, 0, 3, { fill: (i, y) => { if (i === 0) b.block(22, y, 1, 'glass'); if (i === 1) b.bear(22, y, 's'); } });
      b.bear(22, t1, 'm');
      b.frame(25, 0, 2.8, 2, 'glass', 'cookie');
      b.bear(25, 0, 's');
    },
  },
  {
    name: 'Choco Wall', beans: ['cherry', 'blue', 'blue'], tip: 'Chocolate is tough. Lob your bean over the wall!',
    build(b) {
      b.box(19, 0, 1, 2, 'choc'); b.box(19, 2, 1, 2, 'choc'); b.box(19, 4, 1, 1, 'choc');
      b.bear(22, b.frame(22, 0, 2.8, 2, 'cookie'), 's');
      b.bear(22, 0, 's');
      b.bear(25, b.block(25, 0, 1, 'glass'), 's');
    },
  },
  {
    name: 'Boing!', beans: ['lime', 'lime', 'cherry'], tip: 'Lime Bouncer is super bouncy. Skip it in under the roof!',
    build(b) {
      b.col(20, 0, 1.6, 'choc'); b.col(28, 0, 1.6, 'choc');
      b.col(24, 0, 1.6, 'choc');
      b.plank(21.9, 1.6, 4.2, 'choc'); b.plank(26.1, 1.6, 4.2, 'choc');
      b.bear(22, 0, 's'); b.bear(26, 0, 's');
      b.bear(24, 2, 's');
    },
  },
  {
    name: 'Canyon Ledge', beans: ['cherry', 'lime', 'blue'],
    build(b) {
      b.ledge(22, 32, 3);
      b.bear(24.5, b.frame(24.5, 3), 's');
      b.tower(28, 3, 2, { mat: 'cookie', fill: (i, y) => b.bear(28, y, 's') });
      b.bear(19, 0, 's');
    },
  },
  {
    name: 'Pyramid Pile', beans: ['blue', 'cherry', 'lime'],
    build(b) {
      const top = b.pyramid(24, 0, 5, 1, (r) => (r === 2 ? 'glass' : 'cookie'));
      b.bear(24, top, 'm');
      b.bear(20.6, 0, 's');
      b.bear(27.4, 0, 's');
    },
  },
  {
    name: 'Grape Escape', beans: ['grape', 'grape', 'cherry'], tip: 'Tap while flying to turn Grape Boulder heavy and smash down!',
    build(b) {
      b.box(21.5, 0, 0.6, 2, 'choc'); b.box(25.5, 0, 0.6, 2, 'choc');
      b.plank(23.5, 2, 4.6, 'choc');
      b.plank(23.5, 2.4, 4.6, 'choc');
      b.bear(23.5, 0, 'm');
      b.bear(23.5, 2.8, 's');
    },
  },
  {
    name: 'Twin Towers', beans: ['grape', 'blue', 'lime', 'cherry'],
    build(b) {
      const t1 = b.tower(21, 0, 4, { w: 2.4, fill: (i, y) => i % 2 === 1 && b.bear(21, y, 's') });
      b.bear(21, t1, 's');
      const t2 = b.tower(27, 0, 4, { w: 2.4, mats: ['cookie', 'glass'], fill: (i, y) => i % 2 === 0 && b.bear(27, y, 's') });
      b.bear(27, t2, 's');
    },
  },
  {
    name: 'Cookie Keep', beans: ['cherry', 'blue', 'lime', 'grape'], tip: 'A big helmet bear! Hit it hard, or drop the castle on it.',
    build(b) {
      b.frame(21, 0, 2.8, 2.4); b.bear(21, 0, 's');
      const mid = b.frame(25, 0, 4.4, 2.4, 'choc', 'cookie');
      b.bear(25, 0, 'l');
      b.frame(29, 0, 2.8, 2.4); b.bear(29, 0, 's');
      b.frame(25, mid, 2.8, 2, 'glass', 'cookie');
      b.bear(25, mid, 's');
      b.block(21, 2.8, 1, 'glass'); b.block(29, 2.8, 1, 'glass');
      b.bear(21, 3.8, 's'); b.bear(29, 3.8, 's');
    },
  },
];

const W2 = [
  {
    name: 'Fizzy Welcome', beans: ['cherry', 'cherry', 'cherry'], tip: 'Fizz crates go BOOM when they get hit!',
    build(b) {
      b.frame(21, 0); b.crate(21, 0);
      b.bear(21, 2.4, 's');
      b.frame(25, 0); b.bear(25, 0, 's');
      b.crate(25, 2.4); b.bear(23, 0, 's');
    },
  },
  {
    name: 'Sticky Situation', beans: ['honey', 'honey', 'cherry'], tip: 'Honey Drop sticks where it lands, then bursts. Tap to pop it early!',
    build(b) {
      const top = b.tower(23, 0, 3, { w: 2.4, mat: 'glass', lid: 'cookie', fill: (i, y) => b.bear(23, y, 's') });
      b.bear(23, top, 's');
    },
  },
  {
    name: 'Marshmallow Mound', beans: ['blue', 'honey', 'lime'], tip: 'Marshmallow is soft and bouncy.',
    build(b) {
      b.box(21, 0, 2, 1, 'marsh'); b.box(23, 0, 2, 1, 'marsh'); b.box(25, 0, 2, 1, 'marsh');
      b.box(22, 1, 2, 1, 'marsh'); b.box(24, 1, 2, 1, 'marsh');
      b.bear(23, b.box(23, 2, 2, 1, 'marsh'), 'm');
      b.bear(19.5, 0, 's'); b.bear(27, 0, 's');
    },
  },
  {
    name: 'Soda Pit', beans: ['cherry', 'grape', 'blue'], tip: 'Bears that fall in the soda are out!',
    build(b) {
      b.pit(24, 28);
      b.ledge(28, 34, 2);
      b.bear(28.9, 2, 's');
      b.tower(31, 2, 2, { fill: (i, y) => b.bear(31, y, 's') });
      b.frame(21.5, 0, 2.8, 2, 'glass', 'cookie'); b.bear(21.5, 2.4, 's');
    },
  },
  {
    name: 'Gumball Hill', beans: ['cherry', 'blue', 'honey'],
    build(b) {
      const top = b.frame(22, 0, 3.6, 2.4, 'cookie');
      b.bear(22, 0, 'm');
      b.block(20.7, top, 0.6, 'glass'); b.block(23.3, top, 0.6, 'glass');
      b.ball(22, top, 0.6);
      const t2 = b.frame(26.5, 0, 2.8, 2.4);
      b.bear(26.5, 0, 's');
      b.ball(26.5, t2, 0.5);
      b.block(25.6, t2, 0.5, 'cookie'); b.block(27.4, t2, 0.5, 'cookie');
    },
  },
  {
    name: 'Rocket Rescue', beans: ['mint', 'mint', 'cherry'], tip: 'Tap to fire Mint Rocket straight ahead!',
    build(b) {
      b.box(22, 0, 1, 5, 'choc'); b.box(22, 5, 1, 2, 'choc');
      b.tower(30, 0, 2, { mat: 'glass', lid: 'cookie', fill: (i, y) => b.bear(30, y, 's') });
      b.bear(30, 4.8, 's');
      b.bear(26, 0, 's');
    },
  },
  {
    name: 'Chain Reaction', beans: ['cherry', 'mint', 'honey'],
    build(b) {
      for (let i = 0; i < 5; i++) b.crate(20 + i * 1.6, 0);
      b.plank(21.6, 1, 4.4); b.plank(26.0, 1, 4.4);
      b.bear(20.8, 1.4, 's'); b.bear(23.2, 1.4, 's'); b.bear(25.4, 1.4, 's'); b.bear(27.6, 1.4, 's');
    },
  },
  {
    name: 'Bubble Bridge', beans: ['grape', 'blue', 'mint'],
    build(b) {
      b.pit(21, 29);
      b.ledge(17, 21, 2); b.ledge(29, 33, 2);
      b.plank(25, 2, 9.6, 'cookie');
      b.bear(23, 2.4, 's'); b.bear(27, 2.4, 's');
      b.frame(25, 2.4, 2.8, 1.6, 'glass', 'cookie');
      b.bear(25, 2.4, 's');
      b.bear(31, 2, 'm');
    },
  },
  {
    name: 'Pop Fort', beans: ['honey', 'mint', 'lime', 'blue'],
    build(b) {
      b.box(22, 0, 1, 1.6, 'marsh'); b.box(26, 0, 1, 1.6, 'marsh');
      const t = b.plank(24, 1.6, 5.2, 'choc');
      b.bear(24, 0, 'm');
      const t2 = b.frame(24, t, 3.6, 2, 'glass', 'choc');
      b.bear(24, t, 's');
      b.crate(24, t2, 0.8);
      b.bear(27.8, 0, 's'); b.bear(20.2, 0, 's');
    },
  },
  {
    name: 'Twin Springs', beans: ['blue', 'mint', 'grape', 'honey'],
    build(b) {
      b.pit(24, 27);
      b.tower(21.5, 0, 2, { fill: (i, y) => b.bear(21.5, y, 's') });
      b.ledge(27, 33, 1.5);
      b.tower(30, 1.5, 3, { w: 2.4, mats: ['glass', 'cookie', 'glass'], fill: (i, y) => i !== 1 && b.bear(30, y, 's') });
      b.crate(28, 1.5, 0.9);
    },
  },
  {
    name: 'Fizz Factory', beans: ['cherry', 'honey', 'mint'],
    build(b) {
      b.tower(24, 0, 4, { w: 3.2, fill: (i, y) => { if (i % 2 === 0) b.crate(24, y, 1); else b.bear(24, y, 's'); } });
      b.bear(28, b.crate(28, 0), 's');
      b.bear(20.5, 0, 's');
    },
  },
  {
    name: 'Soda Citadel', beans: ['grape', 'honey', 'mint', 'blue', 'lime'], tip: 'The Citadel! Use every power you have.',
    build(b) {
      b.pit(19, 21.5);
      b.box(23, 0, 1, 3, 'choc');
      b.frame(26, 0, 4, 2.6, 'marsh', 'choc');
      b.bear(26, 0, 'l');
      const top = b.frame(26, 3, 3, 2, 'cookie', 'cookie');
      b.bear(26, 3, 's');
      b.crate(26, top, 0.9);
      b.tower(30.5, 0, 3, { w: 2.4, mats: ['glass', 'cookie'], fill: (i, y) => b.bear(30.5, y, 's') });
      b.crate(28.6, 0, 0.8);
    },
  },
];

const W3 = [
  {
    name: 'Slippery Start', beans: ['cherry', 'blue', 'lime'], tip: 'Frosting ice is slick. Things slide right off it!',
    build(b) {
      b.ledge(21, 30, 2.5, true);
      b.bear(23, 2.5, 's');
      b.bear(26, b.frame(26, 2.5, 2.8, 1.8, 'ice'), 's');
      b.bear(28.8, 2.5, 's');
    },
  },
  {
    name: 'Rock Candy Bunker', beans: ['grape', 'grape', 'honey'], tip: 'Rock candy is the toughest stuff around. Go heavy!',
    build(b) {
      b.box(22, 0, 0.6, 1.8, 'rock'); b.box(26, 0, 0.6, 1.8, 'rock');
      b.plank(24, 1.8, 4.6, 'cookie');
      b.bear(24, 0, 'm');
      b.bear(24, b.box(24, 2.2, 2, 0.6, 'rock'), 's');
      b.bear(28.5, 0, 's');
    },
  },
  {
    name: 'Icicle Spires', beans: ['blue', 'mint', 'cherry'],
    build(b) {
      for (const [i, x] of [20, 23, 26, 29].entries()) {
        const h = 3 + (i % 2) * 1.5;
        b.box(x, 0, 0.6, h, 'ice');
        b.bear(x, b.plank(x, h, 1.4, 'ice'), 's');
      }
    },
  },
  {
    name: 'Peak Perch', beans: ['lime', 'mint', 'honey'],
    build(b) {
      b.ledge(25, 33, 5);
      b.ledge(22, 25, 2.5);
      b.bear(23.5, 2.5, 's');
      b.tower(28, 5, 2, { w: 2.6, mat: 'ice', lid: 'cookie', fill: (i, y) => b.bear(28, y, 's') });
      b.bear(31, 5, 'm');
    },
  },
  {
    name: 'Avalanche', beans: ['cherry', 'blue', 'grape'], tip: 'Knock the gumballs off the cliff onto the bears below!',
    build(b) {
      b.ledge(26, 34, 4);
      b.box(27, 4, 0.6, 1.2, 'glass');
      b.ball(28.2, 4, 0.55); b.ball(29.4, 4, 0.55); b.ball(30.6, 4, 0.55);
      b.bear(22, b.frame(22, 0, 3, 1.8, 'ice', 'cookie'), 's');
      b.bear(22, 0, 's');
      b.bear(24.6, 0, 's');
      b.bear(32.4, 4, 's');
    },
  },
  {
    name: 'Frosted Layers', beans: ['grape', 'honey', 'blue', 'mint'],
    build(b) {
      let y = b.box(25, 0, 6, 0.6, 'choc');
      b.box(22.5, y, 0.6, 1.6, 'ice'); b.box(27.5, y, 0.6, 1.6, 'ice'); b.box(25, y, 0.6, 1.6, 'ice');
      b.bear(23.75, y, 's'); b.bear(26.25, y, 's');
      y = b.box(25, y + 1.6, 6, 0.5, 'marsh');
      b.box(23, y, 0.5, 1.4, 'glass'); b.box(27, y, 0.5, 1.4, 'glass');
      b.bear(25, y, 'm');
      y = b.box(25, y + 1.4, 4.6, 0.5, 'cookie');
      b.bear(25, y, 's');
    },
  },
  {
    name: 'Glacier Gap', beans: ['mint', 'lime', 'grape'],
    build(b) {
      b.pit(22, 26);
      b.ledge(26, 34, 3, true);
      b.bear(27.5, 3, 's');
      b.tower(30, 3, 2, { mats: ['ice', 'rock'], fill: (i, y) => b.bear(30, y, 's') });
      b.block(32.5, 3, 1, 'ice'); b.bear(32.5, 4, 's');
      b.bear(20, b.box(20, 0, 1.4, 1.4, 'ice'), 's');
    },
  },
  {
    name: 'Sky Tower', beans: ['blue', 'grape', 'mint', 'cherry'],
    build(b) {
      const top = b.tower(25, 0, 6, { w: 2.6, h: 1.8, mats: ['rock', 'cookie', 'ice', 'cookie', 'glass', 'ice'], fill: (i, y) => i % 2 === 1 && b.bear(25, y, 's') });
      b.bear(25, top, 'm');
      b.bear(28, 0, 's');
    },
  },
  {
    name: 'Crate Peaks', beans: ['cherry', 'honey', 'lime'],
    build(b) {
      b.ledge(24, 32, 2.5, true);
      b.crate(24.6, 2.5, 0.9); b.crate(31, 2.5, 0.9);
      b.frame(28, 2.5, 3.2, 2, 'ice', 'cookie');
      b.bear(28, 2.5, 'm');
      b.crate(28, 4.9, 0.9);
      b.bear(25.7, 2.5, 's');
      b.bear(21, b.crate(21, 0), 's');
    },
  },
  {
    name: 'Twin Peaks', beans: ['mint', 'grape', 'blue', 'honey'],
    build(b) {
      b.ledge(19, 23, 3.5); b.ledge(29, 34, 4.5);
      b.bear(21, b.frame(21, 3.5, 2.6, 1.8, 'rock', 'ice'), 's');
      b.bear(21, 3.5, 's');
      b.tower(31.5, 4.5, 2, { w: 2.4, mats: ['ice', 'glass'], fill: (i, y) => b.bear(31.5, y, 's') });
      b.bear(26, b.pyramid(26, 0, 3, 1, 'ice'), 's');
    },
  },
  {
    name: 'The Long Shot', beans: ['mint', 'mint', 'lime', 'cherry'],
    build(b) {
      b.box(20, 0, 1, 4, 'rock');
      b.ledge(31, 38, 3);
      b.tower(34.5, 3, 3, { w: 2.6, mats: ['ice', 'cookie', 'glass'], fill: (i, y) => b.bear(34.5, y, 's') });
      b.bear(32, 3, 's');
      b.bear(37, 3, 's');
    },
  },
  {
    name: "Bear King's Castle", beans: ['cherry', 'blue', 'lime', 'grape', 'honey', 'mint'], tip: 'The Bear King himself! Topple the castle!',
    build(b) {
      b.tower(21, 0, 3, { w: 2.4, mats: ['rock', 'ice', 'glass'], fill: (i, y) => i > 0 && b.bear(21, y, 's') });
      const hall = b.frame(26, 0, 4.4, 2.6, 'rock', 'choc');
      b.bear(26, 0, 'k');
      const up = b.frame(26, hall, 3.6, 2, 'ice', 'cookie');
      b.bear(26, hall, 'm');
      b.crate(26, up, 0.9);
      b.tower(31, 0, 3, { w: 2.4, mats: ['rock', 'ice', 'glass'], fill: (i, y) => i > 0 && b.bear(31, y, 's') });
      b.crate(23.4, 0, 0.8); b.crate(28.6, 0, 0.8);
    },
  },
];

function buildLevel(def, meta) {
  const b = new Builder();
  def.build(b);
  return finish(def, b, meta);
}

export const LEVELS = [W1, W2, W3].flatMap((defs, w) =>
  defs.map((def, i) => buildLevel(def, { world: w, index: w * LEVELS_PER_WORLD + i, id: `${w + 1}-${i + 1}` })),
);

export function levelLabel(i) {
  return `${Math.floor(i / LEVELS_PER_WORLD) + 1}-${(i % LEVELS_PER_WORLD) + 1}`;
}

export function worldOf(i) {
  return WORLDS[Math.floor(i / LEVELS_PER_WORLD)];
}

// ------------------------------------------------------------ daily fort

const DAILY_PARTS = ['tower', 'frames', 'pyramid', 'bunker', 'spire', 'crates'];
const DAILY_NAMES = ['Sugar Rush', 'Crunch Time', 'Sprinkle Fort', 'Gummy Gulch', 'Candy Corner', 'Toffee Towers', 'Jelly Junction', 'Fudge Fort', 'Lolly Lookout', 'Caramel Keep'];

export function dailyLevel(key) {
  const rnd = mulberry32(hashString(`snack-siege:${key}`));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const world = Math.floor(rnd() * 3);
  const mats = [['cookie', 'glass', 'choc'], ['cookie', 'marsh', 'glass', 'choc'], ['ice', 'cookie', 'glass', 'rock']][world];
  const b = new Builder();
  let x = 18 + rnd() * 2;
  let bears = 0;
  const parts = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < parts; i++) {
    const kind = pick(DAILY_PARTS);
    const m = pick(mats);
    if (kind === 'tower') {
      const n = 2 + Math.floor(rnd() * 2);
      const top = b.tower(x + 1.4, 0, n, { mats: [m, pick(mats)], fill: (f, y) => { if (f % 2 === 0) { b.bear(x + 1.4, y, 's'); bears++; } } });
      b.bear(x + 1.4, top, 's'); bears++;
      x += 2.8;
    } else if (kind === 'frames') {
      for (let k = 0; k < 2; k++) { const top = b.frame(x + 1.4, 0, 2.8, 2, m, pick(mats)); if (k === 1 || rnd() < 0.5) { b.bear(x + 1.4, top, 's'); bears++; } x += 2.8; }
      x -= 2.8;
      x += 2.8;
    } else if (kind === 'pyramid') {
      const top = b.pyramid(x + 2, 0, 4, 1, (r) => (r === 1 ? pick(mats) : m));
      b.bear(x + 2, top, 'm'); bears++;
      x += 4;
    } else if (kind === 'bunker') {
      b.box(x + 0.3, 0, 0.6, 2, m); b.box(x + 3.7, 0, 0.6, 2, m);
      b.plank(x + 2, 2, 4, pick(mats));
      b.bear(x + 2, 0, 'm'); bears++;
      x += 4;
    } else if (kind === 'spire') {
      b.box(x + 0.5, 0, 0.6, 3.5, m);
      b.bear(x + 0.5, b.plank(x + 0.5, 3.5, 1.4, pick(mats)), 's'); bears++;
      x += 1.4;
    } else {
      b.crate(x + 0.5, 0); b.crate(x + 1.5, 0); b.crate(x + 1, 1);
      b.bear(x + 1, 2, 's'); bears++;
      x += 2;
    }
    x += 0.8 + rnd() * 1.5;
  }
  if (bears === 0) b.bear(x, 0, 's');
  const pool = ['cherry', 'blue', 'lime', 'grape', 'honey', 'mint'];
  const beans = [];
  const n = Math.min(6, 3 + Math.ceil(Math.max(bears, 1) / 2));
  for (let i = 0; i < n; i++) {
    let bean = pick(pool);
    // At most two of any bean, so every daily fort mixes powers.
    while (beans.filter((x) => x === bean).length >= 2) bean = pick(pool);
    beans.push(bean);
  }
  return finish({ name: pick(DAILY_NAMES), beans }, b, { world, index: -1, id: `daily-${key}`, daily: true, date: key });
}
