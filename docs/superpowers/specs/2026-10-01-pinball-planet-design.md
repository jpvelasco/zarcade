# Pinball Planet: design

A space-themed pinball table for all ages, built around flipper feel. The
player launches a chrome ball, keeps it alive with two flippers and works
through three missions on a single table with a simulated dot-matrix
display.

## Table

A fixed 640 × 1100 portrait table (units ≈ 0.8 mm). On landscape screens the
table fills the height, the DMD and a cartoon backglass sit on the left, and
a missions panel sits on the right. On portrait screens the DMD sits above
the table like a backbox. The top 58 px stay free for the HUD buttons and the
full-screen pill.

Layout, top to bottom: a round top arc fed by the plunger lane through a
one-way gate; U-F-O rollover lanes; three pop bumpers; left and right orbit
lanes with one-way diverters at their exits (orbit balls are turned towards
the middle instead of running down the wall into an outlane); the spinner
lane; the Black Hole (a saucer with a gravity well and a back wall) behind a
bank of three asteroid drop targets; the Comet Ramp, an upper-layer U-turn
that returns to the right inlane; bumps on the side walls above the
outlanes; slingshots; inlanes, outlanes and a left kickback; flippers.

Every collider is a segment, arc or circle with a thickness and a material
(restitution, friction). The renderer draws the rails from the same
colliders, so the art matches the physics.

## Physics

- Fixed step of 1/240 s. Each step is split into sub-steps so that no ball
  moves more than 0.45 ball radii relative to anything it could hit
  (including a swinging flipper tip). With moves below half a radius a ball
  centre can never cross a wall between checks, so nothing tunnels; tests
  fire balls at 6000 units/s through zero-thickness walls, posts and arcs.
- Contacts push the ball out along the normal and apply an impulse with
  restitution and Coulomb friction against the surface velocity. Impacts
  below 45 units/s don't bounce, so balls settle into resting contact.
- Gravity is 1250 units/s² down the table. Balls lose 6 %/s rolling.
- Ball-to-ball hits are equal-mass with e = 0.9.

### Flippers

Flippers are kinematic tapered capsules (84 long, radius 13 at the pivot and
7 at the tip) driven at 32 rad/s up (about 30 ms) and 17 rad/s down, with
hard stops at +30° and −28°. The contact point's surface velocity
(ω × r) goes into the impulse, so the base is slow and the tip fast. The
inlane guides end tangent to the flipper base, so a ball rolls smoothly from
inlane to flipper. This gives the real-table techniques, all covered by
tests: a ball dropped on a raised flipper settles in the cradle; a live catch
from the inlane; release, let it roll and flip to aim (most timings clear
the asteroid bank, a good one reaches the top lanes); a short tap passes a
cradled ball to the other flipper.

### Devices

- **Plunger:** hold to pull back (0.85 s to full). The pull-to-speed curve
  has a flat middle so a range of medium pulls drops into the U-F-O lanes
  (the skill shot); a full pull loops the orbit.
- **Pop bumpers** kick the ball out at 950 units/s. **Slingshots** fire only
  when the face itself is hit (not the corner posts).
- **Drop targets** fall when hit at 110 units/s or more.
- **Spinner:** a pass spins it at speed/50 rev/s, decaying; every revolution
  is a switch.
- **Comet Ramp:** crossing the mouth upwards moves the ball to layer 1, where
  only ramp walls exist. A weak shot rolls back down and returns to layer 0;
  a made ramp passes the apex switch and exits into the right inlane.
- **Black Hole:** a well pulls nearby balls in and damps them; a slow ball at
  the centre is captured, held, then ejected down and to the left.
- **Ball search:** a ball that hasn't moved for 5 s (and isn't cradled or on
  the plunger) gets a gentle kick.
- **Nudge** pushes every ball sideways; the tilt meter decays over time.

## Rules

Three balls. Missions:

| Mission | How | Reward |
| --- | --- | --- |
| Planet Tour | Lanes, asteroid bank and visits light planets at the five shots; shoot a lit shot to visit | 250 K × planets visited; tour 2.5 M and Extra Ball lit |
| Asteroid Field | Drop all three asteroids | 20 s frenzy: +25 K per switch, the Black Hole is open |
| Black Hole | Ramp lights lock; two locks start multiball | Jackpots (1 M, +250 K each) at the ramp and orbits; super jackpot (5 M) after three |

Also: skill shot (500 K), U-F-O lanes (bonus ×, lane change with the
flippers), combos (major shots within 4 s), ball save (10 s; 15 s at
multiball start), kickback (relit by 20 spins), Space Mystery at the Black
Hole, tilt (two warnings), end-of-ball bonus. The rules engine is DOM-free
and physics-free: the world reports switches and asks for decisions (lock,
multiball or eject; save, continue or end ball).

## Display and presentation

- **DMD:** 128 × 32 dots, 16 brightness levels, three bitmap fonts (3 × 5,
  5 × 7 and 5 × 7 doubled). Score screen with ball, planet progress and
  status line; animated callouts (sliding planets, asteroid showers, black
  hole spirals, jackpot rays, rocket skill shot), a priority queue so big
  moments interrupt small ones, the bonus count, attract pages and high
  score entry. Rendered as an ImageData under a baked round-dot mask with a
  soft glow.
- **Table art** is baked once per size into an offscreen canvas: deep-space
  playfield, the home planet behind the flippers, painted planets, rails,
  rubbers and slingshot plastics. Inserts are sprites with baked glow; lamps
  fade like bulbs and run a light show in attract mode. The ramp is a
  translucent overlay drawn between the playfield and upper-layer balls.
- **Juice:** sparks, bumper rings, score pop-ups, ball trails at speed, a
  table jolt on nudge and a red flash on tilt. Reduced motion removes the
  jolt, trails and most particles.
- **Sound:** synthesized solenoid thunks, pops, clacks, whooshes and a
  space-funk loop (swung filter bass, clav stabs, drums, pad) that speeds up
  in multiball.

## Performance

No shadowBlur or filters per frame; glows are cached sprites; the playfield
is one drawImage; particles are capped at 160; the DMD is one putImageData.
Steady 60 fps on a laptop and under CPU throttling ×4.

## Testing

`node --test 'games/pinball-planet/tests/*.test.js'`: collision maths and
tunnelling, the flipper model, table validity (closed outline, Monte-Carlo
balls up to 6000 units/s only ever leave down the drain and never end up
inside solids), ramp, orbit, Black Hole, multiball, drains, kickback, tilt,
ball search, determinism, rules and missions, DMD fonts and scenes, saves,
and an autoplayer that keeps the ball alive (it also runs attract mode).
