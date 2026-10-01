# Building a new Starlight Arcade game

The shared checklist for anyone (person or agent) adding a game to the arcade.
Read `AGENTS.md` and `README.md` first; they are the rules. This file is the
practical "how" and the quality bar.

## Quality bar

The arcade is for all ages and players love the existing games. Before you
start, skim a few to calibrate look, feel and code shape:

- `games/comet-crush/` — sprite-cached glow, juice, bosses, autopilot, telemetry.
- `games/jelly-jam/` — baked sprites, squash physics, map screen, goals.
- `games/garden-guardians/` — storybook art, responsive board, keyboard play.
- `games/pips-peak/` — platformer feel, parallax, chiptune music.
- `games/neon-nighthawk/` — story campaign, dialogue, sprite caches, quality scaler.

Every game needs: a title screen with personality, clear goals, satisfying
feedback (particles, easing, sound), progression (levels, stars, unlocks or
collections), and saves. Make it look awesome, cohesive and readable. No
external assets or CDNs: draw with Canvas/SVG/CSS, synthesize audio with
WebAudio, use system font stacks.

## Make it sticky

Players should want "one more go" and a reason to come back tomorrow. Pick
the hooks that suit the game (at least three), all saved locally:

- A visible progression path: a level map, stars, ranks, or an upgrade tree.
- A collection with silhouettes for what's still missing (creatures,
  stickers, hats, trophies).
- Short-term goals: 2–3 rotating missions or challenges, with a reward.
- A daily challenge or daily seed (derive it from the local date; same day,
  same content) and a gentle streak counter.
- Unlockable cosmetics that show up in play (skins, trails, decorations).
- Personal bests shown on the title and results screens, with a "New best!"
  moment.
- Fast restarts: from fail to playing again in one tap, under two seconds.

No ads, timers that nag, paid-currency patterns, or guilt ("your pet is
sad"). Rewards should feel generous; kids should never get stuck behind a
grind.

## Folder and wiring

```
games/<slug>/
  index.html     loads telemetry.js and fullscreen.js first (see below)
  style.css
  cover.svg      800×500 viewBox, art only (the arcade overlays the title)
  favicon.svg
  README.md      how to play, controls, files, debug params
  package.json   {"type":"module"} when using ES modules
  telemetry.js   copied from arcade/telemetry.js, never edited
  fullscreen.js  copied from arcade/fullscreen.js, never edited
  src/           game code; pure rules in DOM-free modules
  tests/         node:test files (*.test.js)
```

- Copy the shared modules: `cp arcade/telemetry.js arcade/fullscreen.js games/<slug>/`.
- In `<head>`, after the stylesheet:
  ```html
  <script src="telemetry.js" data-service="<slug>"></script>
  <script src="fullscreen.js"></script>
  ```
- Title screen: a visible `<a class="arcade-link" href="../../index.html">← Arcade</a>`
  (fixed top-left, not inside a transformed card). Pause menu: a
  `Back to arcade` link to the same URL. Escape/P pauses (and gamepad Start
  where gamepads are supported). Keep the top-centre ~60px free of essential
  HUD: the full-screen pill appears there.
- `<meta name="theme-color">`, viewport meta, a favicon link.
- Save under `localStorage` key `<slug>.v1`, read inside try/catch
  (storage can throw when blocked).

## Telemetry (required)

Follow `games/comet-crush/src/main.js`:

```js
const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };
```

- Wrap the frame loop: `const loop = telemetry ? telemetry.guard(frame, '<slug>.frame') : frame;`
  and schedule `requestAnimationFrame(loop)`.
- Copy `games/comet-crush/src/perf.js` (and `tests/perf.test.js`) and wire
  `frameMonitor` the same way: `monitor.frame(now)` each frame, a 1 s
  `setInterval` calling `monitor.check`, `monitor.reset` on
  `visibilitychange`, and `queueMicrotask(() => monitor.mark(performance.now()))`
  whenever a new level or scene is built.
- Lifecycle events with small, non-personal attributes: `game.ready`,
  `level.start`, `level.complete` (stars, score, time), `level.fail`, and a few
  notable actions. No per-frame events.

## Performance budget

Target 60 fps on a laptop and stay smooth under Chrome CPU throttling ×4.

- Don't use `shadowBlur` or per-object `filter` in per-frame drawing; bake
  glows and static art into cached offscreen canvases.
- Don't allocate gradients, strings or objects per object per frame; cap
  particles.
- Spread expensive setup (sprite baking, level generation) so no single frame
  takes more than ~50 ms after the title appears.
- For Three.js, use `renderer.compileAsync(scene, camera)` before first draw
  (see `games/sundown-rally/src/main.js` `warmUp`).

## Controls and accessibility

- Keyboard always; mouse/touch wherever it makes sense; gamepad for action
  games. On-screen touch controls only on coarse pointers.
- Hide the pointer after ~2 s idle during active play; show it on movement.
- Respect `prefers-reduced-motion` (less shake, flashing, particles).
- Phone layouts (390×844 portrait) must be usable without page scroll or zoom.
- Text readable by kids: big, high-contrast, friendly copy.

## Tests (required)

- Pure rules, generation and AI in DOM-free modules with `node:test` tests.
- Level/data validity tests (every level solvable or reachable, no broken data).
- An autoplayer or solver that completes the first level(s) is strongly
  encouraged; it doubles as a balance check and an attract mode.
- Determinism: seeded RNG for generated content.
- Run `node --test 'games/<slug>/tests/*.test.js'` (the quoted glob form; the
  bare directory form fails on Node 24). Root `npm test` will report one
  arcade failure, "manifest and games folder list the same games", until the
  coordinator adds your manifest entry. That one is expected; everything else
  must pass.

## Browser verification (required)

Use your own server and headless Chrome on the ports you were given (never the
chrome-devtools MCP tools, which belong to the coordinator):

```sh
PORT=<port> node scripts/serve.mjs &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=<debug-port> --user-data-dir=/tmp/chrome-<slug> \
  --window-size=1366,860 about:blank &
```

Drive it with a Node script in /tmp over the Chrome DevTools Protocol (Node 24
has global `WebSocket` and `fetch`). Capture console errors
(`Runtime.exceptionThrown`, `Runtime.consoleAPICalled`, `Log.entryAdded`), send
real input (`Input.dispatchKeyEvent`, `Input.dispatchMouseEvent`,
`Input.dispatchTouchEvent`), and `Page.captureScreenshot` to PNGs you view with
the Read tool. Check the title, core play across several levels, pause with
Back to arcade, win and lose screens, saves after reload, the 390×844 touch
layout (`Emulation.setDeviceMetricsOverride` + `Emulation.setTouchEmulationEnabled`),
reduced motion, and frame times with `Emulation.setCPUThrottlingRate {rate: 4}`.
Confirm `Telemetry.log.records()` shows your events and that a forced crash in
the frame loop shows `#telemetry-crash` once. Zero console errors. Iterate on
what you see until it looks great. Kill your Chrome and server at the end.

## Git

Commit as you go, only your paths:

```sh
git add games/<slug> docs/superpowers/specs/<date>-<slug>-design.md
git commit -m "Add <Title>, <pitch>" -- games/<slug> docs/superpowers/specs/<date>-<slug>-design.md
```

Never `git add -A`, never touch other folders (the arcade manifest, root
files, other games), never rewrite history or push (the coordinator adds the
manifest entry and pushes). If `.git/index.lock`
exists, wait and retry. No co-author or generated-by lines.

## Final report

Reply with: what the game is and its features, controls, test counts, what you
checked in the browser (with frame times, normal and CPU ×4), known issues,
commit hashes, and an arcade manifest entry in exactly this shape:

```js
{ slug: '<slug>', title: '...', tagline: '(≤ 60 chars)', description: '(1–2 sentences)', genre: '...', controls: ['keyboard', 'mouse', 'touch', 'gamepad' /* whichever apply */], accent: '#rrggbb', needsServer: true }
```
