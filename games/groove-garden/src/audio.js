// Everything you hear, synthesized live with WebAudio: no audio files.
//
// music.js decides what plays when; this file only turns those events into
// oscillators and noise. Events are scheduled on the AudioContext clock a
// little ahead of time (a short lookahead pumped by a timer and by every
// frame), so timing is sample-accurate however the page's timers wobble.
import { Scheduler } from './music.js';
import { midiToHz } from './theory.js';
import { audioTimeAt } from './timing.js';

const LOOKAHEAD = 0.18;

// Instrument colours per style.
const VOICES = {
  lofi: {
    kick: { f0: 120, f1: 42, decay: 0.32, gain: 0.8 },
    snare: { freq: 1500, decay: 0.16, gain: 0.32, tone: 190, lp: 3200 },
    hat: { decay: 0.035, gain: 0.12 },
    bass: { wave: 'sine', gain: 0.5, lp: 600, release: 0.08 },
    chord: { wave: 'sine', wave2: 'triangle', gain: 0.075, attack: 0.01, lp: 2400, tremolo: true },
    lead: { wave: 'triangle', gain: 0.2, attack: 0.02, lp: 3000, vibrato: 5 },
  },
  disco: {
    kick: { f0: 160, f1: 48, decay: 0.26, gain: 0.95 },
    snare: { freq: 1200, decay: 0.15, gain: 0.38, tone: 210, clap: true },
    hat: { decay: 0.03, gain: 0.14 },
    bass: { wave: 'sawtooth', gain: 0.34, lp: 900, env: 1400, release: 0.04 },
    chord: { wave: 'sawtooth', detune: 9, gain: 0.04, attack: 0.012, lp: 2600 },
    lead: { wave: 'square', gain: 0.1, attack: 0.008, lp: 3200, vibrato: 3 },
  },
  chiptune: {
    kick: { f0: 200, f1: 50, decay: 0.12, gain: 0.7, wave: 'square' },
    snare: { freq: 3000, decay: 0.09, gain: 0.3, hp: true },
    hat: { decay: 0.02, gain: 0.1 },
    bass: { wave: 'triangle', gain: 0.5, release: 0.02 },
    chord: { wave: 'square', gain: 0.045, attack: 0.002, lp: 5000 },
    lead: { wave: 'square', gain: 0.11, attack: 0.002, lp: 6000, vibrato: 0 },
  },
  reggae: {
    kick: { f0: 110, f1: 40, decay: 0.4, gain: 0.9 },
    snare: { freq: 2600, decay: 0.07, gain: 0.32, tone: 420, rim: true },
    hat: { decay: 0.03, gain: 0.1 },
    bass: { wave: 'sine', gain: 0.62, lp: 400, release: 0.06 },
    chord: { wave: 'square', gain: 0.05, attack: 0.003, lp: 1700, short: 0.12 },
    lead: { wave: 'sawtooth', gain: 0.075, attack: 0.03, lp: 1500, vibrato: 4 },
  },
  synthwave: {
    kick: { f0: 150, f1: 45, decay: 0.3, gain: 0.95 },
    snare: { freq: 1400, decay: 0.28, gain: 0.36, tone: 180 },
    hat: { decay: 0.03, gain: 0.1 },
    bass: { wave: 'sawtooth', gain: 0.3, lp: 700, env: 900, release: 0.03 },
    chord: { wave: 'sawtooth', detune: 12, gain: 0.032, attack: 0.25, lp: 1500 },
    lead: { wave: 'sawtooth', detune: 7, gain: 0.07, attack: 0.02, lp: 2600, vibrato: 4 },
  },
  waltz: {
    kick: { f0: 90, f1: 50, decay: 0.45, gain: 0.55 },
    snare: { freq: 4000, decay: 0.05, gain: 0.12, hp: true },
    hat: { decay: 0.05, gain: 0.08, bell: true },
    bass: { wave: 'triangle', gain: 0.5, release: 0.05, pluck: true },
    chord: { wave: 'triangle', gain: 0.07, attack: 0.01, lp: 3000, short: 0.28 },
    lead: { wave: 'sine', gain: 0.22, attack: 0.04, lp: 4000, vibrato: 5 },
  },
};

export class Audio {
  constructor({ muted = false } = {}) {
    this.muted = muted;
    this.ctx = null;
    this.scheduler = null;
    this.songBus = null;
    this.style = 'lofi';
    this.timer = null;
    this.musicLevel = 1;
  }

  get available() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Browsers only allow sound after a gesture: called from the first input. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.reverb.connect(wet).connect(this.master);
    this.noise = this.makeNoise();
  }

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  setMusicLevel(level) {
    this.musicLevel = level;
    if (this.music) this.music.gain.setTargetAtTime(level, this.ctx.currentTime, 0.08);
  }

  /** Output latency: how long after scheduling a sound reaches the speakers. */
  get latency() {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  /**
   * AudioContext time at a performance.now() instant. Between the
   * context's coarse clock updates this interpolates from
   * getOutputTimestamp, so the visuals glide instead of stepping.
   */
  timeAt(perfMs = performance.now()) {
    const ctx = this.ctx;
    if (!ctx) return 0;
    if (ctx.state !== 'running') return ctx.currentTime;
    const stamp = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (!stamp || !stamp.performanceTime) return ctx.currentTime;
    // getOutputTimestamp reports what is leaving the speakers; add the
    // latency back so this stays on the scheduling clock.
    const t = audioTimeAt(perfMs, stamp) + (ctx.outputLatency || 0);
    // Never drift far from the real clock (tab throttling, device changes).
    return Math.abs(t - ctx.currentTime) > 0.25 ? ctx.currentTime : t;
  }

  // ------------------------------------------------------------ songs

  /** Start playing `events` with the first downbeat at AudioContext time `startTime`. */
  startSong(style, events, startTime) {
    if (!this.ctx) return;
    this.stopSong(0.05);
    this.style = style;
    this.songBus = this.ctx.createGain();
    this.songBus.connect(this.music);
    this.songBus.connect(this.reverb);
    this.scheduler = new Scheduler(events, startTime);
    this.pump();
    this.timer = setInterval(() => this.pump(), 25);
  }

  stopSong(fade = 0.4) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.scheduler = null;
    const bus = this.songBus;
    this.songBus = null;
    if (bus && this.ctx) {
      const now = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => bus.disconnect(), (fade + 0.2) * 1000);
    }
  }

  pump() {
    if (!this.scheduler || !this.ctx || this.ctx.state !== 'running') return;
    const until = this.ctx.currentTime + LOOKAHEAD;
    for (const ev of this.scheduler.due(until)) {
      if (ev.time < this.ctx.currentTime - 0.02) continue; // too late to play (tab was asleep)
      this.play(ev, Math.max(ev.time, this.ctx.currentTime));
    }
    if (this.scheduler.done) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Pause freezes the AudioContext clock itself, so the song resumes exactly. */
  pause() {
    this.paused = true;
    if (this.ctx && this.ctx.state === 'running') return this.ctx.suspend();
    return Promise.resolve();
  }

  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  play(ev, at) {
    const v = VOICES[this.style] || VOICES.lofi;
    const out = this.songBus;
    switch (ev.inst) {
      case 'stick': return this.woodblock(at, ev.vel, out);
      case 'kick': return this.kick(at, ev.vel, v.kick, out);
      case 'snare': return this.snare(at, ev.vel, v.snare, out);
      case 'hat': return this.hat(at, ev.vel, v.hat, 0, out);
      case 'open': return this.hat(at, ev.vel, v.hat, 0.16, out);
      case 'bass': return this.voice(at, [ev.midi], ev.dur, ev.vel, v.bass, out);
      case 'chord': return this.voice(at, ev.notes, ev.dur, ev.vel, ev.arp ? { ...v.chord, gain: v.chord.gain * 1.5, attack: 0.003 } : v.chord, out);
      case 'lead': return this.voice(at, [ev.midi], ev.dur, ev.vel, v.lead, out);
      default: return undefined;
    }
  }

  // ------------------------------------------------------------ instruments

  env(at, peak, attack, hold, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), at + Math.max(attack, hold));
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(attack, hold) + release);
    return g;
  }

  kick(at, vel, p, out) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = p.wave || 'sine';
    osc.frequency.setValueAtTime(p.f0, at);
    osc.frequency.exponentialRampToValueAtTime(p.f1, at + p.decay * 0.5);
    const g = this.env(at, p.gain * vel, 0.003, 0.01, p.decay);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + p.decay + 0.05);
  }

  noiseBurst(at, gain, decay, type, freq, out, q = 0.9) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.env(at, gain, 0.002, 0.004, decay);
    src.connect(f).connect(g).connect(out);
    src.start(at, Math.random() * 0.3);
    src.stop(at + decay + 0.05);
  }

  snare(at, vel, p, out) {
    if (p.clap) {
      for (let i = 0; i < 3; i++) this.noiseBurst(at + i * 0.011, p.gain * vel * 0.8, 0.03, 'bandpass', p.freq, out, 1.4);
      this.noiseBurst(at + 0.03, p.gain * vel, p.decay, 'bandpass', p.freq, out, 1.1);
    } else {
      this.noiseBurst(at, p.gain * vel, p.decay, p.hp ? 'highpass' : 'bandpass', p.freq, out);
    }
    if (p.tone) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(p.tone * (p.rim ? 1 : 1.3), at);
      osc.frequency.exponentialRampToValueAtTime(p.tone, at + 0.05);
      const g = this.env(at, p.gain * vel * (p.rim ? 0.8 : 0.6), 0.002, 0.005, p.rim ? 0.04 : 0.09);
      osc.connect(g).connect(out);
      osc.start(at);
      osc.stop(at + 0.2);
    }
  }

  hat(at, vel, p, open, out) {
    if (p.bell) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 2637;
      const g = this.env(at, p.gain * vel * 0.6, 0.002, 0.004, 0.25);
      osc.connect(g).connect(out);
      osc.start(at);
      osc.stop(at + 0.3);
      return;
    }
    this.noiseBurst(at, p.gain * vel, (open || p.decay), 'highpass', 7000, out, 0.7);
  }

  woodblock(at, vel, out = this.sfx) {
    for (const [freq, gain] of [[1250, 0.32], [1900, 0.12]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.env(at, gain * vel, 0.001, 0.003, 0.06);
      osc.connect(g).connect(out);
      osc.start(at);
      osc.stop(at + 0.1);
    }
  }

  voice(at, notes, dur, vel, p, out) {
    const ctx = this.ctx;
    const len = p.short ? Math.min(dur, p.short) : dur;
    const release = p.release ?? 0.12;
    const peak = p.gain * vel;
    const g = p.pluck ? this.env(at, peak, 0.004, 0.01, Math.min(0.5, len + 0.2)) : this.env(at, peak, p.attack ?? 0.01, len, release);
    let node = g;
    if (p.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 0.8;
      if (p.env) {
        f.frequency.setValueAtTime(p.lp + p.env, at);
        f.frequency.exponentialRampToValueAtTime(p.lp, at + 0.12);
      } else f.frequency.value = p.lp;
      g.connect(f);
      node = f;
    }
    if (p.tremolo) {
      const trem = ctx.createGain();
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 4.5;
      depth.gain.value = 0.25;
      lfo.connect(depth).connect(trem.gain);
      lfo.start(at);
      lfo.stop(at + len + release + 0.05);
      node.connect(trem);
      node = trem;
    }
    node.connect(out);
    const stop = at + len + release + 0.05;
    let vib = null;
    if (p.vibrato && len > 0.25) {
      vib = ctx.createOscillator();
      const depth = ctx.createGain();
      vib.frequency.value = p.vibrato;
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(6, at + Math.min(0.4, len));
      vib.connect(depth);
      vib.start(at);
      vib.stop(stop);
      vib.depth = depth;
    }
    for (const midi of notes) {
      const waves = p.wave2 ? [[p.wave, 0, 1], [p.wave2, 1200, 0.3]] : p.detune ? [[p.wave, -p.detune, 0.7], [p.wave, p.detune, 0.7]] : [[p.wave, 0, 1]];
      for (const [wave, detune, amt] of waves) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = detune;
        if (vib) vib.depth.connect(osc.detune);
        let src = osc;
        if (amt !== 1) {
          const a = ctx.createGain();
          a.gain.value = amt;
          osc.connect(a);
          src = a;
        }
        src.connect(g);
        osc.start(at);
        osc.stop(stop);
      }
    }
  }

  // ------------------------------------------------------------ effects

  /** Calibration metronome: a woodblock at each AudioContext time. */
  clicks(times) {
    if (!this.ctx) return;
    times.forEach((t, i) => this.woodblock(t, i % 4 === 0 ? 1 : 0.7));
  }

  blip(kind) {
    if (!this.running || this.muted) return;
    const at = this.ctx.currentTime + 0.005;
    const notes = { move: [88], pick: [84, 91], unlock: [79, 84, 88, 91, 96], combo: [91, 96], miss: [52], start: [72, 79, 84] }[kind] || [84];
    notes.forEach((m, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = kind === 'miss' ? 'triangle' : 'sine';
      osc.frequency.value = midiToHz(m);
      const g = this.env(at + i * 0.06, kind === 'move' ? 0.06 : kind === 'miss' ? 0.12 : 0.1, 0.004, 0.02, kind === 'unlock' ? 0.4 : 0.15);
      osc.connect(g).connect(this.sfx);
      osc.start(at + i * 0.06);
      osc.stop(at + i * 0.06 + 0.6);
    });
  }
}
