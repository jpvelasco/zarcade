// Every sound is synthesized with Web Audio; there are no audio files.
// Letters chime up a major pentatonic scale, so any word sounds like a tune.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
const hz = (semi, base = 523.25) => base * Math.pow(2, semi / 12);

export class Sfx {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNote = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.fx = this.ctx.createGain();
      this.fx.gain.value = 0.9;
      this.fx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.22;
      this.music.connect(this.master);
      // A soft echo makes chimes feel underwater.
      this.echo = this.ctx.createDelay(1);
      this.echo.delayTime.value = 0.21;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.28;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.3;
      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      this.echo.connect(tone).connect(feedback).connect(this.echo);
      tone.connect(wet).connect(this.master);
      this.fx.connect(this.echo);
      const len = Math.floor(this.ctx.sampleRate * 0.8);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.03);
  }

  tone({ freq, type = 'sine', at = 0, dur = 0.3, gain = 0.2, glide = 0, out = null, attack = 0.008 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * glide), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(out || this.fx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // A bell: a sine plus a quiet overtone.
  bell(freq, at = 0, gain = 0.16, dur = 0.5) {
    this.tone({ freq, at, gain, dur });
    this.tone({ freq: freq * 2.01, at, gain: gain * 0.25, dur: dur * 0.6 });
    this.tone({ freq: freq * 3, type: 'triangle', at, gain: gain * 0.08, dur: dur * 0.3 });
  }

  whoosh(at = 0, dur = 0.35, from = 400, to = 2400, gain = 0.12) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.fx);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------ the sounds

  letter(i) { this.bell(hz(PENTA[Math.min(i, PENTA.length - 1)]), 0, 0.15, 0.45); }
  unletter(i) { this.tone({ freq: hz(PENTA[Math.max(0, i)] - 12), dur: 0.12, gain: 0.08, glide: 0.8 }); }
  click() { this.tone({ freq: 880, type: 'triangle', dur: 0.06, gain: 0.06 }); }

  found(length, full = false) {
    for (let i = 0; i < length; i++) this.bell(hz(PENTA[i + 2]), i * 0.07, 0.13, 0.5);
    this.pop(length * 0.07 + 0.05);
    if (full) for (let i = 0; i < 5; i++) this.bell(hz(PENTA[i + 5]), 0.5 + i * 0.06, 0.1, 0.6);
  }

  pop(at = 0) {
    this.tone({ freq: 380, at, dur: 0.14, gain: 0.18, glide: 2.6 });
    this.tone({ freq: 1400, type: 'triangle', at: at + 0.03, dur: 0.06, gain: 0.05 });
  }

  bonus() {
    for (let i = 0; i < 4; i++) this.bell(hz(PENTA[6 + (i % 2) * 2]), i * 0.06, 0.09, 0.3);
    this.tone({ freq: 2093, type: 'triangle', at: 0.26, dur: 0.25, gain: 0.05 });
  }

  bad() {
    this.tone({ freq: 330, type: 'triangle', dur: 0.18, gain: 0.12, glide: 0.75 });
    this.tone({ freq: 247, type: 'triangle', at: 0.12, dur: 0.22, gain: 0.1, glide: 0.8 });
  }

  repeat() {
    this.tone({ freq: hz(4), dur: 0.12, gain: 0.08 });
    this.tone({ freq: hz(4), at: 0.13, dur: 0.12, gain: 0.08 });
  }

  hint() {
    for (let i = 0; i < 3; i++) this.bell(hz(PENTA[8 - i]), i * 0.08, 0.08, 0.4);
  }

  shuffle() { this.whoosh(0, 0.38, 300, 1800, 0.1); }

  win(stars = 3) {
    const tune = [0, 4, 7, 12, 9, 12, 16];
    tune.forEach((s, i) => this.bell(hz(s, 392), i * 0.12, 0.14, 0.6));
    this.tone({ freq: hz(0, 196), type: 'triangle', dur: 1.2, gain: 0.08, attack: 0.05 });
    for (let k = 0; k < stars; k++) this.bell(hz(PENTA[7 + k * 2]), 1 + k * 0.28, 0.13, 0.7);
  }

  // ----------------------------------------------------------- music loop

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 120);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  scheduleMusic() {
    if (!this.ctx || this.muted) {
      if (this.ctx) this.nextNote = this.ctx.currentTime + 0.1;
      return;
    }
    const beat = 0.42;
    const chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
    const melody = [12, 9, 7, 9, 12, 14, 12, 9, 7, 4, 7, 9, 7, 4, 2, 4];
    while (this.nextNote < this.ctx.currentTime + 0.4) {
      const step = this.musicStep++;
      const at = this.nextNote - this.ctx.currentTime;
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) {
        for (const s of chord) this.tone({ freq: hz(s, 196), at, dur: beat * 7.5, gain: 0.05, attack: 0.4, out: this.music });
      }
      if (step % 2 === 0) {
        const s = melody[(step / 2) % melody.length];
        this.tone({ freq: hz(s, 392), type: 'sine', at, dur: beat * 1.6, gain: 0.07, out: this.music });
      }
      if (step % 4 === 2) this.tone({ freq: hz(chord[0], 98), type: 'triangle', at, dur: beat * 1.5, gain: 0.06, out: this.music });
      this.nextNote += beat;
    }
  }
}
