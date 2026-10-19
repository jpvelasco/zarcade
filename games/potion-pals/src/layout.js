// Where everything sits on the canvas. DOM-free: it takes a width and height
// in CSS pixels and returns rectangles, so tests can check the treehouse fits
// on a phone as well as a laptop.
//
// The scene is a cross-section of the treehouse: a grid of six rooms stacked up
// the trunk, with the hearth and its cauldron along the bottom. Rooms fill from
// the bottom row upwards, so each new room appears higher in the tree.

export const ROOM_ORDER_WIDE = [[1, 1], [0, 1], [2, 1], [1, 0], [0, 0], [2, 0]];
export const ROOM_ORDER_TALL = [[0, 2], [1, 2], [0, 1], [1, 1], [0, 0], [1, 0]];
// A phone held sideways leaves a short, wide scene: one row of six rooms,
// filling outwards from the trunk.
export const ROOM_ORDER_STRIP = [[2, 0], [3, 0], [1, 0], [4, 0], [0, 0], [5, 0]];

export function layout(W, H) {
  const portrait = H > W * 1.05;
  const strip = !portrait && W > H * 2.6;
  const pad = Math.round(Math.max(7, Math.min(18, W * 0.02)));
  // The hearth takes the bottom strip; the rooms share what is left above it.
  const hearthH = strip ? Math.round(H * 0.5) : Math.round(Math.max(140, Math.min(300, H * 0.4)));
  const roomsTop = Math.round(Math.min(66, H * 0.085));
  const roomsBottom = H - hearthH;
  const roomsH = Math.max(80, roomsBottom - roomsTop - pad);
  const cols = portrait ? 2 : strip ? 6 : 3;
  const rows = portrait ? 3 : strip ? 1 : 2;
  const order = portrait ? ROOM_ORDER_TALL : strip ? ROOM_ORDER_STRIP : ROOM_ORDER_WIDE;

  const gridW = W - pad * 2;
  const cellW = Math.floor((gridW - pad * (cols - 1)) / cols);
  const cellH = Math.floor((roomsH - pad * (rows - 1)) / rows);

  const rooms = order.map(([c, r]) => {
    const x = pad + c * (cellW + pad);
    const y = roomsTop + r * (cellH + pad);
    const wall = Math.max(6, Math.round(cellW * 0.05));
    const roofH = Math.round(cellH * 0.17);
    const floorH = Math.max(8, Math.round(cellH * 0.1));
    const inner = { x: x + wall, y: y + roofH, w: cellW - wall * 2, h: cellH - roofH - floorH };
    // Pals walk on a band just above the floorboards.
    const bandH = Math.max(14, Math.round(inner.h * 0.46));
    return {
      x, y, w: cellW, h: cellH, wall, roofH, floorH, inner,
      floor: { x: inner.x + 6, y: inner.y + inner.h - bandH, w: Math.max(20, inner.w - 12), h: bandH },
    };
  });

  const hearth = { x: 0, y: roomsBottom, w: W, h: hearthH };
  const r = Math.round(Math.min(hearth.h * 0.4, W * 0.2, 104));
  const cauldron = { x: Math.round(W / 2), y: Math.round(hearth.y + hearth.h * 0.5), r };

  return { W, H, portrait, strip, pad, rooms, hearth, cauldron, trunkW: Math.round(Math.max(44, Math.min(104, W * 0.085))) };
}

// The three slots hovering just over the cauldron's rim, left to right.
export function potSlots(lay) {
  const c = lay.cauldron;
  const r = Math.max(15, Math.round(c.r * 0.3));
  const gap = Math.round(c.r * 0.76);
  const y = Math.round(c.y - c.r);
  return [-1, 0, 1].map((i) => ({ x: c.x + i * gap, y, r }));
}

// Screen rectangle a brew drop must land in to count as "into the cauldron".
export function cauldronHit(lay) {
  const c = lay.cauldron;
  const pad = c.r * 0.9;
  return { x: c.x - c.r - pad, y: c.y - c.r - pad, w: (c.r + pad) * 2, h: (c.r + pad) * 2 };
}

export function inRect(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
