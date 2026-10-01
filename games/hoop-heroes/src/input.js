// Flicks (touch and mouse), keyboard and gamepad.
//   Flick: press, swipe up toward the hoop, let go. Direction aims, speed is
//          power. Reported in screen heights per second.
//   Keys:  Space / Enter / ↑ shoots at the timing meter; ← → nudge the aim.
//   Pad:   A shoots, stick / d-pad nudges, Start pauses.
const MIN_FLICK_PX = 28;
const MAX_FLICK_MS = 900;
const SAMPLE_MS = 110;

export class Input {
  constructor(surface) {
    this.enabled = false;
    this.mode = 'keys'; // keys | mouse | touch | pad
    this.keys = new Set();
    this.pressed = new Set();
    this.flicks = [];
    this.drag = null; // { id, samples: [{x, y, t}], t0 }
    this.trail = [];
    this.pad = { buttons: [], x: 0 };
    this.padEdges = new Set();
    this.shootQueued = false;

    addEventListener('keydown', (e) => {
      const t = e.target;
      const form = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (!form && this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (this.enabled && (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW')) {
          this.shootQueued = true;
          this.mode = 'keys';
        }
      }
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) this.mode = 'keys';
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.drag = null; this.trail.length = 0; });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch'; }, { capture: true, passive: true });

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.mode = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (!this.enabled) return;
      e.preventDefault();
      try { surface.setPointerCapture?.(e.pointerId); } catch { // synthetic or already-ended pointers can't be captured
      }
      const now = performance.now();
      this.drag = { id: e.pointerId, samples: [{ x: e.clientX, y: e.clientY, t: now }], t0: now, x0: e.clientX, y0: e.clientY };
      this.trail.length = 0;
      this.trail.push({ x: e.clientX, y: e.clientY });
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.mode = 'mouse';
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const now = performance.now();
      d.samples.push({ x: e.clientX, y: e.clientY, t: now });
      if (d.samples.length > 24) d.samples.shift();
      this.trail.push({ x: e.clientX, y: e.clientY });
      if (this.trail.length > 14) this.trail.shift();
    });
    const end = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      const now = performance.now();
      d.samples.push({ x: e.clientX, y: e.clientY, t: now });
      const f = measureFlick(d, now, innerHeight);
      if (f) this.flicks.push(f);
      setTimeout(() => { if (!this.drag) this.trail.length = 0; }, 160);
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', (e) => { if (this.drag && e.pointerId === this.drag.id) { this.drag = null; this.trail.length = 0; } });
  }

  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }
  consumePad(name) {
    if (this.padEdges.has(name)) { this.padEdges.delete(name); return true; }
    return false;
  }

  takeFlick() { return this.flicks.shift() || null; }
  takeShoot() {
    const q = this.shootQueued || this.consumePad('a');
    this.shootQueued = false;
    return q;
  }
  clear() { this.flicks.length = 0; this.shootQueued = false; this.pressed.clear(); this.padEdges.clear(); this.drag = null; this.trail.length = 0; }

  // -1 … 1 aim nudge from keys / stick.
  nudgeAxis() {
    let x = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    if (Math.abs(this.pad.x) > 0.25) x += this.pad.x;
    return Math.max(-1, Math.min(1, x));
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find(Boolean);
    if (!p) return;
    const map = { a: 0, b: 1, x: 2, y: 3, start: 9, up: 12, down: 13, left: 14, right: 15 };
    const prev = this.pad.buttons;
    const now = [];
    for (const [name, i] of Object.entries(map)) {
      const down = !!p.buttons[i]?.pressed;
      now[i] = down;
      if (down && !prev[i]) { this.padEdges.add(name); this.mode = 'pad'; }
    }
    // Stick as d-pad edges for menus.
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const sx = ax > 0.6 ? 'right' : ax < -0.6 ? 'left' : null, sy = ay > 0.6 ? 'down' : ay < -0.6 ? 'up' : null;
    if (sx && this.pad.sx !== sx) this.padEdges.add(sx);
    if (sy && this.pad.sy !== sy) this.padEdges.add(sy);
    this.pad.sx = sx; this.pad.sy = sy;
    this.pad.buttons = now;
    this.pad.x = (Math.abs(ax) > 0.2 ? ax : 0) + (now[15] ? 1 : 0) - (now[14] ? 1 : 0);
    if (Math.abs(ax) > 0.3) this.mode = 'pad';
  }
}

// A flick from drag samples: direction from the last ~110 ms of travel, speed
// in screen heights per second. Pure, for tests.
export function measureFlick(d, now, screenH) {
  const s = d.samples;
  const last = s[s.length - 1];
  const totalDy = d.y0 - last.y, totalDx = last.x - d.x0;
  if (totalDy < MIN_FLICK_PX || now - d.t0 > MAX_FLICK_MS + 600) return null;
  let first = s[0];
  for (let i = s.length - 1; i >= 0; i--) {
    if (last.t - s[i].t > SAMPLE_MS) break;
    first = s[i];
  }
  let dx = last.x - first.x, dy = first.y - last.y, dt = (last.t - first.t) / 1000;
  // Very short or stalled ends: fall back to the whole gesture.
  if (dt < 0.03 || dy < 8) { dx = totalDx; dy = totalDy; dt = Math.max(0.03, (last.t - d.t0) / 1000); }
  const len = Math.hypot(dx, dy);
  if (dy <= 0) return null;
  return { dirX: dx / len, dirY: -dy / len, speed: len / dt / screenH, startX: d.x0, startY: d.y0 };
}
