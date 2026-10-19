# Campfire Solitaire — design

**Slug** `campfire-solitaire` · **Genre** Cards (Cozy shelf) · 2026-10-09

A cozy TriPeaks-style solitaire at a forest campsite under the stars. It's the
arcade's first card game: two-minute rounds, built for phones, one more deal.

## Rules

- 52-card deck. Layout cards are dealt into a shaped tableau. A card is face up
  once every card lying over it has been cleared.
- Play a face-up card that is one rank above or below the waste card. K and A
  wrap, so a run never dead-ends on a King.
- Tap the stock to draw a new waste card when stuck. The round is won when
  every layout card is cleared, and stuck when the stock is empty and nothing
  plays. Undo is unlimited.

## Layouts are data

Each layout is ASCII art in half-card units: `o` marks a card's left edge,
`*` marks a peak (a bonus card). One row of text is half a card height, so a
card covers the cards whose rectangles it overlaps in the rows above it.
Covers are derived from that geometry. Tests check that:

- no two cards in a row overlap, and every covering pair really overlaps;
- every peak covers nothing (it is the last card of its peak), and covers
  are acyclic;
- counts are right: layout + 1 waste card + stock ≤ 52, with at least one
  face-up card at the start;
- the layout fits a 390×844 portrait phone and an 844×390 landscape phone
  with cards at least 44 px wide, clear of the top-centre full-screen pill.

The bounds are 8 cards wide by 5 card heights tall. The classic 10-wide Three
Peaks won't fit a portrait phone at 44 px, so our Three Peaks is the 8-wide,
24-card version (rows 3·6·7·8). Others: Tent, Pine Tree, Canoe, Big Dipper,
Cassiopeia, Twin Peaks, Lantern, Campfire and Orion. In the constellation
layouts, each peak is a star, and clearing it lights that star in the sky.

While building, we found that upright pyramids are very hard in TriPeaks:
the solver won only 4–20% of Tent, Pine and Lantern deals built that way. So
those three are built from columns, where each card has a single cover, and
now win 64–99% of deals.

## Deals and the solver

- `rng.js` uses mulberry32. A deal is a seeded shuffle, so the same seed and
  layout always give the same cards.
- `solver.js` is a DOM-free depth-first search over (cleared mask, stock
  index, waste rank) with a memo. It tries plays before draws and stops at a
  fixed node budget, so results never depend on machine speed. It returns
  the outcome (`win`, `lose` or `unknown`), the winning line, and the best
  partial line found.
- `deals.js`: a level's deal is the first seed, counting up from the level's
  base seed, that the solver proves winnable within its budget. The daily
  deal does the same from a seed made from the local date. Quick Deal does
  it from a random seed. Tests prove that all 24 levels, and every daily
  over 15 months, are winnable, deterministic and quick to pick.
- The hint runs the same solver from the current position and shows the
  first move of a winning line. With no win in reach, it shows the best
  line's first move. If the position is proven lost, it suggests Undo.

## Scoring and stars

- Each cleared card scores 50 × its place in the streak (50, 100, 150…). A draw
  ends the streak. A peak earns +500. Clearing the whole layout earns +1000,
  plus 100 for each card left in the stock.
- Solo bonus: +1000 when you finish without undo or hints. Each undo also
  costs 50 points. Undo restores the score and streak to the earlier state,
  and the penalty is tracked separately.
- Stars: ★ clear the camp · ★ reach the level's streak goal · ★ finish without
  undo or hints. Each streak goal is at most the longest streak in that
  deal's verified line, so it can always be reached.

## Sticky hooks

- **Trail map**: 24 levels along a winding forest trail in three sections
  (Pine Hollow, Lakeside, Starry Ridge), with stars on every stop.
- **Daily Deal**: the same layout and cards for everyone on a given local
  date. A gentle streak counts consecutive days you cleared it, and stays
  alive until the end of the next day. It also tracks your best daily score.
- **Camp gear**: 7 card backs, plus 9 decorations that appear around the
  table: lanterns, tent, guitar, fireflies, owl, canoe, telescope,
  marshmallows and shooting stars. Unlocks come from your progress and use
  generous thresholds. Locked items show as silhouettes.
- **Personal bests**: best score per level and per daily, a Quick Deal best,
  and your longest streak ever, with a "New best!" moment.
- **Fast replays**: one tap deals again. Quick Deal hands you a fresh deal
  the solver has already proved winnable.

## Feel

- Canvas renderer with baked sprites: card faces, backs, glows, the sky,
  trees and decorations. Each card has a visual state (x, y, scale, tilt,
  flip) that eases toward a target taken from the game state. Retargeting
  starts from the current pose, so animations can be interrupted, and input
  always hit-tests the logical layout, never an animation.
- The campfire flickers between the stock and the waste, and sparks burst on
  each play. The night sky brightens as your streak grows. Peaks light
  their stars.
- WebAudio only. Guitar plucks come from Karplus–Strong synthesis and climb a
  pentatonic scale as your streak grows. A fingerpicked chord loop plays
  under a crackling fire. One master gain carries everything, so the HUD
  🔊/🔇 (M) mutes it all.
- `prefers-reduced-motion`: near-instant slides and flips, fewer sparks, and
  no sky pulsing.

## Screen layout

`table.js` is a pure function from the viewport and layout to card size and
positions. It compares two arrangements: piles below the board (portrait and
desktop) and piles beside it (phone landscape). It keeps the one with the
bigger cards and re-runs on every resize or rotation. The top-centre 60 px
stays clear.

## Controls

Tap or click a card to play it, and tap the stock to draw. Keyboard: arrows
or Tab move focus across playable cards and the stock, Enter or Space plays,
D draws, U or Ctrl+Z undoes, H hints, Esc or P pauses, and M mutes. On a
gamepad, the d-pad moves, A plays, X draws, B undoes, Y hints and Start
pauses. Menus work with the arrows or d-pad.

## Robustness

The save lives under `campfire-solitaire.v1`. It is sanitized field by field,
and a `storage` listener adopts saves made in another tab. A win is recorded
the moment the last card clears. Result cards ignore input for 0.7 s, and
ignore keys already held when they opened. `?autoplay` (the solver plays,
which doubles as the title attract mode) returns at the top of `persist()`.
Telemetry and the perf monitor follow Comet Crush.
