// Cozy synthesized sound: soft plucks and bells, a gentle tune per season,
// rain and cricket ambience. No audio files.
const semis = (n) => Math.pow(2, n / 12);

// Each season: key (MIDI root), tempo, scale, chord roots and voices.
const SONGS = {
  spring: { root: 60, bpm: 92, scale: [0, 2, 4, 7, 9], chords: [0, 5, 9, 7], lead: 'triangle', bass: 'sine', bell: false },
  summer: { root: 62, bpm: 104, scale: [0, 2, 4, 7, 9], chords: [0, 7, 9, 5], lead: 'square', bass: 'triangle', bell: false },
  autumn: { root: 57, bpm: 84, scale: [0, 2, 3, 7, 9], chords: [0, 10, 5, 7], lead: 'triangle', bass: 'sine', bell: false, minor: true },
  winter: { root: 64, bpm: 72, scale: [0, 2, 4, 7, 11], chords: [0, 9, 5, 7], lead: 'sine', bass: 'sine', bell: true },
  festival: { root: 65, bpm: 118, scale: [0, 2, 4, 7, 9], chords: [0, 5, 7, 0], lead: 'square', bass: 'triangle', bell: true },
};

// Melodies: 16 steps per bar, scale degrees (null = rest), seeded per song.
function melodyFor(name) {
  let s = 0;
  for (const ch of name) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bars = [];
  let deg = 4;
  for (let b = 0; b < 4; b++) {
    const bar = [];
    for (let i = 0; i < 16; i++) {
      const strong = i % 4 === 0;
      if (!strong && rand() < 0.55) { bar.push(null); continue; }
      deg += Math.round((rand() - 0.5) * 3);
      deg = Math.max(0, Math.min(9, deg));
      bar.push(deg);
    }
    bars.push(bar);
  }
  // Repeat the first phrase at the end so the loop feels like a song.
  bars[3] = bars[0].map((d, i) => (i > 11 ? (i === 12 ? 0 : null) : d));
  return bars;
}

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.songName = 'spring';
    this.night = false;
    this.rain = false;
    this.crickets = false;
    this.level = 0.6;
    this.step = 0;
    this.nextTime = 0;
    this.melodies = {};
    for (const k of Object.keys(SONGS)) this.melodies[k] = melodyFor(k);
    this.lastStep = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.5;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      // A short echo makes the plucks feel like a little music box room.
      const delay = c.createDelay(1);
      delay.delayTime.value = 0.32;
      const fb = c.createGain();
      fb.gain.value = 0.25;
      this.music.connect(lp);
      lp.connect(this.master);
      lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // Rain bed: looping filtered noise.
      this.rainGain = c.createGain();
      this.rainGain.gain.value = 0;
      const rs = c.createBufferSource();
      rs.buffer = buf; rs.loop = true;
      const rf = c.createBiquadFilter();
      rf.type = 'bandpass'; rf.frequency.value = 1800; rf.Q.value = 0.5;
      rs.connect(rf).connect(this.rainGain).connect(this.master);
      rs.start();
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 80);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyLevels();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  setMusic(on) { this.musicOn = on; this.applyLevels(); }

  // level: 0 silent, ~0.35 menus, 0.6 play
  setLevel(level) { if (level !== this.level) { this.level = level; this.applyLevels(); } }

  setScene({ season, festival, night, rain, crickets }) {
    const name = festival ? 'festival' : season;
    if (name !== this.songName) { this.songName = name; this.step = 0; }
    this.night = night;
    if (rain !== this.rain || crickets !== this.crickets) { this.rain = rain; this.crickets = crickets; this.applyLevels(); }
  }

  applyLevels() {
    if (!this.music) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.22 * this.level : 0, t, 0.4);
    this.rainGain.gain.setTargetAtTime(this.rain ? 0.05 * Math.max(0.4, this.level) : 0, t, 0.8);
  }

  // ------------------------------------------------------------ primitives

  tone(freq, dur, { type = 'triangle', vol = 0.2, slide = null, at = 0, when = null, attack = 0.005, dest = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = when ?? c.currentTime + at;
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

  noise(dur, { freq = 1200, to = null, vol = 0.25, type = 'lowpass', at = 0, q = 0.8 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  chime(notes, { gap = 0.07, type = 'triangle', vol = 0.16, dur = 0.35, base = 784 } = {}) {
    notes.forEach((n, i) => this.tone(base * semis(n), dur, { type, vol, at: i * gap }));
  }

  // ------------------------------------------------------------ effects

  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'till': this.noise(0.12, { freq: 500, to: 180, vol: 0.4 }); this.tone(110, 0.1, { type: 'sine', vol: 0.25, slide: 70 }); break;
      case 'water': this.noise(0.32, { freq: 2600, to: 900, vol: 0.18, type: 'bandpass', q: 1.2 }); break;
      case 'plant': this.tone(520, 0.08, { type: 'sine', vol: 0.18, slide: 780 }); break;
      case 'harvest': this.chime([0, 4, 7, 12], { gap: 0.05, vol: 0.13, base: 660 }); this.noise(0.15, { freq: 6000, type: 'highpass', vol: 0.05 }); break;
      case 'pickup': this.tone(880, 0.08, { type: 'square', vol: 0.06 }); this.tone(1320, 0.12, { type: 'square', vol: 0.05, at: 0.06 }); break;
      case 'coin': this.tone(1568, 0.08, { type: 'square', vol: 0.05 }); this.tone(2093, 0.18, { type: 'square', vol: 0.05, at: 0.07 }); break;
      case 'ship': this.noise(0.1, { freq: 300, vol: 0.4 }); this.tone(1046, 0.1, { type: 'square', vol: 0.04, at: 0.08 }); break;
      case 'cut': this.noise(0.14, { freq: 4500, to: 1800, vol: 0.18, type: 'bandpass', q: 2 }); break;
      case 'swish': this.noise(0.12, { freq: 3000, to: 1200, vol: 0.08, type: 'bandpass', q: 2 }); break;
      case 'break': this.noise(0.08, { freq: 2200, vol: 0.35, type: 'bandpass', q: 3 }); this.tone(330, 0.06, { type: 'square', vol: 0.06, slide: 200 }); break;
      case 'thud': this.tone(90, 0.08, { type: 'sine', vol: 0.2 }); break;
      case 'cast': this.noise(0.25, { freq: 1500, to: 600, vol: 0.1, type: 'bandpass' }); this.noise(0.12, { freq: 900, vol: 0.12, at: 0.35 }); break;
      case 'bite': this.noise(0.18, { freq: 1200, vol: 0.3 }); this.tone(988, 0.12, { type: 'square', vol: 0.08 }); this.tone(1318, 0.15, { type: 'square', vol: 0.08, at: 0.1 }); break;
      case 'catch': this.chime([0, 4, 7, 12, 16], { gap: 0.07, vol: 0.12, base: 523 }); break;
      case 'miss': this.tone(330, 0.2, { type: 'triangle', vol: 0.1, slide: 220 }); break;
      case 'net': this.noise(0.2, { freq: 2000, to: 700, vol: 0.1, type: 'bandpass' }); break;
      case 'critter': this.chime([12, 16, 19, 24], { gap: 0.05, vol: 0.08, type: 'sine', base: 880 }); break;
      case 'cluck': this.tone(700, 0.06, { type: 'square', vol: 0.05, slide: 520 }); this.tone(760, 0.07, { type: 'square', vol: 0.05, slide: 560, at: 0.09 }); break;
      case 'moo': this.tone(150, 0.6, { type: 'sawtooth', vol: 0.07, slide: 110, attack: 0.08 }); break;
      case 'bleat': for (let i = 0; i < 4; i++) this.tone(420 - i * 10, 0.07, { type: 'sawtooth', vol: 0.04, at: i * 0.06 }); break;
      case 'talk': {
        const base = opt.pitch || 440;
        for (let i = 0; i < 3; i++) this.tone(base * semis([0, 4, 2, 7][(i + (opt.n || 0)) % 4]), 0.06, { type: 'square', vol: 0.035, at: i * 0.07 });
        break;
      }
      case 'gift': this.chime(opt.love ? [0, 4, 7, 11, 14] : [0, 4, 7], { gap: 0.08, vol: 0.12, base: 659 }); break;
      case 'open': this.tone(660, 0.06, { type: 'sine', vol: 0.08 }); this.tone(990, 0.08, { type: 'sine', vol: 0.06, at: 0.05 }); break;
      case 'close': this.tone(880, 0.06, { type: 'sine', vol: 0.06 }); this.tone(587, 0.08, { type: 'sine', vol: 0.06, at: 0.05 }); break;
      case 'select': this.tone(1200, 0.03, { type: 'square', vol: 0.025 }); break;
      case 'buy': this.tone(1046, 0.08, { type: 'square', vol: 0.05 }); this.tone(1568, 0.14, { type: 'square', vol: 0.05, at: 0.07 }); break;
      case 'goal': this.chime([0, 7, 12, 16, 19, 24], { gap: 0.08, vol: 0.1, base: 523 }); break;
      case 'fanfare': this.chime([0, 4, 7, 12, 7, 12, 16, 19, 24], { gap: 0.1, vol: 0.12, base: 523, dur: 0.4 }); break;
      case 'sleep': this.chime([12, 7, 4, 0, -5], { gap: 0.22, vol: 0.12, type: 'sine', base: 523, dur: 0.8 }); break;
      case 'morning': this.chime([0, 4, 7, 12], { gap: 0.15, vol: 0.1, type: 'sine', base: 659, dur: 0.6 }); break;
      case 'step': this.noise(0.04, { freq: opt.soft ? 600 : 1100, vol: 0.05 }); break;
      case 'refill': this.noise(0.4, { freq: 700, to: 1800, vol: 0.12, type: 'bandpass', q: 3 }); break;
      case 'warn': this.tone(392, 0.12, { type: 'triangle', vol: 0.08 }); this.tone(330, 0.16, { type: 'triangle', vol: 0.08, at: 0.12 }); break;
      default: break;
    }
  }

  handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'till': this.play('till'); break;
        case 'splash': this.play('water'); break;
        case 'refill': this.play('refill'); break;
        case 'plant': this.play('plant'); break;
        case 'harvest': this.play('harvest'); break;
        case 'pickup': case 'egg': this.play('pickup'); break;
        case 'cut': this.play('cut'); break;
        case 'swish': this.play('swish'); break;
        case 'break': this.play('break'); break;
        case 'thud': this.play('thud'); break;
        case 'cast': this.play('cast'); break;
        case 'bite': this.play('bite'); break;
        case 'catch': this.play('catch'); break;
        case 'reel': this.play('miss'); break;
        case 'net': this.play('net'); break;
        case 'critter': this.play('critter'); break;
        case 'pet': this.play(e.animal === 'cow' ? 'moo' : e.animal === 'goat' ? 'bleat' : 'cluck'); break;
        case 'animal': this.play('buy'); break;
        case 'goal': this.play('goal'); break;
        case 'festivalWon': this.play('fanfare'); break;
        case 'festivalStart': this.play('goal'); break;
        case 'lantern': this.play('critter'); break;
        case 'place': case 'pickupObj': this.play('plant'); break;
        case 'toast': if (e.tone === 'warn') this.play('warn'); break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn || this.muted) { if (c) this.nextTime = c.currentTime + 0.1; return; }
    const song = SONGS[this.songName] || SONGS.spring;
    const stepDur = 60 / song.bpm / 4 * (this.night ? 1.25 : 1);
    while (this.nextTime < c.currentTime + 0.25) {
      this.playStep(song, this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepDur;
    }
    if (this.crickets && Math.random() < 0.25) this.tone(4200 + Math.random() * 400, 0.04, { type: 'sine', vol: 0.012 * this.level, at: Math.random() * 0.1 });
  }

  playStep(song, step, t, stepDur) {
    const bar = Math.floor(step / 16), i = step % 16;
    const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
    const chord = song.chords[bar];
    const third = song.minor && (chord === 0 || chord === 5) ? 3 : 4;
    const quiet = this.night ? 0.6 : 1;
    // Bass on beats one and three.
    if (i === 0 || i === 8) this.tone(freq(song.root - 24 + chord), stepDur * 7, { type: song.bass, vol: 0.12 * quiet, when: t, attack: 0.02, dest: this.music });
    // Soft broken chord.
    if (i % 4 === 2) {
      const n = [0, third, 7, 12][(i / 4) | 0];
      this.tone(freq(song.root - 12 + chord + n), stepDur * 3, { type: 'sine', vol: 0.06 * quiet, when: t, attack: 0.01, dest: this.music });
    }
    // Melody.
    const deg = this.melodies[this.songName][bar][i];
    if (deg !== null && (!this.night || i % 4 === 0)) {
      const oct = Math.floor(deg / song.scale.length);
      const note = song.root + song.scale[deg % song.scale.length] + oct * 12;
      this.tone(freq(note), stepDur * (song.bell ? 4 : 2.2), { type: song.lead, vol: (song.lead === 'square' ? 0.035 : 0.08) * quiet, when: t, attack: 0.008, dest: this.music });
      if (song.bell) this.tone(freq(note + 12), stepDur * 3, { type: 'sine', vol: 0.03 * quiet, when: t, dest: this.music });
    }
    // A brushy shaker in summer and at festivals.
    if ((this.songName === 'summer' || this.songName === 'festival') && i % 2 === 1 && !this.night) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(f).connect(g).connect(this.music);
      s.start(t, Math.random()); s.stop(t + 0.06);
    }
  }
}
