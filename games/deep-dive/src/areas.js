// The seven areas of the ocean, in the order the player opens them.
// `needs` lists the upgrades Bubbles must own to swim inside the area.

export const UPGRADES = [
  { id: 'grabber', name: 'Grabber', icon: '🦾', blurb: 'A clever claw arm. Bubbles can now pull open rusty hatches.', area: 1 },
  { id: 'drill', name: 'Coral Drill', icon: '🌀', blurb: 'A gentle drill. Bubbles can now tunnel through old coral walls.', area: 2 },
  { id: 'lights', name: 'Headlights', icon: '🔦', blurb: 'Two bright lamps. Bubbles can now explore the dark Twilight Zone.', area: 3 },
  { id: 'hull', name: 'Pressure Hull', icon: '🛡️', blurb: 'A super-strong shell. Bubbles can now dive down into the deep trenches.', area: 4 },
  { id: 'turbo', name: 'Turbo Fin', icon: '💨', blurb: 'A zippy propeller. Bubbles can now push through strong currents.', area: 5 },
];

export const UPGRADE_ORDER = UPGRADES.map((u) => u.id);

export const AREAS = [
  {
    id: 'shallows', name: 'Sunny Shallows', needs: [],
    rock: ['#d9b77a', '#b98f55', '#f3dca3'], water: '#3fc4e0', accent: '#ffd84f',
    blurb: 'Warm, bright water near the beach. Home sweet home!',
  },
  {
    id: 'kelp', name: 'Kelp Forest', needs: [],
    rock: ['#6f7f5a', '#4f5e3e', '#a3b585'], water: '#2aa3b8', accent: '#7ee07a',
    blurb: 'Tall swaying kelp, like an underwater jungle.',
  },
  {
    id: 'wreck', name: 'Shipwreck', needs: [],
    rock: ['#7a5a3c', '#553b25', '#a98260'], water: '#24788f', accent: '#ffb35a',
    blurb: 'An old sunken ship. What treasure is hiding inside?',
  },
  {
    id: 'coral', name: 'Coral City', needs: [],
    rock: ['#c96f8d', '#94506d', '#f2a3bd'], water: '#1f8fb0', accent: '#ff7eb6',
    blurb: 'A bustling reef full of color and life.',
  },
  {
    id: 'twilight', name: 'Twilight Zone', needs: ['lights'],
    rock: ['#3b4a74', '#26304f', '#5a6da3'], water: '#123a66', accent: '#7aa8ff',
    blurb: 'Sunlight fades away. Glowing fish light the way.',
  },
  {
    id: 'trench', name: 'Glowing Trenches', needs: ['lights', 'hull'],
    rock: ['#2b2f52', '#1a1c36', '#4b4f86'], water: '#0b1c3d', accent: '#5ef2d0',
    blurb: 'The deepest canyons in the sea, lit by glowing crystals.',
  },
  {
    id: 'vent', name: 'Volcanic Vent', needs: ['lights', 'hull'],
    rock: ['#4a2f2f', '#2e1b1d', '#7a4a3a'], water: '#1d1530', accent: '#ff8a3d',
    blurb: 'Warm chimneys bubble up from the sea floor.',
  },
];

export const AREA_INDEX = Object.fromEntries(AREAS.map((a, i) => [a.id, i]));

export function hasAll(upgrades, needs) {
  for (const n of needs) if (!upgrades.has(n)) return false;
  return true;
}

// The upgrades owned after collecting the first `n` parts in order.
export function upgradesAfter(n) {
  return new Set(UPGRADE_ORDER.slice(0, n));
}
