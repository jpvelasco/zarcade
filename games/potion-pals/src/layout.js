// Where everything sits on the canvas. DOM-free: it takes a width and height
// in CSS pixels and returns rectangles, so tests can check the treehouse fits
// on a phone as well as a laptop.
//
// The scene is a cross-section of the treehouse: a grid of six rooms stacked up
// the trunk, with the hearth and its cauldron along the bottom. Rooms fill from
// the bottom row upwards, so each new room appears higher in the tree.

export const ROOM_ORDER_WIDE = [[1, 1], [0, 1], [2, 1], [1, 0], [0, 0], [2, 0]];
export const ROOM_ORDER_TALL = [[0, 2], [1, 2], [0, 1], [1, 1], [0, 0], [1, 0]];

export function layout(W, H) {
  const portrait = H > W * 1.05;
  const pad = Math.round(Math.min(18, W * 0.02));
  const hearthH = Math.round(Math.max(130, Math.min(300, H * (portrait ? 0.3 : 0.36))));
  const roomsTop = Math.round(Math.min(74, H * 0.09));
  const roomsH = Math.max(80, H - hearthH - roomsTop);
  const cols = portrait ? 2 : 3;
  const rows = portrait ? 3 : 2;
  const order = portrait ? ROOM_ORDER_TALL : ROOM_ORDER_WIDE;

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
    const bandH = Math.max(14, Math.round(inner.h * 0.34));
    return {
      x, y, w: cellW, h: cellH, wall, roofH, floorH, inner,
      floor: { x: inner.x + 6, y: inner.y + inner.h - bandH, w: Math.max(20, inner.w - 12), h: bandH },
    };
  });

  const hearthY = roomsTop + roomsH + pad;
  const hearth = { x: 0, y: hearthY, w: W, h: Math.max(60, H - hearthY) };
  const r = Math.round(Math.min(hearth.h * 0.42, W * 0.15, 110));
  const cauldron = { x: Math.round(W / 2), y: Math.round(hearth.y + hearth.h * 0.52), r };

  return { W, H, portrait, pad, rooms, hearth, cauldron, trunkW: Math.round(Math.min(90, W * 0.08)) };
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
