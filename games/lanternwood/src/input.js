// Keyboard, gamepad and touch, merged into one controls object per frame:
//   { x, y, attack, item, interact, cycle } plus menu edges (bag, map, pause,
//   up/down/left/right, confirm, back).
// Keys: arrows / WASD move, Space or J sword, K item, E talk, Q or Tab swap
// item, I bag, M map, Esc or P pause. Gamepad: stick / d-pad, A sword,
// X item, B talk, LB/RB swap, Y bag, Back map, Start pause.

const MOVE = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
const EDGE_KEYS = {
  Space: 'attack', KeyJ: 'attack', KeyK: 'item', KeyE: 'interact', KeyQ: 'cycle', Tab: 'cycle',
  KeyI: 'bag', KeyM: 'map', Escape: 'pause', KeyP: 'pause', Enter: 'confirm',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.edges = new Set();
    this.mode = 'keys';
    this.padPrev = {};
    this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.touchHeld = new Set();
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      if ((e.code in MOVE || e.code === 'Space' || e.code === 'Tab') && !(e.target && e.target.tagName === 'BUTTON' && e.code === 'Space')) e.preventDefault();
      this.mode = 'keys';
      if (!e.repeat) {
        const ed = EDGE_KEYS[e.code];
        if (ed) this.edges.add(ed);
        if (e.code in MOVE) {
          const [dx, dy] = MOVE[e.code];
          this.edges.add(dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down');
        }
      }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touchHeld.clear(); this.stick.id = null; this.stick.x = this.stick.y = 0; });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.mode = 'touch'; }, { capture: true, passive: true });
  }

  /** Wire the on-screen stick and buttons (only shown on coarse pointers). */
  bindTouch(root) {
    const zone = root.querySelector('#stick-zone');
    const knob = root.querySelector('#stick-knob');
    const base = root.querySelector('#stick-base');
    const R = 44;
    const place = (x, y) => { base.style.left = `${x}px`; base.style.top = `${y}px`; };
    const move = (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, len / R);
      this.stick.x = len > 6 ? (dx / (len || 1)) * k : 0;
      this.stick.y = len > 6 ? (dy / (len || 1)) * k : 0;
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.mode = 'touch';
      this.stick.id = e.pointerId;
      const r = zone.getBoundingClientRect();
      this.stick.ox = e.clientX; this.stick.oy = e.clientY;
      place(e.clientX - r.left, e.clientY - r.top);
      base.classList.add('active');
      try { zone.setPointerCapture(e.pointerId); } catch { /* optional */ }
      move(e);
    });
    zone.addEventListener('pointermove', move);
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null; this.stick.x = this.stick.y = 0;
      knob.style.transform = '';
      base.classList.remove('active');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    for (const btn of root.querySelectorAll('[data-touch]')) {
      const name = btn.dataset.touch;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.mode = 'touch';
        this.edges.add(name);
        this.touchHeld.add(name);
        btn.classList.add('down');
      });
      const up = () => { this.touchHeld.delete(name); btn.classList.remove('down'); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && [...pads].find(Boolean);
    this.padAxis = { x: 0, y: 0 };
    if (!pad) return;
    const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      attack: b(0), interact: b(1), item: b(2), bag: b(3), cycle: b(5), cycleBack: b(4), map: b(8), pause: b(9),
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
    };
    for (const [k, v] of Object.entries(now)) {
      if (v && !this.padPrev[k]) {
        this.edges.add(k);
        if (k === 'attack') this.edges.add('confirm');
        if (k === 'interact') this.edges.add('back');
        this.mode = 'pad';
      }
    }
    this.padPrev = now;
    let x = Math.abs(ax) > 0.2 ? ax : 0, y = Math.abs(ay) > 0.2 ? ay : 0;
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
    this.padAxis = { x, y };
    if (x || y) this.mode = 'pad';
  }

  consume(name) {
    const had = this.edges.has(name);
    this.edges.delete(name);
    return had;
  }

  clear() { this.edges.clear(); }

  /** Controls for one frame of play. */
  read() {
    let x = 0, y = 0;
    for (const code of this.keys) if (MOVE[code]) { x += MOVE[code][0]; y += MOVE[code][1]; }
    x = Math.max(-1, Math.min(1, x + (this.padAxis?.x || 0) + this.stick.x));
    y = Math.max(-1, Math.min(1, y + (this.padAxis?.y || 0) + this.stick.y));
    const ctl = {
      x, y,
      attack: this.consume('attack'),
      item: this.consume('item'),
      interact: this.consume('interact'),
      cycle: this.consume('cycle') || this.consume('cycleBack'),
    };
    return ctl;
  }
}

function isTyping(t) {
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
