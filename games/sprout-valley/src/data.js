// All of Sprout Valley's content tables: crops, items, shop stock, recipes,
// fish, critters, villagers, festivals and journal goals. DOM-free data only.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

// Crops. `days` is the number of watered nights until the first harvest;
// `regrow` crops come back after that many more watered nights.
export const CROPS = {
  turnip:     { name: 'Turnip',      seasons: ['spring'],           seed: 20,  sell: 40,  days: 3, color: '#f4e6f0', accent: '#c56bb0' },
  carrot:     { name: 'Carrot',      seasons: ['spring', 'autumn'], seed: 30,  sell: 60,  days: 4, color: '#ff9a3c', accent: '#5fb04a' },
  strawberry: { name: 'Strawberry',  seasons: ['spring'],           seed: 60,  sell: 45,  days: 4, regrow: 2, color: '#ff5a6e', accent: '#5fb04a' },
  tulip:      { name: 'Tulip',       seasons: ['spring'],           seed: 25,  sell: 55,  days: 4, flower: true, color: '#ff7eb6', accent: '#ffd36e' },
  tomato:     { name: 'Tomato',      seasons: ['summer'],           seed: 40,  sell: 45,  days: 4, regrow: 2, color: '#ff5b47', accent: '#4fa046' },
  blueberry:  { name: 'Blueberry',   seasons: ['summer'],           seed: 70,  sell: 35,  days: 4, regrow: 2, yield: 2, color: '#6b7cff', accent: '#3d8c4c' },
  melon:      { name: 'Melon',       seasons: ['summer'],           seed: 80,  sell: 210, days: 6, color: '#8ed36a', accent: '#ff8a8a' },
  sunflower:  { name: 'Sunflower',   seasons: ['summer', 'autumn'], seed: 40,  sell: 90,  days: 4, flower: true, color: '#ffd23f', accent: '#8a5a2b' },
  corn:       { name: 'Corn',        seasons: ['summer', 'autumn'], seed: 60,  sell: 55,  days: 5, regrow: 3, color: '#ffe066', accent: '#6cbf4f' },
  wheat:      { name: 'Wheat',       seasons: ['summer', 'autumn'], seed: 10,  sell: 25,  days: 3, color: '#e9c46a', accent: '#c99a3b' },
  pumpkin:    { name: 'Pumpkin',     seasons: ['autumn'],           seed: 90,  sell: 270, days: 6, color: '#ff8c2e', accent: '#5a9a3a' },
  cranberry:  { name: 'Cranberry',   seasons: ['autumn'],           seed: 100, sell: 40,  days: 4, regrow: 2, yield: 2, color: '#d7263d', accent: '#7a4a2a' },
  beet:       { name: 'Beet',        seasons: ['autumn'],           seed: 20,  sell: 50,  days: 3, color: '#a3245a', accent: '#5fb04a' },
  kale:       { name: 'Frost Kale',  seasons: ['winter'],           seed: 50,  sell: 110, days: 4, color: '#7fc8a9', accent: '#4a8f7a' },
  snowdrop:   { name: 'Snowdrop',    seasons: ['winter'],           seed: 30,  sell: 75,  days: 3, flower: true, color: '#f4f8ff', accent: '#9fd3ff' },
};
export const CROP_IDS = Object.keys(CROPS);

export const FISH = {
  minnow:   { name: 'Minnow',      sell: 25,  where: ['pond', 'town'], seasons: SEASONS, weight: 30, color: '#a8c6d8' },
  bluegill: { name: 'Bluegill',    sell: 45,  where: ['pond', 'town'], seasons: ['spring', 'summer', 'autumn'], weight: 22, color: '#5d8fd6' },
  sunfish:  { name: 'Sunfish',     sell: 60,  where: ['pond'], seasons: ['spring', 'summer'], weight: 14, day: true, color: '#ffb347' },
  carp:     { name: 'Carp',        sell: 70,  where: ['town'], seasons: SEASONS, weight: 14, color: '#c9a66b' },
  catfish:  { name: 'Catfish',     sell: 120, where: ['pond', 'town'], seasons: SEASONS, weight: 14, rain: true, color: '#7d6e5b' },
  pike:     { name: 'Pike',        sell: 110, where: ['pond', 'town'], seasons: ['autumn', 'winter'], weight: 12, color: '#7aa36b' },
  perch:    { name: 'Ice Perch',   sell: 90,  where: ['pond', 'town'], seasons: ['winter'], weight: 18, color: '#9fc9e8' },
  moonfish: { name: 'Moonfish',    sell: 160, where: ['pond', 'town'], seasons: SEASONS, weight: 10, night: true, color: '#d9d2ff' },
  koi:      { name: 'Golden Koi',  sell: 300, where: ['town'], seasons: SEASONS, weight: 3, color: '#ffcf3f' },
};
export const FISH_IDS = Object.keys(FISH);

// Critters are caught with the net, logged in the collection and let go.
export const CRITTERS = {
  butterfly: { name: 'Pink Butterfly', seasons: ['spring', 'summer'], day: true, color: '#ff9ad5', fly: true },
  ladybug:   { name: 'Ladybug',        seasons: ['spring'], day: true, color: '#e63946' },
  bee:       { name: 'Bumblebee',      seasons: ['summer'], day: true, color: '#ffd23f', fly: true },
  dragonfly: { name: 'Dragonfly',      seasons: ['summer', 'autumn'], day: true, color: '#4cc9f0', fly: true },
  firefly:   { name: 'Firefly',        seasons: ['summer'], night: true, color: '#f5ff8a', fly: true, glow: true },
  snail:     { name: 'Rain Snail',     seasons: ['spring', 'summer', 'autumn'], rain: true, color: '#c58b5a' },
  cricket:   { name: 'Cricket',        seasons: ['autumn'], color: '#7a9a3a' },
  moth:      { name: 'Owl Moth',       seasons: ['spring', 'summer', 'autumn'], night: true, color: '#c8b6a6', fly: true },
  beetle:    { name: 'Frost Beetle',   seasons: ['winter'], day: true, color: '#7ab8ff' },
  robin:     { name: 'Winter Robin',   seasons: ['winter'], day: true, color: '#d9534f', fly: true },
};
export const CRITTER_IDS = Object.keys(CRITTERS);

export const PRODUCE = {
  egg:      { name: 'Egg',       sell: 45,  color: '#fff3dc' },
  milk:     { name: 'Milk',      sell: 100, color: '#f8fbff' },
  goatmilk: { name: 'Goat Milk', sell: 120, color: '#fffaf0' },
};

export const GOODS = {
  jam:        { name: 'Strawberry Jam', sell: 190, color: '#ff4d6d' },
  bluejam:    { name: 'Blueberry Jam',  sell: 160, color: '#5a6cff' },
  cranjam:    { name: 'Cranberry Sauce', sell: 180, color: '#c9184a' },
  cheese:     { name: 'Cheese',         sell: 230, color: '#ffd166' },
  goatcheese: { name: 'Goat Cheese',    sell: 280, color: '#fff1c1' },
  bread:      { name: 'Bread',          sell: 120, color: '#d4a373' },
  pie:        { name: 'Pumpkin Pie',    sell: 460, color: '#e76f51' },
  omelette:   { name: 'Omelette',       sell: 220, color: '#ffe08a' },
  soup:       { name: 'Garden Soup',    sell: 260, color: '#90be6d' },
};

export const RECIPES = {
  jam:        { name: 'Strawberry Jam',  needs: { strawberry: 3 } },
  bluejam:    { name: 'Blueberry Jam',   needs: { blueberry: 3 } },
  cranjam:    { name: 'Cranberry Sauce', needs: { cranberry: 3 } },
  cheese:     { name: 'Cheese',          needs: { milk: 1 } },
  goatcheese: { name: 'Goat Cheese',     needs: { goatmilk: 1 } },
  bread:      { name: 'Bread',           needs: { wheat: 3 } },
  pie:        { name: 'Pumpkin Pie',     needs: { pumpkin: 1, egg: 1, wheat: 1 } },
  omelette:   { name: 'Omelette',        needs: { egg: 2, milk: 1 } },
  soup:       { name: 'Garden Soup',     needs: { turnip: 1, carrot: 1, kale: 1 } },
};

// Decorations placed on the farm. `light` ones glow at night; `floor` ones
// are walkable paving.
export const DECOR = {
  path:      { name: 'Paving Stone',  cost: 10,  floor: true },
  flowerpot: { name: 'Flower Pot',    cost: 80 },
  bench:     { name: 'Garden Bench',  cost: 150 },
  lamp:      { name: 'Lamp Post',     cost: 200, light: true },
  gnome:     { name: 'Garden Gnome',  cost: 120 },
  birdbath:  { name: 'Bird Bath',     cost: 180 },
  scarecrow: { name: 'Scarecrow',     cost: 100 },
  bunny:     { name: 'Bunny Statue',  cost: 0, prize: true },
  lantern:   { name: 'Paper Lantern', cost: 0, prize: true, light: true },
  ribbon:    { name: 'Fair Ribbon',   cost: 0, prize: true },
  snowman:   { name: 'Snowman',       cost: 0, prize: true },
};

export const TOOLS = ['hoe', 'can', 'scythe', 'rod', 'net'];
export const TOOL_NAMES = { hoe: 'Hoe', can: 'Watering Can', scythe: 'Scythe', rod: 'Fishing Rod', net: 'Bug Net' };

// Watering can levels: capacity and the footprint watered per use.
export const CAN_LEVELS = [
  { name: 'Watering Can', capacity: 20, area: 'single' },
  { name: 'Copper Can', capacity: 40, area: 'line' },
  { name: 'Silver Can', capacity: 70, area: 'square' },
];

export const UPGRADES = {
  can1:       { name: 'Copper Can',       cost: 500,  desc: 'Holds 40 and waters 3 tiles in a row.' },
  can2:       { name: 'Silver Can',       cost: 1500, desc: 'Holds 70 and waters a 3×3 patch.', requires: 'can1' },
  field:      { name: 'Bigger Field',     cost: 1500, desc: 'Clears the meadow east and south of your field.' },
  greenhouse: { name: 'Greenhouse',       cost: 4000, desc: 'Restore the old glasshouse. Crops grow in any season and never need water.' },
};

export const ANIMALS = {
  chicken: { name: 'Chicken', cost: 400,  produce: 'egg',      max: 4, sound: 'cluck' },
  cow:     { name: 'Cow',     cost: 1200, produce: 'milk',     max: 2, sound: 'moo' },
  goat:    { name: 'Goat',    cost: 900,  produce: 'goatmilk', max: 1, sound: 'bleat' },
};

export const MISC = {
  hay:       { name: 'Hay',       sell: 0, cost: 10 },
  sprinkler: { name: 'Sprinkler', sell: 0, cost: 200 },
  egghunt:   { name: 'Festival Egg', sell: 0 },
};

// Every item, keyed by id: { name, kind, sell, cost?, crop? }.
export const ITEMS = {};
for (const [id, c] of Object.entries(CROPS)) {
  ITEMS[id] = { name: c.name, kind: 'crop', sell: c.sell, color: c.color };
  ITEMS[`${id}_seed`] = { name: `${c.name} Seeds`, kind: 'seed', crop: id, sell: 0, cost: c.seed, color: c.color };
}
for (const [id, f] of Object.entries(FISH)) ITEMS[id] = { name: f.name, kind: 'fish', sell: f.sell, color: f.color };
for (const [id, p] of Object.entries(PRODUCE)) ITEMS[id] = { name: p.name, kind: 'produce', sell: p.sell, color: p.color };
for (const [id, g] of Object.entries(GOODS)) ITEMS[id] = { name: g.name, kind: 'goods', sell: g.sell, color: g.color };
for (const [id, d] of Object.entries(DECOR)) ITEMS[id] = { name: d.name, kind: 'decor', sell: 0, cost: d.cost };
ITEMS.hay = { name: 'Hay', kind: 'hay', sell: 0, cost: MISC.hay.cost };
ITEMS.sprinkler = { name: 'Sprinkler', kind: 'sprinkler', sell: 0, cost: MISC.sprinkler.cost };

export const sellable = (id) => (ITEMS[id]?.sell || 0) > 0;
export const giftable = (id) => ['crop', 'fish', 'produce', 'goods'].includes(ITEMS[id]?.kind);

// Villagers. `home` is a door tile; schedules are [minute, place] pairs
// resolved by the map's named spots.
export const VILLAGERS = {
  mabel: {
    intro: "Oh! You must be the new farmer. I'm Mabel, I run the General Store. Seeds, tools, animals: come see me!",
    name: 'Mabel', role: 'runs the General Store', palette: { skin: '#f2c6a0', hair: '#b5651d', shirt: '#7fc8f8', pants: '#5a6e8c' },
    loves: ['jam', 'strawberry', 'pie'], likes: ['tulip', 'sunflower', 'egg', 'bread'], dislikes: ['minnow'],
    schedule: [[0, 'shop'], [17 * 60 + 30, 'plaza'], [20 * 60, 'home:mabel']],
    rainSchedule: [[0, 'shop'], [18 * 60, 'home:mabel']],
    lines: [
      'Welcome to Sprout Valley! Seeds are in the store whenever you need them.',
      'Rain is good for crops and good for business. People buy umbrellas!',
      'If you ever have a spare strawberry, I make a mean jam.',
      'Shipping bins are emptied every night. Coins by morning!',
    ],
    warm: ['You remind me of my grandmother. She had the greenest thumbs in the valley.', 'I saved you a smile. And a discount on smiles. They are free.'],
  },
  bram: {
    intro: "Hello there. Bram. I'm the carpenter. If it is made of wood, I probably built it.",
    name: 'Bram', role: 'the carpenter', palette: { skin: '#d9a07a', hair: '#3e2a1e', shirt: '#e07a5f', pants: '#3d405b' },
    loves: ['bread', 'corn', 'cheese'], likes: ['pumpkin', 'milk', 'carrot'], dislikes: ['snowdrop'],
    schedule: [[0, 'home:bram'], [8 * 60, 'workshop'], [12 * 60, 'plaza'], [14 * 60, 'workshop'], [19 * 60, 'home:bram']],
    rainSchedule: [[0, 'home:bram'], [10 * 60, 'workshop'], [17 * 60, 'home:bram']],
    lines: [
      'Need something built? Fences, benches, a whole greenhouse. Ask at the store.',
      'Good wood smells like a forest after rain.',
      'My lunch is bread. My dinner is bread. I like bread.',
      'That old greenhouse on your farm just needs some love. And glass.',
    ],
    warm: ['I carved you a little bird. It is not finished. It has no wings yet.', 'You work hard. I respect that.'],
  },
  juniper: {
    intro: "Hi hi hi! I'm Juniper! I'm going to catch every critter in the valley. Wanna help?",
    name: 'Juniper', role: 'loves bugs and adventures', palette: { skin: '#8d5a3b', hair: '#1b1b2f', shirt: '#ffd166', pants: '#06d6a0' },
    loves: ['blueberry', 'sunflower', 'omelette'], likes: ['strawberry', 'melon', 'tulip'], dislikes: ['beet', 'kale'],
    schedule: [[0, 'home:juniper'], [9 * 60, 'meadow'], [13 * 60, 'townpond'], [16 * 60, 'plaza'], [19 * 60, 'home:juniper']],
    rainSchedule: [[0, 'home:juniper'], [11 * 60, 'plaza'], [15 * 60, 'home:juniper']],
    lines: [
      'Did you know ladybugs only come out in spring? I have a list!',
      'Fireflies dance over the meadow on summer nights. Bring your net!',
      'Snails love the rain. I love snails. So I love rain!',
      'One day I am going to catch every critter in the valley.',
    ],
    warm: ['You are my best farm friend. My only farm friend. But still the best!', 'I named a beetle after you. It is very shiny.'],
  },
  rowan: {
    intro: "Ah, the new farmer. Name's Rowan. I've fished these ponds for sixty years.",
    name: 'Rowan', role: 'an old fisherman', palette: { skin: '#e8b48f', hair: '#e8e8e8', shirt: '#4a7c59', pants: '#6b4f3a' },
    loves: ['koi', 'cheese', 'pie'], likes: ['catfish', 'pike', 'bread', 'goatcheese'], dislikes: ['tulip'],
    schedule: [[0, 'home:rowan'], [6 * 60 + 30, 'townpond'], [12 * 60, 'plaza'], [14 * 60, 'townpond'], [20 * 60, 'home:rowan']],
    rainSchedule: [[0, 'home:rowan'], [6 * 60 + 30, 'townpond'], [21 * 60, 'home:rowan']],
    lines: [
      'Fish bite best in the rain. Catfish especially.',
      'Some say a golden koi lives in the town pond. Some say I made that up.',
      'Patience. Cast, wait, and when you see the splash, pull!',
      'At night the moonfish come up to look at the stars.',
    ],
    warm: ['You have the patience of a heron. That is a compliment.', 'My father fished this pond. Now you do too.'],
  },
  clem: {
    intro: "Welcome, welcome! I'm Clementine, the baker. Everyone calls me Clem.",
    name: 'Clementine', role: 'the baker', palette: { skin: '#f6d1b8', hair: '#e85d75', shirt: '#ffffff', pants: '#c9ada7' },
    loves: ['wheat', 'pumpkin', 'milk'], likes: ['egg', 'strawberry', 'cranberry', 'jam'], dislikes: ['catfish'],
    schedule: [[0, 'home:clem'], [7 * 60, 'bakery'], [15 * 60, 'plaza'], [18 * 60, 'home:clem']],
    rainSchedule: [[0, 'home:clem'], [7 * 60, 'bakery'], [18 * 60, 'home:clem']],
    lines: [
      'Fresh bread every morning! Well, most mornings.',
      'Wheat, eggs, milk: give me those and I can make anything.',
      'Pumpkin season is my favorite season. Pie for everyone!',
      'You can bake bread at home too, you know. Three wheat, one oven.',
    ],
    warm: ['I tried a new recipe and named it after your farm.', 'Here, smell this. Cinnamon. Life is good, right?'],
  },
  sol: {
    intro: "Oh, hello. I'm Sol. I paint. Your farm has the loveliest light, did you know?",
    name: 'Sol', role: 'a dreamy painter', palette: { skin: '#c48b6a', hair: '#6a4c93', shirt: '#9d8df1', pants: '#2b2d42' },
    loves: ['tulip', 'snowdrop', 'melon'], likes: ['sunflower', 'koi', 'blueberry'], dislikes: ['egg'],
    schedule: [[0, 'home:sol'], [10 * 60, 'farmgate'], [13 * 60, 'townpond'], [17 * 60, 'plaza'], [21 * 60, 'home:sol']],
    rainSchedule: [[0, 'home:sol'], [12 * 60, 'plaza'], [16 * 60, 'home:sol']],
    lines: [
      'The light over your fields at sunset... I have to paint it.',
      'Flowers are just the earth smiling. Somebody said that. Maybe me.',
      'Snow turns the whole valley into a blank canvas.',
      'Every color in my paintbox started as a flower once.',
    ],
    warm: ['I painted your farm. You are in it, waving.', 'You make this valley brighter. Literally. Look at those sunflowers.'],
  },
};
export const VILLAGER_IDS = Object.keys(VILLAGERS);

// Seasonal festivals in the town plaza.
export const FESTIVALS = {
  egghunt: { name: 'Spring Egg Hunt', season: 'spring', day: 4, start: 9 * 60, end: 15 * 60, goal: 8, total: 12,
    desc: 'Twelve painted eggs are hidden around town. Find eight before 3 pm!', prize: { gold: 300, decor: 'bunny' } },
  lanterns: { name: 'Summer Lantern Night', season: 'summer', day: 5, start: 18 * 60, end: 23 * 60, goal: 8, total: 8,
    desc: 'Light all eight lanterns around the town pond and watch them float into the sky.', prize: { gold: 300, decor: 'lantern' } },
  fair: { name: 'Harvest Fair', season: 'autumn', day: 5, start: 9 * 60, end: 16 * 60, goal: 1, total: 3,
    desc: 'Show off three things you grew or made at the fair booth. The judges love variety!', prize: { gold: 0, decor: 'ribbon' } },
  snow: { name: 'Snow Festival', season: 'winter', day: 4, start: 10 * 60, end: 16 * 60, goal: 3, total: 3,
    desc: 'Ice fishing contest! Catch three fish from the frozen town pond.', prize: { gold: 300, decor: 'snowman' } },
};
export const FESTIVAL_IDS = Object.keys(FESTIVALS);

// Journal goals, checked against world stats. `reward` is gold.
export const GOALS = [
  { id: 'till', text: 'Till 6 patches of soil with the hoe', stat: 'tilled', n: 6, reward: 0 },
  { id: 'plant', text: 'Plant 6 seeds', stat: 'planted', n: 6, reward: 0 },
  { id: 'water', text: 'Water 6 crops', stat: 'watered', n: 6, reward: 0 },
  { id: 'harvest', text: 'Harvest your first crop', stat: 'harvested', n: 1, reward: 50 },
  { id: 'ship', text: 'Ship something in the bin by your house', stat: 'shipped', n: 1, reward: 0 },
  { id: 'feed', text: 'Fill the hay trough for your chickens', stat: 'fed', n: 1, reward: 0 },
  { id: 'egg', text: 'Collect an egg', stat: 'collected', n: 1, reward: 0 },
  { id: 'meet', text: 'Say hello to all six villagers', stat: 'met', n: 6, reward: 100 },
  { id: 'fish', text: 'Catch a fish', stat: 'fishCaught', n: 1, reward: 50 },
  { id: 'critter', text: 'Catch a critter with the bug net', stat: 'crittersCaught', n: 1, reward: 50 },
  { id: 'craft', text: 'Cook something in your kitchen', stat: 'crafted', n: 1, reward: 50 },
  { id: 'gift', text: 'Give a gift a villager loves', stat: 'lovedGifts', n: 1, reward: 50 },
  { id: 'request', text: 'Finish a community board request', stat: 'requests', n: 1, reward: 100 },
  { id: 'market', text: 'Sell at the Saturday market stall', stat: 'marketSales', n: 1, reward: 50 },
  { id: 'sprinkler', text: 'Place a sprinkler', stat: 'sprinklers', n: 1, reward: 0 },
  { id: 'can', text: 'Upgrade your watering can', stat: 'canLevel', n: 1, reward: 0 },
  { id: 'decor', text: 'Place 5 decorations on your farm', stat: 'decorPlaced', n: 5, reward: 100 },
  { id: 'earn1', text: 'Earn 2,000g in total', stat: 'earned', n: 2000, reward: 100 },
  { id: 'cow', text: 'Buy a cow or a goat', stat: 'bigAnimals', n: 1, reward: 0 },
  { id: 'hearts3', text: 'Reach 3 hearts with a villager', stat: 'bestHearts', n: 3, reward: 100 },
  { id: 'field', text: 'Expand your field', stat: 'fieldBig', n: 1, reward: 0 },
  { id: 'festival', text: 'Win a festival prize', stat: 'festivalsWon', n: 1, reward: 100 },
  { id: 'earn2', text: 'Earn 10,000g in total', stat: 'earned', n: 10000, reward: 300 },
  { id: 'greenhouse', text: 'Restore the greenhouse', stat: 'greenhouse', n: 1, reward: 0 },
  { id: 'hearts6', text: 'Reach 6 hearts with a villager', stat: 'bestHearts', n: 6, reward: 200 },
  { id: 'crops', text: 'Harvest 10 different crops', stat: 'cropKinds', n: 10, reward: 300 },
  { id: 'fishes', text: 'Catch 6 different fish', stat: 'fishKinds', n: 6, reward: 300 },
  { id: 'critters', text: 'Catch 6 different critters', stat: 'critterKinds', n: 6, reward: 300 },
  { id: 'allfest', text: 'Win all four festival prizes', stat: 'festivalsWon', n: 4, reward: 500 },
  { id: 'year', text: 'Live a whole year in the valley', stat: 'daysPlayed', n: 28, reward: 1000 },
];

export const HEART_POINTS = 100;
export const MAX_HEARTS = 10;
