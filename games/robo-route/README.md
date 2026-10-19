# Robo Route

A coding puzzle game. Program **Bolt**, a small cheerful robot, by snapping
command tiles into a program strip, then press **Run** and watch him carry it
out one tile at a time, with the tile he is doing lit up. Light every lamp and
grab every battery to win.

The game teaches real programming ideas without needing words: **sequences**,
**loops** (a Repeat block), **procedures** (a P1 strip called by a P1 tile),
**recursion** (P1 calling itself), and **conditions** (red and blue tiles that
only run on matching floors). Five worlds introduce one idea at a time across
**48 levels**, and every level has a 3-star par that a solver has checked.

Mistakes are friendly. Bolt bonks, sparks, shrugs or gets sleepy, the tile
that went wrong gets a little bug marker, and the board resets in about a
second with your program kept. You can step through a program one tile at a
time and edit it while it is paused: if the change comes after the tiles Bolt
already used, he just carries on.

## Play

Robo Route loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/robo-route/
```

## Worlds

| World | Idea | Levels |
| --- | --- | --- |
| Tinker Yard | Sequences: Forward, turns, Light, Jump, Grab | 10 |
| Loop Lagoon | Repeat blocks, then Repeats inside Repeats | 10 |
| Gear Works | The P1 procedure, then recursion | 10 |
| Rainbow Relay | Red and blue tiles that only run on matching floors | 9 |
| Star Circuit | Everything together | 9 |

Stars: ★★★ at or under par, ★★ within two tiles, ★ for any solution. A level
opens when either of the two before it is solved, and a world opens once six
levels of the previous world are solved. The Hint button reveals a solution
one tile at a time and still lets you earn stars.

## Rules

- **Forward** rolls one square; the next block must be the same height.
- **Turn left / right** turn on the spot.
- **Jump** hops up one step or down any number; on the flat it hops in place.
- **Light** lights the lamp underneath (lamps stay lit).
- **Grab** picks up the battery underneath.
- **Repeat ×n** runs the tiles inside it n times (2–9). Repeats nest two deep.
- **P1** runs the P1 strip. From Gear Works 3-6 on, P1 may call P1.
- A **red** or **blue** tile only runs when Bolt stands on that colour (red has
  a dot, blue a diamond, so colour never has to be seen to be read).
- The level is solved the moment the last lamp and battery are done.

## Sticky bits

- **World map** with stars and personal-best tile counts.
- **Garage**: 8 paint jobs and 8 antenna toppers, unlocked by stars, worlds,
  daily circuits, bugs and building. Bolt wears them in every level.
- **Daily Circuit**: a new level each local day, generated from the date and
  checked by the solver, with a gentle streak.
- **Bug Zapper**: 18 bugs to collect (Bonk Beetle, Loop Ladybug, Recursion
  Roly-poly…), shown as silhouettes until caught.
- **Level editor** (Build): paint blocks, heights, colours, lamps and
  batteries, choose the allowed tiles and strip sizes, then test it. Solving
  your own level sets its par and unlocks a share code (`RR1.…`) or link.
  Friends paste codes into *My levels*.

## Controls

| Input | What it does |
| --- | --- |
| Tap / click a palette tile | Add it at the caret (the yellow bar) |
| Drag a palette tile | Drop it anywhere in a strip, including inside a Repeat |
| Tap a strip tile | Take it out (the caret moves there) |
| Drag a strip tile | Move it; drop it off the strips to delete it |
| Tap a Repeat's ×n badge | Change the count |
| Colour brush, then tap tiles | Paint them red or blue (tap again to clear) |
| **F L R J E G O 1** | Add Forward, Left, Right, Jump, Light, Grab, Repeat, P1 |
| **← →** / **↑ ↓** | Move the caret / switch between ▶ and P1 |
| **Backspace / Delete** | Remove the tile before / after the caret |
| **C**, **+ / −** | Cycle the colour, change a Repeat count |
| **Space / Enter** | Run, pause, carry on |
| **S** or **.** | Step one tile |
| **X**, **T**, **V** | Reset Bolt, change speed (1×/2×/4×), turn the camera |
| **H**, **M**, **Q** | Hint, mute, level map |
| **Esc / P** | Pause (*Back to arcade* lives here) |

In the editor: **1–9** pick a tool, arrows move a cursor, **Space** applies.
Everything is reachable with Tab too. The phone layout (390 × 844) fits
without scrolling; the board takes whatever room the program panel does not
need.

## Files

```
index.html          page, HUD, program panel, editor panel and overlays
style.css           presentation
src/rules.js        boards, programs, the interpreter (DOM-free)
src/levels.js       the 48 levels with reference solutions
src/solver.js       BFS over world states and a brute-force program search
src/daily.js        date-seeded daily circuit generator
src/code.js         share codes
src/progress.js     saves, stars, unlocks, bugs, streaks (DOM-free)
src/animator.js     turns interpreter events into Bolt's poses (DOM-free)
src/editor.js       the level editor (draft helpers are DOM-free)
src/panel.js        palette, strips, caret, drag and drop
src/render.js       isometric renderer, Bolt, particles
src/bugs-art.js     Bug Zapper artwork
src/audio.js        synthesized sound effects and music
src/icons.js        tile icons
src/main.js         screens, input, frame loop, telemetry
tests/              node:test suites
```

Saves live under the `robo-route.v1` local-storage key.

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?fresh` | Start with a clean save |
| `?unlock` | Open every world and level |
| `?level=3-6` | Jump straight into a level |
| `?autopilot` | Load each level's reference solution and play through the campaign |
| `?speed=4` | Start at 4× speed |
| `?daily=2026-10-02` | Pretend it is another day; `?dailyplay` opens the daily |
| `?editor` | Open the level editor |
| `?code=RR1.…` | Play a shared level |
| `?reduced` | Force reduced motion |

`window.RR` exposes a few hooks for testing (`RR.solve()`, `RR.frameStats()`,
`RR.crashNextFrame()`).

## Tests

```sh
node --test 'games/robo-route/tests/*.test.js'
```

They cover the interpreter, every level's reference solution, exact pars for
Tinker Yard (BFS) and Loop Lagoon (exhaustive search), no small shortcuts in
the later worlds, 90 days of daily circuits, share codes, saves, unlocks,
bugs, the editor helpers and the animator.
