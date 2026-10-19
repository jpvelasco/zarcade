# Pocket Zoo

A cozy zoo-builder tycoon. Hatch mystery eggs to discover 42 plush animals,
build and upgrade habitats, pet and feed your animals for a Joy bonus, and
watch visitors stroll the paths dropping coins. Open five more biomes after
the Sunny Meadow: Savanna, Jungle, Ocean Bay, Arctic and the Night House.
There is nothing to lose and no timers to beat.

## Play

Pocket Zoo loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/pocket-zoo/
```

## Controls

| Input | What it does |
| --- | --- |
| Drag / WASD / arrow keys | Look around the zoo |
| Mouse wheel, pinch, + / − | Zoom |
| Click or tap an animal | Pet it (hearts and Joy) |
| Click or tap a habitat, plot or locked lot | Open it: snack, upgrade, build or unlock |
| Q / E (or Tab / Shift+Tab) | Pick a habitat; Enter opens it |
| X / F / U | Pet, snack or upgrade the picked habitat |
| G / T / B / C | Eggs, keeper tasks, collection book, decorations |
| O | Jump to the next biome to open |
| Space / Enter (hatching) | Tap the egg; three taps hatch it |
| Esc / P | Pause (Back to arcade lives here); Esc also closes menus |
| M | Mute |

The tool bar (Eggs, Tasks, Book, Decor) and all menus work with touch, mouse
and keyboard (arrow keys move between buttons).

## How it works

- **Eggs** cost coins (the price climbs a little each time, then stops). Each
  biome has three common, two uncommon, one rare and one legendary animal.
  Unfound animals turn up more often, a rare or better is guaranteed within
  seven eggs and the legendary within twenty. Repeats add ★ stars (max 5,
  +20% coins each).
- **Habitats**: three plots per biome, five levels (room for 2, then 3; more
  coins per level). New animals move in by themselves, or wait for a home.
- **Joy**: petting (free) and snacks add up to +50% coins; it fades back
  gently. Animals are never sad.
- **Visitors** come in from the gate and pop coins over the habitats they
  watch. A golden balloon visitor sometimes visits: tap them for a tip.
- **Daily Star Egg**: free once a day (never common) with a streak gift.
- **Keeper tasks**: three at a time; claim for coins or gift eggs.
- **Zoo ranks**: eight ranks from Tiny Zoo to Legendary Zoo; each gives a gift egg.
- **Decorations**: twelve, shown on the map, each adds to all coins.
- **Away earnings**: a welcome-back bonus. Keepers earn 40% of your base rate
  (no Joy) for the first 15 minutes away, then a slow trickle, for up to 6
  hours, and never more than 10 minutes of base income. A night away is worth
  a few minutes of play, not a jump of several tiers.

Saves live in `localStorage` under `pocket-zoo.v1` every few seconds and
whenever you leave.

## Files

| File | Responsibility |
| --- | --- |
| `src/data.js` | Biomes, animals (with their looks and facts), habitats, decorations, ranks |
| `src/rng.js` | Seeded random numbers |
| `src/economy.js` | Income, prices, Joy, offline earnings, number formatting |
| `src/eggs.js` | Egg rolls, pity, daily egg and streaks |
| `src/tasks.js` | Keeper task generation and progress |
| `src/zoo.js` | The zoo simulation and all player actions |
| `src/map.js` | Zones, plots, decoration spots, roads and hit testing |
| `src/actors.js` | Wandering animals and visitors |
| `src/bot.js` | Greedy keeper for balance tests, the title demo and `?autopilot` |
| `src/save.js` | Save and load |
| `src/sprites.js` | Plush animal painter, visitors, decorations, eggs |
| `src/scenery.js` | The baked ground: grass, roads, zones, habitats and fences |
| `src/render.js` | Camera, signs, y-sorted drawing and particles |
| `src/hatch.js` | The egg hatching scene |
| `src/audio.js` | Synthesized sound effects and music |
| `src/input.js` | Pointer, touch, wheel and keyboard |
| `src/ui.js` | DOM menus and HUD |
| `src/main.js` | Screens, frame loop, saves and telemetry |
| `src/perf.js` | Frame-time telemetry (shared with the other games) |

Everything from `data.js` to `save.js` is DOM-free.

## Debug parameters

- `?fresh` delete the save first; `?seed=7` seed for a new zoo
- `?play` skip the title; `?autopilot` the bot keeper plays by itself
- `?coins=5000` add coins; `?reduced` force reduced motion

`window.PZ` exposes the zoo, actors, renderer and UI in the console.

## Tests

```sh
node --test 'games/pocket-zoo/tests/*.test.js'
```

Covers data validity, income and prices, offline earnings (cap, short and
backwards gaps), egg determinism, pity and full collections for every biome,
daily eggs and streaks, building, upgrading, waiting animals, Joy, decor,
tasks, ranks, save/load and repair, map reachability and hit testing, visitor
and animal behaviour, and bot keepers that check the pacing.
