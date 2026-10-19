// Table layouts, drawn as ASCII art in half-card units. Each text row is half
// a card height; each character is half a card width. `o` marks a card's left
// edge and `*` a peak (a bonus card that covers nothing: the last card of its
// peak). A card covers every card in a higher row whose rectangle it overlaps,
// so covers come from the geometry and can't drift out of sync with the art.
//
// Bounds: 16 units wide (8 cards) and 10 units tall (5 card heights), so every
// layout fits a 390×844 phone held upright with cards at least 44 px wide.
// `lines` join peaks (by their reading order) into a constellation that lights
// up as the peaks are cleared.

export const MAX_W = 16;
export const MAX_H = 10;

const DEFS = [
  {
    id: 'peaks',
    name: 'Three Peaks',
    blurb: 'Three little mountains over the camp.',
    art: [
      '   *   *   *',
      '  o o o o o o',
      ' o o o o o o o',
      'o o o o o o o o',
    ],
    lines: [],
  },
  {
    id: 'tent',
    name: 'The Tent',
    blurb: 'A cozy tent with the door flap open.',
    art: [
      '      *',
      '    o o o',
      '  o o o o o',
      '* o o o o o *',
      'o o o   o o o',
      'o o o   o o o',
    ],
    lines: [],
  },
  {
    id: 'pine',
    name: 'Pine Tree',
    blurb: 'A tall pine with a star on top.',
    art: [
      '      *',
      '      o',
      '    * o *',
      '    o o o',
      '  o o o o o',
      '  o o o o o',
      'o o o o o o o',
      '      o',
    ],
    lines: [],
  },
  {
    id: 'canoe',
    name: 'Canoe',
    blurb: 'Paddle out across the moonlit lake.',
    art: [
      '*      *      *',
      ' o o o o o o o',
      '  o o o o o o',
      '   o o o o o',
    ],
    lines: [],
  },
  {
    id: 'dipper',
    name: 'Big Dipper',
    blurb: 'Seven stars that scoop up the night.',
    art: [
      '*       *',
      'o    *  o  *',
      'o    o  o  o',
      '     o     o  *',
      '              o',
      ' *            o',
      ' o   *',
      ' o   o',
      '     o',
    ],
    // Peaks in reading order: Dubhe, Alioth, Megrez, Mizar, Alkaid, Merak, Phecda.
    lines: [[0, 5], [5, 6], [6, 2], [2, 0], [2, 1], [1, 3], [3, 4]],
  },
  {
    id: 'twin',
    name: 'Twin Peaks',
    blurb: 'Two mountains with the foothills below.',
    art: [
      '   *       *',
      '  o o     o o',
      ' o o o   o o o',
      'o o o o o o o o',
      ' o o o o o o o',
    ],
    lines: [],
  },
  {
    id: 'lantern',
    name: 'Lantern',
    blurb: 'A camp lantern glowing on its hook.',
    art: [
      '      *',
      '    * o *',
      '  o o o o o',
      '  o o o o o',
      '  o o o o o',
      '  o o o o o',
      '    o o o',
    ],
    lines: [],
  },
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    blurb: 'The queen\'s W sparkles over the ridge.',
    art: [
      ' *     *     *',
      'o o   o o   o o',
      ' o     o     o',
      '',
      '',
      '    *     *',
      '   o o   o o',
      '    o     o',
    ],
    // Peaks: top-left, top-middle, top-right, low-left, low-right.
    lines: [[0, 3], [3, 1], [1, 4], [4, 2]],
  },
  {
    id: 'campfire',
    name: 'Campfire',
    blurb: 'Three flames dancing over the logs.',
    art: [
      '       *',
      '  *   o o   *',
      ' o o o o o o o',
      'o o o o o o o o',
      ' o o o o o o o',
    ],
    lines: [],
  },
  {
    id: 'orion',
    name: 'Orion',
    blurb: 'The hunter strides across the sky.',
    art: [
      '  *',
      '  o         *',
      '  o      *  o',
      '       * o  o',
      '     * o o',
      '     o o',
      '   * o      *',
      '   o        o',
      '   o        o',
    ],
    // Peaks: Betelgeuse, Bellatrix, Mintaka, Alnilam, Alnitak, Saiph, Rigel.
    lines: [[0, 4], [4, 3], [3, 2], [2, 1], [0, 1], [4, 5], [2, 6]],
  },
];

// Cards overlap when their rectangles (2×2 units) intersect.
const overlaps = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

export function parseLayout(def) {
  const slots = [];
  def.art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'o' || ch === '*') slots.push({ x, y, peak: ch === '*' });
      else if (ch !== ' ') throw new Error(`${def.id}: unexpected "${ch}" at ${x},${y}`);
    }
  });
  // Art may be indented for readability; the table centres the tight bounds.
  const minX = Math.min(...slots.map((s) => s.x));
  for (const s of slots) s.x -= minX;
  // Reading order (row by row, left to right) is the deal order and z order:
  // a later row lies on top of the rows above it.
  const coveredBy = slots.map((a) => []);
  const covers = slots.map(() => []);
  slots.forEach((a, i) => {
    slots.forEach((b, j) => {
      if (b.y > a.y && overlaps(a, b)) {
        coveredBy[i].push(j);
        covers[j].push(i);
      }
    });
  });
  const peaks = slots.map((s, i) => (s.peak ? i : -1)).filter((i) => i >= 0);
  const width = Math.max(...slots.map((s) => s.x)) + 2;
  const height = Math.max(...slots.map((s) => s.y)) + 2;
  // Bit masks for the solver: bit j set when slot j lies over slot i.
  const coverMask = coveredBy.map((list) => list.reduce((m, j) => m | (1 << j), 0));
  return {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    slots,
    coveredBy,
    covers,
    coverMask,
    peaks,
    lines: def.lines || [],
    width,
    height,
    count: slots.length,
  };
}

export const LAYOUTS = DEFS.map(parseLayout);
export const LAYOUT_IDS = LAYOUTS.map((l) => l.id);
const BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));
export const layoutById = (id) => BY_ID.get(id) || LAYOUTS[0];

// Slots that start face up: nothing lies over them.
export const openSlots = (layout) => layout.slots.map((_, i) => i).filter((i) => layout.coveredBy[i].length === 0);
