// Synthesized sound: a tip-toe detective tune (walking bass and vibes) and
// little effects. WebAudio only; nothing is loaded.

const semi = (n, base = 261.63) => base * Math.pow(2, n / 12);

// Eight bars in C major with a sneaky chromatic walk. null = rest.
const BASS = [0, null, 7, null, 9, null, 7, 6, 5, null, 12, null, 9, null, 7, null, 2, null, 9, null, 7, null, 5, 4, 7, null, 2, null, 7, 6, 5, 2];
const VIBES = [
  12, null, 16, null, 19, null, 18, 19, null, null, 16, null, 14, null, null, null,
  14, null, 17, null, 21, null, 19, 17, 16, null, 12, null, 11, null, null, null,
];

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
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.6);
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
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  setMusic(on) { this.music = on; this.applyMusic(); }
  setLevel(level) { this.level = level; this.applyMusic(); }
  applyMusic() {
    if (!this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(this.music ? 0.32 * this.level : 0, this.ctx.currentTime, 0.4);
  }

  // Called every frame: schedules the tune a little ahead.
  tick() {
    if (!this.ctx || !this.music || this.ctx.state !== 'running') return;
    const beat = 60 / 104 / 2;
    const now = this.ctx.currentTime;
    if (this.nextAt < now) this.nextAt = now + 0.05;
    while (this.nextAt < now + 0.25) {
      const i = this.step % 32;
      const b = BASS[i];
      if (b != null) this.note(semi(b - 24), this.nextAt, beat * 1.6, 'triangle', 0.5, this.musicGain);
      const v = VIBES[i];
      if (v != null) {
        this.note(semi(v), this.nextAt, beat * 2.4, 'sine', 0.22, this.musicGain);
        this.note(semi(v + 12), this.nextAt, beat * 0.6, 'sine', 0.05, this.musicGain);
      }
      if (i % 4 === 2) this.noise(this.nextAt, 0.05, 6000, 0.06, this.musicGain);
      this.nextAt += beat;
      this.step++;
    }
  }

  note(freq, at, dur, type = 'sine', vol = 0.3, dest = this.sfx, slide = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest);
    o.start(at); o.stop(at + dur + 0.05);
  }

  noise(at, dur, freq, vol, dest = this.sfx) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(at); src.stop(at + dur + 0.05);
  }

  play(name, arg = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'tap': this.note(880, t, 0.08, 'triangle', 0.18); break;
      case 'search': this.noise(t, 0.22, 1800, 0.25); this.note(520, t, 0.16, 'sine', 0.1, this.sfx, 1.6); break;
      case 'find': [0, 4, 7, 12, 16].forEach((n, i) => this.note(semi(n + 12), t + i * 0.06, 0.4, 'triangle', 0.22)); break;
      case 'joke': this.note(300, t, 0.25, 'sine', 0.25, this.sfx, 2.2); this.note(600, t + 0.12, 0.2, 'sine', 0.12, this.sfx, 0.6); break;
      case 'talk': {
        const base = 300 + (arg % 7) * 60;
        for (let i = 0; i < 5; i++) this.note(base * (1 + ((i * 37 + arg) % 5) * 0.08), t + i * 0.075, 0.07, 'square', 0.05);
        break;
      }
      case 'no': this.note(330, t, 0.09, 'triangle', 0.2); break;
      case 'yes': this.note(660, t, 0.08, 'triangle', 0.2); this.note(990, t + 0.06, 0.14, 'triangle', 0.18); break;
      case 'clear': this.note(440, t, 0.06, 'sine', 0.12); break;
      case 'hint': [7, 12, 19].forEach((n, i) => this.note(semi(n), t + i * 0.08, 0.35, 'sine', 0.18)); break;
      case 'wrong': this.note(220, t, 0.3, 'triangle', 0.25, this.sfx, 0.8); this.note(196, t + 0.22, 0.4, 'triangle', 0.22, this.sfx, 0.8); break;
      case 'drum': for (let i = 0; i < 10; i++) this.noise(t + i * 0.07, 0.06, 300, 0.25); break;
      case 'stamp': this.noise(t, 0.2, 200, 0.6); this.note(110, t, 0.25, 'sine', 0.5, this.sfx, 0.5); break;
      case 'solve': [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((n, i) => this.note(semi(n), t + i * 0.09, 0.5, 'triangle', 0.22)); break;
      case 'star': this.note(semi(12 + arg * 4), t, 0.45, 'triangle', 0.25); this.note(semi(24 + arg * 4), t, 0.3, 'sine', 0.08); break;
      case 'unlock': [0, 7, 12, 16, 19, 24].forEach((n, i) => this.note(semi(n + 7), t + i * 0.07, 0.4, 'sine', 0.2)); break;
      case 'page': this.noise(t, 0.12, 3000, 0.15); break;
      default: break;
    }
  }
}
