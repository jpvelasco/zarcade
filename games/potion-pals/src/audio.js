// Every sound is synthesized with Web Audio; there are no audio files. The
// music is a slow music-box loop in A minor pentatonic, meant to sit under a
// workshop where nothing is urgent.
const note = (semi, base = 220) => base * Math.pow(2, semi / 12);
const PENTA = [0, 3, 5, 7, 10];

const CHORDS = [[0, 7, 12], [-4, 3, 8], [-5, 2, 7], [-2, 5, 10]];
const MELODY = [
  [12, null, 15, null, 19, null, 15, null],
  [10, null, 12, null, 15, null, 12, null],
  [7, null, 12, null, 14, null, 12, 10],
  [12, null, 19, null, 17, null, 15, null],
];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.music = music;
    this.ctx = null;
    this.step = 0;
    this.nextTime = 0;
    this.level = 1;
    this.lastBubble = 0;
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
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.7);
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
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  setMusic(on) { this.music = on; this.applyMusic(); }
  setMusicLevel(level) { this.level = level; this.applyMusic(); }

  applyMusic() {
    if (!this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(this.music ? 0.26 * this.level : 0, this.ctx.currentTime, 0.4);
  }

  get t() { return this.ctx.currentTime; }

  tone({ freq = 440, type = 'sine', at = 0, dur = 0.2, gain = 0.2, glide = 0, out = null, attack = 0.008 }) {
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

  // A music-box strike: sine plus a glassy partial.
  bell(freq, at = 0, gain = 0.14, out = null, dur = 0.8) {
    this.tone({ freq, type: 'sine', at, dur, gain, out, attack: 0.003 });
    this.tone({ freq: freq * 3.01, type: 'sine', at, dur: dur * 0.2, gain: gain * 0.2, out, attack: 0.002 });
  }

  noiseHit({ at = 0, dur = 0.15, gain = 0.15, freq = 1200, q = 1.2, type = 'bandpass' }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
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

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'click':
        this.tone({ freq: 760, type: 'sine', dur: 0.05, gain: 0.05 });
        break;
      case 'pick':
        this.tone({ freq: 520 + (opt.n || 0) * 60, type: 'triangle', dur: 0.08, gain: 0.06, glide: 1.4 });
        break;
      case 'plop': {
        // Something dropping into the cauldron: a thud and a rising glug.
        this.noiseHit({ dur: 0.08, gain: 0.1, freq: 420, q: 0.9 });
        const f = 180 + (opt.n || 0) * 40;
        this.tone({ freq: f, type: 'sine', dur: 0.2, gain: 0.14, glide: 2.4 });
        break;
      }
      case 'bubble': {
        if (this.t - this.lastBubble < 0.1) return;
        this.lastBubble = this.t;
        this.tone({ freq: 240 + Math.random() * 320, type: 'sine', dur: 0.1, gain: 0.03, glide: 2.2 });
        break;
      }
      case 'stir':
        this.noiseHit({ dur: 0.3, gain: 0.07, freq: 700, q: 0.6 });
        break;
      case 'found':
        [0, 7, 12, 16].forEach((s, k) => this.bell(note(s, 440), k * 0.07, 0.13, null, 0.7));
        this.noiseHit({ dur: 0.3, gain: 0.08, freq: 2600, q: 0.7 });
        break;
      case 'known':
        [12, 16].forEach((s, k) => this.bell(note(s, 440), k * 0.08, 0.1, null, 0.5));
        break;
      case 'potion':
        this.noiseHit({ dur: 0.5, gain: 0.16, freq: 1400, q: 0.5 });
        [0, 7, 12, 15, 19, 24].forEach((s, k) => this.bell(note(s, 440), 0.04 + k * 0.08, 0.15, null, 1.1));
        [0, 7, 12].forEach((s) => this.tone({ freq: note(s, 220), type: 'triangle', at: 0.6, dur: 1.4, gain: 0.05 }));
        break;
      case 'pal':
        [12, 19, 24].forEach((s, k) => this.bell(note(s, 440) * (opt.pitch || 1), k * 0.09, 0.14, null, 0.8));
        break;
      case 'fizzle':
        this.noiseHit({ dur: 0.34, gain: 0.16, freq: 600, q: 0.5 });
        this.tone({ freq: 300, type: 'sawtooth', dur: 0.26, gain: 0.05, glide: 0.5 });
        this.tone({ freq: 150, type: 'square', at: 0.18, dur: 0.22, gain: 0.035, glide: 0.6 });
        break;
      case 'poke': {
        const p = opt.pitch || 1;
        this.tone({ freq: 560 * p, type: 'sine', dur: 0.12, gain: 0.1, glide: 1.6 });
        this.tone({ freq: 840 * p, type: 'sine', at: 0.08, dur: 0.12, gain: 0.07, glide: 1.3 });
        break;
      }
      case 'scroll':
        this.noiseHit({ dur: 0.2, gain: 0.08, freq: 3200, q: 0.8 });
        [12, 17].forEach((s, k) => this.bell(note(s, 440), k * 0.06, 0.09, null, 0.5));
        break;
      case 'reveal':
        [7, 12, 14].forEach((s, k) => this.bell(note(s, 330), k * 0.07, 0.1, null, 0.6));
        break;
      case 'room':
        [0, 5, 7, 12, 17, 19, 24].forEach((s, k) => this.bell(note(s, 330), k * 0.1, 0.15, null, 1.2));
        break;
      case 'daily':
        [0, 7, 12, 19].forEach((s, k) => this.bell(note(s, 523), k * 0.08, 0.13, null, 0.9));
        break;
      case 'nope':
        this.tone({ freq: 300, type: 'sine', dur: 0.12, gain: 0.07, glide: 0.8 });
        break;
      default:
        break;
    }
  }

  startMusic() {
    this.nextTime = this.t + 0.2;
    this.applyMusic();
    this.timer = setInterval(() => this.schedule(), 120);
  }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const stepDur = 0.36;
    while (this.nextTime < this.t + 0.5) {
      const bar = Math.floor(this.step / 8) % CHORDS.length;
      const s = this.step % 8;
      const at = this.nextTime - this.t;
      if (this.music && !this.muted) {
        const chord = CHORDS[bar];
        if (s === 0) chord.forEach((c) => this.bell(note(c, 110), at, 0.06, this.musicGain, 2.2));
        if (s === 4) this.bell(note(chord[1], 110), at, 0.045, this.musicGain, 1.4);
        const m = MELODY[bar][s];
        if (m !== null) this.bell(note(m, 220), at, 0.085, this.musicGain, 1.1);
        if (s % 2 === 1 && Math.random() < 0.22) {
          this.bell(note(PENTA[Math.floor(Math.random() * 5)] + 24, 220), at, 0.03, this.musicGain, 0.6);
        }
      }
      this.nextTime += stepDur;
      this.step++;
    }
  }
}
