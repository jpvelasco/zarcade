// All sound is synthesized with Web Audio. Bolt's sounds are bleeps, servo
// whirrs and chimes; the music is a bouncy little square-wave loop in C major
// that keeps a steady tempo so Run feels like a beat.
const note = (semi, base = 261.63) => base * Math.pow(2, semi / 12);

// Bars of [bass, ...melody eighths]; null rests.
const SONG = [
  [0, [12, null, 16, 19, 16, null, 14, 12]],
  [-3, [9, null, 12, 16, 12, null, 11, 9]],
  [-7, [7, 11, 14, null, 12, 11, 9, null]],
  [-5, [7, null, 11, 14, 19, 17, 16, 14]],
  [0, [12, 16, 19, null, 24, null, 19, 16]],
  [-3, [21, null, 19, 16, 12, null, 16, null]],
  [-8, [8, 12, 15, null, 17, 15, 12, null]],
  [-5, [14, null, 11, 7, 11, 14, 12, null]],
];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.music = music;
    this.ctx = null;
    this.level = 1;
    this.step = 0;
    this.nextTime = 0;
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
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 90);
      this.applyMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  setMusic(on) { this.music = on; this.applyMusic(); }
  setMusicLevel(level) { this.level = level; this.applyMusic(); }

  applyMusic() {
    if (!this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(this.music ? 0.16 * this.level : 0, this.ctx.currentTime, 0.3);
  }

  get t() { return this.ctx.currentTime; }

  tone({ freq = 440, type = 'square', at = 0, dur = 0.12, gain = 0.12, glide = 0, out = null, attack = 0.005 }) {
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
    osc.connect(env).connect(out || this.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noiseHit({ at = 0, dur = 0.12, gain = 0.15, freq = 1500, q = 1, type = 'bandpass' }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(env).connect(this.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const beat = 60 / 112 / 2; // eighth notes at 112 bpm
    while (this.nextTime < this.t + 0.3) {
      const bar = SONG[Math.floor(this.step / 8) % SONG.length];
      const i = this.step % 8;
      const at = this.nextTime - this.t;
      if (i % 4 === 0) this.tone({ freq: note(bar[0], 130.81), type: 'triangle', at, dur: beat * 3.4, gain: 0.32, out: this.musicGain });
      if (i % 2 === 1) this.tone({ freq: note(bar[0] + 7, 130.81), type: 'triangle', at, dur: beat * 0.8, gain: 0.12, out: this.musicGain });
      const m = bar[1][i];
      if (m !== null) this.tone({ freq: note(m), type: 'square', at, dur: beat * 0.85, gain: 0.07, out: this.musicGain });
      if (i % 2 === 0 && this.musicGain && this.music) {
        // Soft hat.
        const t0 = this.nextTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noise;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(i % 4 === 0 ? 0.05 : 0.025, t0);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
        src.connect(f).connect(env).connect(this.musicGain);
        src.start(t0);
        src.stop(t0 + 0.06);
      }
      this.nextTime += beat;
      this.step++;
    }
  }

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    const n = opt.n || 0;
    switch (name) {
      case 'place':
        this.tone({ freq: 660 + n * 20, dur: 0.06, gain: 0.08 });
        this.tone({ freq: 990 + n * 30, at: 0.04, dur: 0.06, gain: 0.06 });
        break;
      case 'remove':
        this.tone({ freq: 520, dur: 0.08, gain: 0.08, glide: 0.5 });
        break;
      case 'click':
        this.tone({ freq: 880, type: 'triangle', dur: 0.05, gain: 0.1 });
        break;
      case 'move':
        this.tone({ freq: 180, type: 'sawtooth', dur: 0.16, gain: 0.04, glide: 1.4 });
        this.noiseHit({ dur: 0.1, gain: 0.03, freq: 900 });
        break;
      case 'turn':
        this.tone({ freq: 300, type: 'square', dur: 0.12, gain: 0.04, glide: opt.dir > 0 ? 1.6 : 0.62 });
        break;
      case 'jump':
        this.tone({ freq: 260, type: 'square', dur: 0.22, gain: 0.07, glide: 2.6 });
        break;
      case 'land':
        this.noiseHit({ dur: 0.08, gain: 0.06, freq: 400, type: 'lowpass' });
        break;
      case 'hop':
        this.tone({ freq: 300, type: 'square', dur: 0.15, gain: 0.05, glide: 1.5 });
        break;
      case 'light':
        [0, 4, 7, 12].forEach((s, i) => this.tone({ freq: note(s + 12 + (n % 5) * 2), type: 'triangle', at: i * 0.05, dur: 0.35, gain: 0.12 }));
        break;
      case 'grab':
        [0, 5, 9, 14].forEach((s, i) => this.tone({ freq: note(s + 7), type: 'square', at: i * 0.035, dur: 0.1, gain: 0.06 }));
        break;
      case 'fizzle':
        this.noiseHit({ dur: 0.18, gain: 0.05, freq: 3000, q: 4 });
        break;
      case 'skip':
        this.tone({ freq: 1200, type: 'sine', dur: 0.04, gain: 0.04 });
        break;
      case 'bonk':
        this.tone({ freq: 140, type: 'square', dur: 0.2, gain: 0.14, glide: 0.5 });
        this.noiseHit({ dur: 0.2, gain: 0.18, freq: 700 });
        this.tone({ freq: 1800, type: 'square', at: 0.06, dur: 0.05, gain: 0.04 });
        this.tone({ freq: 2400, type: 'square', at: 0.1, dur: 0.05, gain: 0.03 });
        break;
      case 'shrug':
        this.tone({ freq: 392, type: 'triangle', dur: 0.2, gain: 0.12 });
        this.tone({ freq: 311, type: 'triangle', at: 0.18, dur: 0.32, gain: 0.12, glide: 0.92 });
        break;
      case 'tired':
        this.tone({ freq: 440, type: 'sine', dur: 0.8, gain: 0.1, glide: 0.4 });
        break;
      case 'rewind':
        this.tone({ freq: 900, type: 'triangle', dur: 0.3, gain: 0.06, glide: 0.4 });
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone({ freq: note(s), type: 'square', at: i * 0.07, dur: 0.18, gain: 0.07 }));
        this.tone({ freq: note(24), type: 'triangle', at: 0.5, dur: 0.6, gain: 0.12 });
        break;
      case 'star':
        this.tone({ freq: note(12 + n * 4), type: 'triangle', dur: 0.3, gain: 0.14 });
        this.tone({ freq: note(19 + n * 4), type: 'sine', at: 0.05, dur: 0.3, gain: 0.08 });
        break;
      case 'unlock':
        [7, 12, 16, 19, 24].forEach((s, i) => this.tone({ freq: note(s + 12), type: 'triangle', at: i * 0.06, dur: 0.3, gain: 0.08 }));
        break;
      case 'zap':
        this.tone({ freq: 1600, type: 'sawtooth', dur: 0.25, gain: 0.05, glide: 0.2 });
        this.noiseHit({ dur: 0.25, gain: 0.08, freq: 4000, q: 2 });
        break;
      default:
        break;
    }
  }
}
