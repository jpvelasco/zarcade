# Pocket Kart: design

A top-down Canvas kart racer for all ages. Six cartoon critters race on tight,
colourful toy-world tracks: drift for mini-turbos, grab item boxes, and win cup
trophies. Fills the arcade's Racing shelf next to Sundown Rally (3D zombie jeep)
and Globe Grand Prix (3D world tour): this one is 2D, item-based and toy-sized.

## Goals

- **Feel first.** Responsive steering, a hop-into-drift with a three-tier
  mini-turbo (blue, orange, pink sparks), bouncy bumps, and a camera that
  leads the kart.
- **Rivals.** Five AI critters with distinct personalities. They drive the
  same physics as the player through the same controls (steer, gas, brake,
  drift, item). Rubber-banding only nudges an AI's top speed by at most ±5%,
  so nobody jumps or teleports.
- **Items.** Bubble Shield, Bouncy Star (dropped behind), Turbo Mushroom,
  Triple Turbo, Homing Jelly (chases the racer ahead) and Comet Ride (a short
  autopilot dash). Item odds shift toward the strong ones the further back you
  are.
- **Content.** Three cups of four tracks: Toybox Cup, Candy Cup, Starlight Cup,
  with distinct palettes, walls, ground and decorations, plus a procedural
  Daily Dash track from the local date.
- **Sticky.** Cup trophies (bronze/silver/gold) per speed class, time trial
  with a ghost of your best lap and medal targets, karts and racers to unlock
  with honest stat trade-offs, and a daily time trial with a gentle streak.
- **Kids.** No fail state: walls slow you rather than stop you, a tail-wind
  mercy turbo helps anyone far behind, a race always ends with a placing,
  and every cup can be finished whatever the result.

## Architecture

ES modules (`package.json` `"type": "module"`), served over HTTP. The
simulation is DOM-free and Canvas-free; the renderer only reads it.

| Module | Responsibility |
| --- | --- |
| `src/math.js` | Seeded RNG (mulberry32), hashes, clamp/lerp, angle helpers |
| `src/track.js` | Builds a track from data: closed Catmull-Rom centreline resampled every 8 units, widths, normals, curvature, walls, checkpoints, boost pads, item boxes, shortcuts, racing line, projection with a moving hint |
| `src/tracks.js` | The twelve tracks as data (control points, width, verge, theme, pads, boxes, shortcuts, bumpers) and the three cups |
| `src/daily.js` | Daily Dash: date key, seeded procedural track (rejection-sampled until valid), streak |
| `src/karts.js` | Racers (critters, personalities, colours) and karts (stats that all sum to the same total) |
| `src/kart.js` | Arcade kart physics: speed along a move angle that chases the heading, drift hop and charge, mini-turbo, surfaces, wall bounce, bumps |
| `src/items.js` | Item definitions, position-weighted rolls, item effects |
| `src/ai.js` | AI driver: pure pursuit on the racing line, curvature speed profile, drifting, items, personalities, rubber band |
| `src/race.js` | One race: grid, countdown, laps and checkpoints, positions, kart and item collisions, item boxes, mercy turbo, finish and results, ghost recording, events |
| `src/ghost.js` | Compact ghost encoding (int16 samples at 20 Hz, base64) |
| `src/reference.js` | Expert lap: chunked deterministic sim that gives medal targets and a "gold ghost" |
| `src/progress.js` | Save `pocket-kart.v1`: field-by-field sanitise, trophies, unlocks, best laps, ghosts, cup in progress, settings |
| `src/view.js` | Pure camera maths: zoom and kart anchor for any viewport |
| `src/perf.js` | Frame monitor copied from Comet Crush |
| `src/sprites.js`, `src/render.js` | Baked sprites, track drawn from cached `Path2D`s, camera, particles, minimap |
| `src/audio.js`, `src/input.js`, `src/main.js` | Synth audio through one master gain, controls, screens and the loop |

### Track model

- **Centreline** is a closed Catmull-Rom spline through hand-placed control
  points, resampled at even arc length. Each sample has position, tangent,
  normal, half-width and curvature.
- **Corridor.** Road (half-width `w`), then a verge (`v`, slow surface), then a
  wall. A kart is legal while its lateral offset is within `w + v - r` of the
  main centreline, or inside a shortcut's corridor. Walls are the boundary of
  that union, so shortcuts need no special wall data.
- **Shortcuts** are short splines from one main-track distance to another
  across an infield. Progress maps linearly from the entry to exit distance,
  so laps and positions stay continuous. Their surface is slower unless
  boosting, so they pay off with a mushroom or a mini-turbo.
- **Checkpoints** are eight evenly spaced distances. A lap counts only after
  passing them in order, and progress can never jump more than a short
  distance per step.
- **Racing line** is an offset per sample toward the inside of each bend
  (from smoothed curvature), clamped to the road, then smoothed again.

The validity test checks every track and 400 daily seeds: closed, no
self-intersection (non-neighbouring samples stay a road width apart), every
bend radius larger than the inner offset, pads/boxes/bumpers on the road,
shortcuts inside the map and joined to the road, grid slots on the road,
checkpoints in increasing order, and an AI-only race where every racer
finishes three laps within a time limit.

### Kart physics

Speed is a scalar along a *move angle* that chases the heading (fast when
gripping, slow while drifting, so a drift slides outward). Bumps and wall
hits add a short-lived push vector. All tuning lives in `KART` in `kart.js`.

- Steering rate scales with speed (no spinning on the spot).
- Drift: press drift while steering at speed: a small hop, then the kart
  turns in that direction. Steering into the drift tightens it, away widens it.
  Charge grows with time (faster when tight). Tiers at 0.6 s, 1.2 s, 2.0 s
  show blue, orange, pink sparks. Releasing fires a 0.5/0.85/1.25 s turbo.
- Off-road verge caps speed at 62% (95% while boosting).
- Wall hit: the into-wall part of the velocity bounces back softly, the
  along-wall part keeps 92%, and the nose turns along the wall. A head-on hit
  still keeps 35% of the speed, along the track direction.
- Kart-to-kart: circle collisions with mass from the kart's weight stat,
  bouncy restitution, squash animation.

### Items

| Item | Effect |
| --- | --- |
| Bubble Shield | 10 s bubble that blocks one hit and bounces bumpers harder |
| Bouncy Star | Dropped behind; whoever touches it bounces up and slows for a moment |
| Turbo Mushroom | 1.2 s boost |
| Triple Turbo | Three mushrooms |
| Homing Jelly | Follows the track to the racer one place ahead; a wobble on hit |
| Comet Ride | 2.6 s fast autopilot dash, can't be hit, nudges others aside |

Rolls interpolate weight tables by place (first to last) and by how far
behind the leader the racer is. Leaders mostly get shields and stars; the
back of the pack gets triple turbos, jellies and comets. A "hit" is always a
short wobble, never a stop.

### AI

Pure pursuit toward a look-ahead point on the racing line, plus a target
speed from the tightest curvature ahead. Personalities set line accuracy,
look-ahead, braking margin, drift willingness and tier patience, item
timing, shortcut use, bumping, and a small seeded wobble. Rubber band: AI top
speed ×(0.95…1.05) from its distance to the player, capped, and only in the
first two laps for leaders. Difficulty classes (Cosy, Zippy, Turbo) scale AI
skill and everyone's base speed.

### Progress and hooks

- Grand Prix: pick a class and a cup, four races, points 10/8/6/4/2/1.
  Bronze, silver or gold by final standing. Toybox is open; finishing a cup
  (any place) opens the next, so nobody gets stuck. The cup in progress is
  saved after each race; a result is recorded the moment the player crosses
  the line.
- Time trial: 3 laps alone with the ghost of your best lap (or the gold ghost
  until you have one). Medal targets come from the expert reference lap.
- Daily Dash: a new procedural track each local day, best time per day,
  streak and best streak, plays counted.
- Unlocks: 4 of 6 karts and 2 of 8 racers start locked, with silhouettes and
  plain hints (a trophy in a cup, time trial medals, daily dashes played).
- Settings: sound, music, camera (turns with the kart / stays north-up),
  easy drift (touch), auto-go.

## Screens

Title (attract race behind it, `← Arcade`), Grand Prix (class + cups), Garage
(racer + kart), Time Trial (track list), Daily Dash, Trophies (shelf with
silhouettes), Options, Pause (Resume, Restart, Options, Back to arcade), race
results, cup results, time trial results. Menus work with arrow keys, the
d-pad, A/B and Start.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Steer | ← → / A D | left stick / d-pad | drag anywhere (floating pad) |
| Go | ↑ / W (or Auto-go) | Auto-go, or X | auto |
| Brake / reverse | ↓ / S | B / LT | drag down |
| Drift | Space / Shift | RT / RB | DRIFT button, or easy drift |
| Item | X / E / Enter | A | ITEM button |
| Pause | Esc / P | Start | ❚❚ |
| Mute | M | | 🔊 |

Touch: the floating steering pad works with either thumb, so one hand can
drive; easy drift starts a drift after holding a hard turn and fires the turbo
when you straighten. Two hands: steer on the left, DRIFT and ITEM on the
right. The top-centre 60 px stays empty for the full-screen pill.

## View

The canvas fills the window at any size. The camera rotates with the kart
(or stays north-up), leads in the direction of travel, and picks its zoom from
the viewport so a 390×844 phone, an 844×390 phone and a 16:10 desktop all see
enough road ahead. Resizes and rotations apply on the next frame.

## Performance

No `shadowBlur` or filters in the frame loop. Kart, item, decoration, glow
and spark sprites are baked once per scale. The track is a handful of cached
`Path2D` fills and pattern fills under one transform. Decorations and skid
marks are culled and capped, particles capped (fewer with reduced motion).
DPR capped at 2 with a quality scaler that steps down on slow frames.

## Testing

`node:test` files for math, track building and validity (all tracks, 400
daily seeds), kart physics, items, AI (every track finished, personalities
distinct, no teleporting), race rules (laps, checkpoints, positions, no fail
state, mercy turbo), ghosts, reference laps, progress sanitising, view maths
and the copied perf monitor. Browser checks over CDP on desktop, 390×844 and
844×390 touch, reduced motion and CPU ×4.
