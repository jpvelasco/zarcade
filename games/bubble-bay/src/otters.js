// The otter collection: every baby otter has a name and a look.
export const OTTER_NAMES = [
  'Pebble', 'Mochi', 'Kelp', 'Biscuit', 'Nori', 'Splash',
  'Waffles', 'Juniper', 'Pip', 'Clam', 'Marbles', 'Toffee',
  'Sunny', 'Bubbles', 'Drift', 'Coco', 'Puddle', 'Sprout',
  'Maple', 'Ripple', 'Noodle', 'Tide', 'Fig', 'Scout',
  'Button', 'Pearl', 'Wren', 'Sandy', 'Moss', 'Ziggy',
];
export const OTTER_COUNT = OTTER_NAMES.length;

// Five fur shades and six little accessories make 30 different otters;
// neighbours in the list always differ in both.
export const FURS = [
  { fur: '#8a5a3b', light: '#d9b48f', dark: '#5c3a24' },
  { fur: '#a8713f', light: '#f0cfa0', dark: '#6e4522' },
  { fur: '#6e4a36', light: '#c9a283', dark: '#432a1c' },
  { fur: '#b98a5e', light: '#f6e2c4', dark: '#7a5534' },
  { fur: '#7d5e4c', light: '#e3c8b0', dark: '#4e372b' },
];
export const ACCESSORIES = ['bow', 'sailor', 'flower', 'starfish', 'glasses', 'beanie'];

export function otterLook(id) {
  const a = id % ACCESSORIES.length;
  const b = Math.floor(id / ACCESSORIES.length);
  return { name: OTTER_NAMES[id], fur: FURS[(a + 2 * b) % FURS.length], accessory: ACCESSORIES[a] };
}
