// Keyboard, mouse, touch and gamepad merged into { push, brake, jump }.
//   Keys:  → / D speed up, ← / A brake, Space / ↑ / W jump.
//   Mouse/touch: hold the right half to speed up, the left half to brake,
//          tap anywhere to jump (a second finger can tap while holding).
//   Pad:   stick / d-pad / RT LT steer, A or B jump, Start pause.
const HOLD_MS = 140, TAP_MS = 230, TAP_PX = 24;

export class Input {
  constructor(surface) {
    this.surface = surface;
    this.keys = new Set();
    this.pressed = new Set();
    this.pointers = new Map(); // id -> { x, y, t0, moved, side }
    this.jumpQueued = false;
    this.enabled = false;
    this.touchUsed = false;
    this.pad = { buttons: {}, x: 0, rt: 0, lt: 0 };
    this.padEdges = new Set();
    this.lastAny = 0;

    addEventListener('keydown', (e) => {
      const t = e.target;
      const form = t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT');
      if (this.enabled && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      else if (!form && ['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (this.enabled && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) this.jumpQueued = true;
      }
      this.keys.add(e.code);
      this.lastAny = performance.now();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touchUsed = true; }, { capture: true, passive: true });

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t0: performance.now(), moved: false });
      this.lastAny = performance.now();
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
    });
    surface.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX) p.moved = true;
      p.x = e.clientX;
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (this.enabled && !p.moved && performance.now() - p.t0 < TAP_MS) this.jumpQueued = true;
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

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
    this.jumpQueued = false;
    this.pointers.clear();
  }

  // Edges only live for the frame they happened in, so a jump press can't
  // later click a menu button.
  pollPad() {
    this.padEdges.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p) { pad = p; break; }
    if (!pad) { this.pad.x = 0; this.pad.rt = 0; this.pad.lt = 0; return; }
    const b = (i) => !!pad.buttons[i]?.pressed;
    const val = (i) => pad.buttons[i]?.value || 0;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), select: b(8),
      left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
    };
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.buttons[k]) { this.padEdges.add(k); this.lastAny = performance.now(); }
    this.pad.buttons = now;
    let x = Math.abs(ax) > 0.2 ? ax : 0;
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    this.pad.x = x;
    this.pad.rt = val(7);
    this.pad.lt = val(6);
    if (this.enabled && (this.padEdges.has('a') || this.padEdges.has('b') || this.padEdges.has('up'))) this.jumpQueued = true;
  }

  // True while a finger or the mouse is held (for touch hints).
  get holding() { return this.pointers.size > 0; }

  read() {
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    let push = k('ArrowRight', 'KeyD') ? 1 : 0;
    let brake = k('ArrowLeft', 'KeyA') ? 1 : 0;
    const now = performance.now();
    const half = innerWidth / 2;
    for (const p of this.pointers.values()) {
      if (now - p.t0 < HOLD_MS) continue;
      if (p.x >= half) push = 1; else brake = 1;
    }
    if (this.pad.x > 0) push = Math.max(push, this.pad.x);
    if (this.pad.x < 0) brake = Math.max(brake, -this.pad.x);
    if (this.pad.rt > 0.1) push = Math.max(push, this.pad.rt);
    if (this.pad.lt > 0.1) brake = Math.max(brake, this.pad.lt);
    if (push && brake) { push = push > brake ? push : 0; brake = push ? 0 : brake; }
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return { push, brake, jump };
  }
}
