// All sound is synthesized with Web Audio: Karplus–Strong guitar plucks that
// climb a pentatonic scale as a streak grows, a fingerpicked chord loop, and
// a crackling fire. Music, effects and the fire all run through one master
// gain, so the HUD 🔊 (M) silences everything at once.

const A4 = 440;
const hz = (midi) => A4 * Math.pow(2, (midi - 69) / 12);
// G major pentatonic from G3, climbing with the streak.
const STREAK_NOTES = [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81, 83, 86, 88];
// G – Em – C – D, fingerpicked: bass, then three treble notes.
const CHORDS = [
  [43, 59, 62, 67],
  [40, 59, 64, 67],
  [48, 60, 64, 67],
  [50, 57, 62, 66],
];
const PATTERN = [0, 2, 1, 3, 2, 1, 3, 2];
const STEP = 0.34; // seconds per fingerpicked note

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.plucks = new Map();
    this.musicLevel = 0.5;
    this.fire = 0.4;
    this.step = 0;
    this.nextTime = 0;
    this.nextPop = 0;
    this.seed = 12345;
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      let c;
      try {
        c = this.ctx = new AC();
      } catch {
        return;
      }
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3.5;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.7;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      this.crackle = c.createGain();
      this.crackle.gain.value = 0;
      this.crackle.connect(this.master);
      // Noise for crackles, swishes and the fire's rumble.
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = this.rand() * 2 - 1;
      this.noise = buf;
      const rumble = c.createBufferSource();
      rumble.buffer = buf;
      rumble.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      this.rumbleGain = c.createGain();
      this.rumbleGain.gain.value = 0.12;
      rumble.connect(lp).connect(this.rumbleGain).connect(this.crackle);
      rumble.start();
      this.nextTime = c.currentTime + 0.2;
      this.nextPop = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 90);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.apply();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.apply();
  }

  // 0 silent, ~0.4 menus and pause, 1 in play.
  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.apply();
  }

  // The fire crackles louder as a streak builds.
  setFire(level) {
    this.fire = Math.max(0, Math.min(1, level));
    if (this.crackle) this.crackle.gain.setTargetAtTime(0.25 + this.fire * 0.5, this.ctx.currentTime, 0.4);
  }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.5 * this.musicLevel : 0, t, 0.4);
    this.crackle.gain.setTargetAtTime(this.musicLevel > 0 ? 0.25 + this.fire * 0.5 : 0, t, 0.4);
  }

  // A Karplus–Strong pluck, baked once per pitch and replayed.
  pluckBuffer(midi, bright = 0.5) {
    const key = `${midi}:${bright}`;
    let buf = this.plucks.get(key);
    if (buf) return buf;
    const c = this.ctx;
    const sr = c.sampleRate;
    const dur = 1.8;
    const n = Math.floor(sr * dur);
    buf = c.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / hz(midi)));
    const line = new Float32Array(period);
    // A softened noise burst: nylon strings, not steel.
    let prev = 0;
    for (let i = 0; i < period; i++) {
      const r = this.rand() * 2 - 1;
      prev = prev + (r - prev) * (0.35 + bright * 0.5);
      line[i] = prev;
    }
    const decay = midi > 70 ? 0.994 : 0.997;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const nxt = line[idx + 1 === period ? 0 : idx + 1];
      out[i] = cur;
      line[idx] = decay * 0.5 * (cur + nxt);
      idx = idx + 1 === period ? 0 : idx + 1;
    }
    // Gentle fade at the tail so the buffer never clicks off.
    const tail = Math.floor(sr * 0.2);
    for (let i = 0; i < tail; i++) out[n - 1 - i] *= i / tail;
    this.plucks.set(key, buf);
    return buf;
  }

  pluck(midi, { when = 0, gain = 0.5, bus = this.sfx, bright = 0.5 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.pluckBuffer(midi, bright);
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus);
    src.start(when || c.currentTime);
  }

  noiseBurst({ when = 0, dur = 0.08, gain = 0.2, type = 'bandpass', freq = 2000, q = 1, to = null, bus = this.sfx } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = when || c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, this.rand() * 1.5, dur + 0.05);
  }

  bell(freq, { when = 0, gain = 0.15, dur = 1.2 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = when || c.currentTime;
    for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + dur);
    }
  }

  // ------------------------------------------------------------ game sounds

  handle(events) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const e of events) {
      if (e.type === 'play') {
        const note = STREAK_NOTES[Math.min(STREAK_NOTES.length - 1, e.streak - 1)];
        this.pluck(note, { gain: 0.55, bright: 0.6 });
        if (e.streak >= 5) this.pluck(note + 12, { when: t + 0.05, gain: 0.22, bright: 0.7 });
        this.noiseBurst({ dur: 0.06, gain: 0.12, freq: 1800, q: 0.8 });
        if (e.peak) {
          this.bell(hz(note + 12), { when: t + 0.08, gain: 0.12 });
          this.bell(hz(note + 19), { when: t + 0.2, gain: 0.1 });
        }
        if (e.flipped && e.flipped.length) this.noiseBurst({ when: t + 0.12, dur: 0.04, gain: 0.06, freq: 3200, q: 2 });
        this.setFire(this.fire + 0.08);
      } else if (e.type === 'draw') {
        this.noiseBurst({ dur: 0.16, gain: 0.14, freq: 900, to: 2600, q: 0.7 });
        this.pluck(43, { when: t + 0.03, gain: 0.25, bright: 0.3 });
        this.setFire(0.4);
      } else if (e.type === 'nope') {
        this.pluck(38, { gain: 0.28, bright: 0.1 });
      } else if (e.type === 'undo') {
        this.noiseBurst({ dur: 0.14, gain: 0.12, freq: 2400, to: 700, q: 0.7 });
      } else if (e.type === 'win') {
        this.strum([55, 59, 62, 67, 71, 74], t + 0.05, 0.05, 0.4);
        this.strum([67, 71, 74, 79], t + 0.7, 0.07, 0.3);
        for (let i = 0; i < 4; i++) this.bell(hz(79 + [0, 4, 7, 12][i]), { when: t + 0.9 + i * 0.1, gain: 0.08 });
        this.setFire(1);
      } else if (e.type === 'stuck') {
        this.pluck(59, { gain: 0.3, bright: 0.3 });
        this.pluck(55, { when: t + 0.25, gain: 0.3, bright: 0.3 });
      }
    }
  }

  strum(notes, when, gap, gain) {
    notes.forEach((n, i) => this.pluck(n, { when: when + i * gap, gain, bright: 0.55 }));
  }

  hint() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bell(hz(76), { gain: 0.08, dur: 0.8 });
    this.bell(hz(83), { when: t + 0.12, gain: 0.07, dur: 0.8 });
  }

  click() {
    if (!this.ctx) return;
    this.noiseBurst({ dur: 0.03, gain: 0.08, freq: 3000, q: 3 });
  }

  // ------------------------------------------------------------ scheduler

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const ahead = c.currentTime + 0.3;
    if (this.musicOn && this.musicLevel > 0) {
      while (this.nextTime < ahead) {
        const bar = Math.floor(this.step / PATTERN.length) % CHORDS.length;
        const chord = CHORDS[bar];
        const i = PATTERN[this.step % PATTERN.length];
        const accent = this.step % PATTERN.length === 0;
        this.pluck(chord[i], { when: this.nextTime, gain: accent ? 0.34 : 0.22, bus: this.music, bright: 0.35 });
        this.step++;
        this.nextTime += STEP;
      }
    } else {
      this.nextTime = Math.max(this.nextTime, c.currentTime + 0.1);
    }
    // Fire pops: a few a second, more when it roars.
    if (this.musicLevel > 0) {
      while (this.nextPop < ahead) {
        this.noiseBurst({ when: this.nextPop, dur: 0.008 + this.rand() * 0.02, gain: 0.05 + this.rand() * 0.12, type: 'highpass', freq: 1200 + this.rand() * 2500, bus: this.crackle });
        this.nextPop += (0.06 + this.rand() * 0.35) / (0.7 + this.fire);
      }
    } else {
      this.nextPop = c.currentTime + 0.1;
    }
    this.fire = Math.max(0.3, this.fire - 0.004);
  }
}
