# Shard Storm

A neon slice arcade for the Starlight Arcade. Crystal shards arc up from the
storm below; swipe a glowing blade through them before they fall. Dodge the
mines — three of them ends the run.

## How to play

- **Slice:** move the mouse (or finger) across the playfield. The blade is a
  fast swipe: the faster and longer the move, the more it catches.
- **Combos:** slicing several shards in one swipe, or chaining slices within
  a short window, builds a combo. Big swipes and big combos trigger
  **slow-mo** for a breath.
- **Shields:** some shards wear a shell. One slice cracks it; a second slice
  (or swipe) opens the gem.
- **Mines:** red spiky balls. Slice one and you lose a life. Three lost and
  the storm wins.
- **Endless:** the storm level rises every 12 s — spawns come faster, mines
  and shields become more likely.
- **Daily Storm:** a date-seeded storm with a target score. Clear it to bank
  the day; clear consecutive days to build a streak.

Controls:

| Input | Slice | Pause | Mute |
| --- | --- | --- | --- |
| Mouse | move across the field | Esc / P | M |
| Touch | swipe anywhere | ❚❚ | — |

`?autopilot` replays a demo bot and never writes the save.

## Architecture

- `src/world.js` — the DOM-free simulation: fixed 1/120 s steps, crystal
  arcs under gravity, swept-segment blade hits, combo / slow-mo, storm
  waves, and the game-over path.
- `src/config.js` — every tunable constant in one place.
- `src/daily.js` — date-seeded daily storm, target, streak.
- `src/progress.js` — the save (`shard-storm.v1`) and its sanitising load.
- `src/ai.js` — the autopilot used by `?autopilot` and the title attract.
- `src/render.js` / `src/audio.js` — canvas drawing and Web Audio synth.
  The renderer reads world state; it never mutates it.
- `tests/` — `node:test` coverage of the pure modules.

## Tests

```sh
node --test 'games/shard-storm/tests/*.test.js'
```
