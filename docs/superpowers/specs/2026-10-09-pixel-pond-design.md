# Pixel Pond — design

Date: 2026-10-09 · slug `pixel-pond` · genre Sandbox (Cozy shelf)

## Pitch

A cozy falling-sand garden for all ages. Paint with sand, water, soil, seeds,
stone and lava on a pixel grid that fills the window, then watch it come alive:
water pools and soaks the soil, seeds sprout into flowers, vines and trees,
lava boils ponds into steam that rains back down. Gentle goal cards teach the
interactions and unlock new elements and brushes. No fail state.

## Simulation (`src/world.js`, DOM-free)

- Typed arrays per cell: `type` (element), `a` (wetness, energy, life),
  `b` (plant kind and flags, direction, colour), `tone` (pixel shade), and a
  `clock` stamp so a cell moves at most once per step.
- Fixed step (60 Hz, at most 2 steps a frame), bottom-up scan with the row
  direction alternating, a seeded xorshift RNG held in the world. Same seed and
  same paint operations give the same grid.
- Rules: sand and soil fall and pile (wet soil holds its shape); water flows,
  levels and soaks soil until it is saturated; seeds and acorns germinate on
  wet soil (by a wall a seed becomes a vine); growing tips grow flowers, grass,
  vines and trees cell by cell; stone and obsidian are static; lava flows
  slowly, sets plants on fire, dries soil, melts ice and turns water to steam,
  cooling to stone, or to obsidian when it is deep in water; steam rises and
  condenses into rain; fire burns out and is put out by water; glow moss
  spreads along surfaces a few generations; fish swim in water and flop
  (never die) out of it; fireflies wander and visit flowers at dusk.
- Day and night: `world.time` advances slowly; a sun/moon button jumps to dusk
  or morning. Fireflies arrive at dusk once unlocked; moss, lava and fireflies
  glow at night.
- Stats counters (sprouted, bloomed, rain, melted…) feed goals, discoveries
  and sound. Event counters are read and cleared by the page, never by the
  renderer.

## Screen and grid

- `src/layout.js` picks an integer device-pixel cell size so the cell count
  stays under 60 000 and a cell is at least 3 CSS px. The grid takes the stage
  shape: desktop 16:10, 390×844 portrait, 844×390 landscape.
- The tray (elements and tools) sits at the bottom, or on the left on short
  landscape screens, so it never covers the garden. Painting never scrolls or
  zooms (`touch-action: none`).
- Resize and rotation call `refit`: content keeps its cells, anchored
  bottom-centre; it is scaled down uniformly only when it would not fit, and
  ground columns extend into new width. Goal markers move with it.
- Rendering: one `ImageData` at grid resolution through a `Uint32Array` colour
  look-up table (re-tinted per time-of-day bucket), drawn into the screen
  canvas with smoothing off. Water darkens with depth. Emissive cells feed a
  small glow buffer, blurred by downscaling and added with `lighter`.

## Goals and progression

Eleven goal cards, each with a starter scene built for the current grid size
from a seed, a pure check function and a scripted solution (tests and
`?autoplay`): First sprout, Make a waterfall, Flower patch, Taller than the
hill, Make obsidian, Make it rain, Melt the ice, A deep pond (a fish in water
10 cells deep), Glow cave, Firefly night, Vine climber. The next three
unfinished goals are always open, and a goal lends any element it needs.
Rewards: Spray and Line brushes, Acorn, Glow moss, Ice, Fish, Fireflies and
three sky themes.

## Sticky hooks

- Element collection: 20 cards with silhouettes and hints for undiscovered
  ones; discoveries are detected from the grid and toast when found.
- Gallery of up to 12 saved gardens, run-length encoded (one character per
  run for most runs), at most 40 000 characters each, sanitised on load.
- Daily prompt: a date-seeded scene and goal from a pool that needs only the
  starting elements; a gentle streak (best streak kept, no guilt).
- Free play: the last free-play garden is autosaved and restored.
- Sky themes unlock and show up in play.

## Kids

No fail state; undo (10 steps, includes clear); clear-all asks first; big
element buttons with pixel icons and names; friendly copy.

## Controls

Mouse/touch paint, tray buttons for element, eraser, size, brush shape, undo,
clear. Keys: 1–9 and 0 elements, F fireflies, E eraser, [ ] size, B brush,
Z undo, T time of day, arrows + Space paint with a keyboard cursor, Esc/P
pause, M sound. No gamepad.

## Sound

WebAudio only, one master gain (mute persisted, HUD 🔊/🔇 on `pointerdown`).
Ambient water noise follows flowing water, lava crackle, birds by day,
crickets at night, a soft music-box melody; small paint, sprout, bloom, hiss
and fanfare effects.

## Save

`pixel-pond.v1`: muted, completed goals, discoveries, daily streak, gallery,
free-play garden, sky theme, brush settings. Field-by-field sanitising, a
`storage` listener merges another tab's save, and `?autoplay` never writes.

## Tests

Per-element rules and interactions, determinism, codec round trip and caps,
save sanitising and merging, layout budget at the three screen shapes, refit,
each goal check, each starter scene at three sizes solved by its script, the
daily pool, and a step-time smoke test on a full-budget grid.
