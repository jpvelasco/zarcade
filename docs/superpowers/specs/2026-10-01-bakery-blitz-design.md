# Bakery Blitz — design spec

*Slug* `bakery-blitz` · *Genre* Time management · *Shelf* Strategy & Sports ·
*Accent* `#ff9d4d` · *Needs server* yes (ES modules)

## Pitch

A cheerful small-town bakery. Customers wander in, sit down and ask for cocoa,
pretzels, cupcakes, jam tarts and layer cakes. You tap stations to mix, bake
and decorate, pull things out of the oven before they go crispy, then hand
them over. Serve fast for combo tips. Customers show patience as hearts and,
when the hearts run out, they wave and say "maybe tomorrow" — nobody ever
yells, and nothing is ever a hard loss.

## The loop (one day = one shift)

1. A day has a fixed, deterministic customer script: who arrives, when, and
   what they order.
2. Each ordered dish is a **ticket** on a rail across the top of the kitchen.
3. **Tap a station** to make it do the next sensible thing:
   - a station holding a *finished* item passes it along its recipe (to the
     next station, or to the display counter when the recipe is done);
   - an idle station with a free slot starts the most urgent ticket it can
     begin (or the ticket the player selected);
   - otherwise a soft bonk, and the station that *is* blocking flashes.
4. **Tap the counter** (or press Space) to serve the best match: the plated
   dish that the longest-waiting, lowest-patience customer is waiting for.
5. The day ends when the last customer has left or the clock runs out. You
   keep every coin either way.

Two taps per step is deliberate: starting a thing and moving it on are the two
decisions, and the counter is a buffer you can bake into ahead of a rush.

### Stations and recipes

| Station | Role | Base time |
| --- | --- | --- |
| Mixing bowl | starts dough/batter | 2.2 s |
| Oven | bakes, can go crispy | per recipe |
| Icing bench | frosting | 1.8 s |
| Jam pot | fruit filling | 2.4 s |
| Cocoa pot | brews cocoa (a start station) | 3.0 s |
| Decorating table | sprinkles and toppers | 2.6 s |
| Juice press | smoothies (a start station) | 2.2 s |

| Recipe | Steps | Coins |
| --- | --- | --- |
| Hot Cocoa | cocoa | 8 |
| Pretzel | mixer → oven 3.2 s | 12 |
| Berry Smoothie | juice | 14 |
| Cupcake | mixer → oven 3.4 s → icing | 18 |
| Jam Tart | mixer → jam → oven 3.6 s | 22 |
| Cookie Box | mixer → oven 3.0 s → decor | 26 |
| Layer Cake | mixer → oven 4.6 s → icing → decor | 34 |
| Daily Special | date-seeded 3-step chain | 40 |

### The oven, gently

A baked item is **perfect** for a hold window (4 s, +2.5 s with the
Thermostat upgrade), then scorches over the next 4 s and stops at **crispy**.
Crispy is not a failure: it still serves, for half coins and no combo step.
Chapter 1 ovens never scorch at all; chapter 2 introduces it with a tutorial
line.

### Patience, tips, combos

- Patience runs from 1 to 0 over the day's `patience` seconds, scaled by the
  customer kind and the Comfy Chairs upgrade. Hearts shown = `ceil(p × 3)`.
- Patience drains 40 % slower once at least one of a customer's dishes is in
  progress, so starting an order visibly reassures them.
- A serve pays `value × payMult × qualityMult × tip × combo`:
  tip is ×1.6 at three hearts, ×1.3 at two, ×1.0 at one.
- Serving within 3.5 s of the last serve steps the combo up, to ×1.5 at five
  in a row. Crispy serves neither raise nor reset it.
- A customer whose hearts empty leaves with a wave. No penalty beyond the
  coins you did not earn.

## Progression

- **45 days across 5 chapters** (9 days each). Each chapter adds a station, a
  recipe and a regular:
  1. *Cozy Mornings* — cocoa, pretzels. No scorching. Teaches the loop.
  2. *Cupcake Corner* — icing bench, cupcakes, the oven timer. Regular:
     **Barnaby** the sleepy bear (very patient, big order, tips well).
  3. *Jam & Jitters* — jam pot, jam tarts. Regular: **Nutmeg** the hurried
     squirrel (tiny patience, one item, double tip).
  4. *Layer Cake Lane* — decorating table, cookie boxes and layer cakes.
     Regular: **Mayor Maple** the moose (four items, pays 1.5×).
  5. *Festival Finale* — juice press, smoothies, every recipe, festival
     rushes. Regulars: **Pip & Posy**, twin bunnies with one long order.
- Stars per day from coins earned, thresholds a per-chapter fraction of the
  day's *par* (every dish perfect, three hearts, no combos). Chapter 1 is very
  forgiving; chapter 5 is tight.
- Clearing a day (1+ stars) unlocks the next. Coins always bank, even on a
  zero-star day, so a retry is always a stronger retry.
- **Gentle assist**: after two attempts at a day without a star, the day is
  offered with `assist` — +15 % time and +25 % patience, and a friendly note
  that Flour the mouse is lending a hand. The player never gets stuck.

## Upgrades (coins, visible in the shop)

Four branches, each a short tier chain, all cosmetic *and* mechanical:

- **Oven** — Oven Mitts I/II (faster bake), Thermostat (longer perfect
  window), Second Oven (a whole new oven appears).
- **Counter** — Bigger Counter I/II (3 then 4 display slots), Window Flowers
  (cosmetic, appears in the window).
- **Speed** — Quick Mixer I/II, Sprinkle Jar (faster icing and decor),
  Second Mixing Bowl.
- **Front of house** — Comfy Chairs (patience drains slower), Jukebox
  (+10 % tips, appears on the wall), Helper Mouse (auto-serves a matching
  dish from the counter every few seconds; a mouse runs across the shop).

## Sticky hooks

1. **Chapter map** with per-day stars and a chapter banner.
2. **Upgrade tree** with coins, and every purchase shows up in the shop art.
3. **Three daily orders** (missions), date-seeded, with coin rewards and an
   "all three" bonus.
4. **Today's Special** — a date-seeded recipe and bonus shift, playable any
   time, but the bonus coins and the streak only bank once a day. A gentle
   streak counter.
5. **Recipe book** collection, silhouettes for recipes not yet served, plus
   the names of the specials you have tasted.
6. **Personal bests** per day, with a "New best!" moment on the results
   screen, and total coins/stars on the title.

No ads, no nagging timers, no paid currency, no guilt.

## Controls

- **Mouse / touch** — tap a station, the counter, a ticket chip, a customer.
- **Keyboard** — `1`–`9` stations in the order they appear, `Space`/`Enter`
  serve, `←`/`→` pick a ticket, `Esc`/`P` pause, `M` mute.
- **Gamepad** — d-pad moves a cursor over stations, A acts, Start pauses.
- Touch targets ≥ 56 px; portrait phone layout stacks customers over
  stations with no page scroll.

## Code layout

```
src/rng.js        seeded mulberry32 + hashSeed
src/recipes.js    stations, recipes, customer kinds        (DOM-free)
src/upgrades.js   upgrade tree and the effects it computes  (DOM-free)
src/levels.js     chapters, 45 day specs, buildDay()        (DOM-free)
src/sim.js        the shift simulation and scoring          (DOM-free)
src/daily.js      date-seeded special + daily orders        (DOM-free)
src/progress.js   save, stars, coins, book, missions        (DOM-free)
src/ai.js         autoplayer policy                        (DOM-free)
src/perf.js       copied frame monitor
src/sprites.js    baked offscreen art
src/render.js     canvas drawing (reads state, never writes)
src/audio.js      WebAudio sfx and a little kitchen groove
src/main.js       screens, input, loop, wiring
```

## Tests

`node --test 'games/bakery-blitz/tests/*.test.js'`

- `recipes.test.js` every recipe's chain uses known stations and ends somewhere.
- `levels.test.js` 45 days in order, every day's stations cover its recipes,
  par coins positive, star thresholds ascending, customers arrive inside the
  clock.
- `sim.test.js` tap rules, oven scorching, patience, tips, combos, serving,
  determinism from a seed.
- `upgrades.test.js` costs, prerequisites, effect maths.
- `progress.test.js` save round-trip, stars/bests only go up, assist after two
  starless attempts, recipe book.
- `daily.test.js` same date → same special and orders; different dates differ.
- `autoplay.test.js` the autoplayer at a child's tapping pace three-stars days
  1–12 on several seeds, clears every one of the 45 days with at least a star,
  and needs the pro pace plus upgrades to three-star the finale.
- `perf.test.js` the shared frame-monitor test.

## Decisions taken without asking

- Serving auto-matches instead of asking the player to aim, because aiming is
  the part a 7-year-old fumbles; the interesting decisions are *what to start*
  and *when to pull the oven*.
- Days are scripted from a seed rather than hand-authored, so 45 days stay
  balanced and testable; the day spec tunes pacing, order size and regulars.
- Star thresholds are fractions of a computed par instead of hand-written
  numbers, so a tuning pass changes one table.
- Burnt food is "crispy", worth half, never binned, so a bad oven moment costs
  a little money instead of a life.
