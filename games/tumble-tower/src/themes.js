// Cosmetic themes: sky, sea, island and decorations. Unlock rules read the
// save; they never change how the tower behaves.
const stars = (save) => save.stars.reduce((a, b) => a + (b || 0), 0);

export const THEMES = [
  {
    id: 'sunny', name: 'Sunny Isles', hint: 'Always open',
    sky: ['#8fd8ff', '#c9efff', '#fff6d8'], high: ['#3b6fd8', '#6aa8ff', '#a9dcff'],
    sea: ['#3fb6e8', '#1f7fc4'], foam: '#e9fbff',
    ground: { top: '#7ed957', edge: '#4fae3a', rock: '#c99a6a', rockDark: '#94673f' },
    decor: 'clouds', goal: '#ff5e7a', ui: '#ff8a3d',
    unlock: () => true,
  },
  {
    id: 'candy', name: 'Candy Clouds', hint: 'Earn 15 ★',
    sky: ['#ffb3df', '#ffd6ec', '#fff0d6'], high: ['#b96cff', '#e6a1ff', '#ffc4ec'],
    sea: ['#ff8fc7', '#e0569d'], foam: '#fff0f8',
    ground: { top: '#fff2f8', edge: '#ff9ccc', rock: '#a8653e', rockDark: '#7a4527' },
    decor: 'candy', goal: '#7a3cff', ui: '#ff5fae',
    unlock: (save) => stars(save) >= 15,
  },
  {
    id: 'jungle', name: 'Jungle Canopy', hint: 'Earn 40 ★',
    sky: ['#9be3b0', '#cff5c6', '#f6ffd8'], high: ['#2f8f6a', '#59c48a', '#a6e8a8'],
    sea: ['#3fbfa6', '#1d8c7a'], foam: '#e6fff4',
    ground: { top: '#4cc24a', edge: '#2e8a35', rock: '#7f8c6a', rockDark: '#56604a' },
    decor: 'jungle', goal: '#ff7a1a', ui: '#2fae5a',
    unlock: (save) => stars(save) >= 40,
  },
  {
    id: 'space', name: 'Star Station', hint: 'Reach 25 m in Endless or clear Summit Isle',
    sky: ['#1b1446', '#2c1f6b', '#4a2f8f'], high: ['#05031a', '#0e0a33', '#1b1446'],
    sea: ['#5b3fd1', '#2a1a7a'], foam: '#c9b8ff',
    ground: { top: '#b8c4d8', edge: '#7b88a6', rock: '#5a5f7a', rockDark: '#3b3f57' },
    decor: 'space', goal: '#5ef2ff', ui: '#7a5cff',
    unlock: (save) => save.endlessBest >= 25 || (save.stars[31] || 0) > 0,
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
