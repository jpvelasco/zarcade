# Spooky Spotter

A friendly haunted-mansion hidden object game. Hollowhush Manor is not haunted
so much as *lived in*: nine shy ghosts live there and they have mislaid their
favourite things. Search seven cluttered rooms for a teddy, a teacup, a stripy
sock, a brass key and thirty-odd other treasures. Everything you find floats
across the room to its owner, who brightens up and does a happy swirl. Clear a
room and that part of the manor wakes up — the dust clears, the lamps come on,
and another window lights up on the map. Wake all seven and the ghosts throw a
party.

Nothing jumps out at you, nothing chases you, and no timer can ever fail you.

## How to play

Pick a room from the mansion map, then find everything on the list beside the
picture. Every hidden thing is genuinely visible and clickable — a sock may be
half behind a curtain, but the half that shows always answers a click.

Three ways to play each room:

| Mode | What you do |
| --- | --- |
| **Find the things** | Six to nine lost things, listed with the ghost who owns each one. |
| **Spot the difference** | The same room twice, side by side, with five to seven changes. |
| **Silhouette hunt** | The list is shapes only. No names, no help. |

The **Find** round of a room opens the room after it, and clearing it opens
that room's other two modes. A room is fully awake once all three are done.

- **Stars.** One for finishing, always. A second for beating par time and a
  half, a third for beating par with at most one lantern used.
- **The lantern** recharges on its own and lights up the area around the next
  thing on the list. It never points at the exact spot.
- **Tapping at random** puffs up a little fog for half a second. It never
  costs you points and it never stops you finishing.

## Things to collect

- **The mansion map** lights a window for every room you wake up.
- **The ghost album** fills in as you return things: nine residents with names,
  bios and a thank-you line each.
- **The curio cabinet** holds 24 trinkets: one for each room mode you clear,
  plus three secrets for spotting the manor mouse.
- **Today's room** comes from the date, so it is the same room for everybody
  all day, and there is a gentle streak counter for coming back.
- **Personal bests** per room and mode, on the map and the results card.

## Controls

| Input | What it does |
| --- | --- |
| Click / tap | Pick up what you spotted |
| Drag | Look around the room |
| Wheel / pinch | Lean in and out |
| Arrows or WASD | Move the spotting ring |
| Enter / Space | Pick up what the ring is over |
| `[` `]` | Step through the list |
| `+` `−` `0` | Zoom in, out, reset |
| `H` | Hint lantern |
| `M` | Sound on and off |
| `Esc` / `P` | Pause |

The pointer hides after a couple of seconds of stillness while you are playing
and comes back the moment you move it. `prefers-reduced-motion` turns off the
dust, the shake and most of the sparkle.

## Files

```
index.html        the page: canvas, HUD, list tray, overlays
style.css         everything visual that is not drawn on the canvas
src/rng.js        seeded random numbers, the day key and streak maths
src/items.js      the 36 findable things: size, where each one can hide
src/props.js      the prop library: ~60 props with cover rects and hide slots
src/rooms.js      the seven rooms as recipes, modes, par times, scene box
src/ghosts.js     the nine residents and who owns what
src/curios.js     the 24 curios and how each is earned
src/scene.js      scene composition, visibility masks, hit testing
src/modes.js      Spot the Difference: mutating a scene into a second picture
src/game.js       progress, stars, curios, the daily room, personal bests
src/save.js       one localStorage key, read and written in try/catch
src/solver.js     the autoplayer: tests, ?autopilot and the title attract room
src/art.js        procedural drawings for every prop
src/sprites.js    the things, the ghosts, the curios and the room shells
src/render.js     camera, baked room plates, effects, the frame loop's painter
src/audio.js      synthesized celeste lullaby and chimes
src/ui.js         the list, map, album, cabinet, help and results DOM
src/main.js       screens, input, saves, telemetry
src/perf.js       frame-time telemetry (shared copy)
tests/            node:test suites, including the visibility guarantees
```

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?room=attic` | Start straight in a room (`library`…`observatory`) |
| `?mode=diff` | With `?room=`: `find`, `diff` or `hunt` |
| `?seed=123` | With `?room=`: a specific layout |
| `?autopilot` | A bot plays the round |
| `?solve` | Finish the round immediately |
| `?unlock` | Open every room |
| `?fresh` | Wipe the save first |
| `?reduced` | Force reduced motion |
| `?crash` | Throw once in the frame loop, to see the crash screen |

## Tests

```sh
node --test 'games/spooky-spotter/tests/*.test.js'
```

The important ones are in `tests/scene.test.js`: every room, at several
viewport shapes and many seeds, must place every hidden thing inside the room
with at least 45% of it showing, at least 950 square units visible, and a
13-unit clickable disc inside the visible part — and a click in the middle of
each thing must find that thing and nothing else.

## Saves

Everything lives under the `spooky-spotter.v1` localStorage key: stars, best
times, ghosts met, curios, mouse sightings, the daily streak and your sound
settings. Reads and writes are wrapped in try/catch, so play still works where
storage is blocked.
