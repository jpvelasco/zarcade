# Moonshot Mini Golf: design

Cartoon mini golf across the solar system. The game is top-down 2D Canvas,
aimed at all ages, with no timers. There are 18 handcrafted holes in three
themed worlds of six holes each. Each world is played as a round with a
scorecard between holes.

## Feel

- **Slingshot putting.** The player drags back from anywhere, so a finger
  never covers the ball. Pull distance sets power, and the launch speed is
  linear from 45 to 1050 px/s. A dotted preview marches the launch direction,
  loses speed to each surface it crosses, and reflects once off the first
  wall. Keyboard and gamepad aim by rotating, and holding Space or A charges a
  power meter that ping-pongs.
- **Friction per surface.** Each surface has constant rolling resistance plus a
  speed-proportional drag: moon dust (slippery), Mars clay, stardust, sand
  (grabs the ball) and comet ice (glides). A slow ball comes to rest only when
  friction beats every slope and gravity force on it.
- **Walls** reflect the ball with restitution 0.72 and a little tangential
  loss. Moving walls add their own contact velocity: windmill arms use ω × r
  and sliders use the derivative of their offset. Bumpers kick the ball out at
  its incoming speed plus 260 px/s.
- **Cup.** The capture speed falls from about 500 px/s dead center to about
  190 px/s at the rim. A faster ball lips out: it slows by 20% and deflects
  away from the center. A slow ball hanging over the rim gets tugged in. Once
  captured, the ball slides to the center and shrinks as it drops.
- **Off the course.** Anything that is not floor is open space. Leaving the
  floor, touching lava or reaching a black hole's core costs one stroke, and
  the ball returns to the spot it was hit from. On a drifting platform, that
  spot is stored relative to the platform.

## Determinism

Moving scenery (windmills, sliders, drifting platforms) is a pure function of
the hole clock, and the simulation runs at a fixed 1/120 s step, sub-stepped
so the ball moves at most about 3 px per substep. A shot taken at the same
clock time replays identically, in Node and in the browser alike.

## Structure

| Module | Responsibility |
| --- | --- |
| `src/physics.js` | Hole compilation, surfaces, collisions, forces, cup, portals, aim preview |
| `src/play.js` | Per-hole state machine, strokes, penalties, stroke cap (par + 5) |
| `src/holes.js` | Worlds and hole data (floors, walls, zones, slopes, gadgets, par, tip) |
| `src/rules.js` | Score words, stars, unlocks, save file `moonshot-golf.v1` |
| `src/autoputt.js` | Walking-distance flood fill to the cup (respects walls, space, portals) plus full-simulation shot search |
| `src/render.js`, `src/audio.js`, `src/main.js` | Canvas art, synthesized sound, screens, input, loop |

All scripts are classic UMD files, so the game opens from `file://` and Node
tests `require` the same code.

## Worlds

1. **Moon Base** (moon dust): a straight opener, a crater cup (bowl), a
   dogleg, a boulder field, a rocket pad up a ramp, and a portal hop between
   islands.
2. **Mars Canyon** (clay): sand traps to bank around, a windmill turnstile in
   a funnel, a narrow canyon bridge, three rovers crossing, dunes with a dust
   pad chute, and Olympus Mons (a cup in a volcano's caldera, ringed by lava).
3. **Saturn Rings** (stardust): a ring road around the planet, a bumper
   field, a black hole to curve around, a chain of wormholes, a drifting
   asteroid bridge, and Saturn's Crown (a C-shaped ring with open ends, ice,
   bumpers and a wormhole shortcut).

## Progress

- **Stars per hole:** ★★★ under par, ★★ par, ★ one over.
- **Best scores:** the best score per hole and the best round total per world
  are saved. A picked-up hole never counts as a best.
- **Unlocks:** a world opens once the previous world's round has been finished.
- **Retry hole:** available from the pause menu, the scorecard, and the R key.

## Presentation

Each world has its own palette, floating-island courses with thickness and
drop shadows, terraced slopes lit from the top-left, and a sky planet (Earth,
Phobos, Saturn). Portrait phones rotate the course 90° so it fills the screen.
Juice comes from particles on bounces, a trail on the rolling ball, bumper
flashes, celebration text scaled by tier, and confetti for par or better (with
fireworks for eagles and aces). All motion is toned down under
`prefers-reduced-motion`. Sounds are synthesized with Web Audio: putt, bounces
per material, bumper boing, lip-out, cup plop, falls, portal, boost, stars and
cheers.

## Testing

- **Physics invariants:** monotonic slowdown on flat ground that matches the
  analytic roll distance, walls that never add energy, and no escapes from a
  walled box under random full-power shots. Also covered: sinking versus lip
  out, falling off edges, sand versus clay, portals, one-way boost pads,
  bumpers, black holes, bowls, and replay determinism on every moving-scenery
  hole.
- **Play rules:** sinking, penalties and respawn spot, the stroke cap, and
  riding a drifting platform.
- **Hole data:** counts and ids; tee, cup and portals on open floor and clear of
  walls and obstacles; everything inside the frame; a walking path from tee to
  cup.
- **Solvability:** the autoputter sinks every hole within par + 3 without
  picking up.
- **Browser checks:** a headless Chrome pass over the title, the world map,
  every hole, mouse, keyboard and touch putts, pause, scorecard, results,
  cursor hiding, and a 390×844 touch viewport.
