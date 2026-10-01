// Everything you hear is synthesized with WebAudio: no audio files.
//
// Two buses feed the speakers: sound effects (driven by world events) and
// the soundtrack (one loop per district, see music.js). Each has its own
// switch, and story chatter ducks the music so the lines stay clear.
import { SONGS, loopSteps, midiToHz, stepEvents, stepSeconds } from './music.js';

const MUSIC_LEVEL = 0.2;
const SFX_LEVEL = 0.9;

export class Audio {
  constructor({ muted = false, musicMuted = false } = {}) {
    this.muted = muted;
    this.musicMuted = musicMuted;
    this.context = null;
    this.song = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.paused = false;
    this.duckUntil = 0;
  }

  // Browsers only allow audio after a gesture, so this runs on the first
  // button press. The context is made even when muted so either bus can be
  // switched on later.
  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended' && !document.hidden) this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    this.context = context;
    this.sfx = context.createGain();
    this.sfx.gain.value = this.muted ? 0 : SFX_LEVEL;
    this.sfx.connect(context.destination);
    this.music = context.createGain();
    this.music.gain.value = 0;
    this.music.connect(context.destination);
    // A gentle echo on the arpeggio and lead gives the synthwave shimmer.
    this.echo = context.createDelay(1);
    this.echoFeedback = context.createGain();
    this.echoFeedback.gain.value = 0.32;
    this.echoTone = context.createBiquadFilter();
    this.echoTone.type = 'lowpass';
    this.echoTone.frequency.value = 2400;
    this.echo.connect(this.echoTone).connect(this.echoFeedback).connect(this.echo);
    this.echoTone.connect(this.music);
    this.noiseBuffer = this.makeNoise();
    if (context.state === 'suspended') context.resume();
    this.applyMusicLevel(0.4);
    if (this.song) this.startLoop();
  }

  makeNoise() {
    const length = Math.floor(this.context.sampleRate * 0.5);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.sfx) return;
    const now = this.context.currentTime;
    this.sfx.gain.cancelScheduledValues(now);
    this.sfx.gain.setValueAtTime(muted ? 0 : SFX_LEVEL, now);
  }

  setMusicMuted(muted) {
    this.musicMuted = muted;
    if (!this.context) return;
    this.applyMusicLevel(0.15);
    if (muted) this.stopLoop();
    else this.startLoop();
  }

  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.applyMusicLevel(0.25);
  }

  // Quiets the music under radio chatter for `seconds`.
  duck(seconds = 3.5) {
    if (!this.context) return;
    this.duckUntil = Math.max(this.duckUntil, this.context.currentTime + seconds);
    this.applyMusicLevel(0.12);
    clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => this.applyMusicLevel(0.8), seconds * 1000 + 30);
  }

  applyMusicLevel(smooth) {
    if (!this.music) return;
    const now = this.context.currentTime;
    let level = this.musicMuted ? 0 : MUSIC_LEVEL;
    if (this.paused) level *= 0.4;
    if (now < this.duckUntil) level *= 0.42;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(level, now, smooth / 3);
  }

  // Hidden tabs throttle timers, which would garble the loop; pause the
  // whole context instead.
  setHidden(hidden) {
    if (!this.context) return;
    if (hidden) this.context.suspend();
    else this.context.resume();
  }

  // ------------------------------------------------------------ music

  setSong(id) {
    if (!SONGS[id] || id === this.song) return;
    this.song = id;
    this.step = 0;
    if (this.context) this.nextTime = this.context.currentTime + 0.12;
    this.startLoop();
  }

  startLoop() {
    if (!this.context || this.timer || this.musicMuted || !this.song) return;
    this.nextTime = Math.max(this.nextTime, this.context.currentTime + 0.08);
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stopLoop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const song = SONGS[this.song];
    const step = stepSeconds(song);
    // After a long stall, skip ahead rather than playing a pile of notes.
    if (this.nextTime < context.currentTime - 0.2) this.nextTime = context.currentTime + 0.05;
    while (this.nextTime < context.currentTime + 0.18) {
      for (const event of stepEvents(song, this.step)) this.playNote(event, this.nextTime, step, song);
      this.step = (this.step + 1) % loopSteps(song);
      // A little swing on the off-beats keeps it relaxed.
      this.nextTime += step * (this.step % 2 ? 1.08 : 0.92);
    }
  }

  playNote(event, when, step, song) {
    const context = this.context;
    const length = event.steps * step;
    switch (event.voice) {
      case 'pad': {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(song.cutoff * 0.6, when);
        filter.frequency.linearRampToValueAtTime(song.cutoff, when + length * 0.5);
        filter.frequency.linearRampToValueAtTime(song.cutoff * 0.6, when + length);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(0.05, when + 0.35);
        gain.gain.setValueAtTime(0.05, when + length - 0.3);
        gain.gain.linearRampToValueAtTime(0.0001, when + length + 0.25);
        filter.connect(gain).connect(this.music);
        for (const midi of event.notes) {
          for (const detune of [-7, 7]) {
            const osc = context.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = midiToHz(midi);
            osc.detune.value = detune;
            osc.connect(filter);
            osc.start(when);
            osc.stop(when + length + 0.3);
          }
        }
        break;
      }
      case 'arp':
        this.voice(midiToHz(event.midi), when, step * 0.9, song.arpWave, 0.05, true);
        break;
      case 'lead':
        this.voice(midiToHz(event.midi), when, length * 0.95, song.leadWave, 0.06, true, 0.02);
        break;
      case 'bass': {
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midiToHz(event.midi);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.22, when + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
        osc.connect(gain).connect(this.music);
        osc.start(when);
        osc.stop(when + length + 0.05);
        break;
      }
      case 'kick': {
        const osc = context.createOscillator();
        osc.frequency.setValueAtTime(120, when);
        osc.frequency.exponentialRampToValueAtTime(42, when + 0.16);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.32 * event.gain, when);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
        osc.connect(gain).connect(this.music);
        osc.start(when);
        osc.stop(when + 0.25);
        break;
      }
      case 'snare':
        this.noise(when, 0.16, 0.12 * event.gain, 'bandpass', 1800, this.music);
        break;
      case 'hat':
        this.noise(when, 0.045, 0.07 * event.gain, 'highpass', 7000, this.music);
        break;
      default:
        break;
    }
  }

  voice(frequency, when, length, type, volume, echo, attack = 0.008) {
    const context = this.context;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    // Square and saw waves are bright; keep them softer for small ears.
    const level = type === 'square' || type === 'sawtooth' ? volume * 0.45 : volume;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(level, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.06, length));
    osc.connect(gain);
    gain.connect(this.music);
    if (echo) {
      this.echo.delayTime.setValueAtTime(stepSeconds(SONGS[this.song]) * 3, when);
      gain.connect(this.echo);
    }
    osc.start(when);
    osc.stop(when + length + 0.05);
  }

  noise(when, length, volume, type, frequency, bus) {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    source.connect(filter).connect(gain).connect(bus);
    source.start(when);
    source.stop(when + length + 0.02);
  }

  // ---------------------------------------------------------- effects

  tone(frequency, duration, { type = 'sine', volume = 0.045, end = frequency, delay = 0 } = {}) {
    if (this.muted || !this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(18, end), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  event(event) {
    if (this.muted || !this.context) return;
    switch (event.type) {
      case 'dash':
        this.tone(240, 0.16, { type: 'sawtooth', volume: 0.04, end: 700 });
        this.noise(this.context.currentTime, 0.18, 0.05, 'bandpass', 2400, this.sfx);
        break;
      case 'pulse': this.tone(540, 0.28, { type: 'sine', volume: 0.05, end: 90 }); break;
      case 'echo': this.tone(240, 0.42, { type: 'triangle', volume: 0.05, end: 650 }); break;
      case 'near-miss': this.tone(740, 0.07, { type: 'square', volume: 0.02, end: 980 }); break;
      case 'pickup':
        this.tone(360, 0.22, { type: 'triangle', volume: 0.05, end: 620 });
        this.tone(720, 0.18, { type: 'sine', volume: 0.03, end: 900, delay: 0.08 });
        break;
      case 'delivered':
        // A rising chime as the neighbourhood lights up.
        [523, 659, 784, 1047, 1319].forEach((note, i) => this.tone(note, 0.32, { type: 'triangle', volume: 0.045, end: note * 1.01, delay: i * 0.07 }));
        break;
      case 'impact':
        this.tone(90, 0.17, { type: 'square', volume: 0.05, end: 48 });
        this.noise(this.context.currentTime, 0.12, 0.08, 'lowpass', 900, this.sfx);
        break;
      case 'flux': this.tone(760, 0.18, { type: 'sine', volume: 0.04, end: 1200 }); break;
      case 'scan': this.tone(880, 0.22, { type: 'square', volume: 0.03, end: 510 }); break;
      case 'spark': {
        // Each spark in a run climbs a pentatonic step, then wraps.
        const steps = [0, 2, 4, 7, 9, 12, 14, 16];
        const note = 880 * 2 ** (steps[(event.pitch || 0) % steps.length] / 12);
        this.tone(note, 0.09, { type: 'sine', volume: 0.03, end: note * 1.02 });
        this.tone(note * 2, 0.06, { type: 'sine', volume: 0.012, end: note * 2, delay: 0.03 });
        break;
      }
      case 'stop':
        this.tone(520, 0.16, { type: 'triangle', volume: 0.05, end: 780 });
        this.tone(780, 0.2, { type: 'triangle', volume: 0.04, end: 1040, delay: 0.09 });
        this.tone(1040, 0.3, { type: 'sine', volume: 0.03, end: 1060, delay: 0.18 });
        break;
      case 'caught':
        this.tone(660, 0.12, { type: 'square', volume: 0.03, end: 990 });
        this.tone(990, 0.22, { type: 'square', volume: 0.025, end: 1320, delay: 0.1 });
        break;
      case 'alert': this.tone(1200, 0.12, { type: 'square', volume: 0.025, end: 1500 }); break;
      case 'radio': this.tone(1800, 0.04, { type: 'square', volume: 0.01, end: 1700 }); break;
      case 'chapter-complete':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((note, i) => this.tone(note, 0.4, { type: 'triangle', volume: 0.05, end: note, delay: i * 0.13 }));
        break;
      case 'failed': this.tone(180, 0.55, { type: 'sawtooth', volume: 0.05, end: 42 }); break;
      default: break;
    }
  }
}
