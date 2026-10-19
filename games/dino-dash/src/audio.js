// Every sound is synthesized with Web Audio: no audio files. A bouncy
// marimba loop speeds up a little as you do, and effects follow the
// world's events.
const semis = (n) => Math.pow(2, n / 12);
const BASE = 261.63;

// Four bars, eight steps each: C, Am, F, G with a jumpy melody.
const MELODY = [
  0, null, 4, 7, null, 9, 7, 4,
  9, null, 12, 9, null, 7, 4, null,
  5, null, 9, 12, null, 14, 12, 9,
  7, null, 11, 14, 12, null, 11, 7,
];
const BASS = [0, 9, 5, 7];
const KEYS = [0, 2, -3, -5]; // one key per biome

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.step = 0;
    this.nextTime = 0;
    this.key = 0;
    this.tempo = 124;
    this.musicLevel = 0.5;
    this.coinChain = 0;
    this.lastCoin = 0;
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
      this.timer = setInterval(() => this.schedule(), 50);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusic();
  }

  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyMusic();
  }

  applyMusic() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.22 * this.musicLevel : 0, this.ctx.currentTime, 0.25);
  }

  // Music follows the run: key by biome, tempo by speed.
  follow(world, biomeIndex) {
    this.key = KEYS[biomeIndex % KEYS.length];
    this.tempo = world ? 118 + Math.min(26, (world.speed - 10) * 1.8) : 112;
  }

  // ---- music ---------------------------------------------------------

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.tempo / 2;
      this.step = (this.step + 1) % 32;
    }
  }

  playStep(i, t) {
    if (!this.musicOn || this.musicLevel <= 0) return;
    const bar = Math.floor(i / 8);
    const n = MELODY[i];
    if (n !== null) this.marimba(BASE * semis(n + this.key), t, 0.16, this.music);
    if (i % 4 === 0) this.pluck(BASE / 4 * semis(BASS[bar] + this.key), t, 0.3);
    if (i % 4 === 2) this.pluck(BASE / 4 * semis(BASS[bar] + 7 + this.key), t, 0.18);
    if (i % 8 === 0 || i % 8 === 5) this.kick(t);
    if (i % 2 === 1) this.hat(t, i % 4 === 3 ? 0.05 : 0.03);
  }

  marimba(f, t, vol, dest) {
    const c = this.ctx;
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o2.type = 'sine';
    o.frequency.value = f;
    o2.frequency.value = f * 4;
    const g2 = c.createGain();
    g2.gain.value = 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(dest);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.4);
    o2.stop(t + 0.4);
  }

  pluck(f, t, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = f;
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(lp).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.3);
  }

  kick(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.18);
  }

  hat(t, vol) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g).connect(this.music);
    s.start(t, Math.random() * 0.5, 0.06);
  }

  // ---- effects -------------------------------------------------------

  tone(type, f0, f1, dur, vol = 0.3, t = this.ctx.currentTime) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, freq, vol = 0.2, type = 'bandpass', t = this.ctx.currentTime, sweep = null) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 0.4, dur + 0.05);
  }

  arp(notes, gap = 0.07, vol = 0.22, type = 'marimba') {
    const t = this.ctx.currentTime;
    notes.forEach((n, i) => {
      if (type === 'marimba') this.marimba(BASE * 2 * semis(n), t + i * gap, vol, this.sfx);
      else this.tone(type, BASE * 2 * semis(n), BASE * 2 * semis(n), 0.18, vol, t + i * gap);
    });
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'coin': {
        if (t - this.lastCoin > 0.45) this.coinChain = 0;
        this.lastCoin = t;
        const n = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.min(10, this.coinChain++)];
        this.marimba(BASE * 4 * semis(n), t, 0.16, this.sfx);
        this.tone('sine', BASE * 8 * semis(n), BASE * 8 * semis(n), 0.08, 0.05);
        break;
      }
      case 'jump':
        this.tone('square', 300, 720, 0.16, 0.08);
        this.tone('sine', 420, 900, 0.18, 0.12);
        break;
      case 'roll':
      case 'slam':
        this.noise(0.22, 1500, 0.2, 'bandpass', t, 400);
        break;
      case 'land':
        this.tone('sine', 160, 70, 0.1, 0.18);
        break;
      case 'lane':
        this.noise(0.08, 2800, 0.06, 'bandpass', t, 1800);
        break;
      case 'edge':
        this.tone('triangle', 200, 160, 0.08, 0.08);
        break;
      case 'hit':
        this.tone('square', 220, 70, 0.28, 0.16);
        this.noise(0.18, 600, 0.25, 'lowpass');
        this.tone('sine', 120, 50, 0.4, 0.3);
        break;
      case 'shield':
        this.noise(0.25, 3000, 0.2, 'highpass');
        this.arp([12, 7, 12, 19], 0.05, 0.14);
        break;
      case 'power':
        this.arp([0, 4, 7, 12, 16], 0.05, 0.18);
        break;
      case 'powerEnd':
        this.tone('triangle', 660, 330, 0.25, 0.1);
        break;
      case 'blorp':
        this.tone('sine', 90, 260, 0.18, 0.3);
        this.tone('sine', 240, 110, 0.25, 0.22, t + 0.16);
        break;
      case 'caught':
        this.tone('sine', 140, 300, 0.25, 0.3);
        this.arp([7, 4, 0, -5], 0.13, 0.2);
        break;
      case 'squawk':
        this.tone('sawtooth', 900, 500, 0.12, 0.05);
        break;
      case 'milestone':
        this.arp([0, 7, 12], 0.08, 0.18);
        break;
      case 'best':
        this.arp([0, 4, 7, 12, 7, 12, 16], 0.07, 0.2);
        break;
      case 'mission':
        this.arp([7, 12, 16, 19], 0.08, 0.2);
        break;
      case 'levelUp':
        this.arp([0, 4, 7, 12, 16, 19, 24], 0.07, 0.22);
        break;
      case 'buy':
        this.arp([0, 7, 12, 16], 0.06, 0.2);
        break;
      case 'nope':
        this.tone('triangle', 220, 180, 0.15, 0.12);
        break;
      case 'click':
        this.marimba(BASE * 2 * semis(12), t, 0.1, this.sfx);
        break;
      case 'go':
        this.arp([0, 4, 7, 12], 0.09, 0.2);
        break;
      case 'rumble':
        this.noise(1.2, 120, 0.3, 'lowpass', t, 60);
        break;
      default:
        break;
    }
  }

  handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'coin': this.play('coin'); break;
        case 'jump': this.play('jump'); break;
        case 'roll': case 'slam': this.play('roll'); break;
        case 'land': this.play('land'); break;
        case 'lane': this.play('lane'); break;
        case 'edge': this.play('edge'); break;
        case 'hit':
          this.play(e.shield ? 'shield' : 'hit');
          if (!e.shield) setTimeout(() => this.play('blorp'), 260);
          break;
        case 'power': this.play('power'); break;
        case 'powerEnd': this.play('powerEnd'); break;
        case 'caught': this.play('caught'); break;
        case 'pass': if (e.kind === 'ptero') this.play('squawk'); break;
        case 'milestone': this.play('milestone'); break;
        case 'best': this.play('best'); break;
        default: break;
      }
    }
  }
}
