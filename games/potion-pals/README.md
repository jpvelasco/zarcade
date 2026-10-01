# Potion Pals

A cozy alchemy discovery game in a witch's treehouse workshop. You start with
eight ingredients and a bubbling cauldron. Drop two or three things in, brew,
and find out what happens: **112 discoveries** wait in the recipe graph, and
**34 potions** summon **32 pals** who move into the treehouse, wander between
the rooms, play and nap.

Nothing is ever lost. Ingredients never run out, and a mix with no recipe makes
a silly puff of smoke, a daft remark and a hint. There is no score, no timer and
nothing to fail.

## Play

Potion Pals loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/potion-pals/
```

## Controls

| Input | What it does |
| --- | --- |
| Drag an ingredient to the cauldron | Put it in the pot (up to three) |
| Click or tap an ingredient | Same thing, quicker |
| Click or tap a pot slot (or **1 / 2 / 3**) | Take that one back out |
| **Brew** button, click the cauldron, or **Space** | Brew what is in the pot |
| **← → ↑ ↓** | Move along the shelf |
| **Enter** | Put the picked ingredient in the pot |
| **Backspace** | Take the last one out |
| Click or tap a pal | Say hello (hearts, a hop and a line) |
| **B / Q / D / H** | Book, pal requests, mystery potion, help |
| **F** | Find an ingredient by name |
| **Esc / P** | Pause (*Back to arcade* lives here); Esc closes menus |
| **M** | Mute |

Touch gets the same drag-and-drop with bigger tiles, and the whole game fits a
390 × 844 phone without scrolling.

## How it works

- **Recipes** take two or three ingredients as a set, so order never matters and
  `Ember + Ember` is a real recipe (it makes a Bonfire). Every one of the 36
  pairs of starting ingredients works, so your first experiment almost always
  finds something.
- **Potions** are the reward at the end of a chain. They cannot go back in the
  pot; they sit in the book as keepsakes, and 32 of them bring a pal.
- **Hint scrolls** arrive steadily: one for every third discovery, two for a
  potion, two for the daily mystery, one for each pal request. Spend them in the
  Book to reveal a recipe one ingredient at a time, or in Requests to ask a pal
  exactly what it wants.
- **Rooms** open as pals arrive: Workshop, Mossy Nook (3 pals), Cloud Loft (7),
  Root Cellar (12), Star Deck (18), Dream Attic (25). Each has its own
  wallpaper, rug, window and decor, and holds up to six pals.
- **Pal requests**: three at a time, phrased from the target's tags ("Mossy
  wants something cold and sweet"). Targets are always something you could brew
  today, so a request is never blocked.
- **Mystery potion**: one a day, chosen from the local date and kept for the
  rest of the day, with a riddle for a clue and a gentle streak. Miss a day and
  the streak just starts again.
- **The discovery book** has a page per shelf plus the pal album, with faded
  silhouettes for everything still missing.

Saves live under the `potion-pals.v1` local-storage key.

## Files

```
index.html        page, HUD, shelf tray and the overlays
style.css         presentation
src/recipes.js    all 120 items, 112 recipes, 32 pals (DOM-free)
src/alchemy.js    the rules: pot, brewing, scrolls, requests, daily, rooms
src/layout.js     where the rooms, hearth, cauldron and pot slots sit
src/pals.js       the pal state machine (idle / walk / play / nap)
src/art.js        every glyph and creature, drawn with Canvas paths; sprite cache
src/render.js     the treehouse scene, cauldron, fire, particles
src/ui.js         book, pal album, requests, mystery and help panels
src/audio.js      Web Audio music box and effects
src/bot.js        the demo alchemist (title attract mode and ?autopilot)
src/save.js       local-storage save
src/perf.js       shared frame-time telemetry
tests/            node:test files
```

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?fresh` | Clear the save first |
| `?seed=N` | Fix the save seed |
| `?play` | Skip the title screen |
| `?found=N` | Let the demo alchemist pre-discover N things |
| `?scrolls=N` | Add hint scrolls |
| `?autopilot` | The demo alchemist plays for you |
| `?reduced` | Force reduced motion |

## Tests

```sh
node --test 'games/potion-pals/tests/*.test.js'
```

`recipes.test.js` proves the content is sound: every discovery reachable from
the starting eight, no duplicate mixes, no dead-end ingredients, every pal
summonable, every art shape implemented. `bot.test.js` runs a blind solver that
only ever mixes what it already owns, and checks it finds all 112.
