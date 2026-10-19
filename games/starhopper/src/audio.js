// All sound is synthesized with Web Audio; there are no audio files.
export class Audio {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.lastShot = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      this.startEngine();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  startEngine() {
    const c = this.ctx;
    this.hum = c.createOscillator();
    this.hum.type = 'sawtooth';
    this.hum2 = c.createOscillator();
    this.hum2.type = 'triangle';
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    this.humFilter = f;
    this.humGain = c.createGain();
    this.humGain.gain.value = 0;
    this.hum.connect(f);
    this.hum2.connect(f);
    f.connect(this.humGain).connect(this.master);
    this.hum.start();
    this.hum2.start();
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bf = c.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 700;
    this.roar = c.createGain();
    this.roar.gain.value = 0;
    src.connect(bf).connect(this.roar).connect(this.master);
    src.start();
    this.roarFilter = bf;
  }

  updateEngine(speed, boosting, hyper, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hum.frequency.setTargetAtTime(40 + speed * 0.5, t, 0.1);
    this.hum2.frequency.setTargetAtTime(80 + speed * 0.9, t, 0.1);
    this.humFilter.frequency.setTargetAtTime(200 + speed * 4, t, 0.1);
    this.humGain.gain.setTargetAtTime(running ? 0.07 : 0, t, 0.2);
    this.roar.gain.setTargetAtTime(running && (boosting || hyper) ? (hyper ? 0.25 : 0.12) : 0, t, 0.15);
    this.roarFilter.frequency.setTargetAtTime(hyper ? 1800 : 900, t, 0.3);
  }

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

  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'launch': this.noise(1.2, 300, 0.4, 'bandpass', 2400); this.tone(220, 0, 1, 'sawtooth', 0.08, 660); break;
        case 'shoot': {
          const now = this.ctx ? this.ctx.currentTime : 0;
          if (now - this.lastShot < 0.07) break; // don't stack dozens of pews
          this.lastShot = now;
          this.tone(1400, 0, 0.09, 'square', 0.035, 380);
          break;
        }
        case 'enemyShoot': this.tone(600, 0, 0.12, 'sawtooth', 0.02, 220); break;
        case 'missile': this.noise(0.6, 500, 0.3, 'bandpass', 3000); break;
        case 'explode':
          this.noise(e.big ? 1.4 : 0.6, e.big ? 1200 : 2200, e.big ? 0.7 : 0.35, 'lowpass', 80);
          this.tone(e.big ? 55 : 110, 0, e.big ? 1 : 0.35, 'sine', e.big ? 0.5 : 0.25, 35);
          if (e.combo > 1) this.tone(520 * Math.pow(2, Math.min(e.combo, 8) / 12), 0.04, 0.15, 'triangle', 0.08);
          break;
        case 'rockBreak': this.noise(0.35, 900, 0.3, 'lowpass', 150); break;
        case 'hit': this.tone(900, 0, 0.04, 'square', 0.03); break;
        case 'hurt':
          if (e.shielded) this.tone(700, 0, 0.25, 'sine', 0.15, 350);
          else { this.noise(0.4, 1400, 0.45); this.tone(120, 0, 0.3, 'square', 0.12, 60); }
          break;
        case 'deflect': this.tone(1800, 0, 0.12, 'triangle', 0.1, 2600); break;
        case 'roll': this.noise(0.4, 1200, 0.18, 'bandpass', 400); break;
        case 'pickup':
          if (e.kind === 'dust') this.tone(1600 + Math.random() * 400, 0, 0.07, 'sine', 0.06);
          else [523, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.05, 0.2, 'triangle', 0.1));
          break;
        case 'hyperStart': this.noise(2.5, 200, 0.5, 'bandpass', 4000); this.tone(110, 0, 2.2, 'sawtooth', 0.12, 880); break;
        case 'hyperEnd': this.noise(0.8, 3000, 0.3, 'bandpass', 300); break;
        case 'shop': [659, 784, 988, 1319].forEach((f, i) => this.tone(f, i * 0.09, 0.3, 'triangle', 0.12)); break;
        case 'missedBurger': [440, 370].forEach((f, i) => this.tone(f, i * 0.15, 0.25, 'triangle', 0.1)); break;
        case 'bossWarning':
          for (let i = 0; i < 4; i++) { this.tone(440, i * 0.5, 0.25, 'square', 0.08); this.tone(330, i * 0.5 + 0.25, 0.25, 'square', 0.08); }
          break;
        case 'coreExposed': this.tone(220, 0, 0.8, 'sawtooth', 0.1, 880); break;
        case 'bossDown': this.noise(3, 800, 0.8, 'lowpass', 60); this.tone(50, 0, 2.5, 'sine', 0.6, 30); break;
        case 'arrived': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, i * 0.12, 0.6, 'square', 0.07)); break;
        case 'destroyed': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4 + i * 0.22, 0.45, 'triangle', 0.12)); break;
      }
    }
  }
}
