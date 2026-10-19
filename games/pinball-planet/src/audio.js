// All sound is synthesized with Web Audio; there are no audio files.
// Punchy table sounds (solenoids, pops, clacks, whooshes) and a space-funk
// loop: syncopated filter bass, clav stabs, a drum kit and a spacey pad. In
// multiball the loop gets a faster arpeggio and a second drum layer.
const semis = (n) => Math.pow(2, n / 12);
const E1 = 41.2;
// 32 sixteenth steps (two bars): bass notes in semitones above E1, null = rest.
const BASS = [
  12, null, null, 24, null, 22, 24, null, 19, null, 17, null, 15, null, 17, 19,
  17, null, null, 29, null, 27, 29, null, 24, null, 22, null, 19, null, 20, 21,
];
const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const CLAV = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0];
// Chords (semitones above E3) for bar 1 (Em9) and bar 2 (A13).
const CHORDS = [[0, 3, 7, 10, 14], [5, 9, 12, 15, 19]];
const PLANET_KEYS = [0, 3, 5, 7, 10];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.musicLevel = 0.5;
    this.step = 0;
    this.nextTime = 0;
    this.hype = false;
    this.lastHit = 0;
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
    this.applyMusicLevel();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusicLevel();
  }

  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyMusicLevel();
  }

  applyMusicLevel() {
    if (!this.music) return;
    const v = this.musicOn ? 0.24 * this.musicLevel : 0;
    this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  setHype(on) { this.hype = on; }

  // ------------------------------------------------------------ primitives

  tone(freq, dur, { type = 'square', vol = 0.2, slide = null, at = 0, attack = 0.004, dest = null, filter = null } = {}) {
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
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.Q.value = filter.q || 1;
      f.frequency.setValueAtTime(filter.from, t);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + (filter.time || dur));
      node = o.connect(f);
    }
    node.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  noise(dur, { freq = 1200, to = null, vol = 0.3, type = 'lowpass', at = 0, q = 0.8, dest = null } = {}) {
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
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.03);
  }

  chord(root, notes, dur, at = 0, vol = 0.07, type = 'square') {
    for (const n of notes) this.tone(root * semis(n), dur, { type, vol, at });
  }

  fanfare(at = 0, root = 523) {
    [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => {
      const long = i === 7;
      this.tone(root * semis(n), long ? 0.7 : 0.13, { type: 'square', vol: 0.08, at: at + i * 0.085 });
      this.tone((root / 2) * semis(n), long ? 0.7 : 0.13, { type: 'triangle', vol: 0.1, at: at + i * 0.085 });
    });
  }

  // ------------------------------------------------------------ events

  handle(events) {
    if (!this.ctx || this.muted) return;
    let budget = 8;
    for (const e of events) {
      if (budget <= 0) break;
      switch (e.type) {
        case 'flip':
          budget--;
          this.noise(0.08, { freq: 500, to: 120, vol: 0.32 });
          this.tone(95, 0.09, { type: 'sine', vol: 0.32, slide: 55 });
          break;
        case 'flipUp': this.noise(0.04, { freq: 900, vol: 0.06 }); break;
        case 'flipHit':
          budget--;
          this.tone(140 + Math.min(1, e.speed / 3000) * 160, 0.06, { type: 'triangle', vol: 0.16 + Math.min(0.14, e.speed / 20000) });
          break;
        case 'bumper': {
          budget--;
          const n = [0, 4, 7, 12, 16][Math.floor(Math.random() * 5)];
          this.tone(620 * semis(n), 0.12, { type: 'sine', vol: 0.22, slide: 310 * semis(n) });
          this.noise(0.07, { freq: 2600, type: 'bandpass', vol: 0.3, q: 1.2 });
          this.tone(70, 0.1, { type: 'sine', vol: 0.3, slide: 45 });
          break;
        }
        case 'sling':
          budget--;
          this.noise(0.06, { freq: 3800, type: 'highpass', vol: 0.25 });
          this.tone(320, 0.08, { type: 'triangle', vol: 0.18, slide: 180 });
          break;
        case 'target':
          budget--;
          this.noise(0.18, { freq: 1100, to: 200, vol: 0.4 });
          this.tone(210, 0.15, { type: 'square', vol: 0.08, slide: 90 });
          break;
        case 'rollover': this.tone(880, 0.06, { type: 'square', vol: 0.06, slide: 1320 }); break;
        case 'orbit':
          this.noise(0.4, { freq: 400, to: 3000, type: 'bandpass', vol: 0.18, q: 2 });
          this.tone(330, 0.35, { type: 'triangle', vol: 0.1, slide: 990 });
          break;
        case 'spin': this.tone(1700 + Math.random() * 200, 0.018, { type: 'square', vol: 0.035 }); break;
        case 'rampEnter': this.noise(0.5, { freq: 300, to: 1800, type: 'bandpass', vol: 0.12, q: 3 }); break;
        case 'ramp':
          [0, 4, 7, 12, 16, 19].forEach((n, i) => this.tone(523 * semis(n), 0.1, { type: 'square', vol: 0.06, at: i * 0.05 }));
          break;
        case 'rampFail': this.tone(500, 0.35, { type: 'triangle', vol: 0.08, slide: 160 }); break;
        case 'holeIn':
          this.tone(700, 0.9, { type: 'sine', vol: 0.2, slide: 50 });
          this.tone(707, 0.9, { type: 'sine', vol: 0.12, slide: 48 });
          this.noise(0.8, { freq: 2000, to: 80, vol: 0.12 });
          break;
        case 'holeOut':
          this.tone(60, 0.18, { type: 'sine', vol: 0.4, slide: 40 });
          this.noise(0.15, { freq: 700, vol: 0.25 });
          this.tone(200, 0.3, { type: 'triangle', vol: 0.1, slide: 600 });
          break;
        case 'kickback':
          this.tone(55, 0.25, { type: 'sine', vol: 0.45, slide: 35 });
          this.noise(0.4, { freq: 300, to: 3000, type: 'bandpass', vol: 0.2, q: 1.5 });
          break;
        case 'plungerPull': this.noise(0.12, { freq: 1600, type: 'bandpass', vol: 0.06, q: 6 }); break;
        case 'plunge':
          this.tone(180 + e.pull * 220, 0.25, { type: 'triangle', vol: 0.18, slide: 600 + e.pull * 900 });
          this.noise(0.25, { freq: 600, to: 2500, type: 'bandpass', vol: 0.15, q: 2 });
          break;
        case 'plungeEmpty': this.noise(0.05, { freq: 700, vol: 0.08 }); break;
        case 'drain':
          this.tone(392, 0.25, { type: 'triangle', vol: 0.12, slide: 330 });
          this.tone(262, 0.6, { type: 'triangle', vol: 0.12, at: 0.22, slide: 98 });
          break;
        case 'ballSave': [12, 7, 12, 19].forEach((n, i) => this.tone(523 * semis(n), 0.15, { type: 'triangle', vol: 0.12, at: i * 0.08 })); break;
        case 'nudge':
          this.tone(60, 0.12, { type: 'sine', vol: 0.3, slide: 40 });
          this.noise(0.08, { freq: 300, vol: 0.2 });
          if (e.result === 'danger') this.tone(110, 0.4, { type: 'sawtooth', vol: 0.12, filter: { from: 900, to: 300 } });
          break;
        case 'tilt':
          this.tone(98, 1.2, { type: 'sawtooth', vol: 0.18, filter: { from: 1200, to: 200 } });
          this.tone(104, 1.2, { type: 'sawtooth', vol: 0.14, filter: { from: 1200, to: 200 } });
          break;
        case 'hit': {
          const now = this.ctx.currentTime;
          if (now - this.lastHit < 0.04) break;
          this.lastHit = now;
          const v = Math.min(0.12, e.speed / 18000);
          if (e.material === 'rubber') this.tone(180, 0.06, { type: 'sine', vol: v * 1.5, slide: 120 });
          else if (e.material === 'plastic') this.noise(0.04, { freq: 2400, type: 'bandpass', vol: v * 2, q: 3 });
          else { this.tone(1900 + Math.random() * 600, 0.05, { type: 'triangle', vol: v }); this.noise(0.03, { freq: 5000, type: 'highpass', vol: v }); }
          break;
        }
        case 'ballHit': this.tone(2400, 0.06, { type: 'triangle', vol: 0.08 }); break;
        case 'callout': this.callout(e); break;
        case 'bonus': {
          const n = e.lines.length;
          for (let i = 0; i < n; i++) this.tone(660 + i * 110, 0.08, { type: 'square', vol: 0.07, at: 0.3 + i * 0.42 });
          if (!e.tilted) this.chord(330, [0, 4, 7, 12], 0.5, 0.3 + n * 0.42 + 0.2, 0.06);
          break;
        }
        case 'gameOver': [7, 4, 0, -5, -12].forEach((n, i) => this.tone(392 * semis(n), 0.4, { type: 'triangle', vol: 0.14, at: i * 0.24 })); break;
        case 'gameStart': this.fanfare(0, 392); break;
        default: break;
      }
    }
  }

  callout(e) {
    switch (e.kind) {
      case 'skill': this.fanfare(0, 659); break;
      case 'planet': {
        const k = PLANET_KEYS[e.planet % PLANET_KEYS.length];
        [0, 7, 12, 16, 19, 24].forEach((n, i) => {
          this.tone(392 * semis(k + n), 0.4, { type: 'sine', vol: 0.1, at: i * 0.07 });
          this.tone(392 * semis(k + n) * 1.005, 0.4, { type: 'triangle', vol: 0.05, at: i * 0.07 });
        });
        break;
      }
      case 'planetLit': this.tone(1046, 0.2, { type: 'sine', vol: 0.08, slide: 1568 }); break;
      case 'tour': this.fanfare(0, 523); this.fanfare(0.8, 784); break;
      case 'frenzy':
        for (let i = 0; i < 4; i++) this.tone(600, 0.18, { type: 'sawtooth', vol: 0.07, at: i * 0.2, slide: 1200, filter: { from: 2400 } });
        break;
      case 'frenzyEnd': this.tone(800, 0.4, { type: 'triangle', vol: 0.08, slide: 400 }); break;
      case 'lockLit': this.chord(440, [0, 7, 12], 0.3, 0, 0.05, 'triangle'); break;
      case 'lock':
        this.chord(220, [0, 7, 12, 15], 0.6, 0, 0.06, 'sawtooth');
        this.tone(55, 0.6, { type: 'sine', vol: 0.3 });
        break;
      case 'multiball':
        this.noise(1.2, { freq: 200, to: 4000, type: 'bandpass', vol: 0.15, q: 2 });
        this.fanfare(0.4, 523);
        break;
      case 'jackpot':
        this.noise(0.5, { freq: 3000, to: 500, vol: 0.25 });
        this.chord(523, [0, 4, 7, 12, 16], 0.8, 0, 0.06);
        this.chord(261, [0, 7, 12], 0.8, 0, 0.08, 'triangle');
        break;
      case 'super':
        for (let i = 0; i < 3; i++) this.noise(0.5, { freq: 3000, to: 300, vol: 0.25, at: i * 0.2 });
        this.fanfare(0.2, 784);
        break;
      case 'superLit': this.tone(880, 0.5, { type: 'triangle', vol: 0.1, slide: 1760 }); break;
      case 'extraBall': this.fanfare(0, 587); break;
      case 'kickbackLit': case 'ballSave': this.tone(1318, 0.25, { type: 'sine', vol: 0.08 }); break;
      case 'lanes': [0, 4, 7].forEach((n, i) => this.tone(784 * semis(n), 0.09, { type: 'square', vol: 0.07, at: i * 0.07 })); break;
      case 'combo': {
        const n = Math.min(8, parseInt(e.title, 10) || 2);
        for (let i = 0; i < n; i++) this.tone(523 * semis(i * 2), 0.07, { type: 'square', vol: 0.06, at: i * 0.045 });
        break;
      }
      case 'mystery': [0, 6, 3, 9, 12].forEach((n, i) => this.tone(440 * semis(n), 0.12, { type: 'sine', vol: 0.08, at: i * 0.09 })); break;
      case 'danger': break;
      default: break;
    }
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const bpm = this.hype ? 116 : 104;
    const stepDur = 60 / bpm / 4;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime - c.currentTime, stepDur);
      this.step = (this.step + 1) % 32;
      this.nextTime += stepDur;
    }
  }

  playStep(step, at, dur) {
    if (!this.musicOn || this.musicLevel === 0) return;
    const m = this.music;
    const s16 = step % 16;
    const bar = step < 16 ? 0 : 1;
    // Swing the off-beat sixteenths a little: that's the funk.
    const swing = s16 % 2 ? dur * 0.12 : 0;
    const t = at + swing;
    const b = BASS[step];
    if (b !== null) {
      this.tone(E1 * semis(b), dur * 1.6, {
        type: 'sawtooth', vol: 0.32, at: t, dest: m, attack: 0.005,
        filter: { type: 'lowpass', from: 1600, to: 180, time: dur * 1.4, q: 7 },
      });
    }
    if (KICK[s16]) { this.tone(110, 0.16, { type: 'sine', vol: 0.65, slide: 40, at, dest: m }); }
    if (SNARE[s16]) {
      this.noise(0.14, { freq: 1800, type: 'bandpass', vol: 0.35, at: t, dest: m, q: 0.7 });
      this.tone(190, 0.08, { type: 'triangle', vol: 0.2, at: t, dest: m, slide: 150 });
    }
    // Hats: closed on every sixteenth, accent the off-beats, open on step 14.
    this.noise(s16 === 14 ? 0.18 : 0.03, { freq: 8000, type: 'highpass', vol: s16 % 4 === 2 ? 0.14 : 0.06, at: t, dest: m });
    if (CLAV[s16]) {
      for (const n of CHORDS[bar].slice(1, 4)) {
        this.tone(164.8 * semis(n), dur * 0.7, { type: 'square', vol: 0.045, at: t, dest: m, filter: { type: 'bandpass', from: 1400, q: 2 } });
      }
    }
    if (s16 === 0) {
      // Spacey pad.
      for (const n of CHORDS[bar]) this.tone(164.8 * semis(n), dur * 15, { type: 'sine', vol: 0.03, at, dest: m, attack: 0.4 });
    }
    if (this.hype && s16 % 2 === 0) {
      const ch = CHORDS[bar];
      this.tone(329.6 * semis(ch[(step / 2) % ch.length | 0]), dur * 0.9, { type: 'square', vol: 0.035, at, dest: m });
      if (s16 % 4 === 2) this.noise(0.05, { freq: 300, type: 'lowpass', vol: 0.3, at, dest: m });
    }
  }
}
