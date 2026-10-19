# Tiny Kingdoms — design

A bite-size real-time strategy game in the style of Galcon and Mushroom Wars,
set on painted storybook islands. Slug `tiny-kingdoms`, genre Strategy,
ES modules + Canvas 2D, no dependencies.

## Core loop

- A map is a set of **buildings** on islands. Each owned building grows little
  round soldiers up to its cap. Neutral buildings hold a fixed garrison and do
  not grow.
- Drag (or tap-tap) from your buildings to a target to send **half** of their
  troops (or **all**, with the ½/All toggle or Shift). Dragging through
  several of your buildings collects them all as sources.
- A squad marches in a straight line (soldiers on land, little rowboats on
  water). On arrival at a friendly building it adds troops; at a hostile one
  it fights: defenders count `troops × defence`. If attackers exceed that,
  the building is captured with `attackers − troops × defence` troops left;
  otherwise the garrison drops by `attackers / defence`.
- Two squads marching in opposite directions on the same road meet and fight
  one for one.
- A kingdom is out when it has no buildings and no squads. Win by knocking
  out every rival; lose when you are out.

## Buildings (introduced gently)

| Type | Grows/s | Cap | Special | First seen |
| --- | --- | --- | --- | --- |
| Castle | 1.2 | 80 | Capital, big | map 1 |
| Cottage | 0.7 | 40 | — | map 1 |
| Windmill | 1.6 | 50 | Fast growth | map 3 |
| Tower | 0.4 | 40 | Defence ×1.6 and shoots passing enemy squads | map 6 |
| Forge | 0.6 | 40 | Your squads march 30% faster per forge (max 2) | map 10 |
| Shrine | 0.3 | 30 | All your buildings grow 25% faster per shrine (max 2) | map 15 |

Troops above the cap (from reinforcements) slowly drift back down (0.5/s).

## Rivals

AI kingdoms have a **personality** and a **difficulty**:

- **Cautious** (Duke Bramble, the Hedgehog Duke): keeps reserves, defends
  threatened buildings, attacks only with a big margin, stays close to home.
- **Greedy** (Queen Marigold): grabs neutrals and windmills first, low
  reserves, over-extends.
- **Sneaky** (The Fox Baron): hits weak, empty or far-away buildings, often
  right after you send troops out, and from several buildings at once.

Difficulty sets think interval (easy 4 s, normal 2 s, hard 1 s), how many
buildings it sends from per decision, how well it estimates defence, growth
and squads already marching, whether it defends, and an opening grace period
(easy rivals wait before attacking you). Same seed, same decisions: the AI
uses the world's seeded RNG.

## Heroes (unlocked through play)

Pick one hero before a match. Press the hero button (H / gamepad Y) and your
next send carries the hero (cooldown 25 s):

- **Sir Pip** the knight (after 3 campaign wins, so she arrives on map 4):
  the squad hits 1.5× as hard.
- **Wren** the ranger (9 wins): the squad marches twice as fast.
- **Old Moss** the wizard (17 wins): the building it lands on gets a
  magic shield, defence ×2 for 15 s.
- **Shepherd Bo** (25 wins): the building it lands on grows twice as
  fast for 20 s.

## Campaign

32 maps across four regions on a world map: **Clover Coast** (1–8),
**Windmill Bay** (9–16), **Misty Fjords** (17–24) and **Ember Isles**
(25–32). Maps 1–4 are hand-made tutorials (one rival, easy, a big head
start). Later maps come from the map generator with fixed seeds and tuned
parameters, adding windmills, towers, forges, shrines, two and then three
rivals, and normal then hard difficulty. A new building gets a one-card
introduction the first time it appears.

**Stars**: winning gives ★. Each map lists two more goals from: *win within
the par time*, *never lose a building*, *win in N sends or fewer*. Goals count
once met in any win, so stars add up across replays (a generous design call
for kids). Par times are 2.5× the reference bot's time plus a minute (at
least 2:30); the sends goal comes from the number of buildings to take
(the bot sends far more often than a person needs to). The next map opens on
any win, so nobody gets stuck.

Maps 1–4 use a fifth, internal difficulty, **Gentle** (thinks every 6 s, one
building at a time, long grace period). A test checks that a slower bot
(the reference bot at Normal) wins each of maps 1–8 in most tries.

Campaign seeds are tuned with a search script: a seed is kept only if the
reference bot wins it against six differently seeded rival runs.

## Sticky hooks

- World map with stars and personal best time per map.
- **Banners and colours**: kingdom colours and banner emblems unlocked by
  total stars and wins; they show on your flags, squads and HUD. Rival
  colours avoid yours.
- **Heroes** unlocked by campaign progress, shown in the Kingdom screen with
  silhouettes for locked ones.
- **Daily skirmish**: map and rivals seeded from the local date; a gentle
  streak of consecutive days won, and best time for the day.
- **Skirmish**: map generator with size, rivals (1–3), difficulty and a
  re-rollable seed; best times per size and difficulty.
- Results screen: "New best!" moments; Retry in one tap.

## Controls

- Mouse/touch: drag from your building to a target; drag through several of
  your buildings to collect them; tap to select then tap a target; tap empty
  ground to clear. ½/All toggle and hero button in the HUD.
- Keyboard: every building has a letter tag (letters F, H, M, P skipped).
  Pressing your building's letter toggles it as a source; pressing any other
  letter sends to it (pressing a selected building's letter again when it is
  the only selection deselects; Enter on a selected own building with Shift
  reinforces). `0` selects all your buildings, Backspace clears, Space toggles
  ½/All, H hero, F game speed 1×/2×, Esc/P pause, M mute. Arrow keys move a cursor between
  buildings and Enter acts like a tap.
- Gamepad: stick moves a cursor that snaps to buildings; A acts like a mouse
  button (tap or hold-and-drag), B clears, X toggles ½/All, Y hero, LB selects
  all, Start pauses.

Design calls: the view zooms to fit the map's buildings (with a minimum
size), so small maps get big buildings. Squads over water are drawn as
little rowboats. AIs skip squads under three soldiers to keep the board tidy.

Letters for every building (targets) and toggle-select for own
buildings keeps "select by letter, then pick a target" to two key presses.
Reinforcing your own building from the keyboard is Shift+letter.

## Architecture

- `src/rng.js` seeded RNG and string hash.
- `src/data.js` building types, kingdoms, personalities, heroes, banners.
- `src/sim.js` DOM-free deterministic world (fixed 1/20 s step).
- `src/ai.js` rival AI and the reference bot (the bot is the AI with the
  `reference` profile, using heroes).
- `src/mapgen.js` deterministic map generator (skirmish, daily, campaign).
- `src/campaign.js` 32 map definitions.
- `src/command.js` DOM-free selection and drag state machine shared by mouse,
  touch, keyboard and gamepad.
- `src/view.js` world↔screen transform; portrait screens rotate the 16:10
  world 90° so phones get a big board.
- `src/progress.js` save (`tiny-kingdoms.v1`), stars, unlocks, streak, bests.
- `src/render.js`, `src/sprites.js` Canvas renderer with baked island,
  building and soldier sprites; `src/audio.js` WebAudio synth; `src/main.js`
  screens, input and the guarded loop; `src/perf.js` from comet-crush.

## Tests

- Troop maths: growth, caps, send fractions, combat, tower defence, forge
  speed, shrine growth, head-on squad fights, conservation and mirror
  symmetry.
- Determinism of world, AI and map generator.
- Every campaign map is won by the reference bot against its rivals.
- Difficulty ordering: hard beats easy most of the time (and normal beats
  easy) over many symmetric generated maps with sides swapped.
- Command state machine, view transform, progress/streak logic, perf monitor.
