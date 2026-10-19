// All sound is synthesized with Web Audio. A soft music loop changes key and
// tempo with the layer; the drill and propeller hum while in use.
const semis = (n) => Math.pow(2, n / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
// Per layer: key (semitones from A3), tempo, wave.
const SONGS = [
  { key: 3, bpm: 104, wave: 'triangle' },   // meadow
  { key: 0, bpm: 98, wave: 'triangle' },    // clay
  { key: -2, bpm: 92, wave: 'sine' },       // rock
  { key: 5, bpm: 88, wave: 'sine' },        // crystal
  { key: 2, bpm: 84, wave: 'triangle' },    // grotto
  { key: -4, bpm: 90, wave: 'sine' },       // lava
  { key: 7, bpm: 80, wave: 'sine' },        // ruins
];
const MELODY = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 3, 2];
const BASS = [0, 0, 5, 5, 3, 3, 4, 4];

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.layer = 0;
    this.level = 0.5;
    this.step = 0;
    this.nextTime = 0;
    this.last = {};
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
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.6;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      this.music.connect(lp).connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // Continuous drill rumble and propeller buzz, faded in and out.
      this.drill = this.loopNoise(260, 'bandpass', 3);
      this.drillTone = c.createOscillator();
      this.drillTone.type = 'sawtooth';
      this.drillTone.frequency.value = 70;
      const dtg = c.createGain();
      dtg.gain.value = 0.05;
      this.drillTone.connect(dtg).connect(this.drill.gain);
      this.drillTone.start();
      this.prop = this.loopNoise(900, 'bandpass', 6);
      this.propTone = c.createOscillator();
      this.propTone.type = 'square';
      this.propTone.frequency.value = 48;
      const ptg = c.createGain();
      ptg.gain.value = 0.025;
      this.propTone.connect(ptg).connect(this.prop.gain);
      this.propTone.start();
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 80);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  loopNoise(freq, type, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
    return { src, filter: f, gain: g };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  setMusic(on) { this.musicOn = on; this.applyMusic(); }

  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    this.applyMusic();
  }

  setLayer(li) { this.layer = Math.max(0, Math.min(SONGS.length - 1, li)); }

  applyMusic() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.16 * this.level : 0, this.ctx.currentTime, 0.4);
  }

  // Hums follow the pod each frame.
  hum({ drilling = false, hard = 1, flying = false } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.drill.gain.gain.setTargetAtTime(drilling ? 0.32 : 0, t, drilling ? 0.03 : 0.08);
    this.drill.filter.frequency.setTargetAtTime(380 - hard * 35, t, 0.05);
    this.drillTone.frequency.setTargetAtTime(60 + hard * 6 + (drilling ? Math.random() * 6 : 0), t, 0.05);
    this.prop.gain.gain.setTargetAtTime(flying ? 0.12 : 0, t, flying ? 0.05 : 0.12);
  }

  schedule() {
    const c = this.ctx;
    if (!c || !this.musicOn) return;
    const song = SONGS[this.layer];
    const spb = 60 / song.bpm / 2; // eighth notes
    while (this.nextTime < c.currentTime + 0.3) {
      const s = this.step++;
      const t = this.nextTime;
      const root = 220 * semis(song.key);
      if (s % 2 === 0) {
        const m = MELODY[(s / 2) % MELODY.length];
        if (!(s % 16 === 14)) this.note(root * semis(PENTA[m % PENTA.length]) * 2, t, spb * 1.8, song.wave, 0.08, this.music);
      }
      if (s % 4 === 0) this.note(root * semis(PENTA[BASS[(s / 4) % BASS.length]] - 12), t, spb * 3.5, 'sine', 0.12, this.music);
      if (s % 8 === 4) this.note(root * semis(PENTA[(Math.floor(s / 8) + 3) % 6] + 12), t, spb * 0.8, 'sine', 0.035, this.music);
      this.nextTime += spb;
    }
  }

  note(freq, t, dur, type = 'sine', vol = 0.2, dest = this.sfx, slide = 0) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(t, dur, freq, vol = 0.2, type = 'bandpass', q = 1, slideTo = 0) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  throttle(name, gap) {
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  }

  play(name, arg = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'gem': {
        const k = Math.min(7, Math.floor(Math.log2(1 + arg / 5)));
        this.note(660 * semis(PENTA[k]), t, 0.18, 'triangle', 0.18);
        this.note(990 * semis(PENTA[k]), t + 0.06, 0.22, 'sine', 0.12);
        break;
      }
      case 'dug': if (this.throttle('dug', 0.05)) this.noise(t, 0.12, 500, 0.12, 'lowpass', 1); break;
      case 'full': this.note(220, t, 0.15, 'square', 0.06); this.note(180, t + 0.1, 0.2, 'square', 0.06); break;
      case 'blocked': if (this.throttle('blocked', 0.3)) { this.note(110, t, 0.12, 'square', 0.09, this.sfx, 0.7); this.noise(t, 0.08, 1200, 0.1); } break;
      case 'gas': this.noise(t, 0.5, 2200, 0.25, 'bandpass', 0.8, 400); this.note(300, t, 0.3, 'sine', 0.08, this.sfx, 0.5); break;
      case 'wobble': if (this.throttle('wobble', 0.4)) for (let i = 0; i < 6; i++) this.noise(t + i * 0.12, 0.06, 300 + i * 20, 0.1, 'bandpass', 3); break;
      case 'thud': this.note(80, t, 0.3, 'sine', 0.3, this.sfx, 0.5); this.noise(t, 0.2, 200, 0.2, 'lowpass'); break;
      case 'bonk': this.note(240, t, 0.18, 'square', 0.12, this.sfx, 0.4); this.note(70, t, 0.3, 'sine', 0.3, this.sfx, 0.6); break;
      case 'hot': if (this.throttle('hot', 0.4)) this.noise(t, 0.35, 4000, 0.15, 'highpass', 0.5); break;
      case 'cool': if (this.throttle('cool', 0.25)) this.noise(t, 0.5, 3000, 0.16, 'highpass', 0.5, 6000); break;
      case 'boing': this.note(180, t, 0.35, 'sine', 0.25, this.sfx, 3); break;
      case 'thump': if (this.throttle('thump', 0.2)) this.note(90, t, 0.15, 'sine', 0.2, this.sfx, 0.6); break;
      case 'fuel': for (let i = 0; i < 3; i++) this.note(300 + i * 60, t + i * 0.07, 0.1, 'sine', 0.15); break;
      case 'relic':
        [0, 4, 7, 12, 16].forEach((n, i) => this.note(523 * semis(n), t + i * 0.09, 0.4, 'triangle', 0.16));
        break;
      case 'sell': {
        const n = Math.min(10, 3 + Math.floor(arg / 4));
        for (let i = 0; i < n; i++) this.note(1200 + (i % 3) * 200, t + i * 0.05, 0.12, 'square', 0.05);
        this.note(523, t + n * 0.05, 0.3, 'triangle', 0.14);
        break;
      }
      case 'buy': [0, 4, 7, 12].forEach((n, i) => this.note(440 * semis(n), t + i * 0.08, 0.3, 'triangle', 0.16)); break;
      case 'no': this.note(200, t, 0.12, 'square', 0.07); this.note(150, t + 0.1, 0.18, 'square', 0.07); break;
      case 'milestone': [0, 7, 12, 16, 19].forEach((n, i) => this.note(392 * semis(n), t + i * 0.1, 0.45, 'triangle', 0.15)); break;
      case 'worm':
        this.note(300, t, 0.4, 'sine', 0.18, this.sfx, 2.2);
        this.note(600, t + 0.45, 0.3, 'sine', 0.14, this.sfx, 0.5);
        break;
      case 'stranded': this.note(330, t, 0.3, 'triangle', 0.14, this.sfx, 0.6); this.note(247, t + 0.25, 0.4, 'triangle', 0.14, this.sfx, 0.7); break;
      case 'core':
        [0, 4, 7, 11, 12, 16, 19, 24].forEach((n, i) => this.note(330 * semis(n), t + i * 0.12, 0.7, 'triangle', 0.15));
        this.note(110, t, 1.6, 'sine', 0.2);
        break;
      case 'lowfuel': this.note(880, t, 0.08, 'square', 0.06); this.note(880, t + 0.14, 0.08, 'square', 0.06); break;
      case 'ui': this.note(700, t, 0.06, 'triangle', 0.08); break;
      case 'win': [0, 4, 7, 12, 16, 12, 16, 19].forEach((n, i) => this.note(392 * semis(n), t + i * 0.1, 0.35, 'triangle', 0.15)); break;
      default: break;
    }
  }
}
