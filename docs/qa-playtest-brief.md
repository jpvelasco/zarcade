# Play-test and polish pass

You are a QA play-tester and fixer for a few Starlight Arcade games. Read
`AGENTS.md`, `docs/new-game-brief.md` (conventions, telemetry, verification
method, git rules) and each assigned game's `README.md` first.

## Goal

Make each assigned game more fun, easier to control (especially on phones),
and bug-free. Play it the way a 7–12 year old and a casual adult would, for
real, through its menus, several levels, wins and losses.

## How

1. Use your own server and headless Chrome on the ports you were given (never
   the chrome-devtools MCP tools). Drive real input over CDP: keyboard,
   mouse, and touch (`Emulation.setTouchEmulationEnabled` +
   `Input.dispatchTouchEvent`) at 390×844 portrait and 844×390 landscape, plus
   1366×860 desktop. Screenshot often and look at the screenshots.
2. Keep a findings list per game, ranked by impact on a player:
   - Bugs: anything broken, stuck, confusing, unwinnable, or a console error.
   - Controls: hard-to-hit touch targets (< 44 px), controls that overlap the
     view, keyboard-only wording shown to touch players, missing feedback.
   - Clarity: does a new player know what to do within 10 seconds? Is the
     goal and the way back to the arcade obvious?
   - Fun: dead time, unfair difficulty spikes, too easy, unclear rewards,
     missing juice where it matters.
   - Phone layout: wasted space, tiny text, things cut off, portrait vs
     landscape.
3. Fix the top findings in each game with the smallest changes that solve
   them. Add or update Node tests for any rule or balance change, and keep
   every test passing (`node --test 'games/<slug>/tests/*.test.js'` and root
   `npm test`). Re-verify each fix in the browser.
4. Respect the conventions: no build step, no dependencies, pure rules stay
   DOM-free, telemetry stays wired, `prefers-reduced-motion` respected,
   determinism kept.

## Filing bugs

Every real bug you find goes on the tracker before you fix it, so there is a
record even if a fix fails. Repo: `jpvelasco/zarcade` (private). Labels
already exist; don't create new ones.

```sh
gh issue create -R jpvelasco/zarcade \
  --title "<Title>: <what goes wrong, in a few words>" \
  --label bug --label game:<slug> --label sev:<high|medium|low> \
  --body-file /tmp/<your-dir>/issue.md
```

- Body: steps to reproduce, expected vs actual, viewport/input used, and
  console output if any. Attach evidence as text (no uploads). No personal
  data, no local file paths beyond the repo.
- `sev:high`: crash, stuck, unwinnable, lost save. `sev:medium`: broken
  control or wrong rule with a workaround. `sev:low`: cosmetic.
- Bugs only. Polish ideas you don't act on go in your report, not the tracker.
- Before filing, search for a duplicate:
  `gh issue list -R jpvelasco/zarcade --label game:<slug> --state all`.
- Fix commits reference the issue so the push closes it:
  `git commit -m "<Title>: <fix> (fixes #N)" -- games/<slug>`. If you can't
  fix it, leave it open and comment why with `gh issue comment`.
- Never close, edit or comment on other agents' issues.

## Git

Commit per game, only that game's folder:
`git commit -m "<Title>: <what changed>" -- games/<slug>`. Never `git add -A`,
never touch other folders, the arcade, shared `telemetry.js`/`fullscreen.js`
copies, or root files. If `.git/index.lock` exists, wait and retry.

## Report

Per game: what you played, issues filed (number, severity, fixed or open),
other findings, what changed, test counts, commit hashes. Kill your Chrome and
server at the end by their PIDs, never by name pattern.
