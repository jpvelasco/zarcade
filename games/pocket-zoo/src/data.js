// Static game data: biomes, animals, habitats, decorations, ranks, tasks.
// DOM-free so Node tests can check it.

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary'];
export const RARITY = {
  common: { label: 'Common', base: 1, weight: 62, color: '#8fd16a' },
  uncommon: { label: 'Uncommon', base: 2, weight: 27, color: '#5bb8ff' },
  rare: { label: 'Rare', base: 4, weight: 9, color: '#c27bff' },
  legendary: { label: 'Legendary', base: 8, weight: 2, color: '#ffb52e' },
};

// Unlock order. tier multiplies animal income; egg is the egg base price.
export const BIOMES = [
  { id: 'meadow', name: 'Sunny Meadow', short: 'Meadow', tier: 1, unlock: 0, egg: 40,
    ground: '#9fdc7c', ground2: '#8fd06c', floor: '#b9e98f', accent: '#ffd35c', egg1: '#fff3c4', egg2: '#9fdc7c',
    habitats: ['Clover Patch', 'Buttercup Hill', 'Willow Pond'] },
  { id: 'savanna', name: 'Savanna', short: 'Savanna', tier: 3, unlock: 3200, egg: 320,
    ground: '#ecd28a', ground2: '#e2c477', floor: '#f3dd9c', accent: '#ff9a3d', egg1: '#ffe0a3', egg2: '#e59a4a',
    habitats: ['Acacia Plains', 'Watering Hole', 'Sunset Ridge'] },
  { id: 'jungle', name: 'Jungle', short: 'Jungle', tier: 9, unlock: 26000, egg: 2600,
    ground: '#5fae5a', ground2: '#52a050', floor: '#78c46b', accent: '#3ad17e', egg1: '#c8f59a', egg2: '#2f9a55',
    habitats: ['Banana Grove', 'Vine Hollow', 'Bamboo Corner'] },
  { id: 'ocean', name: 'Ocean Bay', short: 'Ocean', tier: 27, unlock: 200000, egg: 20000,
    ground: '#f2e2b2', ground2: '#ead6a0', floor: '#5cc8f0', accent: '#28b8ff', egg1: '#d4f4ff', egg2: '#3aa6e8',
    habitats: ['Coral Cove', 'Kelp Lagoon', 'Big Blue Pool'] },
  { id: 'arctic', name: 'Arctic', short: 'Arctic', tier: 81, unlock: 1600000, egg: 160000,
    ground: '#e8f4fb', ground2: '#d9ecf7', floor: '#f6fbff', accent: '#7fd8ff', egg1: '#ffffff', egg2: '#9ad6f0',
    habitats: ['Snowdrift', 'Ice Floe', 'Aurora Bay'] },
  { id: 'night', name: 'Night House', short: 'Night', tier: 240, unlock: 13000000, egg: 1300000,
    ground: '#3b3670', ground2: '#34306a', floor: '#4a4488', accent: '#b49bff', egg1: '#5a4fb0', egg2: '#ffe27a',
    habitats: ['Moonlit Nook', 'Starry Den', 'Glow Grotto'] },
];
export const BIOME_INDEX = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));

// Habitat levels: capacity, income multiplier.
export const HABITAT_LEVELS = [
  { cap: 2, mult: 1 },
  { cap: 3, mult: 1.3 },
  { cap: 3, mult: 1.7 },
  { cap: 3, mult: 2.2 },
  { cap: 3, mult: 3 },
];
export const MAX_LEVEL = HABITAT_LEVELS.length;
export const PLOTS_PER_BIOME = 3;
export const MAX_STARS = 5;

// Animal looks feed the painter in sprites.js. kind picks the body plan.
const A = (id, name, biome, rarity, look, fact) => ({ id, name, biome, rarity, look, fact });
export const ANIMALS = [
  // Sunny Meadow
  A('bunny', 'Bunny', 'meadow', 'common',
    { kind: 'mammal', body: '#f6efe6', belly: '#ffffff', ears: 'long', earIn: '#ffbfd0', muzzle: '#ffffff', nose: '#ff8fae', tail: 'puff', size: 0.82 },
    'Bunnies can hop as long as a big kid lying down!'),
  A('duckling', 'Duckling', 'meadow', 'common',
    { kind: 'bird', body: '#ffe066', belly: '#fff3a6', beak: '#ff9f2e', beakType: 'duck', wing: '#ffd23f', feet: '#ff9f2e', size: 0.72 },
    'Ducklings follow the first friend they see.'),
  A('lamb', 'Lamb', 'meadow', 'common',
    { kind: 'mammal', body: '#fffaf2', belly: '#fffaf2', face: '#ffe9d6', ears: 'floppy', ear: '#ffe2c8', earIn: '#ffc9b0', wool: true, nose: '#e8939b', tail: 'puff', size: 0.86 },
    'A lamb knows its mum by her voice.'),
  A('piglet', 'Piglet', 'meadow', 'uncommon',
    { kind: 'mammal', body: '#ffb8c8', belly: '#ffd0dc', ears: 'pointy', earIn: '#ff93ad', snout: '#ff98b2', tail: 'curly', size: 0.84 },
    'Pigs are super smart and love a good mud bath.'),
  A('hedgehog', 'Hedgehog', 'meadow', 'uncommon',
    { kind: 'mammal', body: '#9a6b4a', belly: '#f2dcc0', face: '#f2dcc0', ears: 'small', ear: '#e3c4a2', quills: '#7a5236', nose: '#3a2a22', size: 0.74 },
    'A hedgehog has about 5,000 soft-tipped spines.'),
  A('fox', 'Red Fox', 'meadow', 'rare',
    { kind: 'mammal', body: '#ff8a3d', belly: '#ffffff', ears: 'pointy', earIn: '#3a2a22', muzzle: '#ffffff', nose: '#3a2a22', tail: 'bushy', tailTip: '#ffffff', size: 0.86 },
    'Foxes use their fluffy tails as a cozy blanket.'),
  A('unicorn', 'Unicorn', 'meadow', 'legendary',
    { kind: 'mammal', body: '#ffffff', belly: '#fff6fb', ears: 'pointy', earIn: '#ffc6e6', muzzle: '#fff0f8', nose: '#ffa6cf', mane: ['#ff8fd0', '#9b8cff', '#6fd6ff'], horn: '#ffd94a', tail: 'rainbow', size: 1 },
    'Legend says a unicorn sneeze makes a tiny rainbow.'),

  // Savanna
  A('meerkat', 'Meerkat', 'savanna', 'common',
    { kind: 'mammal', body: '#d9b07a', belly: '#f3dcb4', ears: 'small', ear: '#a87c4c', mask: '#7a5232', nose: '#3a2a22', tail: 'thin', size: 0.72, tall: true },
    'Meerkats take turns standing guard for their family.'),
  A('zebra', 'Zebra', 'savanna', 'common',
    { kind: 'mammal', body: '#ffffff', belly: '#ffffff', ears: 'pointy', earIn: '#ffd0d0', muzzle: '#3a3a44', nose: '#22222a', stripes: '#2a2a33', mane: ['#2a2a33'], tail: 'tuft', size: 0.95 },
    'Every zebra has its very own stripe pattern.'),
  A('ostrich', 'Ostrich', 'savanna', 'common',
    { kind: 'bird', body: '#4a3e3c', belly: '#f4ece4', head: '#f2c4b6', beak: '#ffb27a', beakType: 'short', wing: '#ffffff', feet: '#f2c4b6', neck: true, size: 1.0 },
    'Ostriches lay the biggest eggs of any bird.'),
  A('giraffe', 'Giraffe', 'savanna', 'uncommon',
    { kind: 'mammal', body: '#ffd25e', belly: '#fff0b8', ears: 'small', ear: '#ffd25e', muzzle: '#ffe9a6', nose: '#8a5a2a', spots: '#d98a3a', ossicones: '#8a5a2a', neck: true, tail: 'tuft', size: 1.15 },
    'A giraffe’s tongue is dark blue and super long.'),
  A('hippo', 'Hippo', 'savanna', 'uncommon',
    { kind: 'mammal', body: '#a99ac8', belly: '#d6c8ee', ears: 'small', ear: '#8f7fb4', muzzle: '#c8b4e6', nostrils: true, wide: true, tail: 'thin', size: 1.05 },
    'Hippos can hold their breath for five minutes.'),
  A('elephant', 'Elephant', 'savanna', 'rare',
    { kind: 'mammal', body: '#a8b4c4', belly: '#c4cfdc', ears: 'elephant', earIn: '#f2b8c8', trunk: true, tusks: true, tail: 'thin', wide: true, size: 1.2 },
    'Elephants say hello by touching trunks.'),
  A('lion', 'Lion', 'savanna', 'legendary',
    { kind: 'mammal', body: '#ffbe4a', belly: '#ffe4a0', ears: 'round', earIn: '#e8963a', muzzle: '#fff0c8', nose: '#8a4a2a', mane: ['#d9702a', '#e88a2e'], maneRing: true, tail: 'tuft', size: 1.1 },
    'A lion’s roar can be heard 8 kilometres away!'),

  // Jungle
  A('frog', 'Tree Frog', 'jungle', 'common',
    { kind: 'frog', body: '#6fdc5a', belly: '#e8ffb8', eye: '#ff5a3a', feet: '#ff9a3a', size: 0.66 },
    'Tree frogs have sticky toes for climbing.'),
  A('monkey', 'Monkey', 'jungle', 'common',
    { kind: 'mammal', body: '#9a6440', belly: '#f2d0a8', face: '#f6d8b4', ears: 'side', ear: '#f2c8a0', nose: '#7a4a30', tail: 'curl', size: 0.84 },
    'Monkeys groom each other to show they’re friends.'),
  A('parrot', 'Parrot', 'jungle', 'common',
    { kind: 'bird', body: '#ff4a4a', belly: '#ff7a5a', beak: '#fff2d6', beakType: 'hook', wing: '#3aa0ff', wing2: '#ffd23f', feet: '#7a7a8a', tailFeathers: ['#3aa0ff', '#ffd23f'], size: 0.8 },
    'Some parrots can learn over 100 words.'),
  A('toucan', 'Toucan', 'jungle', 'uncommon',
    { kind: 'bird', body: '#2a2a36', belly: '#fff2a0', beak: '#ff9a2e', beak2: '#ffd84a', beakType: 'big', wing: '#2a2a36', feet: '#5aa0ff', eyeRing: '#5ad0ff', size: 0.82 },
    'A toucan’s giant beak is light as a feather inside.'),
  A('sloth', 'Sloth', 'jungle', 'uncommon',
    { kind: 'mammal', body: '#b49a7c', belly: '#d8c4a8', face: '#efe0c8', ears: 'none', eyePatch: '#6a5442', nose: '#3a2a22', sleepy: true, size: 0.86 },
    'Sloths take a whole month to digest one meal.'),
  A('tiger', 'Tiger', 'jungle', 'rare',
    { kind: 'mammal', body: '#ff9a2e', belly: '#ffffff', ears: 'round', earIn: '#ffffff', muzzle: '#ffffff', nose: '#ff7a8a', stripes: '#3a2a22', tail: 'striped', size: 1.05 },
    'No two tigers have the same stripes.'),
  A('panda', 'Panda', 'jungle', 'legendary',
    { kind: 'mammal', body: '#ffffff', belly: '#ffffff', ears: 'round', ear: '#2a2a33', earIn: '#2a2a33', eyePatch: '#2a2a33', arms: '#2a2a33', nose: '#2a2a33', bamboo: true, size: 1.05 },
    'Pandas munch bamboo for about 12 hours a day.'),

  // Ocean Bay
  A('clownfish', 'Clownfish', 'ocean', 'common',
    { kind: 'fish', body: '#ff8a2e', fin: '#ff8a2e', bands: '#ffffff', edge: '#2a2a33', size: 0.62 },
    'Clownfish live safely inside stingy sea anemones.'),
  A('crab', 'Crab', 'ocean', 'common',
    { kind: 'crab', body: '#ff6a5a', belly: '#ffb0a0', size: 0.7 },
    'Crabs walk sideways, and some can wave hello.'),
  A('seahorse', 'Seahorse', 'ocean', 'common',
    { kind: 'seahorse', body: '#ffcf4a', belly: '#fff0a8', fin: '#ffeaa0', size: 0.7 },
    'Seahorse dads carry the babies in a pouch.'),
  A('otter', 'Sea Otter', 'ocean', 'uncommon',
    { kind: 'mammal', body: '#8a6044', belly: '#c89a78', face: '#e8d4c0', ears: 'small', ear: '#7a5038', nose: '#2a1a14', whiskers: true, shell: true, tail: 'thin', size: 0.86 },
    'Otters hold hands while they sleep so they don’t drift apart.'),
  A('octopus', 'Octopus', 'ocean', 'uncommon',
    { kind: 'octopus', body: '#c87aff', belly: '#e8b8ff', spots: '#a85ae8', size: 0.82 },
    'An octopus has three hearts and blue blood.'),
  A('dolphin', 'Dolphin', 'ocean', 'rare',
    { kind: 'fish', body: '#6ab4e8', belly: '#e8f6ff', fin: '#5aa4dc', dolphin: true, size: 0.95 },
    'Dolphins call each other by special whistle names.'),
  A('whale', 'Baby Whale', 'ocean', 'legendary',
    { kind: 'fish', body: '#4a7ad8', belly: '#cfe4ff', fin: '#3a6ac8', whale: true, size: 1.15 },
    'Blue whales are the biggest animals ever, even bigger than dinosaurs.'),

  // Arctic
  A('penguin', 'Penguin', 'arctic', 'common',
    { kind: 'bird', body: '#2a3044', belly: '#ffffff', face: '#ffffff', beak: '#ff9a2e', beakType: 'short', wing: '#2a3044', feet: '#ff9a2e', cheek: '#ffd84a', size: 0.8 },
    'Penguins slide on their tummies to zoom across ice.'),
  A('seal', 'Seal Pup', 'arctic', 'common',
    { kind: 'seal', body: '#f4f6fa', belly: '#ffffff', nose: '#2a2a33', whiskers: true, size: 0.8 },
    'Seal pups are born with fluffy white fur.'),
  A('puffin', 'Puffin', 'arctic', 'common',
    { kind: 'bird', body: '#2a2a36', belly: '#ffffff', face: '#ffffff', beak: '#ff6a2e', beak2: '#ffd84a', beakType: 'puffin', wing: '#2a2a36', feet: '#ff7a2e', size: 0.72 },
    'Puffins can carry ten fish in their beak at once.'),
  A('arcticfox', 'Arctic Fox', 'arctic', 'uncommon',
    { kind: 'mammal', body: '#ffffff', belly: '#ffffff', ears: 'pointy', earIn: '#e0ecf8', muzzle: '#ffffff', nose: '#2a2a33', tail: 'bushy', tailTip: '#e8f2fa', size: 0.82 },
    'Arctic foxes wrap their tails around their noses to stay warm.'),
  A('walrus', 'Walrus', 'arctic', 'uncommon',
    { kind: 'seal', body: '#c8946a', belly: '#e0b088', nose: '#8a5a3a', whiskers: true, tusks: true, wide: true, size: 1.0 },
    'Walruses use their tusks to pull themselves onto ice.'),
  A('polarbear', 'Polar Bear', 'arctic', 'rare',
    { kind: 'mammal', body: '#fbfbf4', belly: '#ffffff', ears: 'round', ear: '#f0f0e4', earIn: '#e4e4d8', muzzle: '#ffffff', nose: '#2a2a33', tail: 'none', wide: true, size: 1.1 },
    'Under all that white fur, polar bears have black skin.'),
  A('narwhal', 'Narwhal', 'arctic', 'legendary',
    { kind: 'fish', body: '#9ab4d0', belly: '#e8f0fa', fin: '#8aa4c4', whale: true, tusk: '#fff6d8', freckles: '#7a94b4', size: 1.05 },
    'The narwhal’s swirly tusk is really a giant tooth.'),

  // Night House
  A('owl', 'Owl', 'night', 'common',
    { kind: 'bird', body: '#9a7a5a', belly: '#f2e2c4', face: '#f8eedc', beak: '#ffb84a', beakType: 'short', wing: '#7a5a3e', feet: '#ffb84a', tufts: true, bigEyes: true, size: 0.8 },
    'Owls can turn their heads almost all the way around.'),
  A('bat', 'Fruit Bat', 'night', 'common',
    { kind: 'mammal', body: '#6a5a7a', belly: '#9a8aa8', face: '#c89a6a', ears: 'pointy', earIn: '#ffb8c8', nose: '#3a2a22', wings: '#5a4a6a', tail: 'none', size: 0.74 },
    'Fruit bats help plant forests by spreading seeds.'),
  A('raccoon', 'Raccoon', 'night', 'common',
    { kind: 'mammal', body: '#9a9aa4', belly: '#d4d4dc', ears: 'round', earIn: '#ffffff', mask: '#3a3a44', muzzle: '#ffffff', nose: '#2a2a33', tail: 'ringed', ring: '#4a4a54', size: 0.84 },
    'Raccoons feel everything with their clever little hands.'),
  A('fennec', 'Fennec Fox', 'night', 'uncommon',
    { kind: 'mammal', body: '#f6d8a4', belly: '#fff4e0', ears: 'fennec', earIn: '#ffc8b0', muzzle: '#fff4e0', nose: '#3a2a22', tail: 'bushy', tailTip: '#3a2a22', size: 0.76 },
    'Fennec foxes have giant ears to hear bugs underground.'),
  A('lemur', 'Lemur', 'night', 'uncommon',
    { kind: 'mammal', body: '#b4b4bc', belly: '#ffffff', face: '#ffffff', ears: 'pointy', earIn: '#ffffff', eyePatch: '#3a3a44', nose: '#2a2a33', tail: 'ringed', ring: '#2a2a33', bigEyes: true, size: 0.8 },
    'Lemurs sunbathe with their arms wide open.'),
  A('koala', 'Koala', 'night', 'rare',
    { kind: 'mammal', body: '#a8acb8', belly: '#e4e6ec', ears: 'fluffy', earIn: '#ffffff', nose: '#3a3a44', bigNose: true, tail: 'none', size: 0.9 },
    'Koalas snooze for up to 20 hours a day.'),
  A('dragon', 'Moon Dragon', 'night', 'legendary',
    { kind: 'mammal', body: '#7ad0c8', belly: '#e8fff0', ears: 'pointy', earIn: '#b8fff0', muzzle: '#c8fff0', nose: '#3a7a74', horns: '#ffe27a', wings: '#9a7aff', tail: 'dragon', spikes: '#9a7aff', glow: true, size: 1.05 },
    'Moon Dragons glow softly so nobody is ever scared of the dark.'),
];
export const ANIMAL_INDEX = Object.fromEntries(ANIMALS.map((a, i) => [a.id, i]));
export const animalsOf = (biomeId) => ANIMALS.filter((a) => a.biome === biomeId);

// Decorations: one of each, placed in any free spot. bonus is a global
// income bonus while placed.
export const DECOS = [
  { id: 'flowers', name: 'Flower Bed', price: 80, bonus: 0.02 },
  { id: 'bench', name: 'Picnic Bench', price: 400, bonus: 0.02 },
  { id: 'lamp', name: 'Lantern Post', price: 1500, bonus: 0.03 },
  { id: 'balloons', name: 'Balloon Cart', price: 6000, bonus: 0.04 },
  { id: 'topiary', name: 'Bunny Topiary', price: 25000, bonus: 0.05 },
  { id: 'icecream', name: 'Ice Cream Stand', price: 90000, bonus: 0.06 },
  { id: 'fountain', name: 'Fountain', price: 300000, bonus: 0.08 },
  { id: 'treehouse', name: 'Treehouse', price: 1000000, bonus: 0.09 },
  { id: 'carousel', name: 'Carousel', price: 3000000, bonus: 0.1 },
  { id: 'arch', name: 'Rainbow Arch', price: 8000000, bonus: 0.12 },
  { id: 'telescope', name: 'Star Telescope', price: 20000000, bonus: 0.13 },
  { id: 'statue', name: 'Golden Statue', price: 50000000, bonus: 0.15 },
];
export const DECO_INDEX = Object.fromEntries(DECOS.map((d, i) => [d.id, i]));
export const DECO_SPOTS_PER_BIOME = 3;

export const RANKS = [
  { name: 'Tiny Zoo', score: 0 },
  { name: 'Cozy Zoo', score: 40 },
  { name: 'Happy Zoo', score: 100 },
  { name: 'Busy Zoo', score: 200 },
  { name: 'Grand Zoo', score: 340 },
  { name: 'Wonder Zoo', score: 520 },
  { name: 'Dream Zoo', score: 740 },
  { name: 'Legendary Zoo', score: 1000 },
];

export const JOY = { pet: 8, snack: 40, max: 100, fadePerSec: 100 / 300, bonus: 0.5, petCooldown: 1.2 };
export const OFFLINE_CAP_S = 6 * 3600;
export const OFFLINE_MIN_S = 60;
export const STAR_BONUS = 0.2;
export const EGG_GROWTH = 1.15;
export const EGG_MAX_MULT = 8;
export const BUILD_MULT = [1, 3, 8];
export const PITY_RARE = 7;
export const PITY_LEGEND = 20;
export const SNACK_MULT = 0.1;
export const START_COINS = 20;
