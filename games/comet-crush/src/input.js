// Mouse, touch, keyboard and gamepad merged into World controls.
//   Mouse: the ship follows the pointer; click launches / fires.
//   Touch: drag anywhere to slide the ship (relative, so your finger never
//          hides it); tap to launch.
//   Keys:  arrows / A-D steer with quick acceleration; Space launches / fires.
//   Pad:   stick or d-pad steers; A launches / fires; Start pauses.
import { FIELD, PADDLE } from './config.js';

const STEER_KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
const TAP_MS = 260, TAP_PX = 14, TOUCH_GAIN = 1.25;

// Where a relative touch drag puts the ship. The target stops at the walls
// the ship can reach (half its width in from each side), and `rebase` says
// the drag should restart from here, so pulling back moves the ship at once
// instead of first crossing a dead zone past the wall.
export function touchDragTarget(paddle0, dxField, halfW = PADDLE.w / 2) {
  const want = paddle0 + dxField * TOUCH_GAIN;
  const lo = halfW, hi = FIELD.w - halfW;
  const target = Math.max(lo, Math.min(hi, want));
  return { target, rebase: target !== want };
}

export class Input {
  constructor(surface, toField) {
    this.toField = toField; // (clientX, clientY) -> field coords
    this.keys = new Set();
    this.pressed = new Set();
    this.mode = 'keys'; // keys | mouse | touch
    this.mouseX = null;
    this.mouseDown = false;
    this.touch = null; // { id, x0, y0, t0, paddle0, x, moved }
    this.touchTarget = null;
    this.launchQueued = false;
    this.pad = { buttons: [], axisX: 0 };
    this.padEdges = new Set();
    this.lastMouseMove = 0;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && !isFormTarget(e.target)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (e.code === 'Space' && this.enabled) this.launchQueued = true;
      }
      this.keys.add(e.code);
      if (STEER_KEYS.includes(e.code)) this.mode = 'keys';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Any touch anywhere (menus included) means this is a touch player.
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch'; }, { capture: true, passive: true });
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; this.touch = null; });

    surface.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mode = 'mouse';
        this.mouseX = this.toField(e.clientX, e.clientY).x;
      } else if (this.touch && e.pointerId === this.touch.id) {
        const dx = e.clientX - this.touch.x0, dy = e.clientY - this.touch.y0;
        if (Math.hypot(dx, dy) > TAP_PX) this.touch.moved = true;
        const f0 = this.toField(this.touch.x0, 0).x, f1 = this.toField(e.clientX, 0).x;
        const { target, rebase } = touchDragTarget(this.touch.paddle0, f1 - f0, (this.paddleW ?? PADDLE.w) / 2);
        this.touchTarget = target;
        if (rebase) { this.touch.x0 = e.clientX; this.touch.paddle0 = target; }
      }
    });
    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        this.mode = 'mouse';
        this.mouseX = this.toField(e.clientX, e.clientY).x;
        this.mouseDown = true;
        if (this.enabled) this.launchQueued = true;
        return;
      }
      e.preventDefault();
      this.mode = 'touch';
      this.touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), paddle0: this.paddleX ?? 300, moved: false };
      this.touchTarget = this.touch.paddle0;
      try { surface.setPointerCapture(e.pointerId); } catch { /* optional */ }
    });
    const end = (e) => {
      if (e.pointerType === 'mouse') { this.mouseDown = false; return; }
      if (!this.touch || e.pointerId !== this.touch.id) return;
      const quick = performance.now() - this.touch.t0 < TAP_MS;
      if (quick && !this.touch.moved && this.enabled) this.launchQueued = true;
      this.touch = null;
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
    this.launchQueued = false;
  }

  // Poll the gamepad once per frame; records button/direction edges.
  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!pad) { this.pad.axisX = 0; return; }
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), start: b(9), select: b(8),
      left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
    };
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.buttons[k]) this.padEdges.add(k);
    this.pad.buttons = now;
    let x = Math.abs(ax) > 0.15 ? ax : 0;
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    this.pad.axisX = x;
    if (x !== 0) this.mode = 'keys';
    if (this.padEdges.has('a') && this.enabled) this.launchQueued = true;
  }

  // Controls for one frame. `paddleX` lets touch drags start from the ship.
  read(paddleX, paddleW) {
    this.paddleX = paddleX;
    this.paddleW = paddleW;
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    let axis = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    axis = Math.max(-1, Math.min(1, axis + this.pad.axisX));
    let targetX = null;
    if (axis === 0) {
      if (this.mode === 'mouse' && this.mouseX !== null) targetX = this.mouseX;
      else if (this.mode === 'touch' && this.touch) targetX = this.touchTarget;
    }
    const fire = k('Space') || this.mouseDown || !!this.touch || !!this.pad.buttons.a;
    const launch = this.launchQueued;
    this.launchQueued = false;
    return { targetX, axis, launch, fire };
  }
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT');
}
