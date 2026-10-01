// All sound is synthesized with Web Audio; there are no audio files.
// A gentle plucked tune per water, soft ambience (lapping water, birds by
// day, crickets at night) and splashy, clicky effects.
const semis = (n) => Math.pow(2, n / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const KEYS = { pond: 0, river: 2, coral: 5, frozen: -3, lagoon: -5 };
// Chord roots per bar (semitones), a slow four-bar loop.
const PROG = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
const MELODY = [0, -1, 2, -1, 4, 3, -1, 2, 5, -1, 4, 2, 3, -1, 1, -1];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.water = 'pond';
    this.night = false;
    this.musicLevel = 0.6;
    this.step = 0;
    this.nextTime = 0;
    this.lastTick = 0;
    this.lastCreak = 0;
    this.ambT = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.75;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.6;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      this.music.connect(lp).connect(this.master);
      this.amb = c.createGain();
      this.amb.gain.value = 0.0;
      this.amb.connect(this.master);
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // Lapping water: looped noise through a lowpass that slowly breathes.
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = c.createGain();
      g.gain.value = 0.12;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.18;
      const lg = c.createGain();
      lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.amb);
      src.start();
      lfo.start();
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 80);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyLevels();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyLevels();
  }

  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyLevels();
  }

  setScene(water, period) {
    this.water = water;
    this.night = period === 'night';
    this.period = period;
  }

  applyLevels() {
    if (!this.music) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.22 * this.musicLevel : 0, t, 0.4);
    this.amb.gain.setTargetAtTime(0.5, t, 0.5);
  }

  // ------------------------------------------------------------ primitives

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = null, at = 0, attack = 0.005, dest = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  noise(dur, { freq = 1200, to = null, vol = 0.3, type = 'lowpass', at = 0, q = 0.8, dest = null, attack = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    if (attack) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
    } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.03);
  }

  splash(size = 1) {
    this.noise(0.35 * size + 0.1, { freq: 2400, to: 300, vol: 0.28 * Math.min(1.4, size) });
    this.tone(520, 0.12, { vol: 0.12, slide: 180 });
  }

  // ------------------------------------------------------------ events

  handle(events) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const e of events) {
      switch (e.type) {
        case 'charge': this.tone(220, 0.25, { type: 'triangle', vol: 0.05, slide: 330 }); break;
        case 'cast':
          this.noise(0.4, { freq: 3000, to: 500, vol: 0.18, type: 'bandpass', q: 1.2, attack: 0.03 });
          if (e.bullseye) [0, 4, 7].forEach((n, i) => this.tone(880 * semis(n), 0.18, { type: 'triangle', vol: 0.07, at: 0.2 + i * 0.06 }));
          break;
        case 'splash': this.splash(e.size || 0.6); break;
        case 'twitch': this.tone(900, 0.05, { vol: 0.05, slide: 600 }); break;
        case 'nibble': this.tone(700, 0.07, { vol: 0.12, slide: 420 }); break;
        case 'bite':
          this.tone(320, 0.22, { vol: 0.25, slide: 110 });
          this.noise(0.18, { freq: 1600, to: 300, vol: 0.18 });
          break;
        case 'hooked':
          this.tone(520, 0.16, { type: 'triangle', vol: 0.16, slide: 1300 });
          if (e.quality === 'perfect') [0, 7, 12].forEach((n, i) => this.tone(1046 * semis(n), 0.14, { type: 'triangle', vol: 0.07, at: 0.08 + i * 0.05 }));
          break;
        case 'early': case 'stolen': this.tone(440, 0.25, { type: 'triangle', vol: 0.1, slide: 260 }); break;
        case 'reelTick':
          if (now - this.lastTick > 0.05) { this.lastTick = now; this.tone(2400, 0.015, { type: 'square', vol: 0.025 }); }
          break;
        case 'jump': this.splash(1.2); break;
        case 'stage':
          this.tone(110, 0.4, { vol: 0.3, slide: 60 });
          this.noise(0.5, { freq: 900, to: 120, vol: 0.2 });
          break;
        case 'special': [0, 3, 7].forEach((n, i) => this.tone(330 * semis(n), 0.2, { type: 'sawtooth', vol: 0.04, at: i * 0.07 })); break;
        case 'snapped':
          this.tone(900, 0.4, { type: 'sawtooth', vol: 0.12, slide: 90 });
          this.noise(0.15, { freq: 5000, type: 'highpass', vol: 0.15 });
          break;
        case 'escaped': [4, 2, 0].forEach((n, i) => this.tone(392 * semis(n), 0.22, { type: 'triangle', vol: 0.1, at: i * 0.12 })); break;
        case 'landed':
          this.splash(0.8);
          [0, 4, 7, 12, 16].forEach((n, i) => this.tone(523 * semis(n), i === 4 ? 0.5 : 0.16, { type: 'triangle', vol: 0.12, at: 0.15 + i * 0.09 }));
          break;
        default: break;
      }
    }
  }

  // A soft creak while the line is close to snapping.
  creak(frac) {
    if (!this.ctx || this.muted || frac < 0.86) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCreak < 0.32) return;
    this.lastCreak = now;
    this.tone(90 + frac * 60, 0.18, { type: 'sawtooth', vol: 0.05 * Math.min(1.5, frac), slide: 70 });
  }

  coin() { if (this.ctx && !this.muted) { this.tone(1318, 0.08, { type: 'square', vol: 0.05 }); this.tone(1760, 0.2, { type: 'square', vol: 0.05, at: 0.07 }); } }
  newSpecies() { if (this.ctx && !this.muted) [0, 4, 7, 11, 14].forEach((n, i) => this.tone(659 * semis(n), 0.3, { vol: 0.1, at: i * 0.08 })); }
  quest() { if (this.ctx && !this.muted) [0, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(523 * semis(n), 0.22, { type: 'triangle', vol: 0.09, at: i * 0.07 })); }
  click() { if (this.ctx && !this.muted) this.tone(1200, 0.04, { type: 'triangle', vol: 0.06 }); }

  // ------------------------------------------------------------ music and ambience

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const stepDur = 60 / (this.night ? 66 : 76) / 2;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.3) {
      this.playStep(this.step, this.nextTime - c.currentTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepDur;
    }
    this.ambience();
  }

  playStep(step, at, dur) {
    if (!this.musicOn || this.musicLevel === 0) return;
    const key = 196 * semis(KEYS[this.water] ?? 0);
    const chord = PROG[Math.floor(step / 16) % 4];
    const s = step % 16;
    const m = this.music;
    if (s === 0) {
      for (const n of chord) this.tone(key * semis(n), dur * 15, { vol: 0.07, at, dest: m, attack: 0.6 });
      this.tone(key / 2 * semis(chord[0]), dur * 6, { type: 'triangle', vol: 0.22, at, dest: m, attack: 0.02 });
    }
    if (s === 8) this.tone(key / 2 * semis(chord[1]), dur * 5, { type: 'triangle', vol: 0.14, at, dest: m, attack: 0.02 });
    const mi = MELODY[(s + Math.floor(step / 16) * 3) % 16];
    if (mi >= 0 && (s % 2 === 0 || this.water === 'coral')) {
      const f = key * 2 * semis(PENTA[mi]);
      const type = this.water === 'lagoon' || this.water === 'frozen' ? 'sine' : 'triangle';
      this.tone(f, dur * 2.4, { type, vol: this.night ? 0.07 : 0.1, at, dest: m, attack: 0.008 });
      if (this.water === 'lagoon' || this.water === 'frozen') this.tone(f * 2, dur * 3, { vol: 0.025, at: at + 0.02, dest: m });
    }
  }

  ambience() {
    this.ambT -= 0.08;
    if (this.ambT > 0 || this.muted) return;
    this.ambT = 0.4 + Math.random() * 1.6;
    if (this.night && this.water !== 'frozen') {
      // crickets
      for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.03, { type: 'square', vol: 0.006, at: i * 0.07, dest: this.amb });
    } else if (!this.night && (this.water === 'pond' || this.water === 'river') && Math.random() < 0.35) {
      const f = 2200 + Math.random() * 1400;
      this.tone(f, 0.09, { vol: 0.015, slide: f * 1.3, dest: this.amb });
      this.tone(f * 1.1, 0.07, { vol: 0.012, slide: f * 0.9, at: 0.12, dest: this.amb });
    } else if (this.water === 'coral' && Math.random() < 0.25) {
      this.tone(1400, 0.2, { vol: 0.01, slide: 1100, dest: this.amb });
    }
  }
}
