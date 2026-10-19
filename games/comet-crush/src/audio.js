// All sound is synthesized with Web Audio; there are no audio files.
// Brick smashes climb a pentatonic scale as the combo grows, and a small
// step-sequencer plays a chiptune-ish loop per constellation.
const PENTA = [0, 2, 4, 7, 9];
const semis = (n) => Math.pow(2, n / 12);

// Chord roots (semitones from the key) and qualities for each progression.
const PROGRESSIONS = {
  calm: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']],
  boss: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
};
const KEYS = [0, 3, -2, 5, 2, -4]; // one key per constellation
const TRIAD = { maj: [0, 4, 7, 12], min: [0, 3, 7, 12] };
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.song = { key: 0, boss: false };
    this.musicLevel = 0.5;
    this.step = 0;
    this.nextTime = 0;
    this.lastBlip = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      this.music.connect(lp).connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 60);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusicLevel();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusicLevel();
  }

  // level: 0 silent, ~0.3 menus/pause, 1 in play
  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyMusicLevel();
  }

  applyMusicLevel() {
    if (!this.music) return;
    const v = this.musicOn ? 0.2 * this.musicLevel : 0;
    this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  setSong(constellation, boss) {
    this.song = { key: KEYS[constellation % KEYS.length], boss };
  }

  // ------------------------------------------------------------ primitives

  tone(freq, dur, { type = 'square', vol = 0.2, slide = null, at = 0, attack = 0.004, dest = null } = {}) {
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
    s.stop(t + dur + 0.02);
  }

  comboNote(combo) {
    const i = Math.min(Math.max(combo - 1, 0), 19);
    const n = PENTA[i % 5] + 12 * Math.floor(i / 5);
    return 392 * semis(n);
  }

  // ------------------------------------------------------------ events

  handle(events) {
    if (!this.ctx || this.muted) return;
    let blips = 0;
    for (const e of events) {
      switch (e.type) {
        case 'brick': {
          if (blips++ > 2) break;
          const f = this.comboNote(e.combo);
          this.tone(f, 0.12, { type: 'square', vol: 0.12 });
          this.tone(f * 2, 0.18, { type: 'triangle', vol: 0.08 });
          if (e.kind === 'star') [0, 4, 7, 12].forEach((n, i) => this.tone(1046 * semis(n), 0.12, { type: 'triangle', vol: 0.08, at: i * 0.05 }));
          break;
        }
        case 'crack': this.tone(260, 0.08, { type: 'square', vol: 0.1, slide: 180 }); break;
        case 'metal':
          this.tone(1250, 0.12, { type: 'square', vol: 0.05 });
          this.tone(1330, 0.16, { type: 'square', vol: 0.04 });
          this.noise(0.06, { freq: 5000, type: 'highpass', vol: 0.08 });
          break;
        case 'paddle':
          if (e.duck) this.squeak();
          else this.tone(210 + Math.abs(e.offset) * 90, 0.12, { type: 'triangle', vol: 0.28, slide: 330 });
          break;
        case 'wall':
          if (e.duck) this.squeak();
          else this.tone(640, 0.035, { type: 'triangle', vol: 0.06 });
          break;
        case 'explode':
          this.noise(0.45, { freq: 1600, to: 90, vol: 0.4 });
          this.tone(110, 0.3, { type: 'sine', vol: 0.35, slide: 40 });
          break;
        case 'drop': this.tone(1320, 0.1, { type: 'sine', vol: 0.06, slide: 1760 }); break;
        case 'power': [0, 4, 7, 12, 16].forEach((n, i) => this.tone(523 * semis(n), 0.14, { type: 'square', vol: 0.08, at: i * 0.045 })); break;
        case 'expire': this.tone(660, 0.1, { type: 'triangle', vol: 0.06, slide: 440 }); break;
        case 'star': [0, 7, 12, 19, 24].forEach((n, i) => this.tone(880 * semis(n), 0.16, { type: 'triangle', vol: 0.1, at: i * 0.05 })); break;
        case 'laser': this.tone(1500, 0.08, { type: 'square', vol: 0.035, slide: 420 }); break;
        case 'lost':
          this.tone(440, 0.7, { type: 'sawtooth', vol: 0.12, slide: 90 });
          this.noise(0.4, { freq: 800, to: 100, vol: 0.12 });
          break;
        case 'launch': this.tone(300, 0.16, { type: 'triangle', vol: 0.16, slide: 900 }); break;
        case 'catch': this.tone(180, 0.08, { type: 'sine', vol: 0.2, slide: 120 }); break;
        case 'portal': this.tone(260, 0.3, { type: 'sine', vol: 0.18, slide: 1400 }); break;
        case 'shield': this.tone(740, 0.2, { type: 'triangle', vol: 0.18, slide: 1100 }); break;
        case 'shoot': this.tone(220, 0.2, { type: 'sine', vol: 0.14, slide: 520 }); break;
        case 'pop': this.tone(900, 0.06, { type: 'sine', vol: 0.18, slide: 1500 }); break;
        case 'bonk':
          this.tone(180, 0.35, { type: 'sine', vol: 0.25, slide: 520 });
          this.tone(520, 0.3, { type: 'sine', vol: 0.12, slide: 160, at: 0.12 });
          break;
        case 'regrow': this.tone(160, 0.12, { type: 'triangle', vol: 0.05, slide: 240 }); break;
        case 'bossHit':
          this.tone(150, 0.16, { type: 'square', vol: 0.16, slide: 70 });
          this.noise(0.12, { freq: 900, vol: 0.18 });
          this.tone(this.comboNote(e.combo), 0.12, { type: 'triangle', vol: 0.08 });
          break;
        case 'bossDefeat':
          for (let i = 0; i < 4; i++) this.noise(0.6, { freq: 2000, to: 80, vol: 0.35, at: i * 0.25 });
          this.fanfare(1.1);
          break;
        case 'clear': this.fanfare(0); break;
        case 'gameover': [7, 4, 0, -5].forEach((n, i) => this.tone(392 * semis(n), 0.35, { type: 'triangle', vol: 0.15, at: i * 0.22 })); break;
        default: break;
      }
    }
  }

  squeak() {
    this.tone(900, 0.13, { type: 'sine', vol: 0.18, slide: 1500 });
    this.tone(1500, 0.08, { type: 'sine', vol: 0.08, slide: 1100, at: 0.08 });
  }

  fanfare(at) {
    [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => {
      this.tone(523 * semis(n), i === 6 ? 0.6 : 0.16, { type: 'square', vol: 0.09, at: at + i * 0.1 });
      this.tone(261 * semis(n), i === 6 ? 0.6 : 0.16, { type: 'triangle', vol: 0.1, at: at + i * 0.1 });
    });
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const bpm = this.song.boss ? 128 : 108;
    const stepDur = 60 / bpm / 2;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime - c.currentTime, stepDur);
      this.step = (this.step + 1) % 32;
      this.nextTime += stepDur;
    }
  }

  playStep(step, at, dur) {
    if (!this.musicOn || this.musicLevel === 0) return;
    const prog = PROGRESSIONS[this.song.boss ? 'boss' : 'calm'];
    const [root, q] = prog[Math.floor(step / 8) % 4];
    const key = 220 * semis(this.song.key + root);
    const chord = TRIAD[q];
    const s = step % 8;
    const m = this.music;
    if (s === 0 || s === 3 || s === 6) this.tone(key / 2, dur * (s === 6 ? 2 : 1.6), { type: 'triangle', vol: 0.5, at, dest: m });
    this.tone(key * 2 * semis(chord[ARP[s]]), dur * 0.9, { type: 'square', vol: 0.09, at, dest: m, attack: 0.01 });
    if (s % 2 === 1) this.noise(0.04, { freq: 7000, type: 'highpass', vol: 0.08, at, dest: m });
    if (this.song.boss && s % 4 === 0) this.noise(0.12, { freq: 180, vol: 0.35, at, dest: m });
    if (step % 16 === 0) this.tone(key * semis(chord[1]), dur * 7, { type: 'sine', vol: 0.12, at, dest: m, attack: 0.3 });
  }
}
