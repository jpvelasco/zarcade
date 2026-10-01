# Letter Lagoon

A kid-friendly word game. Swipe across bubbly letters to spell words, fill the
crossword, and pop the bubbles that trap the lagoon's sea critters. Every
critter you free swims off to your aquarium. Pinch the crab cheers you on, and
each word you find comes with a short, friendly definition.

90 levels wind through nine reef zones: **Sandy Shallows**, **Seagrass
Meadow**, **Coral Gardens**, **Kelp Forest**, **Shipwreck Cove**, **Turtle Bay**,
**Glow Grotto**, **Dolphin Reach** and **Starlight Deep**. The wheel grows from
three letters to seven along the way.

## Play

Letter Lagoon loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/letter-lagoon/
```

## Controls

| Input | What it does |
| --- | --- |
| Mouse / touch | Swipe from bubble to bubble and let go to try the word. Slide back to undo a letter |
| Tap | Tap letters one at a time, then ✓ (or ✕ to clear) |
| Keyboard | Type the word, `Enter` to try it, `Backspace` to remove a letter |
| `Space` | Shuffle the wheel |
| `?` or `/` | Hint: reveal one letter |
| `←` `→` | Move the wheel focus (for keyboard-only spelling, use typing) |
| `Esc` | Pause |
| Gamepad | D-pad picks a bubble, **A** adds it, **B** removes, **RB/RT** tries the word, **X** shuffles, **Y** hints, **Start** pauses. Menus: D-pad moves, **A** presses |

Letters like P and M are part of words, so only `Esc` pauses from the keyboard.

## Rules

- Every empty row of boxes on the board is a word that uses the wheel's
  letters, each letter at most once. Find them all to clear the level.
- Each board word frees one trapped critter. The whole-wheel word scores
  double.
- Real words that aren't on the board are **bonus words**: they earn coins.
- A **hint** costs 15 coins and reveals the first hidden letter of the
  shortest unfinished word. A word whose letters are all revealed counts as
  found.
- **Stars** come from hints: none used is ★★★, one or two is ★★, more is ★.
- **Relax mode** (title screen) has free hints and no stars. Levels still
  unlock and critters still join the aquarium.
- The **daily puzzle** is the same for everyone on a given date. Finish it on
  consecutive days to grow your streak.

Progress, stars, coins, the aquarium and the daily streak live in
`localStorage` under `letter-lagoon.v1`.

## Word list

The dictionary is bundled; nothing is fetched.

- `src/data/glosses.js` — about 830 curated, kid-safe target words, each with
  a short definition. A `+` marks nouns whose plain plural is a target too.
- `src/data/bonus.js` — about 1,300 extra everyday words accepted as bonus
  finds.
- `tests/blocklist.js` — words a kids' game must never accept, stored ROT13
  encoded. The tests check every dictionary word, gloss and narrator line
  against it.

Only words in the gloss list can be board answers, so every answer has a
definition to show.

## Layout

| File | Responsibility |
| --- | --- |
| `src/words.js` | Parses the word lists; lookups, letter tallies, spellable words |
| `src/crossword.js` | Crossword placement and validation |
| `src/levels.js` | Zones, the 90 wheel words, the level builder and the daily puzzle |
| `src/game.js` | One level in play: submissions, scoring, coins, hints, shuffle, stars |
| `src/solver.js` | A solver that clears levels from the wheel letters alone (tests, `?autoplay`) |
| `src/narrator.js` | Pinch the crab's rotating lines |
| `src/critters.js` | The twelve critters and the aquarium roster |
| `src/save.js` | Progress in `localStorage` |
| `src/rng.js` | Seeded PRNG |
| `src/perf.js` | Frame-time telemetry |
| `src/render.js` | Critter sprites, the lagoon backdrop and swimmers, particles |
| `src/audio.js` | Synthesized chimes and the music loop |
| `src/main.js` | Screens, input and the frame loop |

Everything except `render.js`, `audio.js` and `main.js` is DOM-free.

## Debug parameters

- `?level=42` jumps straight into a level
- `?daily` opens today's daily puzzle; add `&date=2026-12-25` for another day
- `?map` or `?aquarium` opens that screen
- `?autoplay` lets the solver spell the words. Handy for demos and screenshots
- `?reduced` forces reduced motion

## Tests

```sh
node --test 'games/letter-lagoon/tests/*.test.js'
```

The suite covers the blocklist filter over every word, gloss and line; word
lookups and spelling; every level's crossword (answers spellable from the
wheel, in the dictionary, glossed, no duplicates, valid placement, connected,
sized for a phone); deterministic levels and daily puzzles; scoring, coins,
hints, shuffles and stars; saves and daily streaks; and a solver that clears
all 90 levels and a month of daily puzzles.
