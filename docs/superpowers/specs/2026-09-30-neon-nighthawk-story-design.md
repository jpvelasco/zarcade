# Neon Nighthawk: story and controls redesign

Two problems with the first version: arrow keys rotated the bike relative to
its nose in a fixed top-down view (Left while heading west turned you south),
and the bike cruised on its own, so players slammed into buildings. And each
contract was the same pickup-then-drop with no reason to care.

## Controls

- **Screen-space steering.** The player holds the direction they want to go.
  `assistDirection` in `src/world.js` turns that wish into a direction the bike
  can take right now: between intersections it keeps to its street, so a held
  turn waits for the next crossing; a diagonal means "take the next turn". At
  a crossing it carries on to the centre before turning, so the bike leaves on
  the new street's centre line.
- No input means the bike coasts to a stop. Dash is Space, drift is Shift.
- Traffic keeps to curb lanes and the stabilizers hold the centre line, so
  cross-traffic at intersections is the danger and the near-miss opportunity.

## Story: Light Up Vanta

HALO, the city computer, has switched off Vanta's lights for curfew on
Lantern Festival night. Mara (dispatch) sends Kit across five districts,
three jobs each (`src/story.js`). The finale delivers the kids' festival
invitation to HALO, who turns the city's lights back on and launches fireworks.

**Visible progress:** the city starts dim. Each spark lights the blocks on
both sides of the street, and each drop-off sends a wave of light through
nearby blocks (`world.lit`, `world.lightWaves`). The renderer eases blocks
from grey to saturated neon.

## Jobs

Every job is two legs of stops (`contract.legs`); any stop in the current leg
may be visited in any order.

| Kind | First leg | Second leg | Twist |
| --- | --- | --- | --- |
| delivery | pickup | drop | fragile variant takes extra damage |
| multi | pickup | 3–4 drops | any order |
| collect | 4–5 spark cells | hub | |
| chase | a runner (robot, cat) | drop | runner flees between intersections, tethered to home |
| stealth | pickup | drop | three scanner locks fail the job |
| express | pickup | drop | short window |
| finale | 3 invitation pieces | HALO Core | most drones |

**Drones:** hunters chase the bike (from before); sentries are new. They
hover over intersections on the suggested route, sweep a scan cone, give
chase for a few seconds when they spot you, then return to their post.

**Stars:** finish; collect 70% of the route's sparks; keep the bike above 70%.
Save data keeps best stars per job and unlocks chapters in order
(`save.story`).

## Determinism

All stops, sparks, sentries and runner homes come from the shift seed, chapter
and job. The story uses seed 9417; a Shift Code changes the city while keeping
the script. Runner choices use the world's seeded RNG.

## Testing

`tests/world.test.js` covers steering (holding a direction, coasting, a held
turn waiting for the intersection), each job kind, sentries, light and the
chapter flow, and runs the autopilot through all fifteen jobs.
`tests/contracts.test.js` checks stop placement, sparks, sentries, windows,
and that every line of dialogue has a known speaker.
