# Groove Garden: design

A joyful, all-ages rhythm game. Shapes fall down four lanes (three for small
children) onto a glowing vine; hitting them in time with the music grows a
garden that blooms, dances and lights up as accuracy rises. Twelve original
songs, synthesized live, each with three charts.

## Pillars

1. **The music is the clock.** Notes must sit exactly on what you hear. One
   function, `beatToTime`, converts beats to seconds for both the
   arrangement and the charts, so alignment holds by construction, and a
   test checks that every note lands on a sound in the song.
2. **Kind to kids.** Wide windows, no penalty for extra taps, no-fail on by
   default, three-lane mode, a garden that never wilts from misses.
3. **Readable at a glance.** Each lane has a distinct shape *and* colour
   (Okabe-Ito palette): circle, triangle, diamond, star. Note skins change
   the art inside the shape, never the shape.

## Timing model

| Quantity | Definition |
| --- | --- |
| `start` | AudioContext time of the song's first downbeat (one count-in bar plus 0.7 s after Play) |
| audio time at an instant | `getOutputTimestamp()` interpolated to that `performance.now()`, plus output latency (the scheduling clock) |
| heard song time | `audioTime − start − (outputLatency + baseLatency)` |
| judged time | `heard − inputOffset` (calibrated by tapping along) |
| display time | `heard + visualOffset` (nudged on the timing screen) |

Inputs carry their own timestamps (`KeyboardEvent.timeStamp`,
`PointerEvent.timeStamp`, `Gamepad.timestamp`), so judging does not depend
on frame rate. Music events are scheduled 0.18 s ahead by a 25 ms timer
plus every frame; each event is played at exactly `start + t`. Pause suspends
the AudioContext (freezing its clock) and resumes after a 1.5 s 3-2-1.

Measured in headless Chrome: 752/752 events of a song scheduled at exactly
`start + t`, with a lead of 160-180 ms.

## Data formats

Songs (`src/songs.js`) are a key, tempo, mode, style and a form of named
sections. Styles hold the groove as 16-step strings (12 in 3/4): drums
(`k s h o` tracks), a bass rhythm (`R 5 O 3`, `-` hold) and a comping rhythm
(`x` chord, `a` arpeggio). Sections hold chords per bar, a melody in scale
degrees (`5 - 3 . 1'`) and three chart strings.

Chart tokens, spread evenly across each bar:

```
'1'-'4'  a note in that lane        '[14]'  two lanes together
'-'      hold the last note a step  '~3'    end the hold by sliding to lane 3
'.'      nothing
```

A chart or melody shorter than its section repeats. Three-lane mode folds
lanes 2 and 3 together and drops anything that would then collide.

## Judging and scoring

| Judgement | Window | Weight | Health |
| --- | --- | --- | --- |
| Perfect | ±55 ms | 1.0 | +2% |
| Great | ±95 ms | 0.7 | +1.2% |
| Good | ±140 ms | 0.4 | +0.4% |
| Miss | later | 0 | −8% |

Holds and slides judge twice: the head, then the tail. Letting go within
150 ms of the end counts as held through; re-pressing within 120 ms saves a
hold. A slide's tail is Perfect if the target lane is held at the end, Good
otherwise. Grades: S ≥ 95%, A ≥ 85%, B ≥ 70%, else C. Score =
1,000,000 × (0.9 × accuracy-weighted total + 0.1 × max combo / judgements).

## The garden

Each song seeds a deterministic bed of 28 plants (`plantGarden(songId)`),
with bloom thresholds spread from 2% to 92%. Growth is the sum of hit
weights; a full song at S accuracy fills the garden. Nothing ever shrinks.
Combo drives dancing (sway and bob on the beat); recent accuracy and growth
cross-fade the sky from dusky blue to a glowing sunset and bring out
fireflies. Decorations unlocked from milestones stand in fixed slots beside
the lanes.

## Progression

Four songs open at the start; finishing a song opens the next (an S opens
two). Twelve decorations and five note skins unlock from milestones (first
clear, first A/S, full combo, Normal/Hard clears, every style played,
calibrating, practising, 5 and 10 clears). Practice (75%/50% tempo) and
wilted runs never change bests. Save key: `groove-garden.v1`.

## Structure

| Module | Responsibility |
| --- | --- |
| `songs.js`, `theory.js`, `timeline.js` | data, music theory, bar layout and swing |
| `chart.js` | notes from chart strings, folding, density |
| `music.js` | arrangement events and the `Scheduler` |
| `timing.js` | windows, clock maths, offsets, calibration estimate |
| `play.js`, `score.js` | a play `Session`; accuracy, grade, score |
| `autoplay.js` | planned presses/releases; `simulate` for tests |
| `garden.js`, `progress.js` | garden growth; saves and unlocks |
| `audio.js`, `render.js`, `input.js`, `main.js` | browser-only: synth, canvas, input, screens |

## Testing

`node --test 'games/groove-garden/tests/*.test.js'`: chart validity for
every song, difficulty and lane count (sorted, in range, hold lengths, peak
density per 2 s, chords, lane gaps, no slides/chords on Easy), notes on the
music's onsets (≥ 95% on drums, bass, chords or melody), judgement windows,
holds/slides/re-grabs, no-fail and wilting, scoring and grades, scheduler
determinism under uneven pumping, latency offsets and calibration
estimates, save repair and unlocks, garden determinism, and the autoplayer
scoring ≥ 95% Perfect on every chart with 60 fps frame-locked input and
±20 ms wobble (and at 30 fps).

## Performance

Backgrounds, highway, notes, receptors, flowers, words and decorations are
baked into offscreen canvases on resize or skin change; a frame is mostly
`drawImage`, a few strokes for stems and vines, and one combo string. Steady
60 fps (p95 16.7 ms) at 1366×860 @2x, including under 4× CPU throttling;
scene changes take under 20 ms at 4×.
