# Gamer

A collection of small browser games for all ages, gathered in **Starlight
Arcade**: the page at the repo root where players pick a game, play it, and
come back to pick another. Every game has a `← Arcade` link on its title screen
and a *Back to arcade* button in its pause menu.

## Layout

```
index.html          Starlight Arcade, the game picker
arcade/             arcade styles, script, game manifest (games.js) and tests
games/
  <slug>/           one self-contained game per folder
    index.html      entry point, opens directly or from the arcade
    cover.svg       800×500 card art shown in the arcade
    README.md       how to play
    tests/          node:test unit tests (*.test.js)
```

Current games:

| Game | Folder | Pitch |
| --- | --- | --- |
| Glowloop | [`games/glowloop`](games/glowloop) | Lasso fireflies, match colors, light up the night |
| Neon Nighthawk | [`games/neon-nighthawk`](games/neon-nighthawk) | Hover-bike story campaign: deliver across Vanta and switch the city's lights back on |
| Sundown Rally | [`games/sundown-rally`](games/sundown-rally) | 3D jeep racer: outrun cartoon zombies across the desert at dusk |
| Starhopper | [`games/starhopper`](games/starhopper) | Cockpit space shooter: hop across an endless galaxy, with a Space Burger drive-thru |
| Comet Crush | [`games/comet-crush`](games/comet-crush) | Neon breakout: 36 picture levels and a boss in every constellation |
| Garden Guardians | [`games/garden-guardians`](games/garden-guardians) | Cozy tower defense: plant defenders and shoo the bug parade from Grandma's picnic |
| Moonshot Mini Golf | [`games/moonshot-golf`](games/moonshot-golf) | Cartoon mini golf on the Moon, Mars and Saturn's rings |
| Jelly Jam | [`games/jelly-jam`](games/jelly-jam) | Squishy match-3 across 44 reef levels |
| Pip's Peak | [`games/pips-peak`](games/pips-peak) | Bouncy platformer: help a little sprout climb to the sunrise |

To add a game, give it a folder with a `cover.svg` and arcade links, then add an
entry to `arcade/games.js`. The arcade tests check that every folder is listed.

## Conventions

- **No build step, no npm dependencies.** Games are plain HTML/CSS/JS. Simple
  games work opened straight from disk; games that use ES modules (like the 3D
  ones) need `npm run serve`.
- **Self-contained games.** A game only references files inside its own folder
  (libraries are vendored there, e.g. `games/sundown-rally/vendor/three`), so
  games can be added, moved, or removed without affecting each other.
- **Namespaced storage.** All games share one origin when served together, so
  prefix `localStorage` keys with the game slug (for example `glowloop.v1`).
- **Testable rules.** Keep pure game logic in DOM-free files that Node tests
  can import.
- **Hide the pointer while playing.** Games hide the mouse pointer after a
  moment without movement during play, and show it again on any movement.

## Full screen

Every page loads `fullscreen.js`. Move the pointer to the top edge and a pill
slides in: **Full screen**, or **Exit full screen (Esc)** while in full screen.
Page-level full screen hides the browser toolbar, so the address bar no longer
drops down when the mouse nears the top. The browser always keeps Esc as a way
out.

Turning it on is remembered (`arcade.v1.fullscreen`). Browsers end full screen
on every page change and only allow entering it from a click or key press, so
the next click or key press on any arcade page re-enters it. Leaving with Esc
or the pill turns it off until you turn it on again; changing pages never
does. Where the Fullscreen API isn't available (iPhone Safari), the pill never
appears.

## Telemetry and support

Every game and the arcade load `telemetry.js` first (`<script src="telemetry.js"
data-service="<slug>">`). It writes structured logs that follow the
OpenTelemetry Logs data model (severity, body, attributes, trace and span IDs,
`service.name`, `session.id`) and uses the exception semantic conventions for
errors.

- **Crash screen.** An uncaught error, or one inside a loop wrapped with
  `Telemetry.guard(fn)`, shows "Oops! The game hit a bug." with *Try again*,
  *Back to arcade* and *Copy report*, instead of a frozen picture.
- **Local logs.** The last 200 records per game are kept in `localStorage`
  under `<slug>.v1.log`. Nothing leaves the device by default.
- **Help & diagnostics.** The arcade footer opens a panel that summarizes
  problems per game, copies one support report for all games, clears logs,
  and switches sending on or off.
- **OTLP export.** With sending on (or `?otlp=<url>`, or `?otlp=same`), games
  POST OTLP/HTTP JSON to `<url>/v1/logs`. `npm run serve` accepts these at
  `http://localhost:8000/v1/logs`, appends them to `logs/telemetry.ndjson`
  (git-ignored) and prints warnings and errors. Any OpenTelemetry Collector
  with an OTLP/HTTP receiver (port 4318, CORS allowed for the arcade's origin)
  works too.
- **Game events.** Use `window.Telemetry?.log.event(name, attributes)`.
  Neon Nighthawk also reports slow frames (`frame.long`, `perf.degraded`) and
  freezes (`frame.stall`, measured by a watchdog outside the frame loop).

`arcade/telemetry.js` is the canonical copy. After editing it, run
`npm run sync-telemetry`; the arcade tests check every copy matches.

## Commands

```sh
npm test               # run every game's tests, plus the arcade and telemetry tests
npm run serve          # serve the repo at http://localhost:8000 (no caching) and collect OTLP logs
npm run sync-telemetry # copy arcade/telemetry.js and fullscreen.js into every game
```
