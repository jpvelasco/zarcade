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
    {
      slug: 'comet-crush',
      title: 'Comet Crush',
      tagline: 'Smash crystal bricks. Save the constellations.',
      description: 'Bounce a comet off your paddle-ship through 36 neon breakout levels shaped like rockets, whales and cats, then take on a boss in every constellation.',
      genre: 'Arcade',
      controls: ['keyboard', 'mouse', 'touch', 'gamepad'],
      accent: '#ff4fd8',
      needsServer: true,
    },
    {
      slug: 'garden-guardians',
      title: 'Garden Guardians',
      tagline: 'Plant defenders. Shoo the bug parade. Save the picnic.',
      description: "A cozy tower defense: plant sunflower cannons, pea pods and mushroom mages along winding garden paths to stop snack-hungry bugs before they reach Grandma's picnic.",
      genre: 'Strategy',
      controls: ['mouse', 'touch', 'keyboard'],
      accent: '#8fcb60',
      needsServer: true,
    },
    {
      slug: 'moonshot-golf',
      title: 'Moonshot Mini Golf',
      tagline: 'Cartoon mini golf across the solar system.',
      description: "Putt a glowing ball through 18 whimsical holes on the Moon, Mars and Saturn's rings. Bank around sand traps, dodge rovers, ride wormholes and curve past black holes, with no timers.",
      genre: 'Sports',
      controls: ['mouse', 'touch', 'keyboard', 'gamepad'],
      accent: '#ffd35a',
      needsServer: false,
    },
    {
      slug: 'jelly-jam',
      title: 'Jelly Jam',
      tagline: "Squishy match-3. Free the reef's baby sea turtles.",
      description: 'Swap wobbly jelly critters to make striped jellies, bubble bombs and rainbow pearls across 44 levels of a winding reef map. Clear sand, crack coral and drop turtle eggs before the moves run out.',
      genre: 'Puzzle',
      controls: ['mouse', 'touch', 'keyboard', 'gamepad'],
      accent: '#4ef0d0',
      needsServer: true,
    },
    {
      slug: 'pips-peak',
      title: "Pip's Peak",
      tagline: "A sprout's bouncy climb to the sunrise.",
      description: 'Help Pip the little sprout hop up a mountain of floating islands across twelve handmade levels. Gather seeds, find three hidden golden acorns a level, and bloom flowers so a fall never costs you much.',
      genre: 'Platformer',
      controls: ['keyboard', 'touch', 'gamepad'],
      accent: '#ffd166',
      needsServer: true,
    },
  ];

  const ArcadeGames = { GAMES };

  if (typeof module !== 'undefined' && module.exports) module.exports = ArcadeGames;
  else root.ArcadeGames = ArcadeGames;
})(typeof window !== 'undefined' ? window : globalThis);
