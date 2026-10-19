# Deep Dive: design

Slug `deep-dive`. Genre: Exploration. A gentle metroidvania-lite: pilot Bubbles,
a little yellow submarine, through one hand-designed, connected ocean.

## Pillars

- **Calm, curious, never punishing.** No combat, no death. Bumps cost a little
  oxygen; running out floats Bubbles back to the last dock with nothing lost.
- **Discovery is the reward.** Sonar reveals the dark and the map; scanning
  creatures fills an encyclopedia with real, kid-friendly facts.
- **Upgrades open the world.** Each part opens the next area, and earlier areas
  hide golden shells you can only reach with later parts (backtracking).

## World

The map is authored as a list of shapes (rooms, ellipses, tunnels) carved out
of rock on a 32 px cell grid (150 x 110 cells). Each shape carries an area tag.
Gates are explicit objects. Everything is in DOM-free `src/map.js`.

| Area | Gate to enter | Part found there |
| --- | --- | --- |
| Sunny Shallows | none (start, Home Dock at the surface) | none |
| Kelp Forest | none | Grabber |
| Shipwreck | rusty hatches (grabber) | Drill |
| Coral City | coral walls (drill) | Headlights |
| Twilight Zone | darkness (headlights) | Pressure hull |
| Glowing Trenches | depth (pressure hull) | Turbo |
| Volcanic Vent | strong currents (turbo) | Heart of the Sea (ending) |

Gate mechanics:

- Hatches and coral walls are solid blocks that open on contact once you own
  the grabber or drill. Opened gates stay open (saved).
- Darkness and depth are soft limits: cells of a gated area push Bubbles back
  with a friendly hint ("Too dark! Bubbles needs headlights.").
- Currents push harder than the normal motor; turbo out-pulls them. Currents
  always point back out of the vent, so they can never trap you.

Docks (Home, Kelp buoy, Coral Dome, Twilight Lantern, Trench Station, Vent
Camp) refill oxygen and save. Breathing at the surface also refills.

## Creatures

52 species across the seven areas, each with a behaviour:

- `school`: groups that swim together; `wander`: slow cruising; `still`:
  anchored (anemones, stars); `drift`: jellies bobbing.
- `hide`: camouflaged (octopus, flounder) until a sonar ping reveals them.
- `shy`: flees if Bubbles moves fast; approach slowly (anglerfish, eels).
- `curious`: swims to Bubbles and circles (dolphins, seals).

Scanning: stay near a visible creature and a ring fills in about a second.
Each species has one short, true fact, written for kids.

## Sticky hooks

- Encyclopedia with silhouettes for missing species and completion per area.
- Upgrade parts (5) and a celebration card for each.
- Map completion percentage (cells revealed by travel and sonar).
- 12 hidden golden shells, several behind later gates.
- Daily dive: a date-seeded goal of 3 species to scan, picked only from areas
  the player can already reach (so the same day gives the same goal for the
  same progress stage, and nobody is stuck). Completing it extends a gentle
  streak (missing days resets to 1, no guilt copy).
- 10 sub paint jobs unlocked by milestones (scans, treasure, shells, streak,
  areas, completion) and shown in play.
- Personal bests: deepest dive, most scans in one dive, fastest daily dive.

## Decisions made without asking

- Treasure is a collection (30 named treasures) rather than a currency, so
  there is no shop grind; it counts toward paint unlocks and completion.
- Scanning a known creature again still counts for the daily dive.
- Golden shells: every 4 shells add an extra oxygen tank segment.
- The map is shape-authored rather than ASCII art so it stays editable and
  testable; terrain edges are roughened with seeded value noise and drawn with
  marching squares.

## Tests

- Data: unique ids, 50+ creatures, every area has creatures, facts present.
- Gating: flood fills over the cell graph prove each part is reachable with the
  parts before it, each area is not reachable before its gate, every creature
  spawn, treasure and shell is reachable with all parts, every reachable cell
  can get back to a dock (no soft-locks), and currents never trap.
- Simulation: physics, oxygen return-to-dock, scanning, sonar reveal, gates.
- Autopilot: drives the real simulation from the Home Dock to the first parts.
- Progress: saves, daily dive determinism, streak, paints, bests.
