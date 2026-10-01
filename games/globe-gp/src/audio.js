// All sound is synthesized with Web Audio: engines, skids, boosts, crowd,
// and a looping tune per location. No audio files.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 4, 5, 7, 8, 10], pentatonic: [0, 2, 4, 7, 9, 12, 14],
};
const STYLES = {
  // kick, snare, hat patterns over 16 steps, bass rhythm, lead density
  swing: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', bass: 'x..x..x.x..x..x.', lead: 0.45 },
  samba: { kick: 'x..x..x.x..x..x.', snare: '..x..x....x..x..', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.xx..x.x.xx..x.', lead: 0.55 },
  calm: { kick: 'x.......x.......', snare: '............x...', hat: '..x...x...x...x.', bass: 'x.......x...x...', lead: 0.35 },
  synthwave: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'xxxxxxxxxxxxxxxx', lead: 0.5 },
  desert: { kick: 'x..x....x.x.....', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.x.', bass: 'x...x.x.x...x.x.', lead: 0.5 },
  rock: { kick: 'x...x.x.x...x.x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', lead: 0.4 },
  jazz: { kick: 'x.........x.....', snare: '....x..x....x...', hat: 'x..x.xx..x.xx..x', bass: 'x...x...x...x...', lead: 0.4 },
  polka: { kick: 'x...x...x...x...', snare: '..x...x...x...x.', hat: '................', bass: 'x...x...x...x...', lead: 0.6 },
  ambient: { kick: 'x...............', snare: '................', hat: '....x.......x...', bass: 'x.......x.......', lead: 0.25 },
  menu: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x..x.x..x..x.', lead: 0.5 },
};
const MENU_MUSIC = { bpm: 116, root: 57, scale: 'major', lead: 'square', bass: 'triangle', style: 'menu', prog: [0, 4, 5, 3] };

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor({ muted = false, music = true } = {}) {
    this.muted = muted;
    this.musicOn = music;
    this.ctx = null;
    this.tune = null;
    this.step = 0;
  }

  unlock() {
    // Browsers only allow audio after a click or key press.
    if (!this.ctx && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.connect(this.master);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
      this.musicBus.connect(this.master);
      this.noise = this.makeNoise();
      this.startEngines();
      this.timer = setInterval(() => this.schedule(), 40);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.1);
  }

  makeNoise() {
    const c = this.ctx, buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  loopNoise(type, freq, q = 1) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
    return { gain: g, filter: f };
  }

  // ------------------------------------------------------------ engines

  startEngines() {
    const c = this.ctx;
    const mk = (type) => {
      const o = c.createOscillator();
      o.type = type;
      o.start();
      return o;
    };
    this.eng = { gain: c.createGain(), filter: c.createBiquadFilter(), o1: mk('sawtooth'), o2: mk('square'), sub: mk('sine') };
    const e = this.eng;
    e.gain.gain.value = 0;
    e.filter.type = 'lowpass';
    e.filter.frequency.value = 900;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const g3 = c.createGain(); g3.gain.value = 0.6;
    e.o1.connect(e.filter); e.o2.connect(g2).connect(e.filter); e.sub.connect(g3).connect(e.filter);
    e.filter.connect(e.gain).connect(this.sfx);
    // One shared voice for the nearest rival.
    this.rival = { gain: c.createGain(), o: mk('sawtooth'), filter: c.createBiquadFilter() };
    this.rival.gain.gain.value = 0;
    this.rival.filter.type = 'lowpass';
    this.rival.filter.frequency.value = 700;
    this.rival.o.connect(this.rival.filter).connect(this.rival.gain).connect(this.sfx);
    this.skid = this.loopNoise('bandpass', 1400, 2.5);
    this.rumble = this.loopNoise('lowpass', 260);
    this.whoosh = this.loopNoise('bandpass', 700, 0.8);
    this.crowd = this.loopNoise('bandpass', 900, 0.6);
  }

  setCar(car) {
    this.profile = car.engine;
    if (!this.eng) return;
    this.eng.o1.type = car.engine.wave;
  }

  // Gear-shifting RPM from speed, so the pitch climbs, drops, climbs.
  rpm(speed, max, gears) {
    const t = Math.max(0, Math.min(1, speed / max));
    if (gears <= 1) return t;
    const g = Math.min(gears - 1, Math.floor(t * gears));
    const inGear = t * gears - g;
    return 0.25 + inGear * 0.75 * (1 - g * 0.06) + g * 0.03;
  }

  updateDriving(race, player, throttle, running) {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime, v = player.vehicle, p = this.profile || { base: 55, range: 200, gears: 5, buzz: 0.5 };
    const speed = Math.max(0, v.speed);
    const rpm = this.rpm(speed, v.stats.maxSpeed * 1.1, p.gears);
    const f = p.base + rpm * p.range + (v.boosting || v.turbo > 0 ? 25 : 0);
    const e = this.eng;
    e.o1.frequency.setTargetAtTime(f, t, 0.04);
    e.o2.frequency.setTargetAtTime(f * 0.5 * (1 + p.buzz * 0.01), t, 0.04);
    e.sub.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    e.filter.frequency.setTargetAtTime(500 + rpm * 1800 + throttle * 600, t, 0.08);
    e.gain.gain.setTargetAtTime(running ? 0.06 + throttle * 0.06 + rpm * 0.04 : 0, t, 0.08);
    const skid = running && v.grounded ? Math.min(1, (v.drifting ? 0.6 : 0) + Math.max(0, v.slip - 3) / 10) : 0;
    this.skid.gain.gain.setTargetAtTime(skid * (v.surface === 'asphalt' || v.surface === 'wet' ? 0.12 : 0.04), t, 0.05);
    this.skid.filter.frequency.setTargetAtTime(v.surface === 'snow' ? 2600 : 1300, t, 0.1);
    const loose = v.surface === 'sand' || v.surface === 'dirt' || v.surface === 'snow' || v.surface === 'grass';
    this.rumble.gain.gain.setTargetAtTime(running && loose ? Math.min(0.16, speed / 200) : 0, t, 0.1);
    this.whoosh.gain.gain.setTargetAtTime(running && (v.boosting || v.turbo > 0) ? 0.12 : 0, t, 0.06);
    // Nearest rival.
    let near = null, best = 40 * 40;
    for (const r of race.racers) {
      if (r === player || r.eliminated) continue;
      const d = (r.vehicle.x - v.x) ** 2 + (r.vehicle.z - v.z) ** 2;
      if (d < best) { best = d; near = r; }
    }
    if (near) {
      const rr = this.rpm(Math.max(0, near.vehicle.speed), near.vehicle.stats.maxSpeed * 1.1, 5);
      this.rival.o.frequency.setTargetAtTime(50 + rr * 190, t, 0.05);
    }
    this.rival.gain.gain.setTargetAtTime(running && near ? 0.045 * (1 - Math.sqrt(best) / 40) : 0, t, 0.1);
  }

  silence() {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime;
    for (const g of [this.eng.gain, this.rival.gain, this.skid.gain, this.rumble.gain, this.whoosh.gain]) g.gain.setTargetAtTime(0, t, 0.05);
  }

  cheer(amount = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.crowd.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.09 * amount, t, 0.1);
    g.setTargetAtTime(0, t + 1.6, 0.6);
  }

  // ------------------------------------------------------------ one-shots

  tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(dur, { freq = 800, type = 'bandpass', vol = 0.3, q = 1 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  beep(go) {
    this.tone(go ? 880 : 440, go ? 0.5 : 0.22, { type: 'square', vol: 0.18 });
  }

  click() {
    this.tone(660, 0.06, { type: 'triangle', vol: 0.12 });
  }

  handleEvents(events, playerId) {
    if (!this.ctx) return;
    for (const e of events) {
      const mine = e.racer === playerId || e.a === playerId || e.b === playerId;
      switch (e.type) {
        case 'go': this.beep(true); this.cheer(1); break;
        case 'coin': this.tone(1320, 0.08, { type: 'square', vol: 0.08 }); this.tone(1760, 0.12, { type: 'square', vol: 0.08, delay: 0.06 }); break;
        case 'turbo':
          if (mine) { this.burst(0.5, { freq: 1200, vol: 0.25 }); this.tone(300 + e.tier * 120, 0.35, { type: 'sawtooth', vol: 0.08, slide: 500 }); }
          break;
        case 'pad': if (mine) { this.burst(0.4, { freq: 1500, vol: 0.2 }); this.tone(500, 0.3, { type: 'triangle', vol: 0.12, slide: 700 }); } break;
        case 'perfectStart': if (mine) this.tone(660, 0.4, { type: 'square', vol: 0.12, slide: 660 }); break;
        case 'wall': if (mine) this.burst(0.18, { freq: 220, type: 'lowpass', vol: Math.min(0.5, 0.1 + e.impact / 40) }); break;
        case 'bump': if (mine) { this.burst(0.12, { freq: 400, type: 'lowpass', vol: 0.3 }); this.tone(140, 0.12, { type: 'square', vol: 0.1 }); } break;
        case 'land': if (mine && e.air > 0.3) this.burst(0.2, { freq: 160, type: 'lowpass', vol: Math.min(0.4, e.impact / 40) }); break;
        case 'lap': this.tone(784, 0.12, { vol: 0.12 }); this.tone(988, 0.2, { vol: 0.12, delay: 0.12 }); break;
        case 'finalLap': for (let i = 0; i < 3; i++) this.tone(660 + i * 110, 0.12, { vol: 0.12, delay: i * 0.12 }); this.cheer(0.7); break;
        case 'overtake': this.tone(990, 0.08, { type: 'triangle', vol: 0.1 }); this.tone(1320, 0.12, { type: 'triangle', vol: 0.1, delay: 0.07 }); break;
        case 'eliminated': this.tone(300, 0.4, { type: 'sawtooth', vol: 0.12, slide: -200 }); break;
        case 'slip': if (mine) this.tone(520, 0.18, { type: 'sine', vol: 0.1, slide: 200 }); break;
        case 'missed': this.tone(220, 0.4, { type: 'square', vol: 0.12, slide: -80 }); break;
        case 'finish':
          if (mine) { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { vol: 0.13, delay: i * 0.11 })); this.cheer(1.3); }
          break;
      }
    }
  }

  // ------------------------------------------------------------ music

  playMusic(music) {
    const next = music || MENU_MUSIC;
    if (this.tune === next) return;
    this.tune = next;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.1;
  }

  schedule() {
    if (!this.ctx || !this.tune || this.ctx.state !== 'running') return;
    const c = this.ctx;
    if (!this.nextTime || this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    const tune = this.tune, style = STYLES[tune.style] || STYLES.menu, scale = SCALES[tune.scale] || SCALES.major;
    const sixteenth = 60 / tune.bpm / 4;
    while (this.nextTime < c.currentTime + 0.15) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % tune.prog.length;
      const swing = tune.style === 'swing' || tune.style === 'jazz' ? (s % 2 ? sixteenth * 0.3 : 0) : 0;
      const t = this.nextTime + swing;
      const chord = tune.prog[bar];
      const note = (deg, oct = 0) => tune.root + scale[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
      if (style.kick[s] === 'x') this.drum(t, 'kick');
      if (style.snare[s] === 'x') this.drum(t, 'snare');
      if (style.hat[s] === 'x') this.drum(t, 'hat');
      if (style.bass[s] === 'x') this.voice(t, midi(note(chord, -2)), sixteenth * 1.6, tune.bass, 0.5);
      // Lead: a hummable arpeggio that changes each bar.
      const seq = [0, 2, 4, 2, 4, 6, 4, 2];
      if ((s % 2 === 0) && hash(this.step * 7 + bar) < style.lead) {
        const deg = chord + seq[(s / 2 + bar) % 8];
        this.voice(t, midi(note(deg, 0)), sixteenth * 1.8, tune.lead, 0.28);
      }
      if (s === 0) for (const d of [0, 2, 4]) this.voice(t, midi(note(chord + d, -1)), sixteenth * 14, 'triangle', 0.09);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  voice(t, freq, dur, type, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  drum(t, kind) {
    const c = this.ctx;
    if (kind === 'kick') {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + 0.22);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const dur = kind === 'hat' ? 0.04 : 0.14;
    g.gain.setValueAtTime(kind === 'hat' ? 0.25 : 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }
}

function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
