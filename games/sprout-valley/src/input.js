// Keyboard, mouse, touch and gamepad merged into world controls:
//   { mx, my, use, interact, slot, cycle, target }
//   Keys:  WASD / arrows move, Space uses the tool, E / Enter interacts,
//          1-9 pick a belt slot, Q / Tab cycle it.
//   Mouse: click a tile to use the tool there (far tiles: walk there first),
//          right-click to interact, wheel cycles the belt.
//   Touch: left stick moves, Use and Talk buttons, tap a tile like a click.
//   Pad:   stick / d-pad move, A use, X interact, LB / RB cycle, Y bag,
//          Back journal, Start pause.
const MOVE = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

export class Input {
  constructor(surface, toTile) {
    this.surface = surface;
    this.toTile = toTile;
    this.keys = new Set();
    this.pressed = new Set();
    this.mode = 'keys'; // keys | mouse | touch | pad
    this.enabled = false;
    this.use = false; this.interact = false; this.cycle = 0; this.slot = null; this.target = null;
    this.hover = null;
    this.stick = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
    this.pad = { held: {}, edges: new Set(), x: 0, y: 0 };

    addEventListener('keydown', (e) => {
      if (isForm(e.target) && (e.code === 'Space' || e.code === 'Enter')) return;
      if (this.enabled && (MOVE[e.code] || e.code === 'Space' || e.code === 'Tab')) e.preventDefault();
      this.keys.add(e.code);
      if (MOVE[e.code]) this.mode = 'keys';
      if (e.repeat) return;
      this.pressed.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'Space') this.use = true;
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'KeyF') this.interact = true;
      if (/^Digit[1-9]$/.test(e.code)) this.slot = Number(e.code.slice(5)) - 1;
      if (e.code === 'KeyQ') this.cycle -= 1;
      if (e.code === 'Tab') this.cycle += e.shiftKey ? -1 : 1;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.stick.id = null; });

    surface.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mode = 'mouse'; this.hover = this.toTile(e.clientX, e.clientY); }
    });
    surface.addEventListener('pointerleave', () => { this.hover = null; });
    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        this.mode = 'mouse';
        const t = this.toTile(e.clientX, e.clientY);
        this.hover = t;
        if (e.button === 0) this.target = t;
        else if (e.button === 2) this.interactAt = t;
        return;
      }
      this.mode = 'touch';
      e.preventDefault();
      this.target = this.toTile(e.clientX, e.clientY);
    });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.wheel = (this.wheel || 0) + e.deltaY;
      if (Math.abs(this.wheel) > 40) { this.cycle += Math.sign(this.wheel); this.wheel = 0; }
    }, { passive: false });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.mode = 'touch'; }, { capture: true, passive: true });
  }

  // On-screen stick and buttons (touch only).
  bindTouch({ stick, knob, use, talk }) {
    this.knob = knob;
    const start = (e) => {
      e.preventDefault();
      this.mode = 'touch';
      const r = stick.getBoundingClientRect();
      this.stick = { id: e.pointerId, x0: r.left + r.width / 2, y0: r.top + r.height / 2, x: 0, y: 0, r: r.width / 2 };
      try { stick.setPointerCapture(e.pointerId); } catch { /* optional */ }
      move(e);
    };
    const move = (e) => {
      if (e.pointerId !== this.stick.id) return;
      const dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0;
      const d = Math.hypot(dx, dy), r = this.stick.r * 0.8;
      const k = d > r ? r / d : 1;
      this.stick.x = (dx * k) / r; this.stick.y = (dy * k) / r;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null; this.stick.x = 0; this.stick.y = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', start);
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    const press = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.enabled) fn(); });
    press(use, () => { this.use = true; });
    press(talk, () => { this.interact = true; });
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  consumePad(name) {
    const had = this.pad.edges.has(name);
    this.pad.edges.delete(name);
    return had;
  }

  clear() {
    this.pressed.clear();
    this.pad.edges.clear();
    this.use = false; this.interact = false; this.cycle = 0; this.slot = null; this.target = null; this.interactAt = null;
  }

  padConnected() { return !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)); }

  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) { this.pad.x = 0; this.pad.y = 0; return; }
    const now = {};
    for (const [k, i] of Object.entries(PAD)) now[k] = !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    now.sleft = ax < -0.6; now.sright = ax > 0.6; now.sup = ay < -0.6; now.sdown = ay > 0.6;
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.held[k]) this.pad.edges.add(k);
    this.pad.held = now;
    let x = Math.abs(ax) > 0.2 ? ax : 0, y = Math.abs(ay) > 0.2 ? ay : 0;
    if (now.left) x = -1; if (now.right) x = 1; if (now.up) y = -1; if (now.down) y = 1;
    this.pad.x = x; this.pad.y = y;
    if (x || y || Object.values(now).some(Boolean)) this.mode = 'pad';
    if (!this.enabled) return;
    if (this.pad.edges.has('a')) { this.pad.edges.delete('a'); this.use = true; }
    if (this.pad.edges.has('x')) { this.pad.edges.delete('x'); this.interact = true; }
    if (this.pad.edges.has('lb')) { this.pad.edges.delete('lb'); this.cycle -= 1; }
    if (this.pad.edges.has('rb')) { this.pad.edges.delete('rb'); this.cycle += 1; }
  }

  // Controls for one frame; edge-triggered actions are consumed.
  read() {
    const k = (c) => this.keys.has(c);
    let mx = 0, my = 0;
    for (const [code, [dx, dy]] of Object.entries(MOVE)) if (k(code)) { mx += dx; my += dy; }
    mx = Math.max(-1, Math.min(1, mx + this.pad.x + this.stick.x));
    my = Math.max(-1, Math.min(1, my + this.pad.y + this.stick.y));
    const out = { mx, my, use: this.use, interact: this.interact, slot: this.slot, cycle: Math.sign(this.cycle), target: this.target, interactAt: this.interactAt };
    this.use = false; this.interact = false; this.slot = null; this.cycle = 0; this.target = null; this.interactAt = null;
    return out;
  }
}

function isForm(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
}
