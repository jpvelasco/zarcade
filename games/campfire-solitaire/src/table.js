// Where everything sits on screen, as a pure function of the viewport and the
// layout, so tests can check every layout on phones and desktops. Two
// arrangements are compared and the one with bigger cards wins:
//   below — board on top, then a row of [undo] [stock] (fire) [waste] [hint];
//   sides — [stock] board [waste], buttons under the piles (phone landscape).
// The top band stays clear for the HUD and the arcade's full-screen pill.

export const CARD_RATIO = 1.4; // height / width
export const TOP_BAND = 60;
export const BTN = 48; // undo / hint buttons (square)
const GAP = 10;
const MARGIN = 8;

function belowOption(cols, rows, availW, availH, cap) {
  // Width: the board, and the pile row (two buttons, two piles at scale P and
  // a fire gap of 1.1 pile widths).
  const P = 1.15;
  const rowCards = 2 * P + 1.1 * P;
  const wBoard = availW / cols;
  const wRow = (availW - 2 * BTN - 4 * GAP) / rowCards;
  const wHeight = (availH - GAP * 2) / (CARD_RATIO * (rows + 0.25 + P));
  return { kind: 'below', w: Math.min(wBoard, wRow, wHeight, cap), P };
}

function sidesOption(cols, rows, availW, availH, cap) {
  const P = 1.1;
  const wWidth = (availW - 4 * GAP) / (cols + 2 * P);
  const wHeight = availH / (CARD_RATIO * rows);
  // Each pile column also holds its button under the pile.
  const wPile = (availH - BTN - GAP) / (CARD_RATIO * P);
  return { kind: 'sides', w: Math.min(wWidth, wHeight, wPile, cap), P };
}

export function computeTable(vw, vh, layout, insets = {}) {
  const inset = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
  const cols = layout.width / 2;
  const rows = layout.height / 2;
  const left = inset.left + MARGIN;
  const right = vw - inset.right - MARGIN;
  const top = TOP_BAND + inset.top;
  const bottom = vh - inset.bottom - MARGIN - 4;
  const availW = right - left;
  const availH = bottom - top;
  // Big enough to use a desktop window, but never comically large.
  const cap = Math.max(48, Math.min(132, vh * 0.15, vw * 0.12));

  const a = belowOption(cols, rows, availW, availH, cap);
  const b = sidesOption(cols, rows, availW, availH, cap);
  const pick = b.w > a.w * 1.08 ? b : a;
  const W = Math.floor(pick.w);
  const H = Math.round(W * CARD_RATIO);
  const portrait = vh > vw * 1.15;
  const bw = cols * W;
  const bh = (rows * H);
  const ux = W / 2;
  const uy = H / 2;
  let P = pick.P;
  let boardX;
  let boardY;
  let stock;
  let waste;
  let undo;
  let hint;
  let fire;

  if (pick.kind === 'below') {
    // On a tall phone the piles can grow into the spare height, and sit low
    // where a thumb rests; the board floats in the upper part with the camp
    // scene between them.
    const rowFit = (availW - 2 * BTN - 4 * GAP) / (3.1 * W);
    const heightFit = (availH - bh - GAP * 3) / H;
    P = Math.max(pick.P, Math.min(portrait ? 1.6 : 1.25, rowFit, heightFit));
    const pw = Math.round(W * P);
    const ph = Math.round(H * P);
    const fireW = Math.round(pw * 1.1);
    const free = Math.max(0, availH - bh - ph - GAP * 2);
    boardX = Math.round(vw / 2 - bw / 2);
    let rowY;
    if (portrait) {
      // Piles low for thumbs; the board midway between sky and camp.
      rowY = Math.round(bottom - ph - Math.min(24, free * 0.05));
      boardY = Math.round(top + Math.max(0, rowY - GAP * 2 - top - bh) * 0.6);
    } else {
      boardY = Math.round(top + free * 0.3);
      rowY = Math.round(boardY + bh + GAP * 2 + free * 0.35);
    }
    const cx = vw / 2;
    stock = { x: Math.round(cx - fireW / 2 - pw), y: rowY, w: pw, h: ph };
    waste = { x: Math.round(cx + fireW / 2), y: rowY, w: pw, h: ph };
    const by = Math.round(rowY + ph / 2 - BTN / 2);
    undo = { x: Math.max(left, stock.x - GAP * 2 - BTN), y: by, w: BTN, h: BTN };
    hint = { x: Math.min(right - BTN, waste.x + pw + GAP * 2), y: by, w: BTN, h: BTN };
    fire = { x: cx, y: rowY + ph * 0.9, size: Math.round(fireW * 0.8) };
  } else {
    // Piles grow into the spare width at the sides. The right column holds
    // the waste, the fire under it, then the hint button; the left column
    // the stock and undo.
    const side = (availW - bw) / 2 - GAP * 3;
    P = Math.max(pick.P, Math.min(vh < 520 ? 1.6 : 1.3, side / W, (availH - BTN - GAP * 3 - W * 0.9) / (H + W * 0.75)));
    const pw = Math.round(W * P);
    const ph = Math.round(H * P);
    const fireH = Math.round(pw * 0.75);
    boardX = Math.round(vw / 2 - bw / 2);
    boardY = Math.round(top + Math.max(0, availH - bh) * 0.35);
    const colH = ph + GAP + fireH + GAP + BTN;
    const pileY = Math.round(Math.max(top, Math.min(bottom - colH, boardY + bh / 2 - colH / 2)));
    const gapX = Math.max(GAP * 2, Math.min(GAP * 4, side - pw));
    stock = { x: Math.round(boardX - gapX - pw), y: pileY, w: pw, h: ph };
    waste = { x: Math.round(boardX + bw + gapX), y: pileY, w: pw, h: ph };
    undo = { x: Math.round(stock.x + pw / 2 - BTN / 2), y: pileY + ph + GAP * 2, w: BTN, h: BTN };
    hint = { x: Math.round(waste.x + pw / 2 - BTN / 2), y: pileY + colH - BTN, w: BTN, h: BTN };
    fire = { x: waste.x + pw / 2, y: pileY + ph + GAP + fireH * 0.8, size: Math.round(pw * 0.62) };
  }

  const slots = layout.slots.map((s) => ({ x: boardX + s.x * ux, y: boardY + s.y * uy, w: W, h: H }));
  return {
    vw,
    vh,
    kind: pick.kind,
    portrait,
    W,
    H,
    P,
    board: { x: boardX, y: boardY, w: bw, h: bh },
    slots,
    stock,
    waste,
    undo,
    hint,
    fire,
  };
}

const contains = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

// Which slot a point hits: later slots lie on top, so search from the end and
// skip cleared ones. Returns -1 for none.
export function slotAt(table, isCleared, x, y) {
  for (let i = table.slots.length - 1; i >= 0; i--) {
    if (isCleared(i)) continue;
    if (contains(table.slots[i], x, y)) return i;
  }
  return -1;
}

export const inRect = contains;

export function overlapsRect(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
