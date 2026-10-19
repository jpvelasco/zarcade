# Hoop Heroes — design

An arcade basketball shooting game for the Starlight Arcade (slug
`hoop-heroes`, genre Sports). You play Ace, a puppy in a bright jersey,
seen from behind on a cartoon court. Flick the ball up at the hoop: the flick
direction aims and its speed sets the power. Balls arc, rattle on the rim,
bank off the board and swish through a springy net.

## View and units

Pseudo-3D, behind the shooter, drawn with Canvas 2D through a small
perspective camera (no Three.js). World units are metres: x right, y up,
z toward the hoop. The rim centre sits at (hoopX, 3.05, 0) and the board's
front face 0.4 m behind it. Arcade sizes: ball radius 0.12, rim radius 0.28
(a little larger than real, so kids get swishes), rim tube 0.02.

The camera sits behind and above the shooter's spot and looks at the hoop,
so moving between spots (racks, corners) swings it around the court. Ace is a
foreground sprite at the bottom of the screen, anchored so his raised hands
hold the ball at its projected position; his jersey colour and number are
the equipped jersey.

## Physics (`src/physics.js`, DOM-free, deterministic)

- Fixed step 1/240 s, exact constant-gravity integration
  (p += v·dt + ½g·dt², v += g·dt). No randomness inside physics.
- Rim: sphere vs torus (closest point on the rim circle), relative to the
  rim's own velocity when the hoop moves. Normal restitution 0.55, tangential
  0.85, so balls rattle and roll before dropping or spilling out.
- Board, blockers: sphere vs box (closest point), restitution 0.62 / 0.8.
- Trampoline: a floor disc that throws the ball back up at 0.9× its fall
  speed, at least 8 m/s (scaled with gravity) and at most 11 m/s, keeping its
  forward speed.
- Floor restitution 0.68 with rolling friction. Net: once a ball is through,
  it is damped inside the net so it drops out underneath.
- A make is the ball centre crossing the rim plane downward inside the ring.
  Swish = no rim or board touch. Bank = board touched first.

## Shots (`src/shots.js`)

- `idealShot(setup)` finds a launch (yaw, elevation, speed). Normal shots are
  analytic for a fixed elevation (55°, 64° for "over the blocker" levels).
  Bank and trampoline shots use a deterministic numeric solve (Newton /
  bisection over simulated flights with the rim turned off). AI can ask for a
  lead on moving hoops (predicts the hoop at arrival).
- Player input is expressed as errors relative to the ideal, so every shot
  type shares one mapping:
  - aim error = screen angle between the flick and the direction from the
    ball to the aim point (hoop, or the star on the board in bank levels). On
    trampoline levels the pad sits below the ball on screen, so the flick
    heads up toward the hoop (the pad is on that line);
  - power error = log2(flick speed / reference flick), with flick speed in
    screen heights per second; the reference grows with the ideal speed, so
    deeper shots need a harder flick.
  - yaw = ideal + aim × 0.18; speed = ideal × (1 + power × 0.03). A flick
    within about 10° and 20 % of the ideal scores from every spot, matching
    the coach's "aim a little left" (0.18 rad) and "a bit harder" (0.3)
    hints; 15° off misses.
  - Trampoline shots forgive far more on court (a big pad, a fixed bounce),
    so a flick's errors count 1.4× (aim) and 3.5× (power) there, which gives
    them the same feel and make rates as other shots.
- The reference flick slowly adapts to the player's own flicks (saved), so a
  child's gentle flick and an adult's snap both work. "Easy aim" (settings)
  halves both errors.
- Keyboard and gamepad use a timing meter: a marker sweeps a power bar and
  Space / A shoots at its position (the green band is a swish). The bar's ends
  are ±5.25 % launch speed whatever the power gain. Aim is centred on the
  hoop; ← → / stick nudge it to lead moving hoops.
- Moving hoops: the player's ideal aims at where the hoop is now, so leading
  the hoop (or timing the release) is the skill.

## Rival AI (`src/ai.js`)

Rivals shoot the lead-corrected ideal plus seeded Gaussian error in yaw and
speed, at a cadence per difficulty. Tuned by Node tests:
rookie ≈ 35–55 % makes, pro ≈ 50–68 %, all-star ≈ 62–80 %, champion
≈ 72–90 %. After a loss against the same rival, the rival gets a bit less
accurate (up to three times) so nobody gets stuck. The same AI at all-star
level plays the title-screen attract mode and `?autopilot`.

## Rounds (`src/round.js`)

One `Round` per shooter (player and rival are separate rounds with the same
rules and seed). Rules kinds:

- **Timed**: 60 s (45 s in the tournament). Unlimited balls, a new ball every
  0.5 s. Move to the next spot after 3 makes. 2 points a basket, +1 swish,
  +1 bank.
- **Moving hoop**: timed, the hoop slides (and bobs on later courts).
- **Money racks**: five racks of five balls around the arc; the last ball of
  each rack is a rainbow money ball (2 points), the final rack is all money.
- **Trick shots**: N balls, only valid makes count: bank only, over the
  blocker, off the trampoline. Stars by makes.
- **On fire**: 3 swishes in a row lights the ball. While on fire every basket
  is worth double; a miss puts it out.
- Balls still in the air at the buzzer count ("Buzzer beater!").

## Tournament (`src/rivals.js`, `src/courts.js`)

Four courts, three animal rivals each, 45-second head-to-head rounds. The
rival's score and recent shots show in a "rival cam" card in the HUD.

| Court | Gravity | Rivals |
| --- | --- | --- |
| Park | 9.8 | Hops the bunny (timed), Nutty the squirrel (moving), Bandit the raccoon (racks) |
| Beach | 9.8 | Pinch the crab, Splash the seal, Flora the flamingo |
| Rooftop | 9.8 | Coo the pigeon, Alley the cat, Rusty the fox |
| Space Station | 4.0 | Orbit the monkey, Cosmo the panda, King Leo the lion |

Beating a court's third rival wins its trophy and unlocks that court for
Quick Play; beating King Leo wins the Golden Hoop.

## Sticky hooks (all saved under `hoop-heroes.v1`)

- Tournament ladder with four court trophies and the Golden Hoop.
- Locker: 8 balls, 7 jerseys, 6 court themes (Park, Beach, Rooftop, Space,
  plus Neon Night and Candy Court). Most are bought with tickets earned from
  every round (generous: a good round buys a cheap item); a few come from
  trophies. Equipped ball and jersey show in play.
- Three rotating challenges ("Make 3 bank shots", "Get on fire", ...). A
  finished one pays tickets and is replaced by the next from a fixed cycle.
- Daily Shootout: rules, court, spots and hoop motion from a seed derived
  from the local date; best score per day and a gentle streak (play on
  consecutive days).
- Personal bests per mode and per rival, "New best!" on results, and a one-tap
  Again button (Space / Enter / A) that restarts in well under two seconds.

## Design calls made without the user

- Rival and player shoot at separate hoops; the rival is shown as a card
  rather than a second 3D hoop, so phones stay readable.
- Tickets are only earned in play, never bought; prices are low.
- No ball-ball collisions between multiple balls in flight (arcade feel).
- Trick-shot levels are a separate star-rated mode (12 levels), while the
  "three rotating challenges" are the missions on the title screen.
