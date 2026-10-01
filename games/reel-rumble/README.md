# Reel Rumble

A cheerful fishing adventure. Cast your line, hook something wonderful,
reel it in, and fill your fish book.

Fish five waters, each with its own times of day and weather: **Willow
Pond**, the **Rushing River**, **Coral Bay**, the **Frozen Lake** (ice
fishing through a hole) and **Starfall Lagoon** (always night). Fifty
species live there, from bluegills and clownfish to glowing lagoon eels,
with four rarity tiers and a legendary fish in every water that fights in
three rounds with its own special move.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/reel-rumble/
```

| Action | Mouse | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- | --- |
| Aim the cast | point at the water | touch the water | ← → / A D | stick / d-pad |
| Charge and cast | hold, let go at the white mark | hold, let go | hold Space, let go | hold A, let go |
| Twitch the lure | click | tap | Space | A |
| Reel in to recast | hold | hold | hold Space | hold A |
| Hook a bite | click when the bobber dives | tap | Space | A |
| Reel during a fight | hold / let go | hold / let go | hold Space / let go | hold A, or squeeze RT |
| Steer against the fish | | ◀ ▶ buttons | ← → / A D | stick |
| Change bait | bait button | bait button | B | Y |
| Wait for the next time of day | ⏳ button | ⏳ button | T | |
| Pause | ❚❚ button | ❚❚ button | Esc / P | Start |
| Mute | 🔊 button | 🔊 button | M | |

In menus, arrow keys or the d-pad move between buttons, and Enter, Space or A
picks one. B or Esc goes back.

## How fishing works

1. **Cast.** Hold to charge the power meter and let go when it reaches the
   white aim mark (a *bullseye* cast gets noticed faster). A dotted arc shows
   where the lure will land; farther out is deeper. On the Frozen Lake the
   meter sets how deep the lure drops through the ice hole.
2. **Wait.** Fish that like your bait swim over. Fish that don't sniff it and
   swim away (your book remembers who you've seen). Tap to twitch the lure.
3. **Hook.** The bobber twitches for a few nibbles, then dives with a big
   **!**. Tap right then. Too early spooks the fish; too late and it steals a
   nibble. A quick tap is a *perfect hook* and tires the fish a little.
4. **Reel.** Keep the needle in the green. Reeling adds tension and brings
   the fish closer; the rod's flex soaks up tugs. Let go while it runs hard
   or jumps, and reel while it rests. Too tight for too long snaps the line,
   too loose for too long and it wriggles free. Steering against its run
   tires it faster. Losing a fish is the only way to fail.

Legendary fish only bite the **Starlight Lure** (sold after you've caught
ten species), only at their own time and weather, and need strong tackle:

| Legend | Where and when | Special move |
| --- | --- | --- |
| Old Whiskers | Willow Pond, rainy nights | Mud dive: a long heavy pull |
| The River King | Rushing River, rainy dawns | Rapids run: steer against the current |
| Sunburst Marlin | Coral Bay, clear dusks | Tail walk: three jumps in a row |
| Frostfin the Ancient | Frozen Lake, snowy nights | Frost bite: the safe zone shrinks |
| The Starfall Koi | Starfall Lagoon, meteor showers | Starburst: zigzags and pulses |

## Progress

- **Coins** from every catch (bigger fish are worth more) buy rods (cast
  distance and flex), reels (speed and power), lines (how much tug they
  hold), bait (which fish bite) and boats to new waters at the Tackle Shop.
- The **Fish Book** shows silhouettes until you catch a fish, then its
  records, fun fact, where and when it swims, and its bait.
- **Grandpa Gill** gives quests (with coin rewards) and four tournaments:
  hook five fish and beat the rivals' total weight for bronze, silver or gold.
- Time passes with every cast; the ⏳ button skips to the next time of day.
  Weather changes every three hours, the same for everyone on the same day.

Everything is saved under the `reel-rumble.v1` local-storage key.

## Development

```sh
npm test                                   # from the repo root
node --test 'games/reel-rumble/tests/*.test.js'
```

URL flags: `?autopilot` lets the bot angler play, `?water=coral` jumps
straight to a water (even without its boat), and `?hour=21&day=3` sets the
clock. `window.RR` exposes the live trip, save and renderer.

| Path | What it is |
| --- | --- |
| `src/data.js` | Waters, times, weather, behaviours and all 50 fish |
| `src/gear.js` | Rods, reels, lines, bait, boats, shop rules and coin values |
| `src/spawn.js` | Clock, seeded weather and the spawn tables |
| `src/bite.js` | Nibbles, the bite window and hooking |
| `src/fight.js` | The tension fight model, including legendary rounds and specials |
| `src/trip.js` | One fishing spot: cast, lure, swimming fish, bite and fight (DOM-free) |
| `src/bot.js` | The bot angler (tests, title-screen demo, `?autopilot`) and a career planner |
| `src/quests.js`, `src/progress.js` | Gill's quests and tournaments; save data |
| `src/fishart.js` | Procedural cartoon fish sprites |
| `src/render.js`, `src/audio.js`, `src/input.js`, `src/main.js` | Canvas renderer, synthesized sound, controls and screens |
| `src/perf.js` | Frame-time telemetry (shared with Comet Crush) |

The tests check the fish data, that spawn tables respect time and weather,
the bite timing, that the tension model can be won and lost, that every
legendary fight is winnable with top gear (and not with starter gear), that
every fish can be caught end to end by the bot with some gear, and that a bot
angler playing a career of a few hundred casts fills over half the book. See
[`docs/superpowers/specs/2026-10-01-reel-rumble-design.md`](../../docs/superpowers/specs/2026-10-01-reel-rumble-design.md).
