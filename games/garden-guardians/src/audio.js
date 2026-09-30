// All sound is synthesized with Web Audio: plops, zaps, buzzes, jingles and
// a gentle looping garden tune. There are no audio files.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Four bars of a lazy-afternoon tune in F major (MIDI notes, 0 = rest).
const MELODY = [
  77, 0, 76, 74, 72, 0, 69, 0, 70, 72, 74, 0, 72, 0, 0, 0,
  74, 0, 72, 70, 69, 0, 65, 0, 67, 69, 70, 0, 69, 0, 0, 0,
  77, 0, 79, 77, 76, 0, 74, 0, 72, 74, 76, 0, 77, 0, 72, 0,
  74, 0, 72, 70, 69, 0, 67, 0, 65, 0, 67, 69, 65, 0, 0, 0,
];
const BASS = [53, 53, 58, 58, 50, 50, 48, 48, 53, 53, 58, 58, 50, 48, 53, 53];
const STEP_SEC = 60 / 96 / 2; // eighth notes at 96 bpm

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
      this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
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

  // Duck the music (for example while paused).
  setMusicLevel(level) {
    this.musicLevel = level;
    this.applyMusic();
  }

  applyMusic() {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.22 * this.musicLevel : 0, this.ctx.currentTime, 0.2);
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
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(dur, { freq = 1200, q = 1, gain = 0.3, type = 'bandpass', delay = 0, to = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // Rate-limit each sound so a big wave does not become noise.
  play(name, minGap = 0.05) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < minGap) return;
    this.last[name] = now;
    const r = 1 + (Math.random() - 0.5) * 0.08;
    switch (name) {
      case 'plant':
        this.tone(260 * r, 0.18, { type: 'sine', gain: 0.35, to: 620 });
        this.hiss(0.08, { freq: 900, gain: 0.15 });
        this.tone(880, 0.1, { type: 'triangle', gain: 0.12, delay: 0.1 });
        break;
      case 'upgrade':
        [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), 0.22, { type: 'triangle', gain: 0.2, delay: i * 0.07 }));
        break;
      case 'sell':
        this.tone(660, 0.12, { type: 'triangle', gain: 0.2 });
        this.tone(440, 0.18, { type: 'triangle', gain: 0.2, delay: 0.08 });
        break;
      case 'pea':
        this.tone(760 * r, 0.07, { type: 'square', gain: 0.045, to: 420 });
        break;
      case 'seed':
        this.tone(170 * r, 0.22, { type: 'sine', gain: 0.35, to: 60 });
        this.hiss(0.1, { freq: 500, gain: 0.12 });
        break;
      case 'boom':
        this.tone(110 * r, 0.25, { type: 'sine', gain: 0.25, to: 45 });
        this.hiss(0.2, { freq: 700, gain: 0.14, type: 'lowpass', to: 200 });
        break;
      case 'honey':
        this.hiss(0.18, { freq: 380, gain: 0.25, type: 'lowpass', to: 150 });
        this.tone(200 * r, 0.12, { type: 'sine', gain: 0.15, to: 110 });
        break;
      case 'thorn':
        this.tone(1100 * r, 0.09, { type: 'sawtooth', gain: 0.05, to: 2400 });
        break;
      case 'zap':
        this.tone(1400 * r, 0.14, { type: 'square', gain: 0.06, to: 380 });
        this.tone(2100 * r, 0.1, { type: 'sine', gain: 0.07, to: 900, delay: 0.02 });
        break;
      case 'coin':
        this.tone(1320, 0.12, { type: 'sine', gain: 0.18 });
        this.tone(1760, 0.2, { type: 'sine', gain: 0.16, delay: 0.07 });
        break;
      case 'shoo':
        this.hiss(0.14, { freq: 1800, gain: 0.12, to: 4000 });
        this.tone(520 * r, 0.16, { type: 'sine', gain: 0.1, to: 1300 });
        break;
      case 'bossShoo':
        [67, 72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), 0.3, { type: 'triangle', gain: 0.22, delay: i * 0.06 }));
        this.hiss(0.6, { freq: 900, gain: 0.2, to: 5000 });
        break;
      case 'leak':
        this.tone(440, 0.22, { type: 'triangle', gain: 0.22, to: 330 });
        this.tone(330, 0.32, { type: 'triangle', gain: 0.22, to: 220, delay: 0.16 });
        break;
      case 'wave':
        this.tone(NOTE(67), 0.16, { type: 'triangle', gain: 0.22 });
        this.tone(NOTE(72), 0.3, { type: 'triangle', gain: 0.22, delay: 0.14 });
        this.hiss(0.08, { freq: 3000, gain: 0.05 });
        break;
      case 'boss': {
        const c = this.ctx, t = c.currentTime;
        const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = 90;
        lfo.frequency.value = 22; lg.gain.value = 25;
        lfo.connect(lg).connect(o.frequency);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        o.connect(f).connect(g).connect(this.sfx);
        o.start(t); lfo.start(t); o.stop(t + 1.3); lfo.stop(t + 1.3);
        break;
      }
      case 'summon':
        this.tone(300 * r, 0.2, { type: 'sawtooth', gain: 0.04, to: 500 });
        break;
      case 'split':
        this.tone(500, 0.06, { type: 'sine', gain: 0.15, to: 800 });
        this.tone(600, 0.06, { type: 'sine', gain: 0.15, to: 900, delay: 0.07 });
        break;
      case 'clear':
        [72, 79].forEach((n, i) => this.tone(NOTE(n), 0.25, { type: 'sine', gain: 0.16, delay: i * 0.1 }));
        break;
      case 'win':
        [60, 64, 67, 72, 67, 72, 76, 79].forEach((n, i) => this.tone(NOTE(n), i === 7 ? 0.8 : 0.22, { type: 'triangle', gain: 0.25, delay: i * 0.11 }));
        [48, 55, 60].forEach((n) => this.tone(NOTE(n), 1.4, { type: 'sine', gain: 0.16, delay: 0.77 }));
        break;
      case 'lose':
        [67, 65, 64, 60].forEach((n, i) => this.tone(NOTE(n), 0.4, { type: 'triangle', gain: 0.22, delay: i * 0.22 }));
        break;
      case 'click':
        this.tone(900, 0.04, { type: 'sine', gain: 0.12 });
        break;
      case 'nope':
        this.tone(180, 0.14, { type: 'square', gain: 0.06, to: 140 });
        break;
      default:
    }
  }

  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'build': this.play('plant'); break;
        case 'upgrade': this.play('upgrade'); break;
        case 'sell': this.play('sell'); break;
        case 'shoot':
          if (e.kind === 'pea') this.play('pea', 0.06);
          else if (e.kind === 'seed') this.play('seed', 0.12);
          else if (e.kind === 'honey') this.play('honey', 0.15);
          else if (e.kind === 'thorn') this.play('thorn', 0.08);
          break;
        case 'zap': this.play('zap', 0.08); break;
        case 'splash': if (e.kind === 'seed') this.play('boom', 0.1); else this.play('honey', 0.15); break;
        case 'coin': this.play('coin', 0.1); break;
        case 'shoo': this.play(e.boss ? 'bossShoo' : 'shoo', e.boss ? 0 : 0.06); break;
        case 'leak': this.play('leak', 0.2); break;
        case 'waveStart': this.play('wave'); break;
        case 'bossSpawn': this.play('boss'); break;
        case 'summon': this.play('summon', 0.3); break;
        case 'split': this.play('split', 0.1); break;
        case 'waveClear': this.play('clear'); break;
        default:
      }
    }
  }

  // ------------------------------------------------------------ music

  startMusic() {
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    while (this.nextTime < c.currentTime + 0.3) {
      const i = this.step % MELODY.length;
      const t = this.nextTime - c.currentTime;
      if (this.musicOn) {
        const m = MELODY[i];
        if (m) {
          this.tone(NOTE(m), STEP_SEC * 1.8, { type: 'triangle', gain: 0.22, delay: t, attack: 0.01, bus: this.musicBus });
          this.tone(NOTE(m + 12), STEP_SEC * 0.9, { type: 'sine', gain: 0.05, delay: t, attack: 0.005, bus: this.musicBus });
        }
        if (i % 4 === 0) {
          const b = BASS[(i / 4) % BASS.length];
          this.tone(NOTE(b - 12), STEP_SEC * 3.5, { type: 'sine', gain: 0.35, delay: t, attack: 0.02, bus: this.musicBus });
        }
        if (i % 8 === 4) {
          const b = BASS[Math.floor(i / 4) % BASS.length];
          (b === 50 ? [0, 3, 7] : [0, 4, 7]).forEach((k) => this.tone(NOTE(b + k), STEP_SEC * 2.5, { type: 'sine', gain: 0.06, delay: t, attack: 0.03, bus: this.musicBus }));
        }
      }
      this.step++;
      this.nextTime += STEP_SEC;
    }
  }
}
