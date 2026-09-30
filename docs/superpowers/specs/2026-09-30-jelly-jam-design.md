# Jelly Jam: design

A squishy match-3 puzzle for all ages. Swap wobbly jelly critters on an 8×8
reef to free baby sea turtles. Kid-friendly: generous move counts, one free
continue per level, a hint after five idle seconds, and an automatic shuffle
when no move is left. Undersea candy palette; every character is our own.

## Board model

The board is a flat array of cells behind a playable mask, so shaped levels
(diamonds, bowls, arches, tide pools) are just holes in the mask.

| Cell | Behaviour |
| --- | --- |
| Jelly | Six colours, each with its own silhouette. Matches, falls, can hold a special |
| Ice-locked jelly | Cannot be swapped or matched. A clear next to it chips one layer |
| Coral | Never moves. A clear next to it, or a blast, takes one hit |
| Turtle egg | Falls but never matches. Hatches when it reaches the bottom of its column |

Tiles can also carry one or two layers of **sand/seaweed**, cleared by clearing
the jelly standing on them.

**Refill.** Cells drop straight down and new jellies enter at the top tile of
each column; a cell blocked from above by coral or ice pulls diagonally
instead. Two design rules keep every tile reachable, both enforced by tests:
each column's playable tiles form one unbroken run, and no row has more than
two blockers side by side (nor a pair against the board edge).

## Matching and specials

Horizontal and vertical runs of three or more are found, then crossing runs of
the same colour merge into one group. The group's shape decides its reward,
and the special appears under the jelly the player moved:

| Shape | Reward |
| --- | --- |
| 3 in a line | nothing |
| 4 in a line | striped jelly (clears that row or column) |
| L or T | bubble bomb (3×3) |
| 5 in a line | rainbow pearl (clears one colour) |

Swapping two specials fires a combo: stripe + stripe cuts a full cross, bomb +
stripe a three-wide cross, bomb + bomb a 5×5, pearl + stripe or bomb turns
every jelly of that colour into that special and fires them all, and pearl +
pearl clears the board. Blasts chain: any special caught in a blast goes off
too.

Scoring is 60 per jelly, 120 per sand layer, 150 per coral hit, 120 per ice
chip and 2000 per turtle, all multiplied by the cascade chain (1, 1.4, 1.8 … up
to 5×).

## Turn pipeline

The view never touches the board. It calls `game.swap(a, b)`, then pumps
`game.step()`, animating each returned step until `step()` returns `null`:

1. **clear** — matched cells and blast footprints: what popped, what specials
   were created, which sand, ice and coral were damaged, and the score gained.
2. **fall** — where every cell moved from and to, which jellies spawned, and
   which eggs hatched.

That repeats until the board is quiet, which makes the whole game replayable
and testable in Node: the autoplayer drives the same two calls.

When the goals are met with moves to spare, the **reef party** turns each
leftover move into a random special and sets them all off at once.

## Levels

44 hand-built levels over four areas (Sunlit Shallows, Kelp Carnival, Coral
Castle, Glow Abyss). A level is a name, a move count, a colour count, a layout
drawn as eight rows of eight characters, its goals, and three star scores.
Goal types: score, collect a colour, clear the sand, break the coral, free the
ice jellies, drop the turtle eggs.

**Balance.** A heuristic autoplayer plays every level from six seeds. Move
counts were raised until it wins at least four of six without the free
continue, and each level's star thresholds are fitted to its median winning
score (50%, 80%, 105%), so clearing the goal is worth about one star and
playing well is worth three. Egg levels deal five colours instead of six: the
extra cascades keep the floor churning so the eggs keep sinking, which the
first balance pass showed was the make-or-break factor.

Everything random comes from a seeded PRNG keyed on the level id, so
`?level=12&seed=7` always deals the same reef.

## Feel

- Jellies squash and spring on landing, blink, look toward the pointer, and
  pull a surprised face when they are about to pop.
- Bubbles, sparks and sand grains on every clear; beams for stripes, rings for
  bombs, a full-screen shimmer for pearls; a short screen shake for big blasts.
- Synthesized Web Audio only: squelch on pick-up, a pentatonic pop that climbs
  with the cascade chain, chimes for specials, and a mellow bubbly loop.
- `prefers-reduced-motion` cuts the shake, shortens the animations and thins
  out the particles.
- The pointer hides after two idle seconds during play and returns on any move.

## Testing

61 Node tests across board, specials, game, levels and autoplay: match shapes
and special creation, every combo, blast chaining, gravity and diagonal
refills, egg delivery, move detection and shuffling, per-goal tracking, the
free continue, the reef party, deterministic deals, layout validity (including
refill reachability after wiping the floor), and the autoplayer clearing the
first five levels on three seeds each.
