// Synthesized sketchbook sounds: pencil scratches, paper swishes, thumps,
// wooden knocks and xylophone plinks, plus a gentle music-box loop.
// Everything is made with WebAudio at runtime; no audio files.

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const KEYS = [60, 57, 62]; // one key per page

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.noise = null;
    this.soundOn = true;
    this.musicOn = true;
    this.musicTimer = null;
    this.step = 0;
    this.nextAt = 0;
    this.floor = 0;
    this.mood = 'calm';
  }

  // Browsers only allow audio after a gesture: call from input handlers.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setSound(on) {
    this.soundOn = on;
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.2);
  }

  setScene(floor, mood) {
    this.floor = floor;
    this.mood = mood;
  }

  tone(freq, { type = 'triangle', at = 0, dur = 0.18, vol = 0.3, slide = 0, out = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss({ at = 0, dur = 0.12, vol = 0.25, freq = 2400, q = 1.2, type = 'bandpass', sweep = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || !this.soundOn) return;
    const midi = (m) => 440 * 2 ** ((m - 69) / 12);
    switch (name) {
      case 'click': this.tone(880, { type: 'sine', dur: 0.06, vol: 0.12 }); break;
      case 'select': this.hiss({ dur: 0.07, vol: 0.12, freq: 3800 }); this.tone(660, { type: 'sine', dur: 0.08, vol: 0.1 }); break;
      case 'draw': this.hiss({ dur: 0.1, vol: 0.09, freq: 5200, type: 'highpass', q: 0.5 }); break;
      case 'scribble':
        for (let i = 0; i < 4; i++) this.hiss({ at: i * 0.045, dur: 0.05, vol: 0.2, freq: 1800 + i * 500, q: 3 });
        break;
      case 'hit': this.tone(150, { type: 'sine', dur: 0.2, vol: 0.5, slide: 0.5 }); this.hiss({ dur: 0.1, vol: 0.25, freq: 900 }); break;
      case 'hurt': this.tone(220, { type: 'square', dur: 0.18, vol: 0.12, slide: 0.6 }); this.tone(120, { type: 'sine', dur: 0.22, vol: 0.4, slide: 0.6 }); break;
      case 'block': this.tone(520, { type: 'triangle', dur: 0.08, vol: 0.25 }); this.tone(390, { type: 'triangle', at: 0.05, dur: 0.1, vol: 0.2 }); break;
      case 'blocked': this.tone(300, { type: 'square', dur: 0.06, vol: 0.1 }); this.hiss({ dur: 0.06, vol: 0.12, freq: 1200 }); break;
      case 'heal': [0, 4, 7].forEach((n, i) => this.tone(midi(72 + n), { type: 'sine', at: i * 0.07, dur: 0.25, vol: 0.16 })); break;
      case 'buff': [0, 7, 12].forEach((n, i) => this.tone(midi(64 + n), { type: 'triangle', at: i * 0.06, dur: 0.18, vol: 0.16 })); break;
      case 'debuff': this.tone(500, { type: 'sine', dur: 0.35, vol: 0.14, slide: 0.5 }); break;
      case 'smudge': this.tone(240, { type: 'sine', dur: 0.25, vol: 0.2, slide: 0.7 }); this.hiss({ dur: 0.18, vol: 0.12, freq: 600, type: 'lowpass' }); break;
      case 'coin': this.tone(midi(88), { type: 'square', dur: 0.07, vol: 0.08 }); this.tone(midi(95), { type: 'square', at: 0.07, dur: 0.16, vol: 0.08 }); break;
      case 'defeat': this.scribbleOut(); break;
      case 'turn': this.tone(midi(76), { type: 'sine', dur: 0.12, vol: 0.14 }); this.tone(midi(83), { type: 'sine', at: 0.08, dur: 0.16, vol: 0.14 }); break;
      case 'enemy': this.tone(midi(55), { type: 'triangle', dur: 0.2, vol: 0.16 }); this.tone(midi(50), { type: 'triangle', at: 0.1, dur: 0.24, vol: 0.16 }); break;
      case 'map': this.hiss({ dur: 0.22, vol: 0.12, freq: 3000, sweep: 0.4 }); break;
      case 'page': this.hiss({ dur: 0.4, vol: 0.18, freq: 4200, sweep: 0.3, q: 0.6 }); break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(67 + n), { type: 'triangle', at: i * 0.09, dur: 0.3, vol: 0.18 }));
        break;
      case 'lose': [7, 4, 0, -5].forEach((n, i) => this.tone(midi(64 + n), { type: 'sine', at: i * 0.18, dur: 0.35, vol: 0.18 })); break;
      case 'unlock':
        [0, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(72 + n), { type: 'sine', at: i * 0.07, dur: 0.4, vol: 0.15 }));
        break;
      default: break;
    }
  }

  scribbleOut() {
    for (let i = 0; i < 7; i++) this.hiss({ at: i * 0.06, dur: 0.07, vol: 0.22, freq: 1500 + (i % 2) * 900, q: 2.5 });
    this.tone(330, { type: 'triangle', at: 0.45, dur: 0.2, vol: 0.16, slide: 1.5 });
  }

  // A small music box that plays a wandering pentatonic tune.
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.nextAt = this.ctx.currentTime + 0.2;
    const beat = 0.32;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      while (this.nextAt < this.ctx.currentTime + 0.6) {
        const at = this.nextAt - this.ctx.currentTime;
        const s = this.step++;
        const key = KEYS[this.floor % KEYS.length] + (this.mood === 'boss' ? -3 : 0);
        const bar = Math.floor(s / 8) % 4;
        const chord = [0, 5, 3, 4][bar];
        if (s % 8 === 0) this.tone(440 * 2 ** ((key - 24 + SCALE[chord] - 69) / 12), { type: 'sine', at, dur: beat * 6, vol: 0.5, out: this.musicGain });
        const pattern = this.mood === 'battle' || this.mood === 'boss' ? [0, 2, 1, 3, 2, 4, 3, 1] : [0, -1, 2, -1, 4, 3, -1, 1];
        const p = pattern[s % 8];
        if (p >= 0) {
          const n = SCALE[(chord + p + ((s >> 5) % 2)) % SCALE.length];
          this.tone(440 * 2 ** ((key + n - 69) / 12), { type: 'triangle', at, dur: 0.5, vol: 0.32, out: this.musicGain });
          this.tone(440 * 2 ** ((key + n + 12 - 69) / 12), { type: 'sine', at, dur: 0.3, vol: 0.08, out: this.musicGain });
        }
        this.nextAt += this.mood === 'battle' || this.mood === 'boss' ? beat * 0.8 : beat;
      }
    }, 150);
  }
}
