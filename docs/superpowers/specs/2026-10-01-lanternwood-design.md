# Lanternwood: design

A cozy top-down action-adventure for all ages, the arcade's first Zelda-like.
Canvas 2D, ES modules, no assets: every tile, sprite, portrait and note is
drawn or synthesized at runtime.

## Story

The Great Lantern in Lantern Plaza went out, and the Shade King scattered its
three Flame Shards into Mossy Burrow, the Sunken Bell Temple and Clockwork
Peak. Wren, a young lamplighter, and Tumble the fox fetch them back. The Shade
King turns out to be a lonely shadow who wanted a night that never ends; Wren
invites him to the Lantern Festival and he hands over the last shard. Lighting
the Great Lantern ends the story; play continues afterwards.

## World structure

Everything is a tile grid of 16 px tiles cut into 20 × 12 screens. The camera
shows one screen and slides to the next when Wren crosses an edge (0.55 s,
the simulation pauses). The overworld is 4 × 4 screens; each dungeon is a
3 × 3 grid of rooms. Dungeon rooms are authored as 18 × 10 interiors, and the
outer walls and doors are generated from a list of links (open, locked, boss,
shut). This keeps the map strings short and makes door mismatches impossible.

Progress is a set of flag strings (`open:<link>`, `solved:<area>:<room>`,
`chest:<uid>`, `crack:<area>:<tile>`, `lamp:<tile>` …). `liveGrid` applies
them to a copy of the authored tiles, so the game, the save file and the
solver all agree.

| Region | Gate | Item that opens it |
| --- | --- | --- |
| Village, Mosswood, Pebble Hills | none | sword + lantern at start |
| Lake Shimmer, Sunken Bell Temple | stuck drawbridge; its switch is across the river | Leafarang (Mossy Burrow) |
| Mountains, Clockwork Peak | chasm with vine posts | Vine Seeds (Sunken Bell Temple) |
| Two treasure alcoves | cracked rocks | Ember Dash (Clockwork Peak) |

## Rooms and puzzles

Each room may have one condition that opens its shutters and gates and makes
its hidden chests appear: `clear` (beat every enemy), `switch` (sword or
leafarang), `torches` (light every torch with the lantern), `plates` (push
blocks onto every plate) or `boss`. Torches and blocks reset when you leave an
unsolved room; solved rooms stay solved.

Dungeons are designed so only one locked door is reachable whenever you hold a
key, and the solver proves that no order of using keys can get you stuck.

## Feel

| Knob | Value |
| --- | --- |
| Walk speed | 84 px/s, 8 directions, diagonals normalised |
| Collision | per-axis stepping, flush stops, 7 px corner nudge around doorways |
| Sword | 0.26 s swing, active for 0.17 s, 12 × 22 px arc in front |
| Hitstop | 55 ms on a hit, 110 ms on boss hits and broken rocks, 90 ms when hurt |
| Knockback | 190 px/s (enemies, ×0.35 for heavy ones), 150 px/s (Wren), 0.16 s |
| I-frames | 1.0 s for Wren (blinking), 0.28 s for enemies, 0.5 s for bosses |
| Leafarang / Vine / Ember | 7 / 6 / 3 tiles of reach (shared with the solver) |
| Ember Dash | 280 px/s for 0.3 s, invulnerable, breaks cracked rock |

Health is in half hearts. Enemies: slimes hop after a squash, bats flap before
swooping, beetles have an armored front, shadow wisps drift toward you and shy
from flame. Minibosses: Big Slime (splits), Shellbeetle (charges after pawing
the ground, stunned against walls), Gear Knight (glows, spins, gets dizzy).
Bosses: Grumbletoad (shadow marks where it lands, spits seeds after puffing
up), Old Bellcrab (shell clanks swords until a vine stuns it; red line before
a claw, ring before the bell), Shade King (hidden until three torches burn;
snuffs them, throws breakable orbs, sweeps a shadow band). Every attack has a
visible telegraph.

Kid-friendly failure: at zero hearts a Fairy Tea revives you, otherwise Wren
wakes at the last lantern statue with full hearts and everything kept.

## Quests and people

Quests are a table of transitions in `quests.js` (`{ q, from, on, to,
reward }`, plus counter quests that advance once enough have been collected,
even if collected before accepting). Main quest plus six side quests: Biscuit
the cat, Bun's honeycaps, Hazel's race (30 s), Gill's fishing, Hoo's riddle
and the five lamp posts. Conversations live in `dialogue.js` as small node
graphs with portraits, choices and effect strings the game carries out.

## Presentation

- Room backgrounds are baked once per visit at 3× into offscreen canvases;
  only animated tiles (tall grass, water glints, flames, crystals) draw per
  frame. Sprites are baked at start.
- Darkness (night on the overworld, dark dungeon rooms) is a half-resolution
  mask with soft holes for Wren's lantern, lit torches, lamp posts, embers and
  the revealed Shade King. Dusk adds a warm tint, and fireflies glow on top.
- Day/night cycles every 5 minutes; night spawns a couple of shadow wisps.
- Music: one chiptune loop per region and dungeon, plus boss, Shade King,
  title and ending themes (lead, bass, arpeggio, soft drums).

## Saves

Three slots in `lanternwood.v1`. Saved at statues, on items, keys, quests,
rooms solved, area changes, pause and page hide. Loading resumes at the last
statue (or dungeon entrance).

## Tests

- Map data: dimensions, known tiles, entities on sensible tiles, doors that
  open onto floor, puzzle rooms that have their pieces.
- Solver: every dungeon room reachable, keys before locks in every order, each
  dungeon completable with exactly the items you have when you get there, the
  whole adventure in order, gates that stay closed without their item, the race
  being winnable.
- Quests, dialogue graphs, combat math, collision sliding, saves.
- Simulation: movement, grass, screen slides, talking, lamps, leafarang
  switch, vine pull, keys, blocks, torches, death and respawn, statues, warps,
  shop, fishing, race, Biscuit, boss rewards, determinism.
- The autopilot clears Mossy Burrow and the Sunken Bell Temple with real
  controls.
