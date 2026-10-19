// Every sound is synthesized with Web Audio; there are no audio files.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const hz = (semi, base = 440) => base * Math.pow(2, semi / 12);

// A breezy seaside loop: I - vi - IV - V in C, ukulele-ish plucks.
const CHORDS = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
const MELODY = [7, 9, 12, 9, 7, 4, 7, -1, 4, 7, 9, 7, 5, 4, 2, -1, 0, 4, 7, 12, 9, 7, 4, 2, 5, 4, 2, -1, 2, 4, 7, -1];

export class Sfx {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.lastPop = 0;
    this.lastSplash = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 1.0);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.6;
  }

  get t() { return this.ctx.currentTime; }

  tone({ freq = 440, type = 'sine', at = 0, dur = 0.2, gain = 0.2, glide = 0, out = null, attack = 0.01 }) {
    if (!this.ctx || this.muted || !Number.isFinite(freq) || !Number.isFinite(at)) return;
    const t0 = this.t + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(attack, dur * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(out || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  hiss({ at = 0, dur = 0.2, gain = 0.2, freq = 900, q = 1, type = 'bandpass', sweep = 1 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.t + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweep !== 1) filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + dur);
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.sfxGain);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------- effects

  shoot() {
    this.hiss({ dur: 0.18, gain: 0.12, freq: 700, sweep: 3, q: 2 });
    this.tone({ freq: 300, type: 'sine', dur: 0.14, gain: 0.12, glide: 2.2 });
  }

  bounce() {
    this.tone({ freq: 880, type: 'triangle', dur: 0.06, gain: 0.07 });
  }

  land(kind) {
    if (kind === 'bomb' || kind === 'zap') return;
    this.tone({ freq: 220, type: 'sine', dur: 0.12, gain: 0.16, glide: 0.6 });
    this.hiss({ dur: 0.06, gain: 0.05, freq: 1800, q: 3 });
  }

  // Pops climb a happy scale along a chain.
  pop(k = 0) {
    if (!this.ctx) return;
    const now = this.t;
    if (now - this.lastPop < 0.025) return;
    this.lastPop = now;
    const semi = PENTA[Math.max(0, Math.min(PENTA.length - 1, Math.floor(k) || 0))];
    this.tone({ freq: hz(semi, 520), type: 'sine', dur: 0.1, gain: 0.16, glide: 1.6, attack: 0.003 });
    this.hiss({ dur: 0.05, gain: 0.07, freq: 2600 + semi * 60, q: 4 });
  }

  crack() {
    this.hiss({ dur: 0.12, gain: 0.12, freq: 3200, q: 6, sweep: 0.6 });
    this.tone({ freq: 1600, type: 'triangle', dur: 0.08, gain: 0.05 });
  }

  splash(heavy = false) {
    if (!this.ctx) return;
    const now = this.t;
    if (now - this.lastSplash < 0.06) return;
    this.lastSplash = now;
    this.hiss({ dur: heavy ? 0.5 : 0.25, gain: heavy ? 0.2 : 0.08, freq: heavy ? 500 : 1100, sweep: 0.4, q: 0.8, type: 'lowpass' });
    if (heavy) this.tone({ freq: 90, type: 'sine', dur: 0.4, gain: 0.25, glide: 0.5 });
  }

  bigDrop(n) {
    this.tone({ freq: 900, type: 'sine', dur: 0.5, gain: 0.08, glide: 0.35 });
    if (n >= 10) this.fanfareLite();
  }

  otter() {
    // a happy little squeak-squeak
    this.tone({ freq: 1200, type: 'sine', dur: 0.09, gain: 0.14, glide: 1.5 });
    this.tone({ freq: 1500, type: 'sine', at: 0.1, dur: 0.11, gain: 0.14, glide: 1.4 });
    this.tone({ freq: hz(12, 523), type: 'triangle', at: 0.2, dur: 0.25, gain: 0.08 });
  }

  blast(kind) {
    if (kind === 'bomb') {
      this.hiss({ dur: 0.55, gain: 0.3, freq: 400, sweep: 0.3, type: 'lowpass', q: 0.7 });
      this.tone({ freq: 120, type: 'sine', dur: 0.45, gain: 0.3, glide: 0.4 });
    } else {
      this.hiss({ dur: 0.35, gain: 0.16, freq: 4000, sweep: 0.5, q: 2 });
      for (let k = 0; k < 4; k++) this.tone({ freq: 1400 - k * 200, type: 'square', at: k * 0.03, dur: 0.05, gain: 0.04 });
    }
  }

  swap() {
    this.tone({ freq: 660, type: 'triangle', dur: 0.07, gain: 0.08 });
    this.tone({ freq: 880, type: 'triangle', at: 0.06, dur: 0.07, gain: 0.08 });
  }

  booster() {
    for (let k = 0; k < 4; k++) this.tone({ freq: hz(PENTA[k + 4], 523), type: 'triangle', at: k * 0.05, dur: 0.16, gain: 0.08 });
  }

  creepWarn() {
    this.tone({ freq: hz(7, 440), type: 'sine', dur: 0.4, gain: 0.07 });
    this.tone({ freq: hz(4, 440), type: 'sine', at: 0.15, dur: 0.5, gain: 0.06 });
  }

  creep() {
    this.hiss({ dur: 0.3, gain: 0.1, freq: 300, q: 1.5, type: 'lowpass' });
    this.tone({ freq: 140, type: 'triangle', dur: 0.25, gain: 0.14, glide: 0.8 });
  }

  click() {
    this.tone({ freq: 760, type: 'triangle', dur: 0.05, gain: 0.07 });
  }

  star(k) {
    this.tone({ freq: hz([12, 16, 19][k] || 12, 523), type: 'triangle', dur: 0.4, gain: 0.14 });
    this.tone({ freq: hz(([12, 16, 19][k] || 12) + 12, 523), type: 'sine', dur: 0.3, gain: 0.05 });
  }

  fanfareLite() {
    [0, 4, 7, 12].forEach((s, k) => this.tone({ freq: hz(s, 523), type: 'triangle', at: k * 0.06, dur: 0.2, gain: 0.07 }));
  }

  win() {
    const notes = [0, 4, 7, 12, 7, 12, 16];
    notes.forEach((s, k) => this.tone({ freq: hz(s, 392), type: 'triangle', at: k * 0.1, dur: 0.3, gain: 0.13 }));
    this.tone({ freq: hz(-12, 392), type: 'sine', at: 0, dur: 0.9, gain: 0.12 });
  }

  lose() {
    [7, 4, 2, 0].forEach((s, k) => this.tone({ freq: hz(s, 330), type: 'triangle', at: k * 0.16, dur: 0.35, gain: 0.1 }));
  }

  wave() {
    this.hiss({ dur: 1.1, gain: 0.22, freq: 600, sweep: 2.5, type: 'lowpass', q: 0.6 });
  }

  // --------------------------------------------------------------- music

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.t + 0.1;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.ctx || !this.musicOn) return;
    const beat = 60 / 100 / 2; // eighth notes at 100 bpm
    while (this.nextTime < this.t + 0.4) {
      const at = this.nextTime - this.t;
      const step = this.step;
      const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
      if (!this.muted) {
        if (step % 2 === 0) {
          // strum
          const note = chord[(step / 2) % 3];
          this.pluck(hz(note, 262), at, 0.06);
        }
        if (step % 8 === 0) this.tone({ freq: hz(chord[0] - 12, 262), type: 'sine', at, dur: beat * 6, gain: 0.18, out: this.musicGain, attack: 0.02 });
        if (step % 2 === 1 || step % 4 === 0) {
          const m = MELODY[step % MELODY.length];
          if (step % 4 !== 2) this.pluck(hz(m, 523), at, 0.05, 'sine');
        }
      }
      this.step++;
      this.nextTime += beat;
    }
  }

  pluck(freq, at, gain, type = 'triangle') {
    this.tone({ freq, type, at, dur: 0.35, gain, out: this.musicGain, attack: 0.004 });
  }
}
