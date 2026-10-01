# Snowball Summit — design

Side-view downhill "roll and grow" arcade game: a 2D Katamari on a snowy
mountain. Slug `snowball-summit`, Canvas 2D, ES modules, no dependencies.

## Core loop

The snowball rolls downhill on its own. The player only:

- **speeds up** (Right / D / hold right half / stick right / RT),
- **brakes** (Left / A / hold left half / stick left / LT),
- **jumps** (Up / W / Space / tap / A button).

Rolling over fresh snow grows the ball (powder grows faster, ice not at all;
rolled snow leaves a packed track that does not grow again). Things smaller
than about half the ball's diameter stick to it and add to its size. Things
up to about 1.8× the diameter are obstacles: bumping one chips off some snow,
slows the ball, and knocks the thing tumbling out of the way, so the ball can
never get stuck. Jumping over them saves the snow. Anything larger is scenery
the ball rolls past (until a later, bigger run).

Picked-up things stay stuck on the rolling ball; penguins, bunnies and birds
keep waving from inside it. Tiny things relative to the ball sink into the
snow so the ball stays readable.

### Size gates and bridges

- **Size gate**: an ice wall with a size sign. Big enough: you smash through
  (bonus burst). Too small: you bounce back and the gate's Snow Pal shovels
  snow onto you. Each bounce closes at least a third of the gap and the third
  bounce always fills it, so nobody gets stuck; it just costs time.
- **Wooden bridge**: spans a dip with a size limit. Small enough: you roll
  straight across. Too big: the planks snap and you drop into the gully
  below. The gully's far wall is lower than its near rim and gentle enough to
  climb with a push, so this is a time cost, never a dead end.

### Avalanche

On some slopes a friendly snow cloud with a smiling face rolls after you. It
moves at a fixed per-slope speed (a little slower than a ball left alone
reaches, tuned with the autoplayer) and catches up quickly if far behind so
it stays on screen as a threat. If it reaches you the run ends ("The Snow
Cloud caught you! It just wanted a hug.") with one-tap retry.

## Content

- **Three peaks, four slopes each (12 slopes).** Each peak has its own start
  size, scale, palette and item set:
  1. *Pinecone Peak* (morning): start 20 cm; pinecones, mittens, carrots,
     cocoa, birds, bunnies, lanterns, penguins.
  2. *Penguin Pass* (sunset): start 50 cm; penguins, snowmen, sleds, skis,
     reindeer, snowmobiles, igloos.
  3. *Starlight Summit* (aurora night): start 1.5 m; trees, igloos, polar
     bears, yetis, gondolas, cabins, ski lodges, balloons.
- Slopes are hand-built from a small segment DSL (slope, rise, kicker, dip,
  gate, bridge, finish) with seeded item scatter, so they are handcrafted but
  compact and deterministic.
- **Endless Mountain**: chunks generated from a seed as you roll, scale and
  item palette climbing with distance, the avalanche always chasing and
  slowly speeding up. Score is distance; bests saved.
- **Daily Slope**: a finite generated slope from the local date seed (same
  day, same slope) with stars and a gentle streak counter.

### Stars

Three independent stars per slope: final **size** ≥ target, **things
collected** ≥ target, **time** ≤ par. Targets are calibrated from the
autoplayer's run (size ×0.9, items ×0.8, time ×1.15) and baked into the level
data; a test checks the autoplayer still meets them. Finishing a slope always
unlocks the next, and finishing a peak opens the next peak (no star gates).

## Sticky hooks

- Peak map with stars per slope and per-slope personal bests (size, things,
  time) with a "New best!" moment.
- **Museum**: every collectible thing type (30) as a silhouette until found,
  with counts and a one-line blurb.
- **Wardrobe**: unlockable ball skins (Snowy, Beach Ball, Cookie Dough,
  Watermelon, Disco, Starlight) and hats (Beanie, Party Hat, Top Hat,
  Earmuffs, Propeller Cap, Crown) unlocked by stars, museum entries, daily
  slopes and endless distance. Skins are textures on the rolling ball, hats
  stay upright on top.
- Daily slope with streak; endless best distance on the title.
- One-tap restart: R in play, primary "Roll again" on fail/results.

## Architecture

- `src/rng.js` seeded RNG and date seed.
- `src/items.js` item catalog (DOM-free).
- `src/terrain.js` heightfield builder from segments (appendable for
  endless), ground queries, ball support/contact, bridges, gates.
- `src/levels.js` peaks, the 12 slopes, daily and endless generators.
- `src/world.js` fixed-step (120 Hz) simulation: physics, growth, items,
  gates, bridges, avalanche, scoring, events, stars.
- `src/autoplayer.js` heuristic driver (jumps obstacles, pushes for time,
  brakes before pickups it would overshoot). Also the title attract mode.
- `src/progress.js` save (`snowball-summit.v1`), results, unlocks, museum,
  streak.
- Browser-only: `sprites.js` (baked item/skin/hat canvases), `render.js`,
  `audio.js` (WebAudio SFX and music-box loops), `input.js`, `main.js`.

Physics is scaled by ball size (gravity and top speed grow sub-linearly with
diameter) so a 20 cm ball and a 15 m ball both feel lively; the camera zooms
out as the ball grows.

## Design calls made without input

- Obstacles tumble away on contact instead of blocking (no soft-locks in a
  one-lane side view).
- Gates use the Snow Pal top-up; bridges drop you into a climbable gully.
- Only the avalanche can end a run. Slopes without it always finish.
- Each slope starts at its peak's start size (so stars are about that run,
  not carried-over growth).
