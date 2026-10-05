// WebAudio sound: pencil scratches, crosses, line chimes, a reveal fanfare
// and a soft music-box loop. Everything is synthesized.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const semi = (root, s) => root * 2 ** (s / 12);
const ROOT = 523.25; // C5

// A gentle eight-bar music-box tune over a pad (scale degrees, -1 = rest).
const TUNE = [0, 4, 7, 4, 5, 4, 2, -1, 0, 4, 7, 9, 7, 5, 4, -1, 2, 5, 9, 5, 7, 5, 4, 2, 0, 2, 4, 7, 4, 2, 0, -1];
const BASS = [0, 0, 5, 5, 3, 3, 4, 4];

export class Sound {
  constructor({ muted = false, sound = true, music = true } = {}) {
    this.muted = muted;
    this.sound = sound;
    this.music = music;
    this.ctx = null;
    this.step = 0;
    this.nextAt = 0;
    this.timer = null;
    this.lastScratch = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sound ? 1 : 0;
    this.sfx.connect(this.master);
    this.bus = ctx.createGain();
    this.bus.gain.value = this.music ? 0.32 : 0;
    this.bus.connect(this.master);
    const len = Math.floor(ctx.sampleRate * 0.12);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  // Master mute: silences effects and music together.
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  setSound(on) {
    this.sound = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.music = on;
    if (this.bus) this.bus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2);
  }

  setMusicLevel(level) {
    if (this.bus && this.music) this.bus.gain.setTargetAtTime(0.32 * level, this.ctx.currentTime, 0.4);
  }

  tone(freq, { at = 0, dur = 0.2, type = 'sine', vol = 0.2, bus = this.sfx, attack = 0.005, bend = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss({ at = 0, dur = 0.06, freq = 3000, q = 1.2, vol = 0.12 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // A pencil stroke on one square; `n` is how far along the drag we are.
  fill(n = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastScratch < 0.025) return;
    this.lastScratch = now;
    this.hiss({ dur: 0.05, freq: 2400 + Math.random() * 1200, vol: 0.09 });
    this.tone(semi(ROOT, PENTA[Math.min(n, PENTA.length - 1)]), { dur: 0.12, type: 'triangle', vol: 0.07 });
  }

  cross() {
    this.hiss({ dur: 0.035, freq: 1200, q: 3, vol: 0.1 });
    this.tone(330, { dur: 0.06, type: 'square', vol: 0.025, bend: 0.7 });
  }

  erase() { this.hiss({ dur: 0.08, freq: 900, q: 0.8, vol: 0.06 }); }

  boop() {
    this.tone(392, { dur: 0.16, type: 'sine', vol: 0.12, bend: 0.75 });
    this.tone(262, { at: 0.08, dur: 0.18, type: 'sine', vol: 0.08 });
  }

  line(k = 0) {
    const base = PENTA[(k * 2) % 6];
    this.tone(semi(ROOT, base + 12), { dur: 0.35, type: 'sine', vol: 0.09 });
    this.tone(semi(ROOT, base + 19), { at: 0.06, dur: 0.4, type: 'sine', vol: 0.06 });
  }

  hint() {
    [0, 4, 7].forEach((s, i) => this.tone(semi(ROOT, s + 12), { at: i * 0.06, dur: 0.3, type: 'triangle', vol: 0.06 }));
  }

  click() { this.tone(880, { dur: 0.05, type: 'triangle', vol: 0.05 }); }

  reveal() {
    const notes = [0, 4, 7, 12, 16, 19, 24];
    notes.forEach((s, i) => this.tone(semi(ROOT / 2, s), { at: i * 0.07, dur: 0.5, type: 'triangle', vol: 0.09 }));
    [0, 4, 7].forEach((s) => this.tone(semi(ROOT / 2, s + 12), { at: 0.6, dur: 1.4, type: 'sine', vol: 0.06, attack: 0.05 }));
  }

  star(i) { this.tone(semi(ROOT, [12, 16, 19][i] || 19), { dur: 0.4, type: 'sine', vol: 0.1 }); }

  unlockJingle() {
    [7, 12, 16, 19, 24].forEach((s, i) => this.tone(semi(ROOT, s), { at: i * 0.08, dur: 0.35, type: 'triangle', vol: 0.07 }));
  }

  // ------------------------------------------------------------ music

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextAt = this.ctx.currentTime + 0.3;
    this.timer = setInterval(() => this.schedule(), 200);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const beat = 0.42;
    while (this.nextAt < ctx.currentTime + 0.6) {
      const i = this.step % TUNE.length;
      const deg = TUNE[i];
      const at = this.nextAt - ctx.currentTime;
      if (this.music) {
        if (deg >= 0) {
          const f = semi(ROOT, [0, 2, 4, 5, 7, 9, 11, 12, 14, 16][deg % 10] + (deg >= 10 ? 12 : 0));
          this.tone(f, { at, dur: 1.1, type: 'sine', vol: 0.12, bus: this.bus });
          this.tone(f * 2, { at, dur: 0.5, type: 'sine', vol: 0.03, bus: this.bus });
        }
        if (i % 4 === 0) {
          const b = BASS[(i / 4) % BASS.length];
          this.tone(semi(ROOT / 4, [0, 2, 4, 5, 7, 9][b] ?? 0), { at, dur: beat * 4, type: 'triangle', vol: 0.07, bus: this.bus, attack: 0.08 });
        }
      }
      this.nextAt += beat;
      this.step++;
    }
  }
}
