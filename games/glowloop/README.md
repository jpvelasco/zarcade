# Glowloop

Lasso the fireflies. Match the colors. Light up the night.

A calm-but-quick arcade game for all ages. Draw loops with your finger or mouse
to catch fireflies and fill your jar before the night ends.

## How to play

- **Draw a loop.** Whenever your trail crosses itself, everything inside is caught.
  Lifting your finger just short of the start closes the loop too (unless it
  would trap a thornbug, so letting go is still how you back out).
- **One color per loop = Harmony.** Harmony scores `10 × n²` (3 fireflies = 90) instead
  of `10 × n`. Back-to-back Harmonies build a streak multiplier (up to ×3).
- **Thornbugs** (spiky, from night 2) cost 5 seconds if caught in a loop. Your
  trail turns red and the bug puffs up with a `!` before the loop closes, so
  you can always back out.
- **Golden** fireflies add 5 seconds. **Rainbow** ones match any color.
- Your trail fades after ~1.6s, so draw loops quickly.
- Fill the jar to pass the night; 1.5× and 2× the target earn extra stars.
  **Continue** on the title screen picks up after your best cleared night.

## Something new every night

| Night | New | What it does |
| --- | --- | --- |
| 4 | Shy fireflies (dotted ring) | Flee your trail tip; count as 2 fireflies |
| 5 | Windy twist | Gusts push everything sideways |
| 6 | Twin fireflies (dotted tether) | Only caught together; count as 1.5 each |
| 7 | Blackout twist | Fireflies only show while blinking or near your trail |
| 8 | The Queen (crown) | Arrives mid-night; first loop cracks her shell, second catches her (counts as 5). Shell regrows after 6s |
| 9 | Swarm twist | ~60% more fireflies, a bit faster |
| 10+ | Rotating twists | Wind, blackout, swarm in turn, with every creature |

Twist nights scale the target (wind ×0.9, blackout ×0.8, swarm ×1.2).

Every color also has a shape (● ◆ ▲ ■) so the game is playable without color
vision. Keys: `P`/`Esc` pause, `M` mute. Motion effects respect
`prefers-reduced-motion`.

## Run

No build step and no dependencies. Open `index.html` in a browser, or serve it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Test

```sh
node --test 'tests/*.test.js'
```

## Layout

- `logic.js`: pure rules and geometry (loop detection, scoring, difficulty), shared by the browser and tests
- `game.js`: rendering, input, audio (Web Audio synthesis, no asset files), game flow
- `style.css`, `index.html`: menus and overlays
