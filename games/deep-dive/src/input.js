// Keyboard, mouse, touch and gamepad merged into sub controls.
//   Keys:  WASD / arrows swim, Space sonar, M map, B book, Esc / P pause.
//   Mouse: hold the left button to swim toward the pointer; right-click pings.
//   Touch: hold or drag to swim toward your finger; the sonar button pings.
//   Pad:   left stick / d-pad swims, A sonar, Y map, X book, Start pause.
const MOVE_KEYS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};

export class Input {
  constructor(surface, toWorld) {
    this.toWorld = toWorld;
    this.keys = new Set();
    this.pressed = new Set();
    this.mode = 'keys'; // keys | mouse | touch | pad
    this.pointer = null; // { id, x, y, type }
    this.sonarQueued = false;
    this.enabled = false;
    this.pad = { buttons: {}, x: 0, y: 0 };
    this.padEdges = new Set();

    addEventListener('keydown', (e) => {
      if (isFormTarget(e.target) && (e.code === 'Space' || e.code === 'Enter')) return;
      if ((MOVE_KEYS[e.code] || e.code === 'Space') && this.enabled) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (e.code === 'Space' && this.enabled) this.sonarQueued = true;
      }
      this.keys.add(e.code);
      if (MOVE_KEYS[e.code]) this.mode = 'keys';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.pointer = null; });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch'; }, { capture: true, passive: true });

    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && e.button === 2) { this.sonarQueued = true; return; }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.mode = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType };
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
    });
    surface.addEventListener('pointermove', (e) => {
      if (this.pointer && e.pointerId === this.pointer.id) { this.pointer.x = e.clientX; this.pointer.y = e.clientY; }
    });
    const end = (e) => { if (this.pointer && e.pointerId === this.pointer.id) this.pointer = null; };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    surface.addEventListener('lostpointercapture', end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  queueSonar() { if (this.enabled) this.sonarQueued = true; }

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
    this.sonarQueued = false;
    this.pointer = null;
  }

  hasPad() {
    return !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
  }

  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) { this.pad.x = 0; this.pad.y = 0; return; }
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), select: b(8),
      left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
    };
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.buttons[k]) this.padEdges.add(k);
    this.pad.buttons = now;
    let x = Math.abs(ax) > 0.18 ? ax : 0, y = Math.abs(ay) > 0.18 ? ay : 0;
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
    this.pad.x = x; this.pad.y = y;
    if (x || y) this.mode = 'pad';
    if (this.padEdges.has('a') && this.enabled) this.sonarQueued = true;
  }

  read() {
    let ax = 0, ay = 0;
    for (const code of this.keys) { const m = MOVE_KEYS[code]; if (m) { ax += m[0]; ay += m[1]; } }
    ax += this.pad.x; ay += this.pad.y;
    let target = null;
    if (!ax && !ay && this.pointer) target = this.toWorld(this.pointer.x, this.pointer.y);
    const sonar = this.sonarQueued;
    this.sonarQueued = false;
    return { ax: Math.max(-1, Math.min(1, ax)), ay: Math.max(-1, Math.min(1, ay)), target, sonar };
  }
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT');
}
