// Moonshot Mini Golf: Canvas renderer. Reads play state, never mutates it.
(function (root) {
  'use strict';

  const P = root.MoonshotPhysics;
  const Holes = root.MoonshotHoles;
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, -apple-system, "Segoe UI", sans-serif';

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const easeOutBack = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;

  function shapePath(ctx, s, ox = 0, oy = 0) {
    if (s.circle) {
      ctx.moveTo(s.circle[0] + ox + s.circle[2], s.circle[1] + oy);
      ctx.arc(s.circle[0] + ox, s.circle[1] + oy, s.circle[2], 0, TAU);
    } else {
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
      ctx.closePath();
    }
  }

  function boundsOf(def) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const f of def.floor) {
      const mv = f.move || { dx: 0, dy: 0 };
      if (f.circle) { add(f.circle[0] - f.circle[2], f.circle[1] - f.circle[2]); add(f.circle[0] + f.circle[2], f.circle[1] + f.circle[2]); }
      else for (const [x, y] of f.pts) { add(x, y); add(x + mv.dx, y + mv.dy); }
    }
    for (const w of def.walls || []) for (const [x, y] of w.pts) add(x, y);
    return { x0: x0 - 26, y0: y0 - 26, x1: x1 + 26, y1: y1 + 40 };
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1;
      this.w = 1;
      this.h = 1;
      this.insets = { top: 76, bottom: 18, left: 12, right: 12 };
      this.def = null;
      this.view = null;
      this.world = Holes.WORLDS[0];
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.fx = [];      // world-space particles
      this.confetti = []; // screen-space particles
      this.popups = [];
      this.trail = [];
      this.hits = { bumper: [], spinner: [] };
      this.portalFlash = [];
      this.reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.time = 0;
    }

    resize(w, h, dpr) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.buildBackground();
      if (this.def) this.setHole(this.def, true);
    }

    setHole(def, keepFx) {
      this.def = def;
      this.H = P.prepare(def);
      this.world = Holes.worldOf(def);
      this.pal = this.world.palette;
      if (!keepFx) {
        this.fx = [];
        this.trail = [];
        this.hits = { bumper: [], spinner: [] };
      }
      this.computeView();
      this.buildBackground();
      this.buildCourse();
    }

    computeView() {
      const b = boundsOf(this.def);
      const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      const { top, bottom, left, right } = this.insets;
      const aw = Math.max(50, this.w - left - right), ah = Math.max(50, this.h - top - bottom);
      const flat = Math.min(aw / bw, ah / bh);
      const turned = Math.min(aw / bh, ah / bw);
      const rot = turned > flat * 1.12;
      this.view = {
        rot,
        s: rot ? turned : flat,
        cx: left + aw / 2,
        cy: top + ah / 2,
        wx: (b.x0 + b.x1) / 2,
        wy: (b.y0 + b.y1) / 2,
      };
    }

    applyView(ctx, sx = 0, sy = 0) {
      const v = this.view;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.translate(v.cx + sx, v.cy + sy);
      if (v.rot) ctx.rotate(-Math.PI / 2);
      ctx.scale(v.s, v.s);
      ctx.translate(-v.wx, -v.wy);
    }

    toWorld(sx, sy) {
      const v = this.view;
      let dx = (sx - v.cx) / v.s, dy = (sy - v.cy) / v.s;
      if (v.rot) [dx, dy] = [-dy, dx];
      return { x: v.wx + dx, y: v.wy + dy };
    }

    toScreen(x, y) {
      const v = this.view;
      let dx = (x - v.wx) * v.s, dy = (y - v.wy) * v.s;
      if (v.rot) [dx, dy] = [dy, -dx];
      return { x: v.cx + dx, y: v.cy + dy };
    }

    // Screen-space vector (px) to world-space vector.
    vecToWorld(vx, vy) {
      const v = this.view;
      let dx = vx / v.s, dy = vy / v.s;
      if (v.rot) [dx, dy] = [-dy, dx];
      return { x: dx, y: dy };
    }

    // ------------------------------------------------------------ static layers

    buildBackground() {
      const W = this.canvas.width, Hh = this.canvas.height;
      const c = this.bg || (this.bg = document.createElement('canvas'));
      c.width = W;
      c.height = Hh;
      const g = c.getContext('2d');
      const pal = this.pal || Holes.WORLDS[0].palette;
      const grd = g.createRadialGradient(W * 0.7, Hh * 0.2, 0, W * 0.5, Hh * 0.5, Math.max(W, Hh) * 0.9);
      grd.addColorStop(0, pal.sky1);
      grd.addColorStop(1, pal.sky0);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, Hh);
      const r = rng(hash(this.world.id + W + 'x' + Hh));
      // Nebula puffs.
      for (let i = 0; i < 5; i++) {
        const x = r() * W, y = r() * Hh, rad = (0.2 + r() * 0.35) * Math.max(W, Hh);
        const ng = g.createRadialGradient(x, y, 0, x, y, rad);
        ng.addColorStop(0, i % 2 ? 'rgba(255,120,200,0.09)' : 'rgba(110,160,255,0.09)');
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ng;
        g.fillRect(0, 0, W, Hh);
      }
      const n = Math.round((W * Hh) / (1400 * this.dpr * this.dpr));
      for (let i = 0; i < n; i++) {
        const s = r() ** 3 * 1.8 + 0.4;
        g.globalAlpha = 0.35 + r() * 0.65;
        g.fillStyle = r() < 0.15 ? '#ffe7a8' : r() < 0.2 ? '#a8d8ff' : '#ffffff';
        g.beginPath();
        g.arc(r() * W, r() * Hh, s * this.dpr, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      this.drawSkyPlanet(g, W, Hh, r);
      this.twinkles = Array.from({ length: 36 }, () => ({ x: r(), y: r(), p: r() * TAU, s: 0.8 + r() * 1.4 }));
    }

    drawSkyPlanet(g, W, Hh, r) {
      const d = this.dpr;
      const id = this.world.id;
      const R = Math.min(W, Hh) * 0.12;
      const x = W - R * 1.15, y = Hh - R * 0.95;
      g.save();
      if (id === 'moon') {
        // Earth rising.
        const eg = g.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
        eg.addColorStop(0, '#8fe3ff');
        eg.addColorStop(0.6, '#2f7fe0');
        eg.addColorStop(1, '#173a8a');
        g.fillStyle = eg;
        g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
        g.save(); g.clip();
        g.fillStyle = '#5fd28b';
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.ellipse(x + (r() - 0.5) * R * 1.4, y + (r() - 0.5) * R * 1.4, R * (0.15 + r() * 0.25), R * (0.1 + r() * 0.18), r() * 3, 0, TAU);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.ellipse(x + (r() - 0.5) * R * 1.6, y + (r() - 0.5) * R * 1.6, R * 0.3, R * 0.06, r() * 0.6 - 0.3, 0, TAU);
          g.fill();
        }
        g.restore();
        g.strokeStyle = 'rgba(140,220,255,0.35)';
        g.lineWidth = 6 * d;
        g.beginPath(); g.arc(x, y, R + 4 * d, 0, TAU); g.stroke();
      } else if (id === 'mars') {
        // Phobos and a small warm sun.
        const sx = W * 0.12, sy = Hh * 0.18;
        const sg = g.createRadialGradient(sx, sy, 0, sx, sy, R * 1.2);
        sg.addColorStop(0, 'rgba(255,230,180,0.9)');
        sg.addColorStop(0.15, 'rgba(255,190,120,0.5)');
        sg.addColorStop(1, 'rgba(255,120,80,0)');
        g.fillStyle = sg;
        g.fillRect(sx - R * 1.2, sy - R * 1.2, R * 2.4, R * 2.4);
        const pg = g.createRadialGradient(x - R * 0.2, y - R * 0.2, R * 0.05, x, y, R * 0.55);
        pg.addColorStop(0, '#c9a191');
        pg.addColorStop(1, '#5a3a36');
        g.fillStyle = pg;
        g.beginPath(); g.ellipse(x, y, R * 0.6, R * 0.45, 0.4, 0, TAU); g.fill();
        g.fillStyle = 'rgba(40,20,20,0.35)';
        for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + (r() - 0.5) * R * 0.7, y + (r() - 0.5) * R * 0.5, R * (0.04 + r() * 0.07), 0, TAU); g.fill(); }
      } else {
        // Saturn with its rings.
        g.translate(x, y);
        g.rotate(-0.35);
        g.strokeStyle = 'rgba(255,220,150,0.55)';
        g.lineWidth = R * 0.12;
        g.beginPath(); g.ellipse(0, 0, R * 1.8, R * 0.45, 0, Math.PI, TAU); g.stroke();
        const sg = g.createLinearGradient(0, -R, 0, R);
        sg.addColorStop(0, '#ffe3a1');
        sg.addColorStop(0.5, '#f0b35e');
        sg.addColorStop(1, '#b8743a');
        g.fillStyle = sg;
        g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        g.save(); g.clip();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = -3; i <= 3; i++) g.fillRect(-R, i * R * 0.28, R * 2, R * 0.1);
        g.restore();
        g.strokeStyle = 'rgba(255,230,170,0.85)';
        g.lineWidth = R * 0.12;
        g.beginPath(); g.ellipse(0, 0, R * 1.8, R * 0.45, 0, 0, Math.PI); g.stroke();
        g.strokeStyle = 'rgba(255,200,140,0.45)';
        g.lineWidth = R * 0.05;
        g.beginPath(); g.ellipse(0, 0, R * 2.05, R * 0.55, 0, 0, Math.PI); g.stroke();
      }
      g.restore();
    }

    buildCourse() {
      const c = this.course || (this.course = document.createElement('canvas'));
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      this.applyView(g);
      const def = this.def, H = this.H, pal = this.pal;
      const down = this.vecToWorld(0, 16);
      const statics = H.floor.filter((f) => !f.move);
      const r = rng(hash(def.id));

      // Island thickness and drop shadow.
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.55)';
      g.shadowBlur = 30 * this.dpr;
      g.shadowOffsetY = 12 * this.dpr;
      g.fillStyle = pal.wallShade;
      g.beginPath();
      for (const f of statics) shapePath(g, f, down.x, down.y);
      g.fill();
      g.restore();
      g.fillStyle = pal.wallShade;
      for (let k = 0; k <= 8; k++) {
        g.beginPath();
        for (const f of statics) shapePath(g, f, (down.x * k) / 8, (down.y * k) / 8);
        g.fill();
      }
      // Rock strata on the island side.
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = '#000';
      g.beginPath();
      for (const f of statics) shapePath(g, f, down.x, down.y);
      g.fill();
      g.restore();

      // Floor.
      g.save();
      g.beginPath();
      for (const f of statics) shapePath(g, f);
      g.clip();
      const fg = g.createLinearGradient(0, 0, 1000, 600);
      fg.addColorStop(0, pal.floor);
      fg.addColorStop(1, pal.floorDark);
      g.fillStyle = fg;
      g.fillRect(-200, -200, 1400, 1000);
      this.floorTexture(g, r);
      // Zones.
      for (const z of H.zones) this.drawZone(g, z, r);
      // Slopes.
      for (const s of H.slopes) this.drawSlope(g, s);
      // Soft inner shading along every edge gives the floor some depth.
      g.lineJoin = 'round';
      for (const [w, a] of [[40, 0.1], [16, 0.12]]) {
        g.strokeStyle = `rgba(20,10,60,${a})`;
        g.lineWidth = w;
        g.beginPath();
        for (const f of statics) shapePath(g, f);
        g.stroke();
      }
      g.restore();

      // Hazards cut through the floor.
      for (const hz of H.hazards) {
        if (hz.kind === 'lava') continue;
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.beginPath(); shapePath(g, hz); g.fill();
        g.restore();
        g.save();
        g.beginPath(); shapePath(g, hz); g.clip();
        g.strokeStyle = pal.wallShade;
        g.lineWidth = 18;
        g.beginPath(); shapePath(g, hz, -down.x * 0.5, -down.y * 0.5); g.stroke();
        g.restore();
      }
      for (const hz of H.hazards) if (hz.kind === 'lava') this.drawLavaBase(g, hz);
      for (const d of def.decor || []) if (d.type === 'planet') this.drawPlanetDecor(g, d);

      // Rim highlight on open edges.
      g.strokeStyle = pal.edge;
      g.globalAlpha = 0.6;
      g.lineWidth = 3;
      g.beginPath();
      for (const f of statics) shapePath(g, f);
      g.stroke();
      g.globalAlpha = 1;

      // Tee pad.
      g.save();
      g.translate(H.tee.x, H.tee.y);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.beginPath(); g.arc(0, 0, 24, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.setLineDash([5, 6]);
      g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 24, 0, TAU); g.stroke();
      g.restore();

      // Cup.
      const { x: cx, y: cy } = H.cup;
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.arc(cx, cy, P.CUP_R + 4, 0, TAU); g.fill();
      const cg = g.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, P.CUP_R);
      cg.addColorStop(0, '#05030f');
      cg.addColorStop(0.8, '#1a1233');
      cg.addColorStop(1, '#3a2d63');
      g.fillStyle = cg;
      g.beginPath(); g.arc(cx, cy, P.CUP_R, 0, TAU); g.fill();

      // Walls.
      this.drawWalls(g, def.walls || [], down);

      // Rocks.
      for (const p of H.posts) this.drawRock(g, p, r);
      this.courseKey = this.canvas.width + 'x' + this.canvas.height + def.id;
    }

    floorTexture(g, r) {
      const id = this.world.id;
      if (id === 'moon') {
        for (let i = 0; i < 70; i++) {
          const x = r() * 1000, y = r() * 600, rad = 3 + r() ** 2 * 22;
          g.fillStyle = 'rgba(70,70,140,0.12)';
          g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.22)';
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(x + rad * 0.12, y + rad * 0.12, rad, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
        }
      } else if (id === 'mars') {
        g.strokeStyle = 'rgba(255,230,200,0.14)';
        g.lineWidth = 3;
        for (let y = -40; y < 700; y += 26) {
          g.beginPath();
          for (let x = -40; x <= 1040; x += 20) g.lineTo(x, y + Math.sin(x * 0.012 + y) * 8);
          g.stroke();
        }
        for (let i = 0; i < 120; i++) {
          g.fillStyle = r() < 0.5 ? 'rgba(120,40,20,0.18)' : 'rgba(255,220,190,0.2)';
          g.beginPath(); g.arc(r() * 1000, r() * 600, 1 + r() * 3, 0, TAU); g.fill();
        }
      } else {
        g.lineWidth = 7;
        for (let rad = 40; rad < 800; rad += 22) {
          g.strokeStyle = rad % 3 ? 'rgba(255,255,255,0.07)' : 'rgba(60,30,140,0.1)';
          g.beginPath(); g.arc(500, 300, rad, 0, TAU); g.stroke();
        }
        for (let i = 0; i < 90; i++) {
          g.fillStyle = 'rgba(255,255,255,0.35)';
          const s = r() * 2;
          g.fillRect(r() * 1000, r() * 600, s, s);
        }
      }
    }

    drawZone(g, z, r) {
      g.save();
      g.beginPath(); shapePath(g, z); g.clip();
      if (z.surface === 'sand') {
        g.fillStyle = '#f7d488';
        g.fill();
        g.fillStyle = 'rgba(160,100,30,0.25)';
        for (let i = 0; i < 90; i++) { g.beginPath(); g.arc(r() * 1000, r() * 600, 1 + r() * 1.5, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 2;
        for (let y = 0; y < 600; y += 14) {
          g.beginPath();
          for (let x = 0; x <= 1000; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
          g.stroke();
        }
        g.strokeStyle = 'rgba(150,90,30,0.35)';
        g.lineWidth = 6;
        g.beginPath(); shapePath(g, z); g.stroke();
      } else if (z.surface === 'ice') {
        const ig = g.createLinearGradient(0, 0, 1000, 600);
        ig.addColorStop(0, '#e9fbff');
        ig.addColorStop(1, '#a6e4ff');
        g.fillStyle = ig;
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 3;
        for (let i = 0; i < 14; i++) {
          const x = r() * 1000, y = r() * 600;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + r() * 30, y - 12 - r() * 12); g.stroke();
        }
        g.strokeStyle = 'rgba(80,160,220,0.4)';
        g.lineWidth = 5;
        g.beginPath(); shapePath(g, z); g.stroke();
      }
      g.restore();
    }

    drawSlope(g, s) {
      const l = this.vecToWorld(-0.7, -0.7);
      const ll = Math.hypot(l.x, l.y) || 1;
      const lx = l.x / ll, ly = l.y / ll;
      if (s.circle) {
        // Terraced dome (mound) or crater (bowl), lit from the screen's top-left.
        const [x, y, rad] = s.circle;
        const bowl = s.k > 0;
        const mars = this.world.id === 'mars';
        const steps = 6;
        for (let i = 0; i < steps; i++) {
          const r = rad * (1 - i / (steps + 0.5));
          const lin = g.createLinearGradient(x + lx * r, y + ly * r, x - lx * r, y - ly * r);
          if (bowl) {
            lin.addColorStop(0, 'rgba(20,10,60,0.2)');
            lin.addColorStop(0.55, 'rgba(20,10,60,0.05)');
            lin.addColorStop(1, 'rgba(255,255,255,0.14)');
          } else {
            lin.addColorStop(0, mars ? 'rgba(255,220,190,0.3)' : 'rgba(255,250,235,0.3)');
            lin.addColorStop(0.5, 'rgba(255,250,235,0.04)');
            lin.addColorStop(1, mars ? 'rgba(110,30,10,0.2)' : 'rgba(40,20,60,0.16)');
          }
          g.fillStyle = lin;
          g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
        g.strokeStyle = bowl ? 'rgba(255,255,255,0.18)' : 'rgba(90,30,10,0.14)';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
      } else {
        // Ramp: lighter at the top, contour lines across the slope.
        g.save();
        g.beginPath(); shapePath(g, s); g.clip();
        const [x0, y0, x1, y1] = s.bbox;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const len = Math.hypot(s.ax, s.ay) || 1;
        const dx = s.ax / len, dy = s.ay / len; // downhill
        const L = Math.abs(dx) * (x1 - x0) / 2 + Math.abs(dy) * (y1 - y0) / 2;
        const lg = g.createLinearGradient(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L);
        lg.addColorStop(0, 'rgba(255,255,255,0.32)');
        lg.addColorStop(1, 'rgba(20,10,60,0.16)');
        g.fillStyle = lg;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        g.lineWidth = 3;
        for (let k = -L; k <= L; k += 28) {
          const px = cx + dx * k, py = cy + dy * k;
          g.beginPath();
          g.moveTo(px - dy * 800, py + dx * 800);
          g.lineTo(px + dy * 800, py - dx * 800);
          g.stroke();
        }
        g.restore();
        g.strokeStyle = 'rgba(20,10,60,0.18)';
        g.lineWidth = 3;
        g.beginPath(); shapePath(g, s); g.stroke();
      }
    }

    drawPlanetDecor(g, d) {
      const { x, y, r } = d;
      const pg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      pg.addColorStop(0, '#ffe7ad');
      pg.addColorStop(0.6, '#f0ad5c');
      pg.addColorStop(1, '#a8602f');
      g.save();
      g.fillStyle = 'rgba(255,200,120,0.12)';
      g.beginPath(); g.arc(x, y, r * 1.25, 0, TAU); g.fill();
      g.fillStyle = pg;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = -3; i <= 3; i++) g.fillRect(x - r, y + i * r * 0.27, r * 2, r * 0.1);
      g.fillStyle = 'rgba(150,70,30,0.18)';
      for (let i = -3; i <= 3; i++) g.fillRect(x - r, y + i * r * 0.27 + r * 0.13, r * 2, r * 0.06);
      g.restore();
    }

    drawLavaBase(g, hz) {
      const [x, y, rad] = hz.circle;
      g.fillStyle = '#5a1208';
      g.beginPath(); g.arc(x, y, rad + 6, 0, TAU); g.fill();
      const lg = g.createRadialGradient(x, y, 0, x, y, rad);
      lg.addColorStop(0, '#ffe066');
      lg.addColorStop(0.45, '#ff8a1f');
      lg.addColorStop(1, '#c42a0c');
      g.fillStyle = lg;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }

    drawWalls(g, walls, down) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const W = P.WALL_T * 2;
      const path = (w, ox = 0, oy = 0) => {
        g.beginPath();
        w.pts.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy)));
        if (w.closed) g.closePath();
      };
      const k = 0.35;
      for (const w of walls) {
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = W + 6;
        path(w, down.x * k * 1.4, down.y * k * 1.4); g.stroke();
      }
      for (const w of walls) {
        g.strokeStyle = this.pal.wallShade;
        g.lineWidth = W + 2;
        path(w, down.x * k * 0.6, down.y * k * 0.6); g.stroke();
      }
      for (const w of walls) {
        g.strokeStyle = this.pal.wall;
        g.lineWidth = W;
        path(w); g.stroke();
      }
      for (const w of walls) {
        g.strokeStyle = this.pal.accent;
        g.globalAlpha = 0.55;
        g.lineWidth = 2.5;
        path(w); g.stroke();
        g.globalAlpha = 1;
      }
    }

    drawRock(g, p, r) {
      const id = this.world.id;
      g.save();
      g.translate(p.x, p.y);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath(); g.ellipse(4, 6, p.r * 1.05, p.r * 0.95, 0, 0, TAU); g.fill();
      const n = 9;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = p.r * (0.9 + r() * 0.16);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      const rg = g.createRadialGradient(-p.r * 0.35, -p.r * 0.4, p.r * 0.1, 0, 0, p.r * 1.1);
      if (id === 'moon') { rg.addColorStop(0, '#f4f4ff'); rg.addColorStop(1, '#7a7fb3'); }
      else if (id === 'mars') { rg.addColorStop(0, '#ffc49a'); rg.addColorStop(1, '#8e3a22'); }
      else { rg.addColorStop(0, '#e9e1ff'); rg.addColorStop(1, '#5c48b3'); }
      g.fillStyle = rg;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(30,20,60,0.35)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = 'rgba(40,30,80,0.18)';
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.arc((r() - 0.5) * p.r, (r() - 0.3) * p.r, p.r * (0.12 + r() * 0.14), 0, TAU); g.fill();
      }
      g.restore();
    }

    // ------------------------------------------------------------ frame

    handleEvents(events, play) {
      for (const e of events) {
        if (e.type === 'bumper') {
          this.hits.bumper[e.i] = this.time;
          this.kick(4);
          this.burst(e.x, e.y, '#ff8fcf', 10, 160);
        } else if (e.type === 'wall' || e.type === 'post' || e.type === 'slider' || e.type === 'spinner') {
          if (e.strength > 220) this.burst(e.x, e.y, '#ffffff', Math.min(8, e.strength / 100), 90);
          if (e.strength > 650) this.kick(2);
          if (e.type === 'spinner') this.hits.spinner[e.i] = this.time;
        } else if (e.type === 'portal') {
          this.burst(e.x, e.y, '#7df3ff', 14, 140);
          this.burst(e.x2, e.y2, '#ffc46b', 14, 140);
          this.trail = [];
        } else if (e.type === 'boost') {
          this.burst(e.x, e.y, '#ffe36b', 10, 200);
        } else if (e.type === 'sunk') {
          this.burst(e.x, e.y, '#ffffff', 16, 150);
        } else if (e.type === 'fall') {
          const col = e.cause === 'lava' ? '#ff9a3a' : e.cause === 'blackhole' ? '#c58bff' : '#bcd5ff';
          this.burst(e.x, e.y, col, 18, 120);
          this.popupWorld(e.x, e.y, e.penalty ? '+1 stroke' : 'Whoops!', col);
        } else if (e.type === 'respawn') {
          this.trail = [];
          this.burst(e.x, e.y, '#ffffff', 10, 80);
        } else if (e.type === 'putt') {
          this.trail = [];
          this.burst(e.x, e.y, '#ffffff', 6, 70);
        } else if (e.type === 'lip') {
          this.popupWorld(e.x, e.y - 20, 'Lipped out!', '#ffffff');
        }
      }
      void play;
    }

    kick(n) {
      if (this.reduced) return;
      this.shake = Math.min(12, this.shake + n);
    }

    burst(x, y, color, n, speed) {
      const count = Math.round(this.reduced ? n / 2 : n);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
        this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, age: 0, color, size: 2 + Math.random() * 3 });
      }
    }

    popupWorld(x, y, text, color) {
      const s = this.toScreen(x, y);
      this.popups.push({ x: s.x, y: s.y, text, color, age: 0, life: 1.3, size: 22 });
    }

    celebrate(text, tier) {
      this.popups.push({ x: this.w / 2, y: this.h * 0.42, text, color: tier >= 2 ? '#ffe36b' : '#ffffff', age: 0, life: 2.2, size: tier >= 3 ? 64 : tier >= 1 ? 54 : 42, big: true, tier });
      if (tier >= 1) this.throwConfetti(tier === 1 ? 50 : tier === 2 ? 110 : 200);
      if (tier >= 3) this.kick(8);
    }

    throwConfetti(n) {
      const count = this.reduced ? Math.round(n / 4) : n;
      const cols = ['#ff5d8f', '#ffd35a', '#7de3ff', '#8dff9a', '#b78bff', '#ffffff', '#ff8a3d'];
      for (let i = 0; i < count; i++) {
        const fromLeft = i % 2 === 0;
        const x = fromLeft ? -10 : this.w + 10;
        const y = this.h * (0.55 + Math.random() * 0.35);
        const a = fromLeft ? -Math.PI / 2 + 0.25 + Math.random() * 0.7 : -Math.PI / 2 - 0.25 - Math.random() * 0.7;
        const v = (this.reduced ? 300 : 600) + Math.random() * 700;
        this.confetti.push({
          x, y, vx: Math.cos(a) * v * (this.w / 1200 + 0.4), vy: Math.sin(a) * v, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
          w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, color: cols[i % cols.length], age: 0, life: 2.6 + Math.random(),
        });
      }
    }

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 30);
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
      for (const p of this.fx) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
      }
      this.fx = this.fx.filter((p) => p.age < p.life);
      for (const c of this.confetti) {
        c.age += dt;
        c.vy += 900 * dt;
        c.vx *= 1 - dt * 1.4;
        c.vy *= 1 - dt * 1.4;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.vr * dt;
      }
      this.confetti = this.confetti.filter((c) => c.age < c.life && c.y < this.h + 40);
      for (const p of this.popups) { p.age += dt; p.y -= (p.big ? 4 : 28) * dt; }
      this.popups = this.popups.filter((p) => p.age < p.life);
    }

    render(play, aim) {
      const ctx = this.ctx;
      const t = this.time;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.bg, 0, 0);
      this.drawTwinkles(ctx, t);
      if (!play) return;
      const H = play.H, sim = play.sim, ht = sim.t;
      const sx = this.shakeX, sy = this.shakeY;
      ctx.drawImage(this.course, sx * this.dpr, sy * this.dpr);
      this.applyView(ctx, sx, sy);

      for (const f of H.floor) if (f.move) this.drawPlatform(ctx, f, ht);
      for (const hz of H.hazards) if (hz.kind === 'lava') this.drawLava(ctx, hz, t);
      for (let i = 0; i < H.boosts.length; i++) this.drawBoost(ctx, H.boosts[i], t);
      for (let i = 0; i < H.wells.length; i++) this.drawWell(ctx, H.wells[i], t);
      for (let i = 0; i < H.portals.length; i++) this.drawPortal(ctx, H.portals[i], t);
      for (let i = 0; i < H.sliders.length; i++) this.drawRover(ctx, H.sliders[i], ht, t);
      for (let i = 0; i < H.bumpers.length; i++) this.drawBumper(ctx, H.bumpers[i], t - (this.hits.bumper[i] ?? -9));

      if (aim && aim.visible && play.status === 'ready') this.drawAim(ctx, play, aim);
      this.drawBall(ctx, play, t);
      this.drawFlag(ctx, H.cup, t, play);
      for (let i = 0; i < H.spinners.length; i++) this.drawSpinner(ctx, H.spinners[i], ht);

      for (const p of this.fx) {
        const k = 1 - p.age / p.life;
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 0.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (aim && aim.hint) this.drawHint(ctx, play, t);
      this.drawPopups(ctx);
      this.drawConfetti(ctx);
    }

    renderOverlayOnly() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawPopups(ctx);
      this.drawConfetti(ctx);
    }

    drawTwinkles(ctx, t) {
      if (!this.twinkles) return;
      const W = this.canvas.width, Hh = this.canvas.height;
      for (const s of this.twinkles) {
        const a = this.reduced ? 0.6 : 0.3 + 0.7 * Math.abs(Math.sin(t * 1.3 + s.p));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff';
        const x = s.x * W, y = s.y * Hh, r = s.s * this.dpr;
        ctx.fillRect(x - r * 2, y - 0.5 * this.dpr, r * 4, this.dpr);
        ctx.fillRect(x - 0.5 * this.dpr, y - r * 2, this.dpr, r * 4);
      }
      ctx.globalAlpha = 1;
    }

    drawPlatform(ctx, f, t) {
      const o = P.motion(f.move, t);
      const down = this.vecToWorld(0, 16);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); shapePath(ctx, f, o.x + down.x * 1.6, o.y + down.y * 1.6); ctx.fill();
      ctx.fillStyle = this.pal.wallShade;
      for (let k = 0; k <= 4; k++) { ctx.beginPath(); shapePath(ctx, f, o.x + (down.x * k) / 4, o.y + (down.y * k) / 4); ctx.fill(); }
      const [x0, y0, x1, y1] = f.bbox;
      const lg = ctx.createLinearGradient(x0 + o.x, y0 + o.y, x1 + o.x, y1 + o.y);
      lg.addColorStop(0, '#d8cfff');
      lg.addColorStop(1, '#9d8cf0');
      ctx.fillStyle = lg;
      ctx.beginPath(); shapePath(ctx, f, o.x, o.y); ctx.fill();
      ctx.clip();
      const r = rng(7);
      for (let i = 0; i < 10; i++) {
        const x = x0 + o.x + r() * (x1 - x0), y = y0 + o.y + r() * (y1 - y0), rad = 5 + r() * 14;
        ctx.fillStyle = 'rgba(60,40,140,0.18)';
        ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); shapePath(ctx, f, o.x, o.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLava(ctx, hz, t) {
      const [x, y, rad] = hz.circle;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.clip();
      for (let i = 0; i < 5; i++) {
        const a = t * (0.4 + i * 0.13) + i * 1.7;
        const bx = x + Math.cos(a) * rad * 0.5, by = y + Math.sin(a * 1.3) * rad * 0.5;
        ctx.fillStyle = `rgba(255,${200 + i * 10},90,${0.35 + 0.2 * Math.sin(t * 2 + i)})`;
        ctx.beginPath(); ctx.arc(bx, by, rad * 0.25, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = `rgba(255,140,40,${0.35 + 0.25 * Math.sin(t * 3)})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(x, y, rad + 7, 0, TAU); ctx.stroke();
    }

    drawBoost(ctx, b, t) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, b.r);
      g.addColorStop(0, 'rgba(255,240,140,0.95)');
      g.addColorStop(1, 'rgba(255,140,40,0.7)');
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(2, 3, b.r + 3, 0, TAU); ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff6c9';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const ph = this.reduced ? i / 3 : ((t * 1.8 + i / 3) % 1);
        const x = -b.r * 0.55 + ph * b.r * 1.0;
        ctx.strokeStyle = `rgba(160,50,0,${Math.sin(ph * Math.PI) * 0.85})`;
        ctx.beginPath(); ctx.moveTo(x - 6, -10); ctx.lineTo(x + 4, 0); ctx.lineTo(x - 6, 10); ctx.stroke();
      }
      ctx.restore();
    }

    drawWell(ctx, w, t) {
      if (!(w.core > 0)) return; // gentle planet gravity: shown by the planet itself
      ctx.save();
      ctx.translate(w.x, w.y);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w.r);
      g.addColorStop(0, 'rgba(10,0,30,0.95)');
      g.addColorStop(0.2, 'rgba(60,10,110,0.55)');
      g.addColorStop(0.6, 'rgba(120,60,220,0.18)');
      g.addColorStop(1, 'rgba(120,60,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, w.r, 0, TAU); ctx.fill();
      ctx.rotate(this.reduced ? 0 : t * 0.9);
      ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        ctx.rotate(TAU / 4);
        ctx.strokeStyle = k % 2 ? 'rgba(255,140,220,0.4)' : 'rgba(140,200,255,0.35)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
          const f = i / 30;
          const rr = (w.core || 12) + 6 + f * (w.r * 0.8);
          const a = f * 2.4;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      ctx.restore();
      if (w.core > 0) {
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(w.x, w.y, w.core + 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,190,120,${0.7 + 0.3 * Math.sin(t * 4)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.core + 6, 0, TAU); ctx.stroke();
        ctx.setLineDash([4, 10]);
        ctx.strokeStyle = 'rgba(200,160,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    drawPortal(ctx, p, t) {
      const ring = (x, y, c1, c2, dir) => {
        ctx.save();
        ctx.translate(x, y);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r + 6);
        g.addColorStop(0, c2);
        g.addColorStop(0.7, 'rgba(10,0,40,0.8)');
        g.addColorStop(1, 'rgba(10,0,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, p.r + 6, 0, TAU); ctx.fill();
        ctx.rotate(this.reduced ? 0 : t * 3 * dir);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = c1;
          ctx.globalAlpha = 1 - k * 0.25;
          ctx.beginPath(); ctx.arc(0, 0, p.r - k * 6, k * 2, k * 2 + 4.2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      };
      ring(p.a[0], p.a[1], '#7df3ff', 'rgba(125,243,255,0.5)', 1);
      ring(p.b[0], p.b[1], '#ffc46b', 'rgba(255,196,107,0.5)', -1);
      if (p.exitAngle !== undefined) {
        ctx.save();
        ctx.translate(p.b[0], p.b[1]);
        ctx.rotate(p.exitAngle);
        ctx.fillStyle = 'rgba(255,210,140,0.85)';
        ctx.beginPath(); ctx.moveTo(p.r + 14, 0); ctx.lineTo(p.r + 4, -7); ctx.lineTo(p.r + 4, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    drawRover(ctx, s, ht, t) {
      const o = P.motion(s, ht);
      const x = s.x + o.x, y = s.y + o.y, w = s.w, h = s.h;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(ctx, -w / 2 + 4, -h / 2 + 6, w, h, 12); ctx.fill();
      ctx.fillStyle = '#2b2440';
      for (const sx of [-1, 1]) for (const sy of [-0.62, 0, 0.62]) {
        roundRect(ctx, sx * (w / 2) - 7, sy * h / 2 - 8, 14, 16, 4); ctx.fill();
      }
      ctx.fillStyle = '#fff3e4';
      roundRect(ctx, -w / 2 + 5, -h / 2, w - 10, h, 12); ctx.fill();
      ctx.strokeStyle = '#a3492b';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#3a6ee0';
      roundRect(ctx, -w / 2 + 12, -h / 2 + 10, w - 24, h * 0.42, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) {
        const xx = -w / 2 + 12 + ((w - 24) * i) / 4;
        ctx.beginPath(); ctx.moveTo(xx, -h / 2 + 10); ctx.lineTo(xx, -h / 2 + 10 + h * 0.42); ctx.stroke();
      }
      const blink = Math.sin(t * 6 + s.x) > 0;
      ctx.fillStyle = blink ? '#ff5d5d' : '#7a2020';
      ctx.beginPath(); ctx.arc(0, h * 0.25, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6b5a70';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.25, h * 0.15); ctx.lineTo(w * 0.32, h * 0.38); ctx.stroke();
      ctx.fillStyle = '#ffd35a';
      ctx.beginPath(); ctx.arc(w * 0.32, h * 0.38, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawBumper(ctx, b, since) {
      const pulse = since < 0.3 ? 1 + 0.25 * Math.sin((since / 0.3) * Math.PI) : 1;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(3, 5, b.r + 2, 0, TAU); ctx.fill();
      ctx.scale(pulse, pulse);
      if (since < 0.35) {
        ctx.fillStyle = `rgba(255,120,200,${0.5 * (1 - since / 0.35)})`;
        ctx.beginPath(); ctx.arc(0, 0, b.r + 12, 0, TAU); ctx.fill();
      }
      const g = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.35, 1, 0, 0, b.r);
      g.addColorStop(0, since < 0.2 ? '#ffffff' : '#ffc2e4');
      g.addColorStop(1, '#e03a8c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff2fa';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#fff6d6';
      star(ctx, 0, 0, b.r * 0.45, b.r * 0.2, 5);
      ctx.fill();
      ctx.restore();
    }

    drawSpinner(ctx, sp, ht) {
      const a0 = P.spinnerAngle(sp, ht);
      const down = this.vecToWorld(0, 10);
      ctx.save();
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < sp.arms; k++) {
          const a = a0 + (k * TAU) / sp.arms;
          const ex = sp.x + Math.cos(a) * sp.len, ey = sp.y + Math.sin(a) * sp.len;
          if (pass === 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.28)';
            ctx.lineWidth = 14;
            ctx.beginPath(); ctx.moveTo(sp.x + down.x, sp.y + down.y); ctx.lineTo(ex + down.x, ey + down.y); ctx.stroke();
          } else {
            ctx.strokeStyle = '#7a3a1c';
            ctx.lineWidth = 13;
            ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.strokeStyle = k % 2 ? '#fff1e2' : '#ffd35a';
            ctx.lineWidth = 9;
            ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.strokeStyle = 'rgba(160,70,30,0.5)';
            ctx.lineWidth = 2;
            for (let f = 0.3; f < 1; f += 0.2) {
              const px = sp.x + Math.cos(a) * sp.len * f, py = sp.y + Math.sin(a) * sp.len * f;
              ctx.beginPath();
              ctx.moveTo(px - Math.sin(a) * 4, py + Math.cos(a) * 4);
              ctx.lineTo(px + Math.sin(a) * 4, py - Math.cos(a) * 4);
              ctx.stroke();
            }
          }
        }
      }
      const g = ctx.createRadialGradient(sp.x - 4, sp.y - 4, 1, sp.x, sp.y, 16);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#ff7a45');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 15, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7a3a1c';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    drawFlag(ctx, cup, t, play) {
      const sinking = play.status === 'sinking' || play.status === 'holed';
      const lift = sinking ? Math.min(1, play.timer / 0.4) : 0;
      // The flag sits "above" the cup: offset toward screen-up.
      const up = this.vecToWorld(0, -1);
      const along = this.vecToWorld(1, 0);
      const pole = 46 + lift * 10;
      const px = cup.x + up.x * pole, py = cup.y + up.y * pole;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#f5f2ff';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(cup.x, cup.y); ctx.lineTo(px, py); ctx.stroke();
      const wave = this.reduced ? 0 : Math.sin(t * 5) * 3;
      ctx.fillStyle = this.pal.flag;
      ctx.beginPath();
      ctx.moveTo(px, py);
      const fx = px + along.x * 30 + up.x * (-7 + wave), fy = py + along.y * 30 + up.y * (-7 + wave);
      ctx.quadraticCurveTo(px + along.x * 15 + up.x * (2 + wave), py + along.y * 15 + up.y * (2 + wave), fx, fy);
      ctx.lineTo(px + up.x * -16, py + up.y * -16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawAim(ctx, play, aim) {
      const sim = play.sim;
      const pts = P.previewPath(play.H, sim.x, sim.y, aim.angle, aim.power, sim.t);
      const col = aim.power > 0.8 ? '#ff6b6b' : aim.power > 0.5 ? '#ffd35a' : '#8dff9a';
      // Pull-back band.
      if (aim.band) {
        const back = aim.band;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.moveTo(sim.x, sim.y); ctx.lineTo(sim.x + back.x, sim.y + back.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      // Dotted preview.
      let dist = 0;
      let px = pts[0][0], py = pts[0][1];
      let nextDot = 14;
      let hitVoid = false;
      for (let i = 1; i < pts.length; i++) {
        const [x, y, tag] = pts[i];
        const seg = Math.hypot(x - px, y - py);
        while (nextDot <= dist + seg) {
          const f = (nextDot - dist) / (seg || 1);
          const dx = px + (x - px) * f, dy = py + (y - py) * f;
          const fade = Math.max(0.25, 1 - nextDot / 900);
          ctx.globalAlpha = fade;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(dx, dy, 3.4, 0, TAU); ctx.fill();
          nextDot += 16;
        }
        dist += seg;
        px = x; py = y;
        if (tag === 'bounce') {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
        }
        if (tag === 'void') hitVoid = true;
      }
      ctx.globalAlpha = 1;
      if (hitVoid) {
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px - 7, py - 7); ctx.lineTo(px + 7, py + 7); ctx.moveTo(px + 7, py - 7); ctx.lineTo(px - 7, py + 7); ctx.stroke();
      }
      // Power ring around the ball.
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(sim.x, sim.y, 22, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(sim.x, sim.y, 22, aim.angle - Math.PI * aim.power, aim.angle + Math.PI * aim.power); ctx.stroke();
      // Arrow head.
      ctx.save();
      ctx.translate(sim.x, sim.y);
      ctx.rotate(aim.angle);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(26, -6); ctx.lineTo(26, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawBall(ctx, play, t) {
      const sim = play.sim;
      let x = sim.x, y = sim.y, scale = 1, alpha = 1;
      if ((play.status === 'sinking' || play.status === 'holed') && !play.pickedUp && play.fx) {
        const k = Math.min(1, play.timer / 0.35);
        x = play.fx.x + (play.H.cup.x - play.fx.x) * k;
        y = play.fx.y + (play.H.cup.y - play.fx.y) * k;
        scale = 1 - 0.45 * Math.min(1, play.timer / 0.5);
        alpha = play.status === 'holed' ? 0 : 1 - Math.max(0, (play.timer - 0.4) / 0.35);
      } else if (play.status === 'falling') {
        const k = Math.min(1, play.timer / 0.8);
        const f = play.fx;
        if (f.cause === 'blackhole') {
          const a = k * 9, rr = (1 - k) * 30;
          x = f.x + Math.cos(a) * rr;
          y = f.y + Math.sin(a) * rr;
        } else {
          x = sim.x + (f.vx || 0) * 0.12 * k;
          y = sim.y + (f.vy || 0) * 0.12 * k;
        }
        scale = 1 - k;
        alpha = 1 - k * 0.6;
      }
      if (play.status === 'rolling' && !this.reduced) {
        this.trail.push([x, y]);
        if (this.trail.length > 18) this.trail.shift();
      } else if (play.status !== 'rolling' && this.trail.length) {
        this.trail.shift();
      }
      for (let i = 0; i < this.trail.length; i++) {
        const k = i / this.trail.length;
        ctx.globalAlpha = k * 0.35;
        ctx.fillStyle = '#fff4b0';
        ctx.beginPath(); ctx.arc(this.trail[i][0], this.trail[i][1], P.BALL_R * k * 0.9, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (scale <= 0.02 || alpha <= 0.02) return;
      const R = P.BALL_R * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      const down = this.vecToWorld(0, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(x + down.x, y + down.y, R, 0, TAU); ctx.fill();
      const pulse = this.reduced ? 1 : 1 + 0.08 * Math.sin(t * 4);
      const glow = ctx.createRadialGradient(x, y, R * 0.5, x, y, R * 3.2 * pulse);
      glow.addColorStop(0, 'rgba(255,245,170,0.55)');
      glow.addColorStop(1, 'rgba(255,245,170,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, R * 3.2 * pulse, 0, TAU); ctx.fill();
      const up = this.vecToWorld(-1, -1.2);
      const bg = ctx.createRadialGradient(x + up.x * R * 0.35, y + up.y * R * 0.35, R * 0.1, x, y, R);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.6, '#fff7c9');
      bg.addColorStop(1, '#ffd35a');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawHint(ctx, play, t) {
      const s = this.toScreen(play.sim.x, play.sim.y);
      const k = (t * 0.6) % 1;
      const r = 26 + k * 24;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.stroke();
      ctx.font = `800 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const label = play.hintText || 'Drag back and let go!';
      const w = ctx.measureText(label).width + 26;
      const y = s.y + (s.y > this.h - 120 ? -64 : 58);
      roundRect(ctx, s.x - w / 2, y - 18, w, 30, 15); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, s.x, y + 3);
    }

    drawPopups(ctx) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of this.popups) {
        const k = p.age / p.life;
        const inK = Math.min(1, p.age / 0.35);
        const sc = p.big ? (this.reduced ? 1 : easeOutBack(inK)) : 1;
        const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        const size = Math.min(p.size, this.w / (p.text.length * 0.62));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(sc, sc);
        if (p.big && !this.reduced) ctx.rotate(Math.sin(p.age * 3) * 0.03);
        ctx.globalAlpha = a;
        ctx.font = `900 ${size}px ${FONT}`;
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * 0.18;
        ctx.strokeStyle = 'rgba(30,10,60,0.85)';
        ctx.strokeText(p.text, 0, 0);
        if (p.big && p.tier >= 2) {
          const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
          g.addColorStop(0, '#fff7c9');
          g.addColorStop(1, '#ffb13b');
          ctx.fillStyle = g;
        } else ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      }
      ctx.textBaseline = 'alphabetic';
    }

    drawConfetti(ctx) {
      for (const c of this.confetti) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.scale(1, Math.abs(Math.cos(c.rot * 1.3)) + 0.2);
        ctx.globalAlpha = Math.min(1, (c.life - c.age) * 2);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function star(ctx, x, y, R, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU - Math.PI / 2;
      const rr = i % 2 ? r : R;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  root.MoonshotRender = Renderer;
})(typeof self !== 'undefined' ? self : this);
