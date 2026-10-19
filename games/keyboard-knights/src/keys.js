// The QWERTY layout, which finger presses each key, and key groups. DOM-free:
// the on-screen keyboard and the lesson hints both read from here.

export const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
];

// Extra keys for the sentence tier on the touch keyboard.
export const PUNCT_ROW = ['!', "'", '-'];

export const FINGERS = {
  lp: { hand: 'left', name: 'left pinky', short: 'pinky' },
  lr: { hand: 'left', name: 'left ring finger', short: 'ring' },
  lm: { hand: 'left', name: 'left middle finger', short: 'middle' },
  li: { hand: 'left', name: 'left pointer finger', short: 'pointer' },
  ri: { hand: 'right', name: 'right pointer finger', short: 'pointer' },
  rm: { hand: 'right', name: 'right middle finger', short: 'middle' },
  rr: { hand: 'right', name: 'right ring finger', short: 'ring' },
  rp: { hand: 'right', name: 'right pinky', short: 'pinky' },
  th: { hand: 'both', name: 'thumb', short: 'thumb' },
};

const FINGER_OF = {};
const assign = (finger, keys) => { for (const k of keys) FINGER_OF[k] = finger; };
assign('lp', 'qaz1`!');
assign('lr', 'wsx2');
assign('lm', 'edc3');
assign('li', 'rfvtgb45');
assign('ri', 'yhnujm67');
assign('rm', 'ik,8');
assign('rr', 'ol.9');
assign('rp', "p;/?'-0[]");
assign('th', ' ');

const SHIFTED = { '!': '1', '?': '/', '"': "'", ':': ';' };

// Base key for a character: 'F' -> 'f', '?' -> '?', ' ' -> ' '.
export function baseKey(ch) {
  if (ch >= 'A' && ch <= 'Z') return ch.toLowerCase();
  return ch;
}

export function needsShift(ch) {
  return (ch >= 'A' && ch <= 'Z') || ch === '!' || ch === '?' || ch === '"' || ch === ':';
}

export function fingerFor(ch) {
  const k = baseKey(ch);
  return FINGER_OF[k] || FINGER_OF[SHIFTED[k]] || null;
}

// Which Shift to hold: the opposite hand from the key's finger.
export function shiftSide(ch) {
  if (!needsShift(ch)) return null;
  const f = FINGERS[fingerFor(ch)];
  return f && f.hand === 'left' ? 'right' : 'left';
}

export const HOME_ROW = ['a', 's', 'd', 'f', 'j', 'k', 'l'];
export const TOP_ROW = ROWS[0];
export const BOTTOM_ROW = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
