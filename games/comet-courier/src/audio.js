// All sound is synthesized with Web Audio; there are no audio files.
// Soft post-office chimes: a launch whoosh, settle thock, a star bell, and
// a gentle step-sequencer loop per world.
const PENTA = [0, 2, 4, 7, 9];
const semis = (n) => Math.pow(2, n / 12);

const PROGRESSIONS = {
  calm: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']],
  night: [[0, 'min'], [7, 'maj'], [5, 'maj'], [9, 'min']],
};
const KEYS = [0, 3, -2, 5, 2]; // one key per world
const TRIAD = { maj: [0, 4, 7, 12], min: [0, 3, 7, 12] };
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.song = { key: 0, night: false };
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

  setSong(world) {
    this.song = { key: KEYS[world % KEYS.length], night: world >= 3 };
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

  // ------------------------------------------------------------ events

  launch(power) {
    if (!this.ctx || this.muted) return;
    const f = 320 + power * 420;
    this.tone(f, 0.18, { type: 'triangle', vol: 0.16, slide: f * 2.4 });
    this.noise(0.12, { freq: 2400, to: 500, vol: 0.1 });
  }

  settle() {
    if (!this.ctx || this.muted) return;
    this.tone(220, 0.09, { type: 'sine', vol: 0.18, slide: 140 });
  }

  parTick(n) {
    if (!this.ctx || this.muted) return;
    this.tone(523 * semis(PENTA[(n - 1) % 5]), 0.12, { type: 'triangle', vol: 0.1 });
  }

  star() {
    if (!this.ctx || this.muted) return;
    [0, 7, 12, 19, 24].forEach((n, i) => this.tone(880 * semis(n), 0.16, { type: 'triangle', vol: 0.12, at: i * 0.05 }));
  }

  win() {
    if (!this.ctx || this.muted) return;
    [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => {
      this.tone(523 * semis(n), i === 6 ? 0.6 : 0.16, { type: 'square', vol: 0.08, at: i * 0.1 });
      this.tone(261 * semis(n), i === 6 ? 0.6 : 0.16, { type: 'triangle', vol: 0.1, at: i * 0.1 });
    });
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const bpm = this.song.night ? 118 : 100;
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
    const prog = PROGRESSIONS[this.song.night ? 'night' : 'calm'];
    const [root, q] = prog[Math.floor(step / 8) % 4];
    const key = 220 * semis(this.song.key + root);
    const chord = TRIAD[q];
    const s = step % 8;
    const m = this.music;
    if (s === 0 || s === 3 || s === 6) this.tone(key / 2, dur * (s === 6 ? 2 : 1.6), { type: 'triangle', vol: 0.5, at, dest: m });
    this.tone(key * 2 * semis(chord[ARP[s]]), dur * 0.9, { type: 'square', vol: 0.07, at, dest: m, attack: 0.01 });
    if (s % 2 === 1) this.noise(0.04, { freq: 7000, type: 'highpass', vol: 0.05, at, dest: m });
    if (step % 16 === 0) this.tone(key * semis(chord[1]), dur * 7, { type: 'sine', vol: 0.1, at, dest: m, attack: 0.3 });
  }
}
