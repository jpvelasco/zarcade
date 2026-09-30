// Defender and bug stats. Pure data: no DOM, no randomness.
// Distances are in tiles, times in seconds, speeds in tiles per second.

export const TARGETING = ['first', 'strongest', 'closest'];
export const TARGETING_LABEL = { first: 'First', strongest: 'Strongest', closest: 'Closest' };

// Each defender has three tiers: the base plant and two upgrades.
// `cost` is the price to reach that tier (tier 0 cost is the build price).
export const DEFENDERS = {
  pea: {
    id: 'pea', name: 'Pea Pod', role: 'Single target', key: '1', unlock: 0,
    blurb: 'Quick peas at one bug. Hits flyers too.',
    ground: true, air: true, projectile: 'pea', targeting: true,
    tiers: [
      { cost: 50, range: 2.6, damage: 9, cooldown: 0.62 },
      { cost: 60, range: 2.8, damage: 14, cooldown: 0.52, label: 'Twin Pod' },
      { cost: 110, range: 3.0, damage: 21, cooldown: 0.4, label: 'Pea Gatling' },
    ],
  },
  sunflower: {
    id: 'sunflower', name: 'Sunflower Cannon', role: 'Splash', key: '2', unlock: 0,
    blurb: 'Lobs seed bombs that shoo whole crowds. Ground only.',
    ground: true, air: false, projectile: 'seed', targeting: true,
    tiers: [
      { cost: 90, range: 2.8, damage: 20, cooldown: 1.8, splash: 0.9 },
      { cost: 90, range: 3.0, damage: 34, cooldown: 1.7, splash: 1.0, label: 'Double Bloom' },
      { cost: 160, range: 3.2, damage: 55, cooldown: 1.5, splash: 1.2, label: 'Sun King' },
    ],
  },
  honey: {
    id: 'honey', name: 'Honey Pot', role: 'Slow', key: '3', unlock: 1,
    blurb: 'Splats sticky honey puddles that slow bugs down.',
    ground: true, air: false, projectile: 'honey', targeting: true,
    tiers: [
      { cost: 70, range: 2.4, damage: 3, cooldown: 2.2, splash: 0.9, slow: 0.4, puddle: 2.5 },
      { cost: 70, range: 2.6, damage: 5, cooldown: 2.0, splash: 1.0, slow: 0.5, puddle: 3.0, label: 'Honey Crock' },
      { cost: 120, range: 2.8, damage: 8, cooldown: 1.8, splash: 1.15, slow: 0.6, puddle: 3.5, label: 'Royal Jelly' },
    ],
  },
  daisy: {
    id: 'daisy', name: 'Sun Daisy', role: 'Income', key: '4', unlock: 1,
    blurb: 'Makes sunny coins while bugs are marching.',
    ground: false, air: false, projectile: null, targeting: false,
    tiers: [
      { cost: 60, income: 8, period: 11 },
      { cost: 70, income: 13, period: 10.5, label: 'Golden Daisy' },
      { cost: 120, income: 20, period: 10, label: 'Sunburst Daisy' },
    ],
  },
  thistle: {
    id: 'thistle', name: 'Thistle Launcher', role: 'Anti-air', key: '5', unlock: 2,
    blurb: 'Spiky homing thorns that only hit flying bugs.',
    ground: false, air: true, projectile: 'thorn', targeting: true,
    tiers: [
      { cost: 80, range: 3.4, damage: 30, cooldown: 1.0, shots: 1 },
      { cost: 80, range: 3.7, damage: 46, cooldown: 0.9, shots: 1, label: 'Bristle Burst' },
      { cost: 140, range: 4.0, damage: 64, cooldown: 0.85, shots: 2, label: 'Thorn Storm' },
    ],
  },
  mage: {
    id: 'mage', name: 'Mushroom Mage', role: 'Chain magic', key: '6', unlock: 3,
    blurb: 'Sparkly zaps chain between bugs and ignore armor.',
    ground: true, air: true, projectile: 'zap', targeting: true, magic: true,
    tiers: [
      { cost: 120, range: 2.6, damage: 14, cooldown: 1.2, chain: 2, falloff: 0.7 },
      { cost: 110, range: 2.8, damage: 22, cooldown: 1.1, chain: 3, falloff: 0.72, label: 'Toadstool Sage' },
      { cost: 180, range: 3.0, damage: 34, cooldown: 1.0, chain: 4, falloff: 0.75, label: 'Archmage Morel' },
    ],
  },
  lavender: {
    id: 'lavender', name: 'Lavender Lantern', role: 'Support aura', key: '7', unlock: 4,
    blurb: 'Calming glow makes nearby defenders stronger.',
    ground: false, air: false, projectile: null, targeting: false,
    tiers: [
      { cost: 100, aura: 1.6, dmgBuff: 0.15, rangeBuff: 0, rateBuff: 0 },
      { cost: 90, aura: 1.6, dmgBuff: 0.25, rangeBuff: 0.1, rateBuff: 0, label: 'Lantern Grove' },
      { cost: 150, aura: 2.3, dmgBuff: 0.35, rangeBuff: 0.15, rateBuff: 0.15, label: 'Moon Lantern' },
    ],
  },
};

export const DEFENDER_ORDER = ['pea', 'sunflower', 'honey', 'daisy', 'thistle', 'mage', 'lavender'];

// Bugs. `leak` is how many picnic baskets a bug steals if it reaches the picnic.
export const BUGS = {
  ant: { id: 'ant', name: 'Ant', plural: 'ants', hp: 28, speed: 1.05, armor: 0, reward: 4, leak: 1, size: 0.22, gap: 0.8,
    blurb: 'Marches in lines, loves crumbs.' },
  ladybug: { id: 'ladybug', name: 'Ladybug', plural: 'ladybugs', hp: 12, speed: 1.9, armor: 0, reward: 2, leak: 1, size: 0.2, gap: 0.28,
    blurb: 'Tiny and speedy. Comes in swarms!' },
  beetle: { id: 'beetle', name: 'Beetle', plural: 'beetles', hp: 60, speed: 0.75, armor: 4, reward: 8, leak: 1, size: 0.28, gap: 1.3,
    blurb: 'Armored shell shrugs off weak hits.' },
  snail: { id: 'snail', name: 'Snail', plural: 'snails', hp: 150, speed: 0.42, armor: 2, reward: 14, leak: 2, size: 0.3, gap: 2.4, slime: 1,
    blurb: 'Tanky. Its slime trail speeds up other bugs.' },
  butterfly: { id: 'butterfly', name: 'Butterfly', plural: 'butterflies', hp: 30, speed: 1.05, armor: 0, reward: 6, leak: 1, size: 0.26, gap: 1.0, flying: true,
    blurb: 'Flutters straight over the garden.' },
  wasp: { id: 'wasp', name: 'Wasp', plural: 'wasps', hp: 55, speed: 1.45, armor: 1, reward: 9, leak: 1, size: 0.24, gap: 0.9, flying: true,
    blurb: 'Fast flyer with a tough little body.' },
  caterpillar: { id: 'caterpillar', name: 'Caterpillar', plural: 'caterpillars', hp: 70, speed: 0.6, armor: 0, reward: 6, leak: 1, size: 0.3, gap: 1.5, split: { type: 'wiggler', count: 2 },
    blurb: 'Splits into two wigglers when shooed.' },
  wiggler: { id: 'wiggler', name: 'Wiggler', plural: 'wigglers', hp: 22, speed: 1.15, armor: 0, reward: 2, leak: 1, size: 0.18, gap: 0.5, spawnOnly: true,
    blurb: 'Half a caterpillar, twice as wiggly.' },

  // Bosses: one guards the last wave of every map.
  raccoon: { id: 'raccoon', name: 'Giant Raccoon', plural: 'Giant Raccoons', hp: 1400, speed: 0.36, armor: 5, reward: 150, leak: 5, size: 0.55, gap: 3, boss: true, slowResist: 0.5,
    blurb: 'Masked snack bandit. Very, very hungry.' },
  baron: { id: 'baron', name: 'Baron Beetle', plural: 'Baron Beetles', hp: 1100, speed: 0.45, armor: 12, reward: 150, leak: 5, size: 0.5, gap: 3, boss: true, slowResist: 0.5,
    blurb: 'A stag beetle in shining armor. Bring big hits or magic.' },
  queen: { id: 'queen', name: 'Queen Wasp', plural: 'Queen Wasps', hp: 1000, speed: 0.5, armor: 2, reward: 150, leak: 5, size: 0.5, gap: 3, boss: true, flying: true, slowResist: 0.5,
    spawner: { type: 'wasp', every: 3.5 }, blurb: 'Flies straight for the picnic and calls her wasps.' },
  greatsnail: { id: 'greatsnail', name: 'Sir Slimesalot', plural: 'Great Snails', hp: 2000, speed: 0.25, armor: 4, reward: 150, leak: 5, size: 0.55, gap: 3, boss: true, slime: 2, slowResist: 0.6,
    blurb: 'Enormous snail with an enormous slime trail.' },
  bigcat: { id: 'bigcat', name: 'Caterpillar King', plural: 'Caterpillar Kings', hp: 1300, speed: 0.4, armor: 0, reward: 150, leak: 5, size: 0.5, gap: 3, boss: true, slowResist: 0.5,
    split: { type: 'caterpillar', count: 4 }, blurb: 'Pops into four caterpillars when shooed.' },
};

export const START_BASKETS = 10;
export const SELL_REFUND = 0.7;
export const MIN_DAMAGE_FRACTION = 0.2; // armor can never block more than 80% of a hit
export const SLIME_BOOST = 0.35; // bugs on snail slime move 35% faster
export const WAVE_BREAK = 22; // seconds between the end of a wave's spawns and the next wave
export const EARLY_BONUS_PER_SECOND = 1.5;
