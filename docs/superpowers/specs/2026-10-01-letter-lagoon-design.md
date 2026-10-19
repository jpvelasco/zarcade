# Letter Lagoon: design

A word game for young readers. A wheel of bubbly letters sits under a small
crossword; swiping across the letters spells a word. Each board word pops a
bubble that traps a sea critter, and freed critters swim into the backdrop and
then into the player's aquarium. Gentle and encouraging throughout: no timer,
no lives, no way to lose.

## Words

Two bundled lists, no network:

- **Target words** (`src/data/glosses.js`, ~830 entries): common, concrete
  words for children, 3–7 letters, each with a definition of at most 70
  characters. A `+` flag makes the plain plural a target too ("More than one
  pot."). Only these can be board answers, so every answer has a gloss.
- **Bonus words** (`src/data/bonus.js`, ~1,300): everyday words, plurals and
  verb forms accepted as extras.

A blocklist in the tests (ROT13 encoded) holds profanity, slurs, adult,
drug, alcohol, violent and unkind words. Exact entries block a whole word;
a short list of fragments that never occur in innocent words blocks
substrings. Every dictionary word, every word in every gloss, and every
narrator line goes through it.

## Levels

90 levels, ten per zone across nine zones. Each level is defined by one word
whose letters make up the wheel (`BASES` in `src/levels.js`). Wheel sizes go
3, 4, 5, 6, 7, never shrinking.

The builder is deterministic from the level's seed:

1. All target words spellable from the wheel are candidates.
2. The full-wheel word goes first, across. The rest follow longest first, with
   a seeded jitter that mixes lengths differently per level.
3. Each word is placed at the legal crossing that keeps the board compact
   (bounding area, aspect, crossing count, seeded tie-break), within 6×6 for
   small wheels, 8×10 for five letters, and 9×10 otherwise.
4. Up to 16 attempts with different seeds; the board with the most words wins
   once it reaches the size range (3 for 3-letter wheels, 3–5, 4–6, 5–7, 6–8).
5. The wheel is shuffled so it never spells a board word in order.
6. Bonus words are every other dictionary word the wheel can spell.

Crossword rules, checked by `validateCrossword`: words only touch where they
cross, crossings join an across word to a down word on the same letter, every
run of two or more letters is exactly one placed word, and the board is
connected.

**Daily puzzle.** A date key (`YYYY-MM-DD`, local calendar) hashes to a seed
that picks a wheel from the five- and six-letter target words with at least
nine spellable targets, and a zone for its look and critters.

## Play rules

- Answers score 10 per letter; the whole-wheel word scores double (on wheels
  of four or more letters). Bonus words score 5 per letter and give 2 coins.
- Finishing gives 50 points and 10 coins, plus 2 coins per star.
- A hint costs 15 coins (free in relax mode) and reveals the first hidden
  letter of the shortest unfinished word. Words whose cells are all showing
  count as found.
- Stars: no hints is three, one or two hints is two, more is one. Relax mode
  records no stars.
- Players start with 45 coins (three hints).

## Presentation

- Bright lagoon backdrop baked once per zone and size into an offscreen
  canvas: light rays, rocks, coral, sand. Kelp sways, bubbles rise and small
  fish cross live, all from cached sprites.
- Twelve critters drawn with Canvas paths in a sticker style (navy outline,
  shine, blush): clownfish, starfish, seahorse, turtle, angelfish,
  pufferfish, octopus, ray, jellyfish, dolphin, narwhal, whale.
- Letters fly from the wheel to their tiles, tiles pop, the critter's bubble
  bursts and the critter swims into the scene. Coins arc to the counter.
- Pinch the crab (inline SVG) comments in a speech bubble and hops when you
  find a word. The definition card shows under it.
- Audio is Web Audio only: a bell per letter up a major pentatonic scale, an
  arpeggio for a found word, a jingle for bonus words, a soft bloop for
  misses, a gentle music loop and an echo send.

Reduced motion (media query or `?reduced`) keeps eight bubbles, drops
flying letters and most particles, and cuts CSS animation.

## Telemetry

`game.ready`, `level.start`, `level.complete` (stars, score, time, hints,
bonus words), `level.abandon` (left unfinished; there is no fail state),
`hint.used`, `daily.complete`, `relax.toggle`, `aquarium.open`, plus the
shared frame monitor (`frame.long`, `perf.degraded`, `frame.stall`).
