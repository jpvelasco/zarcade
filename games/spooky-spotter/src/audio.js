// Every sound is synthesized: a slow celeste lullaby for the manor, plus small
// chimes for finding things. Nothing here is urgent and nothing is scary.

const CHORDS = [
  [0, 7, 12, 16],    // Am
  [-4, 3, 8, 12],    // F
  [-5, 2, 7, 11],    // E
  [-2, 5, 9, 12],    // Dm
];
const MELODY = [
  [12, null, 16, null, 19, null, 16, null],
  [14, null, 12, null, 16, null, 12, null],
  [11, null, 14, null, 19, null, 14, null],
  [9, null, 12, null, 16, null, 12, 14],
];

const semi = (n, base = 220) => base * Math.pow(2, n / 12);

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.music = music;
    this.ctx = null;
    this.step = 0;
    this.nextAt = 0;
    this.level = 1;
  }

  unlock() {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.8);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.applyMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  setMusic(on) { this.music = on; this.applyMusic(); }
  setLevel(level) { this.level = level; this.applyMusic(); }

  applyMusic() {
    if (!this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(this.music ? 0.22 * this.level : 0, this.ctx.currentTime, 0.5);
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ freq = 440, type = 'sine', at = 0, dur = 0.3, gain = 0.2, glide = 0, attack = 0.006, out = null }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(28, freq * glide), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(out || this.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ at = 0, dur = 0.3, gain = 0.1, type = 'lowpass', freq = 1200, q = 1 }) {
    if (!this.ctx || !this.noiseBuf) return;
    const t0 = this.t + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------- the tunes

  // Called every frame; schedules a little ahead so the loop never hiccups.
  tick() {
    if (!this.ctx || !this.music) return;
    const beat = 0.46;
    while (this.nextAt < this.t + 0.4) {
      if (this.nextAt < this.t) this.nextAt = this.t + 0.05;
      const at = this.nextAt - this.t;
      const bar = Math.floor(this.step / 8) % 4;
      const i = this.step % 8;
      const chord = CHORDS[bar];
      if (i === 0) {
        for (const n of chord) this.tone({ freq: semi(n, 110), type: 'sine', at, dur: 2.2, gain: 0.05, out: this.musicGain });
      }
      const note = MELODY[bar][i];
      if (note !== null && note !== undefined) {
        this.tone({ freq: semi(note, 440), type: 'triangle', at, dur: 1.1, gain: 0.07, attack: 0.004, out: this.musicGain });
        this.tone({ freq: semi(note + 12, 440), type: 'sine', at, dur: 0.6, gain: 0.025, out: this.musicGain });
      }
      this.nextAt += beat;
      this.step++;
    }
  }

  // ------------------------------------------------------------------ sfx

  found(index = 0) {
    const scale = [0, 4, 7, 12, 16, 19, 24, 28, 31];
    const n = scale[Math.min(scale.length - 1, index)];
    this.tone({ freq: semi(n, 523), type: 'sine', dur: 0.55, gain: 0.22, attack: 0.004 });
    this.tone({ freq: semi(n + 12, 523), type: 'sine', at: 0.03, dur: 0.35, gain: 0.08 });
  }

  delivered() {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: semi([0, 7, 12][i], 659), type: 'sine', at: i * 0.07, dur: 0.5, gain: 0.14 });
    }
    this.noise({ dur: 0.5, gain: 0.04, type: 'bandpass', freq: 2600, q: 2 });
  }

  fog() {
    this.noise({ dur: 0.42, gain: 0.07, type: 'lowpass', freq: 700 });
    this.tone({ freq: 190, type: 'sine', dur: 0.3, gain: 0.05, glide: 0.75 });
  }

  lantern() {
    this.tone({ freq: 880, type: 'sine', dur: 0.7, gain: 0.1, glide: 1.4 });
    this.tone({ freq: 1320, type: 'sine', at: 0.08, dur: 0.5, gain: 0.05 });
  }

  star(i = 0) {
    this.tone({ freq: semi(i * 5, 784), type: 'triangle', dur: 0.5, gain: 0.16 });
  }

  fanfare() {
    const notes = [0, 4, 7, 12, 16];
    notes.forEach((n, i) => {
      this.tone({ freq: semi(n, 523), type: 'triangle', at: i * 0.1, dur: 0.8, gain: 0.14 });
      this.tone({ freq: semi(n + 7, 523), type: 'sine', at: i * 0.1 + 0.02, dur: 0.6, gain: 0.07 });
    });
    this.noise({ at: 0.4, dur: 0.9, gain: 0.05, type: 'bandpass', freq: 3200, q: 1.5 });
  }

  click() {
    this.tone({ freq: 420, type: 'triangle', dur: 0.08, gain: 0.08 });
  }

  whoosh() {
    this.noise({ dur: 0.45, gain: 0.07, type: 'bandpass', freq: 900, q: 0.8 });
  }

  curio() {
    this.tone({ freq: 1046, type: 'sine', dur: 0.7, gain: 0.14 });
    this.tone({ freq: 1568, type: 'sine', at: 0.09, dur: 0.6, gain: 0.08 });
    this.tone({ freq: 2093, type: 'sine', at: 0.18, dur: 0.5, gain: 0.05 });
  }
}
