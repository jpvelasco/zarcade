# Groove Garden

A joyful rhythm game where music makes the garden grow. Shapes fall down the
lanes; tap each one as it reaches the glowing vine, in time with the beat.
Play well and the garden blooms, the flowers dance and the fireflies come out.

Twelve original songs in six styles (lo-fi, disco, chiptune, reggae,
synthwave, waltz), each with Easy, Normal and Hard charts. All music is
written as pattern data and synthesized live with WebAudio: drums, bass,
chords and a lead melody. No audio files.

## Play

```sh
npm run serve        # from the repo root
# then open http://localhost:8000/games/groove-garden/
```

| Action | Keyboard | Touch / mouse | Gamepad |
| --- | --- | --- | --- |
| Lanes 1-4 | D F J K, or ← ↓ ↑ → | tap or hold a lane | d-pad ← ↓ ↑ →, or X A Y B |
| Lanes 1-3 (kids layout) | D, F/J/Space, K, or ← ↓/↑ → | tap or hold a lane | d-pad ← ↓ →, or X A B |
| Pause | Esc / P | ❚❚ button | Start |
| Mute | M | Sound button | |

In menus, arrow keys or the d-pad move between buttons; Enter, Space or A
picks one; Esc or B goes back.

## Notes

Every lane has its own shape and colour, so lanes are easy to tell apart
without relying on colour: orange **circle**, blue **triangle**, pink
**diamond**, yellow **star** (three lanes use circle, triangle and star).

- **Tap**: hit it as it touches the vine.
- **Hold**: a vine trails behind the shape. Press, and keep holding until the
  vine ends. Letting go a moment early still counts; lifting and pressing
  again quickly saves the hold.
- **Slide**: the vine bends towards another lane, ending in that lane's
  shape. Hold, then move to the new lane (slide your finger across, or press
  the new lane's key) before the end.

Judgements are forgiving: **Perfect** within 55 ms, **Great** within 95 ms,
**Good** within 140 ms; later than that is a **Miss**. Tapping when nothing
is there never costs anything.

## Grades, garden and unlocks

Accuracy weighs Perfect 100%, Great 70%, Good 40%, Miss 0. Grades: **S** at
95%, **A** at 85%, **B** at 70%, otherwise **C**. The score is 90% accuracy
and 10% longest combo, up to 1,000,000.

Every hit grows the garden; misses never wilt it. Each song plants its own
bed of daisies, tulips, sunflowers, bluebells, roses and lupins, and a whole
song at S accuracy fills it. Combos make the flowers dance; the sky and the
fireflies brighten with your recent accuracy.

Four songs are open from the start. Finishing a song opens the next one (an
S opens two). Milestones unlock twelve garden decorations (gnome, birdhouse,
fairy lights, rainbow, windmill, lily pond and more; show or hide them in
**My garden**) and five note skins (petals, seeds, ladybugs, fruit, stars).

## Options and accessibility

- **Lanes**: 4, or 3 big lanes for little hands.
- **No-fail** (on by default): play to the end whatever happens. Off adds a
  garden-health bar; run out and the garden wilts.
- **Note speed** 1-5.
- **Motion**: Auto follows `prefers-reduced-motion`; Calm removes particles,
  flashes, swaying and pops but keeps the lanes, beat lines and hit line, so
  timing cues stay clear.
- **Practice** at 75% or 50% tempo from the song list. Practice runs show a
  grade but don't change bests.
- **Timing**: tap along with 16 clicks to measure your input latency, then
  nudge the picture until the dot touches the line on the click. Both are
  saved.

## How the timing works

The audio clock is the master clock. `src/music.js` turns a song into a
list of events with times in seconds; `src/audio.js` schedules each one on the
AudioContext clock about 0.17 s ahead (sample-accurate, never with
`setTimeout`). The visuals and input timestamps follow the same clock through
`AudioContext.getOutputTimestamp()`, minus the output latency, plus the
calibrated offsets. Pausing suspends the AudioContext, so the song resumes
exactly where it stopped after a 3-2-1.

If WebAudio is unavailable the game still runs, silently, on a
`performance.now()` clock.

## Files

| File | What it does |
| --- | --- |
| `src/songs.js` | the twelve songs and six styles as pattern data |
| `src/theory.js` | note names, chords, scale degrees |
| `src/timeline.js` | bars, swing, beat-to-seconds (shared by music and charts) |
| `src/chart.js` | chart strings to timed notes; three-lane folding; density |
| `src/music.js` | songs to synth events; the lookahead `Scheduler` |
| `src/timing.js` | judgement windows, clock maths, latency offsets, calibration |
| `src/play.js` | a `Session`: presses in, judgements, combo, health out |
| `src/score.js` | accuracy, grades, score |
| `src/autoplay.js` | the autoplayer (title-screen demo and test pilot) |
| `src/garden.js` | deterministic plant beds and growth |
| `src/progress.js` | saves (`groove-garden.v1`), bests, unlocks |
| `src/perf.js` | frame-time telemetry |
| `src/audio.js` | WebAudio synth voices per style, scheduling, effects |
| `src/render.js` | canvas art with baked sprites |
| `src/input.js` | keyboard, touch, mouse and gamepad lanes |
| `src/main.js` | screens, clock, loop, saves, telemetry |

Everything above `audio/render/input/main` is DOM-free and tested in Node:

```sh
node --test 'games/groove-garden/tests/*.test.js'
```

The tests check every chart (sorted, in range, playable density, notes on the
music's onsets), judging, holds and slides, scoring, the scheduler's
determinism, offsets and calibration, saves and unlocks, the garden, and that
the autoplayer gets at least 95% Perfects on every chart with frame-locked,
wobbly input.

## Debug parameters

| Parameter | Effect |
| --- | --- |
| `?song=<id>&difficulty=easy\|normal\|hard` | start that song straight away (if unlocked) |
| `&tempo=0.75` or `0.5` | practice tempo |
| `?lanes=3` | three lanes for this visit |
| `?autoplay` | the autoplayer plays your songs |

`window.GG` exposes the current run, the save, `playSong(id, difficulty,
tempo)` and `finish()` for browser checks.
