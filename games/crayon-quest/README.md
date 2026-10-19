# Crayon Quest

A kid-friendly roguelite deckbuilder drawn in a sketchbook. Pick a doodle
hero, climb three pages of the sketchbook tower, choose your path across a
branching map, play crayon cards against silly doodle monsters, draft new
cards, stick on sticker relics, and scribble out the boss at the top of each
page. A run takes about 15–25 minutes and saves after every move.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/crayon-quest/
```

## How a battle works

- Each turn you get **3 energy** and **5 cards**. A card's cost is in its
  yellow circle.
- The bubble above each monster shows what it will do next, with the real
  number: a sword is a hit, a shield is defending, an arrow is powering up, a
  swirl is a sneaky trick.
- **Shield** soaks up damage until your next turn. **Power** adds to every
  hit. **Smudge** loses HP each turn. **Soggy** takes 50% more damage.
  **Dizzy** hits 25% softer.
- **Magic** cards stay for the whole battle. **Poof!** cards are used up
  for the battle.

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Pick up a card | click / tap it | 1–9, 0, or ← → |
| Use it on a monster | click / tap the monster | ← → (A D) to aim, Enter / Space / ↑ |
| Use a card with no target | click / tap it again | Enter / Space |
| End turn | End turn button | E |
| Look at your cards | pile buttons, deck button | V |
| Pause | pause button (top right) | Esc / P |
| Mute | Sound button | M |
| Map and menus | click / tap | arrow keys, Enter |

## The map

Battles, Big Doodles (elites, always drop a sticker), shops (cards, stickers
and an eraser to remove a card), rest stops (nap to heal or color in a card
to upgrade it), treasure pages and mystery pages. Each page ends with a boss:
King Scribble, Inky the Blot and the Grand Smudge.

## Keep coming back

- **Daily Page**: the same seeded run for everyone on the same local date,
  with a gentle day streak and a daily best.
- **Heroes**: Doodle Kid, Sketchy Knight, Paint Wizard and Eraser Ninja, each
  with their own starting deck, sticker and signature cards.
- **Album**: every card, monster and sticker you have met; missing ones are
  silhouettes.
- **Runs**: your last 20 runs, best score and win count.
- **Gentle mode** (monsters have 25% less HP) for younger players.

Saves live under the `crayon-quest.v1` localStorage key.

## Files

```
index.html, style.css     page and sketchbook look
cover.svg, favicon.svg    arcade card art and icon
telemetry.js, fullscreen.js   shared arcade modules (copied, never edited)
src/rng.js        seeded RNG with JSON-safe state, daily seed
src/data.js       cards, monsters, encounters, stickers, heroes, events
src/map.js        branching page maps
src/battle.js     battle engine (events for the page to animate)
src/run.js        run state machine: rooms, rewards, shop, rest, score
src/stickers.js   sticker effect sums
src/progress.js   profile: unlocks, album, history, daily streak
src/bot.js        playtest bot (balance tests and ?autopilot)
src/art.js        SVG doodle generator (boil frames, icons, card frames)
src/main.js       screens, input, animation, saves, telemetry
src/fx.js         crayon-shaving particles on one canvas
src/audio.js      WebAudio sound effects and music box
src/perf.js       frame-time telemetry (from Comet Crush)
tests/            node:test suites
```

## Tests

```sh
node --test 'games/crayon-quest/tests/*.test.js'
```

The bot test plays 40 full runs per hero and checks that a sensible strategy
wins sometimes (15–80%), that most runs clear page 1, and that random play
does clearly worse.

## Debug params

- `?autopilot` lets the bot play in the browser (sound off). Combine with
  `?seed=N` and `?hero=kid|knight|wizard|ninja`.
- `?seed=N` fixes the seed of a new run.
- `?reduced` forces reduced motion.
- `?crash` throws once in the frame loop to check the crash screen.
