// The things the ghosts have mislaid. DOM-free: sizes are in world units (a
// room is 1000 world units tall), `kinds` lists the hide slots an item can
// plausibly turn up in, and `art` names the drawing in art.js.
//
// Hide slot kinds:
//   shelf  on a shelf board, between books and jars
//   table  on a table, counter, desk or sill-height surface
//   floor  on the floor, among the clutter
//   under  poking out from under a rug, cushion or crate
//   nook   tucked in a corner or gap between furniture
//   hook   hanging from a hook, nail, branch or peg
//   behind peeking out from behind a curtain or a tall prop
//   high   up on a mantel, beam or top of a bookcase

const ALL = ['shelf', 'table', 'floor', 'under', 'nook', 'hook', 'behind', 'high'];
const NOT_HOOK = ALL.filter((k) => k !== 'hook');

export const ITEMS = [
  { id: 'teddy', label: 'Teddy bear', w: 108, h: 118, kinds: ['shelf', 'floor', 'under', 'nook', 'behind', 'high'], tint: '#c98a53' },
  { id: 'spectacles', label: 'Spectacles', w: 112, h: 52, kinds: ['shelf', 'table', 'floor', 'under', 'nook', 'behind'], tint: '#d9c46a' },
  { id: 'teacup', label: 'Teacup', w: 94, h: 74, kinds: ['shelf', 'table', 'nook', 'high', 'behind'], tint: '#eef3fb' },
  { id: 'sock', label: 'Stripy sock', w: 100, h: 92, kinds: ['floor', 'under', 'nook', 'hook', 'behind', 'shelf'], tint: '#ff9bb8' },
  { id: 'key', label: 'Brass key', w: 96, h: 46, kinds: NOT_HOOK.concat('hook'), tint: '#e8b64a' },
  { id: 'mitten', label: 'Woolly mitten', w: 92, h: 100, kinds: ['floor', 'under', 'nook', 'hook', 'shelf', 'behind'], tint: '#7fd0a8' },
  { id: 'pocketwatch', label: 'Pocket watch', w: 72, h: 94, kinds: ['shelf', 'table', 'hook', 'nook', 'high'], tint: '#f2cf6a' },
  { id: 'marble', label: 'Glass marble', w: 58, h: 58, kinds: ['shelf', 'table', 'floor', 'under', 'nook'], tint: '#7fc4ff' },
  { id: 'musicbox', label: 'Music box', w: 104, h: 84, kinds: ['shelf', 'table', 'floor', 'nook', 'high'], tint: '#b78bdd' },
  { id: 'ribbon', label: 'Red ribbon', w: 108, h: 70, kinds: ALL, tint: '#ef5f78' },
  { id: 'candle', label: 'Candle stub', w: 62, h: 96, kinds: ['shelf', 'table', 'nook', 'high', 'floor'], tint: '#fff2cf' },
  { id: 'thimble', label: 'Thimble', w: 56, h: 62, kinds: ['shelf', 'table', 'nook', 'under', 'high'], tint: '#c9ccd6' },
  { id: 'button', label: 'Big blue button', w: 58, h: 58, kinds: ['shelf', 'table', 'floor', 'under', 'nook'], tint: '#5b9cf0' },
  { id: 'slipper', label: 'Fluffy slipper', w: 116, h: 70, kinds: ['floor', 'under', 'nook', 'behind', 'shelf'], tint: '#ffb0d0' },
  { id: 'quill', label: 'Feather quill', w: 72, h: 118, kinds: ['shelf', 'table', 'nook', 'floor', 'high'], tint: '#f6f0dd' },
  { id: 'locket', label: 'Silver locket', w: 70, h: 96, kinds: ['shelf', 'table', 'hook', 'nook', 'high'], tint: '#d7dee8' },
  { id: 'yarn', label: 'Ball of yarn', w: 90, h: 88, kinds: ['shelf', 'floor', 'under', 'nook', 'behind'], tint: '#9fd36a' },
  { id: 'bell', label: 'Little bell', w: 76, h: 86, kinds: ['shelf', 'table', 'hook', 'nook', 'high'], tint: '#f0c050' },
  { id: 'spoon', label: 'Wooden spoon', w: 60, h: 116, kinds: ['shelf', 'table', 'nook', 'hook', 'floor'], tint: '#d5a86a' },
  { id: 'toyboat', label: 'Toy boat', w: 112, h: 92, kinds: ['shelf', 'table', 'floor', 'nook', 'high'], tint: '#6fb8e8' },
  { id: 'kite', label: 'Paper kite', w: 104, h: 112, kinds: ['hook', 'behind', 'nook', 'high', 'floor'], tint: '#ffcf5f' },
  { id: 'acorn', label: 'Acorn', w: 60, h: 72, kinds: ['shelf', 'table', 'floor', 'under', 'nook'], tint: '#b07a3e' },
  { id: 'pinwheel', label: 'Pinwheel', w: 86, h: 114, kinds: ['shelf', 'nook', 'floor', 'hook', 'high'], tint: '#7ee0d2' },
  { id: 'snowglobe', label: 'Snow globe', w: 84, h: 96, kinds: ['shelf', 'table', 'nook', 'high'], tint: '#bfe4ff' },
  { id: 'domino', label: 'Domino', w: 54, h: 84, kinds: ['shelf', 'table', 'floor', 'under', 'nook'], tint: '#f3efe6' },
  { id: 'jamjar', label: 'Jar of jam', w: 80, h: 96, kinds: ['shelf', 'table', 'nook', 'high', 'floor'], tint: '#e05a7a' },
  { id: 'comb', label: 'Tortoise comb', w: 96, h: 54, kinds: ['shelf', 'table', 'under', 'nook', 'floor'], tint: '#9a6a3a' },
  { id: 'duck', label: 'Rubber duck', w: 96, h: 86, kinds: ['shelf', 'table', 'floor', 'nook', 'behind', 'high'], tint: '#ffd23f' },
  { id: 'paintbrush', label: 'Paintbrush', w: 66, h: 114, kinds: ['shelf', 'table', 'nook', 'floor', 'hook'], tint: '#d8863f' },
  { id: 'whistle', label: 'Tin whistle', w: 108, h: 48, kinds: ['shelf', 'table', 'under', 'nook', 'hook'], tint: '#cfd6de' },
  { id: 'compass', label: 'Compass', w: 82, h: 82, kinds: ['shelf', 'table', 'nook', 'high'], tint: '#e3c27a' },
  { id: 'hairbow', label: 'Polka hair bow', w: 104, h: 68, kinds: ALL, tint: '#ff7fb0' },
  { id: 'umbrella', label: 'Tiny umbrella', w: 82, h: 120, kinds: ['hook', 'nook', 'floor', 'behind', 'shelf'], tint: '#6f8fe0' },
  { id: 'cookie', label: 'Star cookie', w: 76, h: 74, kinds: ['shelf', 'table', 'floor', 'under', 'nook', 'high'], tint: '#e8b870' },
  { id: 'feather', label: 'Blue feather', w: 66, h: 110, kinds: ALL, tint: '#79b6ef' },
  { id: 'mouse', label: 'Manor mouse', w: 86, h: 62, kinds: ['floor', 'under', 'nook', 'behind', 'shelf'], tint: '#b9b2c4', secret: true },
];

export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

// Everything a room can ask for, minus the secret mouse.
export const FINDABLE = ITEMS.filter((it) => !it.secret);

export function itemsForKind(kind) {
  return FINDABLE.filter((it) => it.kinds.includes(kind));
}

// "a teddy bear" style text for the ghost speech bubbles.
export function lowerLabel(id) {
  const label = ITEM[id]?.label || id;
  return label[0].toLowerCase() + label.slice(1);
}
