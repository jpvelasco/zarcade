# Crayon Quest design

A kid-friendly roguelite deckbuilder drawn in a sketchbook. A doodle hero climbs
three pages of a sketchbook tower: pick a path across a branching map of
battles, treasure pages, shops, rest stops and mystery pages, draft crayon
cards, stick on sticker relics, and beat the boss at the top of each page. A
run lasts 15–25 minutes.

## Rules

- **Turns.** 3 energy and 5 cards each turn. Cards cost 0–3 energy. Unplayed
  cards are discarded at the end of the turn; when the draw pile runs out the
  discard pile is shuffled back in (seeded).
- **Card kinds.** Attack (red frame), Skill (blue) and Magic (purple: plays
  once and stays for the whole battle). "Poof" cards are used up for the
  battle.
- **Statuses** with kid words and icons, all whole numbers:
  - Shield: soaks up damage, clears at the start of your next turn.
  - Power: +1 damage on every hit per point.
  - Smudge: lose that much HP at the start of your turn, then it goes down 1.
  - Soggy: takes 50% more damage (counts down each turn).
  - Dizzy: hits 25% softer (counts down each turn).
- **Intents.** Every monster shows what it will do next with an icon and the
  real number (after Power, Dizzy and Soggy), so kids can plan: sword = hit,
  shield = defend, up-arrow = power up, swirl = sneaky trick, plus a combo
  icon for hit-and-defend.
- **Map.** Each page has 6 rows of nodes across 4 lanes plus a boss. Row 1 is
  all battles, row 4 is treasure, row 6 is a rest stop. Elites ("Big
  Doodles") can't appear before row 3. 3–4 seeded paths with no crossings.
- **After battles** you get gold and choose 1 of 3 cards (or skip). Elites
  always drop a sticker; bosses drop a rare card choice, a sticker and a full
  heal of 50% of missing HP before the next page.
- **Rest stop:** Nap (heal 30% of max HP) or Color in (upgrade one card).
- **Shop:** five cards, two stickers, and Erase (remove a card; price rises
  each use).
- **Mystery pages:** eight short choice stories (a sharpener that upgrades a
  card, a puddle that trades HP for a rare card, a lost sticker, a doodle
  that wants to be friends, etc.). Every choice is safe for kids: the worst
  outcome is a few HP.
- **Score:** battles, elites and bosses defeated, floors cleared, a win bonus
  and HP left. Shown on the results screen with "New best!".

## Content

- 4 heroes, each with a starting deck, a starting sticker and four signature
  cards in their draft pool: Doodle Kid (balanced; free), Sketchy Knight
  (shields; unlocked by finishing any run), Paint Wizard (smudge; unlocked by
  beating any boss), Eraser Ninja (cheap cards and draw; unlocked by beating
  two bosses in total or winning a run). Unlocks are generous on purpose.
- 44 cards, every one with an upgraded version.
- 18 monsters across three pages (Pencil Woods, Marker Marsh, Rainbow Roof),
  including 3 elites and 3 bosses (King Scribble, Inky the Blot, the Grand
  Smudge), each with a simple move pattern.
- 18 sticker relics with simple hooks (start of battle, start of turn, end of
  battle, passive stat changes).

## Sticky hooks (all saved under `crayon-quest.v1`)

1. **Daily page:** a seeded run from the local date (same day, same map,
   hero and shop). Daily best and a gentle streak counter (days in a row you
   played the daily). No penalty for missing a day.
2. **Unlockable heroes** with their own decks and art.
3. **Album:** every card, monster and sticker you've met. Missing ones show
   as grey scribbled silhouettes with a "???" name.
4. **Run history:** the last 20 runs (hero, daily or not, page reached,
   result, score, minutes).
5. Personal best score on the title and results screens with a "New best!"
   moment; one-tap "Play again" from the results screen.
6. Runs save after every action, so a reload continues where you were.

## Look and feel

- Notebook paper: cream background with faint blue rules and a red margin,
  baked once into a texture canvas. Everything else is SVG generated in JS.
- Doodles are built from a DOM-free "rough path" generator: jittered strokes
  drawn twice (a solid crayon stroke plus a thin offset echo) and hatched
  fills. Each monster and hero has three "line boil" frames swapped by a CSS
  `steps()` animation, the classic hand-drawn wobble. Reduced motion turns
  boil off and shortens the fly-in/shake animations.
- Defeated monsters get scribbled out with an animated stroke, then fade.
- Hand-lettered title made of per-letter crayon colours and tilts.
- Particles (crayon shavings and stars) on one canvas overlay, capped at
  160. Damage numbers are DOM pop-ups.
- WebAudio: pencil scratch (filtered noise), paper swish, thumps, a wooden
  knock for shields, xylophone plinks for gold and a small music box loop.
  Sound and music toggles.

## Controls

- Mouse/touch: tap a card to pick it up; tap a monster to use it there (or
  tap the card again / the "Play" bubble for cards with no target, or when
  only one monster is left). End turn button.
- Keyboard: 1–9 and 0 pick cards, ←/→ (or A/D) choose a monster, Enter or
  Space plays, E ends the turn, V views the deck, Esc/P pauses. Map and menus:
  arrow keys move focus, Enter picks.
- No gamepad: turn-based card play does not need one.

## Architecture

DOM-free (`src/`): `rng.js` (mulberry32 with serialisable state, daily seed),
`data.js` (cards, monsters, encounters, stickers, heroes, events), `map.js`
(map generation), `battle.js` (battle engine with an event list for
animation), `run.js` (run state machine: nodes, rewards, shop, rest, events,
score), `progress.js` (profile, unlocks, album, history, daily streak),
`bot.js` (playtest bot), `art.js` (SVG string generators for doodles, icons
and cards), `perf.js` (copied from comet-crush).

Browser: `main.js` (screens, input, loop, telemetry), `fx.js` (particle
canvas), `audio.js`.

The run is one JSON-serialisable object including the RNG state, so saving,
resuming and the daily seed are all exact.

## Balance

`tests/bot.test.js` runs a heuristic bot (blocks when it would take damage,
kills when it can, plays Magic early, drafts by a tier list, rests when low)
over many seeds per hero, and asserts it wins sometimes but not always,
and that a random-play bot does clearly worse. Numbers were tuned with that
sim.

## Design calls

- No potions and no card targeting by drag; tap-tap is easier for small
  hands and keyboards.
- "Gentle mode" setting (monsters have 25% less HP) for younger kids; the
  daily page always uses normal mode so it's comparable.
- Debug params: `?seed=N`, `?hero=id`, `?autopilot` (the bot plays in the
  browser, used for route checks), `?crash` (throws in the frame loop once,
  for crash-screen checks).
