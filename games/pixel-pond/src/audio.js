// All sound is synthesized with Web Audio: no files. One master gain carries
// everything (ambience, music and effects), so mute silences it all.
//
// The ambience follows the garden: a soft wash of water while water moves,
// crackles near lava and fire, birds by day and crickets at night, with a
// slow music-box melody on top. Everything is quiet by default.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const MASTER = 0.8;

export class Sound {
  constructor({ muted = false } = {}) {
    this.muted = muted;
    this.ctx = null;
    this.level = { water: 0, lava: 0, night: 0, life: 0 };
    this.active = false; // the garden is on screen and running
    this.lastPaint = 0;
    this.noteAt = 0;
    this.birdAt = 0;
    this.cricketAt = 0;
    this.melody = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.5;
      this.sfx.connect(this.master);
      this.ambient = c.createGain();
      this.ambient.gain.value = 0;
      this.ambient.connect(this.master);
      // Music: soft notes through a lowpass and an echo.
      this.music = c.createGain();
      this.music.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const delay = c.createDelay(1);
      delay.delayTime.value = 0.38;
      const fb = c.createGain();
      fb.gain.value = 0.28;
      this.music.connect(lp);
      lp.connect(this.master);
      lp.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(this.master);
      // Noise: white for hiss and crackle, brown for the water wash.
      const len = c.sampleRate * 2;
      const white = c.createBuffer(1, len, c.sampleRate);
      const brown = c.createBuffer(1, len, c.sampleRate);
      const wd = white.getChannelData(0);
      const bd = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const r = Math.random() * 2 - 1;
        wd[i] = r;
        last = (last + 0.02 * r) / 1.02;
        bd[i] = last * 3.5;
      }
      this.white = white;
      // The water bed: brown noise through a gentle bandpass.
      const src = c.createBufferSource();
      src.buffer = brown;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.6;
      this.waterGain = c.createGain();
      this.waterGain.gain.value = 0;
      src.connect(bp).connect(this.waterGain).connect(this.ambient);
      src.start();
      this.timer = setInterval(() => this.schedule(), 90);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyLevels();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.03);
  }

  // `active`: the garden is running on screen (not paused or hidden).
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.applyLevels();
  }

  applyLevels() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambient.gain.setTargetAtTime(this.active ? 0.5 : 0.12, t, 0.6);
    this.music.gain.setTargetAtTime(this.active ? 0.1 : 0.05, t, 0.8);
  }

  // Called each frame with 0..1 levels from the garden.
  update(level) {
    const k = 0.08;
    for (const key of Object.keys(this.level)) this.level[key] += ((level[key] || 0) - this.level[key]) * k;
    if (this.waterGain) this.waterGain.gain.setTargetAtTime(0.03 + this.level.water * 0.35, this.ctx.currentTime, 0.25);
  }

  schedule() {
    const c = this.ctx;
    if (!c || this.muted || c.state !== 'running') return;
    const now = c.currentTime;
    const L = this.level;
    // Lava and fire crackle.
    if (L.lava > 0.02 && Math.random() < L.lava * 0.9) {
      this.noise(0.02 + Math.random() * 0.03, { freq: 1800 + Math.random() * 2500, type: 'highpass', vol: 0.05 + L.lava * 0.08, dest: this.ambient, at: Math.random() * 0.08 });
    }
    // Birds by day, crickets by night, when something is growing.
    if (now > this.birdAt) {
      this.birdAt = now + 3 + Math.random() * 7;
      if (L.night < 0.4 && L.life > 0.05) this.bird();
    }
    if (now > this.cricketAt) {
      this.cricketAt = now + 0.9 + Math.random() * 1.6;
      if (L.night > 0.6) this.cricket();
    }
    // A slow music-box melody.
    if (now > this.noteAt) {
      this.melody++;
      const step = [0, 2, 4, 3, 1, 4, 5, 2][this.melody % 8] + (this.melody % 32 < 16 ? 0 : 1);
      const base = L.night > 0.5 ? 57 : 62;
      const freq = 440 * 2 ** ((base + PENTA[step % PENTA.length] - 69) / 12);
      this.tone(freq, 1.6, { type: 'sine', vol: 0.16, attack: 0.01, dest: this.music });
      this.tone(freq * 2, 0.7, { type: 'triangle', vol: 0.03, attack: 0.005, dest: this.music });
      if (this.melody % 4 === 0) this.tone(freq / 2, 2.4, { type: 'sine', vol: 0.08, attack: 0.2, dest: this.music });
      this.noteAt = now + (this.melody % 8 === 7 ? 1.6 : 0.8) + Math.random() * 0.25;
    }
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
    o.stop(t + dur + 0.05);
  }

  noise(dur, { freq = 1200, to = null, vol = 0.2, type = 'lowpass', at = 0, q = 0.8, dest = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.white;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  bird() {
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1400;
    for (let k = 0; k < n; k++) {
      const f = base * (1 + (Math.random() - 0.5) * 0.25);
      this.tone(f, 0.09, { type: 'sine', vol: 0.05, slide: f * (Math.random() < 0.5 ? 1.35 : 0.75), at: k * 0.13, dest: this.ambient });
    }
  }

  cricket() {
    for (let k = 0; k < 3; k++) this.tone(4300, 0.035, { type: 'sine', vol: 0.025, at: k * 0.06, dest: this.ambient });
  }

  // ------------------------------------------------------------ effects

  // A soft sound while painting, a little different for each element.
  paint(el) {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    if (now - this.lastPaint < 0.09) return;
    this.lastPaint = now;
    switch (el) {
      case 'sand': case 'soil': this.noise(0.12, { freq: el === 'sand' ? 2600 : 900, type: 'bandpass', q: 1.2, vol: 0.12 }); break;
      case 'water': case 'ice': this.tone(500 + Math.random() * 300, 0.1, { type: 'sine', vol: 0.09, slide: 900 + Math.random() * 300 }); break;
      case 'seed': case 'acorn': this.tone(1200 + Math.random() * 400, 0.06, { type: 'triangle', vol: 0.06 }); break;
      case 'stone': this.tone(140, 0.12, { type: 'triangle', vol: 0.12, slide: 90 }); break;
      case 'lava': this.noise(0.18, { freq: 400, type: 'lowpass', vol: 0.12 }); this.tone(90, 0.16, { type: 'sine', vol: 0.08, slide: 60 }); break;
      case 'moss': case 'firefly': this.tone(1600 + Math.random() * 600, 0.15, { type: 'sine', vol: 0.05, slide: 2400 }); break;
      case 'fish': this.tone(700, 0.12, { type: 'sine', vol: 0.09, slide: 1200 }); break;
      case 'eraser': this.noise(0.12, { freq: 1400, to: 500, type: 'bandpass', q: 0.8, vol: 0.09 }); break;
      default: break;
    }
  }

  sprout() { this.tone(660 + Math.random() * 80, 0.12, { type: 'triangle', vol: 0.07, slide: 990 }); }
  bloom() {
    const f = [784, 880, 988, 1047][Math.floor(Math.random() * 4)];
    this.tone(f, 0.35, { type: 'sine', vol: 0.08 });
    this.tone(f * 1.5, 0.3, { type: 'sine', vol: 0.05, at: 0.07 });
  }
  hiss() { this.noise(0.35, { freq: 5000, to: 2500, type: 'highpass', vol: 0.06 }); }
  splash() { this.noise(0.12, { freq: 1500, to: 600, type: 'bandpass', vol: 0.05 }); }
  drip() { this.tone(1100 + Math.random() * 600, 0.07, { type: 'sine', vol: 0.025, slide: 1800 }); }
  tap() { this.tone(880, 0.05, { type: 'triangle', vol: 0.05 }); }
  undo() { this.tone(660, 0.12, { type: 'sine', vol: 0.07, slide: 440 }); }
  clear() { this.noise(0.5, { freq: 3000, to: 300, type: 'bandpass', vol: 0.1 }); }
  save() { [784, 1047, 1319].forEach((f, k) => this.tone(f, 0.25, { type: 'sine', vol: 0.07, at: k * 0.07 })); }
  nope() { this.tone(240, 0.14, { type: 'triangle', vol: 0.07, slide: 200 }); }

  discover() {
    [1047, 1319, 1568, 2093].forEach((f, k) => this.tone(f, 0.3, { type: 'sine', vol: 0.06, at: k * 0.06 }));
  }

  fanfare() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, k) => {
      this.tone(f, 0.4, { type: 'triangle', vol: 0.09, at: k * 0.11 });
      this.tone(f / 2, 0.5, { type: 'sine', vol: 0.05, at: k * 0.11 });
    });
  }
}
