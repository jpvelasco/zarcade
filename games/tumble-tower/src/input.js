// Mouse, touch, keyboard and gamepad merged into crane controls.
//   Drag anywhere: slide the animal (touch is relative, so a finger never
//   hides it; the mouse follows the pointer). Release after a drag: drop.
//   Quick tap/click: turn. Right-click or wheel: turn the other way.
//   Keys: ←/→ or A/D move, ↑/W/X turn, Z/Q turn back, Space/↓/S/Enter drop.
//   Pad: stick or d-pad move, A drop, B/Y/RB turn, X/LB turn back, Start pause.
const TAP_MS = 320, DRAG_PX = 10;

export class Input {
  constructor(surface, { worldX, heldX, scale }) {
    this.worldX = worldX;
    this.heldX = heldX;
    this.scale = scale;
    this.keys = new Set();
    this.pressed = new Set();
    this.drag = null;
    this.targetX = null;
    this.rotateQ = 0;
    this.dropQ = false;
    this.enabled = false;
    this.pad = { buttons: {}, axisX: 0 };
    this.padEdges = new Set();
    this.mode = 'keys';

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && this.enabled && !isFormTarget(e.target)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (this.enabled && !isFormTarget(e.target)) {
          if (['ArrowUp', 'KeyW', 'KeyX'].includes(e.code)) this.rotateQ -= 1;
          if (['KeyZ', 'KeyQ'].includes(e.code)) this.rotateQ += 1;
          if (['Space', 'ArrowDown', 'KeyS', 'Enter'].includes(e.code)) { this.dropQ = true; e.preventDefault(); }
        }
      }
      this.keys.add(e.code);
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { this.mode = 'keys'; this.targetX = null; }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.drag = null; });
    addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') this.mode = 'touch'; }, { capture: true, passive: true });

    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && e.button === 2) { this.rotateQ += 1; return; }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.mode = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      const hx = this.heldX();
      this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), hx0: hx ?? 0, moved: false, mouse: e.pointerType === 'mouse' };
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
    });
    surface.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_PX) d.moved = true;
      if (!d.moved) return;
      this.targetX = d.mouse ? this.worldX(e.clientX) : d.hx0 + (e.clientX - d.x0) / this.scale() * 1.15;
    });
    const end = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (!this.enabled) return;
      if (e.type === 'pointercancel') return;
      if (d.moved) this.dropQ = true;
      else if (performance.now() - d.t0 < TAP_MS) this.rotateQ -= 1;
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const now = performance.now();
      if (now - (this.lastWheel || 0) < 140) return;
      this.lastWheel = now;
      this.rotateQ += e.deltaY > 0 ? -1 : 1;
    }, { passive: false });
  }

  // On-screen buttons.
  turn(dir = -1) { if (this.enabled) this.rotateQ += dir; }
  dropNow() { if (this.enabled) this.dropQ = true; }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  consumePad(name) {
    const had = this.padEdges.has(name);
    this.padEdges.delete(name);
    return had;
  }

  clear() {
    this.pressed.clear();
    this.padEdges.clear();
    this.rotateQ = 0;
    this.dropQ = false;
    this.targetX = null;
    this.drag = null;
  }

  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) { this.pad.axisX = 0; return; }
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), start: b(9),
      left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
    };
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.buttons[k]) this.padEdges.add(k);
    this.pad.buttons = now;
    let x = Math.abs(ax) > 0.18 ? ax : 0;
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    this.pad.axisX = x;
    if (x !== 0) { this.mode = 'pad'; this.targetX = null; }
    if (this.enabled) {
      if (this.consumePad('a')) this.dropQ = true;
      if (this.consumePad('b') || this.consumePad('y') || this.consumePad('rb')) this.rotateQ -= 1;
      if (this.consumePad('x') || this.consumePad('lb')) this.rotateQ += 1;
    }
  }

  read() {
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    let axis = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    axis = Math.max(-1, Math.min(1, axis + this.pad.axisX));
    const out = { axis, targetX: axis ? null : this.targetX, rotate: Math.max(-1, Math.min(1, this.rotateQ)), drop: this.dropQ };
    this.rotateQ = 0;
    this.dropQ = false;
    if (!this.drag) this.targetX = null;
    return out;
  }
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
}
