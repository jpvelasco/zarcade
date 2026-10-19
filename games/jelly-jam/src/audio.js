// Every sound is synthesized with Web Audio; there are no audio files.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (semi, base = 220) => base * Math.pow(2, semi / 12);

export class Sfx {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
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
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 1.2);
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

  // ------------------------------------------------------------ building

  tone({ freq = 440, type = 'sine', at = 0, dur = 0.2, gain = 0.2, glide = 0, out = null, detune = 0 }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t0 + dur);
    if (detune) osc.detune.value = detune;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(out || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noiseHit({ at = 0, dur = 0.2, gain = 0.2, freq = 900, q = 1, type = 'bandpass', sweep = 1 }) {
    if (!this.ctx) return;
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
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // --------------------------------------------------------------- cues

  squelch(up = true) {
    this.noiseHit({ dur: 0.13, gain: 0.12, freq: up ? 700 : 500, q: 3, sweep: up ? 2.4 : 0.5 });
    this.tone({ freq: up ? 240 : 300, type: 'sine', dur: 0.14, gain: 0.16, glide: up ? 1.7 : 0.6 });
  }

  wobble() {
    this.tone({ freq: 210, type: 'triangle', dur: 0.18, gain: 0.16, glide: 0.72 });
    this.tone({ freq: 160, type: 'sine', at: 0.09, dur: 0.16, gain: 0.12, glide: 1.25 });
  }

  pop(step = 0, count = 3) {
    const semi = SCALE[Math.min(SCALE.length - 1, step)] + 12;
    this.tone({ freq: note(semi), type: 'triangle', dur: 0.2, gain: 0.2, glide: 1.6 });
    this.tone({ freq: note(semi + 7), type: 'sine', at: 0.03, dur: 0.16, gain: 0.12 });
    this.noiseHit({ dur: 0.1, gain: 0.08 + Math.min(0.1, count * 0.01), freq: 1400, q: 2, sweep: 0.4 });
  }

  chime(kind = 'stripe') {
    const base = kind === 'rainbow' ? 24 : kind === 'bomb' ? 19 : 16;
    [0, 4, 7, 12].forEach((s, k) => {
      this.tone({ freq: note(base + s), type: 'sine', at: k * 0.05, dur: 0.42, gain: 0.15 });
    });
  }

  blast(kind) {
    if (kind === 'stripeH' || kind === 'stripeV') {
      this.noiseHit({ dur: 0.34, gain: 0.2, freq: 2600, q: 0.8, sweep: 0.12 });
      this.tone({ freq: 700, type: 'sawtooth', dur: 0.22, gain: 0.08, glide: 0.3 });
    } else if (kind === 'bomb' || kind === 'mega') {
      this.noiseHit({ dur: 0.5, gain: 0.3, freq: 420, q: 0.7, type: 'lowpass', sweep: 0.2 });
      this.tone({ freq: 110, type: 'sine', dur: 0.4, gain: 0.26, glide: 0.4 });
    } else if (kind === 'cross' || kind === 'bigCross') {
      this.noiseHit({ dur: 0.45, gain: 0.26, freq: 1800, q: 0.7, sweep: 0.15 });
      this.tone({ freq: 320, type: 'square', dur: 0.3, gain: 0.08, glide: 0.4 });
    } else {
      for (let k = 0; k < 7; k++) {
        this.tone({ freq: note(SCALE[k] + 24), type: 'sine', at: k * 0.045, dur: 0.5, gain: 0.12 });
      }
      this.noiseHit({ dur: 0.7, gain: 0.16, freq: 3000, q: 0.6, sweep: 0.08 });
    }
  }

  hatch() {
    [0, 4, 7, 12, 16].forEach((s, k) => {
      this.tone({ freq: note(s + 12), type: 'triangle', at: k * 0.07, dur: 0.3, gain: 0.18 });
    });
    this.noiseHit({ at: 0.1, dur: 0.3, gain: 0.1, freq: 1200, q: 1.5, sweep: 3 });
  }

  chip() {
    this.noiseHit({ dur: 0.12, gain: 0.14, freq: 2200, q: 4, sweep: 0.5 });
  }

  crack() {
    this.noiseHit({ dur: 0.2, gain: 0.2, freq: 800, q: 1.2, sweep: 0.3 });
    this.tone({ freq: 180, type: 'square', dur: 0.12, gain: 0.07, glide: 0.6 });
  }

  fanfare(stars = 3) {
    const seq = [0, 4, 7, 12, 16, 19, 24];
    seq.slice(0, 4 + stars).forEach((s, k) => {
      this.tone({ freq: note(s + 12), type: 'triangle', at: k * 0.11, dur: 0.5, gain: 0.2 });
      this.tone({ freq: note(s + 24), type: 'sine', at: k * 0.11, dur: 0.4, gain: 0.08 });
    });
  }

  sad() {
    [7, 4, 2, 0].forEach((s, k) => {
      this.tone({ freq: note(s + 12), type: 'triangle', at: k * 0.14, dur: 0.4, gain: 0.16 });
    });
  }

  star(index = 0) {
    this.tone({ freq: note(12 + index * 5), type: 'sine', dur: 0.5, gain: 0.2 });
    this.tone({ freq: note(24 + index * 5), type: 'sine', at: 0.04, dur: 0.4, gain: 0.1 });
  }

  // -------------------------------------------------------------- music

  // A mellow bubbly loop: pentatonic plinks over a slow chord pad.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.t + 0.1;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.musicOn || !this.ctx) return;
    const beat = 60 / 92 / 2;
    while (this.nextTime < this.t + 0.7) {
      const at = this.nextTime - this.t;
      const s = this.step % 32;
      const chord = [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, 2, 7]][Math.floor(this.step / 32) % 4];
      if (s % 16 === 0) {
        for (const c of chord) {
          this.tone({ freq: note(c + 0, 110), type: 'sine', at, dur: beat * 15, gain: 0.05, out: this.musicGain });
          this.tone({ freq: note(c + 12, 110), type: 'triangle', at, dur: beat * 14, gain: 0.025, out: this.musicGain, detune: 6 });
        }
      }
      const pattern = [0, 4, 7, 4, 9, 7, 12, 7, 9, 4, 7, 2, 0, 4, 7, 9];
      if (s % 2 === 0) {
        const semi = pattern[(s / 2) % pattern.length] + chord[0];
        this.tone({ freq: note(semi + 12, 220), type: 'triangle', at, dur: beat * 1.6, gain: 0.07, out: this.musicGain });
      }
      if (s % 8 === 6) {
        this.tone({ freq: note(chord[1] + 24, 220), type: 'sine', at: at + beat * 0.5, dur: beat, gain: 0.05, out: this.musicGain, glide: 1.5 });
      }
      this.nextTime += beat;
      this.step++;
    }
  }

  // Convenience: turns one engine step into sound.
  handleStep(step) {
    if (!this.ctx) return;
    if (step.type === 'clear') {
      this.pop(Math.min(9, step.chain - 1), step.cleared.length);
      for (const blast of step.blasts.slice(0, 3)) this.blast(blast.kind);
      for (const made of step.created) this.chime(made.special === 'rainbow' ? 'rainbow' : made.special === 'bomb' ? 'bomb' : 'stripe');
      if (step.ice.length) this.chip();
      if (step.coral.length) this.crack();
    } else if (step.type === 'fall') {
      if (step.eggs.length) this.hatch();
    } else if (step.type === 'party') {
      this.chime('stripe');
    } else if (step.type === 'shuffle') {
      this.noiseHit({ dur: 0.6, gain: 0.16, freq: 600, q: 1, sweep: 4 });
    }
  }
}
