// The nine stops on the world tour. Pure data: shapes for the track generator,
// a palette and weather for the renderer, surfaces for the physics and a
// music style for the synth.
//
// circuit: { seed, radius, wobble, points, width, hills, base, shortcuts }
// sprint:  { seed, length, curviness, maxTurn, width, hills, base }
// surface: the road's main surface; patch: a second surface that appears in
// stretches; offroad: what runoff, infield and shortcuts are made of.

export const LOCATIONS = [
  {
    id: 'paris', city: 'Paris', country: 'France', flag: '🇫🇷', lat: 48.86, lon: 2.35,
    name: 'Paris Riverside',
    blurb: 'Cobbles, cafés and the Seine after a summer shower.',
    time: 'Golden hour', weather: 'drizzle', night: false, theme: 'paris', terrain: 'flat',
    surface: 'asphalt', patch: 'wet', patchShare: 0.35, offroad: 'grass',
    wall: 'stone',
    palette: {
      skyTop: '#5a7fc4', skyHorizon: '#ffc78f', fog: '#e8b996', fogNear: 120, fogFar: 620,
      sun: '#ffd29a', sunElevation: 0.22, sunAzimuth: 2.2, ambient: 0.55, light: 1.15,
      ground: '#7aa35a', groundDark: '#5b8445', road: '#5c5e66', line: '#f4f0e6',
      curbA: '#e24b4b', curbB: '#f7f3ea', wall: '#d8c9a8', wallTrim: '#9b8a6a', water: '#4f86a8',
    },
    circuit: { seed: 11, radius: 175, wobble: 0.32, points: 11, width: 14, hills: 1.2, base: 0, shortcuts: 1 },
    sprint: { seed: 12, length: 2100, curviness: 0.45, maxTurn: 0.03, width: 14, hills: 1.5, base: 0 },
    music: { bpm: 112, root: 57, scale: 'major', lead: 'triangle', bass: 'sine', style: 'swing', prog: [0, 5, 3, 4] },
  },
  {
    id: 'rio', city: 'Rio de Janeiro', country: 'Brazil', flag: '🇧🇷', lat: -22.91, lon: -43.17,
    name: 'Rio Carnival Coast',
    blurb: 'Palm-lined beachfront, samba drums and a sky full of confetti.',
    time: 'Sunny afternoon', weather: 'confetti', night: false, theme: 'rio', terrain: 'beach',
    surface: 'asphalt', patch: 'sand', patchShare: 0.25, offroad: 'sand',
    wall: 'bunting',
    palette: {
      skyTop: '#2f8fe8', skyHorizon: '#bfeaff', fog: '#bfe3f2', fogNear: 160, fogFar: 760,
      sun: '#fff1c4', sunElevation: 0.7, sunAzimuth: 0.6, ambient: 0.7, light: 1.25,
      ground: '#efd9a0', groundDark: '#d9bd7c', road: '#5d5a62', line: '#fff7e0',
      curbA: '#18b86b', curbB: '#ffd23d', wall: '#ffffff', wallTrim: '#18b86b', water: '#21a9c9',
    },
    circuit: { seed: 21, radius: 185, wobble: 0.3, points: 10, width: 15, hills: 1.5, base: 0, shortcuts: 1 },
    sprint: { seed: 22, length: 2300, curviness: 0.35, maxTurn: 0.028, width: 15, hills: 2, base: 0 },
    music: { bpm: 124, root: 55, scale: 'mixolydian', lead: 'square', bass: 'triangle', style: 'samba', prog: [0, 3, 4, 3] },
  },
  {
    id: 'kyoto', city: 'Kyoto', country: 'Japan', flag: '🇯🇵', lat: 35.01, lon: 135.77,
    name: 'Kyoto Autumn Temples',
    blurb: 'Maple leaves drift over torii gates and quiet pagodas.',
    time: 'Autumn afternoon', weather: 'leaves', night: false, theme: 'kyoto', terrain: 'rolling',
    surface: 'asphalt', patch: 'dirt', patchShare: 0.2, offroad: 'dirt',
    wall: 'wood',
    palette: {
      skyTop: '#7aa0d6', skyHorizon: '#ffe0b8', fog: '#f0d2b0', fogNear: 110, fogFar: 560,
      sun: '#ffd8a8', sunElevation: 0.35, sunAzimuth: -2.4, ambient: 0.6, light: 1.1,
      ground: '#9a8a4a', groundDark: '#7a6a36', road: '#6a6460', line: '#f6efe0',
      curbA: '#d8402c', curbB: '#f6efe0', wall: '#b23a2a', wallTrim: '#3a2a22', water: '#5a8aa0',
    },
    circuit: { seed: 31, radius: 160, wobble: 0.38, points: 12, width: 13, hills: 3, base: 0, shortcuts: 1 },
    sprint: { seed: 32, length: 2000, curviness: 0.55, maxTurn: 0.034, width: 13, hills: 3, base: 0 },
    music: { bpm: 96, root: 62, scale: 'pentatonic', lead: 'triangle', bass: 'sine', style: 'calm', prog: [0, 3, 5, 4] },
  },
  {
    id: 'tokyo', city: 'Tokyo', country: 'Japan', flag: '🇯🇵', lat: 35.68, lon: 139.69,
    name: 'Tokyo Neon Night',
    blurb: 'Rain-slick streets under a thousand glowing signs.',
    time: 'Midnight', weather: 'rain', night: true, theme: 'tokyo', terrain: 'flat',
    surface: 'wet', patch: 'asphalt', patchShare: 0.4, offroad: 'asphalt',
    wall: 'neon',
    palette: {
      skyTop: '#0a0820', skyHorizon: '#3a1a5a', fog: '#24123e', fogNear: 70, fogFar: 430,
      sun: '#c8b8ff', sunElevation: 0.5, sunAzimuth: 1.2, ambient: 0.75, light: 0.45,
      ground: '#2a2836', groundDark: '#1c1a26', road: '#2e2e3a', line: '#ffe46a',
      curbA: '#ff3fa4', curbB: '#3fe5ff', wall: '#22222e', wallTrim: '#ff3fa4', water: '#20204a',
    },
    circuit: { seed: 41, radius: 165, wobble: 0.36, points: 12, width: 14, hills: 0.8, base: 0, shortcuts: 0 },
    sprint: { seed: 42, length: 2000, curviness: 0.6, maxTurn: 0.032, width: 14, hills: 0.8, base: 0 },
    music: { bpm: 132, root: 52, scale: 'minor', lead: 'sawtooth', bass: 'sawtooth', style: 'synthwave', prog: [0, 5, 3, 6] },
  },
  {
    id: 'sahara', city: 'Sahara', country: 'Egypt', flag: '🇪🇬', lat: 25.0, lon: 25.0,
    name: 'Sahara Dune Dash',
    blurb: 'Packed-sand roads between giant dunes and ancient pyramids.',
    time: 'Desert sunset', weather: 'sand', night: false, theme: 'sahara', terrain: 'dunes',
    surface: 'dirt', patch: 'sand', patchShare: 0.3, offroad: 'sand',
    wall: 'sandbags',
    palette: {
      skyTop: '#4a6ac0', skyHorizon: '#ffb070', fog: '#f0b884', fogNear: 120, fogFar: 640,
      sun: '#ffcc88', sunElevation: 0.16, sunAzimuth: -1.0, ambient: 0.55, light: 1.2,
      ground: '#e8b46a', groundDark: '#c98e48', road: '#b08454', line: '#fff0d0',
      curbA: '#c84a2a', curbB: '#f8e8c8', wall: '#c8a070', wallTrim: '#8a6a40', water: '#3a9ab0',
    },
    circuit: { seed: 51, radius: 200, wobble: 0.3, points: 10, width: 15, hills: 4, base: 0, shortcuts: 1 },
    sprint: { seed: 52, length: 2400, curviness: 0.35, maxTurn: 0.026, width: 15, hills: 5, base: 0 },
    music: { bpm: 108, root: 50, scale: 'phrygian', lead: 'square', bass: 'triangle', style: 'desert', prog: [0, 1, 0, 6] },
  },
  {
    id: 'outback', city: 'Outback', country: 'Australia', flag: '🇦🇺', lat: -25.34, lon: 131.04,
    name: 'Outback Red Run',
    blurb: 'Red dirt, gum trees and Uluru glowing on the horizon.',
    time: 'Hot morning', weather: 'dust', night: false, theme: 'outback', terrain: 'rolling',
    surface: 'dirt', patch: 'asphalt', patchShare: 0.3, offroad: 'dirt',
    wall: 'tyres',
    palette: {
      skyTop: '#2a7ad8', skyHorizon: '#cfe8f6', fog: '#e8c8a8', fogNear: 150, fogFar: 720,
      sun: '#fff0cc', sunElevation: 0.55, sunAzimuth: 2.6, ambient: 0.65, light: 1.3,
      ground: '#c8642e', groundDark: '#a24a22', road: '#9a5a3a', line: '#fff4dc',
      curbA: '#e8e0d0', curbB: '#3a2a22', wall: '#2a2a2a', wallTrim: '#ffcc33', water: '#4a8ab0',
    },
    circuit: { seed: 61, radius: 190, wobble: 0.34, points: 11, width: 15, hills: 2.5, base: 0, shortcuts: 1 },
    sprint: { seed: 62, length: 2400, curviness: 0.4, maxTurn: 0.028, width: 15, hills: 3, base: 0 },
    music: { bpm: 118, root: 52, scale: 'mixolydian', lead: 'square', bass: 'sawtooth', style: 'rock', prog: [0, 6, 3, 0] },
  },
  {
    id: 'newyork', city: 'New York', country: 'USA', flag: '🇺🇸', lat: 40.71, lon: -74.0,
    name: 'New York Sky Bridges',
    blurb: 'An elevated circuit over the city that never sleeps.',
    time: 'Twilight', weather: 'none', night: true, theme: 'newyork', terrain: 'city',
    surface: 'asphalt', patch: 'wet', patchShare: 0.15, offroad: 'asphalt',
    wall: 'rail',
    palette: {
      skyTop: '#1a1e4a', skyHorizon: '#e07a6a', fog: '#4a3a5a', fogNear: 120, fogFar: 640,
      sun: '#ff9a7a', sunElevation: 0.05, sunAzimuth: -2.0, ambient: 0.7, light: 0.7,
      ground: '#3a3a44', groundDark: '#2a2a34', road: '#3a3a42', line: '#ffd84a',
      curbA: '#ff4a4a', curbB: '#f0f0f0', wall: '#8a96a8', wallTrim: '#ffcc33', water: '#2a3a5a',
    },
    circuit: { seed: 71, radius: 180, wobble: 0.3, points: 10, width: 14, hills: 5, base: 30, shortcuts: 0 },
    sprint: { seed: 72, length: 2200, curviness: 0.45, maxTurn: 0.03, width: 14, hills: 6, base: 30 },
    music: { bpm: 100, root: 53, scale: 'dorian', lead: 'triangle', bass: 'sine', style: 'jazz', prog: [0, 3, 6, 4] },
  },
  {
    id: 'alps', city: 'Swiss Alps', country: 'Switzerland', flag: '🇨🇭', lat: 45.98, lon: 7.66,
    name: 'Alpine Hairpins',
    blurb: 'Snowy switchbacks under the Matterhorn. Mind the ice!',
    time: 'Crisp morning', weather: 'snow', night: false, theme: 'alps', terrain: 'mountains',
    surface: 'asphalt', patch: 'snow', patchShare: 0.4, offroad: 'snow',
    wall: 'snowbank',
    palette: {
      skyTop: '#3a74d0', skyHorizon: '#dceaf8', fog: '#dfe8f2', fogNear: 110, fogFar: 600,
      sun: '#fff8e8', sunElevation: 0.45, sunAzimuth: 0.9, ambient: 0.75, light: 1.1,
      ground: '#f0f4fa', groundDark: '#c8d4e4', road: '#55585f', line: '#ffd84a',
      curbA: '#e23a3a', curbB: '#ffffff', wall: '#f4f8ff', wallTrim: '#e23a3a', water: '#6aa0c8',
    },
    circuit: { seed: 81, radius: 165, wobble: 0.42, points: 13, width: 13, hills: 6, base: 0, shortcuts: 1 },
    sprint: { seed: 82, length: 2000, curviness: 0.7, maxTurn: 0.04, width: 13, hills: 10, base: 0 },
    music: { bpm: 120, root: 60, scale: 'major', lead: 'square', bass: 'triangle', style: 'polka', prog: [0, 4, 0, 4] },
  },
  {
    id: 'iceland', city: 'Iceland', country: 'Iceland', flag: '🇮🇸', lat: 64.96, lon: -19.02,
    name: 'Aurora Tundra',
    blurb: 'Northern lights ripple over volcanoes and frosty moss.',
    time: 'Arctic night', weather: 'snow', night: true, theme: 'iceland', terrain: 'tundra',
    surface: 'asphalt', patch: 'snow', patchShare: 0.45, offroad: 'snow',
    wall: 'snowbank',
    palette: {
      skyTop: '#06142a', skyHorizon: '#1a4a5a', fog: '#12303e', fogNear: 90, fogFar: 520,
      sun: '#d8f0ff', sunElevation: 0.6, sunAzimuth: -0.4, ambient: 0.85, light: 0.55,
      ground: '#4a6a5a', groundDark: '#2e4a40', road: '#3a3e46', line: '#bff8ff',
      curbA: '#3affc8', curbB: '#e8f8ff', wall: '#dfeef8', wallTrim: '#3affc8', water: '#14304a',
    },
    circuit: { seed: 91, radius: 190, wobble: 0.36, points: 11, width: 14, hills: 3, base: 0, shortcuts: 1 },
    sprint: { seed: 92, length: 2300, curviness: 0.45, maxTurn: 0.03, width: 14, hills: 4, base: 0 },
    music: { bpm: 90, root: 50, scale: 'minor', lead: 'sine', bass: 'sine', style: 'ambient', prog: [0, 5, 2, 6] },
  },
];

export const LOCATION_BY_ID = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

// Grip and top-speed multipliers per surface. Cars with off-road skill shrug
// off part of the penalty (see vehicle.js surfaceFactor).
export const SURFACES = {
  asphalt: { grip: 1, speed: 1, label: 'Asphalt' },
  wet: { grip: 0.74, speed: 0.98, label: 'Wet' },
  dirt: { grip: 0.84, speed: 0.95, label: 'Dirt' },
  snow: { grip: 0.62, speed: 0.92, label: 'Snow' },
  sand: { grip: 0.68, speed: 0.84, label: 'Sand' },
  grass: { grip: 0.6, speed: 0.74, label: 'Grass' },
};

export const RACE_KINDS = {
  circuit: { label: 'Circuit', icon: '🔁', blurb: '3 laps against 6 rivals' },
  sprint: { label: 'Sprint', icon: '➡️', blurb: 'Point to point, first to the flag' },
  elimination: { label: 'Elimination', icon: '⏱️', blurb: 'Last place drops out every 25 s' },
  timetrial: { label: 'Time Trial', icon: '👻', blurb: 'Beat your ghost and earn medals' },
};
