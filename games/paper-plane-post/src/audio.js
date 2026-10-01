// Everything you hear, synthesized on the spot: no audio files anywhere.
//
// A slow pastoral loop per region, little chimes for the post, and a wind hiss
// whose level and colour follow the airspeed — that hiss is most of the feel.

const STEPS = 32;
// Four bars over I - vi - IV - V, eight eighth-notes each. `null` is a rest.
const MELODY = [
  7, null, 12, null, 11, 9, 7, null,
  4, null, 9, null, 7, 4, 2, null,
  5, null, 9, 12, 11, null, 9, null,
  7, null, 11, 14, 12, 9, 7, null,
];
const BASS_ROOTS = [0, -3, -7, -5];
const BASS_SHAPE = [0, null, 7, null, 12, null, 7, null];

const REGION_TUNE = [
  { transpose: 0, tempo: 92, wave: 'triangle', pad: 'sine' },
  { transpose: 3, tempo: 84, wave: 'sine', pad: 'triangle' },
  { transpose: -2, tempo: 88, wave: 'triangle', pad: 'sine' },
  { transpose: 5, tempo: 80, wave: 'sine', pad: 'sine' },
  { transpose: 7, tempo: 76, wave: 'triangle', pad: 'sine' },
];

const hz = (semitones) => 261.63 * 2 ** (semitones / 12);

export class Audio {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.region = 0;
    this.wind = null;
    this.ringStreak = 0;
    this.lastRing = 0;
  }

  /** Browsers only allow audio after a gesture, so this runs on first input. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.14;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
    this.noiseBuffer = this.makeNoise();
    this.startWind();
  }

  makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.85;
  }

  // -------------------------------------------------------------- the wind

  startWind() {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.wind = { source, filter, gain };
  }

  /** Call every frame while flying: airspeed drives level and brightness. */
  setAirspeed(speed, flying) {
    if (!this.wind) return;
    const now = this.ctx.currentTime;
    const t = Math.max(0, Math.min(1, (speed - 8) / 18));
    const level = flying ? 0.02 + t * 0.2 : 0;
    this.wind.gain.gain.setTargetAtTime(level, now, 0.12);
    this.wind.filter.frequency.setTargetAtTime(360 + t * 1500, now, 0.14);
  }

  // ----------------------------------------------------------------- pieces

  tone({ freq, dur = 0.14, type = 'triangle', gain = 0.22, bend = 0, delay = 0, attack = 0.008 }) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * bend), now + dur);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(env).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  noise({ dur = 0.2, gain = 0.2, freq = 900, type = 'bandpass', delay = 0, sweep = 0 }) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, now);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), now + dur);
    filter.Q.value = 1.1;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    source.connect(filter).connect(env).connect(this.sfxGain);
    source.start(now);
    source.stop(now + dur + 0.03);
  }

  chord(semis, { type = 'triangle', dur = 0.6, gain = 0.15, spread = 0.07 } = {}) {
    semis.forEach((semi, index) => {
      this.tone({ freq: hz(semi), dur, type, gain, delay: index * spread });
    });
  }

  // ------------------------------------------------------------------ music

  startMusic(region = 0) {
    this.region = region;
    if (!this.ctx || this.timer) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 28);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.ctx) return;
    const tune = REGION_TUNE[this.region] || REGION_TUNE[0];
    const stepTime = 30 / tune.tempo;
    while (this.nextTime < this.ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextTime, tune, stepTime);
      this.step = (this.step + 1) % STEPS;
      this.nextTime += stepTime;
    }
  }

  playStep(step, when, tune, stepTime) {
    if (this.muted) return;
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const root = BASS_ROOTS[bar] + tune.transpose;

    if (BASS_SHAPE[beat] !== null) {
      const bass = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      bass.type = 'sine';
      bass.frequency.value = hz(root - 24 + BASS_SHAPE[beat]);
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(0.45, when + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, when + stepTime * 1.6);
      bass.connect(env).connect(this.musicGain);
      bass.start(when);
      bass.stop(when + stepTime * 1.8);
    }

    if (beat === 0) {
      // A soft pad chord under each bar.
      for (const semi of [root, root + 7, root + 12]) {
        const pad = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        pad.type = tune.pad;
        pad.frequency.value = hz(semi - 12);
        env.gain.setValueAtTime(0.0001, when);
        env.gain.exponentialRampToValueAtTime(0.1, when + 0.4);
        env.gain.exponentialRampToValueAtTime(0.0001, when + stepTime * 8);
        pad.connect(env).connect(this.musicGain);
        pad.start(when);
        pad.stop(when + stepTime * 8.2);
      }
    }

    const note = MELODY[step];
    if (note !== null) {
      const lead = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      lead.type = tune.wave;
      lead.frequency.value = hz(note + tune.transpose);
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(0.2, when + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, when + stepTime * 2.2);
      lead.connect(env).connect(this.musicGain);
      lead.start(when);
      lead.stop(when + stepTime * 2.4);
    }
  }

  // ---------------------------------------------------------------- effects

  handleEvents(events, now = 0) {
    for (const event of events) {
      switch (event.type) {
        case 'ring': {
          if (now - this.lastRing > 2.2) this.ringStreak = 0;
          this.lastRing = now;
          const pitch = 12 + Math.min(10, this.ringStreak) * 2;
          this.ringStreak += 1;
          this.tone({ freq: hz(pitch), dur: 0.14, type: 'sine', gain: 0.18 });
          this.tone({ freq: hz(pitch + 7), dur: 0.1, type: 'triangle', gain: 0.1, delay: 0.05 });
          break;
        }
        case 'letter':
          this.chord([12, 16, 19], { dur: 0.4, gain: 0.14, spread: 0.05, type: 'sine' });
          this.noise({ dur: 0.1, gain: 0.08, freq: 2600, sweep: 0.5 });
          break;
        case 'snap':
          this.noise({ dur: 0.1, gain: 0.14, freq: 3400, sweep: 0.3 });
          this.tone({ freq: hz(24), dur: 0.1, type: 'triangle', gain: 0.12, bend: 1.5 });
          break;
        case 'thermal':
          this.tone({ freq: hz(0), dur: 0.5, type: 'sine', gain: 0.1, bend: 2 });
          break;
        case 'soaking':
          this.noise({ dur: 0.5, gain: 0.12, freq: 700, sweep: 0.4, type: 'lowpass' });
          break;
        case 'dry':
          this.tone({ freq: hz(16), dur: 0.26, type: 'sine', gain: 0.1, bend: 1.4 });
          break;
        case 'milestone':
          this.tone({ freq: hz(19), dur: 0.2, type: 'triangle', gain: 0.13 });
          break;
        case 'land':
          if (event.soft) {
            this.noise({ dur: 0.18, gain: 0.08, freq: 1100, sweep: 0.4 });
            this.chord([12, 19, 24], { dur: 0.5, gain: 0.12, spread: 0.06, type: 'sine' });
          } else {
            this.noise({ dur: 0.2, gain: 0.2, freq: 420, sweep: 0.4 });
          }
          break;
        case 'fail':
          if (event.outcome === 'water') {
            this.noise({ dur: 0.4, gain: 0.24, freq: 1400, sweep: 0.2 });
            this.tone({ freq: hz(-2), dur: 0.3, type: 'sine', gain: 0.12, bend: 0.4 });
          } else if (event.outcome === 'stuck') {
            this.noise({ dur: 0.26, gain: 0.16, freq: 900, sweep: 0.3 });
            this.tone({ freq: hz(2), dur: 0.3, type: 'triangle', gain: 0.12, bend: 0.5 });
          } else {
            this.noise({ dur: 0.24, gain: 0.16, freq: 520, sweep: 0.4 });
            this.chord([0, -4, -9], { dur: 0.5, gain: 0.12, spread: 0.1, type: 'sine' });
          }
          break;
        default:
          break;
      }
    }
  }

  launch() {
    this.noise({ dur: 0.3, gain: 0.16, freq: 600, sweep: 2.4 });
    this.tone({ freq: hz(7), dur: 0.2, type: 'sine', gain: 0.12, bend: 1.6 });
  }

  fanfare(big = false) {
    const notes = big ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    notes.forEach((semi, index) => {
      this.tone({ freq: hz(semi + 12), dur: 0.34, type: 'triangle', gain: 0.16, delay: index * 0.09 });
    });
  }

  stamp() {
    this.noise({ dur: 0.12, gain: 0.2, freq: 1600, sweep: 0.25 });
    this.chord([12, 17, 24], { dur: 0.45, gain: 0.14, spread: 0.04, type: 'sine' });
  }

  click() {
    this.tone({ freq: hz(14), dur: 0.06, type: 'sine', gain: 0.12 });
  }
}
