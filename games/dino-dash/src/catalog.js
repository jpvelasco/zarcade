// Everything the shop sells. Pure data: the renderer reads the colours, the
// save code reads ids and prices.

export const DINOS = [
  { id: 'pip', name: 'Pip', kind: 'T-rex', price: 0, shape: 'rex', body: '#5fcf5a', dark: '#2f8f3e', belly: '#e9f7a8', spot: '#3fae49', blurb: 'Small arms, big heart.' },
  { id: 'trix', name: 'Trix', kind: 'Triceratops', price: 250, shape: 'tri', body: '#ff9a3c', dark: '#c4601c', belly: '#ffe1a8', spot: '#ffd166', blurb: 'Three horns, zero grumps.' },
  { id: 'steggy', name: 'Steggy', kind: 'Stegosaurus', price: 600, shape: 'steg', body: '#a77bff', dark: '#6a45c9', belly: '#eadcff', spot: '#ff8fc8', blurb: 'Fancy plates, fancy feet.' },
  { id: 'bronto', name: 'Bronto', kind: 'Brontosaurus', price: 1000, shape: 'bronto', body: '#4fb8ff', dark: '#2878c0', belly: '#d6f1ff', spot: '#9be3ff', blurb: 'Can see over every log.' },
  { id: 'zippy', name: 'Zippy', kind: 'Raptor', price: 1500, shape: 'raptor', body: '#ff5a6e', dark: '#b82c46', belly: '#ffd6dc', spot: '#ffe066', blurb: 'Fluffy feathers, quick feet.' },
  { id: 'bonk', name: 'Bonk', kind: 'Ankylosaurus', price: 2200, shape: 'anky', body: '#c9a15a', dark: '#87642c', belly: '#f6e7c3', spot: '#7c5a2c', blurb: 'Armoured and very huggable.' },
  { id: 'sunny', name: 'Sunny', kind: 'Golden T-rex', price: 4000, shape: 'rex', body: '#ffd23f', dark: '#d99a10', belly: '#fff6c2', spot: '#fff1a1', blurb: 'Shines like amber.', sparkle: true },
];

export const HATS = [
  { id: 'none', name: 'No hat', price: 0 },
  { id: 'leaf', name: 'Leaf sprout', price: 0 },
  { id: 'party', name: 'Party hat', price: 120 },
  { id: 'flower', name: 'Daisy', price: 180 },
  { id: 'cap', name: 'Ball cap', price: 260 },
  { id: 'egg', name: 'Eggshell', price: 340 },
  { id: 'cowboy', name: 'Cowboy hat', price: 450 },
  { id: 'pirate', name: 'Pirate hat', price: 600 },
  { id: 'propeller', name: 'Propeller cap', price: 800 },
  { id: 'tophat', name: 'Top hat', price: 1000 },
  { id: 'crown', name: 'Crown', price: 1400 },
];

// Boost upgrades: five levels each.
export const BOOSTS = [
  { id: 'magnet', name: 'Magnet', blurb: 'Pulls amber from every lane.', prices: [200, 400, 700, 1100, 1600], seconds: (lv) => 8 + 2 * lv },
  { id: 'glide', name: 'Glide leaf', blurb: 'Float over everything.', prices: [200, 400, 700, 1100, 1600], seconds: (lv) => 6 + lv },
  { id: 'shield', name: 'Egg shield', blurb: 'Saves you from one bump.', prices: [150, 300, 550, 900, 1300], seconds: (lv) => 30 + 6 * lv },
];
export const BOOST_MAX = 5;

export const dinoById = (id) => DINOS.find((d) => d.id === id) || DINOS[0];
export const hatById = (id) => HATS.find((h) => h.id === id) || HATS[0];
export const boostById = (id) => BOOSTS.find((b) => b.id === id);
