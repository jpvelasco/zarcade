# Pocket Zoo: design

A cozy zoo-builder idle tycoon for all ages. You start with one empty habitat
in the Sunny Meadow and a mystery egg. Hatch eggs to discover 42 plush-style
animals, build and upgrade habitats, pet and feed animals for a Joy bonus,
decorate the paths, and open five more biomes. Visitors stroll the paths and
drop coins as they watch the animals. Nothing can be lost and nothing nags.

## Structure

- **Map** (`src/map.js`): one top-down zoo, 1920 × 1040 world units, laid out
  as a 3 × 2 grid of biome zones (640 × 520) separated by a road grid, with
  the entrance gate under the bottom middle. Each zone holds three habitat
  plots and three decoration spots. Visitor view spots sit on the road next to
  each plot. The road network is a small graph; paths come from Dijkstra and
  are cached.
- **Biomes** (unlock order): Sunny Meadow, Savanna, Jungle, Ocean Bay,
  Arctic, Night House. Each has seven animals: three common, two uncommon, one
  rare and one legendary (two legendaries are friendly fantasy creatures:
  Unicorn and Moon Dragon). Locked zones show a fenced lot with the price.
- **Habitats**: three plots per zone, five levels. Capacity 2/3/3/4/4,
  income multiplier 1/1.3/1.7/2.2/3. The fence changes with the level
  (posts, painted fence, hedge, stone and flowers, golden fence with a flag).
  Each species lives in one habitat of its biome; newly hatched animals move
  in automatically, or wait in a "waiting for a home" list until space opens.

## Economy (DOM-free, `src/economy.js`)

- Income per second = sum over placed animals of
  `rarityBase × biomeTier × (1 + 0.2 × (stars − 1)) × levelMult × joyMult`,
  times `1 + decoration bonus`. Rarity bases 1/2/4/8, biome tiers
  1/4/15/55/200/750.
- Duplicates are never wasted: each copy adds a star (max ★5, +20% each).
- Egg price `base × min(1.15^bought, 8)`; build cost `base × [1, 3, 8]`
  (the first Meadow plot is free); upgrades `base × 2 × 2.2^(L−1)`.
- **Joy** (0–100 per habitat) adds up to +50%. Petting (+8, per-animal
  cooldown) is free; snacks (+40) cost 10% of the biome's egg base. Joy fades
  gently back to zero over about five minutes. Animals are always happy; Joy is
  only ever a bonus, so no "sad pet" states.
- **Offline earnings**: base rate (no Joy) for up to 6 hours, shown in a
  cheerful "Welcome back" card. Clock skew backwards earns nothing; under a
  minute away shows nothing.
- Coins credit smoothly every tick. Visitors are the visible face of income:
  when one stops at a habitat it pops a "+N" bubble with what that habitat
  earned since the last viewer. Income never depends on visitor luck, so
  online and offline rates agree.

## Eggs and collection (`src/eggs.js`)

- Rarity weights 62/27/9/2. Unowned species weigh 3× within a rarity.
- Pity per biome: seven eggs without a rare or better forces one; twenty
  without the legendary forces it. A full biome is always reachable.
- **Daily Star Egg**: free once per local date, from a featured unlocked
  biome chosen by the date seed, never common (0/60/30/10). Claiming on
  consecutive days grows a gentle streak with a small coin gift; missing a day
  just starts again at day 1 with no message about it.
- **Gift eggs** (from keeper tasks and rank-ups) hatch in any unlocked biome.
- The hatch scene: the egg wobbles, three taps (or Space) crack it, rays
  burst, the animal pops out with its name, rarity and NEW! or a star up.
- The **Collection Book** has a page per biome with silhouettes for missing
  animals, rarity colors, stars and a fun fact for each one found.

## Sticky hooks

1. Visible progression: biome lots on the map, habitat levels, and Zoo Ranks
   (Tiny, Cozy, Busy, Grand, Wonder, Legendary Zoo) from a zoo score; every
   rank-up gives a gift egg.
2. Collection with silhouettes (42 animals, stars for duplicates).
3. Three rotating keeper tasks (pet, feed, hatch, earn, visitors, build,
   upgrade, decorate, biome eggs). Seeded by a task counter. Rewards scale
   with income; every third reward is a gift egg.
4. Daily Star Egg with a streak.
5. Twelve decorations (flower bed to golden statue) that appear on the map
   and add a global income bonus.
6. Personal best income shown on the title, with a "New best!" toast.

## Controls

- Mouse: click a habitat or lot to open it, click an animal to pet it, drag
  to pan, wheel to zoom.
- Touch: tap, drag, pinch. Bottom bar buttons sized for thumbs.
- Keyboard: arrows/WASD pan, +/− zoom, Q/E (or Tab/Shift+Tab) cycle
  habitats, Enter opens, F feeds, X pets, G eggs, B book, T tasks, C decor,
  Esc/P pause, M mute. Menus are DOM with focus rings and arrow-key focus.
- The pointer hides after 2 s idle in play.

## Presentation

Storybook pastel art painted with Canvas paths. The ground (grass, roads,
zone floors, habitats, fences, trees, lots) is baked into one offscreen canvas
and rebaked by zone when something is built. Animals are parametric plush
chibis (mammal, bird, fish, crab, octopus, seahorse, frog, turtle, seal kinds
with ears, muzzles, patterns, manes, horns, trunks, wings…) baked once per
species, spread across loading frames; silhouettes are baked lazily for the
book. Animals hop and waddle with transforms, swim in pools, and burst hearts
when petted. Visitors are twelve baked variants with walk bobs and balloons.
Particles are capped; reduced motion stops hopping, camera easing and most
particles.

Audio is WebAudio only: a gentle pentatonic marimba loop (toggleable), coin
plinks, crack and pop for hatching, a fanfare for rares, soft squeaks when
petting.

## Decisions made without asking

- Genre is "Tycoon"; the arcade's shelves have no Tycoon entry yet, so the
  coordinator should map it (Cozy fits best) or choose "Life sim".
- Pausing stops the zoo clock; hiding the tab counts as being away and earns
  offline coins on return.
- One deco of each type, placed in any free spot; placed decos can be put
  away again from the Decor panel at no cost.

## Telemetry

`game.ready`, `zoo.open`, `level.start` (a biome unlocks), `level.complete`
(a biome's collection is complete: stars = habitat levels, score = income,
time = session seconds), `egg.hatch`, `habitat.build`, `habitat.upgrade`,
`task.claim`, `daily.claim`, `rank.up`, `deco.place`, `offline.earn`. The
shared `perf.js` frame monitor runs as in Comet Crush. No `level.fail`: there
is no way to fail.
