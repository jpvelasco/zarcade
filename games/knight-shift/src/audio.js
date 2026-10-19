// All sound is synthesized with Web Audio: wooden "tocks" for moves, a
// clack for captures, a bell for check, sparkles for powers and promotions,
// and little fanfares for the end of a game.
const semis = (n) => Math.pow(2, n / 12);

export class Sound {
  constructor({ muted = false } = {}) {
    this.muted = muted;
    this.ctx = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(c.destination);
      const buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  get ready() { return this.ctx && !this.muted && this.ctx.state === 'running'; }

  tone(freq, { type = 'sine', at = 0, dur = 0.15, gain = 0.3, slide = 0, attack = 0.005 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  click(freq, { at = 0, dur = 0.06, gain = 0.4, q = 6 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  tock(at = 0, pitch = 1) {
    this.click(1500 * pitch, { at, dur: 0.05, gain: 0.5, q: 3 });
    this.tone(260 * pitch, { at, dur: 0.09, gain: 0.25, type: 'triangle', slide: 0.6 });
  }

  play(name) {
    if (!this.ready) return;
    switch (name) {
      case 'move': this.tock(0, 0.95 + Math.random() * 0.1); break;
      case 'capture':
        this.tock(0, 1.15);
        this.click(700, { at: 0.03, dur: 0.12, gain: 0.5, q: 2 });
        this.tone(140, { at: 0.02, dur: 0.16, gain: 0.3, type: 'sine', slide: 0.5 });
        break;
      case 'castle': this.tock(0, 1); this.tock(0.11, 1.12); break;
      case 'check': this.tone(988, { dur: 0.35, gain: 0.18 }); this.tone(1480, { at: 0.02, dur: 0.4, gain: 0.1 }); this.tock(0, 1); break;
      case 'promote': [0, 4, 7, 12].forEach((n, i) => this.tone(523 * semis(n), { at: i * 0.06, dur: 0.2, gain: 0.16, type: 'triangle' })); break;
      case 'power': [0, 7, 12, 19].forEach((n, i) => this.tone(660 * semis(n), { at: i * 0.045, dur: 0.18, gain: 0.12, type: 'sine' })); break;
      case 'shield': this.tone(440, { dur: 0.35, gain: 0.18, slide: 2, type: 'sine' }); this.tone(880, { at: 0.05, dur: 0.3, gain: 0.08 }); break;
      case 'swap': this.tone(500, { dur: 0.12, gain: 0.15, slide: 1.6, type: 'triangle' }); this.tone(800, { at: 0.1, dur: 0.12, gain: 0.15, slide: 0.6, type: 'triangle' }); break;
      case 'leap': this.tone(300, { dur: 0.22, gain: 0.18, slide: 3, type: 'triangle' }); this.tock(0.22, 1.1); break;
      case 'select': this.click(2400, { dur: 0.03, gain: 0.18, q: 8 }); break;
      case 'illegal': this.tone(180, { dur: 0.16, gain: 0.16, type: 'square', slide: 0.8 }); break;
      case 'hint': this.tone(1046, { dur: 0.15, gain: 0.12 }); this.tone(1318, { at: 0.08, dur: 0.2, gain: 0.12 }); break;
      case 'right': [0, 4, 7].forEach((n, i) => this.tone(660 * semis(n), { at: i * 0.07, dur: 0.2, gain: 0.14, type: 'triangle' })); break;
      case 'wrong': this.tone(330, { dur: 0.14, gain: 0.14, type: 'triangle' }); this.tone(262, { at: 0.12, dur: 0.22, gain: 0.14, type: 'triangle' }); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(523 * semis(n), { at: i * 0.11, dur: 0.3, gain: 0.16, type: i % 2 ? 'square' : 'triangle' })); break;
      case 'lose': [7, 5, 3, 0].forEach((n, i) => this.tone(392 * semis(n - 7), { at: i * 0.16, dur: 0.3, gain: 0.14, type: 'triangle' })); break;
      case 'draw': this.tone(523, { dur: 0.3, gain: 0.14, type: 'triangle' }); this.tone(659, { at: 0.18, dur: 0.4, gain: 0.14, type: 'triangle' }); break;
      case 'star': this.tone(1318, { dur: 0.25, gain: 0.12 }); this.tone(1976, { at: 0.05, dur: 0.3, gain: 0.08 }); break;
      case 'ui': this.click(1800, { dur: 0.03, gain: 0.12, q: 10 }); break;
      default: break;
    }
  }
}
