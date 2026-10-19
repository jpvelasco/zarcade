// All sound is synthesized with Web Audio; there are no audio files.
export class Audio {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise();
      this.startEngine();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.6;
  }

  makeNoise() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ------------------------------------------------------------ engine

  startEngine() {
    const c = this.ctx;
    this.engine = c.createGain();
    this.engine.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    this.engineFilter = filter;
    this.osc1 = c.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = c.createOscillator();
    this.osc2.type = 'square';
    const g2 = c.createGain();
    g2.gain.value = 0.5;
    this.osc1.connect(filter);
    this.osc2.connect(g2).connect(filter);
    filter.connect(this.engine).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // Rumble (off-road) and nitro roar are filtered noise.
    this.rumble = this.loopNoise('lowpass', 300);
    this.roar = this.loopNoise('bandpass', 900);
  }

  loopNoise(type, freq) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  // Called every frame with the player's vehicle and throttle.
  updateEngine(v, throttle, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const speed = Math.abs(v.speed);
    const gearSpeed = speed % 11; // fake gear changes
    const rpm = 55 + gearSpeed * 9 + speed * 1.6 + (throttle ? 12 : 0);
    this.osc1.frequency.setTargetAtTime(rpm, t, 0.05);
    this.osc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(400 + speed * 35 + (throttle ? 400 : 0), t, 0.08);
    this.engine.gain.setTargetAtTime(running ? 0.05 + (throttle ? 0.05 : 0) : 0, t, 0.1);
    this.rumble.gain.setTargetAtTime(running && v.offroad && v.grounded ? Math.min(0.25, speed / 80) : 0, t, 0.1);
    this.roar.gain.setTargetAtTime(running && v.nitroOn ? 0.18 : 0, t, 0.08);
  }

  // ------------------------------------------------------------ one-shots

  tone(freq, delay, dur, type = 'sine', vol = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise(dur, freq, vol, type = 'lowpass', sweepTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  handleEvents(events, playerId) {
    for (const e of events) {
      const mine = e.racer === undefined || e.racer === playerId;
      switch (e.type) {
        case 'go': this.tone(880, 0, 0.5, 'square', 0.12); break;
        case 'kill':
          this.noise(0.18, 900, 0.35);
          this.tone(160, 0, 0.15, 'sine', 0.3, 60);
          if (e.combo > 1) this.tone(440 * Math.pow(2, Math.min(e.combo, 8) / 12), 0.05, 0.15, 'triangle', 0.1);
          break;
        case 'explosion':
          this.noise(1.1, 1600, 0.6, 'lowpass', 90);
          this.tone(70, 0, 0.8, 'sine', 0.45, 35);
          break;
        case 'crash':
          if (!mine) break;
          this.noise(e.soft ? 0.15 : 0.35, e.soft ? 1800 : 700, e.soft ? 0.25 : 0.5);
          if (!e.soft) this.tone(90, 0, 0.3, 'square', 0.15, 45);
          break;
        case 'land':
          if (mine && e.air > 0.3) this.tone(80, 0, 0.25, 'sine', Math.min(0.5, e.impact / 30), 40);
          break;
        case 'ramp': if (mine) this.noise(0.4, 400, 0.2, 'bandpass', 1600); break;
        case 'pickup':
          if (!mine) break;
          if (e.kind === 'coin') { this.tone(1320, 0, 0.08, 'square', 0.06); this.tone(1760, 0.06, 0.12, 'square', 0.06); }
          else [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.06, 0.2, 'triangle', 0.12));
          break;
        case 'shot': if (mine) this.noise(0.05, 3000, 0.18, 'highpass'); break;
        case 'rocket': this.noise(0.5, 500, 0.3, 'bandpass', 2500); break;
        case 'finish':
          if (mine) [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.12, 0.5, 'square', 0.08));
          break;
        case 'wrecked':
          if (mine) [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3 + i * 0.2, 0.4, 'triangle', 0.12));
          break;
      }
    }
  }

  beep(high) {
    this.tone(high ? 880 : 440, 0, high ? 0.5 : 0.2, 'square', 0.1);
  }
}
