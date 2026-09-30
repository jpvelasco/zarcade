// The arcade's game list. Each entry describes one folder in games/. The
// browser loads this as window.ArcadeGames; Node tests require it.
(function (root) {
  'use strict';

  const GAMES = [
    {
      slug: 'glowloop',
      title: 'Glowloop',
      tagline: 'Lasso the fireflies. Light up the night.',
      description: 'Draw loops around glowing fireflies, match their colors for big Harmony combos, and dodge the prickly thornbugs.',
      genre: 'Chill',
      controls: ['mouse', 'touch'],
      accent: '#ffd35c',
      needsServer: false,
    },
    {
      slug: 'neon-nighthawk',
      title: 'Neon Nighthawk',
      tagline: 'Hover-bike courier after curfew.',
      description: 'Drift a hover-bike through the rain-slick city of Vanta, dodge patrol drones, and deliver the packages that keep the lights on.',
      genre: 'Action',
      controls: ['keyboard', 'touch', 'gamepad'],
      accent: '#3fe5ff',
      needsServer: true,
    },
    {
      slug: 'sundown-rally',
      title: 'Sundown Rally',
      tagline: 'Race the sunset. Outrun the undead.',
      description: 'Tear down winding desert tracks at dusk in a 3D jeep, plow through cartoon zombies, and hit the ramps for big air.',
      genre: 'Racing',
      controls: ['keyboard', 'touch', 'gamepad'],
      accent: '#ff8a3d',
      needsServer: true,
    },
    {
      slug: 'starhopper',
      title: 'Starhopper',
      tagline: 'Hop across an endless galaxy.',
      description: 'Fly a jet fighter from planet to planet, blast the Obsidian Armada, and grab a snack at the Space Burger drive-thru.',
      genre: 'Action',
      controls: ['keyboard', 'mouse', 'touch', 'gamepad'],
      accent: '#8f7bff',
      needsServer: true,
    },
  ];

  const ArcadeGames = { GAMES };

  if (typeof module !== 'undefined' && module.exports) module.exports = ArcadeGames;
  else root.ArcadeGames = ArcadeGames;
})(typeof window !== 'undefined' ? window : globalThis);
