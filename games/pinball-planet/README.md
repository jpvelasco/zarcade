# Pinball Planet

A space pinball table with real flipper feel. Catch the ball on a flipper,
let it roll, and flip at the right moment to hit orbits, the Comet Ramp and
the Black Hole. You get three balls. Visit all five planets!

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/pinball-planet/
```

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Left flipper | Left Shift / Z / ← | hold the left half | LB / LT |
| Right flipper | Right Shift / M / → | hold the right half | RB / RT |
| Plunger | hold Space or ↓, let go | swipe down, let go | hold A (or d-pad ↓) |
| Nudge | X (left) / C (right) | | X / B |
| Pause | Esc / P | ❚❚ button | Start |
| Sound | N | 🔊 button | |

In menus, arrow keys or the d-pad move between buttons; Enter, Space or A
picks one. The longer you hold the plunger, the harder it fires.

## Rules

- **Skill shot.** A medium launch crests the top and drops into one of the
  U-F-O lanes. Roll through the flashing one for 500,000. Flipper buttons
  move the flashing lane while the ball waits on the plunger.
- **U-F-O lanes.** Light all three to raise the bonus multiplier (up to 5×)
  and light a planet. The flippers rotate the lit lanes.
- **Planet Tour.** A flashing arrow marks a planet waiting at that shot:
  Mars (left orbit), Jupiter (spinner), Saturn (Black Hole), Neptune (Comet
  Ramp), Venus (right orbit). Visit all five for the tour award, and Extra
  Ball lights at the Black Hole.
- **Asteroid Field.** Knock down the three asteroids in front of the Black
  Hole for a 20 s frenzy: every switch scores +25,000 and the hole is open.
- **Black Hole.** The Comet Ramp lights the lock. Sink the ball in the Black
  Hole to lock it; lock two for 3-ball multiball. During multiball the ramp
  and both orbits score growing jackpots; three jackpots light a super
  jackpot at the Black Hole.
- **Combos.** Major shots within 4 s of each other chain into combos.
- **Ball save, kickback.** A drained ball in the first 10 s comes back. The
  left outlane kickback fires the ball back up once; 20 spinner spins relight
  it. The Black Hole also gives Space Mystery awards.
- **Tilt.** Nudging helps, but too much gives two DANGER warnings and then
  TILT: the flippers die and the ball is lost without its bonus.
- **Bonus.** At the end of each ball: planets, spins, asteroids and lanes,
  times the bonus multiplier.

High scores (top 5, with initials) are saved locally under
`pinball-planet.v1`.

## Files

| File | What it does |
| --- | --- |
| `src/physics.js` | Ball integration, sub-stepped collision against segments, arcs and circles, tapered-capsule flippers |
| `src/table.js` | Table geometry: outline, devices, switches, inserts |
| `src/rules.js` | Scoring, missions, ball save, tilt, bonus (DOM-free) |
| `src/world.js` | The simulation: flippers, plunger, devices, layers, drains |
| `src/ai.js` | Autoplayer for attract mode, `?autopilot` and tests |
| `src/dmd.js` | 128 × 32 dot-matrix display: fonts, scenes, callouts |
| `src/scores.js` | Save data and the high-score table |
| `src/render.js` | Canvas renderer with baked table art and sprites |
| `src/audio.js` | Synthesized sound effects and the space-funk loop |
| `src/input.js` | Keyboard, touch and gamepad |
| `src/main.js` | Screens, loop, telemetry |

## Debug

- `?autopilot` lets the autoplayer play a real game.
- `?seed=N` fixes the game seed (lit planets, mystery awards).
- In the console, `PP.world` is the running world and `PP.debug.crash = true`
  throws inside the frame loop to check the crash screen.

## Tests

```sh
node --test 'games/pinball-planet/tests/*.test.js'
```

Covers collision maths (including no tunnelling at 6000 units/s), the
flipper model (cradles, live catches, tap passes, flips from the cradle to
the upper playfield), table validity (closed outline, no escape except the
drain), rules and missions, the DMD, saves, and an autoplayer that keeps the
ball alive.
