// Keyboard, mouse, touch and gamepad merged into pod controls { ax, ay }.
//   Keys:  arrows / WASD steer and drill; Up / W / Space fly.
//   Mouse: hold the button and the pod heads toward the pointer.
//   Touch: on-screen d-pad (left) and Fly button (right) on coarse pointers.
//   Pad:   stick or d-pad; A flies; X opens the Workshop; Start pauses.
export class Input {
  constructor(surface, toWorld) {
    this.toWorld = toWorld;
    this.keys = new Set();
    this.pressed = new Set();
    this.padEdges = new Set();
    this.pad = { buttons: {}, ax: 0, ay: 0, connected: false };
    this.mouse = { down: false, x: 0, y: 0 };
    this.touch = { ax: 0, ay: 0, fly: false };
    this.enabled = false;
    this.mode = 'keys';

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && this.enabled) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.mode = 'keys';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.clearHeld());

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.mode = 'mouse';
      this.mouse.down = true;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.mouse.down = false; });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch'; }, { capture: true, passive: true });
  }

  // On-screen controls. The d-pad reads the finger's angle from its centre,
  // so a thumb can roll between directions without lifting.
  bindTouch(dpad, flyBtn) {
    const active = new Map();
    const update = () => {
      let ax = 0, ay = 0;
      for (const v of active.values()) { ax = v.ax; ay = v.ay; }
      this.touch.ax = ax; this.touch.ay = ay;
      dpad.dataset.dir = ax < 0 ? 'left' : ax > 0 ? 'right' : ay > 0 ? 'down' : ay < 0 ? 'up' : '';
    };
    const read = (e) => {
      const r = dpad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const dead = r.width * 0.12;
      if (Math.hypot(dx, dy) < dead) return { ax: 0, ay: 0 };
      if (Math.abs(dx) > Math.abs(dy) * 0.8) return { ax: Math.sign(dx), ay: 0 };
      return { ax: 0, ay: Math.sign(dy) };
    };
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { dpad.setPointerCapture(e.pointerId); } catch { /* optional */ }
      active.set(e.pointerId, read(e));
      update();
    });
    dpad.addEventListener('pointermove', (e) => { if (active.has(e.pointerId)) { active.set(e.pointerId, read(e)); update(); } });
    const end = (e) => { active.delete(e.pointerId); update(); };
    dpad.addEventListener('pointerup', end);
    dpad.addEventListener('pointercancel', end);
    const flyOn = (e) => { e.preventDefault(); this.touch.fly = true; flyBtn.classList.add('on'); try { flyBtn.setPointerCapture(e.pointerId); } catch { /* optional */ } };
    const flyOff = () => { this.touch.fly = false; flyBtn.classList.remove('on'); };
    flyBtn.addEventListener('pointerdown', flyOn);
    flyBtn.addEventListener('pointerup', flyOff);
    flyBtn.addEventListener('pointercancel', flyOff);
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
  }

  clearHeld() {
    this.keys.clear();
    this.mouse.down = false;
    this.touch.ax = 0; this.touch.ay = 0; this.touch.fly = false;
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p) { pad = p; break; }
    if (!pad) { this.pad.ax = 0; this.pad.ay = 0; this.pad.connected = false; return; }
    this.pad.connected = true;
    const b = (i) => !!pad.buttons[i]?.pressed;
    const axX = pad.axes[0] || 0, axY = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), select: b(8),
      left: b(14) || axX < -0.5, right: b(15) || axX > 0.5, up: b(12) || axY < -0.5, down: b(13) || axY > 0.5,
    };
    for (const k in now) if (now[k] && !this.pad.buttons[k]) { this.padEdges.add(k); this.mode = 'pad'; }
    this.pad.buttons = now;
    this.pad.ax = now.left ? -1 : now.right ? 1 : 0;
    this.pad.ay = now.up || now.a ? -1 : now.down ? 1 : 0;
  }

  // Controls for one frame. podScreen: the pod's screen position (for the mouse).
  read(podScreen, tileSize) {
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    let ax = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    let ay = (k('ArrowDown', 'KeyS') ? 1 : 0) - (k('ArrowUp', 'KeyW', 'Space') ? 1 : 0);
    if (!ax && this.pad.ax) ax = this.pad.ax;
    if (!ay && this.pad.ay) ay = this.pad.ay;
    if (!ax && this.touch.ax) ax = this.touch.ax;
    if (!ay && this.touch.ay) ay = this.touch.ay;
    if (this.touch.fly) ay = -1;
    if (!ax && !ay && this.mouse.down && podScreen) {
      const dx = this.mouse.x - podScreen.x, dy = this.mouse.y - podScreen.y;
      const t = tileSize || 48;
      if (dy < -t * 0.7) ay = -1;
      else if (dy > t * 0.6 && Math.abs(dy) > Math.abs(dx)) ay = 1;
      if (Math.abs(dx) > t * 0.45 && !(ay === 1)) ax = Math.sign(dx);
    }
    return { ax, ay };
  }
}
