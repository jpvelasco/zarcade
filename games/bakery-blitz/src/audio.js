// Every sound is made with Web Audio; there are no audio files. A warm little
// kitchen waltz underneath, bells and clinks on top.
const note = (semi, base = 220) => base * Math.pow(2, semi / 12);

// A gentle major-key waltz in three parts: bass, marimba melody, soft pad.
const MELODY = [
  0, 4, 7, 12, 7, 4, 2, 5, 9, 14, 9, 5,
  4, 7, 11, 16, 11, 7, 5, 9, 12, 17, 12, 9,
];
const BASS = [0, -5, -3, -7, 0, -5, -3, -7];

export class Sfx {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.musicOn = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.tempo = 0.26;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.58;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.3;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 1.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.58;
  }

  get t() {
    return this.ctx.currentTime;
  }

  // ----------------------------------------------------------- the building

  tone({ freq = 440, type = 'sine', at = 0, dur = 0.2, gain = 0.2, glide = 0, out = null, detune = 0 }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t0 + dur);
    if (detune) osc.detune.value = detune;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(out || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noiseHit({ at = 0, dur = 0.2, gain = 0.2, freq = 900, q = 1, type = 'bandpass', sweep = 1 }) {
    if (!this.ctx) return;
    const t0 = this.t + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweep !== 1) filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + dur);
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------- the cues

  // Something started: a whisk and a soft wooden click.
  start() {
    this.noiseHit({ dur: 0.16, gain: 0.08, freq: 1200, q: 1.2, sweep: 0.5 });
    this.tone({ freq: 300, type: 'triangle', dur: 0.1, gain: 0.1, glide: 1.3 });
  }

  // Something moved along the line.
  move() {
    this.noiseHit({ dur: 0.18, gain: 0.07, freq: 500, q: 0.8, sweep: 2.6 });
    this.tone({ freq: 420, type: 'sine', dur: 0.12, gain: 0.08, glide: 1.5 });
  }

  // The timer is up.
  ding(oven = false) {
    const base = oven ? 880 : 1046;
    this.tone({ freq: base, type: 'sine', dur: 0.45, gain: 0.16 });
    this.tone({ freq: base * 1.5, type: 'sine', at: 0.06, dur: 0.38, gain: 0.1 });
    this.noiseHit({ dur: 0.1, gain: 0.05, freq: 3200, q: 2 });
  }

  // A dish landed in the display case.
  plate() {
    this.tone({ freq: 1320, type: 'triangle', dur: 0.14, gain: 0.1 });
    this.noiseHit({ dur: 0.1, gain: 0.06, freq: 2600, q: 3, sweep: 0.6 });
  }

  // Handed over: coins, and a chime that climbs with the combo.
  serve(combo = 1, crispy = false) {
    const semi = [0, 4, 7, 11, 14][Math.min(4, Math.max(0, combo - 1))];
    this.tone({ freq: note(semi + 24), type: 'triangle', dur: 0.24, gain: 0.16 });
    this.tone({ freq: note(semi + 31), type: 'sine', at: 0.05, dur: 0.22, gain: 0.1 });
    if (crispy) {
      this.noiseHit({ dur: 0.22, gain: 0.08, freq: 700, q: 0.7, sweep: 0.4 });
      return;
    }
    this.noiseHit({ at: 0.02, dur: 0.12, gain: 0.07, freq: 4200, q: 4, sweep: 1.4 });
  }

  // A customer leaves pleased.
  happy() {
    [0, 4, 7].forEach((semi, i) => {
      this.tone({ freq: note(semi + 24), type: 'sine', at: i * 0.07, dur: 0.3, gain: 0.12 });
    });
  }

  // A heart went out. Soft, never scolding.
  heart() {
    this.tone({ freq: 360, type: 'sine', dur: 0.22, gain: 0.1, glide: 0.76 });
  }

  // A customer gave up and waved goodbye.
  goodbye() {
    this.tone({ freq: 440, type: 'triangle', dur: 0.26, gain: 0.1, glide: 0.72 });
    this.tone({ freq: 330, type: 'sine', at: 0.12, dur: 0.3, gain: 0.08, glide: 0.8 });
  }

  // Something is catching colour in the oven.
  sizzle() {
    this.noiseHit({ dur: 0.5, gain: 0.07, freq: 2400, q: 0.6, sweep: 0.3 });
  }

  crispy() {
    this.noiseHit({ dur: 0.4, gain: 0.1, freq: 900, q: 0.5, sweep: 0.3 });
    this.tone({ freq: 190, type: 'triangle', dur: 0.3, gain: 0.1, glide: 0.7 });
  }

  // Nothing to do here.
  bonk() {
    this.tone({ freq: 160, type: 'triangle', dur: 0.12, gain: 0.09, glide: 0.8 });
  }

  tidy() {
    this.noiseHit({ dur: 0.2, gain: 0.06, freq: 1800, q: 1.4, sweep: 2 });
  }

  // Last ten seconds.
  closing() {
    this.tone({ freq: 660, type: 'sine', dur: 0.5, gain: 0.14 });
    this.tone({ freq: 880, type: 'sine', at: 0.18, dur: 0.5, gain: 0.1 });
  }

  star(index = 0) {
    const semi = [0, 4, 7, 12][Math.min(3, index)];
    this.tone({ freq: note(semi + 31), type: 'sine', dur: 0.4, gain: 0.14 });
    this.tone({ freq: note(semi + 24), type: 'triangle', at: 0.02, dur: 0.3, gain: 0.1 });
  }

  fanfare(stars = 1) {
    const run = stars >= 3 ? [0, 4, 7, 12, 16] : stars === 2 ? [0, 4, 7, 12] : [0, 5, 9];
    run.forEach((semi, i) => {
      this.tone({ freq: note(semi + 12), type: 'triangle', at: i * 0.1, dur: 0.38, gain: 0.14 });
      this.tone({ freq: note(semi + 24), type: 'sine', at: i * 0.1 + 0.02, dur: 0.3, gain: 0.08 });
    });
  }

  coin() {
    this.tone({ freq: 1568, type: 'triangle', dur: 0.12, gain: 0.1 });
    this.tone({ freq: 2093, type: 'sine', at: 0.05, dur: 0.14, gain: 0.07 });
  }

  click() {
    this.noiseHit({ dur: 0.06, gain: 0.05, freq: 2000, q: 2 });
  }

  // --------------------------------------------------------------- the song

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.t + 0.1;
    const pump = () => {
      if (!this.musicOn || !this.ctx) return;
      while (this.nextTime < this.t + 0.4) this.schedule();
    };
    pump();
    this.timer = setInterval(pump, 120);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const at = this.nextTime - this.t;
    const step = this.step % MELODY.length;
    const beat = this.step % 3;
    const semi = MELODY[step];
    // marimba lead on every beat, a touch quieter off the downbeat
    this.tone({
      freq: note(semi + 24), type: 'triangle', at, dur: 0.3,
      gain: beat === 0 ? 0.09 : 0.055, out: this.musicGain,
    });
    this.tone({
      freq: note(semi + 36), type: 'sine', at: at + 0.015, dur: 0.18,
      gain: 0.03, out: this.musicGain,
    });
    if (beat === 0) {
      const bass = BASS[Math.floor(this.step / 3) % BASS.length];
      this.tone({ freq: note(bass, 110), type: 'sine', at, dur: 0.5, gain: 0.1, out: this.musicGain });
    } else {
      this.noiseHit({ at, dur: 0.07, gain: 0.015, freq: 5200, q: 2 });
    }
    this.nextTime += this.tempo;
    this.step++;
  }

  // Simulation events straight into sound.
  handleEvents(events) {
    if (!this.ctx) return;
    let served = 0;
    for (const event of events) {
      switch (event.type) {
        case 'start': this.start(); break;
        case 'move': this.move(); break;
        case 'ding': this.ding(event.oven); break;
        case 'plate': this.plate(); break;
        case 'serve':
          if (served++ < 2) this.serve(event.combo, event.quality === 'crispy');
          break;
        case 'happy': this.happy(); break;
        case 'heart': this.heart(); break;
        case 'left': this.goodbye(); break;
        case 'smoke': this.sizzle(); break;
        case 'crispy': this.crispy(); break;
        case 'bonk': case 'blocked': case 'counterfull': this.bonk(); break;
        case 'tidy': this.tidy(); break;
        case 'closing': this.closing(); break;
        default: break;
      }
    }
  }
}
