# Clue Critters — design spec

*2026-10-01 · slug `clue-critters` · genre: Mystery*

## Pitch

You are Detective Pip, a beagle with a big magnifying glass. Cozy mysteries
keep happening in Whiskerton village: the prize pie is gone, the mayor's hat
has wandered off, Mittens the kitten is missing. Visit the places in town,
search them for clues, talk to the animal suspects, fill in your clue grid,
then point your paw at the culprit. Every culprit confesses with a silly
reason ("It smelled like sunshine!"). Nobody is ever in real trouble, and a
wrong guess is just "Hmm, check your clues!"

## Case flow

1. **Case intro** — a case-file card: the mystery, a picture of the missing
   thing and a one-line ask ("Who ate the pie? Where were they? What did they
   have?").
2. **Investigate** — the case has N places (3–5) and N suspects. Each place
   is a painted scene with 6 searchable props (bush, barrel, crate, window…).
   Some props hide a clue (a feather, footprints, crumbs, a button, a dropped
   kite string); the rest hide a little joke ("A snail waves hi!"). Every
   suspect stands at one of the places; tap them to hear their statement.
3. **Clue grid** — rows are suspects, columns are the places and the things.
   Tap a cell to cycle blank → ✗ → ✓. Found clues sit in the notebook; tapping
   a clue highlights the cells it is about.
4. **Accuse** — pick who, where and what. Right: the reveal scene. Wrong: a
   gentle "Hmm, check your clues!" (on Easy it also says which part is right).
   Never game over.
5. **Reveal** — spotlight, the culprit hops forward and confesses, a
   CASE CLOSED stamp, confetti, stars, unlocks and a new album friend.

## The puzzle model

Each suspect was at exactly one place and had exactly one thing (two
bijections, N ≤ 5, so at most 5!² = 14 400 worlds). The **crime fact** is
always a found clue: "Pie crumbs! The pie-eater was at the Bandstand." (a
place) or "Sticky jam on the dish! The pie-eater had the jam jar." (a thing).
The answer is the culprit plus their place and thing.

Clue types, all truthful (everyone in Whiskerton tells the truth):

| type | example |
| --- | --- |
| `at` / `has` | "I was at the Bakery." |
| `notAt` / `notHas` | "I was NOT at the pond. Too wet!" |
| `atEither` / `hasEither` | "I was at the Mill or the Pond." |
| `whoAt` / `whoHas` | "Bunny or Duck had the kite." |
| `link` | "Whoever had the kite was at the Hill." |
| `notLink` | "The kite was not at the Pond." |

Difficulty: **Easy** 3 suspects, only positive clues (`at`, `has`, `link`).
**Medium** 4 suspects, adds "not" clues (at least one). **Hard** 5 suspects,
adds either/or clues (at least one) and `notLink`.

### Proof obligations (tests)

- `countSolutions(case)` brute-forces every world: exactly one fits all clues.
- `deduce(case)` is a kid-level propagation solver (direct marks, "only one
  left in this row/column", either/or narrowing, link transfer). It must fill
  the whole grid from the clues alone, so the clues are *sufficient* by simple
  reasoning, not just unique by search. The hint button replays its steps.
- These hold for all 12+ story cases and for hundreds of generated seeds per
  difficulty, and generation is deterministic per seed.

### Generator

Seeded RNG → pick a mystery template, N critters, N places, N things, a
random solution and crime fact. Build the pool of every true clue allowed at
that difficulty, seed it with the required clue kinds, then add shuffled
clues (harder kinds weighted up) until `deduce` solves the grid, then prune
clues that are not needed (never the required kinds). Clues are given
sources: traces (`at`), dropped things (`link`) and the crime fact are found
in scenes; the rest become suspect statements. Every suspect gets at least a
friendly line.

## Content

- 18 critters with names, colours, a fun fact and personality lines.
- 12 places, each a procedural painted scene with prop slots.
- 12 things with icons. 10 mystery templates with silly confession reasons.
- **12 story cases** in three chapters (Easy, Medium, Hard). The story text,
  cast, places, things, answer, crime and confession are handcrafted; their
  clue lists come from the generator with a fixed per-case seed over the
  handcrafted answer, so every story case carries the same proof as
  generated ones. Decision: hand-writing 12 logic grids would be fragile;
  the stories, characters and jokes are the part a player remembers.
- **Endless cases** at Easy/Medium/Hard, one seed per case.
- **Daily mystery** seeded from the local date (Medium), with a streak.

## Sticky hooks

- **Detective ranks** from total stars: Pup, Sniffer, Tracker, Detective,
  Sergeant, Inspector, Chief Inspector. A progress bar on the title.
- **Stars** per case: 3 for no wrong guesses and no grid hints, 2 for at most
  two slips, 1 otherwise. Best stars kept per story case.
- **Case file book** — every solved case: stars, culprit, their silly reason.
- **Friends album** — 18 critter cards; met critters show portrait and fun
  fact, the rest are silhouettes.
- **Wardrobe** — 9 hats and 6 coats for Pip, unlocked by rank, cases solved,
  endless cases and daily streak. Pip wears them on the title, in scenes and
  in the reveal.
- **Daily mystery** with a gentle streak counter (no guilt when it resets).

## Screens and controls

Title (village backdrop, Pip, rank bar), Story (case folders), Endless
(difficulty pick), Case Book, Friends, Wardrobe, Settings, Pause.

- **Mouse / touch:** tap props and suspects, tap grid cells, tap buttons.
  Props and suspects are real `<button>`s laid over the canvas, so they are
  focusable and announced.
- **Keyboard:** Tab / arrows move between spots and buttons, Enter/Space
  searches or talks, 1–5 switch places, G opens the grid, N notebook, A
  accuse, H hint. In the grid, arrows move, Space cycles, X marks ✗, O or
  Enter marks ✓, Backspace clears. Esc / P pauses (or closes a panel).
- **Read aloud:** if `speechSynthesis` exists, every dialogue line and clue
  has a 🔈 button; Settings can turn on automatic reading.
- Phone portrait: the scene uses a square safe area (1000×1000 logical) so
  every prop is ≥ 44 px on a 390-wide screen; wide screens fill the sides with
  extra scenery.

## Tech

Canvas backdrop (baked per place and size) + DOM panels. DOM-free modules:
`rng`, `data`, `logic` (clues, solver, hints), `cases` (generator, story),
`progress` (save, ranks, stars, unlocks, daily). Browser: `art` (critters,
Pip, icons), `scenes`, `audio`, `speech`, `main`. Save key
`clue-critters.v1`. Debug params: `?fresh`, `?case=<n>`, `?seed=<n>&diff=<1-3>`,
`?unlock`, `?reduced`, `?autoplay` (the solver plays the case).

## Decisions made without the user

- Everyone tells the truth: logic for 7-year-olds should not need liar
  puzzles.
- Clue-finding hints are free (a sparkle shows after a while); only grid
  hints and wrong accusations cost stars.
- Suspects stand at random places now; the grid asks where they were *when
  it happened*. The intro says so ("Everyone has moved since!").
- Places in the grid are the same places you visit, so N places = N scenes.
