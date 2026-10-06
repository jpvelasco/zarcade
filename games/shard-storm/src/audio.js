// All sound is synthesized with Web Audio; there are no audio files.
// Slice notes climb a pentatonic scale as the combo grows; a step
// sequencer keeps a driving neon loop under the storm.
const PENTA = [0, 2, 4, 7, 9];
const semis = (n) => Math.pow(2, n / 12);

const PROGRESSIONS = [
  [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']],
  [[0, 'min'], [7, 'maj'], [5, 'maj'], [10, 'maj']],
];
const KEYS = [0, 4, -2, 5];
const TRIAD = { maj: [0, 4, 7, 12], min: [0, 3, 7, 12] };
const ARP = [0, 2, 1, 2, 0, 2, 3, 2];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.song = { key: 0, hot: false };
    this.musicLevel = 0.5;
    this.step = 0;
    this.nextTime = 0;
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
      lp.frequency.value = 2800;
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

  // `hot` raises the tempo and adds a noise hit — the storm is picking up.
  setSong(level, hot = false) {
    this.song = { key: KEYS[Math.floor(level / 3) % KEYS.length], hot };
  }

  // ------------------------------------------------------------ primitives

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = null, at = 0, attack = 0.004, dest = null } = {}) {
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
        case 'shard': {
          if (blips++ > 2) break;
          const f = this.comboNote(e.combo);
          this.tone(f, 0.1, { type: 'square', vol: 0.11 });
          this.tone(f * 2, 0.16, { type: 'triangle', vol: 0.08 });
          this.noise(0.08, { freq: 4000, type: 'highpass', vol: 0.1 });
          break;
        }
        case 'shell':
          this.tone(1400, 0.1, { type: 'triangle', vol: 0.14, slide: 700 });
          this.noise(0.1, { freq: 2500, to: 600, vol: 0.18 });
          break;
        case 'mine':
          this.noise(0.4, { freq: 1200, to: 90, vol: 0.4 });
          this.tone(120, 0.32, { type: 'sawtooth', vol: 0.3, slide: 45 });
          break;
        case 'wave':
          this.tone(220, 0.14, { type: 'square', vol: 0.07, slide: 440 });
          this.tone(330, 0.14, { type: 'square', vol: 0.06, slide: 660, at: 0.08 });
          break;
        case 'go':
          this.tone(660, 0.16, { type: 'square', vol: 0.1, slide: 990 });
          break;
        case 'slowStart':
          this.tone(220, 0.35, { type: 'sine', vol: 0.09, slide: 880 });
          this.noise(0.3, { freq: 500, to: 2400, vol: 0.08, type: 'bandpass', q: 2 });
          break;
        case 'slowEnd':
          this.tone(880, 0.24, { type: 'sine', vol: 0.08, slide: 392 });
          break;
        case 'drop': this.tone(420, 0.09, { type: 'triangle', vol: 0.05, slide: 210 }); break;
        case 'dailyClear':
          [0, 4, 7, 12].forEach((n, i) => this.tone(880 * semis(n), 0.14, { type: 'triangle', vol: 0.09, at: i * 0.06 }));
          break;
        case 'gameover': [7, 4, 0, -5].forEach((n, i) => this.tone(392 * semis(n), 0.34, { type: 'triangle', vol: 0.15, at: i * 0.22 })); break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const bpm = this.song.hot ? 132 : 112;
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
    const prog = PROGRESSIONS[this.song.hot ? 1 : 0];
    const [root, q] = prog[Math.floor(step / 8) % 4];
    const key = 220 * semis(this.song.key + root);
    const chord = TRIAD[q];
    const s = step % 8;
    const m = this.music;
    if (s === 0 || s === 3 || s === 6) this.tone(key / 2, dur * (s === 6 ? 2 : 1.6), { type: 'triangle', vol: 0.5, at, dest: m });
    this.tone(key * 2 * semis(chord[ARP[s]]), dur * 0.9, { type: 'square', vol: 0.09, at, dest: m, attack: 0.01 });
    if (s % 2 === 1) this.noise(0.04, { freq: 7000, type: 'highpass', vol: 0.08, at, dest: m });
    if (this.song.hot && s % 4 === 0) this.noise(0.1, { freq: 220, vol: 0.3, at, dest: m });
    if (step % 16 === 0) this.tone(key * semis(chord[1]), dur * 7, { type: 'sine', vol: 0.12, at, dest: m, attack: 0.3 });
  }
}
