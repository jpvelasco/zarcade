// Moonshot Mini Golf: DOM-free ball physics.
//
// A hole definition (see holes.js) is compiled once by prepare() into flat
// arrays of wall segments, bumpers, zones and so on. stepBall() then advances
// a small simulation object { x, y, vx, vy, t, ... } by one frame. Everything
// that moves (windmills, sliders, drifting platforms) is a pure function of
// the hole clock `t`, so a shot replays identically from the same start time.
//
// Loaded as a classic browser script (window.MoonshotPhysics) and as a
// CommonJS module by the Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoonshotPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BALL_R = 9;
  const CUP_R = 15;
  const WALL_T = 5; // half the drawn wall width
  const MAX_SPEED = 1050; // px/s for a full-power putt
  const MIN_SPEED = 45;
  const STOP_SPEED = 6;
  const STEP = 1 / 120; // fixed simulation step used by the game and tests

  // roll: constant rolling resistance (px/s^2); drag: speed-proportional (1/s).
  const SURFACES = {
    regolith: { roll: 70, drag: 0.3, name: 'Moon dust' },
    clay: { roll: 140, drag: 0.5, name: 'Mars clay' },
    stardust: { roll: 110, drag: 0.42, name: 'Stardust' },
    sand: { roll: 800, drag: 3.2, name: 'Sand trap' },
    ice: { roll: 20, drag: 0.1, name: 'Comet ice' },
  };

  const hypot = Math.hypot;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ------------------------------------------------------------ geometry

  function pointInPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Shapes are { pts: [[x, y], ...] } polygons or { circle: [x, y, r] }.
  function inShape(shape, x, y, ox = 0, oy = 0) {
    if (shape.circle) {
      const [cx, cy, r] = shape.circle;
      return hypot(x - cx - ox, y - cy - oy) < r;
    }
    const b = shape.bbox;
    if (b && (x - ox < b[0] || x - ox > b[2] || y - oy < b[1] || y - oy > b[3])) return false;
    return pointInPoly(shape.pts, x - ox, y - oy);
  }

  function bboxOf(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }

  // Smooth ping-pong offset used by sliders and drifting platforms.
  function motion(m, t) {
    const ph = (2 * Math.PI * (t / m.period + (m.phase || 0)));
    const k = 0.5 - 0.5 * Math.cos(ph);
    const dk = (Math.PI / m.period) * Math.sin(ph);
    return { x: m.dx * k, y: m.dy * k, vx: m.dx * dk, vy: m.dy * dk };
  }

  function spinnerAngle(s, t) {
    return (s.phase || 0) + s.speed * t;
  }

  // ------------------------------------------------------------ compile

  const cache = new WeakMap();

  function prepare(def) {
    if (cache.has(def)) return cache.get(def);
    const segs = [];
    for (const w of def.walls || []) {
      const pts = w.pts;
      const n = w.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        segs.push({
          ax: a[0], ay: a[1], bx: b[0], by: b[1], e: w.e ?? 0.72,
          x0: Math.min(a[0], b[0]) - 20, y0: Math.min(a[1], b[1]) - 20,
          x1: Math.max(a[0], b[0]) + 20, y1: Math.max(a[1], b[1]) + 20,
        });
      }
    }
    const withBox = (s) => (s.pts ? { ...s, bbox: bboxOf(s.pts) } : { ...s });
    const H = {
      def,
      segs,
      floor: (def.floor || []).map(withBox),
      hazards: (def.hazards || []).map(withBox),
      zones: (def.zones || []).map(withBox),
      slopes: (def.slopes || []).map(withBox),
      posts: def.posts || [],
      bumpers: def.bumpers || [],
      wells: def.wells || [],
      portals: def.portals || [],
      boosts: def.boosts || [],
      spinners: def.spinners || [],
      sliders: def.sliders || [],
      cup: { x: def.cup[0], y: def.cup[1] },
      tee: { x: def.tee[0], y: def.tee[1] },
      base: SURFACES[def.surface] || SURFACES.clay,
      dynamic: !!((def.spinners && def.spinners.length) || (def.sliders && def.sliders.length) ||
        (def.floor || []).some((f) => f.move)),
    };
    cache.set(def, H);
    return H;
  }

  // ------------------------------------------------------------ queries

  function floorOffset(f, t) {
    return f.move ? motion(f.move, t) : null;
  }

  // Index of the moving floor piece under (x, y), or -1.
  function platformAt(H, x, y, t) {
    for (let i = H.floor.length - 1; i >= 0; i--) {
      const f = H.floor[i];
      if (!f.move) continue;
      const o = motion(f.move, t);
      if (inShape(f, x, y, o.x, o.y)) return i;
    }
    return -1;
  }

  function onFloor(H, x, y, t) {
    for (const f of H.floor) {
      if (f.move) {
        const o = motion(f.move, t);
        if (inShape(f, x, y, o.x, o.y)) return true;
      } else if (inShape(f, x, y)) return true;
    }
    return false;
  }

  function hazardAt(H, x, y) {
    for (const h of H.hazards) if (inShape(h, x, y)) return h;
    return null;
  }

  function isVoid(H, x, y, t) {
    return !onFloor(H, x, y, t) || !!hazardAt(H, x, y);
  }

  function surfaceAt(H, x, y) {
    for (let i = H.zones.length - 1; i >= 0; i--) {
      const z = H.zones[i];
      if (inShape(z, x, y)) return SURFACES[z.surface] || H.base;
    }
    return H.base;
  }

  // ------------------------------------------------------------ collisions

  function hit(s, nx, ny, wvx, wvy, e, kind, strength) {
    const rvx = s.vx - wvx, rvy = s.vy - wvy;
    const rvn = rvx * nx + rvy * ny;
    if (rvn >= 0) return false;
    const tx = rvx - rvn * nx, ty = rvy - rvn * ny;
    let out = -rvn * e;
    if (kind === 'bumper') out = Math.min(MAX_SPEED * 0.85, -rvn * 0.9 + strength);
    s.vx = tx * 0.97 + out * nx + wvx;
    s.vy = ty * 0.97 + out * ny + wvy;
    return -rvn;
  }

  function collideSeg(s, ax, ay, bx, by, rad, wvx, wvy, e, kind, idx) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let u = len2 ? ((s.x - ax) * dx + (s.y - ay) * dy) / len2 : 0;
    u = clamp(u, 0, 1);
    const qx = ax + dx * u, qy = ay + dy * u;
    let nx = s.x - qx, ny = s.y - qy;
    const d = hypot(nx, ny);
    if (d >= rad) return;
    if (d < 1e-6) { nx = -dy; ny = dx; } // dead center: push along the normal
    const nl = hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    s.x = qx + nx * rad;
    s.y = qy + ny * rad;
    const imp = hit(s, nx, ny, wvx, wvy, e);
    if (imp && s.events && imp > 25) s.events.push({ type: kind, x: qx, y: qy, strength: imp, i: idx });
  }

  function collideCircle(s, cx, cy, r, e, kind, idx, kick) {
    let nx = s.x - cx, ny = s.y - cy;
    const d = hypot(nx, ny);
    const rad = r + BALL_R;
    if (d >= rad) return;
    if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
    s.x = cx + nx * rad;
    s.y = cy + ny * rad;
    const imp = hit(s, nx, ny, 0, 0, e, kind, kick);
    if (imp && s.events && (imp > 25 || kind === 'bumper')) s.events.push({ type: kind, x: cx + nx * r, y: cy + ny * r, strength: imp, i: idx });
  }

  function collideBox(s, cx, cy, hw, hh, wvx, wvy, idx) {
    const px = clamp(s.x, cx - hw, cx + hw), py = clamp(s.y, cy - hh, cy + hh);
    let nx = s.x - px, ny = s.y - py;
    let d = hypot(nx, ny);
    if (d >= BALL_R) return;
    if (d < 1e-6) {
      // Center inside the box: push out along the shallowest axis.
      const l = s.x - (cx - hw), r = cx + hw - s.x, t = s.y - (cy - hh), b = cy + hh - s.y;
      const m = Math.min(l, r, t, b);
      nx = m === l ? -1 : m === r ? 1 : 0;
      ny = m === t ? -1 : m === b ? 1 : 0;
      if (nx && ny) ny = 0;
      s.x = nx ? (nx < 0 ? cx - hw - BALL_R : cx + hw + BALL_R) : s.x;
      s.y = ny ? (ny < 0 ? cy - hh - BALL_R : cy + hh + BALL_R) : s.y;
    } else {
      nx /= d; ny /= d;
      s.x = px + nx * BALL_R;
      s.y = py + ny * BALL_R;
    }
    const imp = hit(s, nx, ny, wvx, wvy, 0.7);
    if (imp && s.events && imp > 25) s.events.push({ type: 'slider', x: px, y: py, strength: imp, i: idx });
  }

  function collideAll(H, s) {
    const R = BALL_R + WALL_T;
    for (const g of H.segs) {
      if (s.x < g.x0 || s.x > g.x1 || s.y < g.y0 || s.y > g.y1) continue;
      collideSeg(s, g.ax, g.ay, g.bx, g.by, R, 0, 0, g.e, 'wall', -1);
    }
    for (let i = 0; i < H.posts.length; i++) {
      const p = H.posts[i];
      collideCircle(s, p.x, p.y, p.r, 0.65, 'post', i);
    }
    for (let i = 0; i < H.bumpers.length; i++) {
      const b = H.bumpers[i];
      collideCircle(s, b.x, b.y, b.r, 1, 'bumper', i, b.kick || 260);
    }
    for (let i = 0; i < H.spinners.length; i++) {
      const sp = H.spinners[i];
      if (hypot(s.x - sp.x, s.y - sp.y) > sp.len + BALL_R + 8) continue;
      const a0 = spinnerAngle(sp, s.t);
      for (let k = 0; k < sp.arms; k++) {
        const a = a0 + (k * 2 * Math.PI) / sp.arms;
        const ex = sp.x + Math.cos(a) * sp.len, ey = sp.y + Math.sin(a) * sp.len;
        // Wall velocity at the contact point: omega x r.
        const dx = bx(s, sp.x, sp.y, ex, ey);
        const wvx = -sp.speed * (dx.qy - sp.y), wvy = sp.speed * (dx.qx - sp.x);
        collideSeg(s, sp.x, sp.y, ex, ey, BALL_R + 6, wvx, wvy, 0.6, 'spinner', i);
      }
      collideCircle(s, sp.x, sp.y, 14, 0.6, 'spinner', i);
    }
    for (let i = 0; i < H.sliders.length; i++) {
      const b = H.sliders[i];
      const o = motion(b, s.t);
      collideBox(s, b.x + o.x, b.y + o.y, b.w / 2, b.h / 2, o.vx, o.vy, i);
    }
  }

  // Closest point on segment (helper for moving-wall velocity).
  function bx(s, ax, ay, ex, ey) {
    const dx = ex - ax, dy = ey - ay;
    const u = clamp(((s.x - ax) * dx + (s.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return { qx: ax + dx * u, qy: ay + dy * u };
  }

  // ------------------------------------------------------------ forces

  function accelAt(H, s, speed) {
    let ax = 0, ay = 0;
    for (const sl of H.slopes) {
      if (sl.circle) {
        const [cx, cy, r] = sl.circle;
        const dx = s.x - cx, dy = s.y - cy;
        const d = hypot(dx, dy);
        if (d < r && d > 0.5) {
          // Bowl (k > 0) pulls toward the center, mound (k < 0) pushes out.
          const a = (-sl.k * (d / r)) / d;
          ax += dx * a;
          ay += dy * a;
        }
      } else if (inShape(sl, s.x, s.y)) {
        ax += sl.ax;
        ay += sl.ay;
      }
    }
    for (const w of H.wells) {
      const dx = w.x - s.x, dy = w.y - s.y;
      const d = hypot(dx, dy);
      if (d < w.r && d > 0.5) {
        const a = w.k * (0.25 + 0.75 * (1 - d / w.r) ** 2);
        ax += (dx / d) * a;
        ay += (dy / d) * a;
      }
    }
    for (let i = 0; i < H.boosts.length; i++) {
      const b = H.boosts[i];
      const inside = hypot(s.x - b.x, s.y - b.y) < b.r;
      const bit = 1 << i;
      if (inside) {
        const c = Math.cos(b.angle), sn = Math.sin(b.angle);
        const along = s.vx * c + s.vy * sn;
        // Pads only push balls that are not rolling back against them, so a
        // ball returning down a ramp cannot ping-pong forever.
        if (along < b.speed && along >= -0.3 * speed) {
          ax += c * 4200;
          ay += sn * 4200;
        }
        if (!(s.boostIn & bit)) {
          s.boostIn |= bit;
          if (s.events) s.events.push({ type: 'boost', x: b.x, y: b.y, i });
        }
      } else s.boostIn &= ~bit;
    }
    // The cup rim tugs a slow ball that is already hanging over the edge.
    const cdx = H.cup.x - s.x, cdy = H.cup.y - s.y;
    const cd = hypot(cdx, cdy);
    if (cd < CUP_R + 1 && cd > 0.5 && speed < 160) {
      ax += (cdx / cd) * 420;
      ay += (cdy / cd) * 420;
    }
    return { ax, ay };
  }

  // ------------------------------------------------------------ step

  function createSim(x, y, t = 0) {
    return { x, y, vx: 0, vy: 0, t, portalLock: -1, boostIn: 0, lip: false, events: null, fell: null };
  }

  function speedOf(s) {
    return hypot(s.vx, s.vy);
  }

  // Sink speed limit: a centered ball can drop in faster than one that
  // clips the rim.
  function captureSpeed(d) {
    return 170 + 330 * (1 - clamp(d / CUP_R, 0, 1));
  }

  function substep(H, s, h) {
    const plat = H.dynamic ? platformAt(H, s.x, s.y, s.t) : -1;
    if (plat >= 0) {
      const o = motion(H.floor[plat].move, s.t);
      s.x += o.vx * h;
      s.y += o.vy * h;
    }
    let speed = hypot(s.vx, s.vy);
    const { ax, ay } = accelAt(H, s, speed);
    const surf = surfaceAt(H, s.x, s.y);
    if (speed < STOP_SPEED && hypot(ax, ay) <= surf.roll) {
      s.vx = 0;
      s.vy = 0;
    } else {
      s.vx += ax * h;
      s.vy += ay * h;
      speed = hypot(s.vx, s.vy);
      if (speed > 0) {
        const ns = Math.max(0, speed - (surf.roll + surf.drag * speed) * h);
        s.vx *= ns / speed;
        s.vy *= ns / speed;
      }
      s.x += s.vx * h;
      s.y += s.vy * h;
    }
    collideAll(H, s);

    // Portals: one-way, entry a -> exit b.
    for (let i = 0; i < H.portals.length; i++) {
      const p = H.portals[i];
      if (s.portalLock !== i && hypot(s.x - p.a[0], s.y - p.a[1]) < p.r) {
        let sp = Math.max(hypot(s.vx, s.vy), 160);
        const ang = p.exitAngle ?? Math.atan2(s.vy, s.vx);
        s.x = p.b[0];
        s.y = p.b[1];
        s.vx = Math.cos(ang) * sp;
        s.vy = Math.sin(ang) * sp;
        s.portalLock = i;
        if (s.events) s.events.push({ type: 'portal', x: p.a[0], y: p.a[1], x2: p.b[0], y2: p.b[1], i });
        break;
      }
    }
    if (s.portalLock >= 0) {
      const p = H.portals[s.portalLock];
      if (hypot(s.x - p.b[0], s.y - p.b[1]) > p.r + BALL_R + 2) s.portalLock = -1;
    }

    for (let i = 0; i < H.wells.length; i++) {
      const w = H.wells[i];
      if (hypot(s.x - w.x, s.y - w.y) < w.core) {
        s.fell = { cause: 'blackhole', x: w.x, y: w.y };
        return 'void';
      }
    }
    if (!onFloor(H, s.x, s.y, s.t)) {
      s.fell = { cause: 'space', x: s.x, y: s.y };
      return 'void';
    }
    const hz = H.hazards.length ? hazardAt(H, s.x, s.y) : null;
    if (hz) {
      s.fell = { cause: hz.kind || 'space', x: s.x, y: s.y };
      return 'void';
    }

    // Cup: slow enough sinks, too fast lips out with a deflection.
    const d = hypot(s.x - H.cup.x, s.y - H.cup.y);
    speed = hypot(s.vx, s.vy);
    if (d < CUP_R - 2 && speed < captureSpeed(d)) return 'sunk';
    if (d < CUP_R - 2 && !s.lip) {
      s.lip = true;
      const side = Math.sign(s.vx * (H.cup.y - s.y) - s.vy * (H.cup.x - s.x)) || 1;
      const rot = -side * 0.35 * clamp(d / CUP_R, 0.25, 1);
      const c = Math.cos(rot), sn = Math.sin(rot);
      const vx = (s.vx * c - s.vy * sn) * 0.8, vy = (s.vx * sn + s.vy * c) * 0.8;
      s.vx = vx;
      s.vy = vy;
      if (s.events) s.events.push({ type: 'lip', x: H.cup.x, y: H.cup.y, strength: speed });
    } else if (d > CUP_R + 3) s.lip = false;
    return null;
  }

  // Advance one frame of `dt` seconds, sub-stepping so the ball never moves
  // more than ~3px per substep. Returns 'sunk', 'void' or null.
  function stepBall(H, s, dt) {
    const n = clamp(Math.ceil((hypot(s.vx, s.vy) * dt) / 3), 1, 24);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const r = substep(H, s, h);
      s.t += h;
      if (r) return r;
    }
    return null;
  }

  function puttSpeed(power) {
    return MIN_SPEED + clamp(power, 0, 1) * (MAX_SPEED - MIN_SPEED);
  }

  // Distance a ball starting at speed v rolls on a flat surface.
  function rollDistance(v, surf) {
    const a = surf.roll, b = surf.drag;
    if (b < 1e-6) return (v * v) / (2 * a);
    return v / b - (a / (b * b)) * Math.log(1 + (b * v) / a);
  }

  // Dotted aim preview: march the ball along its launch direction, losing
  // speed to each surface it crosses, and reflect once off the first wall.
  function previewPath(H, x, y, angle, power, t, maxBounces = 1) {
    const pts = [[x, y]];
    let dx = Math.cos(angle), dy = Math.sin(angle);
    let v = puttSpeed(power);
    let bounces = 0;
    let after = 0;
    const probe = { x, y, vx: 0, vy: 0, t, events: null };
    const ds = 4;
    let fall = false;
    for (let i = 0; i < 900 && v > STOP_SPEED; i++) {
      const surf = surfaceAt(H, probe.x, probe.y);
      v -= (surf.roll / Math.max(v, 1) + surf.drag) * ds;
      probe.x += dx * ds;
      probe.y += dy * ds;
      probe.vx = dx * 100;
      probe.vy = dy * 100;
      const bx0 = probe.x, by0 = probe.y;
      collideAll(H, probe);
      if (probe.x !== bx0 || probe.y !== by0) {
        const l = hypot(probe.vx, probe.vy) || 1;
        const ndx = probe.vx / l, ndy = probe.vy / l;
        if (ndx * dx + ndy * dy < 0.999) {
          pts.push([probe.x, probe.y, 'bounce']);
          bounces++;
          if (bounces > maxBounces) break;
          dx = ndx;
          dy = ndy;
          v *= 0.72;
        }
      }
      if (bounces >= maxBounces) {
        after += ds;
        if (after > 150) break;
      }
      if (isVoid(H, probe.x, probe.y, t)) { fall = true; pts.push([probe.x, probe.y, 'void']); break; }
      if (i % 3 === 0) pts.push([probe.x, probe.y]);
    }
    if (!fall) pts.push([probe.x, probe.y]);
    return pts;
  }

  return {
    BALL_R, CUP_R, WALL_T, MAX_SPEED, MIN_SPEED, STOP_SPEED, STEP, SURFACES,
    pointInPoly, inShape, motion, spinnerAngle, prepare, platformAt, onFloor, hazardAt, isVoid,
    surfaceAt, createSim, speedOf, captureSpeed, stepBall, puttSpeed, rollDistance, previewPath,
  };
});
