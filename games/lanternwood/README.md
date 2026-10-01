# Lanternwood

A cozy top-down action-adventure, the arcade's first Zelda-like. The Great
Lantern that keeps Lanternwood glowing has gone out, and the mischievous
Shade King scattered its three Flame Shards into three dungeons. Play Wren, a
young lamplighter, with Tumble the fox at your heels.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/lanternwood/
```

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move (8 directions) | arrows / WASD | left stick / d-pad | left stick |
| Sword (and talk when facing someone) | Space / J | A | ⚔️ |
| Use item | K | X | item button |
| Talk / read / ask Tumble for a hint | E | B | 💬 |
| Swap item | Q / Tab | LB / RB | ⇄ |
| Bag and quest log | I | Y | 🎒 |
| Map | M | Back | 🗺️ |
| Pause | Esc / P | Start | ❚❚ |

In menus, arrows or the d-pad move between buttons and Enter, Space or A
picks one. In dialogue, Space / E / A (or a tap) advances the text.

## The adventure

- **Overworld**: 16 screens. Lantern Plaza and Market Row (shop, healer,
  quest-givers), Mosswood, Pebble Hills, Lake Shimmer and the mountains.
- **Mossy Burrow**: push a block onto a plate, light torches in the dark,
  beat the Big Slime, find the **Leafarang**, bonk a far-away switch, beat
  **Grumbletoad**. The leafarang also lowers the stuck drawbridge to the lake.
- **Sunken Bell Temple**: hit switches across the water, beat the
  Shellbeetle, find the **Vine Seeds** (grapple to wooden posts), push two
  blocks, and stun **Old Bellcrab** with a vine before bonking him. The vine
  seeds also cross the chasm to the mountains.
- **Clockwork Peak**: dark rooms, a Gear Knight, the **Ember Dash** that
  busts cracked rocks, and **the Shade King**, who can only be hit while three
  torches burn.
- Bring the shards to Grandma Wick and light the Great Lantern.

Side quests: find Mira's cat Biscuit, three honeycaps for Bun's pie, Hazel's
race to the flag, fishing at Lake Shimmer, the owl's riddle, and lighting the
five old lamp posts. Pell's Pantry sells Fairy Tea (an automatic revive), a
bigger berry pouch and heart snacks; Sage Moss heals for free.

Tumble chimes in the first time you walk into a puzzle or boss room with a
short tip, and points a brand-new player at Grandma Wick. Bosses only hurt
half a heart if you bump them (a sitting Grumbletoad not at all), and the
Shade King cannot snuff a torch while three are burning.

Running out of hearts is gentle: Wren wakes at the last lantern statue with
everything she found. There are three save slots under `lanternwood.v1`;
the game saves at statues, on every big moment and when you pause.

## Files

| File | What it does |
| --- | --- |
| `src/data/overworld.js`, `src/data/dungeons.js` | the maps as tile strings, with people, chests, enemies and puzzles |
| `src/tiles.js`, `src/areas.js` | tile meanings; builds areas, doors and gates; applies saved progress |
| `src/world.js` | the simulation: Wren, Tumble, rooms, items, puzzles, combat, quests, dialogue |
| `src/collide.js`, `src/combat.js` | sliding movement with corner nudging; damage, armor, knockback, i-frames |
| `src/enemies.js`, `src/bosses.js` | enemy and boss behaviour with telegraphed attacks |
| `src/quests.js`, `src/dialogue.js` | quest state machine and every conversation |
| `src/solver.js` | reachability / progression solver used by the tests and the autopilot |
| `src/ai.js` | autopilot that plays through dungeons with real controls |
| `src/save.js` | save slots |
| `src/render.js`, `src/tileart.js`, `src/sprites.js` | Canvas art, lighting, HUD |
| `src/audio.js`, `src/input.js`, `src/main.js` | music and effects, controls, screens and the loop |

## Debug parameters

- `?autoplay`: the autopilot plays Mossy Burrow (a throwaway game, not saved).
- `?area=burrow|temple|peak|overworld`: start a throwaway game there, with the
  items you would have by then; add `&items` for every item, `&night` for night.
- `?slot=2`: jump straight into a save slot.

## Tests

```sh
node --test 'games/lanternwood/tests/*.test.js'
```

The tests check every map and room, prove each dungeon can be finished with
the items you have when you arrive (in any order of using keys), walk the
whole adventure, and run the autopilot through two dungeons.
