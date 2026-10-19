// Every sound is synthesized with Web Audio: crunches, tinkles, squeaks,
// fizzy booms, and a bouncy little loop per world.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const semis = (n) => Math.pow(2, n / 12);
const KEYS = [0, 5, -3]; // one key per world
const CHORDS = [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']];
const TRIAD = { maj: [0, 4, 7], min: [0, 3, 7] };

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.key = 0;
    this.musicLevel = 0.5;
    this.step = 0;
    this.nextTime = 0;
    this.lastHit = 0;
    this.hitsThisFrame = 0;
    this.stretchAt = 0;
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
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 60);
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
    this.music.gain.setTargetAtTime(this.musicOn ? 0.16 * this.musicLevel : 0, this.ctx.currentTime, 0.3);
  }

  setWorld(w) { this.key = KEYS[w % KEYS.length]; }

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
    o.stop(t + dur + 0.02);
  }

  noise(dur, { freq = 1200, to = null, vol = 0.3, type = 'bandpass', at = 0, q = 1, dest = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ effects

  stretch(amount) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.stretchAt < 0.07) return;
    this.stretchAt = now;
    this.tone(180 + amount * 380, 0.06, { type: 'triangle', vol: 0.05 });
  }

  launch() {
    this.tone(220, 0.18, { type: 'triangle', vol: 0.22, slide: 900 });
    this.noise(0.3, { freq: 600, to: 2400, vol: 0.18 });
  }

  hit(mat, strength, combo) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit < 0.035) return;
    this.lastHit = now;
    const v = Math.min(0.32, 0.05 + strength * 0.05);
    const up = semis(Math.min(12, combo));
    switch (mat) {
      case 'glass':
      case 'ice':
        this.tone(1800 * up, 0.18, { vol: v * 0.6 });
        this.tone(2600 * up, 0.12, { vol: v * 0.4, at: 0.02 });
        break;
      case 'choc':
        this.noise(0.12, { freq: 400, vol: v, q: 1.5 });
        this.tone(140, 0.1, { type: 'triangle', vol: v * 0.7 });
        break;
      case 'rock':
        this.tone(900 * up, 0.06, { type: 'square', vol: v * 0.35 });
        this.tone(120, 0.12, { type: 'triangle', vol: v * 0.8 });
        break;
      case 'marsh':
        this.tone(260, 0.2, { vol: v * 0.9, slide: 420 });
        break;
      case 'bear':
        this.tone(700, 0.12, { type: 'triangle', vol: v * 0.6, slide: 950 });
        break;
      case 'ground':
        this.noise(0.1, { freq: 300, vol: v * 0.6 });
        break;
      default:
        this.noise(0.1, { freq: 1300 * up, to: 500, vol: v, q: 1.2 });
    }
  }

  crunch(mat, combo) {
    const up = semis(PENTA[Math.min(PENTA.length - 1, combo)]);
    switch (mat) {
      case 'glass':
      case 'ice':
        for (let i = 0; i < 4; i++) this.tone((1600 + Math.random() * 1600) * up, 0.25, { vol: 0.09, at: i * 0.03 });
        this.noise(0.2, { freq: 5000, vol: 0.12, type: 'highpass' });
        break;
      case 'rock':
        this.noise(0.25, { freq: 900, to: 300, vol: 0.3 });
        this.tone(1200 * up, 0.15, { type: 'square', vol: 0.06 });
        break;
      case 'marsh':
        this.tone(320 * up, 0.25, { vol: 0.18, slide: 160 });
        break;
      case 'fizz':
        break;
      default:
        this.noise(0.22, { freq: 1500 * up, to: 350, vol: 0.32, q: 0.9 });
        this.noise(0.08, { freq: 3000, vol: 0.12, at: 0.05 });
    }
  }

  bearPop(combo) {
    const up = semis(PENTA[Math.min(PENTA.length - 1, combo)]);
    this.tone(600 * up, 0.14, { type: 'triangle', vol: 0.22, slide: 1500 * up });
    this.noise(0.06, { freq: 2500, vol: 0.25, at: 0.12, q: 0.6 });
    this.tone(1200 * up, 0.1, { vol: 0.12, at: 0.13 });
  }

  boom() {
    this.noise(0.7, { freq: 900, to: 80, vol: 0.55, type: 'lowpass', q: 0.7 });
    this.noise(0.5, { freq: 6000, vol: 0.12, type: 'highpass', at: 0.05 });
    this.tone(90, 0.4, { type: 'triangle', vol: 0.3, slide: 40 });
  }

  power(kind) {
    switch (kind) {
      case 'split': this.tone(900, 0.08, { type: 'square', vol: 0.08 }); this.tone(1200, 0.08, { type: 'square', vol: 0.08, at: 0.06 }); break;
      case 'hop': this.tone(300, 0.25, { vol: 0.25, slide: 900 }); break;
      case 'heavy': this.tone(500, 0.35, { type: 'sawtooth', vol: 0.12, slide: 70 }); break;
      case 'boost': this.noise(0.5, { freq: 800, to: 4000, vol: 0.25 }); this.tone(400, 0.4, { type: 'sawtooth', vol: 0.06, slide: 1600 }); break;
      default: break;
    }
  }

  splat() { this.noise(0.15, { freq: 500, vol: 0.3, type: 'lowpass' }); this.tone(200, 0.12, { vol: 0.15, slide: 90 }); }

  combo(n) {
    const k = this.key;
    this.tone(523 * semis(k + PENTA[Math.min(9, n)]), 0.2, { type: 'triangle', vol: 0.12 });
  }

  win(stars) {
    const k = this.key;
    [0, 4, 7, 12].forEach((n, i) => this.tone(523 * semis(k + n), 0.3, { type: 'triangle', vol: 0.16, at: i * 0.1 }));
    for (let i = 0; i < stars; i++) this.tone(1568 * semis(i * 2), 0.35, { vol: 0.12, at: 0.55 + i * 0.32 });
  }

  starDing(i) { this.tone(1318 * semis(i * 3), 0.4, { vol: 0.14 }); this.tone(2637 * semis(i * 3), 0.25, { vol: 0.05 }); }

  lose() {
    [7, 4, 0, -5].forEach((n, i) => this.tone(392 * semis(this.key + n), 0.28, { type: 'triangle', vol: 0.12, at: i * 0.16 }));
  }

  click() { this.tone(880, 0.05, { type: 'triangle', vol: 0.08 }); }

  bonus(i) { this.tone(784 * semis(PENTA[Math.min(9, i * 2)]), 0.18, { type: 'square', vol: 0.06 }); }

  handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'launch': this.launch(); break;
        case 'hit': if (e.strength > 0.2) this.hit(e.mat, e.strength, 0); break;
        case 'break': this.crunch(e.mat, this.comboN || 0); break;
        case 'pop': this.bearPop(this.comboN || 0); break;
        case 'explode': this.boom(); break;
        case 'burst': this.boom(); this.splat(); break;
        case 'stick': this.splat(); break;
        case 'power': this.power(e.power); break;
        case 'combo': this.comboN = e.n; this.combo(e.n); break;
        case 'turn': this.comboN = 0; break;
        case 'won': this.win(e.stars); break;
        case 'lost': this.lose(); break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) { if (c) this.nextTime = c.currentTime + 0.1; return; }
    const beat = 60 / 112 / 2; // eighth notes
    while (this.nextTime < c.currentTime + 0.25) {
      const t = this.nextTime - c.currentTime;
      const bar = Math.floor(this.step / 8) % CHORDS.length;
      const [root, q] = CHORDS[bar];
      const pos = this.step % 8;
      const base = 196 * semis(this.key + root);
      if (pos === 0 || pos === 4) this.tone(base / 2, 0.22, { type: 'triangle', vol: 0.5, at: t, dest: this.music });
      if (pos === 6) this.tone((base / 2) * semis(7), 0.15, { type: 'triangle', vol: 0.35, at: t, dest: this.music });
      const arp = [0, 1, 2, 1, 2, 0, 2, 1][pos];
      const note = TRIAD[q][arp] + (pos > 3 ? 12 : 0);
      if (pos % 2 === 0 || Math.random() < 0.5) this.tone(base * 2 * semis(note), 0.16, { vol: 0.22, at: t, dest: this.music });
      if (pos === 2 || pos === 6) this.noise(0.04, { freq: 7000, vol: 0.15, type: 'highpass', at: t, dest: this.music });
      this.step++;
      this.nextTime += beat;
    }
  }
}
