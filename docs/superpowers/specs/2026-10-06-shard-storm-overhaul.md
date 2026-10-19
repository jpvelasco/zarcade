# Shard Storm overhaul — 2026-10-06

Shard Storm shipped on 2026-10-05 and the owner's verdict was "clunky and
boring and hard to play". This is the design and the bug list for the rework.
Scope is `games/shard-storm/**` only.

## Why it was boring

The simulation had no way to lose except slicing a mine, and slicing a mine is
something you choose to do. A headless 120 s run with **no blade input at all**
ends `lives 3, score 0, status play`: the storm throws crystals, they fall
back, nothing happens. Missing a crystal cost a combo the player did not have.
With no fail pressure there is no reason to reach, no reason to route a swipe,
and no reason to care which object is which — every crystal was the same
six-colour gem.

## Confirmed bugs

| # | Bug | Severity | How it was proved |
| --- | --- | --- | --- |
| 322 | Renderer clears only the top-left quarter on a retina display | high | DPR-2 screenshot: hard seam at (cw, ch), smeared trails outside it |
| 323 | The storm can never kill you; missing crystals costs nothing | high | 120 s headless run, no input: `lives 3, status play` |
| new | One swipe through two mines on the last life sets `lives = -1` and crashes the frame loop | high | `'●'.repeat(-1)` → `RangeError` in `updateHud`; telemetry FATAL, crash screen |
| new | Pausing inside the 0.9 s death delay loses the whole run | high | Escape 120 ms after death → stuck `paused`, `onGameOver` never runs, best never recorded |
| new | Mashing Space/Enter skips the results card | medium | the 0.7 s guard covered clicks only, not keydown |
| new | A second tab overwrites the save | medium | no `storage` listener |
| new | The pause/mute buttons miss a second finger | low | `click` only, per the arcade's known bug class |
| new | Any pointer feeds the blade, so two fingers draw one zigzag blade | low | `onPointerMove` ignored `pointerId` |

Verified as already correct: the save sanitises field by field, `?autopilot`
never writes the real save, the daily clear banks the streak the moment it is
earned, and the 844×390 landscape cards fit without clipping.

## The design

Keep the core — a neon blade you swipe through arcing crystals — and the
DOM-free `src/world.js`. Add pressure, a payoff, and a field that reads as
more than one object.

### Storm surge (the pressure)

Every non-mine crystal that falls back unsliced adds to a surge meter. When
surge fills it **costs a life** and resets partway, so the storm kills a
passive player without ever being unfair: the meter is on screen the whole
time and it only moves when you miss. Slicing drains it a little, so holding
the line is a skill. A mine that falls away unsliced gives a small *relief* —
letting mines go is the correct play and the game should say so.

This is the change that creates the game: past the early levels the spawn rate
exceeds what one blade can reach, so the player must route swipes, give up on
the far crystal, and decide whether a shard next to a mine is worth it.

### Storm Break (the payoff)

Slicing fills a second meter. Full, it arms **Storm Break**: Space, the HUD
button, or a two-finger tap shatters every crystal on screen for bonus points,
defuses the mines harmlessly, and dumps a chunk of surge. It is the reward for
a clean streak and the panic button when surge is nearly full. Breaking does
not refill its own meter.

### Crystal kinds

| Kind | Reads as | Does |
| --- | --- | --- |
| Shard | 5-point gem, six colours | the bread and butter |
| Cluster | fat geode with fracture lines | splits into 4 small shards — the combo engine |
| Frost | pale hexagon with a frost ring | slow-mo and a big surge drain |
| Gold | gold star, rare, high arc | a lot of points, and a life back when below max |
| Mine | red spiked ball | slicing costs a life; letting it fall is good |

Shields (a shell that eats one cut) stay, as a modifier on shards and clusters.

### The curve

The storm level rises every 10 s and changes *what* appears, not just how
often:

- **0–20 s** no mines at all. Plain shards, then clusters. The player learns
  the swipe.
- **20–30 s** the first mines, and frost arrives with them so there is always
  an answer to surge.
- **30 s+** shields, then gold; mine chance ramps to a 0.30 ceiling; volleys
  grow. Spawn interval tightens from 1.7 s to a 0.52 s floor.

### HUD

Top row stays sparse and leaves the top centre clear for the full-screen pill:
score and combo left, lives / mute / pause right. Surge and Storm Break live
in a fixed bottom bar — surge bottom-left, the break button bottom-right —
over the storm floor.

**Follow-up (same day): the field takes the window's shape.** The first cut
kept a fixed 600×900 portrait field and letterboxed it, which read as an
awkward lit rectangle in the middle of a desktop or sideways-phone screen. The
field is now always 900 units tall and as wide as the window's aspect asks
(clamped 400–2000), with no panel: the backdrop, floor glow and edge blooms
run edge to edge. A wide field throws `density = clamp(sqrt(w / 600), 1, 1.6)`
times as many crystals, and divides each miss's surge cost and each slice's
break charge by the same factor, so an idle player still loses in ~25 s on
every layout. On short screens (under 0.65 CSS px per field unit) crystals and
hitboxes grow up to 1.6× so a sideways phone shows ~17 px crystals instead of
~11 px. A resize or rotation mid-run rescales everything in the air. Surge shifts cyan → amber → red and the
screen edges bloom red as it rises.

### Sticky hooks

Personal best on the title and results screens with a "New best!" moment, the
date-seeded Daily Storm with its streak, lifetime shards sliced, a best-combo
record, and one-tap restart. The Daily target is rebalanced against the new
scoring.

## Verification

`node --test 'games/shard-storm/tests/*.test.js'` plus the repo `npm test`,
and a browser pass at 1280×800, 390×844 portrait touch and 844×390 landscape
touch covering title, countdown, play, a mine hit, surge filling, an overload,
a Storm Break, pause, back-to-arcade, game over and the Daily.
