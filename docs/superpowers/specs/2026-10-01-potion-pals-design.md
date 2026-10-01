# Potion Pals: design

A whimsical alchemy discovery game for all ages, set in a witch's treehouse
workshop. You start with eight ingredients and one bubbling cauldron. Drop two
or three things in, stir, and find out what happens. Most mixes make something
new: a jar of moonjam, a cloud, a pocket galaxy. Some make a **potion**, and a
potion summons a **pal** — a sprite, slime, tiny dragon or cloud kitten who
moves into the treehouse, wanders between the rooms, plays and naps.

Nothing can be lost. A mix that is not a recipe puffs a silly coloured cloud,
says something daft, and leaves a hint behind. There is no currency, no timer
and no failure state; the only resource is curiosity.

## Shape of a session

1. The title screen shows the treehouse with your pals already pottering about,
   your discovery count, pal count and daily streak.
2. In play, the **shelf** (bottom tray) holds every ingredient you know. Drag
   up to three into the **cauldron**, or tap them, or pick them with the
   keyboard. Press **Brew**.
3. A hit plays a colour-blend swirl, a sparkle burst and a reveal card: name,
   a one-line description, and NEW! when it is the first time.
4. A potion plays a bigger reveal: the pal hatches out of the cauldron smoke,
   gets introduced, and walks off to a room.
5. Three **pal requests** sit in the margin ("Mossy wants something cold and
   sweet"). Brewing the asked-for thing completes one and hands over a hint
   scroll. A fourth request rolls in at once.
6. The **discovery book** lists everything with silhouettes for what is
   missing, grouped by branch, and spends hint scrolls to reveal recipes.
7. The **daily mystery potion** is chosen by the local date with a riddle for a
   clue. Brewing it today keeps the streak.

## Content: the recipe graph (`src/recipes.js`, DOM-free)

- **8 starting ingredients**: moonberry, frog sneeze, starlight, honey, snow,
  ember, mushroom, dewdrop.
- **112 discoveries**: 78 ingredients and 34 potions. 32 of the potions summon
  a pal; two are keepsakes (Rainbow Bottle, Wish in a Jar).
- **32 pals** with their own names, species, palettes and one-line bios.
- Recipes take **two or three** inputs as a multiset, so `ember + ember` and
  `snow + ember + honey` are both legal keys. Order never matters.
- The table is authored in **layers**: a recipe may only use the starting
  ingredients or results defined above it in the file. That makes reachability
  structural; the tests then prove it by search rather than trusting the
  author.
- Every one of the 36 pairs of starting ingredients (including a thing with
  itself) is a real recipe, so the very first experiments almost always work.
- Each item carries **tags** (`sweet`, `cold`, `glowy`, `silly`, `soft`,
  `loud`, `earthy`, …). Tags drive request wording, the daily riddle, and the
  hint text, so no clue copy is hand-written per item.
- Each item carries an **art spec** (`shape`, two colours) and each pal a
  **body spec** (`body`, colours, features). All drawing is procedural, so
  there are no asset files and the look stays cohesive.

Invariants the tests check: every input defined, no duplicate recipe keys, no
duplicate names or ids, every discovery reachable from the starting eight,
every non-potion item used as an input somewhere (no dead ends), every pal
summonable, every art shape and body known, at least 100 discoveries and at
least 30 pals. The frontier test also checks the graph is only 11 layers deep,
so nothing is buried behind a long chain.

## Rules (`src/alchemy.js`, DOM-free)

- `state`: `found` (ids → order found), `pals` (ids → arrival order), `scrolls`,
  `reveals` (id → how much of its recipe is shown), `requests`, `daily`,
  `stats`, `settings`, `seed`.
- `add(id)` puts an ingredient in the pot (max 3, duplicates allowed),
  `remove(i)`, `clear()`.
- `brew()` returns one of:
  - `{ ok: true, item, isNew: true }` — a discovery. A new item unlocks on the
    shelf with a NEW! dot.
  - `{ ok: true, item, isNew: false }` — something you already know. Still a
    happy little animation ("Another perfect batch of Caramel!").
  - `{ ok: false, fizzle, hint }` — no such recipe. `hint` is derived: if one
    of the pot's ingredients appears in an undiscovered recipe, the hint names
    the ingredient and a tag of the missing partner ("Snow is waiting for
    something warm"). Otherwise it suggests a pair of known things that have
    never been tried together.
- Discoveries grant **hint scrolls**: one for every third discovery, two for a
  potion, two for the daily, one per completed request. They are spent two
  ways: in the book, to reveal one input of a recipe at a time (never more than
  three per item), and in Requests, to have a pal name exactly what it wants.
- **Requests**: three at a time. A request pairs a pal you own with a target
  item, phrased from two of the target's tags. Targets prefer undiscovered
  items at the frontier (all inputs known) so a request is always doable right
  now. Completing is simply brewing the target.
- **Daily mystery**: `dailyFor(dateKey)` hashes the key into a pick from the
  recipes whose inputs are all discoverable, biased to the player's frontier,
  and builds a riddle from the result's tags plus the number of inputs.
  Brewing it marks the day done, grants scrolls and advances the streak;
  missing a day just restarts the streak at 1 with no scolding.
- **Rooms** unlock on pal count: Workshop (start), Mossy Nook (3), Cloud Loft
  (7), Root Cellar (12), Star Deck (18), Dream Attic (25). Six rooms, six pals
  each.

## Pals in the treehouse (`src/pals.js`, DOM-free sim)

- One actor per owned pal, assigned to a room round-robin by arrival order so
  the rooms fill evenly and the same save always looks the same.
- State machine: `idle` → `walk` → `play` → `nap` → `idle`, with seeded
  durations, so a pal is always doing something but never jitters. Napping
  pals get a `z` bubble; playing pals bounce or chase a bubble.
- Pals stay inside their room's floor rectangle; the sim knows nothing about
  pixels beyond the rectangle it is handed.
- `poke(id)` triggers a reaction: a hop, hearts, a happy line, and a sound.
- A newly summoned pal walks in from the cauldron to its room.

## Look and feel

- Side-on cross-section of a treehouse built into one big tree: a grid of six
  rooms hung off the trunk (3 x 2 on a laptop, 2 x 3 on a phone) that fills from
  the bottom row up, under a scalloped leaf canopy. Each room has its own
  wallpaper, rug, round window on the night, hanging lantern and decor. Cells
  with no room yet show a bare branch and a sprig of leaves, so a new workshop
  looks small rather than derelict. The bottom strip is the workshop floor:
  planks, a crate of ingredients, a stool, a stack of spell books, a broom, and
  the cauldron on its fire with the moon hanging beside it. The shelf tray sits
  under the canvas, with the current hint on one line above the tiles.
- Everything is Canvas 2D. Sprite caches (`src/art.js`) bake every ingredient
  glyph, every pal (open-eye and shut-eye frames) and the whole static room
  art into offscreen canvases once, spread over the first frames so no frame
  stalls. Per-frame drawing is `drawImage` plus cheap paths.
- The cauldron liquid is a blend of the colours in the pot: it lerps towards
  the mix, bubbles rise at a rate set by how full the pot is, and a brew sends
  a ring of sparkles up the trunk. The liquid is clipped to an inset hollow so
  the pot's iron walls stay dark and the fire below still shows. Wrong mixes
  puff a big soft cloud in the mixed colour.
- Palette: deep plum night, warm lantern gold, moss green, candy pink. Rounded
  system font stack, big friendly type.
- Reduced motion: no screen drift, far fewer particles, no idle bobbing of
  cards, instant reveals.

## Controls

| Input | Action |
| --- | --- |
| Drag an ingredient to the cauldron | Add it to the pot |
| Tap / click an ingredient | Add it to the pot |
| Click a pot slot | Take it back out |
| Brew button / **Space** | Brew |
| **← → ↑ ↓** | Move the shelf cursor |
| **Enter** | Add the cursor's ingredient |
| **Backspace** | Take the last one out |
| **B / Q / D** | Book, requests, daily |
| **F** | Find (filter the shelf) |
| Click / tap a pal | Say hello |
| **Esc / P** | Pause (holds *Back to arcade*) |
| **M** | Mute |

Touch gets the same drag, bigger tiles and a two-row scrolling tray. On a
390 × 844 phone the rooms shrink to the top third and the tray to the bottom
third; nothing scrolls the page.

## Sticky hooks

1. **Discovery book** with silhouettes, branch pages, and a live `n/110`.
2. **Hint scrolls**, earned steadily, spent to reveal a recipe one input at a
   time.
3. **Treehouse rooms** that unlock as the pal count grows, each with its own
   decor, visibly filling up.
4. **Pal requests**: three rotating quests phrased by the pal who wants it.
5. **Daily mystery potion** from the local date, with a riddle and a gentle
   streak (best streak kept).
6. Personal bests on the title: discoveries, pals, best streak.

## Telemetry and performance

- `telemetry.js` with `data-service="potion-pals"`, the frame loop wrapped in
  `Telemetry.guard`, and `frameMonitor` from the shared `perf.js` (1 s
  watchdog, `reset` on visibility change, `mark` after baking and after a room
  unlock).
- Events: `game.ready`, `brew.hit`, `brew.fizzle`, `potion.found`,
  `pal.summon`, `room.unlock`, `request.done`, `daily.claim`, `book.reveal`.
  Counts and ids only, no personal data.
- Budget: sprite baking in ≤ 6 ms slices, particles capped at 180, no
  `shadowBlur` or `filter` per frame, no per-frame allocation in the pal or
  particle loops. Target 60 fps normally and smooth under CPU ×4.

## Tests (`games/potion-pals/tests/`)

- `recipes.test.js` — the data invariants listed above.
- `alchemy.test.js` — pot limits, duplicates, known vs new, fizzle hints,
  scroll economy, reveals, requests rotating and always reachable, daily
  determinism per date key, save normalize round-trips and forward tolerance.
- `pals.test.js` — room assignment, seeded determinism, actors stay inside
  their room, every state reached, poke reactions.
- `bot.test.js` — a blind solver that only ever mixes ingredients it already
  owns finds all 112 discoveries and all 32 pals, which proves reachability
  through real play rather than by trusting the table. The demo alchemist that
  drives the title attract mode and `?autopilot` is tested alongside it.
- `perf.test.js` — the shared frame-monitor test.

## Decisions taken alone

- **Three slots, not four.** Two-input recipes dominate; three is enough for
  the "grand" potions and keeps the key space small enough to author by hand.
- **Duplicates allowed** (`ember + ember → bonfire`). It is the first thing
  kids try and it would be sad for it to do nothing.
- **Known results still celebrate.** Re-brewing is how you make a request's
  item, so it must never feel like a wasted action.
- **No consumption.** Ingredients are knowledge, not stock; you can never run
  out and never need to grind.
- **Potions are terminal.** A potion is a reward, not an input, which keeps the
  "no dead ends" rule meaningful for ingredients.
- **Requests target the frontier**, so a request is never blocked behind
  something you have no path to yet, and the two words a pal uses are chosen to
  differ from the other two requests on screen.
- **Today's mystery is chosen once and stored.** It is drawn from the date hash
  and the player's frontier the first time the day is opened, then kept for the
  rest of the day, so the riddle cannot change while you are chasing it.
- **The hearth sits below the rooms rather than inside the Workshop.** It keeps
  the cauldron, the pot slots and the fire in one clear band that reads the same
  on a laptop and a phone.
