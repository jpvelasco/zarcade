(() => {
  'use strict';

  const G = window.Glow;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Telemetry is optional: the game still runs if telemetry.js is missing.
  const telemetry = window.Telemetry || null;
  const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

  // Each color also has a glyph so the game stays playable without color vision.
  const COLORS = [
    { name: 'amber', hex: '#ffc94d', glyph: 'circle' },
    { name: 'mint', hex: '#5dfdcb', glyph: 'diamond' },
    { name: 'rose', hex: '#ff7eb6', glyph: 'triangle' },
    { name: 'sky', hex: '#7ec8ff', glyph: 'square' },
  ];
  const GOLD = '#ffe27a';
  const THORN = '#ff4d6d';
  const INTRO = 2.4;         // seconds the "Night N" banner shows before the clock runs
  const TRAIL_LIFE = 1.6;    // seconds a trail point survives
  const MIN_LOOP_AREA = 250; // px², ignores accidental squiggles
  const HUD_TOP = 84;
  const JAR = { x: 18, y: 14, w: 40, h: 54 };
  const QUEEN_SHELL_REGROW = 6; // seconds a cracked queen stays catchable

  const TWIST_INFO = {
    wind: { label: 'WINDY', tip: 'Windy night! Gusts push the fireflies around' },
    blackout: { label: 'BLACKOUT', tip: 'Blackout! Fireflies only show when they blink' },
    swarm: { label: 'SWARM', tip: 'Swarm night! Way more fireflies, a little faster' },
  };
  const FRESH_TIPS = {
    shy: 'New: shy fireflies (dotted ring) flee your trail. Worth double!',
    twins: 'New: twin fireflies. Catch both in the same loop!',
    queen: 'New: the Queen! Loop her once to crack her shell, then again',
  };

  // ---------- persistence ----------
  const SAVE_KEY = 'glowloop.v1';
  const save = Object.assign({ bestNight: 0, bestTotal: 0, muted: false }, readSave());
  function readSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
  }
  let saveWarned = false;
  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (error) {
      // Storage unavailable (private mode, full quota): play on, report once.
      if (!saveWarned) log.warn('save.failed', { 'exception.message': String(error && error.message || error) });
      saveWarned = true;
    }
  }

  // ---------- audio (synthesized, no assets) ----------
  const audio = {
    ctx: null,
    master: null,
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = save.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    setMuted(muted) {
      save.muted = muted;
      writeSave();
      if (this.master) this.master.gain.value = muted ? 0 : 0.5;
    },
    tone(freq, delay, dur, type, vol, slideTo) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },
    // Pentatonic arpeggio: one note per firefly, climbing with the streak.
    chime(count, streak, harmony) {
      const scale = [0, 2, 4, 7, 9];
      for (let i = 0; i < Math.min(count, 8); i++) {
        const step = i + Math.min(streak, 6);
        const semis = scale[step % 5] + 12 * Math.floor(step / 5);
        const f = 523.25 * Math.pow(2, semis / 12);
        this.tone(f, i * 0.055, harmony ? 0.7 : 0.35, harmony ? 'sine' : 'triangle', 0.16);
        if (harmony) this.tone(f * 2, i * 0.055 + 0.01, 0.4, 'sine', 0.04);
      }
    },
    ouch() {
      this.tone(180, 0, 0.35, 'sawtooth', 0.12, 60);
      this.tone(90, 0.02, 0.4, 'square', 0.05, 45);
    },
    fizzle() { this.tone(320, 0, 0.12, 'triangle', 0.05, 200); },
    tick() { this.tone(1400, 0, 0.05, 'square', 0.04); },
    warn() {
      this.tone(620, 0, 0.1, 'triangle', 0.07);
      this.tone(620, 0.13, 0.1, 'triangle', 0.07);
    },
    crack() {
      this.tone(1800, 0, 0.06, 'square', 0.05, 900);
      this.tone(1047, 0.05, 0.35, 'sine', 0.1);
    },
    whoosh() {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime, dur = 1.6;
      const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(300, t0);
      band.frequency.exponentialRampToValueAtTime(900, t0 + dur * 0.5);
      band.frequency.exponentialRampToValueAtTime(250, t0 + dur);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + dur * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(band).connect(gain).connect(this.master);
      src.start(t0);
    },
    fanfare(stars) {
      [0, 4, 7, 12, 16].slice(0, 2 + stars)
        .forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), i * 0.12, 0.6, 'sine', 0.14));
    },
    sad() {
      [7, 4, 0].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), i * 0.18, 0.5, 'triangle', 0.1));
    },
  };

  // ---------- canvas, scenery, sprites ----------
  let W = 0, H = 0, DPR = 1, areaScale = 1;
  let scenery = null;
  let skyStars = [];
  const sprites = {};

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function makeGlow(hex, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, hexA(hex, 0.95));
    grd.addColorStop(0.22, hexA(hex, 0.45));
    grd.addColorStop(1, hexA(hex, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function buildSprites() {
    for (const c of COLORS) sprites[c.name] = makeGlow(c.hex);
    sprites.gold = makeGlow(GOLD);
    sprites.thorn = makeGlow(THORN);
    sprites.white = makeGlow('#fff4d6');
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    areaScale = Math.max(0.7, Math.min(1.25, (W * H) / (1280 * 720)));
    buildScenery();
  }

  function hill(g, base, amp, color, phase) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) {
      g.lineTo(x, base - Math.sin(x * 0.004 + phase) * amp - Math.sin(x * 0.011 + phase * 2) * amp * 0.4);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }

  function buildScenery() {
    scenery = document.createElement('canvas');
    scenery.width = canvas.width;
    scenery.height = canvas.height;
    const g = scenery.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#070b24');
    sky.addColorStop(0.55, '#141a44');
    sky.addColorStop(1, '#2b2456');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const mx = W * 0.82, my = H * 0.2, mr = Math.max(24, Math.min(W, H) * 0.05);
    const halo = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
    halo.addColorStop(0, 'rgba(255,244,214,0.22)');
    halo.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = halo;
    g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    g.fillStyle = '#fff1cf';
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(120,100,80,0.12)';
    for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.1]]) {
      g.beginPath();
      g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2);
      g.fill();
    }

    hill(g, H * 0.8, H * 0.05, '#1b1943', 1.3);
    // A few round-canopy trees on the far hill.
    g.fillStyle = '#16143a';
    for (const tx of [0.12, 0.2, 0.63, 0.9]) {
      const x = W * tx, y = H * 0.8 - Math.sin(x * 0.004 + 1.3) * H * 0.05;
      const s = Math.min(W, H) * 0.05;
      g.fillRect(x - s * 0.08, y - s * 1.2, s * 0.16, s * 1.3);
      for (const [dx, dy, r] of [[0, -1.6, 0.7], [-0.45, -1.2, 0.5], [0.45, -1.2, 0.5]]) {
        g.beginPath();
        g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    hill(g, H * 0.9, H * 0.035, '#110e2c', 4.1);

    g.strokeStyle = '#0b0920';
    g.lineWidth = 2;
    g.lineCap = 'round';
    for (let x = 0; x < W; x += 5) {
      const h = 6 + ((x * 7919) % 17);
      const lean = (((x * 31) % 11) - 5) * 0.9;
      g.beginPath();
      g.moveTo(x, H + 2);
      g.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h);
      g.stroke();
    }

    skyStars = [];
    const count = Math.round((W * H) / 9000);
    for (let i = 0; i < count; i++) {
      skyStars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.7,
        r: Math.random() < 0.15 ? 1.6 : 1,
        phase: Math.random() * 10,
        speed: 0.5 + Math.random() * 1.5,
      });
    }
  }

  // ---------- state ----------
  const state = {
    mode: 'title', // title | playing | paused | results
    night: 1,
    score: 0,
    total: 0,
    totalBefore: 0,
    timeLeft: 0,
    streak: 0,
    cfg: Object.assign(G.nightConfig(1), { colors: 4 }),
    flies: [],
    bugs: [],
    particles: [],
    texts: [],
    flashes: [],
    trail: [],
    ghost: null,
    drawing: false,
    pointerId: null,
    shake: 0,
    intro: 0,
    spawnTimer: 0,
    jarPulse: 0,
    lastTick: 0,
    time: 0,
    mixedHintShown: false,
    danger: false,       // the loop being drawn would close around a thornbug
    queenSpawned: false,
    wind: { active: false, timer: 4, dir: 0, power: 0 },
    windLines: [],
  };
  window.Glowloop = { state, startNight }; // handy for poking at the game from the console

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wantFlies = () => Math.round(state.cfg.fireflies * areaScale);

  const isWild = (f) => f.kind === 'gold' || f.kind === 'rainbow';

  function makeFly(kind, c, x, y) {
    const f = {
      x, y,
      vx: 0, vy: 0,
      wander: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
      color: c.name, hex: c.hex, glyph: c.glyph,
      kind,
      alpha: 0,
      panic: 0,
      flee: 0,
      partner: null, // twins only
      hits: 0,       // queen only: 1 once her shell is cracked
      shell: 0,      // queen only: seconds until a cracked shell regrows
    };
    state.flies.push(f);
    return f;
  }

  // `special` allows the rare gold/rainbow kinds (not in the opening swarm).
  function spawnFly(special) {
    const cfg = state.cfg;
    const palette = COLORS.slice(0, cfg.colors);
    const c = palette[Math.floor(Math.random() * palette.length)];
    const r = Math.random();
    let kind = 'normal';
    if (special && r < 0.04) kind = 'gold';
    else if (special && r < 0.09) kind = 'rainbow';
    else if (cfg.shy && r < 0.21) kind = 'shy';
    else if (cfg.twins && r < 0.31) kind = 'twin';
    const x = 40 + Math.random() * (W - 80);
    const y = HUD_TOP + Math.random() * (H - HUD_TOP - 40);
    const f = makeFly(kind, c, x, y);
    if (kind === 'twin') {
      const mate = makeFly('twin', c, clamp(x + 26, 6, W - 6), y);
      f.partner = mate;
      mate.partner = f;
    }
  }

  function spawnQueen() {
    const palette = COLORS.slice(0, state.cfg.colors);
    const q = makeFly('queen', palette[Math.floor(Math.random() * palette.length)], W / 2, H * 0.55);
    q.alpha = 0;
    state.queenSpawned = true;
    addText(W / 2, H * 0.55 - 50, 'The Queen has arrived!', GOLD, 24, 2);
    audio.fanfare(0);
  }

  function spawnBug() {
    const left = Math.random() < 0.5;
    state.bugs.push({
      x: left ? 40 : W - 40,
      y: HUD_TOP + 40 + Math.random() * Math.max(10, H - HUD_TOP - 140),
      heading: (left ? 0 : Math.PI) + (Math.random() - 0.5) * 0.8,
      seed: Math.random() * 10,
      r: 14,
      spin: 0,
      angry: 0,
    });
  }

  function nightTip(n) {
    const cfg = state.cfg;
    if (n === 1) return 'Draw a loop around fireflies of one color';
    if (n === 2) return 'A thornbug appeared. Your trail turns red if you’re about to catch one!';
    if (n === 3) return 'A fourth color joins the meadow';
    if (FRESH_TIPS[cfg.fresh]) return FRESH_TIPS[cfg.fresh];
    if (cfg.twist) return TWIST_INFO[cfg.twist].tip;
    return `Fill the jar with ${cfg.target} glow`;
  }

  // ---------- flow ----------
  function startNight(n) {
    state.night = n;
    state.cfg = G.nightConfig(n);
    state.score = 0;
    state.streak = 0;
    state.timeLeft = state.cfg.duration;
    state.trail = [];
    state.ghost = null;
    state.drawing = false;
    state.particles = [];
    state.texts = [];
    state.flashes = [];
    state.flies = [];
    state.bugs = [];
    state.danger = false;
    state.queenSpawned = false;
    state.wind = { active: false, timer: 4, dir: 0, power: 0 };
    state.windLines = [];
    while (state.flies.length < wantFlies()) spawnFly(false);
    const bugs = Math.max(state.cfg.thornbugs ? 1 : 0, Math.round(state.cfg.thornbugs * Math.min(1, areaScale)));
    for (let i = 0; i < bugs; i++) spawnBug();
    state.intro = INTRO;
    state.lastTick = 0;
    state.mode = 'playing';
    showScreen(null);
    log.event('night.start', { night: n, target: state.cfg.target, twist: state.cfg.twist || 'none' });
  }

  function endNight() {
    state.drawing = false;
    state.trail = [];
    const stars = G.starsFor(state.score, state.cfg.target);
    const passed = stars > 0;
    state.mode = 'results';

    $('res-stars').querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < stars));
    $('res-score').textContent = `${state.score} / ${state.cfg.target} glow`;
    if (passed) {
      state.total = state.totalBefore + state.score;
      save.bestNight = Math.max(save.bestNight, state.night);
      save.bestTotal = Math.max(save.bestTotal, state.total);
      writeSave();
      $('res-title').textContent = `Night ${state.night} complete!`;
      $('res-detail').textContent = `Total glow ${state.total} · Best ${save.bestTotal}`;
      $('res-primary').textContent = 'Next night →';
      $('res-secondary').textContent = 'Replay night';
      audio.fanfare(stars);
      log.event('night.complete', { night: state.night, stars, score: state.score, target: state.cfg.target, total: state.total });
    } else {
      $('res-title').textContent = 'The jar isn’t full yet';
      $('res-detail').textContent = `Only ${state.cfg.target - state.score} glow to go. You’ve got this!`;
      $('res-primary').textContent = 'Try again';
      $('res-secondary').textContent = 'Title screen';
      audio.sad();
      log.event('night.fail', { night: state.night, score: state.score, target: state.cfg.target });
    }
    $('res-primary').onclick = () => {
      if (passed) state.totalBefore = state.total;
      startNight(passed ? state.night + 1 : state.night);
    };
    $('res-secondary').onclick = () => (passed ? startNight(state.night) : toTitle());
    showScreen('results');
    $('res-primary').focus();
  }

  function toTitle() {
    state.mode = 'title';
    state.cfg = Object.assign(G.nightConfig(1), { colors: 4 });
    state.bugs = [];
    state.trail = [];
    state.drawing = false;
    updateBest();
    showScreen('title');
  }

  function pause() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused';
    state.drawing = false;
    state.trail = [];
    showScreen('paused');
    $('btn-resume').focus();
  }

  function resume() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing';
    showScreen(null);
  }

  function showScreen(id) {
    for (const s of ['title', 'paused', 'results']) $(s).classList.toggle('hidden', s !== id);
    $('hud-buttons').classList.toggle('hidden', state.mode !== 'playing' && state.mode !== 'paused');
  }

  function updateBest() {
    $('best').textContent = save.bestNight
      ? `Best: cleared night ${save.bestNight} · ${save.bestTotal} total glow`
      : '';
    const cont = $('btn-continue');
    cont.classList.toggle('hidden', save.bestNight < 1);
    cont.textContent = `Continue at night ${save.bestNight + 1}`;
  }

  function updateMuteButton() {
    $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
    $('btn-mute').setAttribute('aria-pressed', String(save.muted));
  }

  // ---------- input ----------
  function toPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: state.time };
  }

  function addPoint(p) {
    const trail = state.trail;
    if (trail.length && G.dist(trail[trail.length - 1], p) < 6) return;
    const loop = G.findLoop(trail, p);
    if (loop) {
      handleLoop(loop.polygon);
      state.trail = [{ x: loop.point.x, y: loop.point.y, t: p.t }, p];
    } else {
      trail.push(p);
      G.trimToLength(trail, Math.max(700, Math.min(W, H) * 1.8));
    }
  }

  function endStroke() {
    if (!state.drawing) return;
    state.drawing = false;
    if (state.trail.length > 1) state.ghost = { points: state.trail, life: 0.35 };
    state.trail = [];
  }

  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (state.mode !== 'playing') return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* capture is a nicety, not required */ }
    state.drawing = true;
    state.pointerId = e.pointerId;
    state.trail = [toPoint(e)];
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.drawing || e.pointerId !== state.pointerId) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) addPoint(toPoint(ev));
  });
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // ---------- loop resolution ----------
  function addText(x, y, text, color, size = 22, life = 1.2) {
    state.texts.push({ x, y, text, color, size, life, max: life });
  }

  function sparkle(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, color, size: 1.5 + Math.random() * 2 });
    }
  }

  function handleLoop(poly) {
    if (G.polygonArea(poly) < MIN_LOOP_AREA) return;
    const c = G.centroid(poly);
    let caught = state.flies.filter((f) => f.alpha > 0.3 && G.pointInPolygon(f, poly));
    const bugsIn = state.bugs.filter((b) => G.pointInPolygon(b, poly));

    if (bugsIn.length) {
      state.timeLeft = Math.max(0, state.timeLeft - 5);
      state.streak = 0;
      state.shake = 1;
      for (const b of bugsIn) b.angry = 1.5;
      for (const f of caught) {
        const a = Math.atan2(f.y - c.y, f.x - c.x);
        f.vx = Math.cos(a) * 300;
        f.vy = Math.sin(a) * 300;
        f.panic = 0.7;
      }
      state.flashes.push({ poly, color: THORN, life: 0.5, max: 0.5 });
      addText(c.x, c.y, 'Ouch! −5s', THORN, 26);
      audio.ouch();
      return;
    }

    // A twin looped without its partner slips away.
    const inLoop = new Set(caught);
    const lonelyTwins = caught.filter((f) => f.kind === 'twin' && f.partner && !inLoop.has(f.partner));
    for (const f of lonelyTwins) {
      f.vx = (f.partner.x - f.x) * 4;
      f.vy = (f.partner.y - f.y) * 4;
      f.panic = 0.5;
    }
    if (lonelyTwins.length) addText(c.x, c.y + 28, 'Twins stick together!', lonelyTwins[0].hex, 17, 1.6);

    // The first loop only cracks the queen's shell.
    const queen = caught.find((f) => f.kind === 'queen' && f.hits === 0);
    if (queen) {
      queen.hits = 1;
      queen.shell = QUEEN_SHELL_REGROW;
      queen.panic = 0.8;
      sparkle(queen.x, queen.y, '#ffffff', 14);
      addText(queen.x, queen.y - 36, 'Crack! Loop her again!', GOLD, 20, 1.8);
      audio.crack();
    }
    caught = caught.filter((f) => f !== queen && !lonelyTwins.includes(f));

    if (!caught.length) {
      state.flashes.push({ poly, color: '#fff4d6', life: 0.25, max: 0.25 });
      if (!queen && !lonelyTwins.length) audio.fizzle();
      return;
    }

    const res = G.scoreLoop(caught.map((f) => ({ color: f.color, kind: f.kind })), state.streak);
    state.streak = res.streak;
    state.score += res.points;
    state.timeLeft += res.bonusTime;

    const colored = caught.find((f) => !isWild(f));
    const tint = res.harmony ? (colored ? colored.hex : GOLD) : '#fff4d6';
    state.flashes.push({ poly, color: tint, life: 0.6, max: 0.6 });

    const caughtSet = new Set(caught);
    state.flies = state.flies.filter((f) => !caughtSet.has(f));
    for (const f of caught) {
      state.particles.push({
        home: true, sx: f.x, sy: f.y, cx: (f.x + JAR.x) / 2, cy: Math.min(f.y, JAR.y) - 80,
        t: 0, dur: 0.6 + Math.random() * 0.3, x: f.x, y: f.y,
        color: f.kind === 'gold' ? 'gold' : f.kind === 'rainbow' ? COLORS[0].name : f.color,
      });
      sparkle(f.x, f.y, f.kind === 'gold' ? GOLD : f.hex, 6);
    }

    const n = caught.reduce((sum, f) => sum + G.weightOf(f.kind), 0);
    const royal = caught.some((f) => f.kind === 'queen');
    if (royal) state.shake = Math.max(state.shake, 0.6);
    if (res.harmony) {
      const word = royal ? 'Royal Harmony!' : n >= 7 ? 'Supernova!' : n >= 5 ? 'Radiant!' : 'Harmony!';
      addText(c.x, c.y, `+${res.points} ${word}`, tint, 24 + Math.min(n, 8) * 2, 1.4);
      if (res.multiplier > 1) addText(c.x, c.y + 30, `streak ×${res.multiplier}`, '#fff4d6', 16, 1.2);
      if (n >= 5) state.shake = Math.max(state.shake, 0.35);
    } else {
      addText(c.x, c.y, royal ? `+${res.points} Queen caught!` : `+${res.points}`, royal ? GOLD : '#fff4d6', royal ? 28 : 22);
      if (!state.mixedHintShown && state.night <= 2 && n >= 2) {
        state.mixedHintShown = true;
        addText(c.x, c.y + 30, 'Tip: one color per loop = bonus!', '#7ec8ff', 16, 2.4);
      }
    }
    if (res.bonusTime) addText(c.x, c.y - 32, `+${res.bonusTime}s`, GOLD, 22, 1.4);
    audio.chime(Math.round(n), state.streak, res.harmony);
  }

  // Warns before a loop closes around a thornbug: the trail turns red and the
  // bug puffs up, so a penalty is never a surprise.
  function updateDanger() {
    const poly = state.drawing ? G.pendingLoop(state.trail, 90, 6) : null;
    let danger = false;
    for (const b of state.bugs) {
      b.alert = !!poly && G.pointInPolygon(b, poly);
      danger = danger || b.alert;
    }
    if (danger && !state.danger) audio.warn();
    state.danger = danger;
  }

  function updateWind(dt) {
    const w = state.wind;
    if (state.cfg.twist !== 'wind') { w.power = 0; return; }
    w.timer -= dt;
    if (w.timer <= 0) {
      w.active = !w.active;
      if (w.active) {
        w.timer = 2.5;
        w.dir = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.6;
        audio.whoosh();
      } else {
        w.timer = 3.5 + Math.random() * 3;
      }
    }
    w.power += ((w.active ? 1 : 0) - w.power) * Math.min(1, dt * 2);
    if (w.power > 0.2 && Math.random() < w.power * dt * 40) {
      state.windLines.push({ x: Math.cos(w.dir) > 0 ? -60 : W + 60, y: Math.random() * H, len: 40 + Math.random() * 80, life: 1.4 });
    }
    const speed = 700 * Math.cos(w.dir);
    state.windLines = state.windLines.filter((l) => {
      l.x += speed * dt;
      l.life -= dt;
      return l.life > 0;
    });
  }

  // ---------- simulation ----------
  function update(dt) {
    state.time += dt;
    if (state.mode === 'paused') return;
    const playing = state.mode === 'playing';

    if (playing) {
      if (state.intro > 0) {
        state.intro -= dt;
      } else {
        state.timeLeft -= dt;
        const whole = Math.ceil(state.timeLeft);
        if (state.timeLeft <= 10 && state.timeLeft > 0 && whole !== state.lastTick) {
          state.lastTick = whole;
          audio.tick();
        }
        if (state.timeLeft <= 0) {
          state.timeLeft = 0;
          endNight();
        }
      }
      while (state.trail.length > 2 && state.time - state.trail[0].t > TRAIL_LIFE) state.trail.shift();
      if (state.cfg.queen && !state.queenSpawned && state.intro <= 0 && state.timeLeft < state.cfg.duration * 0.7) spawnQueen();
    }
    updateDanger();
    updateWind(dt);

    state.spawnTimer -= dt;
    if (state.flies.length < wantFlies() && state.spawnTimer <= 0) {
      spawnFly(playing);
      state.spawnTimer = 0.3;
    }

    updateFlies(dt);
    updateBugs(dt);
    updateFx(dt);
  }

  function updateFlies(dt) {
    const flies = state.flies;
    for (const f of flies) {
      f.alpha = Math.min(1, f.alpha + dt * 1.5);
      f.panic = Math.max(0, f.panic - dt);
      f.wander += (Math.random() - 0.5) * 4 * dt;
      let ax = Math.cos(f.wander) * 60, ay = Math.sin(f.wander) * 60;

      // Same-color fireflies drift together, which makes Harmony loops possible.
      let cx = 0, cy = 0, cn = 0;
      for (const o of flies) {
        if (o === f) continue;
        const dx = o.x - f.x, dy = o.y - f.y, d2 = dx * dx + dy * dy;
        if (d2 < 30 * 30 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          ax -= (dx / d) * 320;
          ay -= (dy / d) * 320;
        } else if (!isWild(f) && !isWild(o) && o.color === f.color && d2 < 200 * 200) {
          cx += o.x; cy += o.y; cn++;
        }
      }
      if (cn) {
        ax += (cx / cn - f.x) * 0.35;
        ay += (cy / cn - f.y) * 0.35;
      }

      for (const b of state.bugs) {
        const dx = f.x - b.x, dy = f.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 110 * 110 && d2 > 0.01) {
          const d = Math.sqrt(d2), k = (1 - d / 110) * 700;
          ax += (dx / d) * k;
          ay += (dy / d) * k;
        }
      }

      f.flee = Math.max(0, f.flee - dt);
      if (f.kind === 'shy' && state.drawing && state.trail.length) {
        const tip = state.trail[state.trail.length - 1];
        const dx = f.x - tip.x, dy = f.y - tip.y, d = Math.hypot(dx, dy);
        if (d < 140 && d > 0.1) {
          const k = (1 - d / 140) * 1100;
          ax += (dx / d) * k;
          ay += (dy / d) * k;
          f.flee = 0.3;
        }
      }
      if (f.kind === 'twin' && f.partner) {
        const dx = f.partner.x - f.x, dy = f.partner.y - f.y, d = Math.hypot(dx, dy);
        if (d > 34) { ax += dx * 2.5; ay += dy * 2.5; }
      }
      if (f.kind === 'queen' && f.hits > 0 && (f.shell -= dt) <= 0) {
        f.hits = 0;
        addText(f.x, f.y - 36, 'Her shell grew back', '#fff4d6', 16, 1.4);
      }
      if (state.wind.power > 0) {
        ax += Math.cos(state.wind.dir) * state.wind.power * 260;
        ay += Math.sin(state.wind.dir) * state.wind.power * 260;
      }

      // Near an edge, turn the wander heading back toward the meadow's middle,
      // otherwise fireflies drift into walls and stay there.
      const m = 90;
      const top = HUD_TOP + 20;
      if (f.x < m || f.x > W - m || f.y < top || f.y > H - m) {
        const home = Math.atan2(H * 0.55 - f.y, W / 2 - f.x);
        const diff = Math.atan2(Math.sin(home - f.wander), Math.cos(home - f.wander));
        f.wander += diff * Math.min(1, 3 * dt);
      }
      ax += (W / 2 - f.x) * 0.012;
      ay += (H * 0.55 - f.y) * 0.012;
      if (f.x < 30) ax += (30 - f.x) * 14;
      if (f.x > W - 30) ax -= (f.x - (W - 30)) * 14;
      if (f.y < top) ay += (top - f.y) * 14;
      if (f.y > H - 30) ay -= (f.y - (H - 30)) * 14;

      f.vx += ax * dt;
      f.vy += ay * dt;
      let max = state.cfg.speed * (f.panic > 0 ? 3.5 : 1) * (1 + state.wind.power * 1.5);
      if (f.kind === 'gold') max *= 1.3;
      if (f.flee > 0) max *= 1.7;
      if (f.kind === 'queen') max *= f.hits > 0 ? 1.5 : 0.75;
      const sp = Math.hypot(f.vx, f.vy);
      if (sp > max) { f.vx *= max / sp; f.vy *= max / sp; }
      f.x = clamp(f.x + f.vx * dt, 6, W - 6);
      f.y = clamp(f.y + f.vy * dt, HUD_TOP, H - 6);
    }
  }

  function updateBugs(dt) {
    for (const b of state.bugs) {
      b.angry = Math.max(0, b.angry - dt);
      b.heading += Math.sin(state.time * 0.8 + b.seed) * 0.9 * dt;
      const s = state.cfg.bugSpeed * (b.angry > 0 ? 1.8 : 1);
      b.x += (Math.cos(b.heading) * s + Math.cos(state.wind.dir) * state.wind.power * 50) * dt;
      b.y += (Math.sin(b.heading) * s + Math.sin(state.wind.dir) * state.wind.power * 50) * dt;
      b.spin += dt * (b.angry > 0 ? 8 : 1.5);
      if (b.x < b.r) { b.x = b.r; b.heading = Math.PI - b.heading; }
      if (b.x > W - b.r) { b.x = W - b.r; b.heading = Math.PI - b.heading; }
      if (b.y < HUD_TOP) { b.y = HUD_TOP; b.heading = -b.heading; }
      if (b.y > H - b.r) { b.y = H - b.r; b.heading = -b.heading; }
    }
  }

  function updateFx(dt) {
    const jx = JAR.x + JAR.w / 2, jy = JAR.y + JAR.h * 0.6;
    state.particles = state.particles.filter((p) => {
      if (p.home) {
        // Quadratic bezier flight into the jar.
        p.t += dt / p.dur;
        if (p.t >= 1) { state.jarPulse = 1; return false; }
        const t = p.t * p.t * (3 - 2 * p.t), u = 1 - t;
        p.x = u * u * p.sx + 2 * u * t * p.cx + t * t * jx;
        p.y = u * u * p.sy + 2 * u * t * p.cy + t * t * jy;
        return true;
      }
      p.life -= dt;
      p.vx *= 1 - 2 * dt;
      p.vy = p.vy * (1 - 2 * dt) + 30 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.life > 0;
    });
    state.texts = state.texts.filter((t) => {
      t.life -= dt;
      t.y -= 30 * dt;
      return t.life > 0;
    });
    state.flashes = state.flashes.filter((f) => (f.life -= dt) > 0);
    if (state.ghost && (state.ghost.life -= dt) <= 0) state.ghost = null;
    state.shake = Math.max(0, state.shake - dt * 2.5);
    state.jarPulse = Math.max(0, state.jarPulse - dt * 3);
  }

  // ---------- rendering ----------
  function tracePath(pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGlyph(glyph, x, y, s) {
    ctx.beginPath();
    if (glyph === 'circle') {
      ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
    } else if (glyph === 'diamond') {
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
    } else if (glyph === 'triangle') {
      ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.95, y + s * 0.75); ctx.lineTo(x - s * 0.95, y + s * 0.75);
    } else if (glyph === 'square') {
      ctx.rect(x - s * 0.72, y - s * 0.72, s * 1.44, s * 1.44);
    } else {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.45 : s * 1.1;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawSkyStars() {
    ctx.fillStyle = '#fff4d6';
    for (const s of skyStars) {
      ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(state.time * s.speed + s.phase));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawFlashes() {
    for (const f of state.flashes) {
      const k = f.life / f.max;
      tracePath(f.poly, true);
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = f.color;
      ctx.fill();
      ctx.globalAlpha = k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function flySprite(f) {
    if (f.kind === 'gold') return sprites.gold;
    if (f.kind === 'rainbow') return sprites[COLORS[Math.floor(state.time * 3 + f.phase) % COLORS.length].name];
    return sprites[f.color];
  }

  // Blackout nights: fireflies only show while blinking, or near your trail tip.
  function visibility(f) {
    if (state.cfg.twist !== 'blackout') return 1;
    let lit = clamp((Math.sin(state.time * 1.4 + f.phase * 1.7) - 0.1) * 3, 0, 1);
    if (state.drawing && state.trail.length) {
      const tip = state.trail[state.trail.length - 1];
      lit = Math.max(lit, clamp(1.6 - G.dist(f, tip) / 90, 0, 1));
    }
    return 0.1 + 0.9 * lit;
  }

  function drawFlies() {
    const t = state.time;
    for (const f of state.flies) f.vis = f.alpha * visibility(f);

    // Twin tethers, drawn once per pair.
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const f of state.flies) {
      if (f.kind !== 'twin' || !f.partner || f.x > f.partner.x) continue;
      ctx.globalAlpha = 0.85 * Math.min(f.vis, f.partner.vis);
      ctx.strokeStyle = f.hex;
      ctx.setLineDash([1, 6]);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.partner.x, f.partner.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.globalCompositeOperation = 'lighter';
    for (const f of state.flies) {
      const size = f.kind === 'queen' ? 80 : f.kind === 'gold' ? 50 : 40;
      const R = size * (0.8 + 0.2 * Math.sin(t * 3 + f.phase));
      ctx.globalAlpha = f.vis * 0.9;
      ctx.drawImage(flySprite(f), f.x - R, f.y - R, R * 2, R * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const f of state.flies) {
      ctx.globalAlpha = f.vis;
      const queen = f.kind === 'queen';
      const scale = queen ? 1.5 : 1;
      const flap = (2.6 + Math.abs(Math.sin(t * 18 + f.phase)) * 2.2) * scale;
      ctx.fillStyle = 'rgba(230,240,255,0.35)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(f.x + side * 7 * scale, f.y - 5 * scale, 7 * scale, flap, side * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      const gold = f.kind === 'gold';
      ctx.fillStyle = gold ? GOLD : f.kind === 'rainbow' ? `hsl(${(t * 140 + f.phase * 50) % 360},95%,72%)` : f.hex;
      ctx.beginPath();
      ctx.arc(f.x, f.y, queen ? 14 : gold ? 10 : 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(12,14,40,0.6)';
      drawGlyph(isWild(f) ? 'star' : f.glyph, f.x, f.y, queen ? 6 : 4.2);

      if (f.kind === 'shy') {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, 14, t * 2, t * 2 + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (queen) {
        drawCrown(f.x, f.y - 22);
        // Shell: a solid ring until cracked, then a flickering broken ring.
        ctx.strokeStyle = f.hits ? `rgba(255,255,255,${0.3 + 0.3 * Math.sin(t * 20)})` : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        if (f.hits) ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, 21, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCrown(x, y) {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(x - 9, y + 5);
    ctx.lineTo(x - 10, y - 5);
    ctx.lineTo(x - 4, y);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x + 10, y - 5);
    ctx.lineTo(x + 9, y + 5);
    ctx.closePath();
    ctx.fill();
  }

  function drawBugs() {
    for (const b of state.bugs) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.angry > 0 || b.alert ? 0.95 : 0.5;
      const glow = b.alert ? 110 : 80;
      ctx.drawImage(sprites.thorn, b.x - glow / 2, b.y - glow / 2, glow, glow);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Alerted bugs puff up so the player sees the danger before closing the loop.
      b.puff = (b.puff || 0) + ((b.alert ? 1 : 0) - (b.puff || 0)) * 0.25;
      const spikeLen = 8 + b.puff * 7;
      ctx.beginPath();
      const spikes = 9;
      for (let i = 0; i < spikes * 2; i++) {
        const a = b.spin + (i * Math.PI) / spikes, rr = i % 2 === 0 ? b.r + spikeLen : b.r - 1;
        ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#4a1238';
      ctx.fill();
      ctx.strokeStyle = THORN;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#6b1d52';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 2, 0, Math.PI * 2);
      ctx.fill();

      const ex = Math.cos(b.heading), ey = Math.sin(b.heading);
      for (const side of [-1, 1]) {
        const ox = b.x + ex * 3 - ey * side * 5, oy = b.y + ey * 3 + ex * side * 5;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ox, oy, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0612';
        ctx.beginPath();
        ctx.arc(ox + ex * 1.4, oy + ey * 1.4, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.alert) {
        ctx.font = '900 22px ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(7,11,36,0.9)';
        ctx.strokeText('!', b.x, b.y - b.r - 22);
        ctx.fillStyle = THORN;
        ctx.fillText('!', b.x, b.y - b.r - 22);
      }
    }
  }

  function drawTrailPoints(pts, fade, danger) {
    if (pts.length < 2) return;
    const rgb = danger ? '255,77,109' : '255,248,225';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    tracePath(pts, false);
    ctx.strokeStyle = danger ? `rgba(255,77,109,${0.35 * fade})` : `rgba(255,220,140,${0.2 * fade})`;
    ctx.lineWidth = danger ? 18 : 14;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 1; i < pts.length; i++) {
      const k = i / (pts.length - 1);
      ctx.strokeStyle = `rgba(${rgb},${(0.15 + 0.85 * k) * fade})`;
      ctx.lineWidth = 1.5 + 3 * k;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }

  function drawTrail() {
    if (state.ghost) drawTrailPoints(state.ghost.points, state.ghost.life / 0.35);
    drawTrailPoints(state.trail, 1, state.danger);
    if (state.drawing && state.trail.length) {
      const tip = state.trail[state.trail.length - 1];
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sprites.white, tip.x - 20, tip.y - 20, 40, 40);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawParticles() {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      if (p.home) {
        ctx.globalAlpha = 1;
        ctx.drawImage(sprites[p.color], p.x - 14, p.y - 14, 28, 28);
      } else {
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of state.texts) {
      const age = t.max - t.life;
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.4 : 1;
      ctx.globalAlpha = Math.min(1, t.life / 0.4);
      ctx.font = `800 ${Math.round(t.size * pop)}px ui-rounded, system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(7,11,36,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const target = state.cfg.target;
    const fill = Math.min(1, state.score / target);
    const { x, y, w, h } = JAR;

    ctx.save();
    const s = 1 + state.jarPulse * 0.08;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(s, s);
    ctx.translate(-(x + w / 2), -(y + h / 2));
    roundRectPath(x, y + 6, w, h - 6, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    const lh = (h - 8) * fill;
    const liquid = ctx.createLinearGradient(0, y + h - lh, 0, y + h);
    liquid.addColorStop(0, fill >= 1 ? '#fff3a0' : '#ffd66b');
    liquid.addColorStop(1, '#ff9f5a');
    ctx.fillStyle = liquid;
    ctx.fillRect(x, y + h - lh, w, lh);
    ctx.restore();
    if (fill >= 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(state.time * 4);
      ctx.drawImage(sprites.gold, x - 20, y - 14, w + 40, h + 40);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    roundRectPath(x, y + 6, w, h - 6, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#b98b5e';
    roundRectPath(x + 5, y, w - 10, 8, 3);
    ctx.fill();
    ctx.restore();

    const tx = x + w + 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,244,214,0.65)';
    ctx.font = '700 12px ui-rounded, system-ui, sans-serif';
    const twist = state.cfg.twist ? ` · ${TWIST_INFO[state.cfg.twist].label}` : '';
    ctx.fillText(`NIGHT ${state.night}${twist}`, tx, y + 18);
    ctx.font = '800 24px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = fill >= 1 ? GOLD : '#fff4d6';
    const scoreText = String(state.score);
    ctx.fillText(scoreText, tx, y + 44);
    const sw = ctx.measureText(scoreText).width;
    ctx.font = '600 15px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,244,214,0.6)';
    ctx.fillText(` / ${target}`, tx + sw, y + 44);
    if (state.streak > 1) {
      ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
      ctx.fillStyle = COLORS[1].hex;
      ctx.fillText(`Harmony streak ×${state.streak}`, tx, y + 64);
    }

    // Timer ring: centered on wide screens, tucked beside the buttons on narrow ones.
    const cx = W > 560 ? W / 2 : W - 150, cy = 40, r = 24;
    const low = state.timeLeft <= 10;
    const frac = clamp(state.timeLeft / state.cfg.duration, 0, 1);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = low ? THORN : '#fff4d6';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    const beat = low && !reducedMotion ? 1 + 0.12 * Math.max(0, Math.sin(state.time * Math.PI * 2)) : 1;
    ctx.font = `800 ${Math.round(18 * beat)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = low ? THORN : '#fff4d6';
    ctx.fillText(String(Math.ceil(state.timeLeft)), cx, cy + 1);
  }

  function wrapLines(text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawWind() {
    if (!state.windLines.length) return;
    ctx.strokeStyle = 'rgba(200,220,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    const dx = Math.cos(state.wind.dir), dy = Math.sin(state.wind.dir);
    for (const l of state.windLines) {
      ctx.globalAlpha = Math.min(1, l.life) * state.wind.power;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x - dx * l.len, l.y - dy * l.len * 0.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    const age = INTRO - state.intro;
    ctx.globalAlpha = clamp(Math.min(age / 0.3, state.intro / 0.5), 0, 1);
    // Dark band so the text stays readable over glowing fireflies.
    const top = H * 0.42 - 70, height = 170;
    const band = ctx.createLinearGradient(0, top, 0, top + height);
    band.addColorStop(0, 'rgba(7,11,36,0)');
    band.addColorStop(0.3, 'rgba(7,11,36,0.75)');
    band.addColorStop(0.7, 'rgba(7,11,36,0.75)');
    band.addColorStop(1, 'rgba(7,11,36,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, top, W, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,201,77,0.7)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#fff4d6';
    ctx.font = `900 ${Math.round(clamp(W * 0.08, 40, 76))}px ui-rounded, system-ui, sans-serif`;
    ctx.fillText(`Night ${state.night}`, W / 2, H * 0.42);
    ctx.shadowBlur = 0;
    ctx.font = `700 ${Math.round(clamp(W * 0.03, 16, 22))}px ui-rounded, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,244,214,0.85)';
    wrapLines(nightTip(state.night), W - 48).forEach((line, i) => ctx.fillText(line, W / 2, H * 0.42 + 52 + i * 28));
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (state.shake > 0 && !reducedMotion) {
      const s = state.shake * 10;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    ctx.drawImage(scenery, 0, 0, W, H);
    drawSkyStars();
    if (state.cfg.twist === 'blackout' && state.mode !== 'title') {
      ctx.fillStyle = 'rgba(2,3,12,0.6)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    drawWind();
    drawFlashes();
    drawFlies();
    drawBugs();
    drawTrail();
    drawParticles();
    drawTexts();
    ctx.restore();
    if (state.mode !== 'title') drawHud();
    if (state.mode === 'playing' && state.intro > 0) drawBanner();
  }

  // ---------- wiring ----------
  $('btn-continue').addEventListener('click', () => {
    audio.unlock();
    log.event('continue.used', { night: save.bestNight + 1 });
    state.total = 0;
    state.totalBefore = 0;
    startNight(save.bestNight + 1);
  });
  $('btn-play').addEventListener('click', () => {
    audio.unlock();
    state.total = 0;
    state.totalBefore = 0;
    startNight(1);
  });
  $('btn-pause').addEventListener('click', pause);
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', toTitle);
  $('btn-mute').addEventListener('click', () => {
    audio.unlock();
    audio.setMuted(!save.muted);
    updateMuteButton();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (state.mode === 'playing') pause();
      else if (state.mode === 'paused') resume();
    } else if (e.key === 'm' || e.key === 'M') {
      $('btn-mute').click();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('resize', resize);

  buildSprites();
  resize();
  updateBest();
  updateMuteButton();


  // Hide the mouse pointer while playing, like a video player: it vanishes
  // after a moment without movement and comes back as soon as the mouse moves.
  let pointerIdle = 0, pointerHidden = false;
  window.addEventListener('mousemove', () => { pointerIdle = 0; });
  function updatePointer(dt, playing) {
    pointerIdle += dt;
    const hide = playing && pointerIdle > 1.5;
    if (hide !== pointerHidden) {
      pointerHidden = hide;
      document.body.classList.toggle('no-cursor', hide);
    }
  }

  // Frame telemetry: slow frames, struggling 10 s windows, and a watchdog
  // outside the loop that notices when frames stop while the page is visible.
  const monitor = window.GlowPerf.frameMonitor({
    log,
    snapshot: () => ({ mode: state.mode, night: state.night, flies: state.flies.length, particles: state.particles.length }),
    visible: () => document.visibilityState === 'visible',
    crashed: () => !!(telemetry && telemetry.crashed),
  });
  setInterval(() => monitor.check(performance.now()), 1000);
  document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

  let last = performance.now();
  function frame(now) {
    monitor.frame(now);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updatePointer(dt, state.mode === 'playing');
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  // A crash inside a frame shows the crash screen instead of a frozen picture;
  // after a crash the guard returns early, so the loop stops rescheduling.
  const loop = telemetry ? telemetry.guard(frame, 'glowloop.frame') : frame;
  log.event('game.ready', { 'best.night': save.bestNight, 'best.total': save.bestTotal });
  requestAnimationFrame(loop);
})();
