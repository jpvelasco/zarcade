# Hoop Heroes

An arcade basketball shooting game for the Starlight Arcade. You are Ace, a
puppy in a bright jersey. Flick the ball up at the hoop: the direction aims
and the speed of the flick sets the power. Balls arc, rattle on the rim, bank
off the board and swish through a springy net.

## Modes

- **Tournament**: twelve animal rivals over four courts (Sunny Park, Boardwalk
  Beach, City Rooftop and a low-gravity Space Station). Each rival is a short
  head-to-head round; their score shows in the rival card. Beat a court's three
  rivals for its trophy, and King Leo for the Golden Hoop.
- **Quick Play**: 60-second Hot Shot, Moving Hoop or Money Racks on any court
  you've unlocked.
- **Trick Shots**: 12 star-rated levels: bank only, over the bouncy bear, and
  off the trampoline.
- **Daily Shootout**: one round per local date (same rules, court and spots
  for everyone that day) with a gentle day streak.

Three swishes in a row set the ball **on fire** (double points until a miss).
In Money Racks the rainbow ball of each rack is worth double. Three rotating
**challenges** on the title screen pay tickets; tickets buy balls, jerseys
and court themes in the **Locker**. Trophies unlock special items.

## Controls

| Action | Touch / mouse | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Shoot | flick up toward the hoop | Space / Enter / ↑ when the marker is in the green | A |
| Nudge aim | flick direction | ← → | stick / d-pad |
| Pause | ❚❚ button | Esc / P | Start |
| Mute | 🔊 button | M | |

Menus work with arrow keys / d-pad and Enter / A. *Easy aim* (title screen)
halves aim and power errors, and the game slowly learns how hard you like to
flick.

## Files

- `src/physics.js`: deterministic ball flight, rim (torus), board, blockers,
  trampoline and floor.
- `src/shots.js`: ideal-shot solver (analytic, bank and trampoline solves)
  and the flick/meter-to-launch mapping.
- `src/ai.js`: rival accuracy per difficulty, and the autopilot.
- `src/round.js`: one shooter's round (clock, spots, racks, fire, scoring).
- `src/modes.js`, `src/rivals.js`, `src/courts.js`, `src/cosmetics.js`,
  `src/missions.js`: data and rules.
- `src/save.js`: progress under the `hoop-heroes.v1` local-storage key.
- `src/render.js`, `src/sprites.js`, `src/audio.js`, `src/input.js`,
  `src/main.js`: browser side (perspective canvas renderer, baked art, WebAudio).

## Debug parameters

- `?autopilot`: the all-star AI shoots for you
- `?mode=timed|moving|racks|daily` start a round; `&court=park|beach|roof|space|neon|candy`
- `?rival=hops` (any rival id) open the versus screen
- `?trick=bank1` (or `?trick=3`) start a trick-shot level

## Tests

```sh
node --test 'games/hoop-heroes/tests/*.test.js'
```
