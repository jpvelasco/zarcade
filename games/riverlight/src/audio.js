// Generative ambient music and soft sound effects, all WebAudio.
//
// The pad holds four voices on a slow chord cycle. Only the root sings at
// first; the other voices fade in as flowers bloom, so the music fills out
// as the stream connects. Pentatonic chimes drift over the top.

const SEASON_KEYS = {
  spring: 146.83, // D3
  summer: 174.61, // F3
  autumn: 110.0, // A2
  winter: 164.81, // E3
  night: 130.81, // C3
  lotus: 196.0, // G3
};
const CHORDS = [
  [0, 7, 11, 16],
  [-3, 4, 9, 12],
  [5, 12, 16, 21],
  [2, 9, 14, 17],
];
const PENTA = [0, 2, 4, 7, 9];
const semi = (root, s) => root * 2 ** (s / 12);

export class Audio {
  constructor({ muted = false, sound = true, music = true } = {}) {
    this.muted = muted;
    this.sound = sound;
    this.music = music;
    this.ctx = null;
    this.root = SEASON_KEYS.spring;
    this.harmony = 0;
    this.voices = null;
    this.chord = 0;
    this.timers = [];
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sound ? 1 : 0;
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.music ? 1 : 0;
      this.musicBus.connect(this.master);
      // a soft generated hall
      // The impulse response is filled in slices after this frame, so
      // unlocking audio never hitches the first tap.
      this.reverb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 2);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      const slice = Math.ceil(len / 8);
      let from = 0;
      const fill = () => {
        const to = Math.min(len, from + slice);
        for (let ch = 0; ch < 2; ch++) {
          const data = ir.getChannelData(ch);
          for (let i = from; i < to; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
        }
        from = to;
        if (from < len) setTimeout(fill, 16);
        else this.reverb.buffer = ir;
      };
      setTimeout(fill, 60);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.5;
      this.reverb.connect(this.wet);
      this.wet.connect(this.master);
      const nlen = Math.floor(ctx.sampleRate * 0.06);
      this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.music && !this.voices) this.startMusic();
  }

  // Master mute: silences effects, chimes and the pad together.
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setSound(on) {
    this.sound = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.music = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.4);
    if (on && !this.voices) this.startMusic();
    if (!on) setTimeout(() => { if (!this.music) this.stopMusic(); }, 1500);
  }

  setSeason(key) {
    this.root = SEASON_KEYS[key] || SEASON_KEYS.spring;
    this.applyChord();
  }

  // 0..1: how much of the garden is in bloom.
  setHarmony(h) {
    this.harmony = Math.max(0, Math.min(1, h));
    this.applyGains();
  }

  startMusic() {
    if (!this.ctx || this.voices) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.11;
    filter.connect(padGain);
    padGain.connect(this.musicBus);
    padGain.connect(this.reverb);
    this.voices = CHORDS[0].map(() => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(filter);
      const oscs = [-6, 6].map((detune) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.detune.value = detune;
        o.frequency.value = this.root;
        o.connect(g);
        o.start();
        return o;
      });
      return { g, oscs };
    });
    this.padNodes = { filter, padGain };
    this.chord = 0;
    this.applyChord();
    this.applyGains();
    const cycle = () => {
      this.chord = (this.chord + 1) % CHORDS.length;
      this.applyChord();
    };
    this.timers.push(setInterval(cycle, 9000));
    const chimeLoop = () => {
      if (!this.voices) return;
      if (this.music && this.ctx.state === 'running') this.ambientChime();
      const wait = 5200 - this.harmony * 2800 + Math.random() * 2500;
      this.timers.push(setTimeout(chimeLoop, wait));
    };
    this.timers.push(setTimeout(chimeLoop, 2000));
  }

  stopMusic() {
    for (const t of this.timers) {
      clearInterval(t);
      clearTimeout(t);
    }
    this.timers = [];
    if (!this.voices) return;
    for (const v of this.voices) for (const o of v.oscs) o.stop();
    this.padNodes.padGain.disconnect();
    this.voices = null;
  }

  applyChord() {
    if (!this.voices) return;
    const now = this.ctx.currentTime;
    CHORDS[this.chord].forEach((s, k) => {
      const f = semi(this.root, s);
      for (const o of this.voices[k].oscs) o.frequency.setTargetAtTime(f, now, 1.2);
    });
  }

  applyGains() {
    if (!this.voices) return;
    const now = this.ctx.currentTime;
    this.voices.forEach((v, k) => {
      const on = k === 0 ? 1 : Math.max(0, Math.min(1, this.harmony * 3 - (k - 1)));
      v.g.gain.setTargetAtTime(k === 0 ? 0.6 : on * 0.5, now, 1.6);
    });
  }

  bell(freq, { when = 0, gain = 0.18, decay = 1.6, bus = 'sfx', wet = 0.6 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    g.connect(bus === 'music' ? this.musicBus : this.sfx);
    const send = ctx.createGain();
    send.gain.value = wet;
    g.connect(send);
    send.connect(this.reverb);
    for (const [mult, amp, type] of [[1, 1, 'sine'], [2.01, 0.25, 'sine'], [3.0, 0.08, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  ambientChime() {
    const deg = PENTA[Math.floor(Math.random() * PENTA.length)];
    const oct = 24 + (Math.random() < 0.4 ? 12 : 0);
    this.bell(semi(this.root, deg + oct), { gain: 0.05 + this.harmony * 0.04, decay: 3, bus: 'music', wet: 1 });
  }

  // A soft wooden tock as a stone turns.
  click(dir = 1) {
    if (!this.ctx || !this.sound) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (dir > 0 ? 2100 : 1700) * (0.95 + Math.random() * 0.1);
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    src.start(t);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(dir > 0 ? 330 : 280, t);
    o.frequency.exponentialRampToValueAtTime(dir > 0 ? 220 : 190, t + 0.07);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.16, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og);
    og.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.1);
  }

  // Flower k of total blooms: notes climb the scale as more connect.
  bloom(k) {
    const deg = PENTA[k % PENTA.length] + 12 * Math.floor(k / PENTA.length);
    this.bell(semi(this.root, deg + 24), { gain: 0.14, decay: 2.2 });
  }

  bump() {
    if (!this.ctx) return;
    this.bell(semi(this.root, 12), { gain: 0.05, decay: 0.3, wet: 0.2 });
  }

  hint() {
    this.bell(semi(this.root, 31), { gain: 0.07, decay: 1.2 });
    this.bell(semi(this.root, 36), { gain: 0.05, decay: 1.4, when: 0.12 });
  }

  solved() {
    const notes = [0, 4, 7, 12, 16, 19, 24];
    notes.forEach((s, k) => this.bell(semi(this.root, s + 24), { when: k * 0.11, gain: 0.12, decay: 2.8 }));
    this.bell(semi(this.root, 12), { when: 0, gain: 0.08, decay: 4 });
  }
}
