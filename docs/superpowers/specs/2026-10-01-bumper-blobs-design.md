# Bumper Blobs: design

A couch party sumo game for 1–4 players. Squishy jelly blobs bump each other
off floating dessert arenas. Bots fill empty seats, so one player can play
alone, and one touch player can play on a phone.

## Feel

- **Move** with a stick or keys. Blobs accelerate quickly and glide a little.
- **Dash-bump**: hold the action button to charge (the blob squashes and
  shivers), let go to launch. A full charge is about twice as fast as a tap.
- **Ground-pound**: let go of a charge without a direction, or press the
  pound button. The blob hops, slams down, and shoves everyone nearby.
- Hits exchange momentum along the contact normal (restitution 0.7) plus an
  equal-and-opposite "boost", so momentum is always conserved. The weaker
  attacker slides further for a moment (low friction) unless they hold
  against the slide to dig in.
- Hard hits freeze the simulation for 30–110 ms (hitstop), with particles,
  screen shake, a soft-body wobble and an announcer pop ("BONK!").
- A blob whose centre leaves the floor falls and is out (ring-out). The last
  blob to touch it gets the credit.

## Arenas

Ten arenas, all centred on the origin with a known extent:

| Arena | Twist |
| --- | --- |
| Pudding Plate | Plain disc |
| Shrinkin' Sundae | The disc shrinks |
| Frosty Rink | Rounded rectangle of ice: low friction and grip |
| Conveyor Cafe | Belts carry blobs sideways in alternating directions |
| Spin Cycle | A turntable carries blobs around and flings them outward |
| Bumper Garden | Mushroom bumpers kick blobs away |
| Lava Lagoon | Terraced island; lava rises tier by tier |
| Teeter Tower | A seesaw plank tips toward the heavier end and blobs slide downhill |
| Crumble Cookie | Tiles crack under blobs and fall away |
| Donut Drift | A ring with a hole in the middle |

In the respawn modes the shrinking, lava and tiles cycle back instead of
running out. Random **power-ups** (giant, sticky, magnet, bubble shield) and
**bombs** (a shadow warns, then a blast) can be switched off.

## Modes

- **Last Blob Standing**: rounds on rotating arenas; first to N round wins.
  After 60 s a sudden-death ring closes in, so every round ends. Draws score
  nobody; after `target × players + 2` rounds the leader wins.
- **King of the Hill**: a glowing zone hops between spots every 12 s. A blob
  alone in it scores one point per second. Ring-outs respawn after 2 s.
- **Coin Grab**: coins spawn on the floor; falling off drops three of yours
  back onto the arena.

Timed modes end at the target or after 120 s; a tie goes to 30 s of overtime,
then to the tiebreak (fewer falls, more ring-outs, player order).

## Code shape

DOM-free modules (`config`, `rng`, `arenas`, `physics`, `modes`, `world`,
`ai`, `match`, `save`) hold every rule and are tested in Node. The world
steps at a fixed 120 Hz from a seed, so rounds and whole bot matches replay
exactly. The page (`main`, `input`, `render`, `audio`) only reads world state
and its event list.

Bots re-plan 2–10 times a second. They probe the floor with rays to find
each blob's nearest edge, pick the foe easiest to knock off, line up on the
far side of it and dash. They back off when near an edge and go for the zone,
coins and power-ups. Easy bots think slowly, aim loosely and are a little
reckless; Hard bots check the edge every step.

## Progression

Stars come from matches (1 for playing, 1 per round won, 3 for a match win)
and ten trophies (5 each). Stars unlock eleven hats. Eight colours and eight
faces are always free. Everything is saved under `bumper-blobs.v1`.
