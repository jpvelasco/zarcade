// The arrangement: a song's pattern data expanded into timed synth events
// (drums, bass, chords, lead). DOM-free; audio.js only plays what this says.
import { STYLES } from './songs.js';
import { parseChord, degreeToMidi } from './theory.js';
import { layout, splitBars, stepsPerBar, STEPS_PER_BEAT, beatToTime, secondsPerBeat } from './timeline.js';

const DRUM_KIT = { k: 'kick', s: 'snare', h: 'hat', o: 'open' };
// Instruments in a fixed order so simultaneous events always sort the same.
export const INSTRUMENTS = ['stick', 'kick', 'snare', 'hat', 'open', 'bass', 'chord', 'lead'];
const ORDER = Object.fromEntries(INSTRUMENTS.map((name, i) => [name, i]));

/** The chord sounding at step `step` of a bar ('Am7 D7' splits the bar). */
function chordAt(section, barInSection, step, spb) {
  const sym = section.chords[barInSection % section.chords.length];
  const parts = sym.trim().split(/\s+/);
  const idx = Math.min(parts.length - 1, Math.floor((step / spb) * parts.length));
  return parseChord(parts[idx]);
}

// Hold length of a pattern step: the step plus any '-' that follow it.
function heldSteps(pattern, i) {
  let n = 1;
  while (pattern[i + n] === '-') n++;
  return n;
}

function bassMidi(chord, ch) {
  const root = 36 + chord.root + (chord.root < 4 ? 12 : 0); // E2..D#3
  switch (ch) {
    case 'R': return root;
    case '5': return root + 7;
    case 'O': return root + 12;
    case '3': return root + chord.intervals[1];
    default: return null;
  }
}

function voicing(chord) {
  return chord.intervals.slice(0, 4).map((iv) => {
    let n = 48 + ((chord.root + iv) % 12);
    while (n < 55) n += 12;
    return n;
  }).sort((a, b) => a - b);
}

/**
 * Every musical event in a song, sorted by time. Times are seconds from the
 * first downbeat; a one-bar count-in sits at negative times.
 */
export function songEvents(song, { tempoScale = 1, countIn = true } = {}) {
  const style = STYLES[song.style];
  const spb = stepsPerBar(song);
  const beats = style.beats;
  const stepBeat = 1 / STEPS_PER_BEAT;
  const spbSec = secondsPerBeat(song, tempoScale);
  const events = [];
  const push = (beat, inst, extra) => events.push({ beat, t: beatToTime(song, beat, tempoScale), inst, ...extra });

  if (countIn) for (let b = -beats; b < 0; b++) push(b, 'stick', { vel: b === -beats ? 1 : 0.7 });

  for (const part of layout(song).parts) {
    const { section } = part;
    const kind = section.drums || 'main';
    const leadBars = section.lead ? splitBars(section.lead, true) : null;
    for (let b = 0; b < part.bars; b++) {
      const bar = part.startBar + b;
      const barBeat = bar * beats;
      const fill = kind === 'main' && part.bars >= 4 && b === part.bars - 1;
      const kit = kind === 'none' ? {} : style.drums[fill ? 'fill' : kind] || {};
      for (const [track, pattern] of Object.entries(kit)) {
        for (let i = 0; i < spb; i++) {
          if (pattern[i] === 'x' || pattern[i] === 'X') {
            push(barBeat + i * stepBeat, DRUM_KIT[track], { vel: pattern[i] === 'X' || i === 0 ? 1 : 0.75 });
          }
        }
      }
      if (section.bass !== false) {
        const pattern = section.bassPattern || style.bass;
        for (let i = 0; i < spb; i++) {
          const midi = bassMidi(chordAt(section, b, i, spb), pattern[i]);
          if (midi === null) continue;
          push(barBeat + i * stepBeat, 'bass', { midi, dur: heldSteps(pattern, i) * stepBeat * spbSec * 0.92, vel: i === 0 ? 1 : 0.8 });
        }
      }
      if (section.comp !== false) {
        const pattern = style.comp;
        let arp = 0;
        for (let i = 0; i < spb; i++) {
          const ch = pattern[i];
          if (ch !== 'x' && ch !== 'a') continue;
          const notes = voicing(chordAt(section, b, i, spb));
          const dur = heldSteps(pattern, i) * stepBeat * spbSec * 0.9;
          if (ch === 'x') push(barBeat + i * stepBeat, 'chord', { notes, dur, vel: 0.8 });
          else push(barBeat + i * stepBeat, 'chord', { notes: [notes[arp++ % notes.length] + 12], dur, vel: 0.6, arp: true });
        }
      }
      if (leadBars) {
        const tokens = leadBars[b % leadBars.length];
        if (spb % tokens.length) throw new Error(`${song.id} ${part.name}: melody bar has ${tokens.length} tokens`);
        const tokBeats = spb / tokens.length * stepBeat;
        tokens.forEach((tok, i) => {
          if (tok === '.' || tok === '-') return;
          const midi = degreeToMidi(tok, song.tonic, song.mode);
          let held = 1;
          while (tokens[i + held] === '-') held++;
          push(barBeat + i * tokBeats, 'lead', { midi, dur: held * tokBeats * spbSec * 0.94, vel: 0.9 });
        });
      }
    }
  }
  events.sort((a, b) => a.t - b.t || ORDER[a.inst] - ORDER[b.inst] || (a.midi ?? 0) - (b.midi ?? 0));
  return events;
}

/**
 * Hands out events as the audio clock approaches them. `startTime` is the
 * AudioContext time of the song's first downbeat; each event gets
 * `time = startTime + t`, however often or unevenly `due` is called.
 */
export class Scheduler {
  constructor(events, startTime) {
    this.events = events;
    this.startTime = startTime;
    this.next = 0;
  }

  due(until) {
    const out = [];
    while (this.next < this.events.length && this.startTime + this.events[this.next].t <= until) {
      const ev = this.events[this.next++];
      out.push({ ...ev, time: this.startTime + ev.t });
    }
    return out;
  }

  get done() {
    return this.next >= this.events.length;
  }
}
