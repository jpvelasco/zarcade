# Moonshot Mini Golf

Cartoon mini golf across the solar system. Putt a glowing ball through 18
handcrafted holes in three worlds. There are no timers, so take as long as you
like on each shot.

## How to play

- **Aim and putt:** drag back from anywhere on the course, then let go. The
  further you pull, the harder the putt. A dotted line previews the roll up to
  the first bounce. It turns red with an ✕ if the ball would roll off the
  course. Pull back close to where you started to cancel.
- **Sink it:** a slow ball drops into the cup. A fast one lips out, and a
  centered ball can go in faster than one that clips the rim.
- **Off the edge:** if the ball rolls into space, lava or a black hole, it
  comes back to where you hit it, with one penalty stroke.
- **Stars:** ★★★ under par, ★★ at par, ★ for one over. Each hole caps at par + 5
  strokes and then the ball is picked up.
- **Worlds:** Moon Base is open from the start. Finish a world's six-hole round
  to unlock the next world. Your best score for every hole and round is saved.

| World | Surfaces and gadgets |
| --- | --- |
| Moon Base | Slippery moon dust, crater bowls, moon rocks, a rocket pad and ramp, a portal hop |
| Mars Canyon | Sand traps, a windmill turnstile, a canyon bridge, rover traffic, dunes, a volcano with lava |
| Saturn Rings | Ring roads, bumpers, a black hole, wormhole chains, a drifting asteroid, comet ice |

## Controls

| Action | Mouse / touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Aim | Drag back | ← → or A / D (Shift for fine), ↑ ↓ nudge | Left stick or d-pad |
| Power and putt | Pull distance, release | Hold Space or Enter, release | Hold A, release (B cancels) |
| Pause | Pause button | Esc or P | Start |
| Retry hole | Pause menu or scorecard | R | Pause menu |
| Sound | Speaker button | M | |

On a portrait phone, the course rotates to fill the screen. The pointer hides
after 2 seconds without mouse movement during play. Confetti, screen shake and
other motion effects are toned down when `prefers-reduced-motion` is set.

## Run

No build step and no dependencies. Open `index.html` straight from disk, or
serve the repo with `npm run serve` and visit
`http://localhost:8000/games/moonshot-golf/`.

Debug query parameters: `?hole=7` jumps to a hole (1-18), `?unlock` opens every
world, `?worlds` opens the world map, and `?autoplay` lets the autoputter play.
Autoplay never writes the save.

## Test

```sh
node --test 'games/moonshot-golf/tests/*.test.js'
```

The tests cover physics invariants, play rules, save data and hole data. An
autoputter must also sink every hole within par + 3.

## Files

- `src/physics.js`: DOM-free ball physics. It handles surfaces, walls, cup
  capture and lip-outs, slopes, black holes, portals, boost pads, windmills,
  sliders, drifting platforms and the aim preview.
- `src/play.js`: the state machine for one hole (ready, rolling, sinking,
  falling, holed), plus penalties and the stroke cap
- `src/holes.js`: the three worlds and 18 holes, as pure data
- `src/rules.js`: score words, stars, unlocks and the `moonshot-golf.v1` save
- `src/autoputt.js`: a shot planner, used by the tests, the title-screen demo
  and `?autoplay`
- `src/render.js`: the Canvas renderer, which only reads play state
- `src/audio.js`: Web Audio sound effects, synthesized with no sound files
- `src/main.js`: screens, input, game flow and the frame loop
- `index.html`, `style.css`, `favicon.svg`, `cover.svg`: the page and artwork

The scripts are classic browser scripts (UMD style). Each one sets a
`window.Moonshot*` global, and the Node tests load the same files with
`require`.
