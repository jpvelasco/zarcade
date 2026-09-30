import { gridPoint, gridCoordinates, routeBetween, routeLength } from './city.js';
import { hash, pick, rng } from './math.js';

export const DISTRICTS = [
  {
    id: 'lowrise',
    name: 'Lowrise',
    subtitle: 'Wide streets. First watch.',
    accent: '#3fe5ff',
    sky: '#071326',
    rain: 0.18,
    patrols: 1,
  },
  {
    id: 'market',
    name: 'Market Stack',
    subtitle: 'Crowded lanes and borrowed shortcuts.',
    accent: '#ff5fb7',
    sky: '#1a0c28',
    rain: 0.35,
    patrols: 2,
  },
  {
    id: 'floodline',
    name: 'Floodline',
    subtitle: 'Rain turns every corner into a wager.',
    accent: '#7b9dff',
    sky: '#081832',
    rain: 0.95,
    patrols: 2,
  },
  {
    id: 'skybridge',
    name: 'Skybridge',
    subtitle: 'Fast roads. Nowhere to disappear.',
    accent: '#ffc857',
    sky: '#1b1824',
    rain: 0.48,
    patrols: 3,
  },
  {
    id: 'core',
    name: 'The Core',
    subtitle: 'Every light in the city is looking for you.',
    accent: '#c775ff',
    sky: '#130b25',
    rain: 0.7,
    patrols: 4,
  },
];

export const CONTRACT_TYPES = [
  {
    id: 'glasshouse',
    label: 'GLASSHOUSE',
    name: 'Glasshouse Sample',
    client: 'Lantern Clinic',
    blurb: 'A medical sample. Keep the ride clean.',
    condition: 'FRAGILE CARGO',
    damage: 1.35,
    scanDamage: 0,
    overcharge: false,
  },
  {
    id: 'black-signal',
    label: 'BLACK SIGNAL',
    name: 'Black Signal',
    client: 'Vanta',
    blurb: 'Stolen data. Security scans corrupt it.',
    condition: 'SILENT RUN',
    damage: 1,
    scanDamage: 1.45,
    overcharge: false,
  },
  {
    id: 'livewire',
    label: 'LIVEWIRE',
    name: 'Livewire Cell',
    client: 'Tidemarket',
    blurb: 'Do not leave it fully charged for long.',
    condition: 'LIVE CARGO',
    damage: 1.15,
    scanDamage: 0,
    overcharge: true,
  },
  {
    id: 'nightfall',
    label: 'NIGHTFALL',
    name: 'Nightfall Relay',
    client: 'Streetline',
    blurb: 'A rival is already hunting this handoff.',
    condition: 'HIGH HEAT BONUS',
    damage: 1.1,
    scanDamage: 0,
    overcharge: false,
  },
];

const FIRST_NAMES = ['Hearth', 'Rook', 'Velvet', 'Sable', 'Arden', 'Nori', 'Mara', 'Vesper'];
const LAST_NAMES = ['Terminal', 'Arcade', 'Annex', 'Spire', 'Quay', 'Yard', 'Station', 'Relay'];

function offset(random, minimum, maximum) {
  let x = 0;
  let y = 0;
  let distance = 0;
  while (distance < minimum || distance > maximum) {
    x = Math.floor(random() * (maximum * 2 + 1)) - maximum;
    y = Math.floor(random() * (maximum * 2 + 1)) - maximum;
    distance = Math.abs(x) + Math.abs(y);
  }
  return { x, y };
}

function locationName(seed) {
  const random = rng(seed);
  return `${pick(FIRST_NAMES, random)} ${pick(LAST_NAMES, random)}`;
}

export function districtFor(index) {
  return DISTRICTS[Math.min(index, DISTRICTS.length - 1)];
}

// Contracts always begin and end at intersections. This keeps generated route
// lines useful for both players and the headless pilot.
export function makeContract(shiftSeed, index, from = { x: 0, y: 0 }) {
  const seed = hash(shiftSeed ^ Math.imul(index + 1, 0x9e3779b9));
  const random = rng(seed);
  const start = gridCoordinates(from);
  const type = index === 4
    ? { ...CONTRACT_TYPES[3], label: 'DAWN RELAY', name: 'Dawn Relay', client: 'All channels' }
    : CONTRACT_TYPES[Math.floor(random() * 3)];
  const district = districtFor(index);

  const pickupDistance = 2 + Math.min(index, 2);
  const dropDistance = 3 + Math.min(index, 2);
  const pickupOffset = offset(random, pickupDistance, pickupDistance + 2);
  const pickup = gridPoint(start.column + pickupOffset.x, start.row + pickupOffset.y);
  const dropOffset = offset(random, dropDistance, dropDistance + 2);
  const delivery = gridPoint(
    start.column + pickupOffset.x + dropOffset.x,
    start.row + pickupOffset.y + dropOffset.y,
  );
  const toPickup = routeBetween(from, pickup, seed);
  const toDelivery = routeBetween(pickup, delivery, seed ^ 0x67);
  const distance = routeLength(from, toPickup) + routeLength(pickup, toDelivery);
  const timeLimit = Math.max(50, Math.round(distance / 50) + 20 + index);
  const baseReward = 120 + index * 95 + Math.round(distance / 42);

  return {
    id: `${shiftSeed.toString(36)}-${index}`,
    seed,
    index,
    type,
    district,
    pickup,
    delivery,
    pickupName: locationName(seed ^ 0x17),
    deliveryName: locationName(seed ^ 0xb4),
    toPickup,
    toDelivery,
    distance,
    timeLimit,
    reward: baseReward,
  };
}
