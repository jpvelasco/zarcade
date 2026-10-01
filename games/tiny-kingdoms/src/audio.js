// Synthesized sound: wooden taps, little marching drums, fanfares and a
// gentle lute-and-flute tune. No audio files.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// A folk tune in G major, eighth notes (0 = rest). Two eight-bar halves.
const MELODY = [
  67, 0, 71, 74, 72, 71, 69, 0, 71, 0, 67, 69, 71, 0, 0, 0,
  72, 0, 76, 74, 72, 71, 69, 0, 67, 69, 71, 69, 67, 0, 0, 0,
  74, 0, 76, 74, 72, 0, 71, 72, 74, 0, 71, 0, 69, 0, 0, 0,
  67, 0, 69, 71, 72, 71, 69, 67, 66, 0, 69, 0, 67, 0, 0, 0,
];
const BASS = [43, 50, 43, 50, 48, 55, 48, 55, 43, 50, 43, 50, 45, 50, 43, 43];
const STEP_SEC = 60 / 100 / 2;

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.last = {};
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.musicLevel = 1;
  }

  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.8;
      this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.2 : 0;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusic();
  }

  setMusicLevel(level) {
    this.musicLevel = level;
    this.applyMusic();
  }

  applyMusic() {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.2 * this.musicLevel : 0, this.ctx.currentTime, 0.25);
  }

  // ------------------------------------------------------------ primitives

  tone(freq, dur, { type = 'sine', gain = 0.3, to = null, delay = 0, attack = 0.005, bus = this.sfx } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(dur, { gain = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0, bus = this.sfx } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // Skip a sound if the same one played very recently.
  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  }

  // ------------------------------------------------------------ effects

  select() {
    if (!this.ok('select', 0.04)) return;
    this.tone(880, 0.08, { type: 'triangle', gain: 0.18, to: 660 });
  }

  send(count = 10) {
    if (!this.ok('send', 0.06)) return;
    const big = count > 25;
    this.hiss(0.08, { gain: 0.22, freq: 300, q: 0.8, type: 'lowpass' });
    this.tone(196, 0.09, { type: 'triangle', gain: 0.28, to: 150 });
    this.tone(294, 0.09, { type: 'triangle', gain: 0.2, delay: 0.09, to: 220 });
    if (big) this.tone(392, 0.12, { type: 'triangle', gain: 0.18, delay: 0.18 });
  }

  capture() {
    if (!this.ok('capture', 0.12)) return;
    [72, 76, 79].forEach((n, i) => this.tone(NOTE(n), 0.22, { type: 'triangle', gain: 0.22, delay: i * 0.07 }));
    this.tone(NOTE(84), 0.35, { type: 'sine', gain: 0.12, delay: 0.21 });
  }

  lost() {
    if (!this.ok('lost', 0.2)) return;
    this.tone(NOTE(62), 0.25, { type: 'triangle', gain: 0.22 });
    this.tone(NOTE(58), 0.4, { type: 'triangle', gain: 0.22, delay: 0.18 });
  }

  rivalCapture() {
    if (!this.ok('rival', 0.25)) return;
    this.tone(330, 0.07, { type: 'square', gain: 0.05, to: 290 });
  }

  hold() {
    if (!this.ok('hold', 0.08)) return;
    this.hiss(0.1, { gain: 0.18, freq: 2600, q: 6 });
    this.tone(520, 0.08, { type: 'square', gain: 0.05, to: 480 });
  }

  arrow() {
    if (!this.ok('arrow', 0.15)) return;
    this.hiss(0.09, { gain: 0.09, freq: 4200, q: 2, type: 'highpass' });
  }

  clash() {
    if (!this.ok('clash', 0.1)) return;
    this.hiss(0.12, { gain: 0.2, freq: 500, q: 1.2 });
    this.tone(140, 0.12, { type: 'sine', gain: 0.25, to: 90 });
  }

  hero() {
    if (!this.ok('hero', 0.3)) return;
    this.tone(NOTE(67), 0.16, { type: 'sawtooth', gain: 0.07 });
    this.tone(NOTE(74), 0.3, { type: 'sawtooth', gain: 0.08, delay: 0.14 });
    this.tone(NOTE(79), 0.4, { type: 'triangle', gain: 0.12, delay: 0.14 });
  }

  click() {
    if (!this.ok('click', 0.03)) return;
    this.tone(660, 0.05, { type: 'triangle', gain: 0.12 });
  }

  win() {
    if (!this.ctx || this.muted) return;
    [67, 71, 74, 79, 0, 76, 79, 83].forEach((n, i) => {
      if (n) this.tone(NOTE(n), 0.3, { type: 'triangle', gain: 0.22, delay: i * 0.12 });
    });
    this.tone(NOTE(55), 1.1, { type: 'sine', gain: 0.2, delay: 0.84 });
  }

  lose() {
    if (!this.ctx || this.muted) return;
    [67, 65, 62, 59].forEach((n, i) => this.tone(NOTE(n), 0.35, { type: 'triangle', gain: 0.2, delay: i * 0.2 }));
  }

  star(i) {
    if (!this.ctx || this.muted) return;
    this.tone(NOTE(79 + i * 4), 0.3, { type: 'triangle', gain: 0.2 });
    this.tone(NOTE(91 + i * 4), 0.2, { type: 'sine', gain: 0.08, delay: 0.05 });
  }

  // World events from the simulation, from player `me`'s point of view.
  handle(events, me = 1) {
    for (const e of events) {
      if (e.type === 'capture') {
        if (e.owner === me) this.capture();
        else if (e.prev === me) this.lost();
        else this.rivalCapture();
      } else if (e.type === 'hold' && (e.attacker === me || e.owner === me)) this.hold();
      else if (e.type === 'arrow') this.arrow();
      else if (e.type === 'clash') this.clash();
      else if (e.type === 'hero') this.hero();
      else if (e.type === 'send' && e.owner === me) this.send(e.count);
    }
  }

  // ------------------------------------------------------------ music

  startMusic() {
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    while (this.nextTime < c.currentTime + 0.4) {
      const i = this.step % MELODY.length;
      const t = this.nextTime - c.currentTime;
      const n = MELODY[i];
      if (n) {
        // Plucked lute: a quick triangle with a soft octave.
        this.tone(NOTE(n), STEP_SEC * 1.8, { type: 'triangle', gain: 0.32, delay: t, bus: this.musicBus });
        if (i % 4 === 0) this.tone(NOTE(n + 12), STEP_SEC * 1.2, { type: 'sine', gain: 0.07, delay: t, bus: this.musicBus });
      }
      if (i % 2 === 0) {
        const b = BASS[(i / 2) % BASS.length | 0];
        this.tone(NOTE(b), STEP_SEC * 1.6, { type: 'sine', gain: 0.32, delay: t, bus: this.musicBus });
      }
      if (i % 4 === 2) this.hiss(0.05, { gain: 0.05, freq: 6000, q: 1, type: 'highpass', delay: t, bus: this.musicBus });
      this.nextTime += STEP_SEC;
      this.step++;
    }
  }
}
