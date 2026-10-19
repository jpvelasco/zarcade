# Snowball Summit

A side-view downhill "roll and grow" game, like a 2D Katamari on a snowy
mountain. Your snowball rolls by itself. Speed up, brake and jump to scoop up
everything smaller than you: pinecones, mittens, penguins (who wave from
inside the ball), sleds, igloos, cabins and, one day, the Ice Castle. Things
bigger than you knock snow off, so jump over them until you're big enough.

- **Three peaks, twelve slopes**: Pinecone Peak (morning), Penguin Pass
  (sunset) and Starlight Summit (aurora night). Each slope has three stars:
  final **size**, **things collected** and **time**.
- **Size gates** (ice walls) only open for a big enough ball. Too small? The
  Snow Pal on top shovels snow onto you, so you always get through, just
  slower.
- **Wooden bridges** only hold a small enough ball. Too heavy and the planks
  snap: you drop into the gully below and climb out the other side.
- **The Snow Cloud**, a friendly avalanche, chases you on some slopes. If it
  catches you it just wants a hug, and you roll again with one tap.
- **Endless Mountain**: a seeded mountain that keeps going, bigger and
  faster, until the Snow Cloud hugs you. Best distance is saved.
- **Daily Slope**: a fresh slope from today's date, the same for everyone
  today, with a gentle streak counter.
- **Snow Museum**: every thing you've ever rolled up, with silhouettes for
  the ones still out there.
- **Wardrobe**: ball skins (Snowy, Beach Ball, Cookie Dough, Watermelon,
  Disco, Starlight) and hats (Beanie, Party Hat, Top Hat, Earmuffs,
  Propeller Cap, Crown), unlocked by stars, museum finds, daily slopes and
  endless distance.

## Controls

| | Keyboard | Mouse / touch | Gamepad |
| --- | --- | --- | --- |
| Speed up | → or D | hold the right half | stick / d-pad right, RT |
| Brake | ← or A | hold the left half | stick / d-pad left, LT |
| Jump | Space, ↑ or W | tap anywhere | A, B or d-pad up |
| Restart | R | Pause → Roll again | Select |
| Pause | Esc or P | ❚❚ button | Start |
| Mute | M | 🔊 button | |

Menus work with arrow keys, Enter, and the gamepad d-pad with A / B.

## Running

ES modules, so it needs the dev server:

```sh
npm run serve
# http://localhost:8000/games/snowball-summit/
npm test
```

## Files

- `src/world.js` simulation: size-scaled physics, growth, pickups, bumps,
  gates, bridges, the Snow Cloud, the Snow Pal nudge, stars. DOM-free and
  deterministic (fixed 120 Hz steps).
- `src/terrain.js` heightfield built from segments (slope, rise, kicker,
  dip, gate, bridge, finish), ball contact queries, snow consumption.
- `src/levels.js` peaks, the 12 slopes (written in size tiers against a
  planned growth curve), baked star goals and gate/bridge limits, the daily
  and endless generators.
- `src/items.js` the 30 collectible things. `src/progress.js` saves, bests,
  museum, unlocks, streak. `src/autoplayer.js` the autoplayer (tests,
  calibration, title attract mode). `src/rng.js` seeded randomness.
- Browser only: `src/main.js` screens and loop, `src/render.js` canvas
  renderer, `src/sprites.js` baked art, `src/audio.js` WebAudio sound and
  music, `src/input.js` controls, `src/perf.js` frame telemetry.

Save data lives in `localStorage` under `snowball-summit.v1`.

## Debug URL parameters

- `?slope=2-3` start a slope directly.
- `?daily`, `?endless` (with `&seed=word` for a fixed endless mountain).
- `?autoplay` let the autoplayer drive.
- `?reduced` force reduced motion.
