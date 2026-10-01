// All sound is synthesized with Web Audio: boings, bonks, whooshes, a crowd
// made of filtered noise, and a bouncy marimba-and-bass loop.
const semis = (n) => Math.pow(2, n / 12);
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
// Bass roots and a melody pattern (scale steps, -1 rests) for the loop.
const ROOTS = [0, 0, 5, 5, 7, 7, 5, 4];
const MELODY = [0, -1, 2, 4, -1, 4, 2, -1, 3, -1, 4, 5, -1, 4, 2, -1];
const KEYS = [0, 2, -3, 5, -1, 3, -5, 1, -2, 4];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.key = 0;
    this.tempo = 128;
    this.musicLevel = 0.5;
    this.stepN = 0;
    this.nextTime = 0;
    this.last = {};
    this.crowdLevel = 0.12;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.75;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.6;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.startCrowd();
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 50);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.02);
  }

  setMusic(on) { this.musicOn = on; this.applyMusic(); }

  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyMusic();
  }

  applyMusic() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.2 * this.musicLevel : 0, this.ctx.currentTime, 0.25);
  }

  setSong(index) { this.key = KEYS[index % KEYS.length]; }

  // A steady crowd murmur that swells on big moments.
  startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;
    this.crowd = c.createGain();
    this.crowd.gain.value = 0;
    src.connect(bp).connect(this.crowd).connect(this.master);
    src.start();
  }

  setCrowd(level) {
    this.crowdLevel = level;
    if (this.crowd) this.crowd.gain.setTargetAtTime(level * 0.1, this.ctx.currentTime, 0.4);
  }

  cheer(amount = 1, ooh = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    // A swell of voices: several detuned bandpassed noise bursts.
    for (let k = 0; k < 3; k++) {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      const f = ooh ? 420 + k * 90 : 900 + k * 500;
      bp.frequency.setValueAtTime(f, t);
      if (ooh) bp.frequency.linearRampToValueAtTime(f * 0.7, t + 1);
      bp.Q.value = ooh ? 6 : 1.2;
      const g = c.createGain();
      const peak = (ooh ? 0.16 : 0.11) * amount;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.15 + k * 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (ooh ? 1.1 : 1.4 + amount * 0.6));
      src.connect(bp).connect(g).connect(this.sfx);
      src.start(t, Math.random());
      src.stop(t + 2.5);
    }
  }

  // ------------------------------------------------------------- primitives

  tone({ type = 'sine', f0, f1 = f0, dur = 0.2, vol = 0.3, at = 0, attack = 0.005, dest }) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, f0 = 1200, f1 = f0, type = 'lowpass', q = 1, at = 0, dest }) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // Rate-limit a sound so pile-ups don't turn into noise.
  gate(name, gap) {
    const now = this.ctx.currentTime;
    if ((this.last[name] || 0) + gap > now) return false;
    this.last[name] = now;
    return true;
  }

  // ------------------------------------------------------------- events

  handle(events, world) {
    if (!this.ctx || this.muted) return;
    for (const e of events) {
      switch (e.type) {
        case 'bonk': {
          if (!this.gate('bonk', 0.05)) break;
          const p = Math.min(1, e.power / 1400);
          this.tone({ type: 'sine', f0: 320 + p * 160, f1: 90, dur: 0.22 + p * 0.1, vol: 0.35 + p * 0.25 });
          this.tone({ type: 'triangle', f0: 640 + Math.random() * 120, f1: 220, dur: 0.12, vol: 0.18 });
          this.noise({ dur: 0.08 + p * 0.08, vol: 0.25 + p * 0.3, f0: 1800, f1: 300 });
          if (p > 0.6) this.cheer(0.5);
          break;
        }
        case 'bumper':
          if (!this.gate('bumper', 0.08)) break;
          this.tone({ type: 'sine', f0: 520, f1: 1300, dur: 0.18, vol: 0.3 });
          this.tone({ type: 'square', f0: 260, f1: 650, dur: 0.1, vol: 0.06 });
          break;
        case 'dash':
          this.noise({ dur: 0.22, vol: 0.18 + e.power * 0.15, f0: 600, f1: 3500, type: 'bandpass', q: 2 });
          this.tone({ type: 'triangle', f0: 300, f1: 600 + e.power * 400, dur: 0.12, vol: 0.12 });
          break;
        case 'charge':
          if (!this.gate('charge' + e.i, 0.2)) break;
          this.tone({ type: 'triangle', f0: 220, f1: 440, dur: 0.5, vol: 0.06, attack: 0.1 });
          break;
        case 'hop':
          this.tone({ type: 'sine', f0: 300, f1: 760, dur: 0.22, vol: 0.2 });
          break;
        case 'pound':
          this.tone({ type: 'sine', f0: 150, f1: 40, dur: 0.4, vol: 0.55 });
          this.noise({ dur: 0.3, vol: 0.35, f0: 900, f1: 120 });
          if (e.hits) this.cheer(0.6);
          break;
        case 'fall':
          this.tone({ type: 'sine', f0: 880, f1: 180, dur: 0.9, vol: 0.16, attack: 0.02 });
          this.cheer(0.7, true);
          break;
        case 'out':
          this.noise({ dur: 0.5, vol: 0.18, f0: 800, f1: 200 });
          this.cheer(0.9);
          break;
        case 'respawn':
          this.tone({ type: 'sine', f0: 400, f1: 800, dur: 0.25, vol: 0.12 });
          this.tone({ type: 'sine', f0: 600, f1: 1200, dur: 0.25, vol: 0.08, at: 0.08 });
          break;
        case 'powerup':
          [0, 4, 7, 12].forEach((s, k) => this.tone({ type: 'square', f0: 523 * semis(s), dur: 0.12, vol: 0.06, at: k * 0.06 }));
          break;
        case 'powerSpawn':
          this.tone({ type: 'sine', f0: 900, f1: 1400, dur: 0.18, vol: 0.08 });
          break;
        case 'shieldPop':
          this.noise({ dur: 0.12, vol: 0.3, f0: 4000, f1: 1500, type: 'highpass' });
          this.tone({ type: 'sine', f0: 1400, f1: 500, dur: 0.12, vol: 0.15 });
          break;
        case 'coin':
          if (!this.gate('coin', 0.04)) break;
          this.tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.07 });
          this.tone({ type: 'square', f0: e.value > 1 ? 1568 : 1319, dur: 0.18, vol: 0.07, at: 0.06 });
          break;
        case 'spill':
          this.tone({ type: 'triangle', f0: 900, f1: 300, dur: 0.4, vol: 0.12 });
          break;
        case 'bombWarn':
          this.tone({ type: 'square', f0: 880, dur: 0.08, vol: 0.05 });
          this.tone({ type: 'square', f0: 880, dur: 0.08, vol: 0.05, at: 0.22 });
          this.noise({ dur: 1.4, vol: 0.06, f0: 3000, f1: 300, type: 'bandpass', q: 3, at: 0.2 });
          break;
        case 'bomb':
          this.tone({ type: 'sine', f0: 110, f1: 30, dur: 0.6, vol: 0.6 });
          this.noise({ dur: 0.7, vol: 0.5, f0: 2500, f1: 100 });
          this.cheer(0.8);
          break;
        case 'countdown':
          this.tone({ type: 'square', f0: 660, dur: 0.14, vol: 0.09 });
          break;
        case 'go':
          [0, 4, 7].forEach((s) => this.tone({ type: 'square', f0: 880 * semis(s), dur: 0.35, vol: 0.06 }));
          this.cheer(1);
          break;
        case 'sudden':
        case 'overtime':
          this.tone({ type: 'sawtooth', f0: 220, f1: 440, dur: 0.5, vol: 0.08 });
          this.tone({ type: 'sawtooth', f0: 220, f1: 440, dur: 0.5, vol: 0.08, at: 0.5 });
          break;
        case 'zoneMove':
          this.tone({ type: 'sine', f0: 660, f1: 990, dur: 0.3, vol: 0.1 });
          break;
        case 'point':
          if (world && e.score % 5 === 0) this.tone({ type: 'triangle', f0: 1046, dur: 0.1, vol: 0.06 });
          break;
        case 'roundOver':
          this.fanfare(false);
          this.cheer(1.4);
          break;
        default:
      }
    }
  }

  fanfare(big) {
    if (!this.ctx || this.muted) return;
    const notes = big ? [0, 4, 7, 12, 7, 12, 16] : [0, 4, 7, 12];
    notes.forEach((s, k) => {
      this.tone({ type: 'square', f0: 523 * semis(s + this.key), dur: 0.22, vol: 0.06, at: k * 0.12 });
      this.tone({ type: 'triangle', f0: 261 * semis(s + this.key), dur: 0.3, vol: 0.1, at: k * 0.12 });
    });
    if (big) this.cheer(2);
  }

  click() {
    if (!this.ctx || this.muted) return;
    this.tone({ type: 'triangle', f0: 700, f1: 900, dur: 0.06, vol: 0.08 });
  }

  join() {
    if (!this.ctx || this.muted) return;
    this.tone({ type: 'sine', f0: 400, f1: 900, dur: 0.2, vol: 0.2 });
    this.tone({ type: 'triangle', f0: 800, f1: 1200, dur: 0.15, vol: 0.08, at: 0.08 });
  }

  // ------------------------------------------------------------- music

  schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) { if (c) this.nextTime = c.currentTime + 0.1; return; }
    const stepDur = 60 / this.tempo / 2;
    while (this.nextTime < c.currentTime + 0.2) {
      this.playStep(this.stepN, this.nextTime);
      this.nextTime += stepDur;
      this.stepN++;
    }
  }

  playStep(n, t) {
    const c = this.ctx;
    const bar = Math.floor(n / 8) % ROOTS.length;
    const root = ROOTS[bar] + this.key;
    const at = t - c.currentTime;
    // Bouncy bass on the beats.
    if (n % 2 === 0) {
      const f = 65.4 * semis(root + (n % 4 === 2 ? 7 : 0));
      this.tone({ type: 'triangle', f0: f * 2, f1: f, dur: 0.18, vol: 0.55, at, dest: this.music });
    }
    // Marimba-ish melody.
    const m = MELODY[n % MELODY.length];
    if (m >= 0) {
      const f = 523 * semis(SCALE[m] + root);
      this.tone({ type: 'sine', f0: f, dur: 0.16, vol: 0.28, at, dest: this.music });
      this.tone({ type: 'sine', f0: f * 4, dur: 0.04, vol: 0.05, at, dest: this.music });
    }
    // Shaker.
    if (n % 2 === 1) this.noise({ dur: 0.04, vol: 0.08, f0: 7000, type: 'highpass', at, dest: this.music });
    if (n % 8 === 4) this.noise({ dur: 0.1, vol: 0.18, f0: 2200, f1: 600, type: 'bandpass', q: 1, at, dest: this.music });
  }
}
