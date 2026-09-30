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
      case 'failed': this.tone(180, 0.55, { type: 'sawtooth', volume: 0.06, end: 42 }); break;
      default: break;
    }
  }
}
