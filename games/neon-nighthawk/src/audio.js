export class Audio {
  constructor(muted = false) {
    this.muted = muted;
    this.context = null;
  }

  setMuted(muted) {
    this.muted = muted;
  }

  unlock() {
    if (this.muted || this.context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    if (this.context.state === 'suspended') this.context.resume();
  }

  tone(frequency, duration, { type = 'sine', volume = 0.045, end = frequency } = {}) {
    if (this.muted || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(18, end), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  event(event) {
    switch (event.type) {
      case 'dash': this.tone(240, 0.16, { type: 'sawtooth', volume: 0.05, end: 700 }); break;
      case 'pulse': this.tone(540, 0.28, { type: 'sine', volume: 0.05, end: 90 }); break;
      case 'echo': this.tone(240, 0.42, { type: 'triangle', volume: 0.05, end: 650 }); break;
      case 'near-miss': this.tone(740, 0.07, { type: 'square', volume: 0.025, end: 980 }); break;
      case 'pickup': this.tone(360, 0.22, { type: 'triangle', volume: 0.05, end: 620 }); break;
      case 'delivered':
        this.tone(330, 0.18, { type: 'triangle', volume: 0.055, end: 520 });
        window.setTimeout(() => this.tone(520, 0.32, { type: 'triangle', volume: 0.05, end: 880 }), 110);
        break;
      case 'impact': this.tone(90, 0.17, { type: 'square', volume: 0.06, end: 48 }); break;
      case 'flux': this.tone(760, 0.18, { type: 'sine', volume: 0.04, end: 1200 }); break;
      case 'scan': this.tone(880, 0.22, { type: 'square', volume: 0.035, end: 510 }); break;
      case 'spark': {
        // Each spark in a run climbs a pentatonic step, then wraps.
        const steps = [0, 2, 4, 7, 9, 12, 14, 16];
        const note = 880 * 2 ** (steps[(event.pitch || 0) % steps.length] / 12);
        this.tone(note, 0.09, { type: 'sine', volume: 0.03, end: note * 1.02 });
        break;
      }
      case 'stop':
        this.tone(520, 0.16, { type: 'triangle', volume: 0.05, end: 780 });
        window.setTimeout(() => this.tone(780, 0.2, { type: 'triangle', volume: 0.04, end: 1040 }), 90);
        break;
      case 'caught':
        this.tone(660, 0.12, { type: 'square', volume: 0.035, end: 990 });
        window.setTimeout(() => this.tone(990, 0.22, { type: 'square', volume: 0.03, end: 1320 }), 100);
        break;
      case 'alert': this.tone(1200, 0.12, { type: 'square', volume: 0.03, end: 1500 }); break;
      case 'radio': this.tone(1800, 0.04, { type: 'square', volume: 0.012, end: 1700 }); break;
      case 'chapter-complete':
        [523, 659, 784, 1047].forEach((note, i) => window.setTimeout(() => this.tone(note, 0.35, { type: 'triangle', volume: 0.05, end: note }), i * 130));
        break;
      case 'failed': this.tone(180, 0.55, { type: 'sawtooth', volume: 0.06, end: 42 }); break;
      default: break;
    }
  }
}
