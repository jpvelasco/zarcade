// Everything you hear, synthesized on the spot: no audio files anywhere.
//
// A small chiptune loop (bass, melody, hat) plus one-shot effects driven by the
// events the simulation emits.

const STEPS = 32;
// Four bars of C - Am - F - G, eight steps each. `null` is a rest.
const MELODY = [
  0, 4, 7, 4, 12, null, 7, null,
  9, 12, 16, 12, 9, null, 7, null,
  5, 9, 12, 9, 17, null, 12, null,
  7, 11, 14, 11, 7, 4, 2, null,
];
const BASS_ROOTS = [0, 9, 5, 7];
const BASS_SHAPE = [0, 0, 7, 0, 0, 0, 7, 12];

const ZONE_TUNE = [
  { transpose: 0, tempo: 132, wave: 'square', lift: 1 },
  { transpose: -5, tempo: 116, wave: 'triangle', lift: 0.85 },
  { transpose: 2, tempo: 140, wave: 'square', lift: 1.05 },
  { transpose: 5, tempo: 126, wave: 'triangle', lift: 1.15 },
];

const hz = (semitones) => 261.63 * 2 ** (semitones / 12);

export class Audio {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.zone = 0;
    this.seedStreak = 0;
    this.lastSeed = 0;
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
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.master);
    this.noiseBuffer = this.makeNoise();
  }

  makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.85;
  }

  tone({ freq, dur = 0.12, type = 'square', gain = 0.3, bend = 0, delay = 0, attack = 0.005 }) {
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
    osc.stop(now + dur + 0.02);
  }

  noise({ dur = 0.14, gain = 0.25, freq = 900, type = 'bandpass', delay = 0, sweep = 0 }) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, now);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), now + dur);
    filter.Q.value = 1.2;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    source.connect(filter).connect(env).connect(this.sfxGain);
    source.start(now);
    source.stop(now + dur + 0.02);
  }

  chord(semis, { type = 'triangle', dur = 0.5, gain = 0.18, spread = 0.06 } = {}) {
    semis.forEach((semi, index) => {
      this.tone({ freq: hz(semi), dur, type, gain, delay: index * spread });
    });
  }

  // ------------------------------------------------------------ music

  startMusic(zone = 0) {
    this.zone = zone;
    if (!this.ctx || this.timer) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.ctx) return;
    const tune = ZONE_TUNE[this.zone] || ZONE_TUNE[0];
    const stepTime = 30 / tune.tempo; // an eighth note
    while (this.nextTime < this.ctx.currentTime + 0.12) {
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

    const bass = this.ctx.createOscillator();
    const bassEnv = this.ctx.createGain();
    bass.type = 'triangle';
    bass.frequency.value = hz(root - 24 + BASS_SHAPE[beat]);
    bassEnv.gain.setValueAtTime(0.0001, when);
    bassEnv.gain.exponentialRampToValueAtTime(0.5, when + 0.01);
    bassEnv.gain.exponentialRampToValueAtTime(0.0001, when + stepTime * 0.9);
    bass.connect(bassEnv).connect(this.musicGain);
    bass.start(when);
    bass.stop(when + stepTime);

    const note = MELODY[step];
    if (note !== null) {
      const lead = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      lead.type = tune.wave;
      lead.frequency.value = hz(note + tune.transpose) * tune.lift;
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(0.26, when + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, when + stepTime * 1.1);
      lead.connect(env).connect(this.musicGain);
      lead.start(when);
      lead.stop(when + stepTime * 1.2);
    }

    if (beat % 2 === 0) {
      const hat = this.ctx.createBufferSource();
      hat.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6500;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(beat === 0 ? 0.1 : 0.05, when);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      hat.connect(filter).connect(env).connect(this.musicGain);
      hat.start(when);
      hat.stop(when + 0.06);
    }
  }

  // ------------------------------------------------------------ effects

  handleEvents(events, now = 0) {
    for (const event of events) {
      switch (event.type) {
        case 'jump':
          this.tone({ freq: hz(7), dur: 0.11, type: 'square', gain: 0.22, bend: 1.7 });
          break;
        case 'double':
          this.tone({ freq: hz(14), dur: 0.12, type: 'square', gain: 0.2, bend: 1.8 });
          this.tone({ freq: hz(19), dur: 0.09, type: 'triangle', gain: 0.12, delay: 0.04 });
          break;
        case 'wallJump':
          this.tone({ freq: hz(9), dur: 0.1, type: 'sawtooth', gain: 0.14, bend: 1.5 });
          this.noise({ dur: 0.09, gain: 0.1, freq: 2600, sweep: 0.4 });
          break;
        case 'land':
          this.noise({ dur: event.hard ? 0.12 : 0.07, gain: event.hard ? 0.16 : 0.08, freq: 420, sweep: 0.35 });
          break;
        case 'slide':
          this.noise({ dur: 0.18, gain: 0.06, freq: 3200, sweep: 0.6 });
          break;
        case 'spring':
          this.tone({ freq: hz(-5), dur: 0.26, type: 'sine', gain: 0.3, bend: 5 });
          break;
        case 'seed': {
          if (now - this.lastSeed > 0.75) this.seedStreak = 0;
          this.lastSeed = now;
          const pitch = 12 + Math.min(12, this.seedStreak) * 1;
          this.seedStreak += 1;
          this.tone({ freq: hz(pitch), dur: 0.08, type: 'triangle', gain: 0.2 });
          this.tone({ freq: hz(pitch + 12), dur: 0.06, type: 'sine', gain: 0.1, delay: 0.03 });
          break;
        }
        case 'acorn':
          this.chord([12, 16, 19, 24], { dur: 0.42, gain: 0.16, spread: 0.055 });
          break;
        case 'checkpoint':
          this.chord([0, 7, 12], { dur: 0.6, gain: 0.14, spread: 0.08 });
          break;
        case 'switch':
          this.tone({ freq: hz(16), dur: 0.07, type: 'square', gain: 0.18 });
          break;
        case 'gate':
          this.noise({ dur: 0.7, gain: 0.2, freq: 260, sweep: 0.5, type: 'lowpass' });
          this.chord([7, 11, 14, 19], { dur: 0.7, gain: 0.12, spread: 0.1 });
          break;
        case 'stomp':
          this.noise({ dur: 0.11, gain: 0.2, freq: 1500, sweep: 0.25 });
          this.tone({ freq: hz(4), dur: 0.1, type: 'square', gain: 0.12, bend: 0.5 });
          break;
        case 'crumble':
          this.noise({ dur: 0.1, gain: 0.08, freq: 1800, sweep: 0.7 });
          break;
        case 'break':
          this.noise({ dur: 0.22, gain: 0.16, freq: 900, sweep: 0.3 });
          break;
        case 'hurt':
          this.tone({ freq: hz(5), dur: 0.28, type: 'sawtooth', gain: 0.16, bend: 0.45 });
          break;
        case 'wilt':
          this.chord([0, -3, -8], { dur: 0.6, gain: 0.16, spread: 0.12, type: 'sawtooth' });
          break;
        case 'goal':
          this.chord([12, 16, 19, 24, 28], { dur: 0.9, gain: 0.2, spread: 0.09 });
          break;
        default:
          break;
      }
    }
  }

  /** The little flourish when a level's results appear. */
  fanfare() {
    [0, 4, 7, 12, 16, 19].forEach((semi, index) => {
      this.tone({ freq: hz(semi + 12), dur: 0.3, type: 'triangle', gain: 0.18, delay: index * 0.08 });
    });
  }

  click() {
    this.tone({ freq: hz(12), dur: 0.05, type: 'square', gain: 0.12 });
  }
}
