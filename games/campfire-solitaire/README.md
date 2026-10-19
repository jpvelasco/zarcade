# Campfire Solitaire

A cozy TriPeaks-style solitaire for the Starlight Arcade, played at a forest
campsite under the stars. It's the arcade's first card game: a round takes about
two minutes, it's built for phones, and you'll want just one more deal.

## How to play

- The **fire pile** (waste) is the card by the campfire. Play any **face-up**
  card that is **one rank higher or lower** than it. King and Ace touch (K–A
  wraps), so a run never dead-ends.
- A card turns face up when the cards lying over it are cleared.
- Stuck? Tap the **stock** to put a new card on the fire pile. Drawing ends
  your streak.
- Clear every card to clear the camp. If the stock runs out with no play left,
  undo a few moves: every trail level and every Daily Deal is proven winnable.

## Scoring and stars

| What | Points |
| --- | --- |
| Each card | 50 × its place in the streak (50, 100, 150…) |
| A peak card (★ on the layout) | +500 |
| Clearing the camp | +1,000, plus 100 for each card left in the stock |
| Solo (no undo, no hints) | +1,000 |
| Each undo | −50 |

Each round has three stars: **clear the camp**, reach the **streak goal**, and
finish with **no undo or hints**. Each streak goal is at most the longest
streak in that deal's verified winning line, so every goal can be reached. Undo
is unlimited and hints are free; the score rewards doing without them.

## Modes and keepsakes

- **Trail Map**: 24 levels on a winding trail through Pine Hollow, Lakeside
  and Starry Ridge. Each stop shows your stars and its layout.
- **Daily Deal**: the same layout and cards for everyone on a given local
  date. A gentle streak counts the days in a row you clear it; it stays
  alive until a whole day goes by.
- **Quick Deal**: a fresh deal that's proven winnable, on any layout you've
  reached. "Deal again" is instant, because the next deal is solved ahead of
  time.
- **Camp Gear**: 7 card backs and 9 decorations that appear around the table:
  string lanterns, a tent, marshmallows, a guitar, fireflies, an owl, a canoe,
  a telescope and shooting stars. Locked gear shows as a silhouette with
  what it takes to earn it.
- **Personal bests**: the best score for each level and each Daily Deal, your
  Quick Deal best, and your longest streak ever.

Layouts: Three Peaks, The Tent, Pine Tree, Canoe, Big Dipper, Twin Peaks,
Lantern, Cassiopeia, Campfire and Orion. In the constellation layouts, each
cleared peak lights a star, and the lines between lit stars glow.

## Controls

| Action | Mouse / touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Play a card | tap or click it | arrows / Tab to focus, Enter or Space | d-pad, A |
| Draw | tap the stock | D | X |
| Undo | ↶ button | U or Ctrl+Z | B |
| Hint | 💡 button | H | Y |
| Pause | ❚❚ | Esc or P | Start |
| Sound | 🔊 | M | — |

In menus the arrow keys or d-pad move between buttons, Enter or A presses one,
and Esc or B goes back. The 🔊 button mutes everything: music, effects and the
crackling fire.

## Run it

From the repo root:

```sh
npm run serve
# then open http://localhost:8000/games/campfire-solitaire/
```

Debug parameters:

- `?level=N` opens trail level N (1–24).
- `?daily` opens today's Daily Deal. `?date=YYYY-MM-DD` previews another day's
  deal; it never writes the save.
- `?quick` opens a Quick Deal.
- `?autoplay` lets the solver play, level after level. It never writes the
  save. The same solver plays a deal behind the title screen.

## Files

- `src/cards.js`: card ids, ranks and suits, and the one-apart rule with wrap.
- `src/layouts.js`: the ten layouts as ASCII art in half-card units. Covers
  are derived from the geometry.
- `src/game.js`: one round, with the deal, play, draw, undo, scoring, stars
  and events. It's DOM-free.
- `src/solver.js`: a depth-first search over (cleared mask, cards drawn, waste
  rank) with a memo and a fixed node budget, so it gives the same answer on
  every machine. It's shared by deals, hints, autoplay and the tests.
- `src/deals.js`: the trail, the Daily Deal and Quick Deals. Each one is the
  first seed the solver proves winnable.
- `src/progress.js`: the save (`localStorage` key `campfire-solitaire.v1`), with
  stars, bests, the daily streak and gear unlocks. It sanitizes every field,
  and a second tab's save is adopted rather than overwritten.
- `src/table.js`: the screen layout as a pure function of the window. It
  picks piles below the board or beside it, whichever gives bigger cards,
  and re-lays out on resize and rotation.
- `src/focus.js`: keyboard and gamepad focus across playable cards.
- `src/anim.js`: interruptible tweens.
- `src/render.js`, `src/sprites.js`: the canvas renderer and baked art. The
  renderer reads the round and never changes it. Input hit-tests the table
  layout, never an animation.
- `src/audio.js`: Web Audio only. Karplus–Strong guitar plucks rise with your
  streak over a fingerpicked chord loop and a crackling fire, all through one
  master gain.
- `src/main.js`: screens, input, saves, telemetry and the frame loop.
- `src/perf.js`: frame telemetry, shared with the other games.

## Tests

```sh
node --test 'games/campfire-solitaire/tests/*.test.js'
```

The tests cover:

- the rules and scoring;
- every layout's covers, counts and fit on phones and desktops;
- the solver, both on its own and replayed on real rounds;
- every trail level and 15 months of Daily Deals being winnable;
- hints that clear a deal on their own;
- saves, streaks and unlocks;
- focus movement, tweens and frame telemetry.
