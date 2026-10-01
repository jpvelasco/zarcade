# Reel Rumble: design

A cheerful side-view fishing adventure for all ages. Cast, wait for a nibble,
hook the bite, then win a tension fight. Five waters, fifty species, a
collection book, a tackle shop with boats, and quests and tournaments from
Grandpa Gill. The only way to fail is to lose a fish.

## Scene

The screen is a cut-away: sky and far shore above, the water column below
with the bottom sloping away from the angler's dock (or boat, or ice hole).
World units are metres: `x` is the distance from shore, `y` the depth. Each
water has a bottom profile (`depthAt`), so casting farther reaches deeper
water. Depth bands: shallow (< 3 m), middle (3 to 8 m), deep (8 m and more).

| Water | Boat | Times | Weather | Notes |
| --- | --- | --- | --- | --- |
| Willow Pond | none | all | clear, cloudy, rain, fog | lily pads, fireflies at night |
| Rushing River | Red Canoe | all | clear, cloudy, rain | the lure drifts downstream |
| Coral Bay | Little Sailboat | all | clear, cloudy, rain | reef, deep drop-off |
| Frozen Lake | Snow Runner | all | clear, snow, fog | ice fishing: the meter sets the drop depth |
| Starfall Lagoon | Star Ferry Ticket | night only | clear, fog, meteor shower | glowing fish and plankton |

**Clock.** Each cast takes half an hour. Dawn 5–8, day 8–17, dusk 17–20,
night 20–5. The ⏳ button skips to the next time of day. Weather changes
every three hours and is seeded by water, day and slot, so everyone gets
the same weather on the same day. Changing time or weather rebuilds the
scene between casts.

## Fish

Fifty species, ten per water: four or five common, two or three uncommon,
two or three rare and one legendary. Each has a length and weight range,
depth bands, the times and weather it appears (or any), the bait it bites,
a fight behaviour (steady, darter, jumper, runner, heavy), a pull and
stamina, a coin value, a procedural look (shape, colours, pattern) and a fun
fact. Size rolls are skewed toward small; weight grows geometrically.

**Spawn tables** (`spawnTable(water, period, weather)`) list exactly the
fish whose time and weather match, weighted by rarity (10/5/2). Rolls take
an optional band and bait: fish that like the bait are boosted (the smell
spreads), and legendary fish have weight zero unless the Starlight Lure is
on. Five or six fish swim in the scene; new ones swim in every few seconds,
and after a few idle seconds one is spawned near the lure, in its band.

## Cast, bite and hook

- **Aim and cast.** The pointer or arrows set an aim mark; holding sweeps a
  ping-pong power meter; letting go casts to `3 + power × (rod cast − 3)`
  metres. A dotted arc previews the landing. Releasing within 5% of the aim
  is a bullseye (fish notice it sooner). On ice, power is the drop depth.
- **Waiting.** The lure sinks to the bottom (or drop depth). Every quarter
  second, swimming fish within sense range whose band is within 2 m of the
  lure may notice it: fish that like the bait approach; others sometimes
  sniff and swim off (the first sniff per species is reported, and marks it
  "seen" in the book). A tap twitches the lure (bigger sense radius); holding
  reels it in to recast. Moving lures attract more while being reeled.
- **Bite** (`bite.js`). The fish nibbles 0–5 times (by behaviour), then
  bites with a window of `0.9 s × behaviour × bait hook`. Pressing during
  the nibbles spooks it; pressing in the first 40% of the window is a perfect
  hook (the fight starts with 85% stamina); missing the window lets it steal
  a nibble. The fish swims away either way; the lure stays in the water.

## The tension fight (`fight.js`)

The fish cycles through phases chosen from its behaviour's weights: run,
dart, rest, jump (preceded by a short rise that telegraphs it) and, for
legends, a special move. Per step, with `reel` in [0, 1] and `steer` in
[−1, 1]:

- Fish pull `F = power × size × phase multiplier × (0.35 + 0.65 × stamina)`.
  Steering against the fish's run (`steer × dir < −0.25`) cuts `F` by up to
  20%, slows its run and tires it faster; steering with it adds 15%.
- Reel force `R = reel × reel power × resist`, where `resist` scales with the
  fish so a tiny fish on heavy tackle is never hopeless.
- Target tension `flex × (F + 0.7 R)`; while the fish is in the air,
  `flex × (F + 2.2 R + 0.25 power)`, so reeling a jumping fish spikes it.
  Tension eases toward the target. The rod's flex soaks up part of every tug.
- Line out while running (fish speed × stamina), in while reeling (reel speed
  × a phase factor). Running out of line adds a big tension spike.
- Stamina drains fastest with tension in the green zone, slower when low, and
  not at all when slack; a resting fish on a slack line recovers a little.
- Above 88% of line strength the snap timer fills (twice as fast above
  100%); 1.1 s snaps the line. Below the slack level (which scales with the
  fish and line) the slip timer fills unless the fish is in the air; 2.6 s
  and it wriggles free. A fish only comes out of the water once tired; a
  fresh fish at the boat makes one last dash.

**Legendary fights** have three rounds: emptying stamina in rounds one and
two starts a surge (a strong 2.4 s run) with 75% stamina back. Special moves:
Old Whiskers' *mud dive* (a long heavy pull), the River King's *rapids run*
(a current pulls line out unless you steer), the Sunburst Marlin's *tail
walk* (three jumps in a row), Frostfin's *frost bite* (line strength drops
25%, the bar frosts over) and the Starfall Koi's *starburst* (pulsing pull,
direction flips every half second). Legends only bite the Starlight Lure
(sold after ten species) and only at their own time and weather.

## Gear and economy

| Slot | Items (price) | Effect |
| --- | --- | --- |
| Rod | Willow Twig, Bamboo (90), Fiberglass (300), Carbon (800), Starlight (1800) | cast 20–56 m, flex 1.0–0.62 |
| Reel | Old Clicker, Smooth Spin (120), Gear Master (420), Tidal Pro (1000) | speed 2.6–5.4 m/s, power 6–13 |
| Line | Cotton, Mono (100), Braided (400), Dragon Silk (1100) | holds 6–24 |
| Bait | 13 baits from Wiggly Worm (free) to the Starlight Lure (600) | which fish bite, sink speed, bite window |
| Boat | Canoe (150), Sailboat (450), Snow Runner (900), Star Ferry (1500) | opens a water |

Coins per catch are `value × (0.7 + 0.6 × size) × 2` (legends a flat 600 to
800). Quests add about 3,500 coins in total, tournaments up to 1,580.

## Quests and tournaments (`quests.js`)

Twelve quests unlock in a chain (first catch, four pond species, a night
catch, a 2 kg fish, river/reef/ice/lagoon species, rain, twelve book pages,
a legend, all five legends). Event quests (night, rain) complete on the
catch that meets them; the rest read the save. Four tournaments (pond,
river, reef, ice) unlock with their water's species quest: hook five fish
(lost ones count) and beat three rivals' total weights for bronze, silver or
gold. Prizes pay only the difference when a medal improves.

## Presentation

Canvas 2D. Sky, far shore, the underwater cut-away with its bottom and
decorations, the dock or boat, cloud, glow, ray and fog sprites and every
fish sprite are baked into offscreen canvases when a scene starts, spread
over frames with a 10 ms budget. Each frame draws those plus waves, shimmer,
light rays, lily pads, ripples, reeds, rain or snow, fog, fireflies, birds,
meteors, plankton, splashes, special-move effects, the line (taut or
sagging with tension), the bobber or lure, the angler and the HUD (power
meter with aim mark, tension bar with zones, stamina and round pips, a
steering arrow by the fish). The camera follows the lure or fish on narrow
screens. Fish sprites are drawn procedurally from shape, colour and pattern
(`fishart.js`); the book reuses them as silhouettes until caught.

Audio is synthesized: a slow plucked pentatonic tune per water (softer and
slower at night), lapping-water noise, birds by day and crickets at night,
and effects for casts, splashes, nibbles, bites, hooks, reel clicks, a creak
near snapping, the snap, jumps, rounds and the catch fanfare.

Reduced motion removes screen shake and flashes and thins particles, rain,
snow and fireflies.

## Telemetry

`game.ready`, `level.start` (a scene: water, time, weather, bait),
`fish.hooked`, `level.complete` (a landed fish: species, rarity, size, coins,
fight time, hook quality, new species), `level.fail` (snapped or escaped),
`quest.complete`, `tournament.start` / `tournament.end`, `shop.buy`,
`travel` and `clock.wait`, plus the shared frame monitor (`frame.long`,
`perf.degraded`, `frame.stall`).

## Tests

`data` (counts, valid data, every band reachable), `spawn` (tables match
time and weather exactly, every fish appears somewhere, seeded rolls, legend
gating, clock and weather), `bite`, `fight` (common fish won on starter
gear, snapping, slipping, a hold-and-release policy can win, steering helps,
every fish landable with top gear, legends winnable with top gear in three
rounds with their special move and not with starter gear, determinism),
`trip` (casting, the meter, reeling in, ice drops, determinism, bait),
`catchable` (the bot catches every species end to end with some gear),
`career` (a bot angler shops, travels and fills over half the book in 260
casts), `economy`, `quests`, `progress` and `perf`.
