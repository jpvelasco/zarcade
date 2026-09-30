// Every planet belongs to a biome: it sets the colors of space on the way
// there, the planet's look, and what you'll meet on the journey. Weights are
// relative frequencies.
export const BIOMES = {
  home: {
    label: 'Home Port',
    palette: {
      space: '#070b1f', nebulaA: '#2b3f8f', nebulaB: '#6a3fa0', star: '#dfe8ff', light: '#fff3dd',
      rock: '#8d8478', accent: '#4fb4ff',
      planet: { a: '#2f7fd8', b: '#3fae6a', c: '#f2efe6', atmosphere: '#8fd0ff', rings: false },
    },
    stretches: { asteroids: 1, squadron: 1, drones: 0.4 },
  },
  jungle: {
    label: 'Verdant Nebula',
    palette: {
      space: '#04140f', nebulaA: '#12704f', nebulaB: '#1f8f8a', star: '#e6fff4', light: '#e8ffe0',
      rock: '#5d6a4a', accent: '#6dff9e',
      planet: { a: '#1f7a3a', b: '#57b94a', c: '#1d4f6a', atmosphere: '#9dffb8', rings: false },
    },
    stretches: { asteroids: 1, squadron: 1.2, drones: 0.6, cruiser: 0.7, mines: 0.3 },
  },
  ice: {
    label: 'Frost Rings',
    palette: {
      space: '#050c1c', nebulaA: '#3a7fc0', nebulaB: '#a8d8ff', star: '#f0f8ff', light: '#e8f4ff',
      rock: '#b8d4e6', accent: '#9fe4ff',
      planet: { a: '#d8ecff', b: '#7fb6e0', c: '#ffffff', atmosphere: '#cfefff', rings: true },
    },
    stretches: { asteroids: 1.5, squadron: 1, mines: 0.8, drones: 0.4 },
  },
  lava: {
    label: 'Ember Moon',
    palette: {
      space: '#140504', nebulaA: '#a8321a', nebulaB: '#ff8a2a', star: '#fff0e0', light: '#ffd8b0',
      rock: '#5a3a30', accent: '#ff7a3a',
      planet: { a: '#3a1a14', b: '#ff5a1f', c: '#ffc04a', atmosphere: '#ff9a5a', rings: false },
    },
    stretches: { asteroids: 1.2, drones: 1.2, squadron: 0.8, mines: 0.6, cruiser: 0.4 },
  },
  ghost: {
    label: 'Ghost Graveyard',
    palette: {
      space: '#08050f', nebulaA: '#3a1f6a', nebulaB: '#2f8a7a', star: '#e8e0ff', light: '#d8e0ff',
      rock: '#5a5670', accent: '#7affd8',
      planet: { a: '#2a2440', b: '#6a5a9a', c: '#8affd0', atmosphere: '#9affd8', rings: false },
    },
    stretches: { ghosts: 1.4, wrecks: 1.2, mines: 0.6, squadron: 0.5, asteroids: 0.4 },
  },
  gas: {
    label: 'Gas Giant',
    palette: {
      space: '#0f0a05', nebulaA: '#8a5a1f', nebulaB: '#c09a5a', star: '#fff6e0', light: '#fff0d0',
      rock: '#8a7050', accent: '#ffc85a',
      planet: { a: '#c9904a', b: '#f2d09a', c: '#8a4a2a', atmosphere: '#ffd9a0', rings: true },
    },
    stretches: { cruiser: 1.2, squadron: 1.3, drones: 0.5, asteroids: 0.6 },
  },
  crystal: {
    label: 'Crystal Expanse',
    palette: {
      space: '#0d0514', nebulaA: '#a02f8a', nebulaB: '#5a3fd0', star: '#ffe8ff', light: '#ffe0ff',
      rock: '#d08ae6', accent: '#ff7ae6',
      planet: { a: '#6a2fa0', b: '#ff8ad8', c: '#c0f0ff', atmosphere: '#ffb0f0', rings: true },
    },
    stretches: { asteroids: 1.3, drones: 1, mines: 0.7, squadron: 0.8, ghosts: 0.3 },
  },
};

export const BIOME_KEYS = ['jungle', 'ice', 'lava', 'ghost', 'gas', 'crystal'];
