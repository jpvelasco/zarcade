// Every sound is synthesized with Web Audio: key ticks that climb as a word
// fills in, a sword swish and confetti chime for each poof, a soft boing for
// typos, and a gentle lute-and-flute march per region.
const semis = (n) => Math.pow(2, n / 12);
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

// One little tune per region: scale degrees (null = rest), 8 steps per bar.
const TUNES = [
  { key: 0, tempo: 104, melody: [0, 2, 4, 2, 0, null, 4, 5, 7, null, 5, 4, 2, null, 0, null] },
  { key: -3, tempo: 96, melody: [4, null, 2, 0, 2, 4, 4, null, 2, 2, null, 4, 7, null, 7, null] },
  { key: 2, tempo: 112, melody: [0, 0, 4, 4, 5, 5, 4, null, 3, 3, 2, 2, 1, 1, 0, null] },
  { key: 5, tempo: 92, melody: [7, null, 4, 5, 7, null, 9, 7, 5, null, 4, 2, 4, null, null, null] },
  { key: -5, tempo: 84, melody: [0, 2, 4, null, 7, null, 6, 4, 5, null, 4, 2, 0, null, null, null] },
];
const BASS = [0, 0, 4, 4, 3, 3, 4, 4];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.tune = TUNES[0];
    this.step = 0;
    this.nextTime = 0;
    this.musicLevel = 0.5;
    this.lastTick = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.6;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      this.music.connect(lp).connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 60);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusicLevel();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusicLevel();
  }

  setMusicLevel(level) {
    this.musicLevel = level;
    this.applyMusicLevel();
  }

  applyMusicLevel() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.32 * this.musicLevel : 0, this.ctx.currentTime, 0.2);
  }

  setRegion(r) {
    this.tune = TUNES[r] || TUNES[0];
  }

  // ------------------------------------------------------------ voices

  tone(freq, { type = 'triangle', at = 0, dur = 0.15, vol = 0.3, slide = 0, dest = this.sfx, attack = 0.005 } = {}) {
    if (!this.ctx || this.muted && dest === this.sfx) return;
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ at = 0, dur = 0.15, vol = 0.2, freq = 2000, q = 1, type = 'bandpass', sweep = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ effects

  key(progress = 0) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (now - this.lastTick < 0.02) return;
    this.lastTick = now;
    const note = MAJOR[Math.min(MAJOR.length - 1, Math.floor(progress * 7))];
    this.tone(660 * semis(note), { type: 'sine', dur: 0.06, vol: 0.12 });
    this.noise({ dur: 0.025, vol: 0.06, freq: 4200, q: 2 });
  }

  typo() {
    this.tone(220, { type: 'sine', dur: 0.22, vol: 0.18, slide: 0.6 });
    this.tone(330, { type: 'triangle', at: 0.04, dur: 0.16, vol: 0.06, slide: 0.7 });
  }

  poof(combo = 0) {
    this.noise({ dur: 0.18, vol: 0.22, freq: 1400, sweep: 4, q: 0.8 });
    const base = 523 * semis(Math.min(12, Math.floor(combo / 2)));
    [0, 4, 7, 12].forEach((n, i) => this.tone(base * semis(n), { type: 'triangle', at: 0.03 + i * 0.045, dur: 0.18, vol: 0.14 }));
    this.noise({ at: 0.05, dur: 0.12, vol: 0.06, freq: 7000, q: 3 });
  }

  bossHit() {
    this.noise({ dur: 0.25, vol: 0.3, freq: 600, sweep: 6 });
    this.tone(196, { type: 'square', dur: 0.2, vol: 0.12, slide: 1.5 });
    [0, 4, 7].forEach((n, i) => this.tone(392 * semis(n), { at: 0.08 + i * 0.06, dur: 0.25, vol: 0.14 }));
  }

  bonk() {
    this.tone(150, { type: 'sine', dur: 0.3, vol: 0.3, slide: 0.5 });
    this.noise({ dur: 0.1, vol: 0.2, freq: 300, q: 0.7, type: 'lowpass' });
    this.tone(500, { type: 'sine', at: 0.08, dur: 0.25, vol: 0.12, slide: 2 });
  }

  special() {
    this.noise({ dur: 0.7, vol: 0.25, freq: 400, sweep: 12, q: 0.6 });
    [0, 4, 7, 11, 12, 16, 19, 24].forEach((n, i) => this.tone(392 * semis(n), { type: 'triangle', at: i * 0.05, dur: 0.4, vol: 0.12 }));
  }

  ready() {
    [12, 16, 19].forEach((n, i) => this.tone(523 * semis(n - 12), { type: 'sine', at: i * 0.07, dur: 0.2, vol: 0.12 }));
  }

  win(stars = 3) {
    const notes = [0, 4, 7, 12, 7, 12, 16];
    notes.slice(0, 4 + stars).forEach((n, i) => this.tone(392 * semis(n), { type: 'triangle', at: i * 0.11, dur: 0.3, vol: 0.18 }));
    this.tone(196, { type: 'sine', at: 0, dur: 0.9, vol: 0.12 });
  }

  fail() {
    [7, 5, 4, 0].forEach((n, i) => this.tone(330 * semis(n), { type: 'triangle', at: i * 0.16, dur: 0.3, vol: 0.14 }));
  }

  star(i) {
    this.tone(784 * semis(i * 4), { type: 'sine', dur: 0.3, vol: 0.18 });
    this.noise({ dur: 0.08, vol: 0.05, freq: 8000, q: 4 });
  }

  unlockJingle() {
    [0, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(523 * semis(n), { type: 'sine', at: i * 0.06, dur: 0.25, vol: 0.12 }));
  }

  click() {
    this.tone(880, { type: 'sine', dur: 0.05, vol: 0.08 });
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) { if (c) this.nextTime = c.currentTime + 0.1; return; }
    const tune = this.tune;
    const stepDur = 60 / tune.tempo / 2;
    while (this.nextTime < c.currentTime + 0.25) {
      const at = this.nextTime - c.currentTime;
      const i = this.step % tune.melody.length;
      const deg = tune.melody[i];
      const root = 261.6 * semis(tune.key);
      if (deg !== null) {
        const n = MAJOR[deg % MAJOR.length] + (deg >= MAJOR.length ? 12 : 0);
        this.tone(root * semis(n) * 2, { type: 'triangle', at, dur: stepDur * 1.6, vol: 0.14, dest: this.music, attack: 0.01 });
        this.tone(root * semis(n) * 4, { type: 'sine', at, dur: stepDur * 0.8, vol: 0.03, dest: this.music });
      }
      if (i % 2 === 0) {
        const b = BASS[Math.floor(i / 2) % BASS.length];
        this.tone(root * semis(MAJOR[b]) / 2, { type: 'sine', at, dur: stepDur * 1.8, vol: 0.16, dest: this.music, attack: 0.01 });
      }
      if (i % 4 === 2) this.noiseMusic(at);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  noiseMusic(at) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.08);
  }
}
