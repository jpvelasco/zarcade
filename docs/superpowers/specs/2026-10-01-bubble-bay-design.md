# Bubble Bay: design

A seaside bubble shooter for all ages. Coral, a friendly hermit-shelled crab,
fires colored bubbles from a shell launcher. Match three or more of a color to
pop them; anything left hanging falls into the sea. Baby otters are trapped in
bubbles near the top, and every level has a clear goal. Generous by default:
a full aim guide, one free continue per level, boosters earned only by playing,
and no timers.

## Board model (DOM-free, `src/grid.js`)

- Hex grid in "bobble" layout: even rows hold `W = 10` cells, odd rows hold
  `W - 1 = 9`, shifted half a bubble right. The play field is exactly
  `2W` bubble radii wide, so walls sit flush with both row types.
- Units are bubble radii (`R = 1`). Row pitch is `sqrt(3)`.
- Grid row 0 hangs from the ceiling. The ceiling creeps down: `drop` counts
  how many rows it has moved; a bubble at grid row `r` sits on screen row
  `r + drop`. Row parity never changes, so neighbor math stays simple.
- Lose line: any bubble on screen row `>= LOSE_ROW` (12) ends the level
  (with a free continue on the first time).

| Cell | Matches | Removed by |
| --- | --- | --- |
| Color bubble (6 colors, each with its own glyph) | yes | match, drop, blast, zap |
| Rainbow bubble | joins any color group touching it | match, drop, blast, zap |
| Stone | never | drop, blast, zap |
| Ice (has a color) | no, until thawed | two hits: each adjacent pop or blast is one hit; the second hit shatters it |
| Bomb bubble | no | sets off (radius 2 blast) when a pop or blast touches it; chains |
| Lightning bubble | no | sets off (clears its whole row) when a pop or blast touches it; chains |
| Otter bubble | no | freed (rescued) by an adjacent pop, a blast, a zap, or by dropping |
| Anchor | no | only by dropping; the "drop the anchor" goal |

## Shots

- `traceShot(board, angle, kind)` walks the shot in fixed 0.1-radius steps,
  bouncing off the side walls, until it touches a bubble (distance < 1.7 R,
  slightly forgiving) or the ceiling. It snaps to the nearest free cell next to
  the contact. The same trace powers the aim guide and the ghost bubble, so
  what you see is exactly where the bubble lands.
- Angles are clamped to 10..170 degrees (straight up is 90).
- Lightning shots pass through bubbles, zapping everything along the path
  until the ceiling (anchors excepted).
- Resolution order: place, match (flood fill of the color plus rainbows, size
  3+), pop, side effects (ice hits, otters freed, bombs and lightning chain),
  then drop everything no longer connected to the ceiling.
- Rainbow shot: pops every color group of 2+ it touches (counting itself).
- Bomb shot: blasts radius 2 where it lands.

## Supply and fairness

- Each level has a fixed number of bubbles. The queue draws only colors still
  on the board (counting ice colors), seeded by level and attempt, so the
  player never gets a useless color. When only non-color pieces remain, any
  level color is drawn.
- Two bubbles are visible: loaded and next. Swap any time (tap Coral or the
  next bubble, `X`/Down, gamepad B).
- Ceiling creep: every `creep` shots (8 early, 5 late). A row of shell pips on
  the ceiling shows shots left; on the last two it wobbles and Coral warns
  "The tide is rising". Pops do not reset it (predictable for kids).

## Goals and stars

- Rescue all otters, pop N bubbles, or drop the anchor.
- Stars from bubbles left when the goal is met: 1 star for the goal,
  2 stars with `star2` left, 3 with `star3` left (per level, tuned from
  autoplayer runs).
- Score: 10 per pop (bonus for big groups), 20 per dropped bubble doubling per
  ten, 250 per otter, 100 per bubble left over (they splash out as a finale).
- Out of bubbles or past the lose line: once per level, "+5 bubbles" and a wave
  washes away the three lowest rows. Second time ends the level. Retry is one
  tap (or `R`) and rebuilds instantly.

## Levels (`src/levels.js`)

65 levels across five areas, 13 each. Each level is generated
deterministically from its id: a shape template, colors grown in clusters,
and the area's specials sprinkled in. Tests check every level's data.

| Area | Levels | New ideas | Colors |
| --- | --- | --- | --- |
| Tide Pools | 1–13 | basics, otters, rainbow bubbles | 3–4 |
| The Pier | 14–26 | stones, the anchor goal | 4 |
| Lighthouse Point | 27–39 | ice | 4–5 |
| Coral Reef | 40–52 | bomb bubbles | 5 |
| Sunken Ship | 53–65 | lightning bubbles, everything mixed | 5 |

Shapes: rows, pyramid, hanging vines (narrow stems with big clusters that are
great to drop), diamond, wave, columns, heart, cage (otters behind a shell of
stones), bridge.

## Autoplayer (`src/ai.js`)

Greedy one-ply search over ~90 angles for both the loaded and next bubble,
scored on goal progress, pops, drops and how low the board gets. Tests prove
it clears levels 1–20 with several seeds without a continue. It also runs
over every level as a fairness check: supply covers the board's colors and
the autoplayer finishes every level within its supply plus one continue.
`?autoplay` in the browser uses it as an attract mode.

## Sticky hooks

- Seaside map with stars on every level, area banners and a path.
- Boosters earned through play: one of each to start; +1 for each first
  clear of every third level, each new 3-star result, and each daily puzzle.
  Never sold, no currency.
- Otter Cove: 30 named otters (Pebble, Mochi, Kelp...) with their own fur
  tint and accessory. Missing otters show as silhouettes. Otters in a level
  are named; rescuing them adds them to the cove.
- Daily Tide: one puzzle per local date (seeded by `YYYY-MM-DD`), with a gentle
  streak (missed days reset it quietly; best streak is kept).
- Personal bests per level and for the daily, with a "New best!" moment.
- One-tap retry on fail and in the HUD.

## Controls

- Mouse/touch: drag to aim, release to fire. Releasing below the launcher
  cancels. Mouse hover also aims. Tap Coral or the next bubble to swap.
- Keyboard: Left/Right aim (hold Shift for fine), Space/Up fires, Down/X swaps,
  1/2/3 load boosters, R retries, Esc/P pause, M mute.
- Gamepad: stick or d-pad aims, A fires, B swaps, X/Y/RB load boosters,
  Start pauses.

## Rendering and juice

Canvas 2D. Bubble sprites (per color, special, otter) are baked once per size
into offscreen canvases; the area backdrop is baked per level and resize.
Pops cascade outward from the impact with rising pitch, spawn pooled splash
droplets (capped at 260, fewer with reduced motion) and score floaters. Dropped
bubbles fall with gravity and splash into the water strip. Freed otters hop
out, flip, and swim away on their backs. Reduced motion: no shake, fewer
particles, no flip.

## Saves

`bubble-bay.v1`: stars, best scores, unlocked, boosters, otters found, daily
record (last date, streak, best streak, best score), mute.
