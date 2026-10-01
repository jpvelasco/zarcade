# Clue Critters

A cozy detective game for all ages. You are **Detective Pip**, a beagle with a
big magnifying glass. Mysteries keep popping up in Whiskerton village: the
prize pie is gone, the Mayor's hat has wandered off, Mittens the kitten is
missing. Search the places in town, talk to the animal suspects, fill in your
clue grid and point your paw at the culprit. Every culprit confesses with a
silly reason, and a wrong guess is only ever "Hmm, check your clues!"

Run it from the repo root with `npm run serve`, then open
<http://localhost:8000/games/clue-critters/>.

## How to play

1. **Read the case file.** It says what went missing and who the suspects are.
2. **Search.** Each place has six things to search (bushes, barrels, crates…).
   Some hide a clue: fur, a feather, footprints, crumbs, a dropped kite.
   The rest hide a little joke. Tabs at the bottom show how many clues are
   left in each place.
3. **Talk.** Every suspect is standing somewhere in town. Tap them to hear
   what they know. Everyone in Whiskerton tells the truth!
4. **Clue board.** Rows are suspects, columns are places and things. Tap a box
   once for ✗ (no), twice for ✓ (yes). On Easy, Pip fills in the obvious boxes;
   on Medium a ✓ crosses out its row and column; on Hard you do it all. Tap a
   clue in the notebook to light up the boxes it is about.
5. **Solve it!** Pick who, where and what. Right: the culprit confesses, CASE
   CLOSED. Wrong: try again (on Easy you are told which parts were right).

Stars: 3 for no wrong guesses and no grid hints, 2 for one or two slips, 1
otherwise. Hints that only point at an unfound clue are free.

## Modes and progress

- **Story** — 12 handcrafted cases in three chapters (Easy with 3 suspects,
  Medium with 4 and "not" clues, Hard with 5 and either/or clues).
- **Endless cases** — a fresh generated case every time, at any difficulty.
- **Daily mystery** — the same Medium case for everyone on a given day, with a
  gentle streak counter.
- **Ranks** from Pup to Chief Inspector, earned with stars.
- **Case files** keep every solved case and its silly confession.
- **Friends album** — 18 critters to meet; strangers show as silhouettes.
- **Wardrobe** — 9 hats and 6 coats for Pip, unlocked by playing.
- **Read aloud** — 🔈 buttons (and an automatic setting) use the browser's
  speech, where available.

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Search / talk | tap it | Tab or arrows to move, Enter / Space |
| Switch place | place tabs | 1–5 |
| Clue board | 📒 Clue board | B |
| Grid | tap a box | arrows, Space cycles, X = ✗, O / Enter = ✓, Backspace clears |
| Solve | 🔎 Solve it! | S |
| Hint | 💡 | H |
| Pause / close | ❚❚ | Esc or P |
| Sound | 🔊 | M |

## Files

- `src/logic.js` — clue types, brute-force solution counter, the kid-level
  propagation solver, grid helpers and hints (DOM-free).
- `src/cases.js` — case generator, clue sources and every sentence.
- `src/story.js` — the 12 story cases.
- `src/session.js` — one case in play, plus the autoplayer.
- `src/progress.js` — save, stars, ranks, outfits, daily streak.
- `src/data.js` — critters, places, things and mystery templates.
- `src/art.js`, `src/scenes.js` — critters, Pip, icons and painted places.
- `src/main.js`, `src/audio.js`, `src/speech.js` — browser screens, sound and
  read-aloud. `src/perf.js` — frame telemetry.
- `tests/` — `node --test 'games/clue-critters/tests/*.test.js'`.

Save key: `clue-critters.v1`.

## Debug parameters

- `?fresh` — start with a new save.
- `?case=N` — jump to story case N (1–12).
- `?seed=N&diff=1|2|3` — play a generated case.
- `?daily` / `?day=YYYY-MM-DD` — play the daily mystery (for that day).
- `?autoplay` — the solver plays the case.
- `?unlock` — open every story case and outfit (save untouched).
- `?reduced` — reduced motion. `?crash` — force a frame-loop crash.
