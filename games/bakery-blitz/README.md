# Bakery Blitz

A cheerful time-management game. Customers wander into a small-town bakery and
ask for cocoa, pretzels, cupcakes, jam tarts and layer cakes. Tap stations to
mix, bake and decorate, pull things out of the oven before they go crispy, then
hand them over. Serve fast for combo tips. Nobody ever yells, and running out
of time is never a loss — you keep every coin you earned.

Needs `npm run serve` (ES modules).

## How to play

1. A customer sits down and a speech bubble shows what they want.
2. **Tap a station** and it does the next sensible thing:
   - starts the most urgent order it can begin, or
   - passes a finished item along the recipe (watch for the 🔔), or
   - puts a finished dish in the display case.
3. **Tap the display case** (or press Space) to hand the next dish to whoever
   is closest to leaving. Tapping a customer serves that customer.
4. Serve again within 3.5 seconds and the tip combo climbs, up to ×1.5.

Hearts are patience, not anger. When a customer's hearts run out they wave and
say "maybe tomorrow" — you lose the coins, nothing else. A bake left in the
oven turns **crispy**: it still sells, for half, and nothing is ever binned.

### Recipes

| Dish | Stations | Coins |
| --- | --- | --- |
| Hot Cocoa | cocoa pot | 8 |
| Pretzel | mixer → oven | 12 |
| Berry Smoothie | juice press | 14 |
| Cupcake | mixer → oven → icing | 18 |
| Jam Tart | mixer → jam pot → oven | 22 |
| Cookie Box | mixer → oven → decorating table | 26 |
| Layer Cake | mixer → oven → icing → decorating table | 34 |
| Today's special | changes every day | 40 |

Work only ever flows one way through the kitchen, so two recipes can never jam
each other.

## Controls

| | |
| --- | --- |
| Mouse / touch | tap a station, the case, a customer, or an order chip |
| `1`–`9` | the stations, left to right |
| `Space` / `Enter` | serve the next dish |
| `←` `→` | choose which order to start next |
| `Esc` / `P` | pause |
| `M` | sound on/off |
| Gamepad | d-pad picks a station, A works it, X/B serves, Start pauses |

Picking an order is optional: left alone, a station always starts the order of
whoever is closest to leaving.

## Progression

- **45 days across five chapters.** Each chapter adds a station, a recipe and a
  regular: Barnaby the sleepy bear, Nutmeg the hurried squirrel, Mayor Maple,
  and the twins Pip & Posy.
- **1–3 stars a day**, from the coins you earn. One star opens the next day.
- **Coins always bank**, even on a day with no stars, so every retry is a
  stronger retry. After two starless tries a day comes back kinder: more time,
  more patience, and a note saying Flour is lending a hand.
- **The kitchen shop**: fifteen upgrades across four branches. Every one of
  them shows up in the shop — a second oven, a wider case, armchairs, bunting,
  flowers in the window, a jukebox, and Flour the helper mouse.
- **Today's special**: a recipe named from the date, plus a bonus shift. The
  first finish each day keeps a streak alive.
- **Today's orders**: three jobs from the notice board, also from the date,
  paid in coins, with a bonus for all three.
- **The recipe book** collects recipes, the regulars you have met and every
  special you have tasted. What you have not found yet shows as a silhouette.

## Files

```
index.html        screens: title, map, kitchen shop, recipe book, play
style.css
src/recipes.js    stations, recipes, customers           (DOM-free)
src/upgrades.js   the upgrade tree and its numbers       (DOM-free)
src/levels.js     chapters, 45 day specs, buildDay()     (DOM-free)
src/sim.js        one shift: tapping, baking, serving    (DOM-free)
src/daily.js      date-seeded special and daily orders   (DOM-free)
src/progress.js   save, stars, coins, book, streak       (DOM-free)
src/ai.js         the autoplayer                         (DOM-free)
src/rng.js        seeded mulberry32
src/perf.js       shared frame monitor
src/sprites.js    all the art, baked into offscreen canvases
src/render.js     drawing (reads the shift, never writes to it)
src/audio.js      Web Audio sound and a kitchen waltz
src/input.js      key map and gamepad
src/main.js       screens, input, the frame loop
tests/            node:test files
```

## Debug parameters

| | |
| --- | --- |
| `?day=30` | start that day straight away |
| `?special` | start today's special shift |
| `?map` | open the day map |
| `?autopilot` | the autoplayer plays for you (also `?demo`) |
| `?date=2026-12-25` | pretend it is another day, for the special and the orders |

`window.BB` exposes the shift, the plan, the view and the save for poking at
from the console. `BB.setAutopilot(true)` hands over mid-shift.

## Tests

```sh
node --test 'games/bakery-blitz/tests/*.test.js'
```

The autoplayer tests are the balance check: a child's tapping pace
(1.8 taps a second) must three-star the first twelve days and finish all 45
with at least one star, while the finale only gives three stars to a practised
pace with an upgraded kitchen.

Saves live under `localStorage` key `bakery-blitz.v1`.
