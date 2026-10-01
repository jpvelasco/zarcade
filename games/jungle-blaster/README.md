# Jungle Blaster 2600

A retro run-and-gun jungle platformer. It's drawn in chunky low-res pixel art
with horizontal color bands like an Atari 2600 cartridge, but it plays at a
smooth modern 60 fps. Swing on vines, hop across croc heads, dodge rolling
logs, sink into quicksand, and climb down ladders to tunnels full of treasure.
Along the way, blast robot raiders with Contra-style 8-way aiming and fight a
giant boss at the end of every stage.

Open it through the dev server (it uses ES modules):

```sh
npm run serve   # then http://localhost:8000/games/jungle-blaster/
```

## How to play

- **Adventure** (the default, kid-friendly): 3 hearts per life, 5 lives,
  checkpoints that refill your hearts, and endless continues that keep your
  score. Falling into water, lava or quicksand costs one heart and puts you
  back on safe ground.
- **Arcade**: one hit costs a life, 3 lives and 3 continues. Continuing
  resets your score, so the high-score table stays honest.
- **1 or 2 players** co-op. The camera keeps both players on screen.
- Six stages: Jungle, River, Caves, Temple, Volcano and Alien Base. Each ends
  with a multi-phase boss: KONG-TRON 2600, the Iron Croc, the Drill Mole, the
  Golden Idol, the Magma Wyrm and the Mothership.
- Shoot the floating capsules to get **S**pread, **L**aser, **R**apid and
  **F**lame guns, **B**ombs (clear the screen) and **♥** hearts. Find gold
  bars, diamond rings and jade idols for treasure bonuses.
- You get an extra life every 30,000 points. High scores take three-letter
  initials.

## Controls

| | Keyboard (1 player) | Gamepad | Touch |
| --- | --- | --- | --- |
| Move / aim | Arrows or WASD | Stick or d-pad | Virtual stick |
| Jump (hold to jump higher) | Z, J or Space | A | JUMP |
| Shoot (hold for auto-fire) | X or K | X or B (or RT) | FIRE |
| Bomb | C or L | Y or RB | BOMB |
| Pause | Esc or P | Start | ❚❚ |

- Press **up** to aim up. Hold **down** on the ground to lie prone. Press
  **down + jump** to drop through a ledge.
- Jump into a vine to grab it, lean with the swing to pump it higher, and
  press jump to let go.
- Press **M** to mute.

**Two players on one keyboard:** P1 uses WASD to move, F to jump, G to shoot
and H for a bomb. P2 uses the arrows to move, `,` to jump, `.` to shoot and
`/` for a bomb. With two gamepads, each player gets one. With one gamepad, it
goes to P2.

**Options:** CRT glow and scanlines, 2600 mode (stricter palette, fat
horizontal pixels and gentle sprite flicker), screen shake, music and sound.
With reduced motion, the game turns off shake, flicker and strobing, and uses
fewer particles.

## Files

| File | What it does |
| --- | --- |
| `src/tiles.js` | Tile characters and predicates |
| `src/levels.js` | One-screen ASCII rooms, the six stages built from them |
| `src/physics.js` | Running, variable jumps, coyote time and jump buffering, ladders, vine pendulums, quicksand |
| `src/weapons.js` | Guns and bullets |
| `src/enemies.js` | Raiders, snipers, jumpers, flyers, scorpions, turrets, leapers, logs |
| `src/bosses.js` | Six bosses with scripted, telegraphed attack phases |
| `src/world.js` | The simulation: players, hazards, pickups, camera, boss arena, continues |
| `src/ai.js` | The autopilot: plans inputs through the real physics (title demo and tests) |
| `src/reach.js` | Coarse reachability check used by the level tests |
| `src/progress.js` | Save file and high-score table (`jungle-blaster.v1`) |
| `src/palette.js` | Stage themes, the 2600-mode palette, the 3×5 pixel font |
| `src/music.js` | The soundtrack, written as tracker data |
| `src/render.js` | Canvas rendering at 320×180, parallax, particles, CRT bloom, 2600 mode |
| `src/audio.js` | WebAudio chiptune player (two pulse channels, triangle and noise) and sound effects |
| `src/input.js`, `src/main.js` | Controls, screens, game loop and telemetry |

Everything above `render.js` is DOM-free, so the Node tests can drive the
real game.

## Debug parameters

- `?stage=N`: start Adventure mode at stage N (1–6). Add `&mode=arcade` for
  Arcade mode.
- `?boss`: start just outside the stage's boss arena.
- `?autopilot`: the autopilot plays as P1.
- `?players=2`: start in two-player mode.
- `?retro`: turn on 2600 mode. `?nocrt`: turn off the CRT effect.
- `window.JungleBlaster` exposes the state, world, renderer and save.
  `JungleBlaster.crash()` forces a frame crash to test the crash screen.

## Tests

```sh
node --test 'games/jungle-blaster/tests/*.test.js'
```

The tests cover:

- Physics feel: coyote time, jump buffering, variable jump height, ladders,
  ledges, vines and quicksand.
- Weapons and bosses: weapon behavior, boss phases and patterns, and wind-ups
  that always come before damage.
- Level data: every stage can be finished and every treasure reached.
- World rules: hearts, respawns, continues, extra lives and co-op camera.
- Saves and the high-score table, plus the music data.
- The autopilot clearing stage 1 in both modes.
