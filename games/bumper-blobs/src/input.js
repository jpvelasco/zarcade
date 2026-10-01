// Keyboard (four shared schemes), up to four gamepads, and one touch player,
// each a "device" that maps to World controls { mx, my, dash, pound }.
//   k0..k3  keyboard schemes   p0..p3  gamepads   touch   solo (all of them)
// Edges (button presses) are kept per device for menus and the join screen.

export const KEY_SCHEMES = [
  { id: 'k0', label: 'WASD', dashLabel: 'Space', poundLabel: 'E', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dash: ['Space'], pound: ['KeyE', 'KeyQ'] },
  { id: 'k1', label: 'Arrows', dashLabel: 'Enter', poundLabel: 'Shift', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], dash: ['Enter'], pound: ['ShiftRight', 'Slash'] },
  { id: 'k2', label: 'IJKL', dashLabel: 'U', poundLabel: 'O', up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], dash: ['KeyU'], pound: ['KeyO'] },
  { id: 'k3', label: 'Numpad 8456', dashLabel: '0', poundLabel: '.', up: ['Numpad8'], down: ['Numpad5', 'Numpad2'], left: ['Numpad4'], right: ['Numpad6'], dash: ['Numpad0'], pound: ['NumpadDecimal', 'NumpadEnter'] },
];

const ACTIONS = ['up', 'down', 'left', 'right', 'dash', 'pound'];
const CODE_MAP = new Map();
for (const s of KEY_SCHEMES) for (const a of ACTIONS) for (const c of s[a]) CODE_MAP.set(c, [s.id, a]);
export const GAME_KEYS = new Set(CODE_MAP.keys());

export const deviceLabel = (id) => {
  if (id === 'touch') return 'Touch';
  if (id === 'solo') return 'You';
  if (id[0] === 'p') return `Gamepad ${+id[1] + 1}`;
  const s = KEY_SCHEMES.find((k) => k.id === id);
  return s ? s.label : id;
};

export function deviceHelp(id) {
  if (id === 'touch') return { move: 'stick', dash: 'DASH', pound: 'POUND' };
  if (id[0] === 'p') return { move: 'stick', dash: 'A', pound: 'B', face: 'X', back: 'B' };
  const s = KEY_SCHEMES.find((k) => k.id === id) || KEY_SCHEMES[0];
  return { move: s.label, dash: s.dashLabel, pound: s.poundLabel };
}

const STICK_R = 56;

export class Input {
  constructor() {
    this.keys = new Set();
    this.edges = new Map(); // device -> Set(action)
    this.globalEdges = new Set(); // raw key codes pressed (Escape, KeyP, KeyM ...)
    this.pads = [null, null, null, null];
    this.padPrev = [{}, {}, {}, {}];
    this.touch = { stick: null, mx: 0, my: 0, dash: false, poundQueued: false };
    this.lastDevice = 'k0';
    this.captureKeys = false; // true during play and on the join screen

    addEventListener('keydown', (e) => {
      const map = CODE_MAP.get(e.code);
      if (this.captureKeys && map) e.preventDefault();
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !isFormTarget(e.target)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      this.globalEdges.add(e.code);
      if (map) { this.edge(map[0], map[1]); this.lastDevice = map[0]; }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touch.dash = false; this.touch.stick = null; this.touch.mx = this.touch.my = 0; });
  }

  edge(device, action) {
    let s = this.edges.get(device);
    if (!s) this.edges.set(device, (s = new Set()));
    s.add(action);
  }

  // Did `device` press `action` since the last clear? Consumes the edge.
  take(device, action) {
    if (device === 'solo') {
      for (const d of this.edges.keys()) if (this.take(d, action)) return true;
      return false;
    }
    const s = this.edges.get(device);
    if (!s || !s.has(action)) return false;
    s.delete(action);
    return true;
  }

  // The first device that pressed `action`, or null. Consumes the edge.
  takeAny(action) {
    for (const [d, s] of this.edges) if (s.has(action)) { s.delete(action); return d; }
    return null;
  }

  takeKey(code) {
    const had = this.globalEdges.has(code);
    this.globalEdges.delete(code);
    return had;
  }

  clear() {
    this.edges.clear();
    this.globalEdges.clear();
    this.touch.poundQueued = false;
  }

  // Poll gamepads once per frame and record their button edges.
  pollPads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const pad = list[i] || null;
      this.pads[i] = pad;
      if (!pad) { this.padPrev[i] = {}; continue; }
      const b = (k) => !!pad.buttons[k]?.pressed;
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      const now = {
        dash: b(0), pound: b(1) || b(5) || b(7), face: b(2), hat: b(3), start: b(9), back: b(1),
        up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
      };
      const prev = this.padPrev[i];
      const id = `p${i}`;
      for (const k of Object.keys(now)) if (now[k] && !prev[k]) { this.edge(id, k); this.lastDevice = id; }
      this.padPrev[i] = now;
    }
  }

  padConnected(i) { return !!this.pads[i]; }

  // Controls for one device this frame.
  read(device, out = { mx: 0, my: 0, dash: false, pound: false }) {
    out.mx = 0; out.my = 0; out.dash = false; out.pound = false;
    if (device === 'solo') {
      const tmp = { mx: 0, my: 0, dash: false, pound: false };
      for (const d of ['k0', 'k1', 'p0', 'p1', 'p2', 'p3', 'touch']) {
        this.read(d, tmp);
        out.mx += tmp.mx; out.my += tmp.my;
        out.dash = out.dash || tmp.dash;
        out.pound = out.pound || tmp.pound;
      }
      const l = Math.hypot(out.mx, out.my);
      if (l > 1) { out.mx /= l; out.my /= l; }
      return out;
    }
    if (device === 'touch') {
      out.mx = this.touch.mx; out.my = this.touch.my;
      out.dash = this.touch.dash;
      out.pound = this.touch.poundQueued;
      this.touch.poundQueued = false;
      return out;
    }
    if (device[0] === 'p') {
      const pad = this.pads[+device[1]];
      if (!pad) return out;
      let x = pad.axes[0] || 0, y = pad.axes[1] || 0;
      const l = Math.hypot(x, y);
      if (l < 0.2) { x = 0; y = 0; } else if (l > 1) { x /= l; y /= l; }
      const b = (k) => !!pad.buttons[k]?.pressed;
      if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
      out.mx = x; out.my = y;
      out.dash = b(0) || b(2);
      out.pound = this.take(device, 'pound');
      return out;
    }
    const s = KEY_SCHEMES.find((k) => k.id === device);
    if (!s) return out;
    const k = (codes) => codes.some((c) => this.keys.has(c));
    out.mx = (k(s.right) ? 1 : 0) - (k(s.left) ? 1 : 0);
    out.my = (k(s.down) ? 1 : 0) - (k(s.up) ? 1 : 0);
    if (out.mx && out.my) { out.mx *= Math.SQRT1_2; out.my *= Math.SQRT1_2; }
    out.dash = k(s.dash);
    out.pound = this.take(device, 'pound');
    return out;
  }

  // Wire the on-screen touch controls (stick zone, dash and pound buttons).
  bindTouch({ zone, base, knob, dash, pound }) {
    const t = this.touch;
    const setKnob = () => {
      if (!t.stick) { base.classList.remove('active'); knob.style.transform = ''; return; }
      base.classList.add('active');
      base.style.left = `${t.stick.ox}px`;
      base.style.top = `${t.stick.oy}px`;
      knob.style.transform = `translate(${t.mx * STICK_R}px, ${t.my * STICK_R}px)`;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (t.stick) return;
      e.preventDefault();
      t.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this.lastDevice = 'touch';
      try { zone.setPointerCapture(e.pointerId); } catch { /* optional */ }
      setKnob();
    });
    zone.addEventListener('pointermove', (e) => {
      if (!t.stick || e.pointerId !== t.stick.id) return;
      let dx = (e.clientX - t.stick.ox) / STICK_R, dy = (e.clientY - t.stick.oy) / STICK_R;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        // Drag the stick base along so the thumb never runs out of room.
        t.stick.ox += (dx / l) * (l - 1) * STICK_R;
        t.stick.oy += (dy / l) * (l - 1) * STICK_R;
        dx /= l; dy /= l;
      }
      t.mx = Math.abs(dx) < 0.12 && Math.abs(dy) < 0.12 ? 0 : dx;
      t.my = Math.abs(dx) < 0.12 && Math.abs(dy) < 0.12 ? 0 : dy;
      setKnob();
    });
    const end = (e) => {
      if (!t.stick || e.pointerId !== t.stick.id) return;
      t.stick = null; t.mx = 0; t.my = 0;
      setKnob();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.lastDevice = 'touch'; el.classList.add('down'); on(); try { el.setPointerCapture(e.pointerId); } catch { /* optional */ } });
      const up = () => { el.classList.remove('down'); off(); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold(dash, () => { t.dash = true; }, () => { t.dash = false; });
    hold(pound, () => { t.poundQueued = true; this.edge('touch', 'pound'); }, () => {});
  }

  resetTouch() {
    this.touch.stick = null; this.touch.mx = 0; this.touch.my = 0; this.touch.dash = false; this.touch.poundQueued = false;
  }
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
}
