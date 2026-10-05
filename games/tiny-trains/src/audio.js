// Synthesised sound: toots, chuffs, wooden clicks, bells and a little tune.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor({ sound = true, music = true, muted = false } = {}) {
    this.sound = sound;
    this.music = music;
    this.muted = muted;
    this.ctx = null;
    this.noise = null;
    this.musicTimer = 0;
    this.step = 0;
    this.nextAt = 0;
    this.world = 0;
    this.lastChuff = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sound ? 0.9 : 0;
      this.sfx.connect(this.master);
      this.bgm = this.ctx.createGain();
      this.bgm.gain.value = this.music ? 0.16 : 0;
      this.bgm.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.nextAt = this.ctx.currentTime + 0.2;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSound(on) {
    this.sound = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
  }

  // Mute silences everything at the master gain and keeps the sound and
  // music choices for when it is lifted.
  setMuted(on) {
    this.muted = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.music = on;
    if (this.bgm) this.bgm.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.1);
  }

  get ok() { return !!this.ctx && this.sound && !this.muted; }

  tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, out = null, attack = 0.005 } = {}) {
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(dur, { freq = 1200, q = 1, vol = 0.2, at = 0, sweep = 0, type = 'bandpass' } = {}) {
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // Two-note train whistle.
  toot(pitch = 1, twice = true) {
    if (!this.ok) return;
    const play = (at, len) => {
      for (const [f, type, v] of [[740 * pitch, 'square', 0.05], [932 * pitch, 'sawtooth', 0.035], [1110 * pitch, 'triangle', 0.06]]) {
        this.tone(f, len, { type, vol: v, at, attack: 0.03 });
      }
      this.hiss(len, { freq: 2400, q: 2, vol: 0.03, at });
    };
    play(0, 0.22);
    if (twice) play(0.28, 0.32);
  }

  chuff() {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    if (now - this.lastChuff < 0.09) return;
    this.lastChuff = now;
    this.hiss(0.11, { freq: 700, q: 0.8, vol: 0.06, sweep: 0.6 });
  }

  place() {
    if (!this.ok) return;
    this.tone(620, 0.08, { type: 'sine', vol: 0.25, slide: 0.5 });
    this.hiss(0.04, { freq: 3000, q: 2, vol: 0.06 });
  }

  turn() {
    if (!this.ok) return;
    this.tone(880, 0.05, { type: 'triangle', vol: 0.18, slide: 0.7 });
  }

  erase() {
    if (!this.ok) return;
    this.hiss(0.16, { freq: 1800, q: 1, vol: 0.1, sweep: 0.3 });
  }

  nope() {
    if (!this.ok) return;
    this.tone(220, 0.12, { type: 'triangle', vol: 0.15 });
  }

  clack() {
    if (!this.ok) return;
    this.tone(1600, 0.03, { type: 'square', vol: 0.06 });
    this.hiss(0.05, { freq: 4000, q: 3, vol: 0.06 });
  }

  bell() {
    if (!this.ok) return;
    for (const at of [0, 0.18]) {
      this.tone(1568, 0.6, { type: 'sine', vol: 0.12, at });
      this.tone(2349, 0.4, { type: 'sine', vol: 0.05, at });
    }
  }

  splash() {
    if (!this.ok) return;
    this.hiss(0.3, { freq: 900, q: 0.7, vol: 0.14, sweep: 0.3, type: 'lowpass' });
    this.tone(500, 0.15, { type: 'sine', vol: 0.12, slide: 1.8 });
  }

  whoosh() {
    if (!this.ok) return;
    this.hiss(0.5, { freq: 400, q: 0.6, vol: 0.1, sweep: 3, type: 'lowpass' });
  }

  bonk() {
    if (!this.ok) return;
    this.tone(160, 0.35, { type: 'sine', vol: 0.4, slide: 0.4 });
    this.hiss(0.2, { freq: 600, q: 0.5, vol: 0.25 });
    this.tone(420, 0.5, { type: 'triangle', vol: 0.12, at: 0.12, slide: 0.6 });
  }

  uhoh() {
    if (!this.ok) return;
    this.tone(520, 0.18, { type: 'triangle', vol: 0.18 });
    this.tone(390, 0.32, { type: 'triangle', vol: 0.18, at: 0.2 });
  }

  win() {
    if (!this.ok) return;
    [60, 64, 67, 72, 76].forEach((n, k) => this.tone(NOTE(n + 12), 0.4, { type: 'triangle', vol: 0.16, at: k * 0.09 }));
    this.tone(NOTE(84), 0.9, { type: 'sine', vol: 0.1, at: 0.45 });
  }

  star(k) {
    if (!this.ok) return;
    this.tone(NOTE(79 + k * 4), 0.3, { type: 'sine', vol: 0.15 });
    this.tone(NOTE(91 + k * 4), 0.2, { type: 'triangle', vol: 0.05 });
  }

  unlockJingle() {
    if (!this.ok) return;
    [72, 76, 79, 84, 88].forEach((n, k) => this.tone(NOTE(n), 0.25, { type: 'sine', vol: 0.12, at: k * 0.07 }));
  }

  setWorld(i) { this.world = i; }

  // A bouncy little tune, scheduled ahead.
  tick() {
    if (!this.ctx || !this.music) return;
    const ahead = this.ctx.currentTime + 0.25;
    const beat = 60 / 108 / 2;
    const keys = [0, 2, 5, 7, -3, 3];
    const key = 60 + keys[this.world % keys.length];
    const melody = [0, 4, 7, 4, 9, 7, 4, 2, 0, 4, 7, 12, 11, 7, 9, 7, 5, 9, 12, 9, 7, 4, 2, 4, 0, 2, 4, 7, 4, 2, 0, -1];
    const bass = [0, 0, 7, 7, 5, 5, 7, 7];
    while (this.nextAt < ahead) {
      const k = this.step % melody.length;
      const t = this.nextAt - this.ctx.currentTime;
      if (k % 2 === 0 || this.step % 7 !== 3) this.tone(NOTE(key + melody[k] + 12), beat * 1.6, { type: 'triangle', vol: 0.3, at: t, out: this.bgm });
      if (k % 4 === 0) this.tone(NOTE(key + bass[(k / 4) % bass.length] - 12), beat * 3.5, { type: 'sine', vol: 0.45, at: t, out: this.bgm });
      if (k % 2 === 1) this.tone(NOTE(key + 24), 0.04, { type: 'square', vol: 0.03, at: t, out: this.bgm });
      this.step++;
      this.nextAt += beat;
    }
  }
}
