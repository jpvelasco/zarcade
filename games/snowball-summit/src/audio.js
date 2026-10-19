// Synthesized sound: a crunchy rolling loop, plucks for every pickup that
// climb a pentatonic scale, cheerful chirps for waving friends, and a
// music-box tune per peak. No audio files.
import { physicsFor } from './world.js';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const SONGS = [
  { key: 0, tempo: 0.2, prog: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']] },
  { key: -3, tempo: 0.19, prog: [[0, 'maj'], [5, 'maj'], [9, 'min'], [7, 'maj']] },
  { key: 2, tempo: 0.22, prog: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']] },
];
const TRIAD = { maj: [0, 4, 7], min: [0, 3, 7] };
const MELODY = [0, 2, 1, 2, 0, 1, 2, 1, -1, 2, 1, 0, 1, -1, 2, -1];
const hz = (semi) => 523.25 * Math.pow(2, semi / 12);

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.song = 0;
    this.musicLevel = 0.5;
    this.step = 0;
    this.combo = 0;
    this.comboTimer = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.6; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // Rolling crunch: looped noise through a band-pass, gain follows speed.
      const roll = c.createBufferSource(); roll.buffer = buf; roll.loop = true;
      this.rollFilter = c.createBiquadFilter(); this.rollFilter.type = 'bandpass'; this.rollFilter.frequency.value = 700; this.rollFilter.Q.value = 0.7;
      this.rollGain = c.createGain(); this.rollGain.gain.value = 0;
      roll.connect(this.rollFilter).connect(this.rollGain).connect(this.sfx);
      roll.start();
      // Avalanche rumble.
      const rum = c.createBufferSource(); rum.buffer = buf; rum.loop = true; rum.playbackRate.value = 0.5;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      this.rumbleGain = c.createGain(); this.rumbleGain.gain.value = 0;
      rum.connect(lp).connect(this.rumbleGain).connect(this.sfx);
      rum.start();
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 80);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.03);
  }

  setMusic(on) { this.musicOn = on; this.applyMusic(); }
  setMusicLevel(level) { if (level !== this.musicLevel) { this.musicLevel = level; this.applyMusic(); } }
  setSong(i) { this.song = Math.max(0, Math.min(SONGS.length - 1, i)); }

  applyMusic() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.22 * this.musicLevel : 0, this.ctx.currentTime, 0.3);
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const song = SONGS[this.song];
    while (this.nextTime < c.currentTime + 0.3) {
      const t = this.nextTime;
      const bar = Math.floor(this.step / 16) % song.prog.length;
      const [root, q] = song.prog[bar];
      const tri = TRIAD[q];
      const pos = this.step % 16;
      if (this.musicOn && this.musicLevel > 0) {
        if (pos % 8 === 0) this.tone(hz(song.key + root - 24), t, 0.9, 'triangle', 0.32, this.music);
        if (pos % 4 === 2) this.tone(hz(song.key + root - 12 + tri[1]), t, 0.3, 'sine', 0.12, this.music);
        const m = MELODY[pos];
        if (m >= 0 && (pos % 2 === 0 || this.step % 32 > 16)) this.bell(hz(song.key + root + tri[m]), t, 0.18, this.music);
        if (pos % 2 === 0) this.noise(t, 0.03, 9000, 0.05, this.music);
      }
      this.step++;
      this.nextTime += song.tempo;
    }
  }

  tone(f, t, dur, type, vol, out = this.sfx, f2 = null) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = c.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  bell(f, t, vol, out = this.sfx) {
    this.tone(f, t, 0.6, 'sine', vol, out);
    this.tone(f * 3, t, 0.25, 'sine', vol * 0.25, out);
  }

  noise(t, dur, freq, vol, out = this.sfx, type = 'highpass') {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const gn = c.createGain(); gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(gn).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // Continuous sounds from the world each frame.
  frame(world, dt, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    let roll = 0, rumble = 0;
    if (world && active) {
      const b = world.ball;
      const sp = Math.min(1.3, Math.abs(b.vx) / physicsFor(b.D).vmax);
      roll = b.grounded ? 0.08 + sp * 0.32 : 0;
      this.rollFilter.frequency.setTargetAtTime(Math.max(180, 1300 - Math.log2(b.D / 20) * 220) * (0.7 + sp * 0.5), t, 0.1);
      const a = world.avalanche;
      if (a && a.delay <= 0 && world.status === 'play') rumble = Math.max(0, Math.min(1, 1 - a.gap / 14)) * 0.9;
    }
    this.rollGain.gain.setTargetAtTime(roll, t, 0.08);
    this.rumbleGain.gain.setTargetAtTime(rumble, t, 0.2);
  }

  handle(events) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    for (const e of events) {
      switch (e.type) {
        case 'pick': {
          this.combo = Math.min(PENTA.length - 1, this.combo + 1);
          this.comboTimer = 0.9;
          const base = e.ratio < 0.2 ? 12 : e.ratio < 0.35 ? 5 : 0;
          this.tone(hz(PENTA[this.combo] + base - 5), t, 0.22, 'triangle', 0.22);
          if (e.waves) { this.tone(1400, t + 0.04, 0.12, 'sine', 0.12, this.sfx, 2200); this.tone(1700, t + 0.13, 0.1, 'sine', 0.1, this.sfx, 2500); }
          break;
        }
        case 'bump': this.tone(140, t, 0.25, 'sine', 0.5, this.sfx, 60); this.noise(t, 0.15, 600, 0.3, this.sfx, 'lowpass'); break;
        case 'jump': this.tone(300, t, 0.22, 'sine', 0.25, this.sfx, 620); break;
        case 'land': this.noise(t, 0.12 + e.power * 0.1, 400, 0.2 + e.power * 0.3, this.sfx, 'lowpass'); break;
        case 'air': this.bell(hz(12), t, 0.15); this.bell(hz(16), t + 0.08, 0.15); break;
        case 'milestone': [0, 4, 7, 12].forEach((s, i) => this.bell(hz(s + 7), t + i * 0.07, 0.2)); break;
        case 'gate.smash': this.noise(t, 0.5, 2500, 0.5); [12, 16, 19, 24].forEach((s, i) => this.bell(hz(s), t + i * 0.05, 0.16)); break;
        case 'gate.block': this.tone(220, t, 0.2, 'sine', 0.3, this.sfx, 150); this.noise(t + 0.15, 0.25, 1200, 0.2, this.sfx, 'bandpass'); break;
        case 'bridge.break': for (let i = 0; i < 4; i++) this.noise(t + i * 0.06, 0.07, 1500, 0.35, this.sfx, 'bandpass'); this.tone(160, t, 0.4, 'triangle', 0.25, this.sfx, 70); break;
        case 'bridge.cross': [0, 2].forEach((s, i) => this.tone(hz(s - 12), t + i * 0.1, 0.12, 'square', 0.06)); break;
        case 'finish': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.bell(hz(s), t + i * 0.08, 0.22)); break;
        case 'caught': this.noise(t, 1.0, 400, 0.5, this.sfx, 'lowpass'); [7, 4, 0].forEach((s, i) => this.tone(hz(s - 12), t + 0.2 + i * 0.18, 0.3, 'triangle', 0.2)); break;
        default: break;
      }
    }
  }

  star(i) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.bell(hz([12, 16, 19][i] || 24), t, 0.25);
  }

  click() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.tone(880, this.ctx.currentTime, 0.06, 'sine', 0.1);
  }
}
