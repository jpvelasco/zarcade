# Pixel Pond

A cozy falling-sand garden for all ages. Paint with sand, water, soil, seeds,
stone and lava on a pixel grid that fills the whole window, and watch it come
alive: water pools and soaks the soil, seeds sprout into flowers, vines and
trees, and lava boils ponds into steam that falls again as rain.

There is no way to lose. Gentle goal cards teach how the elements behave and
unlock new elements, brushes and skies along the way.

## Play

Pixel Pond loads ES modules, so serve it rather than opening it from disk:

```sh
npm run serve      # then open http://localhost:8000/games/pixel-pond/
```

## Modes

- **Goals**: eleven cards, each with its own starter garden. The next three
  unfinished goals are always open, and a goal lends you any element it needs
  (marked ★ in the tray).
- **Today**: a daily prompt from the local date (same day, same garden), with
  a gentle streak. Missing a day just starts a new one; your best is kept.
- **Free play**: no goals at all. Your free-play garden is saved and comes
  back next time.
- **Gallery**: press 📷 to keep up to twelve gardens, then play in them again.
- **Finds**: twenty things to discover, shown as silhouettes with hints until
  you find them.

## Elements

| Element | What it does |
| --- | --- |
| Sand | Falls and piles into slopes; sinks through water |
| Water | Flows, levels out, soaks into soil until the soil is full |
| Soil | Darkens when wet; seeds sprout on wet soil |
| Seeds | Sprout into flowers or grass, or a climbing vine when planted by stone |
| Stone | Never moves; builds walls and dams, even through water |
| Lava | Flows slowly, glows, burns plants, melts ice, boils water into steam and cools to stone, or to obsidian deep underwater |
| Acorn | Grows a tree (green, deep green, blossom or autumn) |
| Ice | Solid until lava or fire comes near |
| Glow moss | Creeps along stone and glows at night |
| Fish | Swim in ponds, and flop back toward water if they land on dry ground |
| Fireflies | Hover and twinkle; at dusk they visit your flowers |

Steam rises and condenses into rain. Fire burns out on its own and water puts
it out. The sky turns from day to night every four minutes; the 🌙/☀️ button
hurries it along.

## Goals and rewards

1. First sprout: Spray brush
2. Make a waterfall: Acorn
3. Flower patch: Line brush
4. Taller than the hill: Glow moss
5. Make obsidian: Ice
6. Make it rain: Sunset sky
7. Melt the ice: Fish
8. A deep pond (a fish in water 10 cells deep): Fireflies
9. Glow cave: Aurora sky
10. Firefly night: Candy sky
11. Vine climber: Rainbow flowers

## Controls

| Input | What it does |
| --- | --- |
| Mouse / touch | Paint; hold still to keep pouring |
| Tray | Pick an element, the eraser, brush size, brush (round, spray, line), undo, save, clear |
| `1`–`9`, `0`, `F` | Pick an element |
| `E` | Eraser |
| `[` `]` | Brush size |
| `B` | Next brush |
| `Z` | Undo (ten steps, including Clear) |
| `T` | Day or night |
| Arrows / WASD + `Space` | Move a paint cursor and paint with the keyboard |
| `M` or 🔊 | Sound on or off (music and effects together) |
| `Esc` or `P` | Pause |

On a phone held upright the tray sits under the garden; on its side it runs
down the left. Painting never scrolls or zooms the page.

## Files

| File | Responsibility |
| --- | --- |
| `src/elements.js` | Element ids, the palette, brushes, skies and the collection |
| `src/world.js` | The cellular automaton (DOM-free, typed arrays, seeded RNG, fixed step) and `refit` for resizes |
| `src/scenes.js` | Seeded starter scenes, built for any grid size |
| `src/goals.js` | Goal cards, pure check functions, finds and the daily prompt |
| `src/autoplay.js` | Scripted gardeners that finish every goal (tests, `?autoplay`, the title demo) |
| `src/codec.js` | Run-length text encoding for saved gardens |
| `src/progress.js` | The save: sanitising, unlocks, streak, gallery, merging another tab's save |
| `src/layout.js` | Cell size per screen within the cell budget, tray placement |
| `src/render.js` | ImageData renderer, sky, glow, markers, particles, icons and thumbnails |
| `src/icons.js` | Pixel-art icon data |
| `src/audio.js` | Synthesized ambience, music and effects through one master gain |
| `src/main.js` | Screens, input, the loop, saves and telemetry |
| `src/perf.js` | Frame-time telemetry (shared with other games) |

The grid takes the shape of the screen. `layout.js` picks a whole number of
device pixels per cell so the garden stays under 60 000 cells (at least 3 CSS
pixels a cell), and `refit` moves a garden onto a new grid after a resize or
rotation without losing it.

Saves live in `localStorage` under `pixel-pond.v1`.

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?autoplay` | Plays the goals by itself; never writes the save |
| `?goal=<id>` | Opens a goal card, for example `?goal=obsidian` |
| `?daily` | Opens today's prompt |
| `?date=20261012` | Pretends it is another day (for the daily prompt) |
| `?free` | Goes straight to free play |
| `?unlock` | Every element, brush and sky in the tray, without saving them |

`window.PixelPond` exposes the world, the save and a `crash()` hook for
checking the crash screen.

## Tests

```sh
node --test 'games/pixel-pond/tests/*.test.js'
```
