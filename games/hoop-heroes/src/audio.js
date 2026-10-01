// Synthesized sound: swishes, rim clangs, board thuds, dribbles, boings,
// the buzzer, a cheering crowd and a funky arcade groove. No audio files.

const semi = (n) => Math.pow(2, n / 12);
// A 16-step groove: bass notes (semitones, null = rest) and drum hits.
const BASS = [0, null, 0, 3, null, 5, null, 3, 0, null, 0, 7, null, 5, 3, null];
const KICK = [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const STAB = [null, null, 7, null, null, null, 10, null, null, null, 7, null, 12, null, null, null];
const PROGRESSION = [0, 0, 5, 7];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.step = 0;
    this.musicLevel = 0.5;
    this.last = {};
    this.fire = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 90);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }
  setMusic(on) { this.musicOn = on; this.applyMusic(); }
  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyMusic();
  }
  applyMusic() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.2 * this.musicLevel : 0, this.ctx.currentTime, 0.3);
  }

  // Rate-limit a sound name to at most one per `gap` seconds.
  gate(name, gap) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < gap) return false;
    this.last[name] = now;
    return true;
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, dest = this.sfx, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hiss(dur, { vol = 0.2, freq = 1200, q = 1, at = 0, sweep = 1, type = 'bandpass', dest = this.sfx, attack = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = c.createGain();
    if (attack > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); }
    else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------- effects

  swish() {
    this.hiss(0.28, { vol: 0.35, freq: 4200, q: 0.9, sweep: 0.6, attack: 0.02 });
    this.hiss(0.18, { vol: 0.2, freq: 2400, q: 2, at: 0.04, sweep: 0.5 });
  }
  clang(speed) {
    if (!this.gate('rim', 0.06)) return;
    const v = Math.min(0.28, 0.06 + speed * 0.05);
    for (const [f, k] of [[540, 1], [1210, 0.6], [1930, 0.4], [2870, 0.25]]) this.tone(f * (0.98 + Math.random() * 0.04), 0.45, { type: 'sine', vol: v * k, attack: 0.002 });
    this.hiss(0.05, { vol: v * 0.5, freq: 3000, q: 0.7 });
  }
  thud(speed) {
    if (!this.gate('board', 0.05)) return;
    const v = Math.min(0.35, 0.1 + speed * 0.04);
    this.tone(150, 0.16, { type: 'triangle', vol: v, slide: 0.6 });
    this.hiss(0.08, { vol: v * 0.6, freq: 600, q: 0.8, type: 'lowpass' });
  }
  dribble(speed) {
    if (!this.gate('floor', 0.04)) return;
    const v = Math.min(0.3, 0.05 + speed * 0.04);
    this.tone(110, 0.14, { type: 'sine', vol: v, slide: 0.5 });
    this.hiss(0.03, { vol: v * 0.5, freq: 1800, q: 1 });
  }
  boing() {
    this.tone(180, 0.35, { type: 'sine', vol: 0.25, slide: 3.2 });
    this.tone(260, 0.3, { type: 'triangle', vol: 0.1, at: 0.05, slide: 2 });
  }
  squeak() { this.tone(520, 0.12, { type: 'square', vol: 0.06, slide: 0.6 }); this.tone(380, 0.14, { type: 'triangle', vol: 0.12, at: 0.06, slide: 1.3 }); }
  throwSound() { this.hiss(0.16, { vol: 0.08, freq: 900, q: 0.6, sweep: 2.2, attack: 0.03 }); }
  chime(points, fire) {
    const base = fire ? 659 : 523;
    const notes = points >= 6 ? [0, 4, 7, 12, 16] : points >= 3 ? [0, 4, 7, 12] : [0, 7];
    notes.forEach((n, i) => this.tone(base * semi(n), 0.2, { type: 'triangle', vol: 0.12, at: 0.05 + i * 0.055 }));
  }
  cheer(big = false) {
    if (!this.gate('cheer', 0.5)) return;
    this.hiss(big ? 1.6 : 0.9, { vol: big ? 0.16 : 0.09, freq: 1100, q: 0.5, attack: 0.15 });
    this.hiss(big ? 1.4 : 0.7, { vol: big ? 0.08 : 0.05, freq: 2400, q: 0.8, attack: 0.2 });
  }
  aww() { [0, -2, -4].forEach((n, i) => this.tone(330 * semi(n), 0.3, { type: 'triangle', vol: 0.08, at: i * 0.16 })); }
  fireUp() {
    this.hiss(0.8, { vol: 0.25, freq: 300, q: 0.7, sweep: 6, attack: 0.1 });
    [0, 4, 7, 12, 16, 19].forEach((n, i) => this.tone(392 * semi(n), 0.16, { type: 'sawtooth', vol: 0.05, at: i * 0.05 }));
  }
  fireOut() { this.hiss(0.5, { vol: 0.15, freq: 1500, q: 0.6, sweep: 0.3, type: 'lowpass' }); }
  buzzer() { this.tone(170, 0.9, { type: 'sawtooth', vol: 0.18, attack: 0.01 }); this.tone(172, 0.9, { type: 'square', vol: 0.08, attack: 0.01 }); }
  beep(high) { this.tone(high ? 988 : 660, high ? 0.35 : 0.14, { type: 'square', vol: 0.08 }); }
  fanfare() {
    [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(523 * semi(n), 0.22, { type: 'triangle', vol: 0.16, at: i * 0.09 }));
    this.tone(523 * semi(24), 0.6, { type: 'sine', vol: 0.08, at: 0.65 });
    this.cheer(true);
  }
  ui() { this.tone(760, 0.06, { type: 'triangle', vol: 0.1 }); }
  coin() { this.tone(988, 0.08, { type: 'square', vol: 0.06 }); this.tone(1319, 0.2, { type: 'square', vol: 0.06, at: 0.07 }); }

  // Round events (player only).
  handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'shoot': this.throwSound(); break;
        case 'score':
          if (e.swish) this.swish();
          this.chime(e.points, e.fire);
          this.cheer(e.points >= 4 || e.buzzer);
          break;
        case 'rim': this.clang(e.speed); break;
        case 'board': this.thud(e.speed); break;
        case 'floor': this.dribble(e.speed); break;
        case 'tramp': this.boing(); break;
        case 'blocker': this.squeak(); break;
        case 'fire': this.fireUp(); break;
        case 'fireout': this.fireOut(); break;
        case 'buzzer': this.buzzer(); break;
        case 'go': this.beep(true); break;
        case 'invalid': this.aww(); break;
        default: break;
      }
    }
  }

  // ---------------------------------------------------------- music

  schedule() {
    if (!this.ctx || !this.musicOn || this.musicLevel <= 0) { if (this.ctx) this.nextTime = this.ctx.currentTime + 0.1; return; }
    const c = this.ctx, sixteenth = 60 / 104 / 4;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.4) {
      const at = this.nextTime - c.currentTime;
      const i = this.step % 16;
      const bar = (this.step / 16 | 0) % PROGRESSION.length;
      const root = 98 * semi(PROGRESSION[bar]);
      const d = this.music;
      if (BASS[i] !== null) this.tone(root * semi(BASS[i]), 0.16, { type: 'triangle', vol: 0.5, at, dest: d, attack: 0.004 });
      if (KICK[i]) this.tone(120, 0.14, { type: 'sine', vol: 0.55, at, slide: 0.35, dest: d, attack: 0.002 });
      if (SNARE[i]) this.hiss(0.12, { vol: 0.3, freq: 1800, q: 0.6, at, dest: d });
      if (i % 2 === 0) this.hiss(0.03, { vol: i % 4 === 2 ? 0.16 : 0.08, freq: 8000, q: 1, at, dest: d, type: 'highpass' });
      if (STAB[i] !== null) {
        const f = root * 4 * semi(STAB[i]);
        this.tone(f, 0.12, { type: 'square', vol: 0.06, at, dest: d });
        this.tone(f * semi(4), 0.12, { type: 'square', vol: 0.04, at, dest: d });
      }
      this.step++;
      this.nextTime += sixteenth;
    }
  }
}
