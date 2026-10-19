# Keyboard Knights: design

A typing adventure for all ages. A brave little knight marches along a
storybook road while silly, never-scary monsters waddle in from the right,
each carrying a word on a parchment tag. Typing the word swings the sword and
the monster goes *poof* into confetti. Little ones start with single
home-row letters; grown-ups end with punctuated sentences against a sleepy
dragon who has a lot to say.

## Pillars

- **Kind.** Typos only make the knight stumble (a wobble and a soft "boing").
  They reset the combo but never cost hearts, time or score. A monster that
  reaches the knight just *bonks* him (one of three hearts) and bounces back.
  The first region, every lesson, and the optional *Relaxed pace* setting use
  gentle monsters that stop and wait instead of bonking, so nobody can fail
  there.
- **Readable.** Big rounded type on high-contrast parchment tags. The typed
  part turns green, the next letter is underlined, the locked target grows.
- **Honest stats.** WPM uses the standard 5 characters per word over *active*
  time (the clock only runs while a word is on screen to type), accuracy is
  correct keys over all keys typed.

## Typing rules (`src/battle.js`, DOM-free)

- Typing the first character of a monster's word locks onto the nearest
  monster starting with it. The lock lasts until the word is finished, then
  the next key picks a new target. The picker avoids giving two on-screen
  monsters the same first letter.
- A wrong key while locked is a typo: a miss for the expected key (that is
  what the adaptive picker learns from), a stumble, and the combo resets.
  A wrong key with no lock is a softer typo with no key blamed. A space with
  nothing to type is ignored (a habitual space after a word is not an error).
- **Capitals.** Lower-case tiers are all lower case. In the sentence tier,
  capitals and punctuation count on a physical keyboard; with the on-screen
  keyboard (and the *Forgiving capitals* setting) letter case is ignored.
- **Combo and special.** Each word adds one to the combo and one charge to
  the *Star Spin* meter (combo 5 and 10 add a bonus charge). At 10 charges,
  Enter (or the big button) spins: every minion poofs and the boss loses its
  current phrase. Score per word is `10 × length × multiplier`, multiplier
  `1 + 0.5 × floor(combo / 5)` capped at 3.
- **Bosses** carry a passage split into phrases. Each finished phrase knocks
  the boss back and shows the next one. Phrases include spaces.
- **Monster speed** comes from the stage's target WPM: travel time is
  `3 s + 2.5 × length / cps` (cps = WPM × 5 / 60), so long words walk slower.
  Spawns are spaced by the time to type the previous word, at most 3–4 on
  screen. Pace adapts: each failed attempt at a stage eases speed by 15 %
  (down to 55 %), and a player whose recent WPM is far above the stage target
  gets up to 25 % faster monsters, so adults are not bored in early regions.
- **Stars**: finish = ★, accuracy ≥ 85 % = ★★, accuracy ≥ 95 % with at most
  one bonk = ★★★.

## Words (`src/words.js`)

Curated, kid-safe, levelled lists:

| Tier | Content | Example |
| --- | --- | --- |
| 0 letters | single letters, introduced by key group | `f`, `j` |
| 1 short | 2–4 letter words | `frog`, `cup` |
| 2 medium | 5–6 letter words | `castle`, `waffle` |
| 3 long | 7–12 letter words | `marshmallow` |
| 4 sentences | punctuated words and short phrases | `Ahoy!`, `Let's go!` |

Plus boss passages per region and lesson drills. Lesson drills are generated
from the lesson's keys (deterministic) and filtered through the same blocklist.

`src/blocklist.js` holds a ROT13-encoded blocklist (profanity, slurs, adult,
drug, violent and unkind words): exact words, plus fragments that never
appear in innocent words. A test runs every word, every passage token and
every generated drill through it, along with a lower-case/ASCII/length check
per tier.

## Adaptive picking (`src/picker.js`, `src/stats.js`)

Per-key stats are exponential moving averages of error rate and time per key
(prior: 10 % errors). A key's *weakness* is `3 × error + 0.5 × slowness`,
where slowness is how much slower than the player's median key it is (0–1).
The picker scores each candidate word by its letters' mean weakness plus a
bonus for containing one of the three weakest keys, removes recently used
words and first-letter clashes, and samples with a seeded RNG. Same stats +
same seed = same words (tested). The daily quest switches adaptivity off so
everyone gets the same words that day.

## Progression and sticky hooks

- **Quest map**: five regions × six stages (stage six is a boss), 30 stages
  with up to three stars each.
  1. Letter Meadow (letters, gentle) — boss *King Slime*.
  2. Mushroom Woods (short words) — boss *Mayor Morel*.
  3. Goose Farm (medium words) — boss *Captain Honk*.
  4. Cloud Castle (long words) — boss *Baron Fluff*.
  5. Story Library (sentences and punctuation) — boss *Grumble the sleepy
     dragon*.
  Stages unlock in order inside a region; beating a boss opens the next
  region. On first run, a *Who's playing?* card (Little / Young / Big /
  Grown-up knight) opens the map up to the matching region, so adults do not
  grind letters and kids start at the start. It can be changed later.
- **Lessons**: twelve lessons (F J, D K, S L, A ;, G H, E I, R U, T Y,
  W O Q P, bottom row, capitals, punctuation) with the on-screen keyboard
  showing the next key, colour-coded fingers and a hands diagram naming the
  finger. Gentle pace, stars like stages.
- **Daily quest**: seeded from the local date (`YYYY-MM-DD`), using the
  player's highest open tier, with a mini-boss. Same day, same words. A gentle
  streak counter (days in a row) shows on the title; missing a day just starts
  a new streak, no guilt copy.
- **Wardrobe**: armour (6), swords (6) and pets (6) that show in play.
  Unlocked by stars, bosses, lessons, daily quests, combos, WPM and accuracy.
  Locked items show as silhouettes with the unlock hint.
- **Bestiary**: 15 monsters and 5 bosses. Unseen ones are silhouettes; seen
  ones show a silly fact and how many you poofed.
- **Stats**: personal-best WPM (also on the title, with a *New best!* moment
  on results), recent accuracy, words poofed, a chart of the last 30 runs
  (WPM line, accuracy dots), and a keyboard heat map of weak keys.
- **Fast restart**: results have *Again* (Enter) and *Next* (N); failing goes
  straight to a one-tap retry.

## Controls

- Keyboard: type letters; Enter = Star Spin; Esc / P = pause (Esc on menus
  goes back); arrow keys move focus between menu buttons.
- Touch (coarse pointer): a big on-screen QWERTY keyboard docks under the
  road, with Shift and punctuation in the sentence tier, plus a Star Spin
  button. On desktop it can be shown via the settings and always appears in
  lessons.
- Gamepad: not supported (typing game).

## Architecture

- DOM-free: `rng.js`, `words.js`, `blocklist.js`, `keys.js` (layout and
  fingers), `stages.js` (regions, stages, lessons, monsters, bosses, daily),
  `stats.js`, `picker.js`, `battle.js`, `progress.js` (save, stars, unlocks,
  daily streak), `autoplay.js` (bot typist for tests and the title attract),
  `perf.js`.
- Browser: `sprites.js` (baked monster, knight, sword and pet sprites),
  `render.js` (canvas road scene), `audio.js` (WebAudio synth),
  `keyboard.js` (on-screen keyboard and finger hints), `ui.js` (menu screens
  and chart), `main.js` (loop, input, screens, telemetry).
- Save key `keyboard-knights.v1`.

## Decisions made without a product owner

- Typos never cost hearts; only reaching the knight does, and only outside
  gentle stages. Three hearts, refilled per stage.
- No backspace: you cannot "un-type", which keeps the rules simple for kids.
- Gentle (waiting) monsters in Letter Meadow and lessons by default.
- Daily quest is not adaptive (fairness and determinism over personalisation).
- Unlocks key off totals (daily clears, stars) rather than streaks, so a
  missed day never locks a reward away.
