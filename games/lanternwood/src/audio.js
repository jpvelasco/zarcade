// All sound is synthesized with WebAudio: a little chiptune band (lead,
// bass, arpeggio and soft drums) with one song per region and dungeon, plus
// effects driven by the events the simulation emits.

const hz = (semi) => 261.63 * 2 ** (semi / 12);
const _ = null;

// Each song: tempo (eighth notes per minute / 2), lead wave, 8 steps per bar.
// mel: lead notes (semitones from middle C), bass: one root per bar,
// arp: chord tones per bar for the sparkly arpeggio, drum: per-step pattern.
const SONGS = {
  title: { tempo: 92, wave: 'triangle', mel: [12, _, 14, 16, _, 19, 16, _, 14, _, 12, 9, _, 12, _, _, 7, _, 9, 12, _, 14, 12, _, 11, _, 12, 14, _, _, _, _], bass: [0, -3, -7, -5], arp: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], drum: 'k...h...k...h...' },
  village: { tempo: 118, wave: 'square', mel: [7, 9, 12, _, 12, 14, 12, 9, 7, _, 4, _, 7, _, _, _, 5, 7, 9, _, 9, 12, 9, 7, 5, _, 2, _, 4, _, _, _], bass: [0, -3, -7, -5], arp: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], drum: 'k.h.s.h.k.h.s.hh' },
  forest: { tempo: 96, wave: 'triangle', mel: [9, _, 12, _, 16, _, 14, 12, 11, _, 9, _, 7, _, _, _, 9, _, 12, _, 17, _, 16, 14, 12, _, 11, _, 9, _, _, _], bass: [-3, -7, -5, -8], arp: [[-3, 0, 4], [-7, -3, 0], [-5, -1, 2], [-8, -5, -1]], drum: 'k...h.h.k...h.h.' },
  lake: { tempo: 84, wave: 'sine', mel: [15, _, 19, _, 22, _, 19, _, 17, _, 15, _, 12, _, _, _, 14, _, 17, _, 20, _, 17, _, 15, _, 14, _, 10, _, _, _], bass: [3, -4, 1, -2], arp: [[3, 7, 10], [-4, 0, 3], [1, 5, 8], [-2, 2, 5]], drum: 'k.......h.......' },
  mountain: { tempo: 124, wave: 'square', mel: [19, _, 17, 19, 21, _, 19, _, 14, _, 12, 14, 16, _, _, _, 19, _, 21, 23, 24, _, 23, 21, 19, _, 17, _, 14, _, _, _], bass: [7, 5, 0, 2], arp: [[7, 11, 14], [5, 9, 12], [0, 4, 7], [2, 6, 9]], drum: 'k.h.k.h.s.h.k.hh' },
  burrow: { tempo: 100, wave: 'triangle', mel: [9, _, 8, 9, 12, _, 11, _, 9, _, 5, _, 4, _, _, _, 5, _, 4, 5, 9, _, 8, _, 4, _, 2, _, 4, _, _, _], bass: [-3, -7, -8, -8], arp: [[-3, 0, 4], [-7, -3, 0], [-8, -4, -1], [-8, -4, -1]], drum: 'k..hk..hs..hk.h.' },
  temple: { tempo: 80, wave: 'sine', mel: [14, _, _, 17, 21, _, 19, _, 17, _, _, 14, 12, _, _, _, 13, _, _, 17, 20, _, 19, _, 17, _, _, 13, 14, _, _, _], bass: [2, -2, 1, 1], arp: [[2, 5, 9], [-2, 2, 5], [1, 5, 8], [1, 4, 8]], drum: 'k.......s.......' },
  peak: { tempo: 112, wave: 'square', mel: [12, 15, 19, 15, 12, 15, 19, 15, 11, 14, 17, 14, 11, 14, 17, 14, 8, 12, 15, 12, 8, 12, 15, 12, 7, 11, 14, 11, 7, 11, 14, 19], bass: [0, -1, -4, -5], arp: [[0, 3, 7], [-1, 2, 5], [-4, 0, 3], [-5, -1, 2]], drum: 'khhhkhhhshhhkhhh' },
  boss: { tempo: 140, wave: 'square', mel: [12, 12, 15, 12, 17, 15, 12, 10, 12, 12, 15, 12, 19, 17, 15, 14, 11, 11, 14, 11, 17, 14, 11, 10, 11, 11, 14, 17, 19, _, 18, 17], bass: [0, 0, -1, -1], arp: [[0, 3, 7], [0, 3, 7], [-1, 2, 7], [-1, 2, 7]], drum: 'k.hsk.hsk.hsk.ss' },
  shade: { tempo: 120, wave: 'triangle', mel: [15, _, 14, 15, 18, _, 15, _, 14, _, 11, _, 10, _, _, _, 15, _, 14, 15, 19, _, 18, _, 15, _, 14, _, 11, 10, 11, 14], bass: [3, -1, 0, -1], arp: [[3, 6, 10], [-1, 2, 6], [0, 3, 6], [-1, 2, 6]], drum: 'k.h.s.h.k.hhs.h.' },
  ending: { tempo: 96, wave: 'triangle', mel: [12, _, 16, _, 19, _, 24, _, 21, _, 19, _, 16, _, 19, _, 17, _, 21, _, 24, _, 26, _, 24, _, _, _, _, _, _, _], bass: [0, -3, -7, -5], arp: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], drum: 'k...h...s...h...' },
};

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.song = 'title';
    this.step = 0;
    this.timer = null;
    this.level = 1;
    this.lastBlip = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.17 : 0;
    this.music.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.5;
    this.sfx.connect(this.master);
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 30);
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  setMusic(on) { this.musicOn = on; this.applyMusicGain(); }
  setMusicLevel(l) { this.level = l; this.applyMusicGain(); }
  applyMusicGain() {
    if (!this.music) return;
    const g = this.musicOn ? 0.17 * this.level : 0;
    this.music.gain.setTargetAtTime(g, this.ctx.currentTime, 0.15);
  }

  setSong(name) {
    if (!SONGS[name] || name === this.song) return;
    this.song = name;
    this.step = 0;
  }

  schedule() {
    if (!this.ctx || this.muted || !this.musicOn) { if (this.ctx) this.next = this.ctx.currentTime + 0.05; return; }
    const s = SONGS[this.song];
    const dt = 30 / s.tempo;
    while (this.next < this.ctx.currentTime + 0.15) {
      this.playStep(s, this.step, this.next, dt);
      this.step = (this.step + 1) % 32;
      this.next += dt;
    }
  }

  playStep(s, step, t, dt) {
    const bar = Math.floor(step / 8) % 4;
    const n = s.mel[step % s.mel.length];
    if (n !== null && n !== undefined) this.note(this.music, hz(n), t, dt * 1.6, s.wave, s.wave === 'square' ? 0.22 : 0.34);
    if (step % 4 === 0) this.note(this.music, hz(s.bass[bar] - 12), t, dt * 3.2, 'triangle', 0.42);
    if (step % 2 === 1) {
      const chord = s.arp[bar];
      this.note(this.music, hz(chord[(step >> 1) % 3] + 12), t, dt * 0.8, 'sine', 0.1);
    }
    const d = s.drum[step % 16];
    if (d === 'k') this.kick(t);
    else if (d === 's') this.hit(t, 1800, 0.12, 0.16);
    else if (d === 'h') this.hit(t, 7000, 0.04, 0.06);
  }

  note(dest, freq, t, dur, type, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.music);
    o.start(t); o.stop(t + 0.18);
  }

  hit(t, freq, dur, gain, dest = this.music) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ effects

  tone(freq, dur = 0.1, type = 'square', gain = 0.25, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur = 0.1, freq = 1200, gain = 0.25, delay = 0) {
    if (!this.ctx || this.muted) return;
    this.hit(this.ctx.currentTime + delay, freq, dur, gain, this.sfx);
  }

  jingle(notes, step = 0.09, type = 'square', gain = 0.2) {
    notes.forEach((n, i) => this.tone(hz(n), step * 1.8, type, gain, 0, i * step));
  }

  blip() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBlip < 0.045) return;
    this.lastBlip = now;
    this.tone(hz(19 + Math.floor(Math.random() * 3)), 0.03, 'square', 0.05);
  }

  handle(events) {
    if (!this.ctx || this.muted) return;
    for (const e of events) {
      switch (e.type) {
        case 'swing': this.noise(0.08, 2500, 0.12); this.tone(520, 0.07, 'triangle', 0.08, 1.6); break;
        case 'hit': this.tone(e.boss ? 160 : 260, 0.12, 'square', 0.22, 0.5); this.noise(0.06, 900, 0.18); break;
        case 'clank': this.tone(1400, 0.08, 'square', 0.12, 0.9); this.tone(2100, 0.06, 'sine', 0.1); break;
        case 'poof': this.noise(0.22, 500, 0.22); this.tone(600, 0.16, 'triangle', 0.14, 2); break;
        case 'hurt': this.tone(330, 0.2, 'square', 0.22, 0.45); break;
        case 'cut': this.noise(0.09, e.bush ? 1500 : 3200, 0.14); break;
        case 'rustle': this.noise(0.05, 4000, 0.04); break;
        case 'pickup':
          if (e.kind === 'heart') this.jingle([12, 16, 19], 0.05, 'triangle', 0.16);
          else if (e.kind === 'honeycap') this.jingle([16, 19, 24], 0.06, 'triangle', 0.18);
          else if (e.kind === 'shard' || e.kind === 'container') break;
          else this.tone(hz(24 + (Math.random() * 3 | 0)), 0.08, 'square', 0.12, 1.2);
          break;
        case 'chest': this.jingle([7, 11, 14, 19], 0.07, 'triangle', 0.18); break;
        case 'itemget': if (e.big) this.jingle([7, 12, 16, 19, 24, 24], 0.11, 'square', 0.18); else this.jingle([12, 16, 19, 24], 0.08, 'square', 0.15); break;
        case 'secret': this.jingle([19, 18, 15, 9, 8, 16, 20, 24], 0.085, 'square', 0.15); break;
        case 'unlock': this.tone(900, 0.06, 'square', 0.15); this.tone(600, 0.12, 'square', 0.15, 1, 0.07); break;
        case 'switch': this.tone(1200, 0.1, 'sine', 0.2); this.tone(1800, 0.14, 'sine', 0.14, 1, 0.05); break;
        case 'torch': this.noise(0.2, 600, 0.12); this.tone(hz(e.lamp ? 19 : 14), 0.2, 'triangle', 0.15); break;
        case 'snuff': this.noise(0.25, 300, 0.12); break;
        case 'ember': this.noise(0.1, 2000, 0.06); this.tone(700, 0.1, 'sine', 0.06, 1.5); break;
        case 'boomerang': this.tone(500, 0.3, 'triangle', 0.08, 1.4); break;
        case 'vine': this.tone(300, 0.12, 'square', 0.08, 2); break;
        case 'latch': this.tone(220, 0.08, 'square', 0.18); this.tone(660, 0.18, 'triangle', 0.1, 1.5, 0.05); break;
        case 'dash': this.noise(0.25, 900, 0.18); this.tone(200, 0.25, 'sawtooth', 0.08, 3); break;
        case 'crack': this.noise(0.4, 200, 0.35); this.tone(90, 0.3, 'square', 0.2, 0.5); break;
        case 'push': this.noise(0.18, 250, 0.14); break;
        case 'plate': this.tone(hz(7), 0.1, 'square', 0.15); break;
        case 'checkpoint': this.jingle([12, 19, 24], 0.08, 'triangle', 0.16); break;
        case 'talk': break;
        case 'choose': this.tone(hz(19), 0.05, 'square', 0.08); break;
        case 'buy': this.jingle([19, 24], 0.06, 'square', 0.12); break;
        case 'quest': if (!e.quiet) this.jingle([12, 16, 21], 0.08, 'triangle', 0.14); break;
        case 'thud': this.tone(70, 0.25, 'sine', 0.35, 0.6); this.noise(0.15, 200, 0.2); break;
        case 'boing': this.tone(180, 0.25, 'triangle', 0.2, 2.2); break;
        case 'spit': this.tone(400, 0.08, 'square', 0.12, 0.6); break;
        case 'bell': this.tone(hz(-5), 1.2, 'sine', 0.3); this.tone(hz(7), 0.9, 'sine', 0.12); break;
        case 'snap': this.tone(800, 0.06, 'square', 0.15, 0.4); break;
        case 'orbs': this.tone(hz(-2), 0.4, 'triangle', 0.14, 1.5); break;
        case 'whoosh': this.noise(0.4, 600, 0.16); break;
        case 'reveal': this.jingle([15, 19, 22], 0.07, 'triangle', 0.14); break;
        case 'stun': this.tone(1000, 0.1, 'sine', 0.12, 0.5); break;
        case 'tink': this.tone(1600, 0.05, 'square', 0.08); break;
        case 'bump': this.noise(0.08, 300, 0.12); break;
        case 'land': this.noise(0.08, 400, 0.12); break;
        case 'bite': this.tone(hz(24), 0.08, 'square', 0.16); this.tone(hz(24), 0.08, 'square', 0.16, 1, 0.1); break;
        case 'catch': this.jingle([12, 16, 19, 24], 0.06, 'triangle', 0.16); break;
        case 'cast': this.tone(600, 0.2, 'sine', 0.06, 0.5); break;
        case 'racewin': this.jingle([12, 16, 19, 24, 28], 0.08, 'square', 0.16); break;
        case 'racelose': this.jingle([12, 9, 5], 0.12, 'triangle', 0.14); break;
        case 'race': this.jingle([12, 12, 19], 0.14, 'square', 0.14); break;
        case 'down': this.jingle([12, 7, 4, 0], 0.16, 'triangle', 0.18); break;
        case 'heal': this.jingle([12, 16, 19, 24], 0.05, 'sine', 0.14); break;
        case 'bossdown': this.jingle([12, 16, 19, 24, 19, 24, 28], 0.1, 'square', 0.18); break;
        case 'equip': this.tone(hz(16), 0.05, 'triangle', 0.1); break;
        case 'warp': this.tone(300, 0.5, 'sine', 0.12, 2.5); break;
        case 'slide': break;
        default: break;
      }
    }
  }

  menu() { this.tone(hz(16), 0.04, 'square', 0.07); }
}

export const SONG_NAMES = Object.keys(SONGS);
