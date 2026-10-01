// Chiptune music and crunchy effects, all synthesized with WebAudio: two
// pulse channels (25% and 12.5% duty, like an old console), a triangle bass
// and a noise drum channel. No audio files.

import { TRACKS, parseTrack } from './music.js';

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.track = null;
    this.trackName = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.lastShot = 0;
    this.musicLevel = 1;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.2 * this.musicLevel : 0;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.42;
    this.sfxBus.connect(this.master);
    this.pulse25 = this.pulseWave(0.25);
    this.pulse12 = this.pulseWave(0.125);
    this.pulse50 = this.pulseWave(0.5);
    const len = Math.floor(ctx.sampleRate * 0.6);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    // Short-period noise, a bit like an LFSR: crunchy rather than hissy.
    let reg = 1;
    let held = 0;
    for (let i = 0; i < len; i += 1) {
      if (i % 3 === 0) {
        const bit = (reg ^ (reg >> 1)) & 1;
        reg = (reg >> 1) | (bit << 14);
        held = reg & 1 ? 1 : -1;
      }
      data[i] = held * 0.8;
    }
    if (this.wanted) this.playTrack(this.wanted);
  }

  pulseWave(duty) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k += 1) {
      real[k] = (2 * Math.sin(2 * Math.PI * k * duty)) / (Math.PI * k);
      imag[k] = (2 * (1 - Math.cos(2 * Math.PI * k * duty))) / (Math.PI * k);
    }
    return this.ctx.createPeriodicWave(real, imag);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.8;
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusicLevel();
  }

  setMusicLevel(level) {
    this.musicLevel = level;
    this.applyMusicLevel();
  }

  applyMusicLevel() {
    if (!this.musicBus) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.2 * this.musicLevel : 0, now, 0.08);
  }

  // ------------------------------------------------------------- music

  playTrack(name) {
    this.wanted = name;
    if (!this.ctx) return;
    if (this.trackName === name && this.timer) return;
    this.stopMusic();
    const spec = TRACKS[name];
    if (!spec) return;
    this.track = parseTrack(spec);
    this.trackName = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.trackName = null;
  }

  schedule() {
    if (!this.ctx || !this.track) return;
    const t = this.track;
    const stepTime = 60 / t.tempo / 4;
    while (this.nextTime < this.ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextTime, stepTime);
      this.step = (this.step + 1) % t.steps;
      this.nextTime += stepTime;
    }
  }

  playStep(step, when, stepTime) {
    const t = this.track;
    for (const note of t.lead[step] || []) this.note(this.pulse25, note.midi, when, note.len * stepTime, 0.28, this.musicBus, 0.004);
    for (const note of t.harmony[step] || []) this.note(this.pulse12, note.midi, when, note.len * stepTime, 0.12, this.musicBus, 0.004);
    for (const note of t.bass[step] || []) this.note('triangle', note.midi, when, note.len * stepTime * 0.92, 0.5, this.musicBus, 0.003);
    const drum = t.drums[step % t.drums.length];
    if (drum === 'k') { this.kick(when, this.musicBus); }
    else if (drum === 's') this.hiss(when, 0.11, 0.32, 1800, this.musicBus);
    else if (drum === 'h') this.hiss(when, 0.03, 0.12, 7000, this.musicBus);
    else if (drum === 'x') { this.kick(when, this.musicBus); this.hiss(when, 0.03, 0.1, 7000, this.musicBus); }
  }

  note(wave, midi, when, dur, gain, bus, attack = 0.005) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    if (typeof wave === 'string') osc.type = wave;
    else osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(midiHz(midi), when);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain, when + attack);
    env.gain.setValueAtTime(gain * 0.8, when + Math.max(attack, dur * 0.6));
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(env).connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  kick(when, bus) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.7, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
    osc.connect(env).connect(bus);
    osc.start(when);
    osc.stop(when + 0.16);
  }

  hiss(when, dur, gain, freq, bus, sweep = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = freq > 4000 ? 'highpass' : 'bandpass';
    filter.frequency.setValueAtTime(freq, when);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter).connect(env).connect(bus);
    src.start(when, Math.random() * 0.3);
    src.stop(when + dur + 0.02);
  }

  // ----------------------------------------------------------- effects

  blip(freq, dur, { wave = 'pulse25', gain = 0.3, to = 0, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const waves = { pulse25: this.pulse25, pulse12: this.pulse12, pulse50: this.pulse50 };
    if (waves[wave]) osc.setPeriodicWave(waves[wave]);
    else osc.type = wave;
    osc.frequency.setValueAtTime(freq, when);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(env).connect(this.sfxBus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  noise(dur, { gain = 0.3, freq = 1200, sweep = 0, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    this.hiss(this.ctx.currentTime + delay, dur, gain, freq, this.sfxBus, sweep);
  }

  arp(notes, { step = 0.06, dur = 0.09, wave = 'pulse25', gain = 0.22 } = {}) {
    notes.forEach((m, i) => this.blip(midiHz(m), dur, { wave, gain, delay: i * step }));
  }

  handleEvents(events) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const e of events) {
      switch (e.type) {
        case 'shoot': {
          if (now - this.lastShot < 0.05) break;
          this.lastShot = now;
          if (e.gun === 'spread') { this.blip(900, 0.08, { gain: 0.14, to: 300 }); this.noise(0.05, { gain: 0.08, freq: 3000 }); }
          else if (e.gun === 'laser') this.blip(1800, 0.16, { wave: 'pulse12', gain: 0.16, to: 600 });
          else if (e.gun === 'rapid') this.blip(1400, 0.035, { wave: 'pulse12', gain: 0.1, to: 900 });
          else if (e.gun === 'flame') this.noise(0.08, { gain: 0.1, freq: 600, sweep: 0.5 });
          else this.blip(1100, 0.06, { gain: 0.13, to: 420 });
          break;
        }
        case 'jump': this.blip(300, 0.12, { wave: 'pulse50', gain: 0.14, to: 700 }); break;
        case 'land': this.noise(0.05, { gain: 0.06, freq: 500 }); break;
        case 'vine': this.noise(0.12, { gain: 0.08, freq: 2400, sweep: 0.4 }); this.blip(500, 0.06, { gain: 0.08 }); break;
        case 'swing': this.noise(0.16, { gain: 0.08, freq: 1600, sweep: 2 }); break;
        case 'enemyShot': this.blip(260, 0.07, { wave: 'pulse12', gain: 0.06, to: 180 }); break;
        case 'hit': this.noise(0.04, { gain: 0.08, freq: 2400 }); break;
        case 'bossHit': this.noise(0.03, { gain: 0.06, freq: 3200 }); break;
        case 'explode': {
          const big = (e.size || 1) >= 2;
          this.noise(big ? 0.55 : 0.3, { gain: big ? 0.4 : 0.28, freq: big ? 700 : 1100, sweep: 0.15 });
          this.blip(big ? 120 : 180, big ? 0.4 : 0.2, { wave: 'triangle', gain: 0.25, to: 40 });
          break;
        }
        case 'hurt': this.blip(400, 0.3, { wave: 'pulse50', gain: 0.2, to: 90 }); break;
        case 'splash': this.noise(0.4, { gain: 0.25, freq: 900, sweep: 0.3 }); this.blip(500, 0.3, { gain: 0.12, to: 120 }); break;
        case 'death': this.arp([72, 67, 64, 60, 55, 48], { step: 0.07, dur: 0.12, wave: 'pulse50', gain: 0.2 }); break;
        case 'trip': this.blip(180, 0.12, { wave: 'triangle', gain: 0.3, to: 90 }); this.noise(0.08, { gain: 0.1, freq: 400 }); break;
        case 'treasure': this.arp([84, 88, 91, 96], { step: 0.05, dur: 0.12, wave: 'pulse12', gain: 0.18 }); break;
        case 'powerup': this.arp([60, 64, 67, 72, 76, 79], { step: 0.04, dur: 0.08, gain: 0.16 }); break;
        case 'podOpen': this.blip(700, 0.08, { gain: 0.12, to: 1400 }); break;
        case 'oneUp': this.arp([76, 79, 88, 84, 86, 91], { step: 0.08, dur: 0.1, gain: 0.2 }); break;
        case 'checkpoint': this.arp([67, 72, 76, 79], { step: 0.07, dur: 0.14, wave: 'pulse12', gain: 0.18 }); break;
        case 'bomb':
          this.noise(1.0, { gain: 0.5, freq: 500, sweep: 0.1 });
          this.blip(220, 0.9, { wave: 'triangle', gain: 0.4, to: 30 });
          break;
        case 'snap': this.noise(0.04, { gain: 0.06, freq: 2800 }); break;
        case 'turretUp': this.blip(200, 0.15, { wave: 'pulse12', gain: 0.08, to: 400 }); break;
        case 'quake': this.noise(0.5, { gain: 0.35, freq: 220, sweep: 0.4 }); break;
        case 'erupt': this.noise(0.4, { gain: 0.3, freq: 400, sweep: 0.3 }); break;
        case 'laserBlast': this.blip(2000, 0.5, { wave: 'pulse12', gain: 0.16, to: 200 }); break;
        case 'roar': this.noise(0.6, { gain: 0.25, freq: 300, sweep: 0.6 }); this.blip(110, 0.5, { wave: 'pulse50', gain: 0.15, to: 70 }); break;
        case 'bossWindup': this.blip(520, 0.05, { wave: 'pulse12', gain: 0.06 }); break;
        case 'bossIntro':
          for (let i = 0; i < 4; i += 1) {
            this.blip(880, 0.18, { wave: 'pulse50', gain: 0.12, delay: i * 0.45 });
            this.blip(660, 0.18, { wave: 'pulse50', gain: 0.12, delay: i * 0.45 + 0.22 });
          }
          break;
        case 'bossPhase': this.arp([48, 51, 54, 57], { step: 0.05, dur: 0.1, wave: 'pulse50', gain: 0.18 }); break;
        case 'bossDown': this.noise(1.6, { gain: 0.45, freq: 600, sweep: 0.1 }); break;
        case 'stageClear': this.jingle('clear'); break;
        case 'gameOver': this.jingle('over'); break;
        case 'respawn': this.arp([60, 67, 72], { step: 0.05, dur: 0.08, wave: 'pulse12', gain: 0.12 }); break;
        case 'crumble': this.noise(0.2, { gain: 0.12, freq: 700, sweep: 0.5 }); break;
        case 'summon': this.blip(300, 0.2, { wave: 'pulse12', gain: 0.1, to: 900 }); break;
        default: break;
      }
    }
  }

  jingle(kind) {
    this.stopMusic();
    if (kind === 'clear') {
      this.arp([72, 76, 79, 84, 79, 84, 88, 91], { step: 0.11, dur: 0.16, gain: 0.2 });
      this.arp([48, 52, 55, 60, 55, 60, 64, 67], { step: 0.11, dur: 0.16, wave: 'triangle', gain: 0.3 });
    } else {
      this.arp([67, 66, 65, 64, 60, 55, 52, 48], { step: 0.16, dur: 0.22, wave: 'pulse50', gain: 0.18 });
    }
  }

  click() {
    this.blip(1200, 0.04, { wave: 'pulse12', gain: 0.1 });
  }

  move() {
    this.blip(800, 0.03, { wave: 'pulse12', gain: 0.07 });
  }
}
