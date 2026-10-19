// Keyboard, gamepad and touch merged into one set of kart controls:
//   { steer: -1..1, gas: 0..1, brake, drift, item (one press) }
//
//   Keys:  ← → / A D steer, ↑ / W go, ↓ / S brake, Space / Shift drift,
//          X / E / Enter item.
//   Pad:   stick or d-pad steer, RT / RB drift, A item, B / LT brake,
//          X go (when Auto-go is off), Start pause.
//   Touch: drag anywhere that isn't a button to steer (a floating pad that
//          appears under your thumb; drag down to brake), DRIFT and ITEM
//          buttons on the right. Easy drift starts a drift when you hold a
//          hard turn and fires the turbo when you straighten.

export const TOUCH_RANGE = 54; // px of drag for full steering
const DEADZONE_PX = 6;
const BRAKE_PX = 64;

// Steering from a horizontal drag, with a small dead zone and a gentle
// curve so small corrections stay small.
export function touchSteer(dx) {
  const a = Math.abs(dx);
  if (a < DEADZONE_PX) return 0;
  const u = Math.min(1, (a - DEADZONE_PX) / (TOUCH_RANGE - DEADZONE_PX));
  return Math.sign(dx) * (0.35 * u + 0.65 * u * u);
}

export function stickSteer(x, dead = 0.18) {
  const a = Math.abs(x);
  if (a < dead) return 0;
  const u = Math.min(1, (a - dead) / (1 - dead));
  return Math.sign(x) * (0.4 * u + 0.6 * u * u);
}

// Easy drift: a hard turn held for a moment at speed starts a drift; easing
// the steering back toward the middle releases it (and fires the turbo).
export class EasyDrift {
  constructor() { this.hold = 0; this.on = false; }
  reset() { this.hold = 0; this.on = false; }
  update(steer, speedOk, dt) {
    if (this.on) {
      if (Math.abs(steer) < 0.35 || !speedOk) this.on = false;
      return this.on;
    }
    if (Math.abs(steer) > 0.82 && speedOk) this.hold += dt;
    else this.hold = 0;
    if (this.hold > 0.28) { this.on = true; this.hold = 0; }
    return this.on;
  }
}

const isButton = (el) => !!el?.closest?.('button, a, .touch-btn, .hud-btn, .overlay');

export class Input {
  constructor({ canvas, knob, base, driftBtn, itemBtn }) {
    this.keys = new Set();
    this.pressed = new Set();
    this.padEdges = new Set();
    this.pad = { buttons: {}, axisX: 0, axisY: 0, connected: false };
    // keys | touch | pad. Phones and tablets start in touch mode.
    this.mode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys';
    this.enabled = false;
    this.itemQueued = false;
    this.touchSteer = null; // { id, x0, y0, x, y }
    this.touchDrift = false;
    this.easy = new EasyDrift();
    this.knob = knob;
    this.base = base;
    this.lastPointerMove = 0;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && (this.enabled || !isFormTarget(e.target))) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (this.enabled && ['KeyX', 'KeyE', 'Enter', 'NumpadEnter'].includes(e.code)) this.itemQueued = true;
      }
      this.keys.add(e.code);
      if (!e.code.startsWith('Key') || 'KeyWASDXE'.includes(e.code.slice(3))) this.mode = 'keys';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.release());
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch';
    }, { capture: true, passive: true });

    // Steering pad: any touch that starts on the canvas (not on a button).
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.enabled) return;
      if (this.touchSteer || isButton(e.target)) return;
      e.preventDefault();
      this.mode = 'touch';
      this.touchSteer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      document.body.classList.add('steered');
      try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
      this.showKnob();
    });
    canvas.addEventListener('pointermove', (e) => {
      const t = this.touchSteer;
      if (!t || e.pointerId !== t.id) return;
      t.x = e.clientX;
      t.y = e.clientY;
      // Let the pad follow a thumb that slides far past full lock.
      const dx = t.x - t.x0;
      if (Math.abs(dx) > TOUCH_RANGE * 1.6) t.x0 = t.x - Math.sign(dx) * TOUCH_RANGE * 1.6;
      this.showKnob();
    });
    const end = (e) => {
      if (this.touchSteer && e.pointerId === this.touchSteer.id) {
        this.touchSteer = null;
        this.showKnob();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // DRIFT holds, ITEM taps. pointerdown so a second finger always works.
    const hold = (btn, on, off) => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.mode = 'touch'; btn.classList.add('down'); try { btn.setPointerCapture(e.pointerId); } catch { /* optional */ } on(); });
      const up = (e) => { e.preventDefault?.(); btn.classList.remove('down'); off(); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold(driftBtn, () => { this.touchDrift = true; }, () => { this.touchDrift = false; });
    hold(itemBtn, () => { if (this.enabled) this.itemQueued = true; }, () => {});
  }

  showKnob() {
    const t = this.touchSteer;
    if (!this.knob) return;
    if (!t) {
      this.base.classList.remove('on');
      return;
    }
    this.base.classList.add('on');
    this.base.style.transform = `translate(${t.x0}px, ${t.y0}px)`;
    const dx = Math.max(-TOUCH_RANGE, Math.min(TOUCH_RANGE, t.x - t.x0));
    const dy = Math.max(0, Math.min(BRAKE_PX, t.y - t.y0));
    this.knob.style.transform = `translate(${dx}px, ${dy * 0.6}px)`;
  }

  release() {
    this.keys.clear();
    this.touchSteer = null;
    this.touchDrift = false;
    this.itemQueued = false;
    this.easy.reset();
    this.showKnob();
    for (const b of document.querySelectorAll('.touch-btn.down')) b.classList.remove('down');
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
    this.itemQueued = false;
    this.easy.reset();
  }

  // Poll the first gamepad once per frame; records button edges.
  pollPad() {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    this.pad.connected = !!pad;
    if (!pad) { this.pad.axisX = 0; this.pad.buttons = {}; return; }
    const b = (i) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.35;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const now = {
      a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), lt: b(6), rt: b(7), select: b(8), start: b(9),
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
    };
    for (const [k, v] of Object.entries(now)) if (v && !this.pad.buttons[k]) this.padEdges.add(k);
    this.pad.buttons = now;
    this.pad.axisX = b(14) ? -1 : b(15) ? 1 : stickSteer(ax);
    if (Object.values(now).some(Boolean) || Math.abs(ax) > 0.3) this.mode = 'pad';
    if (this.enabled && this.padEdges.has('a')) this.itemQueued = true;
  }

  // Controls for this frame.
  read({ autoGo = true, easyDrift = true, speed = 0, driftMin = 125, dt = 1 / 60 } = {}) {
    const k = (...codes) => codes.some((c) => this.keys.has(c));
    const pb = this.pad.buttons;
    let steer = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    steer += this.pad.axisX;
    let brake = k('ArrowDown', 'KeyS') || !!pb.b || !!pb.lt;
    let gasKey = k('ArrowUp', 'KeyW') || !!pb.x;
    let drift = k('Space', 'ShiftLeft', 'ShiftRight') || !!pb.rt || !!pb.rb;
    const t = this.touchSteer;
    let touching = false;
    if (t) {
      touching = true;
      steer += touchSteer(t.x - t.x0);
      if (t.y - t.y0 > BRAKE_PX) brake = true;
    }
    steer = Math.max(-1, Math.min(1, steer));
    if (this.touchDrift) drift = true;
    // Easy drift on touch: hold a hard turn to drift, straighten to fire.
    if (this.mode === 'touch' && easyDrift && !this.touchDrift) {
      if (this.easy.update(steer, speed > driftMin + 10, dt)) drift = true;
    } else this.easy.reset();
    const auto = autoGo || this.mode === 'touch' || touching;
    const gas = brake ? 0 : gasKey || auto ? 1 : 0;
    const item = this.itemQueued;
    this.itemQueued = false;
    return { steer, gas, brake, drift, item };
  }
}

function isFormTarget(t) {
  return t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
}
