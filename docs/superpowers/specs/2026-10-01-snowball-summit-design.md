# Snowball Summit — design

Side-view downhill "roll and grow" arcade game: a 2D Katamari on a snowy
mountain. Slug `snowball-summit`, Canvas 2D, ES modules, no dependencies.

## Core loop

The snowball rolls downhill on its own. The player only:

- **speeds up** (Right / D / hold right half / stick right / RT),
- **brakes** (Left / A / hold left half / stick left / LT),
- **jumps** (Up / W / Space / tap / A button).

Rolling over fresh snow grows the ball (powder grows faster, ice not at all;
rolled snow leaves a packed track that does not grow again). Things up to
0.55× the ball's diameter stick to it and add their area. Things up to 1.4×
are obstacles: bumping one knocks the two newest things off the ball (they
no longer count), chips 4 % of snow, slows the ball, and sends the obstacle
tumbling out of the way, so the ball can never get stuck behind it. Jumping
over obstacles saves your things. Anything larger is scenery the ball rolls
past.

**Balloon bunches**: every third open stretch has 3–4 things floating on
party balloons, laid along the arc a full-speed jump by a ball of the planned
size takes. Rolling underneath reaches none; one well-timed jump sweeps the
bunch. With bumps this is what separates "hold speed-up" (about 29 of 36
stars) from good play (36).

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

On six slopes a friendly snow cloud with a smiling face rolls after you. Its
speed is a per-slope factor (1.1–1.25) of the ball's natural rolling speed,
slower uphill, ramping in over the first seconds, and it never falls more
than 6.5 ball widths behind, so its puffy face looms at the left edge.
Holding speed-up outruns it; a ball that never speeds up is caught a quarter
to two thirds of the way down. When a gate blocks you the Snow Pal holds the
cloud back for a moment. If it reaches you the run ends ("The Snow Cloud
caught you! It just wanted a hug.") with one-tap retry.

### Nobody gets stuck

A ball that sits still for 2.5 s without braking (in a gully, behind a rise)
gets a push from a Snow Pal until it is clear and heading downhill. A test
checks every slope finishes with no input at all.

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
  compact and deterministic. Things are named by id or by size tier (xs, s,
  m, big, huge) against each slope's planned growth curve, so what you meet
  always suits the size you're likely to be; signature things (penguins,
  igloos, yetis, the Ice Castle) are placed by name.
- Gate and bridge limits are baked from autoplayer runs: gates at 90 % of the
  smaller of a full-skill and a gentle run's size there; bridges just under
  the greedy run's size, so grabbing everything before a bridge breaks it
  (a time cost) and holding back lets you cross.
- **Endless Mountain**: chunks generated from a seed as you roll, scale and
  item palette climbing with distance, the avalanche always chasing and
  slowly speeding up. Score is distance; bests saved.
- **Daily Slope**: a finite generated slope from the local date seed (same
  day, same slope) with stars and a gentle streak counter.

### Stars

Three independent stars per slope: final **size** ≥ target, **things
collected** ≥ target, **time** ≤ par. Targets are calibrated from a
full-speed autoplayer run (size ×0.92, things ×0.85, time ×1.12) and baked
into the level data; a test checks the autoplayer still earns all three. The
daily slope's goals are computed the same way, a little each idle title
frame. Finishing a slope always unlocks the next, and finishing a peak opens
the next peak (no star gates).

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
- `src/physics.js` size-scaled constants shared by the sim and the builder.
- `src/world.js` fixed-step (120 Hz) simulation: physics, growth, items,
  gates, bridges, avalanche, Snow Pal nudge, events, stars.
- `src/autoplayer.js` driver: pushes, jumps obstacles, predicts jump arcs to
  sweep balloon bunches. Used by tests, calibration and the attract mode.
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
- Things found on a run that is restarted or abandoned still go into the
  museum (generous; the run's stars don't count).
- Endless Mountain changes peak backdrop every three chunks; all backdrops
  are baked ahead in idle title frames so the switch never hitches.
