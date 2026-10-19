# Sprout Valley

A cozy little farming life. Till Grandpa's old field, grow crops through four
short seasons, raise chickens, cows and a goat, make friends in town and win
every festival. There is no way to lose: days end when you sleep, and the farm
saves every night.

## Play

Sprout Valley loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/sprout-valley/
```

## Controls

| Input | What it does |
| --- | --- |
| WASD / arrow keys | Walk |
| Space | Use the selected tool or item on the tile you face (harvests ripe crops too) |
| E / Enter | Talk, open, harvest or pick up (never uses a tool) |
| 1 to 9, Q / Tab, mouse wheel | Pick a tool belt slot |
| Mouse click | Use the tool on that tile; far tiles: walk there first |
| Right click | Talk / interact with that tile |
| I / 🎒 | Bag (put seeds, sprinklers and decorations on belt slots 6 to 9) |
| J / 📔 | Journal: goals, collection, friends, calendar |
| Esc / P | Pause (Back to arcade lives here) |
| M | Mute |
| Touch | Left stick walks, **Use** and **💬** buttons, tap a tile like a click |
| Gamepad | Stick / d-pad walk, **A** use, **X** talk, **LB/RB** belt, **Y** bag, **Back** journal, **Start** pause |

## The farm life

- **Crops** need tilled soil and water every day (rain and snow water them).
  Each crop has its seasons; out-of-season plants wither at the season change.
  Strawberries, tomatoes, blueberries, corn and cranberries regrow.
- **Seasons** are seven days long, Monday to Sunday. A year is 28 days.
- **Selling**: the shipping bin pays overnight; the Saturday market stall in
  the plaza pays 25% more on the spot.
- **Animals**: fill the hay trough in the pen; each animal eats one hay a
  night and leaves an egg or milk in the morning. Pet them daily for hearts.
  Cut grass tufts with the scythe for free hay.
- **Kitchen** (farmhouse door): jam, cheese, goat cheese, bread, pumpkin pie,
  omelette and garden soup sell for more than their ingredients.
- **Store** (town, 8 am to 8 pm): seeds, hay, sprinklers, animals,
  decorations, the Copper and Silver watering cans, a bigger field and the
  greenhouse (any crop, any season, no watering).
- **Villagers**: Mabel, Bram, Juniper, Rowan, Clementine and Sol walk daily
  schedules. Chat once a day and give one gift a day; their reactions are
  remembered in the journal.
- **Community board**: three requests each season, paying better than the bin.
- **Festivals**: Spring Egg Hunt (find 8 of 12 eggs), Summer Lantern Night
  (light 8 lanterns), Harvest Fair (show three items; variety wins), Snow
  Festival (catch 3 fish from the frozen town pond). Each prize includes a
  decoration.
- **Journal**: 30 goals, plus a collection of 15 crops, 9 fish, 10 critters
  (caught with the bug net and let go) and 9 cooked goods.

Days run from 6 am to 2 am. Day speed can be relaxed, normal (about ten
minutes a day) or brisk. Saves live in `localStorage` under
`sprout-valley.v1` (settings under `sprout-valley.v1.settings`); quitting
mid-day resumes at the same time.

## Files

| File | Responsibility |
| --- | --- |
| `src/data.js` | Crops, items, fish, critters, recipes, villagers, festivals, goals |
| `src/rng.js` | Seeded random numbers |
| `src/time.js` | Calendar, clock, darkness and seeded weather |
| `src/map.js` | Valley layout, buildings, spots and path finding |
| `src/crops.js` | Planting, growth, regrowth and withering |
| `src/economy.js` | Prices, store stock, recipes, community requests, fair judging |
| `src/animals.js` | Feeding, petting, produce and wandering |
| `src/villagers.js` | Friendship, gifts, dialogue and schedules |
| `src/festivals.js` | Which festival is today and the egg hunt layout |
| `src/world.js` | The whole simulation: farmer, tools, menus, day cycle, goals |
| `src/save.js` | Save and load |
| `src/bot.js` | Bot farmer for the balance tests, title demo and `?autopilot` |
| `src/sprites.js` | Pixel art baked into offscreen canvases |
| `src/render.js` | Canvas renderer: ground cache, y-sorting, lighting, weather |
| `src/audio.js` | Synthesized sound effects and the seasonal music |
| `src/input.js` | Keyboard, mouse, touch and gamepad |
| `src/ui.js` | HUD and DOM menus |
| `src/main.js` | Screens, frame loop, saves and telemetry |
| `src/perf.js` | Frame-time telemetry (shared with the other games) |

Everything except `sprites.js`, `render.js`, `audio.js`, `input.js`, `ui.js`
and `main.js` is DOM-free.

## Debug parameters

- `?fresh` delete the save first
- `?seed=7` seed for a new farm
- `?play` skip the title (continue or start a farm)
- `?autopilot` the bot farmer plays and sleeps by itself
- `?touch` force touch controls, `?reduced` force reduced motion

`window.SV` exposes the world, renderer and UI in the console.

## Tests

```sh
node --test 'games/sprout-valley/tests/*.test.js'
```

Covers crop growth determinism and stages, regrowth and withering, season and
year rollover, weather, festivals, map reachability for every door, counter
and villager spot, tools, watering, rain, sprinklers, shipping, market days,
store upgrades, animals, gifts and hearts, villager schedules, all four
festivals, fishing, decorations, click-to-walk, save/load (including mid-day
and mid-festival), and a bot farmer that must finish spring with more money and
the Copper Can, and keep growing through a whole year.
