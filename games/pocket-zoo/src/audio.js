// Every sound is synthesized with Web Audio; there are no audio files.
const note = (semi, base = 261.63) => base * Math.pow(2, semi / 12);
const PENTA = [0, 2, 4, 7, 9];

// A gentle marimba loop: four chords, eight steps each.
const CHORDS = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
const MELODY = [
  [12, null, 16, null, 14, 12, null, 9],
  [12, null, 9, null, 7, null, 9, null],
  [5, null, 9, 12, null, 14, 12, null],
  [7, null, 11, null, 14, null, 12, null],
];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.music = music;
    this.ctx = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.level = 1;
    this.lastCoin = 0;
  }

  unlock() {
    // Browsers only allow audio after a click or key press.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.music = on;
    this.applyMusic();
  }

  setMusicLevel(level) {
    this.level = level;
    this.applyMusic();
  }

  applyMusic() {
    if (!this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(this.music ? 0.28 * this.level : 0, this.ctx.currentTime, 0.3);
  }

  get t() { return this.ctx.currentTime; }

  tone({ freq = 440, type = 'sine', at = 0, dur = 0.2, gain = 0.2, glide = 0, out = null, attack = 0.01 }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(out || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // A soft mallet: sine plus a quick high partial.
  mallet(freq, at = 0, gain = 0.16, out = null, dur = 0.5) {
    this.tone({ freq, type: 'sine', at, dur, gain, out, attack: 0.004 });
    this.tone({ freq: freq * 4, type: 'sine', at, dur: 0.08, gain: gain * 0.25, out, attack: 0.002 });
  }

  noiseHit({ at = 0, dur = 0.15, gain = 0.15, freq = 1200, q = 1.2 }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(env).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ---------------------------------------------------------------- effects

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'coin': {
        // coins can come thick and fast; keep them light
        if (this.t - this.lastCoin < 0.07) return;
        this.lastCoin = this.t;
        const f = 1318 + Math.random() * 200;
        this.tone({ freq: f, type: 'triangle', dur: 0.09, gain: 0.05 });
        this.tone({ freq: f * 1.5, type: 'triangle', at: 0.05, dur: 0.12, gain: 0.04 });
        break;
      }
      case 'click':
        this.tone({ freq: 880, type: 'sine', dur: 0.05, gain: 0.06 });
        break;
      case 'pet': {
        const base = opt.pitch || 1;
        this.tone({ freq: 620 * base, type: 'sine', dur: 0.14, gain: 0.12, glide: 1.5 });
        this.tone({ freq: 900 * base, type: 'sine', at: 0.09, dur: 0.12, gain: 0.08, glide: 1.3 });
        break;
      }
      case 'snack':
        for (let k = 0; k < 3; k++) this.noiseHit({ at: k * 0.11, dur: 0.06, gain: 0.12, freq: 2200 });
        this.mallet(note(7, 523), 0.35, 0.1);
        break;
      case 'wobble':
        this.tone({ freq: 300, type: 'sine', dur: 0.12, gain: 0.08, glide: 1.4 });
        break;
      case 'crack':
        this.noiseHit({ dur: 0.09, gain: 0.25, freq: 2600, q: 2 });
        this.tone({ freq: 500 + (opt.n || 0) * 120, type: 'triangle', dur: 0.08, gain: 0.08 });
        break;
      case 'hatch': {
        const r = opt.rarity || 0;
        this.noiseHit({ dur: 0.25, gain: 0.25, freq: 1400, q: 0.8 });
        const seq = r >= 2 ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
        seq.forEach((s, k) => this.mallet(note(s, 523), 0.05 + k * 0.08, 0.14));
        if (r >= 2) [12, 16, 19].forEach((s) => this.tone({ freq: note(s, 523), type: 'triangle', at: 0.7, dur: 0.9, gain: 0.06 }));
        break;
      }
      case 'build':
        this.noiseHit({ dur: 0.1, gain: 0.2, freq: 300, q: 0.7 });
        this.noiseHit({ at: 0.14, dur: 0.1, gain: 0.2, freq: 300, q: 0.7 });
        [0, 7, 12].forEach((s, k) => this.mallet(note(s, 392), 0.28 + k * 0.08, 0.13));
        break;
      case 'upgrade':
        [0, 4, 7, 11, 14].forEach((s, k) => this.mallet(note(s, 440), k * 0.06, 0.12));
        break;
      case 'unlock':
        [0, 4, 7, 12, 7, 12, 16].forEach((s, k) => this.mallet(note(s, 392), k * 0.11, 0.15));
        [0, 4, 7].forEach((s) => this.tone({ freq: note(s, 196), type: 'triangle', at: 0.66, dur: 1.2, gain: 0.07 }));
        break;
      case 'claim':
        [7, 12, 16, 19].forEach((s, k) => this.tone({ freq: note(s, 523), type: 'triangle', at: k * 0.06, dur: 0.25, gain: 0.07 }));
        break;
      case 'rank':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => this.mallet(note(s, 392), k * 0.07, 0.14));
        break;
      case 'deco':
        [12, 7, 16].forEach((s, k) => this.mallet(note(s, 523), k * 0.07, 0.12));
        break;
      case 'nope':
        this.tone({ freq: 330, type: 'sine', dur: 0.12, gain: 0.08, glide: 0.8 });
        this.tone({ freq: 262, type: 'sine', at: 0.1, dur: 0.16, gain: 0.08, glide: 0.8 });
        break;
      case 'golden':
        [12, 16, 19, 24, 28].forEach((s, k) => this.tone({ freq: note(s, 523), type: 'triangle', at: k * 0.05, dur: 0.3, gain: 0.07 }));
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- music

  startMusic() {
    this.nextTime = this.t + 0.2;
    this.applyMusic();
    this.timer = setInterval(() => this.schedule(), 100);
  }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const stepDur = 0.3;
    while (this.nextTime < this.t + 0.4) {
      const bar = Math.floor(this.step / 8) % CHORDS.length;
      const s = this.step % 8;
      const at = this.nextTime - this.t;
      if (this.music && !this.muted) {
        const chord = CHORDS[bar];
        if (s === 0) chord.forEach((c) => this.mallet(note(c, 130.81), at, 0.07, this.musicGain, 1.2));
        if (s === 4) this.mallet(note(chord[0] + 12, 130.81), at, 0.05, this.musicGain, 0.6);
        const m = MELODY[bar][s];
        if (m !== null) this.mallet(note(m, 261.63), at, 0.09, this.musicGain, 0.5);
        if (s % 2 === 1 && Math.random() < 0.3) this.mallet(note(PENTA[Math.floor(Math.random() * 5)] + 24, 261.63), at, 0.025, this.musicGain, 0.3);
      }
      this.nextTime += stepDur;
      this.step++;
    }
  }
}
