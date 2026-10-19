// Synthesized sound: bonks, squeaks, splashes, a hold-the-tower tick, a
// fanfare, wind and a little marimba tune. No audio files.
import { animalShape } from './animals.js';

const semi = (n) => Math.pow(2, n / 12);
// Each animal's voice (base pitch in Hz and a wobble).
const VOICES = {
  hippo: [170, 0.3], giraffe: [330, 0.2], panda: [260, 0.5], turtle: [220, 0.2],
  penguin: [420, 0.3], frog: [190, 0.8], owl: [300, 0.4], pig: [240, 0.6],
  elephant: [140, 0.5], hedgehog: [480, 0.3], croc: [150, 0.2], chick: [760, 0.4],
};
const SONG = [0, 4, 7, 9, 7, 4, 2, 4, 0, 4, 7, 12, 9, 7, 4, 2];
const BASS = [0, 0, -3, -3, -5, -5, -7, -5];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.lastBonk = 0;
    this.step = 0;
    this.key = 0;
    this.musicLevel = 0.5;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.6; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // wind bed: looping noise through a band-pass, gain follows the wind
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
      this.windGain = c.createGain(); this.windGain.gain.value = 0;
      src.connect(bp).connect(this.windGain).connect(this.sfx);
      src.start();
      this.windFilter = bp;
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 80);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setMusic(on) { this.musicOn = on; this.applyMusic(); }

  setMusicLevel(level, key = this.key) {
    this.key = key;
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyMusic();
  }

  applyMusic() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.16 * this.musicLevel : 0, this.ctx.currentTime, 0.3);
  }

  setWind(w) {
    if (!this.windGain) return;
    const v = Math.min(0.12, Math.abs(w) * 0.05);
    this.windGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.4);
    this.windFilter.frequency.setTargetAtTime(380 + Math.abs(w) * 260, this.ctx.currentTime, 0.4);
  }

  // ---------------------------------------------------------- voices

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

  hiss(dur, { vol = 0.2, freq = 1200, q = 1, at = 0, sweep = 1, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  squeak(animal) {
    const [f, wob] = VOICES[animal] || [300, 0.3];
    this.tone(f, 0.16, { type: 'triangle', vol: 0.18, slide: 1 + wob });
    this.tone(f * (1 + wob), 0.12, { type: 'triangle', vol: 0.12, at: 0.09, slide: 0.85 });
  }

  bonk(animal, speed) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBonk < 0.045) return;
    this.lastBonk = now;
    const r = animal ? animalShape(animal).radius : 1;
    const base = 260 / Math.max(0.5, r);
    const vol = Math.min(0.35, 0.06 + speed * 0.06);
    this.tone(base, 0.14, { type: 'sine', vol, slide: 0.55 });
    this.hiss(0.05, { vol: vol * 0.6, freq: 900, q: 0.8 });
  }

  // ---------------------------------------------------------- game events

  handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'spawn': this.squeak(e.animal); break;
        case 'rotate': this.tone(e.dir > 0 ? 880 : 740, 0.05, { type: 'square', vol: 0.05 }); break;
        case 'drop': this.hiss(0.25, { vol: 0.12, freq: 700, sweep: 0.4 }); break;
        case 'impact': if (e.speed > 0.9) this.bonk(e.animal, e.speed); break;
        case 'splash':
          this.hiss(0.6, { vol: 0.35, freq: 900, sweep: 0.3, type: 'lowpass' });
          for (let i = 0; i < 4; i++) this.tone(500 + i * 160, 0.08, { type: 'sine', vol: 0.08, at: 0.12 + i * 0.07, slide: 1.6 });
          break;
        case 'hold-start': this.tone(660, 0.18, { type: 'triangle', vol: 0.14 }); break;
        case 'hold-tick': this.tone(660 * semi(5 * (3 - e.left)), 0.2, { type: 'triangle', vol: 0.16 }); break;
        case 'hold-break': this.tone(330, 0.25, { type: 'triangle', vol: 0.12, slide: 0.7 }); break;
        case 'win': this.fanfare(); break;
        case 'lose': this.aww(); break;
        case 'milestone': [0, 4, 7, 12].forEach((n, i) => this.tone(660 * semi(n), 0.18, { type: 'triangle', vol: 0.14, at: i * 0.07 })); break;
        case 'turn': this.tone(520, 0.1, { type: 'triangle', vol: 0.12 }); this.tone(780, 0.14, { type: 'triangle', vol: 0.12, at: 0.08 }); break;
        default: break;
      }
    }
  }

  fanfare() {
    [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(523 * semi(n), 0.22, { type: 'triangle', vol: 0.17, at: i * 0.09 }));
    this.tone(523 * semi(24), 0.6, { type: 'sine', vol: 0.08, at: 0.65 });
  }

  aww() {
    [0, -1, -2, -4].forEach((n, i) => this.tone(392 * semi(n), 0.3, { type: 'triangle', vol: 0.13, at: i * 0.22, slide: i === 3 ? 0.8 : 1 }));
  }

  ui() { this.tone(700, 0.06, { type: 'triangle', vol: 0.1 }); }

  // ---------------------------------------------------------- music

  schedule() {
    if (!this.ctx || !this.musicOn || this.musicLevel <= 0) { if (this.ctx) this.nextTime = this.ctx.currentTime + 0.1; return; }
    const c = this.ctx, beat = 0.3;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.4) {
      const t = this.nextTime - c.currentTime;
      const i = this.step % SONG.length;
      const root = 392 * semi(this.key);
      if (i % 2 === 0 || (i * 7) % 5 === 1) this.marimba(root * semi(SONG[i]), t, 0.22);
      if (i % 4 === 0) this.marimba(root / 2 * semi(BASS[(this.step / 4 | 0) % BASS.length]), t, 0.3, 0.6);
      this.step++;
      this.nextTime += beat;
    }
  }

  marimba(freq, at, vol, dur = 0.35) {
    this.tone(freq, dur, { type: 'sine', vol, at, dest: this.music, attack: 0.003 });
    this.tone(freq * 4, 0.06, { type: 'sine', vol: vol * 0.25, at, dest: this.music, attack: 0.002 });
  }
}
