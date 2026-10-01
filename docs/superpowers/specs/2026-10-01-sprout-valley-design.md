# Sprout Valley: design

A cozy top-down farming life sim for all ages. Grandpa's farm sits at the west
end of a little valley; a road leads east to a town of six villagers. Short
seven-day seasons keep progress brisk, there are no fail states, and the farm
saves every night.

## Structure

- **Map**: one 60 × 40 tile map (`src/map.js`). The farm (house, shipping
  bin, well, field, ruined greenhouse, animal pen with coop, barn and trough,
  a fishing pond and a flower meadow) and the town (store with an outdoor
  counter, bakery, workshop, five cottages, a plaza with fountain, market
  stall and community board, and a town pond ringed by eight lanterns).
  Scatter trees are seeded and kept clear of doors; a test proves every
  interactable and schedule spot is reachable.
- **Clock**: 6 am to 2 am, 0.5 s per game minute at normal speed (relaxed
  0.75 s, brisk 0.3 s). Passing 2 am sends the farmer to bed with no penalty.
  Menus and pause stop the clock.
- **Calendar**: four seasons × seven days; every season starts Monday, so
  Saturday market is always day 6. Weather is seeded per day (rain/snow water
  crops); day one and festival days stay dry.

## Simulation (DOM-free)

`World.step(dt, controls)` takes `{ mx, my, use, interact, slot, cycle,
target, interactAt }`. A target tile within reach is used directly; a far one
plans a breadth-first path and acts on arrival, so mouse, touch taps and the
bot share one code path. Menus are requested through `menu` events and
answered with methods (`ship`, `buy`, `craft`, `deliver`, `gift`,
`submitFair`, `sleep`).

Overnight (`sleep`): pay the bin, grow watered crops, animals eat from the
trough, roll the date, wither out-of-season crops, drop produce in the pen,
regrow grass tufts, reset friendship flags, then start the day (rain, sprinkler
rings, Monday requests, villagers placed for 6 am).

## Economy

Start: 500g, 15 turnip seeds, 10 hay, two chickens. Every crop ripens within a
season and pays back its seed. Upgrades: Copper Can 500g (40 water, 3 in a
row), Silver Can 1,500g (70, 3 × 3), Bigger Field 1,500g, Greenhouse 4,000g;
sprinklers 200g; cow 1,200g, goat 900g, chicken 400g. The bot farmer test
confirms a sensible player ends spring with more money and the Copper Can, and
expands the field during the first year.

## People and festivals

Six villagers with schedules (rain variants), loves/likes/dislikes, intro
lines, daily and warm (3+ hearts) dialogue. Talking gives 20 points a day, a
gift 0 to 80, a request 60; 100 points per heart, ten hearts. Festivals: Egg
Hunt (spring 4), Lantern Night (summer 5, evening), Harvest Fair (autumn 5,
judged on value plus variety), Snow Festival (winter 4, ice fishing). Taking
part without winning still earns a 50g thank-you.

## Presentation

16 px pixel art painted with `fillRect` into offscreen canvases, scaled by an
integer zoom (about 12.5 tiles across the short side). The static ground for
each season is one cached canvas; crops sway with a skew transform, ripe crops
twinkle, harvests sparkle and pop their icon. Dusk and night are a single
multiply tint plus additive glow sprites at windows, lamps and lit lanterns.
Rain streaks and snow are capped screen-space particles. Reduced motion stops
swaying, bobbing and camera easing and thins particles.

Audio is WebAudio only: a seeded step-sequencer tune per season (spring
triangle plucks, summer marimba with shaker, autumn minor-ish, winter music
box) slowed and thinned at night, a festival tune, rain bed and summer
crickets, plus per-action sound effects and villager voice blips.

## Performance

Sprite baking and season art are spread across loading frames (no frame over
about 25 ms at CPU ×4). Play holds 60 fps at CPU ×4, including rainy nights in
town. Frame telemetry uses the shared `perf.js` monitor.
