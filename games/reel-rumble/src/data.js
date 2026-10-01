// Waters, times, weather and every fish species. Pure data plus a few
// lookups; no DOM.
import { smoothstep } from './rng.js';

export const PERIODS = ['dawn', 'day', 'dusk', 'night'];
export const PERIOD_INFO = {
  dawn: { name: 'Dawn', icon: '🌅', start: 5 },
  day: { name: 'Day', icon: '☀️', start: 8 },
  dusk: { name: 'Dusk', icon: '🌇', start: 17 },
  night: { name: 'Night', icon: '🌙', start: 20 },
};
export const WEATHER_INFO = {
  clear: { name: 'Clear', icon: '☀️' },
  cloudy: { name: 'Cloudy', icon: '☁️' },
  rain: { name: 'Rain', icon: '🌧️' },
  fog: { name: 'Fog', icon: '🌫️' },
  snow: { name: 'Snow', icon: '❄️' },
  meteor: { name: 'Meteor shower', icon: '☄️' },
};

// Depth bands, in metres below the surface.
export const BANDS = ['shallow', 'mid', 'deep'];
export function bandAt(depth) {
  return depth < 3 ? 'shallow' : depth < 8 ? 'mid' : 'deep';
}

// `shelf` is how far out (m) the bottom reaches `maxDepth`. `boat` is the
// boat needed to get there; `ice` waters drop the lure through a hole.
export const WATERS = [
  {
    id: 'pond', name: 'Willow Pond', blurb: 'Lily pads, fireflies and a very old catfish.',
    minDepth: 1, maxDepth: 12, shelf: 44, boat: null, weathers: { clear: 4, cloudy: 3, rain: 2, fog: 2 },
    periods: PERIODS, accent: '#7ad86a', drift: 0,
  },
  {
    id: 'river', name: 'Rushing River', blurb: 'Fast water, jumping trout and the River King.',
    minDepth: 0.8, maxDepth: 10, shelf: 40, boat: 'canoe', weathers: { clear: 4, cloudy: 3, rain: 3 },
    periods: PERIODS, accent: '#5ab8ff', drift: 0.35,
  },
  {
    id: 'coral', name: 'Coral Bay', blurb: 'Warm turquoise reef full of rainbow fish.',
    minDepth: 1.2, maxDepth: 20, shelf: 50, boat: 'sailboat', weathers: { clear: 5, cloudy: 3, rain: 2 },
    periods: PERIODS, accent: '#2ee6d0', drift: 0,
  },
  {
    id: 'frozen', name: 'Frozen Lake', blurb: 'Ice fishing under the northern lights.',
    minDepth: 18, maxDepth: 18, shelf: 1, boat: 'snowrunner', weathers: { clear: 4, snow: 4, fog: 2 },
    periods: PERIODS, accent: '#bfe8ff', drift: 0, ice: true, holeX: 13,
  },
  {
    id: 'lagoon', name: 'Starfall Lagoon', blurb: 'A secret lagoon that only appears at night.',
    minDepth: 1, maxDepth: 16, shelf: 46, boat: 'starferry', weathers: { clear: 4, fog: 2, meteor: 3 },
    periods: ['night'], accent: '#c58aff', drift: 0, nightOnly: true,
  },
];
export const WATER = Object.fromEntries(WATERS.map((w) => [w.id, w]));

// Bottom depth (m) at distance x (m) from the shore, with gentle bumps.
export function depthAt(water, x) {
  const w = typeof water === 'string' ? WATER[water] : water;
  if (w.ice) return w.maxDepth - 1.2 * Math.sin(x * 0.21) * (x > 4 ? 1 : 0);
  const base = w.minDepth + (w.maxDepth - w.minDepth) * smoothstep(0, w.shelf, x);
  const bump = 0.35 * Math.sin(x * 0.55) + 0.25 * Math.sin(x * 1.37 + 1.1);
  return Math.max(0.6, base + bump * Math.min(1, x / 6));
}

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary'];
export const RARITY_INFO = {
  common: { name: 'Common', weight: 10, color: '#9fe0a0' },
  uncommon: { name: 'Uncommon', weight: 5, color: '#7ac8ff' },
  rare: { name: 'Rare', weight: 2, color: '#d59aff' },
  legendary: { name: 'Legendary', weight: 1, color: '#ffd84f' },
};

// Fight personalities. `nibbles` is how many test nibbles come before the
// real bite, `window` scales the time you have to set the hook.
export const BEHAVIORS = {
  steady: { name: 'Steady', weights: { run: 3, dart: 2, rest: 3, jump: 0.6 }, run: [1.2, 2.4], dart: [0.8, 1.5], rest: [1.2, 2.2], nibbles: [1, 3], window: 1.0, restPull: 0.3 },
  darter: { name: 'Darter', weights: { run: 2, dart: 5, rest: 2, jump: 0.8 }, run: [0.8, 1.5], dart: [0.5, 1.0], rest: [0.8, 1.5], nibbles: [2, 4], window: 0.85, restPull: 0.3 },
  jumper: { name: 'Jumper', weights: { run: 3, dart: 2, rest: 2, jump: 3 }, run: [1.0, 2.0], dart: [0.6, 1.2], rest: [1.0, 1.8], nibbles: [1, 2], window: 0.95, restPull: 0.3 },
  runner: { name: 'Runner', weights: { run: 5, dart: 1, rest: 2, jump: 0.6 }, run: [1.8, 3.2], dart: [0.6, 1.2], rest: [1.0, 1.8], nibbles: [0, 2], window: 1.0, restPull: 0.3 },
  sulker: { name: 'Heavy', weights: { run: 2, dart: 1, rest: 5, jump: 0 }, run: [1.2, 2.2], dart: [0.6, 1.2], rest: [1.6, 2.8], nibbles: [2, 4], window: 1.15, restPull: 0.5 },
  legend: { name: 'Legendary', weights: { run: 3, dart: 2, rest: 2.5, jump: 1.2, special: 2.2 }, run: [1.4, 2.6], dart: [0.7, 1.3], rest: [1.3, 2.2], nibbles: [2, 3], window: 1.0, restPull: 0.35 },
};

// Each legendary has a special move in its fight.
export const SPECIALS = {
  mud: { name: 'Mud dive', tip: 'Old Whiskers digs into the mud. Keep a steady reel!' },
  rapids: { name: 'Rapids run', tip: 'The River King rides the rapids. Steer against him!' },
  tailwalk: { name: 'Tail walk', tip: 'Jump after jump! Ease off while it is in the air.' },
  frost: { name: 'Frost bite', tip: 'Your line is freezing: the safe zone shrinks!' },
  starburst: { name: 'Starburst', tip: 'Starry zigzags! Follow the arrows and keep it steady.' },
};

// look: shape, colours and pattern for the procedural sprite.
const F = (id, name, water, rarity, cm, kg, behavior, power, stamina, speed, bands, periods, weathers, baits, value, look, fact, extra = {}) => ({
  id, name, water, rarity, cm, kg, behavior, power, stamina, speed, bands, periods, weathers, baits, value, look, fact, ...extra,
});

export const FISH = [
  // ---------------------------------------------------------------- Willow Pond
  F('bluegill', 'Bluegill', 'pond', 'common', [12, 25], [0.1, 0.6], 'darter', 1.6, 5, 1.8, ['shallow', 'mid'], null, null, ['worm', 'cricket'], 4,
    { shape: 'round', body: '#5d8fb0', belly: '#f2c46b', fin: '#3b5d7a', pattern: 'bands', accent: '#2a3f6b' },
    'Bluegills have a dark "ear" flap on each cheek, and a blue shine on their gills.'),
  F('pumpkinseed', 'Pumpkinseed', 'pond', 'common', [10, 22], [0.1, 0.5], 'darter', 1.5, 5, 1.8, ['shallow'], ['day', 'dusk'], ['clear', 'cloudy'], ['cricket', 'worm'], 5,
    { shape: 'round', body: '#d9a441', belly: '#ffb347', fin: '#9a7a3a', pattern: 'spots', accent: '#3cb4b0' },
    'Pumpkinseeds crunch snails with special teeth hidden in their throats.'),
  F('perch', 'Yellow Perch', 'pond', 'common', [15, 30], [0.2, 0.8], 'steady', 2, 6, 2, ['mid'], ['dawn', 'day'], null, ['worm', 'minnow'], 6,
    { shape: 'perch', body: '#d8c24a', belly: '#f4eab0', fin: '#e8792d', pattern: 'bands', accent: '#4c5a24' },
    'Perch swim together in schools and love to hunt at sunrise.'),
  F('shiner', 'Golden Shiner', 'pond', 'common', [8, 20], [0.05, 0.3], 'darter', 1.2, 4, 2.2, ['shallow'], null, null, ['dough', 'worm'], 4,
    { shape: 'long', body: '#e9c86a', belly: '#fff4c8', fin: '#e69a3a', pattern: 'plain', accent: '#c08a2a' },
    'Shiners sparkle like gold coins when the sun hits their scales.'),
  F('crappie', 'Black Crappie', 'pond', 'uncommon', [18, 35], [0.3, 1.2], 'steady', 2.6, 7, 2, ['mid'], ['dusk', 'night'], null, ['minnow', 'spinner'], 12,
    { shape: 'round', body: '#b8c3b0', belly: '#eef2e6', fin: '#56604f', pattern: 'spots', accent: '#2d332b' },
    'Crappies have big eyes for spotting snacks in the dark.'),
  F('bass', 'Largemouth Bass', 'pond', 'uncommon', [25, 55], [0.6, 4], 'jumper', 4, 9, 2.6, ['shallow', 'mid'], ['dawn', 'dusk'], null, ['minnow', 'spinner', 'cricket'], 16,
    { shape: 'perch', body: '#6d9a4e', belly: '#e3e8b4', fin: '#4b6b34', pattern: 'stripe', accent: '#2f4422' },
    'A bass can open its mouth wide enough to gulp down a frog!'),
  F('carp', 'Common Carp', 'pond', 'uncommon', [35, 75], [2, 9], 'sulker', 5, 11, 1.6, ['mid', 'deep'], ['day'], ['clear', 'cloudy', 'rain'], ['dough'], 18,
    { shape: 'carp', body: '#b38a43', belly: '#e6cf8f', fin: '#8a5a2b', pattern: 'scales', accent: '#6b4a22' },
    'Carp have whiskers called barbels that help them taste the mud.'),
  F('catfish', 'Channel Catfish', 'pond', 'rare', [40, 90], [2, 10], 'sulker', 6, 13, 2, ['deep'], ['dusk', 'night'], null, ['worm', 'dough'], 35,
    { shape: 'cat', body: '#7b8a96', belly: '#e9eef0', fin: '#566270', pattern: 'spots', accent: '#3a434c' },
    'Catfish have taste buds all over their bodies. They are swimming tongues!'),
  F('koi', 'Koi', 'pond', 'rare', [40, 80], [2, 8], 'steady', 4.5, 10, 2, ['shallow', 'mid'], ['day'], ['clear'], ['dough'], 45,
    { shape: 'carp', body: '#fff2e8', belly: '#ffffff', fin: '#ffd0b0', pattern: 'koi', accent: '#ff6a2a' },
    'Some koi live more than 100 years. Someone let this one go a long time ago.'),
  F('whiskers', 'Old Whiskers', 'pond', 'legendary', [130, 180], [30, 60], 'legend', 20, 16, 2.6, ['deep'], ['night'], ['rain'], ['starlight'], 300,
    { shape: 'cat', body: '#5a6a44', belly: '#d9d6a8', fin: '#3a452c', pattern: 'moss', accent: '#a8e88c' },
    'Old Whiskers has lived in Willow Pond longer than the willows. Gill says he once ate an oar.',
    { special: 'mud', stages: 3 }),

  // ---------------------------------------------------------------- Rushing River
  F('chub', 'Creek Chub', 'river', 'common', [10, 25], [0.1, 0.5], 'darter', 1.8, 5, 2.2, ['shallow'], null, null, ['worm', 'cricket'], 5,
    { shape: 'long', body: '#a9a48f', belly: '#f0ecd9', fin: '#c47a52', pattern: 'stripe', accent: '#4a463a' },
    'In spring, boy creek chubs grow little bumps on their heads to look tough.'),
  F('rainbow', 'Rainbow Trout', 'river', 'common', [20, 50], [0.3, 3], 'jumper', 3, 7, 3, ['shallow', 'mid'], ['dawn', 'day'], null, ['cricket', 'spinner'], 9,
    { shape: 'trout', body: '#8fa98a', belly: '#f3eedd', fin: '#7c8c6b', pattern: 'rainbow', accent: '#ff6f91' },
    'Rainbow trout wear a pink stripe that shines like a rainbow.'),
  F('smallmouth', 'Smallmouth Bass', 'river', 'common', [20, 45], [0.4, 2.5], 'jumper', 3.4, 8, 2.8, ['mid'], ['day', 'dusk'], ['clear', 'cloudy'], ['minnow', 'spinner'], 10,
    { shape: 'perch', body: '#9a7b4a', belly: '#e9d9b0', fin: '#7a5a32', pattern: 'bands', accent: '#5a3f22' },
    'Smallmouths are famous acrobats. Get ready for jumps!'),
  F('grayling', 'Grayling', 'river', 'uncommon', [25, 45], [0.3, 1.5], 'darter', 3, 7, 3, ['shallow'], ['day'], ['clear'], ['cricket'], 14,
    { shape: 'sail', body: '#8a93a8', belly: '#e5e8f0', fin: '#b06aa8', pattern: 'spots', accent: '#5a4f8a' },
    'Graylings raise a giant sail-shaped fin to show off.'),
  F('brown', 'Brown Trout', 'river', 'uncommon', [30, 70], [0.6, 5], 'runner', 5, 9, 3.4, ['mid', 'deep'], ['dusk', 'night'], ['cloudy', 'rain'], ['minnow', 'spinner'], 18,
    { shape: 'trout', body: '#b8873f', belly: '#f2dfa6', fin: '#8f6430', pattern: 'redspots', accent: '#c8382c' },
    'Brown trout get braver when clouds hide the sun.'),
  F('walleye', 'Walleye', 'river', 'uncommon', [30, 70], [0.6, 5], 'steady', 4.6, 9, 2.6, ['deep'], ['dusk', 'night'], null, ['minnow', 'worm'], 18,
    { shape: 'perch', body: '#b8a659', belly: '#f3eecf', fin: '#6f6a3a', pattern: 'blotch', accent: '#4f4a2a', eye: 'glow' },
    'Walleye eyes shine in the dark like a cat\'s, so they hunt at night.'),
  F('pike', 'Northern Pike', 'river', 'rare', [50, 110], [2, 12], 'runner', 7, 12, 4.2, ['mid'], ['dawn', 'day'], null, ['spinner', 'minnow'], 40,
    { shape: 'pike', body: '#5e7a3e', belly: '#eef0c8', fin: '#9a7a3a', pattern: 'paleSpots', accent: '#d9e6a0' },
    'Pike are sneaky ambush hunters with hundreds of needle-sharp teeth.'),
  F('sockeye', 'Sockeye Salmon', 'river', 'rare', [45, 80], [2, 6], 'jumper', 6, 11, 4, ['mid', 'deep'], ['dawn', 'day'], ['rain', 'cloudy'], ['spinner'], 45,
    { shape: 'trout', body: '#d6453a', belly: '#f2b3a2', fin: '#3f6b3a', pattern: 'greenhead', accent: '#3f6b3a' },
    'Sockeye turn bright red when they swim upriver to the place they were born.'),
  F('sturgeon', 'Lake Sturgeon', 'river', 'rare', [80, 150], [8, 30], 'sulker', 8, 14, 2, ['deep'], ['night'], null, ['worm'], 55,
    { shape: 'sturgeon', body: '#6b6f73', belly: '#c9cbc4', fin: '#4b4f53', pattern: 'scutes', accent: '#a8adb0' },
    'Sturgeon were swimming around when dinosaurs were alive!'),
  F('riverking', 'The River King', 'river', 'legendary', [110, 160], [25, 45], 'legend', 21, 16, 4.2, ['deep'], ['dawn'], ['rain'], ['starlight'], 320,
    { shape: 'trout', body: '#9fb8c9', belly: '#f2f6fa', fin: '#5a7a95', pattern: 'crown', accent: '#ffd84f' },
    'The River King leaps the falls every rainy dawn. His scales flash like silver crowns.',
    { special: 'rapids', stages: 3 }),

  // ---------------------------------------------------------------- Coral Bay
  F('clownfish', 'Clownfish', 'coral', 'common', [7, 11], [0.05, 0.2], 'darter', 1.2, 4, 1.6, ['shallow'], ['dawn', 'day'], null, ['shrimp'], 6,
    { shape: 'perch', body: '#ff7a1a', belly: '#ff9d4a', fin: '#ff7a1a', pattern: 'clown', accent: '#ffffff' },
    'Clownfish live inside stinging anemones. Their slimy coat keeps them safe.'),
  F('sergeant', 'Sergeant Major', 'coral', 'common', [10, 20], [0.1, 0.4], 'darter', 1.6, 5, 2, ['shallow'], ['dawn', 'day', 'dusk'], null, ['shrimp', 'squid'], 5,
    { shape: 'round', body: '#e8e27a', belly: '#f5f5e0', fin: '#a3a35a', pattern: 'bars', accent: '#20242a' },
    'Their stripes look like a soldier\'s badge. That is how they got their name!'),
  F('tang', 'Blue Tang', 'coral', 'common', [15, 30], [0.2, 0.6], 'steady', 2, 6, 2.2, ['shallow', 'mid'], ['dawn', 'day'], ['clear', 'cloudy'], ['shrimp'], 8,
    { shape: 'round', body: '#2d6cdf', belly: '#4a8cf0', fin: '#ffd400', pattern: 'tang', accent: '#0d1f4a' },
    'Blue tangs hide a tiny sharp spine near their tail, like a secret pocketknife.'),
  F('parrotfish', 'Parrotfish', 'coral', 'uncommon', [30, 60], [1, 4], 'steady', 3.6, 8, 2.4, ['mid'], ['day'], null, ['squid', 'shrimp'], 15,
    { shape: 'carp', body: '#3fd1a8', belly: '#a9f2d8', fin: '#ff6fb0', pattern: 'scales', accent: '#ff6fb0' },
    'Parrotfish munch coral and poop out sand. Lots of white beaches are parrotfish poop!'),
  F('puffer', 'Pufferfish', 'coral', 'uncommon', [15, 35], [0.3, 1.5], 'sulker', 2.8, 8, 1.4, ['shallow', 'mid'], ['dusk', 'night'], null, ['shrimp'], 16,
    { shape: 'puffer', body: '#d8c690', belly: '#fff8e0', fin: '#c8a860', pattern: 'spots', accent: '#5a4a2a' },
    'When it gets scared, a pufferfish gulps water and blows up like a spiky ball.'),
  F('snapper', 'Red Snapper', 'coral', 'uncommon', [35, 80], [1, 8], 'steady', 5, 10, 2.8, ['deep'], null, null, ['squid'], 20,
    { shape: 'perch', body: '#e8504a', belly: '#ffc0b0', fin: '#d03a3a', pattern: 'plain', accent: '#ff8a7a' },
    'Red snappers can live more than 50 years on deep reefs.'),
  F('barracuda', 'Barracuda', 'coral', 'rare', [60, 140], [3, 15], 'darter', 8, 11, 4.6, ['mid'], ['dusk', 'day'], ['clear', 'cloudy'], ['spinner', 'feather'], 40,
    { shape: 'pike', body: '#b8c4cc', belly: '#f2f4f6', fin: '#6a7880', pattern: 'bars', accent: '#3a4248' },
    'Barracudas zoom at 40 km/h toward shiny things. That is why they love spinners!'),
  F('mahi', 'Mahi-Mahi', 'coral', 'rare', [60, 140], [4, 20], 'jumper', 9, 12, 4.4, ['shallow', 'mid'], ['day'], ['clear'], ['feather'], 50,
    { shape: 'mahi', body: '#2fc06a', belly: '#ffe03a', fin: '#2a7ad8', pattern: 'spots', accent: '#2a7ad8' },
    'Mahi-mahi flash gold, green and blue. Their name means "very strong" in Hawaiian.'),
  F('moray', 'Green Moray', 'coral', 'rare', [80, 180], [5, 25], 'sulker', 9, 13, 2.4, ['deep'], ['night', 'dusk'], null, ['squid'], 50,
    { shape: 'eel', body: '#4f8f3a', belly: '#7fb85a', fin: '#3a6a2a', pattern: 'plain', accent: '#d9f27a' },
    'Morays open and close their mouths to breathe, not to look scary. Honest!'),
  F('marlin', 'Sunburst Marlin', 'coral', 'legendary', [250, 400], [100, 200], 'legend', 22, 16, 4.8, ['deep'], ['dusk'], ['clear'], ['starlight'], 360,
    { shape: 'marlin', body: '#2a4fa8', belly: '#d9e8ff', fin: '#ff8a2a', pattern: 'bars', accent: '#9ab8ff' },
    'The Sunburst Marlin rises only when sunset paints the bay orange. It can walk on its tail!',
    { special: 'tailwalk', stages: 3 }),

  // ---------------------------------------------------------------- Frozen Lake
  F('smelt', 'Rainbow Smelt', 'frozen', 'common', [12, 22], [0.03, 0.15], 'darter', 1.4, 4, 2.4, ['shallow', 'mid'], null, null, ['waxworm', 'icejig'], 6,
    { shape: 'long', body: '#b8d8e8', belly: '#ffffff', fin: '#8ab0c8', pattern: 'stripe', accent: '#c89ae8' },
    'A fresh smelt smells a little bit like cucumbers!'),
  F('whitefish', 'Lake Whitefish', 'frozen', 'common', [30, 55], [0.6, 2.5], 'steady', 3, 7, 2.2, ['mid', 'deep'], ['dawn', 'day'], null, ['waxworm'], 9,
    { shape: 'trout', body: '#d8dee6', belly: '#ffffff', fin: '#a8b4c4', pattern: 'scales', accent: '#7a8a9a' },
    'Whitefish slurp tiny bugs off the lake bottom with a mouth like a vacuum.'),
  F('cisco', 'Cisco', 'frozen', 'common', [20, 40], [0.2, 1], 'darter', 2.2, 6, 2.4, ['mid'], ['dusk', 'night'], null, ['waxworm', 'icejig'], 8,
    { shape: 'long', body: '#a8c0d8', belly: '#f0f6fa', fin: '#6a8aa8', pattern: 'plain', accent: '#3a5a7a' },
    'Ciscoes travel in big silver clouds under the ice.'),
  F('sculpin', 'Snowy Sculpin', 'frozen', 'common', [8, 16], [0.03, 0.2], 'sulker', 1.2, 4, 1.2, ['deep'], null, ['snow', 'fog'], ['waxworm'], 7,
    { shape: 'sculpin', body: '#e8eef4', belly: '#ffffff', fin: '#9ab8d0', pattern: 'spots', accent: '#6a8aa8' },
    'Snowy sculpins sit on the bottom and look just like pebbles dusted with snow.'),
  F('sauger', 'Sauger', 'frozen', 'uncommon', [30, 50], [0.5, 2], 'steady', 4, 8, 2.4, ['deep'], ['dusk', 'night'], ['fog', 'snow'], ['minnow', 'icejig'], 16,
    { shape: 'perch', body: '#a89a6a', belly: '#eee6c8', fin: '#5a5034', pattern: 'blotch', accent: '#3a3420', eye: 'glow' },
    'Saugers have shiny eyes that see great in dim, murky water.'),
  F('char', 'Arctic Char', 'frozen', 'uncommon', [35, 70], [1, 5], 'runner', 5, 9, 3.2, ['mid'], ['day', 'dawn'], null, ['icejig', 'minnow'], 20,
    { shape: 'trout', body: '#5a7f9a', belly: '#ff7a4a', fin: '#ff8a5a', pattern: 'paleSpots', accent: '#ffe0d0' },
    'Arctic char live farther north than any other freshwater fish.'),
  F('laketrout', 'Lake Trout', 'frozen', 'rare', [50, 100], [3, 15], 'runner', 8, 12, 3.6, ['deep'], ['dawn', 'day'], null, ['icejig', 'minnow'], 40,
    { shape: 'trout', body: '#5d6a5a', belly: '#e8e8d0', fin: '#c87a4a', pattern: 'paleSpots', accent: '#e8e8c0' },
    'Lake trout can live for 50 years in cold, deep water.'),
  F('burbot', 'Burbot', 'frozen', 'rare', [40, 90], [1, 8], 'sulker', 7, 13, 2, ['deep'], ['night'], null, ['waxworm', 'minnow'], 40,
    { shape: 'cat', body: '#6a5a3a', belly: '#c8b890', fin: '#4a3e28', pattern: 'blotch', accent: '#2a2418' },
    'Burbot are the only freshwater cod, and they lay eggs under the ice in midwinter!'),
  F('muskie', 'Muskellunge', 'frozen', 'rare', [80, 140], [6, 25], 'runner', 10, 13, 4.4, ['mid'], ['dusk', 'day'], ['clear', 'fog'], ['minnow'], 55,
    { shape: 'pike', body: '#8a9a6a', belly: '#eef0d8', fin: '#a07a4a', pattern: 'bars', accent: '#4a5432' },
    'Anglers call the muskie "the fish of ten thousand casts" because it is so hard to catch.'),
  F('frostfin', 'Frostfin the Ancient', 'frozen', 'legendary', [150, 220], [40, 80], 'legend', 21, 16, 3.8, ['deep'], ['night'], ['snow'], ['starlight'], 340,
    { shape: 'trout', body: '#bfe8ff', belly: '#ffffff', fin: '#7ad8ff', pattern: 'crystal', accent: '#e8fbff' },
    'Frostfin\'s fins are as clear as ice. They say it hums when snow falls at night.',
    { special: 'frost', stages: 3 }),

  // ---------------------------------------------------------------- Starfall Lagoon
  F('glowfin', 'Glowfin Minnow', 'lagoon', 'common', [5, 10], [0.02, 0.1], 'darter', 1.2, 4, 2.4, ['shallow'], null, null, ['glowbead'], 8,
    { shape: 'long', body: '#4ad8ff', belly: '#c8f6ff', fin: '#8af0ff', pattern: 'glow', accent: '#e8ffff' },
    'Glowfins blink to talk to each other. Two blinks means "hello"!'),
  F('lantern', 'Lantern Guppy', 'lagoon', 'common', [4, 8], [0.02, 0.08], 'darter', 1, 4, 2, ['shallow', 'mid'], null, ['clear', 'fog'], ['glowbead', 'shrimp'], 8,
    { shape: 'guppy', body: '#ffb84a', belly: '#fff0c0', fin: '#ff6aa8', pattern: 'glow', accent: '#fff6a8' },
    'Lantern guppies carry a tiny light on their chin to find their way home.'),
  F('moongoby', 'Moonjelly Goby', 'lagoon', 'common', [6, 12], [0.03, 0.15], 'sulker', 1.4, 5, 1.4, ['mid', 'deep'], null, null, ['shrimp'], 9,
    { shape: 'sculpin', body: '#c8b8ff', belly: '#f4f0ff', fin: '#a090f0', pattern: 'spots', accent: '#ffffff' },
    'These gobies make friends with moon jellies and hide between their tentacles.'),
  F('flounder', 'Starry Flounder', 'lagoon', 'uncommon', [30, 60], [1, 4], 'sulker', 4, 9, 1.6, ['deep'], null, ['clear', 'meteor'], ['shrimp', 'starjig'], 20,
    { shape: 'flat', body: '#6a5a4a', belly: '#e8e0d0', fin: '#f2a83a', pattern: 'stars', accent: '#fff6c8' },
    'Flounders start life swimming upright. Then one eye slides over so they can lie flat!'),
  F('comet', 'Comet Tetra', 'lagoon', 'uncommon', [6, 14], [0.05, 0.2], 'darter', 3, 7, 3.6, ['shallow', 'mid'], null, ['meteor'], ['glowbead', 'starjig'], 18,
    { shape: 'long', body: '#ff4fd8', belly: '#ffd0f4', fin: '#5ef2ff', pattern: 'glow', accent: '#ffffff' },
    'Comet tetras zip so fast they leave a glowing trail, just like a comet.'),
  F('betta', 'Nebula Betta', 'lagoon', 'uncommon', [8, 14], [0.05, 0.2], 'jumper', 3, 7, 2.4, ['shallow'], null, ['fog'], ['glowbead'], 18,
    { shape: 'betta', body: '#7a4aff', belly: '#c0a8ff', fin: '#ff6ad8', pattern: 'glow', accent: '#5ef2ff' },
    'A nebula betta\'s fins swirl like galaxies. It flares them to show off.'),
  F('angelfish', 'Twilight Angelfish', 'lagoon', 'rare', [20, 40], [0.5, 2], 'steady', 6, 11, 2.6, ['mid'], null, ['clear'], ['starjig'], 40,
    { shape: 'angel', body: '#2a2a6a', belly: '#6a6ad8', fin: '#ffd84f', pattern: 'bands', accent: '#ffd84f' },
    'Twilight angelfish wear stripes that match the sky just after sunset.'),
  F('auroraeel', 'Aurora Eel', 'lagoon', 'rare', [80, 160], [3, 12], 'darter', 10, 13, 3.4, ['deep'], null, ['meteor', 'fog'], ['starjig', 'shrimp'], 50,
    { shape: 'eel', body: '#3affc8', belly: '#a8ffe8', fin: '#a07aff', pattern: 'aurora', accent: '#ff6ad8' },
    'The aurora eel\'s colours ripple along its body like the northern lights.'),
  F('lunarray', 'Lunar Ray', 'lagoon', 'rare', [80, 150], [8, 30], 'runner', 11, 13, 3.6, ['deep'], null, ['clear'], ['starjig'], 55,
    { shape: 'ray', body: '#3a4a7a', belly: '#dfe8ff', fin: '#8aa8ff', pattern: 'stars', accent: '#ffffff' },
    'Lunar rays glide like they are flying. Their spots match real star maps!'),
  F('starkoi', 'The Starfall Koi', 'lagoon', 'legendary', [140, 200], [30, 60], 'legend', 22, 16, 4.2, ['deep'], null, ['meteor'], ['starlight'], 400,
    { shape: 'carp', body: '#fffaf0', belly: '#ffffff', fin: '#ffd84f', pattern: 'starkoi', accent: '#ffb84a' },
    'Gill says a falling star that lands in the lagoon becomes the Starfall Koi. Make a wish!',
    { special: 'starburst', stages: 3 }),
];
export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
export const fishOfWater = (waterId) => FISH.filter((f) => f.water === waterId);

// Length and weight for a size roll t in [0, 1].
export function sizeOf(fish, t) {
  const cm = fish.cm[0] + (fish.cm[1] - fish.cm[0]) * t;
  const kg = fish.kg[0] * Math.pow(fish.kg[1] / fish.kg[0], t);
  return { cm: Math.round(cm), kg: Math.round(kg * 100) / 100 };
}

export const appearsAt = (fish, period, weather) =>
  (!fish.periods || fish.periods.includes(period)) && (!fish.weathers || fish.weathers.includes(weather));
