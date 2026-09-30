# Garden Guardians

A cozy tower defense. Plant sunflower cannons, pea pods and mushroom mages
to stop the snack-hungry bug parade from reaching Grandma's picnic.

Bugs march down winding garden paths toward the picnic blanket. Each one
that gets there runs off with a picnic basket. Plant defenders on the grass
beside the path. Every shooed bug pays coins, which you spend on more plants
and upgrades. Nine gardens across three areas (Backyard Lawn, Veggie Patch,
Lily Pond Orchard) each end with a boss.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/garden-guardians/
```

The game uses ES modules, so it needs the local server. It does not work
from `file://`.

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Plant | Tap grass, then a plant button (or a plant button, then grass) | `1`–`7`, or arrows + `Enter` |
| Upgrade / sell | Tap a plant, then Upgrade / Sell | `U` / `S` |
| Targeting (first / strongest / closest) | Buttons in the plant panel | `T` |
| Start / call next wave early | Wave button | `Space` |
| Speed 1× / 2× | `1×` button | `F` |
| Cancel selection / pause | `✕` / `❚❚` | `Esc` (cancels first, then pauses), `P` |
| Sound | `♪` | `M` |

Shift-click keeps the same plant selected so you can plant several in a row.

## Defenders

| Key | Plant | Role | Unlocks |
| --- | --- | --- | --- |
| 1 | Pea Pod | Single target, ground + air | start |
| 2 | Sunflower Cannon | Lobbed splash, ground only | start |
| 3 | Honey Pot | Sticky puddles that slow bugs | map 2 |
| 4 | Sun Daisy | Makes coins while bugs march | map 2 |
| 5 | Thistle Launcher | Homing thorns, air only | map 3 |
| 6 | Mushroom Mage | Chain magic that ignores armor | map 4 |
| 7 | Lavender Lantern | Aura: nearby plants hit harder | map 5 |

Each plant upgrades twice, and each tier looks different. Selling returns 70%
of what you spent. A plant placed during a build break comes back in full
until the next wave starts.

## Bugs

Ants, armored beetles, speedy ladybug swarms, tanky snails (their slime
speeds up other bugs), butterflies and wasps (they fly and cut across path
corners), and caterpillars that split into wigglers. Bosses: Giant Raccoon,
Baron Beetle, Queen Wasp (summons wasps), Sir Slimesalot and the Caterpillar
King.

You have 10 picnic baskets. Stars: ★★★ for losing at most one, ★★ for
keeping at least 5, and ★ for any win. Calling a wave early pays a coin
bonus, and clearing the field pays a small one too. Progress, stars and
settings are saved under the `garden-guardians.v1` localStorage key.

## Debug URLs

- `?map=N` starts garden N (1–9) right away.
- `?autoplay` lets the built-in autoplayer run the garden.
- `?unlock` unlocks every garden and defender.

## Code

The simulation is DOM-free and uses fixed steps: `src/game.js`, `src/maps.js`,
`src/waves.js`, `src/combat.js`, `src/data.js`, `src/progress.js` and
`src/autoplay.js`. Tests are in `tests/`:

```sh
node --test 'games/garden-guardians/tests/*.test.js'
```

`src/render.js` and `src/sprites.js` (Canvas 2D), `src/audio.js` (Web Audio)
and `src/main.js` (screens and input) own everything that runs in the browser.
