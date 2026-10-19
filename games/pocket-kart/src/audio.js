// All sound is synthesized with Web Audio; there are no audio files.
// Music and effects both run through one master gain, so mute silences
// everything. The engine hum follows the player's kart; a small step
// sequencer plays a bouncy loop per cup.

const semis = (n) => Math.pow(2, n / 12);

// Songs: key (semitones from A3 = 220 Hz), tempo, and 16-step patterns.
// Melody numbers are scale degrees in a major (or minor) pentatonic-ish
// scale; null is a rest.
const SONGS = {
  menu: { key: 3, bpm: 104, minor: false, lead: [0, null, 4, null, 7, null, 4, 2, 0, null, 2, 4, 2, null, null, null], bass: [0, 0, 5, 5, 3, 3, 4, 4], wave: 'triangle' },
  toybox: { key: 3, bpm: 138, minor: false, lead: [7, 9, 7, 4, 2, 4, 7, null, 9, 11, 9, 7, 4, 2, 4, null], bass: [0, 0, 3, 3, 4, 4, 0, 4], wave: 'square' },
  candy: { key: 8, bpm: 128, minor: false, lead: [4, null, 7, 4, 9, null, 7, 4, 2, null, 4, 2, 0, null, 2, null], bass: [0, 5, 3, 4, 0, 5, 3, 4], wave: 'triangle' },
  docks: { key: 0, bpm: 120, minor: true, lead: [0, 3, 7, 10, 7, 3, 0, null, -2, 2, 5, 9, 5, 2, -2, null], bass: [0, 0, 5, 5, 3, 3, 4, 4], wave: 'sawtooth' },
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
const deg = (scale, d) => {
  const o = Math.floor(d / 7);
  const i = ((d % 7) + 7) % 7;
  return scale[i] + o * 12;
};

export class Sound {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.song = SONGS.menu;
    this.songId = 'menu';
    this.musicLevel = 0.6;
    this.step = 0;
    this.nextTime = 0;
    this.engineOn = false;
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
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.6;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      this.music.connect(lp).connect(this.master);
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.buildEngine();
      this.nextTime = c.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 50);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  get ready() { return !!this.ctx; }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyMusic();
  }

  setMusicLevel(level) {
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.applyMusic();
  }

  applyMusic() {
    if (!this.music) return;
    this.music.gain.setTargetAtTime(this.musicOn ? 0.16 * this.musicLevel : 0, this.ctx.currentTime, 0.25);
  }

  setSong(id) {
    if (!SONGS[id] || id === this.songId) return;
    this.songId = id;
    this.song = SONGS[id];
    this.step = 0;
  }

  // ------------------------------------------------------------ engine

  buildEngine() {
    const c = this.ctx;
    this.eng = c.createGain();
    this.eng.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.engFilter = lp;
    this.osc1 = c.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = c.createOscillator();
    this.osc2.type = 'square';
    this.osc1.frequency.value = 60;
    this.osc2.frequency.value = 90;
    const g2 = c.createGain();
    g2.gain.value = 0.35;
    this.osc1.connect(lp);
    this.osc2.connect(g2).connect(lp);
    lp.connect(this.eng).connect(this.sfx);
    this.osc1.start();
    this.osc2.start();
    // Drift hiss.
    this.hiss = c.createBufferSource();
    this.hiss.buffer = this.noiseBuf;
    this.hiss.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.4;
    this.hissGain = c.createGain();
    this.hissGain.gain.value = 0;
    this.hiss.connect(bp).connect(this.hissGain).connect(this.sfx);
    this.hiss.start();
  }

  // Called each frame with the player's kart (or null for silence).
  engine(k, top) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!k) {
      this.eng.gain.setTargetAtTime(0, t, 0.08);
      this.hissGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const f = Math.min(1.5, Math.abs(k.v) / top);
    const boost = k.boostT > 0 || k.cometT > 0 ? 1 : 0;
    const base = 52 + f * 95 + boost * 30;
    this.osc1.frequency.setTargetAtTime(base, t, 0.05);
    this.osc2.frequency.setTargetAtTime(base * 1.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + f * 900 + boost * 600, t, 0.08);
    this.eng.gain.setTargetAtTime(0.05 + f * 0.05, t, 0.08);
    const hiss = k.drift ? 0.05 + k.tier * 0.025 : k.surface !== 'road' && Math.abs(k.v) > 60 ? 0.02 : 0;
    this.hissGain.gain.setTargetAtTime(hiss, t, 0.04);
  }

  // ------------------------------------------------------------ voices

  tone(freq, dur, { type = 'sine', vol = 0.25, slide = 0, at = 0, attack = 0.005, dest = null } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.25, freq = 1200, q = 0.8, type = 'bandpass', at = 0, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, arg) {
    if (!this.ctx) return;
    switch (name) {
      case 'count': this.tone(440, 0.22, { type: 'square', vol: 0.16 }); break;
      case 'go': this.tone(880, 0.45, { type: 'square', vol: 0.18 }); this.tone(1320, 0.4, { type: 'triangle', vol: 0.1, at: 0.02 }); break;
      case 'hop': this.tone(300, 0.08, { type: 'triangle', vol: 0.08, slide: 1.6 }); break;
      case 'spark': {
        const f = [0, 1046, 1318, 1568][arg] || 1046;
        this.tone(f, 0.12, { type: 'triangle', vol: 0.12 });
        this.tone(f * 1.5, 0.12, { type: 'sine', vol: 0.06, at: 0.04 });
        break;
      }
      case 'turbo':
        this.noise(0.45, { vol: 0.22, freq: 500, sweep: 6, q: 0.6 });
        this.tone(180, 0.4, { type: 'sawtooth', vol: 0.08, slide: 3 });
        break;
      case 'pad': this.tone(520, 0.25, { type: 'square', vol: 0.09, slide: 2.4 }); this.noise(0.3, { vol: 0.1, freq: 1500, sweep: 3 }); break;
      case 'box': [1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.09, at: i * 0.04 })); break;
      case 'tick': this.tone(1800, 0.03, { type: 'square', vol: 0.04 }); break;
      case 'item': this.tone(1568, 0.18, { type: 'triangle', vol: 0.12 }); this.tone(2093, 0.25, { type: 'sine', vol: 0.08, at: 0.06 }); break;
      case 'shield': this.tone(400, 0.4, { type: 'sine', vol: 0.14, slide: 2.5 }); this.tone(800, 0.3, { type: 'sine', vol: 0.06, at: 0.08, slide: 1.5 }); break;
      case 'shield-pop': this.noise(0.15, { vol: 0.2, freq: 3000, q: 2 }); this.tone(900, 0.1, { type: 'sine', vol: 0.1, slide: 0.5 }); break;
      case 'star-drop': this.tone(220, 0.3, { type: 'triangle', vol: 0.14, slide: 2 }); break;
      case 'boing': this.tone(160, 0.45, { type: 'sine', vol: 0.22, slide: 3.2 }); this.tone(320, 0.3, { type: 'triangle', vol: 0.08, slide: 2 }); break;
      case 'jelly': this.tone(600, 0.35, { type: 'sine', vol: 0.12, slide: 0.6 }); this.tone(500, 0.3, { type: 'triangle', vol: 0.06, at: 0.05, slide: 1.4 }); break;
      case 'squish': this.noise(0.25, { vol: 0.2, freq: 500, sweep: 0.4, q: 3 }); this.tone(200, 0.3, { type: 'sine', vol: 0.15, slide: 0.5 }); break;
      case 'mushroom': this.tone(330, 0.3, { type: 'square', vol: 0.09, slide: 2 }); this.noise(0.35, { vol: 0.15, freq: 700, sweep: 4 }); break;
      case 'comet': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.09, at: i * 0.05 })); this.noise(0.8, { vol: 0.15, freq: 600, sweep: 5 }); break;
      case 'bump': this.tone(140, 0.18, { type: 'sine', vol: 0.2 * (arg ?? 1), slide: 1.8 }); break;
      case 'wall': this.noise(0.12, { vol: 0.18 * (arg ?? 1), freq: 300, q: 1 }); this.tone(90, 0.12, { type: 'sine', vol: 0.15 * (arg ?? 1) }); break;
      case 'bumper': this.tone(520, 0.25, { type: 'square', vol: 0.12, slide: 0.5 }); this.tone(780, 0.2, { type: 'triangle', vol: 0.08 }); break;
      case 'lap': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.15, { type: 'square', vol: 0.09, at: i * 0.09 })); break;
      case 'final-lap': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, { type: 'square', vol: 0.1, at: i * 0.12 })); break;
      case 'finish': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, { type: i % 2 ? 'triangle' : 'square', vol: 0.11, at: i * 0.11 })); break;
      case 'place-up': this.tone(880, 0.1, { type: 'triangle', vol: 0.07, slide: 1.3 }); break;
      case 'place-down': this.tone(500, 0.1, { type: 'triangle', vol: 0.05, slide: 0.8 }); break;
      case 'tailwind': this.noise(0.6, { vol: 0.08, freq: 900, sweep: 2, q: 0.5 }); break;
      case 'rocket': this.tone(200, 0.5, { type: 'sawtooth', vol: 0.1, slide: 4 }); this.noise(0.5, { vol: 0.14, freq: 400, sweep: 6 }); break;
      case 'ui': this.tone(660, 0.07, { type: 'triangle', vol: 0.08 }); break;
      case 'ui-back': this.tone(440, 0.08, { type: 'triangle', vol: 0.07 }); break;
      case 'trophy': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.12, at: i * 0.1 })); break;
      case 'unlock': [784, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.12, at: i * 0.08 })); break;
      default: break;
    }
  }

  // Maps race events to sounds; only the player's own events are loud.
  handle(events, race, focus) {
    if (!this.ctx) return;
    for (const e of events) {
      const mine = e.kart === focus;
      const near = mine || (e.kart !== undefined && race.karts[focus] && Math.hypot(race.karts[e.kart].x - race.karts[focus].x, race.karts[e.kart].y - race.karts[focus].y) < 260);
      switch (e.type) {
        case 'count': this.play('count'); break;
        case 'go': this.play('go'); break;
        case 'hop': if (mine) this.play('hop'); break;
        case 'spark-tier': if (mine) this.play('spark', e.tier); break;
        case 'miniturbo': if (mine) this.play('turbo'); break;
        case 'pad': if (mine) this.play('pad'); break;
        case 'box': if (mine) this.play('box'); break;
        case 'item': if (mine) this.play('item'); break;
        case 'shield': if (near) this.play('shield'); break;
        case 'shield-pop': if (near) this.play('shield-pop'); break;
        case 'star-drop': if (near) this.play('star-drop'); break;
        case 'star-hit': if (near) this.play('boing'); break;
        case 'jelly-fire': if (mine) this.play('jelly'); break;
        case 'jelly-hit': if (near || e.by === focus) this.play('squish'); break;
        case 'mushroom': if (mine) this.play('mushroom'); break;
        case 'comet': if (mine) this.play('comet'); break;
        case 'bump': if (e.a === focus || e.b === focus) this.play('bump', e.power); break;
        case 'wall': if (mine) this.play('wall', e.power); break;
        case 'bumper': if (near) this.play('bumper'); break;
        case 'lap': if (mine) this.play(e.final ? 'final-lap' : 'lap'); break;
        case 'finish': if (mine) this.play('finish'); break;
        case 'place': if (mine) this.play(e.to < e.from ? 'place-up' : 'place-down'); break;
        case 'tailwind': if (mine) this.play('tailwind'); break;
        case 'rocket': if (mine) this.play('rocket'); break;
        default: break;
      }
    }
  }

  // ------------------------------------------------------------ music

  schedule() {
    const c = this.ctx;
    if (!c) return;
    const song = this.song;
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < c.currentTime + 0.2) {
      const t = this.nextTime;
      const i = this.step % 16;
      const scale = song.minor ? MINOR : MAJOR;
      const root = 220 * semis(song.key);
      // Lead on 8ths; bass on quarters; light drums.
      if (i % 2 === 0) {
        const d = song.lead[(this.step / 2) % 16 | 0];
        if (d !== null && d !== undefined) this.note(root * 2 * semis(deg(scale, d)), stepDur * 1.8, t, song.wave, 0.5);
      }
      if (i % 4 === 0) {
        const b = song.bass[(this.step / 4) % 8 | 0];
        this.note((root / 2) * semis(deg(scale, b)), stepDur * 3.5, t, 'triangle', 0.9);
      }
      if (i % 4 === 0) this.drum(t, 'kick');
      if (i % 8 === 4) this.drum(t, 'snare');
      if (i % 2 === 1) this.drum(t, 'hat');
      this.step++;
      this.nextTime += stepDur;
    }
  }

  note(freq, dur, t, type, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  drum(t, kind) {
    const c = this.ctx;
    if (kind === 'kick') {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 0.17);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const g = c.createGain();
    const dur = kind === 'hat' ? 0.04 : 0.12;
    g.gain.setValueAtTime(kind === 'hat' ? 0.12 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
