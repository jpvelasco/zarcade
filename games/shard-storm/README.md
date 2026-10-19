# Shard Storm

A neon slice arcade for the Starlight Arcade. Crystals arc up out of the storm
below; swipe a glowing blade through them before they fall back. Every crystal
you miss feeds the **storm surge** — and a full surge costs a life.

## How to play

- **Slice:** move the mouse (or swipe) across the playfield. The blade is a
  fast swipe: the faster and longer the move, the more it catches.
- **Storm surge:** the meter at the bottom left fills every time a crystal
  falls back past you. Fill it and you lose a life and the meter drops back
  partway. Slicing bleeds it down; a miss costs more the higher the storm
  climbs. The screen edges bloom red as it rises, so it never arrives
  unannounced.
- **Storm Break:** slicing charges the meter at the bottom right. Full, press
  **Space**, tap the bar, or tap with a second finger: every crystal on screen
  shatters for bonus points, the mines are defused harmlessly, and a chunk of
  surge is dumped. It is both the reward for a clean streak and the panic
  button when the surge is nearly full.
- **Combos:** slicing several crystals in one swipe, or chaining slices within
  a short window, builds a combo worth more per crystal. Big swipes and big
  combos trigger **slow-mo** for a breath.

### What the storm throws

| Kind | Looks like | Does |
| --- | --- | --- |
| Crystal | five-point gem, six colours | the bread and butter |
| Cluster | mint-ringed shell of four gems | bursts into four small shards — the combo engine |
| Frost | pale hexagon with a snowflake | slow-mo and a big surge drain |
| Gold | warm six-point star, rare | a lot of points, and a life back when below max |
| Mine | red spiked ball | slicing one costs a life; letting it fall is the right move |

Some crystals and clusters wear a **shell**: one slice cracks it, the next one
opens the gem. Nothing warm and gold is ever a plain crystal, so the prize is
always easy to spot.

- **Endless:** the storm level rises every 10 s. The first 20 s hold no mines
  at all; then mines arrive alongside frost, and later shells and the first
  golden shards. Spawns tighten and volleys grow as it climbs.
- **Daily Storm:** a date-seeded storm with a target score. Clear it to bank
  the day; clear consecutive days to build a streak.

Controls:

| Input | Slice | Storm Break | Pause | Mute |
| --- | --- | --- | --- | --- |
| Mouse | move across the field | Space | Esc / P | M |
| Touch | swipe anywhere | tap the bar, or a second finger | ❚❚ | — |

`?autopilot` replays a demo bot and never writes the save. `?seed=N` fixes the
storm, and `?dailyTarget=N` lowers the daily goal for route checks.

## Architecture

- `src/world.js` — the DOM-free simulation: fixed 1/120 s steps, crystal arcs
  under gravity, swept-segment blade hits, the surge and Storm Break meters,
  every crystal kind, combo / slow-mo, storm waves, and the game-over path.
  Lives only ever change through `loseLife` / `gainLife`, so they cannot go
  out of range.
- **Screen shape.** The field is always 900 units tall; its width follows the
  window (`fieldWidthFor`, 400–2000), so the storm fills a desktop, an upright
  phone and a sideways phone with no panel or gutters. Wider fields throw
  proportionally more crystals, and each miss or slice counts proportionally
  less (`World.density`), so the pressure per second is the same on any
  screen. On short screens crystals and their hitboxes grow up to 1.6×
  (`objectScaleFor`) so they stay readable. Resizing or turning a phone
  mid-run rescales whatever is in the air (`World.setWidth`).
- `src/config.js` — every tunable constant in one place.
- `src/daily.js` — date-seeded daily storm, target, streak.
- `src/progress.js` — the save (`shard-storm.v1`), its field-by-field
  sanitising load, and `mergeSave` for folding in another tab's save.
- `src/ai.js` — the autopilot used by `?autopilot` and the title attract. It
  values kinds, dodges mines and spends Storm Break.
- `src/render.js` / `src/audio.js` — canvas drawing and Web Audio synth. Every
  crystal is a sprite baked once into an offscreen canvas, so no `shadowBlur`
  runs per frame. The renderer reads world state; it never mutates it.
- `tests/` — `node:test` coverage of the pure modules.

## Tests

```sh
node --test 'games/shard-storm/tests/*.test.js'
```
