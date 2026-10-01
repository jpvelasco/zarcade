# Neon Nighthawk: presentation and performance redesign

Players reported the game "sort of froze" and that it looked plainer than
the other arcade games. The old renderer redrew every block, sign, trail
segment, spark and vehicle each frame with `shadowBlur`, built radial
gradients per lit block per frame, and churned colour strings. With
Chrome's GPU canvas (an M2 Pro) that hides behind the GPU; on machines that
raster on the CPU it cost 55–68 ms a frame at a 2× pixel ratio and about
300 ms under 4× CPU throttling.

The simulation is unchanged: rendering, audio and HUD still only read the
world, and Shift Codes still rebuild the same city, jobs, traffic and weather.

## Rendering

- **Baked blocks.** Each block is drawn once into an offscreen sprite, dark
  (HALO's curfew) and again lit, at the current device pixels per world unit.
  Sprites live in an LRU cache (`src/cache.js`) capped at about 48 MB, but
  never fewer than the view needs. Blocks are blitted at whole device-pixel
  positions, the cheapest path a canvas has. A light-up crossfades the two
  sprites with a warm flash.
- **Spread-out baking.** Each frame has a baking budget. A sprite the frame
  needs is always allowed once; spare time pre-bakes lit versions of blocks
  beside the bike or about to light, so a drop-off does not hitch. During a
  window resize, old sprites are drawn scaled until the size settles.
- **Glows without `shadowBlur`.** Glows are queued and drawn in device pixels
  from radial sprites baked at the exact size (snapped to a few steps), with
  additive blending. Lines, signals, sparks, puddles and trails are batched
  into a handful of paths. The vignette is a CSS layer.
- **Quality scaler** (`src/quality.js`). The mean frame time over 30 frames
  steps quality down after 1.2 s above 21 ms, and tries one step up after
  7 s below 17.6 ms. An upgrade that has to be undone doubles the next wait.
  Levels cap the pixel ratio (2, 1.5, 1, 0.75) and trim rain, glows,
  particles, puddles, lanterns and signal glows; the lower levels also drop
  CSS `backdrop-filter`. Changes are logged as `render.quality`.
  `?quality=` pins a level.
- **Minimap** redraws at about 15 Hz. HUD text and styles are written only
  when they change.

## Look and feel

Deterministic scenery (`src/scenery.js`) gives every block one or two
buildings seen from just above the street, with a lit facade of windows and a
rooftop: gardens with fairy lights, solar panels, water tanks, vents and
antennas, helipads, courtyard pools. Lit roofs mix warm terracotta, teal and
plum into the district's cool hues. Lamps at lot corners cast warm pools.
Festival lantern strings cross mid-block streets and some intersections; they
pop alight in sequence when a neighbouring block lights. Wet districts get
puddles that pick up the lights.

The bike leans into turns, leaves afterimages while dashing and spray while
drifting. Sparks, stops, catches and deliveries burst into sparkles, rings
and confetti from a capped pool (`src/particles.js`). Impacts and scans shake
the view a little. Drones, the runaway robot and the cat are friendlier baked
sprites. Finishing a district's last job sends a light wave across the whole
city, then fireworks.

`prefers-reduced-motion` turns off shake, lean, lantern sway, pops and sign
flicker, and slows rain and fireworks.

## Audio

`src/music.js` holds one mellow loop per district plus a menu tune, as data:
chords, arpeggio, bass, drums and a lead line. `stepEvents` turns a sixteenth
note into notes, and tests check every pattern. `src/audio.js` plays them
with detuned saw pads, a soft echo on the arpeggio and lead, and gentle
drums. Radio chatter ducks the music, and the pause menu dips it.
Effects and music have separate buses and switches (`save.muted`,
`save.musicMuted`); older saves carry their one mute choice to both. M mutes
or unmutes both. Hidden tabs suspend the audio context.

## Measurements

These were measured with headless Chrome over CDP at 1366×860, 2× pixel
ratio, on autopilot. Software-raster runs used `--disable-gpu`, flushing
each frame with a one-pixel read.

| Case | Before | After |
| --- | --- | --- |
| GPU, frame JS, lit | 1.1–1.2 ms, some 33 ms frames | 0.7–0.9 ms, steady 16.7 ms |
| Software, high, lit | 57–68 ms | 9–10 ms (60 fps) |
| Software, CPU ×4, lit | 300–310 ms | auto settles to low: 11–12 ms (60 fps) |
