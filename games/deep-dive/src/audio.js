// WebAudio sound: soft synthesized effects and a calm ambient score that
// shifts with each area. No files, no external assets.

const AREA_MUSIC = [
  { root: 60, scale: [0, 2, 4, 7, 9], tempo: 84, pad: 'triangle', bright: 2400 }, // shallows: C major pentatonic
  { root: 57, scale: [0, 2, 4, 7, 9], tempo: 76, pad: 'triangle', bright: 1900 }, // kelp
  { root: 55, scale: [0, 3, 5, 7, 10], tempo: 70, pad: 'sine', bright: 1500 }, // wreck: minor pentatonic
  { root: 62, scale: [0, 2, 4, 7, 9], tempo: 90, pad: 'triangle', bright: 2600 }, // coral
  { root: 50, scale: [0, 2, 3, 7, 10], tempo: 58, pad: 'sine', bright: 1100 }, // twilight
  { root: 45, scale: [0, 3, 5, 7, 10], tempo: 52, pad: 'sine', bright: 900 }, // trench
  { root: 48, scale: [0, 1, 5, 7, 10], tempo: 64, pad: 'sine', bright: 1200 }, // vent
];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.area = 0;
    this.level = 0.5;
    this.nextNote = 0;
    this.step = 0;
    this.timer = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.32 * this.level : 0;
    // A soft echo for the "underwater" feel.
    this.delay = c.createDelay(1);
    this.delay.delayTime.value = 0.32;
    this.fb = c.createGain();
    this.fb.gain.value = 0.35;
    this.wet = c.createGain();
    this.wet.gain.value = 0.35;
    this.delay.connect(this.fb); this.fb.connect(this.delay);
    this.delay.connect(this.wet); this.wet.connect(this.master);
    this.musicFilter = c.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2000;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.master);
    this.musicFilter.connect(this.delay);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextNote = c.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 120);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusic();
  }

  setMusicLevel(level) {
    this.level = level;
    this.applyMusic();
  }

  applyMusic() {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.32 * this.level : 0, this.ctx.currentTime, 0.4);
  }

  setArea(a) {
    if (a === this.area) return;
    this.area = a;
    if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(AREA_MUSIC[a].bright, this.ctx.currentTime, 1.5);
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const m = AREA_MUSIC[this.area] || AREA_MUSIC[0];
    const beat = 60 / m.tempo / 2;
    while (this.nextNote < c.currentTime + 0.4) {
      const t = this.nextNote;
      const bar = Math.floor(this.step / 16);
      const pos = this.step % 16;
      const chords = [0, 3, 4, 2];
      const deg = chords[bar % 4];
      if (pos === 0) {
        // Pad chord: three soft notes that swell and fade over the bar.
        for (const k of [0, 2, 4]) {
          const n = m.root - 12 + m.scale[(deg + k) % 5] + (deg + k >= 5 ? 12 : 0);
          this.tone(midi(n), t, beat * 16, { type: m.pad, gain: 0.06, attack: beat * 4, bus: this.musicBus });
        }
        this.tone(midi(m.root - 24 + m.scale[deg]), t, beat * 14, { type: 'sine', gain: 0.08, attack: 0.3, bus: this.musicBus });
      }
      // Sparse twinkly melody, like light on water.
      const h = Math.sin(this.step * 12.9898 + bar * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      if ((pos % 2 === 0 && r < 0.42) || (pos % 2 === 1 && r < 0.12)) {
        const idx = Math.floor(r * 100) % 7;
        const n = m.root + m.scale[(deg + idx) % 5] + (idx >= 4 ? 12 : 0);
        this.tone(midi(n), t, beat * 1.8, { type: 'sine', gain: 0.07, attack: 0.01, bus: this.musicBus });
      }
      this.step++;
      this.nextNote += beat;
    }
  }

  tone(freq, t, dur, { type = 'sine', gain = 0.2, attack = 0.005, bus = null, slide = 0, echo = false } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || this.sfx);
    if (echo) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(t, dur, { gain = 0.2, freq = 800, q = 1, type = 'bandpass' } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ effects

  play(name, opts = {}) {
    const c = this.ctx;
    if (!c || this.muted || c.state !== 'running') return;
    const t = c.currentTime + 0.01;
    switch (name) {
      case 'sonar':
        this.tone(1320, t, 0.5, { gain: 0.16, slide: 0.5, echo: true });
        this.tone(660, t + 0.02, 0.6, { gain: 0.06, type: 'triangle', echo: true });
        break;
      case 'scan':
        [0, 4, 7, 12].forEach((s, i) => this.tone(midi(76 + s), t + i * 0.07, 0.35, { gain: 0.12, type: 'triangle', echo: i === 3 }));
        break;
      case 'scan-again':
        this.tone(midi(84), t, 0.25, { gain: 0.08, type: 'triangle' });
        break;
      case 'tick':
        this.tone(1800 + (opts.f || 0) * 900, t, 0.04, { gain: 0.03, type: 'square' });
        break;
      case 'treasure':
        [0, 7, 12, 16, 19].forEach((s, i) => this.tone(midi(79 + s), t + i * 0.05, 0.3, { gain: 0.1, type: 'triangle' }));
        break;
      case 'shell':
        [0, 4, 7, 11, 14, 19].forEach((s, i) => this.tone(midi(81 + s), t + i * 0.06, 0.5, { gain: 0.1, type: 'sine', echo: true }));
        break;
      case 'part':
        [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(midi(67 + s), t + i * 0.1, 0.45, { gain: 0.13, type: i % 2 ? 'triangle' : 'square', echo: i === 6 }));
        break;
      case 'heart':
        [0, 4, 7, 11, 12, 16, 19, 24].forEach((s, i) => this.tone(midi(64 + s), t + i * 0.12, 0.9, { gain: 0.11, type: 'triangle', echo: true }));
        break;
      case 'bump':
        this.tone(110, t, 0.18, { gain: 0.18 * (0.5 + (opts.power || 0.5)), type: 'sine', slide: 0.5 });
        this.noiseBurst(t, 0.12, { gain: 0.12, freq: 300 });
        break;
      case 'gate-coral':
        for (let i = 0; i < 6; i++) this.noiseBurst(t + i * 0.06, 0.08, { gain: 0.12, freq: 1400 + i * 200, q: 3 });
        this.tone(220, t, 0.4, { gain: 0.08, type: 'sawtooth', slide: 2 });
        break;
      case 'gate-hatch':
        this.tone(140, t, 0.6, { gain: 0.1, type: 'sawtooth', slide: 0.7 });
        this.noiseBurst(t + 0.3, 0.3, { gain: 0.14, freq: 500 });
        break;
      case 'dock':
        this.tone(midi(72), t, 0.25, { gain: 0.1, type: 'triangle' });
        this.tone(midi(79), t + 0.12, 0.4, { gain: 0.1, type: 'triangle', echo: true });
        break;
      case 'low':
        this.tone(midi(69), t, 0.18, { gain: 0.07, type: 'sine' });
        this.tone(midi(65), t + 0.2, 0.25, { gain: 0.07, type: 'sine' });
        break;
      case 'out':
        [12, 7, 4, 0].forEach((s, i) => this.tone(midi(60 + s), t + i * 0.14, 0.4, { gain: 0.1, type: 'triangle' }));
        break;
      case 'hint':
        this.tone(midi(62), t, 0.15, { gain: 0.06, type: 'sine' });
        this.tone(midi(57), t + 0.12, 0.2, { gain: 0.06, type: 'sine' });
        break;
      case 'area':
        this.noiseBurst(t, 0.8, { gain: 0.06, freq: 600, type: 'lowpass' });
        this.tone(midi(67), t + 0.1, 0.8, { gain: 0.05, type: 'sine', echo: true });
        break;
      case 'reveal':
        this.tone(midi(88), t, 0.2, { gain: 0.06, type: 'sine', slide: 0.8 });
        break;
      case 'click':
        this.tone(midi(84), t, 0.06, { gain: 0.05, type: 'triangle' });
        break;
      case 'daily':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(midi(72 + s), t + i * 0.07, 0.5, { gain: 0.1, type: 'triangle', echo: i === 6 }));
        break;
      default:
        break;
    }
  }

  handle(events) {
    for (const e of events) {
      if (e.type === 'sonar') this.play('sonar');
      else if (e.type === 'scan') this.play(e.first ? 'scan' : 'scan-again');
      else if (e.type === 'treasure') this.play('treasure');
      else if (e.type === 'shell') this.play('shell');
      else if (e.type === 'part') this.play('part');
      else if (e.type === 'heart') this.play('heart');
      else if (e.type === 'bump') this.play('bump', { power: e.power });
      else if (e.type === 'gate') this.play(e.kind === 'coral' ? 'gate-coral' : 'gate-hatch');
      else if (e.type === 'dock') this.play('dock');
      else if (e.type === 'oxygen.out') this.play('out');
      else if (e.type === 'hint') this.play('hint');
      else if (e.type === 'area') { this.setArea(e.area); if (e.first) this.play('area'); }
      else if (e.type === 'reveal') this.play('reveal');
    }
  }
}
