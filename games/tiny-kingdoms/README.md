# Tiny Kingdoms

A bite-size real-time strategy game on painted storybook islands, in the
style of Galcon and Mushroom Wars. Every castle, cottage and windmill grows
little round soldiers. Send them marching (or rowing!) to capture neutral and
rival buildings, and knock every rival kingdom off the map.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/tiny-kingdoms/
```

| Action | Mouse | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- | --- |
| Send soldiers | drag from your building to a target | drag | your building's letter, then the target's letter | hold A on your building, move, let go on the target |
| Gather several buildings | drag through them | drag through them | press several of your letters (or `1`–`9`) | hold A and pass over them |
| Tap-to-send | click yours, then click a target | tap, tap | arrows to move the cursor, Enter | stick or d-pad, A |
| Select all your buildings | | | `0` | LB |
| Clear the selection | click the water | tap the water | Backspace | B |
| Send half / all | ½ / All button, or hold Shift | ½ / All button | Space (or hold Shift) | X |
| Hero | hero button | hero button | H | Y |
| Reinforce your own building | drag to it | drag to it | Shift + its letter | A on it |
| Pause | ❚❚ | ❚❚ | Esc / P | Start |
| Mute | pause menu | pause menu | M | |

Building letters skip H, M and P. They appear as soon as you use the
keyboard (toggle them in the pause menu).

## Rules

- Owned buildings grow soldiers up to a cap. Neutral (grey) buildings keep a
  fixed garrison.
- A squad that reaches a hostile building fights its garrison: defenders count
  `troops × defence`. More attackers than that captures the building with the
  difference left over. Squads meeting head-on on the same road fight one for
  one.
- Out of buildings and squads means out of the game. Beat every rival to win.

| Building | Grows | Cap | Special |
| --- | --- | --- | --- |
| Castle | 1.2/s | 80 | Your capital |
| Cottage | 0.7/s | 40 | |
| Windmill | 1.6/s | 50 | Fastest growth |
| Tower | 0.4/s | 40 | Defence ×1.6, shoots passing enemy squads |
| Forge | 0.6/s | 40 | Your squads march 30% faster per forge (max 2) |
| Shrine | 0.3/s | 30 | Your buildings grow 25% faster per shrine (max 2) |

## Rivals

Duke Bramble (cautious), Queen Marigold (greedy) and Baron Fox (sneaky), each
Gentle, Easy, Normal or Hard.

## Progress

- **Campaign**: 32 maps over four regions (Clover Coast, Windmill Bay, Misty
  Fjords, Ember Isles). Win for a star, plus one star per goal (par time,
  never lose a building, few sends). Goals count across wins, and any win
  opens the next map.
- **Heroes** join after 3, 9, 17 and 25 campaign wins: Sir Pip (squad hits
  1.5× harder), Wren (squad marches twice as fast), Old Moss (shields the
  building he reaches), Shepherd Bo (doubles growth where she lands).
- **Banners**: kingdom colours and emblems unlock with stars, wins and daily
  streaks (My kingdom screen).
- **Daily skirmish**: a new island every day from the local date, with a
  streak of days won in a row and today's best time.
- **Skirmish**: generated islands by size, rival count and difficulty, with
  a best time per setting.

Saved under `localStorage["tiny-kingdoms.v1"]`.

## Files

- `src/sim.js` deterministic simulation (fixed 1/20 s step)
- `src/ai.js` rival AI and the reference bot; `simulate()` runs headless matches
- `src/mapgen.js` symmetric map generator, daily and skirmish setups, letters
- `src/campaign.js` the 32 maps, goals and par times
- `src/command.js` selection and drag state machine for every input
- `src/view.js` world ↔ screen transform (portrait screens turn the map)
- `src/progress.js` saves, stars, unlocks, streaks and bests
- `src/render.js`, `src/sprites.js` Canvas renderer and art; `src/audio.js` WebAudio
- `src/main.js` screens, input, HUD and loop; `src/perf.js` frame telemetry

## Debug parameters

- `?map=N` start campaign map N; `?daily`; `?skirmish`
- `?autoplay` the reference bot plays for you (results are recorded)
- `?unlock` every map, hero, colour and emblem
- `?speed=4` run the simulation faster

## Tests

```sh
node --test 'games/tiny-kingdoms/tests/*.test.js'
```

Troop maths, determinism, map validity and symmetry, every campaign map won
by the reference bot, a slower bot winning the early maps, AI difficulty
ordering, input commands, saves and frame telemetry.
