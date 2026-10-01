// Keyboard, touch/mouse and gamepad merged into table controls:
//   { left, right, plunge, nudge }  (nudge: -1, 0 or 1 on the frame it's hit)
//
//   Keys:   Left Shift / Z / ←  left flipper     Right Shift / M / →  right flipper
//           Space / ↓  hold to pull the plunger, release to fire
//           X / C  nudge left / right
//   Touch:  hold the left or right half to flip; swipe down and let go to
//           plunge (while a ball waits on the plunger); flick up on a half
//           to nudge the table that way.
//   Pad:    LB / LT left flipper, RB / RT right flipper, A or d-pad down
//           plunger, X / B nudge, Start pause.
const LEFT_KEYS = ['ShiftLeft', 'KeyZ', 'ArrowLeft'];
const RIGHT_KEYS = ['ShiftRight', 'KeyM', 'ArrowRight', 'Slash'];
const PLUNGE_KEYS = ['Space', 'ArrowDown'];
const SWIPE_PX = 16;
const SWIPE_FULL_PX = 170;
const TAP_FLIP_MS = 90;
export const NUDGE_SWIPE = { px: 38, ms: 260 };

// A quick upward flick on one half of the screen nudges the table towards
// that side (like X / C). Returns -1, 1 or 0. `t` is the touch record from
// pointerdown; each touch nudges at most once.
export function flickNudge(t, x, y, now) {
  if (t.nudged || t.kind === 'plunge') return 0;
  const dy = t.y0 - y;
  if (dy < NUDGE_SWIPE.px || Math.abs(x - t.x0) > dy || now - t.t0 > NUDGE_SWIPE.ms) return 0;
  t.nudged = true;
  return t.side === 'left' ? -1 : 1;
}

export class Input {
  constructor(surface, { canPlunge = () => false } = {}) {
    this.canPlunge = canPlunge;
    this.keys = new Set();
    this.pressed = new Set();
    this.enabled = false;
    this.mode = 'keys'; // keys | touch
    this.touches = new Map(); // pointerId -> { x0, y0, side, kind: 'flip'|'pending'|'plunge', pull, t0 }
    this.tapFlip = { left: 0, right: 0 };
    this.nudgeQueued = 0;
    this.pad = { buttons: {}, left: false, right: false, plunge: false };
    this.padEdges = new Set();
    this.touchPull = 0;
    this.touchPlunging = false;

    addEventListener('keydown', (e) => {
      const game = this.enabled;
      if (game && [...LEFT_KEYS, ...RIGHT_KEYS, ...PLUNGE_KEYS, 'ArrowUp'].includes(e.code)) e.preventDefault();
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && !isFormTarget(e.target)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (game && e.code === 'KeyX') this.nudgeQueued = -1;
        if (game && e.code === 'KeyC') this.nudgeQueued = 1;
      }
      this.keys.add(e.code);
      this.mode = 'keys';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touches.clear(); });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch'; }, { capture: true, passive: true });

    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      let side = e.clientX < innerWidth / 2 ? 'left' : 'right';
      if (e.pointerType === 'mouse' && e.button === 2) side = 'right';
      const kind = this.canPlunge() ? 'pending' : 'flip';
      this.touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, side, kind, pull: 0, t0: performance.now() });
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
    });
    surface.addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      if (e.pointerType !== 'mouse') {
        const n = flickNudge(t, e.clientX, e.clientY, performance.now());
        if (n) this.nudgeQueued = n;
      }
      if (t.kind === 'flip') return;
      const dy = e.clientY - t.y0;
      if (t.kind === 'pending' && dy > SWIPE_PX && Math.abs(e.clientX - t.x0) < dy * 1.5) t.kind = 'plunge';
      if (t.kind === 'plunge') t.pull = Math.max(0, Math.min(1, (dy - SWIPE_PX) / SWIPE_FULL_PX));
    });
    const end = (e) => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      // A quick tap while the ball waits on the plunger still flips (it moves
      // the lit skill-shot lane).
      if (t.kind === 'pending') this.tapFlip[t.side] = performance.now() + TAP_FLIP_MS;
      this.touches.delete(e.pointerId);
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
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
    this.nudgeQueued = 0;
    this.touches.clear();
  }

  padConnected() {
    return !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
  }

  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) { this.pad.left = this.pad.right = this.pad.plunge = false; return; }
    const b = (i) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value || 0) > 0.4;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), start: b(9),
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
    };
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.buttons[k]) this.padEdges.add(k);
    this.pad.buttons = now;
    this.pad.left = b(4) || b(6);
    this.pad.right = b(5) || b(7);
    this.pad.plunge = b(0) || b(13);
    if (this.pad.left || this.pad.right) this.mode = 'keys';
    if (this.enabled) {
      if (this.padEdges.has('x') || (this.padEdges.has('left') && !this.pad.left)) this.nudgeQueued = -1;
      if (this.padEdges.has('b') || (this.padEdges.has('right') && !this.pad.right)) this.nudgeQueued = 1;
    }
  }

  read() {
    const k = (codes) => codes.some((c) => this.keys.has(c));
    const now = performance.now();
    let left = k(LEFT_KEYS) || this.pad.left || now < this.tapFlip.left;
    let right = k(RIGHT_KEYS) || this.pad.right || now < this.tapFlip.right;
    let touchPlunge = false;
    let touchPull = 0;
    for (const t of this.touches.values()) {
      if (t.kind === 'flip') { if (t.side === 'left') left = true; else right = true; }
      if (t.kind === 'plunge') { touchPlunge = true; touchPull = Math.max(touchPull, t.pull); }
    }
    const nudge = this.nudgeQueued;
    this.nudgeQueued = 0;
    return {
      left, right, nudge,
      plunge: k(PLUNGE_KEYS) || this.pad.plunge || touchPlunge,
      // Touch sets the pull directly from the swipe length.
      pull: touchPlunge ? touchPull : null,
    };
  }
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT');
}
